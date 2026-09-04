# en-GB: Runs the complete disposable ASP.NET Core strangler gate with isolated credentials and guaranteed cleanup.
[CmdletBinding()]
param(
    [ValidatePattern('^shiftflow-strangler-[a-z0-9][a-z0-9-]*$')]
    [string]$ProjectName = 'shiftflow-strangler-validation'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $repositoryRoot 'scripts/docker-desktop.ps1')
Assert-LocalDockerEnvironment

$composeArguments = @(
    '--file', (Join-Path $repositoryRoot 'docker-compose.yml'),
    '--env-file', (Join-Path $repositoryRoot 'eng/workflow.env'),
    '--project-name', $ProjectName,
    '--profile', 'migration'
)
$smokePath = Join-Path $PSScriptRoot 'smoke-strangler.ps1'
$beforeEvidence = [System.IO.Path]::GetTempFileName()
$afterEvidence = [System.IO.Path]::GetTempFileName()
$protectedPayload = [System.IO.Path]::GetTempFileName()
$firstFailure = $null
$cleanupExitCode = 0
$cleanupFailure = $null
$environmentRestoreFailure = $null
$successEvidence = $null
$generatedSecretValues = [System.Collections.Generic.List[string]]::new()
$runtimeVariableNames = @(
    'DATABASE_URL',
    'POSTGRES_PASSWORD',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_SECRET',
    'SHIFTFLOW_DISPOSABLE_RUNTIME',
    'SMOKE_ACTION',
    'SMOKE_CREDENTIAL_VERSION',
    'SMOKE_JWT_ID'
)
$readinessScenarios = @(
    'fully-migrated',
    'current-migration-absent',
    'current-ledger-unfinished',
    'current-ledger-rolled-back',
    'split-decoy-schema',
    'core-table-view',
    'rbac-index-wrong-owner',
    'rbac-index-wrong-definition',
    'auth-column-malformed',
    'auth-constraints-malformed',
    'auth-index-malformed'
)
$readinessHosts = @('legacy-api', 'api-dotnet')
$processEnvironment = [System.Environment]::GetEnvironmentVariables(
    [System.EnvironmentVariableTarget]::Process)
$callerEnvironment = @{}
foreach ($name in $runtimeVariableNames) {
    $callerEnvironment[$name] = [pscustomobject]@{
        Exists = $processEnvironment.Contains($name)
        Value  = $processEnvironment[$name]
    }
}

function Assert-NativeSuccess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Operation
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

function Wait-ServiceHealthy {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Service
    )

    $containerId = (docker compose @composeArguments ps --quiet $Service).Trim()
    Assert-NativeSuccess "Resolve $Service container"
    if ([string]::IsNullOrWhiteSpace($containerId)) {
        throw "Service '$Service' has no running container."
    }

    $lastHealthStatus = 'unknown'
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $containerStatus = (docker inspect --format '{{.State.Status}}' $containerId).Trim()
        Assert-NativeSuccess "Inspect $Service container state"
        if ($containerStatus -cne 'running') {
            throw "Service '$Service' left the running state with status '$containerStatus'."
        }

        $lastHealthStatus = (docker inspect --format '{{.State.Health.Status}}' $containerId).Trim()
        Assert-NativeSuccess "Inspect $Service health"
        if ($lastHealthStatus -ceq 'healthy') {
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "Service '$Service' did not become healthy within 60 seconds; its last health status was '$lastHealthStatus'."
}

function Get-EffectiveProcessOneUid {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Service
    )

    $processStatus = @(
        docker compose @composeArguments exec --no-TTY $Service cat /proc/1/status)
    Assert-NativeSuccess "Inspect $Service PID 1 status"
    $uidMatch = [regex]::Match(
        ($processStatus -join "`n"),
        '(?m)^Uid:\s+\d+\s+(?<effective>\d+)\s+\d+\s+\d+\s*$')
    if (-not $uidMatch.Success) {
        throw "Service '$Service' did not expose a parseable effective PID 1 UID."
    }

    return [long]$uidMatch.Groups['effective'].Value
}

function Assert-ReadinessRunId {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId
    )

    if ($RunId -cnotmatch '^[0-9a-f]{24}$') {
        throw 'The readiness run id must be exactly 24 lower-case hexadecimal characters.'
    }
}

