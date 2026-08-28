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
$runtimeVariableNames = @(
    'POSTGRES_PASSWORD',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_SECRET',
    'SMOKE_ACTION',
    'SMOKE_CREDENTIAL_VERSION',
    'SMOKE_JWT_ID'
)
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
    }
} catch {
    $firstFailure = $_
    try {
        docker compose @composeArguments ps
        docker compose @composeArguments logs --no-color --tail 200
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
    throw $firstFailure
}
if ($null -ne $cleanupFailure) {
    throw $cleanupFailure
}
if ($cleanupExitCode -ne 0) {
    throw "Disposable strangler cleanup failed with exit code $cleanupExitCode."
}
if ($null -ne $environmentRestoreFailure) {
    throw $environmentRestoreFailure
}

Write-Output ($successEvidence | ConvertTo-Json -Compress)