function Get-ReadinessScenarioIndex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Scenario
    )

    $scenarioIndex = [array]::IndexOf([string[]]$readinessScenarios, $Scenario)
    if ($scenarioIndex -lt 0) {
        throw "Readiness scenario '$Scenario' is outside the frozen scenario set."
    }

    return $scenarioIndex
}

function Get-ReadinessDatabaseName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId,

        [Parameter(Mandatory)]
        [ValidateSet('Template', 'Scenario')]
        [string]$Kind,

        [string]$Scenario
    )

    Assert-ReadinessRunId -RunId $RunId
    if ($Kind -ceq 'Template') {
        $databaseName = "sf_readiness_${RunId}_template"
    } else {
        $scenarioIndex = Get-ReadinessScenarioIndex -Scenario $Scenario
        $databaseName = 'sf_readiness_{0}_case_{1:d2}' -f $RunId, $scenarioIndex
    }

    if ($databaseName -cnotmatch '^sf_readiness_[0-9a-f]{24}_(?:template|case_(?:0[0-9]|10))$') {
        throw 'A derived readiness database name failed strict validation.'
    }

    return $databaseName
}

function Get-ReadinessContainerName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId,

        [Parameter(Mandatory)]
        [string]$Scenario,

        [Parameter(Mandatory)]
        [ValidateSet('legacy-api', 'api-dotnet')]
        [string]$HostName
    )

    Assert-ReadinessRunId -RunId $RunId
    $scenarioIndex = Get-ReadinessScenarioIndex -Scenario $Scenario
    $hostToken = if ($HostName -ceq 'legacy-api') { 'node' } else { 'dotnet' }
    $containerName = 'sf-readiness-{0}-{1}-{2:d2}' -f $RunId, $hostToken, $scenarioIndex
    if ($containerName -cnotmatch '^sf-readiness-[0-9a-f]{24}-(?:node|dotnet)-(?:0[0-9]|10)$') {
        throw 'A derived readiness container name failed strict validation.'
    }

    return $containerName
}

function New-ReadinessDatabaseUrl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId,

        [Parameter(Mandatory)]
        [string]$DatabaseName,

        [switch]$SplitSearchPath
    )

    Assert-ReadinessRunId -RunId $RunId
    $allowedDatabaseNames = @(
        'shiftflow',
        (Get-ReadinessDatabaseName -RunId $RunId -Kind Template)
    )
    foreach ($scenario in $readinessScenarios) {
        $allowedDatabaseNames += Get-ReadinessDatabaseName `
            -RunId $RunId `
            -Kind Scenario `
            -Scenario $scenario
    }
    if ($DatabaseName -cnotin $allowedDatabaseNames) {
        throw "Database '$DatabaseName' is outside the derived readiness database set."
    }
    if ($env:POSTGRES_PASSWORD -cnotmatch '^Pg!aA1-[0-9A-F]{48}$') {
        throw 'The runtime PostgreSQL password is outside the generated credential contract.'
    }

    $encodedPassword = [System.Uri]::EscapeDataString($env:POSTGRES_PASSWORD)
    $query = if ($SplitSearchPath) {
        'schema=active%2Cpublic&options=-csearch_path%3Dactive%2Cpublic'
    } else {
        'schema=public'
    }
    return "postgresql://shiftflow:${encodedPassword}@postgres:5432/${DatabaseName}?${query}"
}

function Protect-ReadinessDiagnostics {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Text
    )

    $protectedText = $Text
    $redactedValues = @($generatedSecretValues) + @(
        $env:POSTGRES_PASSWORD,
        $env:E2E_PASSWORD,
        $env:JWT_ACCESS_SECRET,
        $env:JWT_SECRET,
        $env:DATABASE_URL)
    foreach ($secret in $redactedValues) {
        if (-not [string]::IsNullOrEmpty($secret)) {
            $protectedText = $protectedText.Replace($secret, '[REDACTED]')
            $protectedText = $protectedText.Replace(
                [System.Uri]::EscapeDataString($secret),
                '[REDACTED]')
        }
    }

    if ($protectedText.Length -gt 4000) {
        return $protectedText.Substring(0, 4000)
    }
    return $protectedText
}

function Write-ReadinessSecondaryFailure {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Context,

        [Parameter(Mandatory)]
        [object]$Failure
    )

    $safeFailure = Protect-ReadinessDiagnostics -Text ([string]$Failure)
    Write-Warning "Secondary readiness failure ($Context): $safeFailure"
}

function Assert-ExactReadinessReceipt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [psobject]$Receipt,

        [Parameter(Mandatory)]
        [ValidateSet('create-template', 'create-scenario', 'probe')]
        [string]$Action,

        [Parameter(Mandatory)]
        [string]$RunId,

        [string]$Scenario,

        [string]$HostName
    )

    $expectedReceipt = switch ($Action) {
        'create-template' {
            [ordered]@{
                status = 'created'
                action = 'create-template'
                database = Get-ReadinessDatabaseName -RunId $RunId -Kind Template
            }
        }
        'create-scenario' {
            [ordered]@{
                status = 'created'
                action = 'create-scenario'
                scenario = $Scenario
                database = Get-ReadinessDatabaseName `
                    -RunId $RunId `
                    -Kind Scenario `
                    -Scenario $Scenario
            }
        }
        'probe' {
            [ordered]@{
                status = 'verified'
                action = 'probe'
                scenario = $Scenario
                host = $HostName
                container = Get-ReadinessContainerName `
                    -RunId $RunId `
                    -Scenario $Scenario `
                    -HostName $HostName
            }
        }
    }
    $expectedProperties = @($expectedReceipt.Keys | Sort-Object)
    $actualProperties = @($Receipt.PSObject.Properties.Name | Sort-Object)
    if (($actualProperties -join "`n") -cne ($expectedProperties -join "`n")) {
        throw "Readiness fixture receipt for '$Action' has missing or extra properties."
    }
    foreach ($propertyName in $expectedReceipt.Keys) {
        if ([string]($Receipt.$propertyName) -cne [string]($expectedReceipt[$propertyName])) {
            throw "Readiness fixture receipt for '$Action' has an unexpected '$propertyName' value."
        }
    }
}

function ConvertFrom-ReadinessReceiptOutput {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object[]]$Output,

        [Parameter(Mandatory)]
        [ValidateSet('create-template', 'create-scenario', 'probe')]
        [string]$Action,

        [Parameter(Mandatory)]
        [string]$RunId,

        [string]$Scenario,

        [string]$HostName
    )

    $outputLines = @($Output | ForEach-Object { ([string]$_).Trim() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $outputText = $outputLines -join "`n"
    if ($outputLines.Count -gt 64 -or $outputText.Length -gt 12000) {
        throw "Readiness fixture output for '$Action' exceeded its bounded receipt envelope."
    }

    $receipts = @()
    foreach ($outputLine in $outputLines) {
        if ($outputLine.StartsWith('{', [System.StringComparison]::Ordinal) -or
            $outputLine.EndsWith('}', [System.StringComparison]::Ordinal)) {
            if (-not $outputLine.StartsWith('{', [System.StringComparison]::Ordinal) -or
                -not $outputLine.EndsWith('}', [System.StringComparison]::Ordinal)) {
                throw "Readiness fixture output for '$Action' contains a malformed JSON receipt."
            }
            try {
                $candidateReceipt = $outputLine | ConvertFrom-Json -NoEnumerate -ErrorAction Stop
            } catch {
                throw "Readiness fixture output for '$Action' contains a malformed JSON receipt."
            }
            $receipts += ,$candidateReceipt
        }
    }
    if ($receipts.Count -ne 1 -or $null -eq $receipts[0] -or
        $receipts[0] -isnot [psobject]) {
        throw "Readiness fixture output for '$Action' must contain exactly one JSON object receipt."
    }

    $receipt = $receipts[0]
    Assert-ExactReadinessReceipt `
        -Receipt $receipt `
        -Action $Action `
        -RunId $RunId `
        -Scenario $Scenario `
        -HostName $HostName
    return $receipt
}

function Invoke-ReadinessFixture {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('create-template', 'create-scenario', 'probe')]
        [string]$Action,

        [Parameter(Mandatory)]
        [string]$RunId,

        [string]$Scenario,

        [ValidateSet('legacy-api', 'api-dotnet')]
        [string]$HostName
    )

    Assert-ReadinessRunId -RunId $RunId
    $fixtureArguments = @(
        'run', '--rm', '--no-deps', '--no-TTY',
        '--env', "DATABASE_URL=$env:DATABASE_URL",
        '--env', "SHIFTFLOW_DISPOSABLE_RUNTIME=$env:SHIFTFLOW_DISPOSABLE_RUNTIME",
        'migrate', 'node', 'prisma/readiness-runtime.mjs',
        '--action', $Action,
        '--run-id', $RunId
    )
    if ($Action -cin @('create-scenario', 'probe')) {
        $null = Get-ReadinessScenarioIndex -Scenario $Scenario
        $fixtureArguments += @('--scenario', $Scenario)
    }
    if ($Action -ceq 'probe') {
        if ($HostName -cnotin $readinessHosts) {
            throw "Readiness host '$HostName' is outside the frozen host set."
        }
        $fixtureArguments += @('--host', $HostName)
    }

    $fixtureOutput = @(docker compose @composeArguments @fixtureArguments 2>&1)
    $fixtureExitCode = $LASTEXITCODE
    if ($fixtureExitCode -ne 0) {
        $diagnostics = Protect-ReadinessDiagnostics -Text ($fixtureOutput -join "`n")
        throw "Readiness fixture action '$Action' failed with exit code $fixtureExitCode. $diagnostics"
    }

    return ConvertFrom-ReadinessReceiptOutput `
        -Output $fixtureOutput `
        -Action $Action `
        -RunId $RunId `
        -Scenario $Scenario `
        -HostName $HostName
}

function Start-VerifiedReadinessHostContainer {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ContainerName,

        [Parameter(Mandatory)]
        [ValidateSet('legacy-api', 'api-dotnet')]
        [string]$HostName,

        [Parameter(Mandatory)]
        [string]$DatabaseUrl
    )

    if ($ContainerName -cnotmatch '^sf-readiness-[0-9a-f]{24}-(?:node|dotnet)-(?:0[0-9]|10)$') {
        throw 'The readiness host container name failed strict validation before start.'
    }
    $startErrorPath = [System.IO.Path]::GetTempFileName()
    try {
        $startOutput = @(docker compose @composeArguments run `
                --detach `
                --no-deps `
                --name $ContainerName `
                --env "DATABASE_URL=$DatabaseUrl" `
                $HostName 2> $startErrorPath)
        $startExitCode = $LASTEXITCODE
        $startError = Get-Content -LiteralPath $startErrorPath -Raw -ErrorAction SilentlyContinue
        if ($startExitCode -ne 0) {
            $startDiagnostics = Protect-ReadinessDiagnostics `
                -Text ((@($startOutput) + @($startError)) -join "`n")
            throw "Start $HostName readiness container failed with exit code $startExitCode. $startDiagnostics"
        }

        $containerIdLines = @($startOutput | ForEach-Object { ([string]$_).Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($containerIdLines.Count -ne 1 -or
            $containerIdLines[0] -cnotmatch '^[0-9a-f]{64}$') {
            throw 'Successful readiness host start did not return exactly one full Docker container ID.'
        }
        $candidateContainerId = $containerIdLines[0]

        $ownershipFormat = '{{.Name}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}'
        $ownershipOutput = @(docker inspect `
                --type container `
                --format $ownershipFormat `
                $candidateContainerId 2>&1)
        $ownershipExitCode = $LASTEXITCODE
        if ($ownershipExitCode -ne 0) {
            $ownershipDiagnostics = Protect-ReadinessDiagnostics `
                -Text ($ownershipOutput -join "`n")
            throw "Readiness container ownership inspection failed. $ownershipDiagnostics"
        }
        $ownershipLines = @($ownershipOutput | ForEach-Object { ([string]$_).Trim() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($ownershipLines.Count -ne 1) {
            throw 'Readiness container ownership inspection did not return one exact record.'
        }
        $ownership = @($ownershipLines[0].Split('|'))
        if ($ownership.Count -ne 4 -or
            $ownership[0] -cne "/$ContainerName" -or
            $ownership[1] -cne $ProjectName -or
            $ownership[2] -cne $HostName -or
            $ownership[3] -cne 'True') {
            throw 'Readiness container name or Compose ownership labels did not match the exact derived contract.'
        }

        return $candidateContainerId
    } finally {
        Remove-Item -LiteralPath $startErrorPath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-ReadinessHostProbe {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId,

        [Parameter(Mandatory)]
        [string]$Scenario,

        [Parameter(Mandatory)]
        [ValidateSet('legacy-api', 'api-dotnet')]
        [string]$HostName
    )

    $containerName = Get-ReadinessContainerName `
        -RunId $RunId `
        -Scenario $Scenario `
        -HostName $HostName
    $databaseName = Get-ReadinessDatabaseName `
        -RunId $RunId `
        -Kind Scenario `
        -Scenario $Scenario
    $databaseUrlArguments = @{
        RunId = $RunId
        DatabaseName = $databaseName
    }
    if ($Scenario -ceq 'split-decoy-schema') {
        $databaseUrlArguments['SplitSearchPath'] = $true
    }
    $scenarioDatabaseUrl = New-ReadinessDatabaseUrl @databaseUrlArguments
    $probeFailure = $null
    $removalFailure = $null
    $probeReceipt = $null
    $verifiedContainerId = $null

    try {
        $verifiedContainerId = Start-VerifiedReadinessHostContainer `
            -ContainerName $containerName `
            -HostName $HostName `
            -DatabaseUrl $scenarioDatabaseUrl
        $probeReceipt = Invoke-ReadinessFixture `
            -Action probe `
            -RunId $RunId `
            -Scenario $Scenario `
            -HostName $HostName
    } catch {
        $probeFailure = $_
        if ($null -ne $verifiedContainerId) {
            try {
                $containerDiagnostics = @(docker logs --tail 200 $verifiedContainerId 2>&1)
                if ($LASTEXITCODE -eq 0 -and $containerDiagnostics.Count -gt 0) {
                    $safeDiagnostics = Protect-ReadinessDiagnostics `
                        -Text ($containerDiagnostics -join "`n")
                    Write-Warning "Readiness scenario diagnostics for ${containerName}: $safeDiagnostics"
                }
            } catch {
                Write-Warning "Readiness scenario diagnostics were unavailable for $containerName."
            }
        }
    } finally {
        if ($null -ne $verifiedContainerId) {
            try {
                $removalOutput = @(docker rm --force $verifiedContainerId 2>&1)
                $removalExitCode = $LASTEXITCODE
                if ($removalExitCode -ne 0) {
                    $safeRemovalOutput = Protect-ReadinessDiagnostics `
                        -Text ($removalOutput -join "`n")
                    throw "Exact readiness container cleanup failed for verified ID $verifiedContainerId. $safeRemovalOutput"
                }
            } catch {
                $removalFailure = $_
            }
        }
    }

    if ($null -ne $probeFailure) {
        if ($null -ne $removalFailure) {
            Write-ReadinessSecondaryFailure `
                -Context "verified host container removal for $Scenario/$HostName" `
                -Failure $removalFailure
        }
        throw $probeFailure
    }
    if ($null -ne $removalFailure) {
        throw $removalFailure
    }
    return $probeReceipt
}

function Invoke-ReadinessRuntimeMatrix {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RunId
    )

    Assert-ReadinessRunId -RunId $RunId
    if ($env:SHIFTFLOW_DISPOSABLE_RUNTIME -cne 'CONFIRMED_DISPOSABLE_STRANGLER') {
        throw 'Readiness runtime matrix authority is missing.'
    }
    $expectedBaseDatabaseUrl = New-ReadinessDatabaseUrl `
        -RunId $RunId `
        -DatabaseName 'shiftflow'
    if ($env:DATABASE_URL -cne $expectedBaseDatabaseUrl) {
        throw 'The readiness runtime must replace caller DATABASE_URL before matrix execution.'
    }

    $validatedScenarioReceipts = 0
    $validatedHostReceipts = 0
    $templateReceipt = Invoke-ReadinessFixture -Action create-template -RunId $RunId
    if ($null -eq $templateReceipt) {
        throw 'The readiness template receipt was not validated.'
    }
    $templateDatabaseName = Get-ReadinessDatabaseName -RunId $RunId -Kind Template
    $templateDatabaseUrl = New-ReadinessDatabaseUrl `
        -RunId $RunId `
        -DatabaseName $templateDatabaseName
    docker compose @composeArguments run `
        --rm `
        --no-deps `
        --env "DATABASE_URL=$templateDatabaseUrl" `
        --env "SHIFTFLOW_DISPOSABLE_RUNTIME=$env:SHIFTFLOW_DISPOSABLE_RUNTIME" `
        migrate | Out-Null
    Assert-NativeSuccess 'Migrate the dedicated readiness template database'

    foreach ($scenario in $readinessScenarios) {
        $scenarioReceipt = Invoke-ReadinessFixture `
            -Action create-scenario `
            -RunId $RunId `
            -Scenario $scenario
        if ($null -eq $scenarioReceipt) {
            throw "The readiness scenario receipt was not validated for '$scenario'."
        }
        $validatedScenarioReceipts += 1
        foreach ($hostName in $readinessHosts) {
            $probeReceipt = Invoke-ReadinessHostProbe `
                -RunId $RunId `
                -Scenario $scenario `
                -HostName $hostName
            if ($null -eq $probeReceipt) {
                throw "The readiness probe receipt was not validated for '$scenario/$hostName'."
            }
            $validatedHostReceipts += 1
        }
    }

    if ($validatedScenarioReceipts -ne 11 -or $validatedHostReceipts -ne 22) {
        throw 'The readiness matrix did not validate the exact expected receipt counts.'
    }
    return [pscustomobject]@{
        TemplateReceipt = $templateReceipt
        ScenarioReceipts = $validatedScenarioReceipts
        HostReceipts = $validatedHostReceipts
    }
}

try {
    $postgresNonce = [System.Convert]::ToHexString(
        [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $e2eNonce = [System.Convert]::ToHexString(
        [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    $env:POSTGRES_PASSWORD = "Pg!aA1-$postgresNonce"
    $env:E2E_EMAIL = 'integration.admin@shiftflow.local'
    $env:E2E_PASSWORD = "Ci!aA1-$e2eNonce"
    $env:JWT_ACCESS_SECRET = [System.Convert]::ToHexString(
        [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $env:JWT_SECRET = [System.Convert]::ToHexString(
        [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    foreach ($generatedSecret in @(
            $env:POSTGRES_PASSWORD,
            $env:E2E_PASSWORD,
            $env:JWT_ACCESS_SECRET,
            $env:JWT_SECRET)) {
        [void]$generatedSecretValues.Add($generatedSecret)
    }
    $readinessRunId = [System.Convert]::ToHexString(
        [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)).ToLowerInvariant()
    Assert-ReadinessRunId -RunId $readinessRunId
    $env:SHIFTFLOW_DISPOSABLE_RUNTIME = 'CONFIRMED_DISPOSABLE_STRANGLER'
    $env:DATABASE_URL = New-ReadinessDatabaseUrl `
        -RunId $readinessRunId `
        -DatabaseName 'shiftflow'
    [void]$generatedSecretValues.Add($env:DATABASE_URL)

    if ($env:GITHUB_ACTIONS -ceq 'true') {
        foreach ($value in @(
                $env:POSTGRES_PASSWORD,
                $env:E2E_PASSWORD,
                $env:JWT_ACCESS_SECRET,
                $env:JWT_SECRET)) {
            Write-Output "::add-mask::$value"
        }
    }

    docker compose @composeArguments down --volumes --remove-orphans | Out-Null
    Assert-NativeSuccess 'Pre-existing disposable stack cleanup'
    docker compose @composeArguments config --quiet
    Assert-NativeSuccess 'Migration profile validation'
    docker compose @composeArguments up --detach --build --wait
    Assert-NativeSuccess 'Disposable strangler stack start'

    $readinessMatrixEvidence = Invoke-ReadinessRuntimeMatrix -RunId $readinessRunId

    docker compose @composeArguments run --rm --env E2E_EMAIL --env E2E_PASSWORD migrate node prisma/integration-seed.mjs | Out-Null
    Assert-NativeSuccess 'Shared integration seed'
    docker compose @composeArguments run --rm --env E2E_EMAIL migrate node prisma/strangler-integration-seed.mjs | Out-Null
    Assert-NativeSuccess 'Strangler fixture seed'

    foreach ($service in @('postgres', 'redis', 'legacy-api', 'api-dotnet', 'web', 'nginx')) {
        $effectiveUid = Get-EffectiveProcessOneUid -Service $service
        if ($effectiveUid -eq 0) {
            throw "Service '$service' PID 1 is running as root."
        }
    }
    $migrationUid = (docker compose @composeArguments run --rm migrate id -u).Trim()
    Assert-NativeSuccess 'Inspect migration runtime identity'
    if ($migrationUid -eq '0') {
        throw 'The one-shot migration target is running as root.'
    }

    $null = & $smokePath `
        -ComposeProjectName $ProjectName `
        -EvidencePath $beforeEvidence `
        -AllowSecurityMutation

    $keyHashesBefore = @(
        docker compose @composeArguments exec --no-TTY api-dotnet sh -c 'sha256sum /var/lib/shiftflow/keys/key-*.xml' |
            Sort-Object)
    Assert-NativeSuccess 'Inspect initial data-protection key hashes'
    if ($keyHashesBefore.Count -lt 1) {
        throw 'No persisted data-protection key was created.'
    }
    docker compose @composeArguments exec --no-TTY api-dotnet wget -qO /tmp/shiftflow-data-protection-probe http://127.0.0.1:8080/internal/runtime/data-protection-probe
    Assert-NativeSuccess 'Create pre-recreation protected payload'
    docker compose @composeArguments cp api-dotnet:/tmp/shiftflow-data-protection-probe $protectedPayload
    Assert-NativeSuccess 'Retain protected payload outside the ASP.NET Core container'

    docker compose @composeArguments rm --stop --force api-dotnet | Out-Null
    Assert-NativeSuccess 'Remove ASP.NET Core container while retaining its volume'
    docker compose @composeArguments up --detach --no-deps api-dotnet | Out-Null
    Assert-NativeSuccess 'Recreate ASP.NET Core container from the validated image'
    Wait-ServiceHealthy 'api-dotnet'
    docker compose @composeArguments restart nginx | Out-Null
    Assert-NativeSuccess 'Refresh the Nginx upstream after ASP.NET Core recreation'
    Wait-ServiceHealthy 'nginx'

    $keyHashesAfter = @(
        docker compose @composeArguments exec --no-TTY api-dotnet sh -c 'sha256sum /var/lib/shiftflow/keys/key-*.xml' |
            Sort-Object)
    Assert-NativeSuccess 'Inspect recreated data-protection key hashes'
    if ($keyHashesAfter.Count -lt 1 -or
        @(Compare-Object $keyHashesBefore $keyHashesAfter).Count -ne 0) {
        throw 'The data-protection key ring content changed across ASP.NET Core container recreation.'
    }
    docker compose @composeArguments cp $protectedPayload api-dotnet:/tmp/shiftflow-data-protection-probe
    Assert-NativeSuccess 'Return the pre-recreation protected payload to the recreated container'
    $unprotectOutput = @(
        docker compose @composeArguments exec --no-TTY api-dotnet wget -qO- --post-file=/tmp/shiftflow-data-protection-probe http://127.0.0.1:8080/internal/runtime/data-protection-probe)
    Assert-NativeSuccess 'Unprotect the pre-recreation payload after container recreation'
    $unprotectEvidence = ($unprotectOutput -join "`n") | ConvertFrom-Json
    if ($unprotectEvidence.status -cne 'available') {
        throw 'The recreated host did not return exact data-protection availability evidence.'
    }

    $null = & $smokePath `
        -ComposeProjectName $ProjectName `
        -PreviousEvidencePath $beforeEvidence `
        -EvidencePath $afterEvidence `
        -AllowSecurityMutation

    $redisKeys = @(
        docker compose @composeArguments exec --no-TTY redis redis-cli --scan --pattern 'shiftflow:local:rate-limit:*')
    Assert-NativeSuccess 'Inspect Redis rate-limit keys'
    if ($redisKeys.Count -lt 1) {
        throw 'The namespaced Redis rate-limit key is missing.'
    }
    $redisTtl = [long](
        docker compose @composeArguments exec --no-TTY redis redis-cli pttl $redisKeys[0])
    Assert-NativeSuccess 'Inspect Redis rate-limit TTL'
    if ($redisTtl -le 0) {
        throw 'The Redis rate-limit key has no bounded positive TTL.'
    }

    docker compose @composeArguments stop redis | Out-Null
    Assert-NativeSuccess 'Stop Redis for fail-closed validation'
    $null = & $smokePath `
        -ComposeProjectName $ProjectName `
        -ExpectRedisUnavailable
    docker compose @composeArguments start redis | Out-Null
    Assert-NativeSuccess 'Restart Redis after fail-closed validation'
    Wait-ServiceHealthy 'redis'
    Wait-ServiceHealthy 'api-dotnet'
    Wait-ServiceHealthy 'nginx'

    $readinessOutput = @(
        docker compose @composeArguments exec --no-TTY api-dotnet wget -qO- http://127.0.0.1:8080/ready)
    Assert-NativeSuccess 'Inspect ASP.NET Core readiness after Redis restart'
    $readinessEvidence = ($readinessOutput -join "`n") | ConvertFrom-Json
    if ($readinessEvidence.status -cne 'ready' -or
        $readinessEvidence.checks.postgresql -cne 'available' -or
        $readinessEvidence.checks.redis -cne 'available' -or
        $readinessEvidence.checks.dataProtection -cne 'available') {
        throw 'The ASP.NET Core dependency readiness contract did not recover after Redis restarted.'
    }
    $null = & $smokePath `
        -ComposeProjectName $ProjectName `
        -ExpectRedisRecovered

    $successEvidence = [ordered]@{
        status = 'PASS'
        nonRootRuntimes = 7
        protectedPayloadSurvivedRecreation = $true
        redisCounterSurvivedRecreation = $true
        redisFailureClosed = $true
        redisRecoveredAfterRestart = $true
        readinessScenarios = $readinessMatrixEvidence.ScenarioReceipts
        readinessHostChecks = $readinessMatrixEvidence.HostReceipts
    }
} catch {
    $firstFailure = $_
    try {
        $runtimeDiagnostics = @()
        $runtimeDiagnostics += @(docker compose @composeArguments ps 2>&1)
        $runtimeDiagnostics += @(docker compose @composeArguments logs --no-color --tail 200 2>&1)
        if ($runtimeDiagnostics.Count -gt 0) {
            $safeRuntimeDiagnostics = Protect-ReadinessDiagnostics `
                -Text ($runtimeDiagnostics -join "`n")
            Write-Warning "Disposable runtime diagnostics: $safeRuntimeDiagnostics"
        }
    } catch {
        Write-Warning 'Disposable runtime diagnostics could not be completed.'
    }
} finally {
    try {
        docker compose @composeArguments down --volumes --remove-orphans | Out-Null
        $cleanupExitCode = $LASTEXITCODE
    } catch {
        $cleanupFailure = $_
    } finally {
        Remove-Item -LiteralPath $beforeEvidence -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $afterEvidence -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $protectedPayload -Force -ErrorAction SilentlyContinue
        foreach ($name in $runtimeVariableNames) {
            $original = $callerEnvironment[$name]
            try {
                if ($original.Exists) {
                    [System.Environment]::SetEnvironmentVariable(
                        $name,
                        $original.Value,
                        [System.EnvironmentVariableTarget]::Process)
                } else {
                    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
                }
            } catch {
                if ($null -eq $environmentRestoreFailure) {
                    $environmentRestoreFailure = $_
                }
            }
        }

        try {
            $restoredEnvironment = [System.Environment]::GetEnvironmentVariables(
                [System.EnvironmentVariableTarget]::Process)
            foreach ($name in $runtimeVariableNames) {
                $original = $callerEnvironment[$name]
                $restoredExists = $restoredEnvironment.Contains($name)
                if ($restoredExists -ne [bool]$original.Exists -or
                    ($restoredExists -and
                     [string]$restoredEnvironment[$name] -cne [string]$original.Value)) {
                    throw "Runtime variable '$name' was not restored to its exact caller state."
                }
            }
        } catch {
            if ($null -eq $environmentRestoreFailure) {
                $environmentRestoreFailure = $_
            }
        }
    }
}

if ($null -ne $firstFailure) {
    if ($null -ne $cleanupFailure) {
        Write-ReadinessSecondaryFailure `
            -Context 'outer project cleanup' `
            -Failure $cleanupFailure
    } elseif ($cleanupExitCode -ne 0) {
        Write-ReadinessSecondaryFailure `
            -Context 'outer project cleanup' `
            -Failure "exit code $cleanupExitCode"
    }
    if ($null -ne $environmentRestoreFailure) {
        Write-ReadinessSecondaryFailure `
            -Context 'caller environment restoration' `
            -Failure $environmentRestoreFailure
    }
    throw $firstFailure
}
if ($null -ne $cleanupFailure) {
    if ($null -ne $environmentRestoreFailure) {
        Write-ReadinessSecondaryFailure `
            -Context 'caller environment restoration' `
            -Failure $environmentRestoreFailure
    }
    throw $cleanupFailure
}
if ($cleanupExitCode -ne 0) {
    if ($null -ne $environmentRestoreFailure) {
        Write-ReadinessSecondaryFailure `
            -Context 'caller environment restoration' `
            -Failure $environmentRestoreFailure
    }
    throw "Disposable strangler cleanup failed with exit code $cleanupExitCode."
}
if ($null -ne $environmentRestoreFailure) {
    throw $environmentRestoreFailure
}

Write-Output ($successEvidence | ConvertTo-Json -Compress)
