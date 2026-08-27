# en-GB: Provides one fail-closed entry point for local development preparation and validation.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('Doctor', 'Setup', 'Quick', 'Full')]
    [string]$Task = 'Doctor',

    [switch]$Offline,

    [switch]$PlanOnly,

    [Parameter(DontShow)]
    [switch]$CorePreflightOnly,

    [Parameter(DontShow)]
    [string]$InternalExecutionToken
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packagePath = Join-Path $repositoryRoot 'package.json'
$lockPath = Join-Path $repositoryRoot 'package-lock.json'
$workflowEnvironmentPath = Join-Path $PSScriptRoot 'workflow.env'
$syntheticDatabaseUrl = 'postgresql://shiftflow:workflow-local@127.0.0.1:1/shiftflow_workflow?schema=public'
$isolatedEnvironmentVariables = @(
    'ADMIN_PASSWORD',
    'API_BASE_URL',
    'API_INSTANCE_COUNT',
    'API_PORT',
    'API_RATE_LIMIT_MAX',
    'API_RATE_LIMIT_WINDOW_MS',
    'AUTH_LOCKOUT_MAX_ATTEMPTS',
    'AUTH_LOCKOUT_WINDOW_MS',
    'AUTH_RATE_LIMIT_MAX',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'DEMO_EMAIL',
    'DEMO_PASSWORD',
    'DOTENV_CONFIG_OVERRIDE',
    'DOTENV_CONFIG_PATH',
    'DOTENV_CONFIG_QUIET',
    'DOTENV_KEY',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_ISSUER',
    'JWT_REFRESH_EXPIRES_DAYS',
    'JWT_REFRESH_SECRET',
    'JWT_SECRET',
    'LOG_LEVEL',
    'NEXT_PUBLIC_DEMO_EMAIL',
    'NEXT_PUBLIC_DEMO_PASSWORD',
    'NEXT_PUBLIC_API_BASE_URL',
    'NODE_ENV',
    'PGPASSFILE',
    'PGPASSWORD',
    'POSTGRES_PASSWORD',
    'RATE_LIMIT_STORE',
    'REALISTIC_SEED_EMAIL',
    'REALISTIC_SEED_PASSWORD',
    'REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS',
    'TRUST_PROXY',
    'USER_PASSWORD'
)

function Get-DevelopmentPlan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$SelectedTask,

        [Parameter(Mandatory)]
        [bool]$UseOfflineMode
    )

    $mode = if ($UseOfflineMode) { 'Offline' } else { 'Online' }
    $classification = if ($SelectedTask -ceq 'Quick') {
        'NON_GATE'
    }
    elseif ($SelectedTask -ceq 'Full' -and $UseOfflineMode) {
        'INCOMPLETE_NON_GATE'
    }
    else {
        'WORKFLOW'
    }
    $steps = @(switch ($SelectedTask) {
        'Doctor' {
            @(
                'Validate repository root and required files',
                'Validate PowerShell, Git, Node.js and npm toolchains',
                'Validate tracked npm lock file and package metadata',
                'Report whether prepared dependencies and the generated Prisma client are ready'
            )
        }
        'Setup' {
            $npmRestore = if ($UseOfflineMode) {
                'npm ci --offline --ignore-scripts --no-audit --no-fund'
            }
            else {
                'npm ci --ignore-scripts --no-audit --no-fund'
            }
            @(
                'Validate repository root, toolchains and package lock',
                $npmRestore,
                'npm run prisma:generate'
            )
        }
        'Quick' {
            @(
                'Validate repository root, toolchains, package lock and prepared dependencies',
                'npm run quality',
                'npm run test:unit',
                'npm run build',
                'git diff --check for worktree and index'
            )
        }
        'Full' {
            $ciCommand = if ($UseOfflineMode) {
                'eng/ci.ps1 -Offline'
            }
            else {
                'eng/ci.ps1'
            }
            @($ciCommand)
        }
    })

    @(
        "PLAN|version=1|task=$SelectedTask|mode=$mode|classification=$classification"
        for ($index = 0; $index -lt $steps.Count; $index++) {
            "STEP|$($index + 1)|$($steps[$index])"
        }
    )
}

function Assert-LastExitCode {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Operation
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

function Invoke-VersionCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [Parameter(Mandatory)]
        [string]$Operation
    )

    $application = Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $application) {
        throw "$Operation is unavailable. Install it and ensure it is on PATH."
    }

    $output = @(& $application.Source @Arguments)
    Assert-LastExitCode -Operation $Operation
    return ($output -join [System.Environment]::NewLine).Trim()
}

function Assert-VersionSatisfiesRange {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$ActualVersion,

        [Parameter(Mandatory)]
        [string]$Range
    )

    $normalisedActual = $ActualVersion.Trim().TrimStart('v')
    try {
        $actual = [System.Version]$normalisedActual
    }
    catch {
        throw "$Name returned invalid version '$ActualVersion'."
    }

    $satisfied = $false
    foreach ($interval in @($Range -split '\s+\|\|\s+')) {
        $intervalMatch = [regex]::Match(
            $interval,
            '^>=(?<minimum>\d+\.\d+\.\d+) <(?<maximum>\d+\.\d+\.\d+)$')
        if (-not $intervalMatch.Success) {
            throw "$Name engine range '$Range' is unsupported. Join canonical '>=x.y.z <x.y.z' intervals with '||'."
        }

        $minimum = [System.Version]$intervalMatch.Groups['minimum'].Value
        $maximum = [System.Version]$intervalMatch.Groups['maximum'].Value
        if ($actual -ge $minimum -and $actual -lt $maximum) {
            $satisfied = $true
            break
        }
    }

    if (-not $satisfied) {
        throw "$Name '$normalisedActual' does not satisfy package.json engine range '$Range'."
    }
}

function Assert-RepositoryLayout {
    foreach ($requiredPath in @(
            $packagePath,
            $lockPath,
            (Join-Path $repositoryRoot '.nvmrc'),
            (Join-Path $repositoryRoot 'prisma/schema.prisma'),
            (Join-Path $PSScriptRoot 'build.ps1'),
            (Join-Path $PSScriptRoot 'ci.ps1'),
            (Join-Path $PSScriptRoot 'test-development-workflow.ps1'),
            $workflowEnvironmentPath)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "Required repository file '$requiredPath' is missing."
        }
    }

    $gitRoot = Invoke-VersionCommand `
        -Command 'git' `
        -Arguments @('-C', $repositoryRoot, 'rev-parse', '--show-toplevel') `
        -Operation 'Git repository-root discovery'
    $resolvedGitRoot = [System.IO.Path]::GetFullPath($gitRoot)
    $pathComparison = if ($IsWindows) {
        [System.StringComparison]::OrdinalIgnoreCase
    }
    else {
        [System.StringComparison]::Ordinal
    }
    if (-not $resolvedGitRoot.Equals($repositoryRoot, $pathComparison)) {
        throw "The script resolved '$repositoryRoot', but Git resolved '$resolvedGitRoot'. Run the checked-in script from this repository."
    }
}

function Assert-Toolchains {
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        throw "PowerShell 7 or later is required; found $($PSVersionTable.PSVersion)."
    }

    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    $nodeVersion = Invoke-VersionCommand `
        -Command 'node' `
        -Arguments @('--version') `
        -Operation 'Node.js version discovery'
    $npmVersion = Invoke-VersionCommand `
        -Command 'npm' `
        -Arguments @('--version') `
        -Operation 'npm version discovery'
    [void](Invoke-VersionCommand `
            -Command 'git' `
            -Arguments @('--version') `
            -Operation 'Git version discovery')

    Assert-VersionSatisfiesRange `
        -Name 'Node.js' `
        -ActualVersion $nodeVersion `
        -Range $package.engines.node
    Assert-VersionSatisfiesRange `
        -Name 'npm' `
        -ActualVersion $npmVersion `
        -Range $package.engines.npm

    $nvmVersion = (Get-Content -LiteralPath (Join-Path $repositoryRoot '.nvmrc') -Raw).Trim()
    if ($nvmVersion -cne '22') {
        throw ".nvmrc must select the supported Node.js 22 LTS baseline; found '$nvmVersion'."
    }
}

function Assert-StringMapMatches {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [System.Collections.IDictionary]$Expected,

        [Parameter(Mandatory)]
        [System.Collections.IDictionary]$Actual
    )

    $expectedKeys = @($Expected.Keys | Sort-Object)
    $actualKeys = @($Actual.Keys | Sort-Object)
    if (($expectedKeys -join "`n") -cne ($actualKeys -join "`n")) {
        throw "$Name keys differ between package.json and package-lock.json."
    }

    foreach ($key in $expectedKeys) {
        if ([string]$Expected[$key] -cne [string]$Actual[$key]) {
            throw "$Name entry '$key' differs between package.json and package-lock.json."
        }
    }
}

function Assert-PackageLock {
    $trackedLock = @(& git -C $repositoryRoot ls-files --error-unmatch -- 'package-lock.json' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $trackedLock.Count -ne 1) {
        throw 'The root package-lock.json must be tracked. npm restore must remain locked.'
    }

    try {
        $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -AsHashtable
        $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json -AsHashtable
    }
    catch {
        throw "Package metadata contains malformed JSON: $($_.Exception.Message)"
    }

    if ($lock.lockfileVersion -ne 3 -or -not $lock.packages.ContainsKey('')) {
        throw 'package-lock.json must use lockfileVersion 3 and contain root package metadata.'
    }

    $rootPackage = $lock.packages['']
    foreach ($scalarName in @('name', 'version', 'license')) {
        if ([string]$package[$scalarName] -cne [string]$rootPackage[$scalarName]) {
            throw "Root package field '$scalarName' differs between package.json and package-lock.json."
        }
    }

    foreach ($mapName in @('dependencies', 'devDependencies', 'engines')) {
        Assert-StringMapMatches `
            -Name $mapName `
            -Expected $package[$mapName] `
            -Actual $rootPackage[$mapName]
    }
}

function Assert-DependenciesReady {
    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($requiredPath in @(
            (Join-Path $repositoryRoot 'node_modules'),
            (Join-Path $repositoryRoot 'generated/prisma/client.js'))) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            $missing.Add($requiredPath)
        }
    }

    if ($missing.Count -gt 0) {
        throw (
            'Development dependencies are not ready. Run ./eng/development.ps1 Setup first. Missing: ' +
            ($missing -join ', '))
    }

    $null = @(& npm ls --all --json 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw 'Installed dependencies do not satisfy package.json, package-lock.json and npm overrides. Run ./eng/development.ps1 Setup first.'
    }
}

function Invoke-Doctor {
    $failures = [System.Collections.Generic.List[string]]::new()
    $checks = @(
        @{ Name = 'repository root'; Action = { Assert-RepositoryLayout } },
        @{ Name = 'toolchains'; Action = { Assert-Toolchains } },
        @{ Name = 'package lock'; Action = { Assert-PackageLock } }
    )
    if (-not $CorePreflightOnly) {
        $checks += @{
            Name = 'prepared dependencies'
            Action = { Assert-DependenciesReady }
        }
    }

    foreach ($check in $checks) {
        try {
            $action = $check.Action
            & $action
            Write-Output "PASS: $($check.Name)"
        }
        catch {
            $failures.Add("$($check.Name): $($_.Exception.Message)")
            Write-Output "FAIL: $($check.Name) - $($_.Exception.Message)"
        }
    }

    if ($failures.Count -gt 0) {
        throw "Doctor found $($failures.Count) problem(s). Resolve the FAIL diagnostics above and run Doctor again."
    }
}

function Invoke-Setup {
    Assert-RepositoryLayout
    Assert-Toolchains
    Assert-PackageLock

    if ($Offline) {
        npm ci --offline --ignore-scripts --no-audit --no-fund
        Assert-LastExitCode -Operation 'Offline locked npm restore'
    }
    else {
        npm ci --ignore-scripts --no-audit --no-fund
        Assert-LastExitCode -Operation 'Locked npm restore'
    }

    npm run prisma:generate
    Assert-LastExitCode -Operation 'Prisma client generation'
    Assert-PackageLock
    Assert-DependenciesReady
}

function Invoke-Quick {
    Write-Output 'NON_GATE: Quick is development feedback only and is not the canonical quality gate.'
    Assert-RepositoryLayout
    Assert-Toolchains
    Assert-PackageLock
    Assert-DependenciesReady

    npm run quality
    Assert-LastExitCode -Operation 'Quality checks'
    npm run test:unit
    Assert-LastExitCode -Operation 'Unit tests'
    npm run build
    Assert-LastExitCode -Operation 'Application build'

    git -C $repositoryRoot diff --check
    Assert-LastExitCode -Operation 'Working-tree diff hygiene'
    git -C $repositoryRoot diff --cached --check
    Assert-LastExitCode -Operation 'Staged diff hygiene'
}

function Invoke-Full {
    $ciEntrypoint = Join-Path $PSScriptRoot 'ci.ps1'
    $ciArguments = @{}
    if ($Offline) {
        $ciArguments['Offline'] = $true
    }

    & $ciEntrypoint @ciArguments
}

if ($Offline -and $Task -notin @('Setup', 'Full')) {
    throw '-Offline is supported only by Setup and Full.'
}
if ($CorePreflightOnly -and $Task -cne 'Doctor') {
    throw '-CorePreflightOnly is an internal Doctor option.'
}
if ($CorePreflightOnly -and $PlanOnly) {
    throw '-CorePreflightOnly cannot be combined with -PlanOnly.'
}

if ($PlanOnly) {
    Get-DevelopmentPlan -SelectedTask $Task -UseOfflineMode $Offline.IsPresent
    return
}

if ([string]::IsNullOrEmpty($InternalExecutionToken)) {
    $pwshPath = (Get-Process -Id $PID).Path
    $childToken = [guid]::NewGuid().ToString('N')
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pwshPath
    $startInfo.WorkingDirectory = $repositoryRoot
    $startInfo.UseShellExecute = $false
    $startInfo.ArgumentList.Add('-NoLogo')
    $startInfo.ArgumentList.Add('-NoProfile')
    $startInfo.ArgumentList.Add('-NonInteractive')
    $startInfo.ArgumentList.Add('-File')
    $startInfo.ArgumentList.Add($PSCommandPath)
    $startInfo.ArgumentList.Add('-Task')
    $startInfo.ArgumentList.Add($Task)
    $startInfo.ArgumentList.Add('-InternalExecutionToken')
    $startInfo.ArgumentList.Add($childToken)
    if ($Offline) {
        $startInfo.ArgumentList.Add('-Offline')
    }
    if ($CorePreflightOnly) {
        $startInfo.ArgumentList.Add('-CorePreflightOnly')
    }

    foreach ($variableName in $isolatedEnvironmentVariables) {
        [void]$startInfo.Environment.Remove($variableName)
    }
    $startInfo.Environment['DATABASE_URL'] = $syntheticDatabaseUrl
    $startInfo.Environment['DOTENV_CONFIG_PATH'] = $workflowEnvironmentPath
    $startInfo.Environment['DOTENV_CONFIG_QUIET'] = 'true'
    $startInfo.Environment['SHIFTFLOW_DEVELOPMENT_CHILD_TOKEN'] = $childToken
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw 'The isolated development workflow process did not start.'
        }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "The isolated development workflow failed with exit code $($process.ExitCode)."
        }
    }
    finally {
        $process.Dispose()
    }
    return
}

$expectedChildToken = [System.Environment]::GetEnvironmentVariable(
    'SHIFTFLOW_DEVELOPMENT_CHILD_TOKEN',
    [System.EnvironmentVariableTarget]::Process)
if ([string]::IsNullOrEmpty($expectedChildToken) -or
    -not $expectedChildToken.Equals(
        $InternalExecutionToken,
        [System.StringComparison]::Ordinal)) {
    throw 'Internal workflow execution requires the isolated child-process token.'
}

foreach ($variableName in $isolatedEnvironmentVariables) {
    Remove-Item -LiteralPath "Env:$variableName" -ErrorAction SilentlyContinue
}
[System.Environment]::SetEnvironmentVariable(
    'DATABASE_URL',
    $syntheticDatabaseUrl,
    [System.EnvironmentVariableTarget]::Process)
[System.Environment]::SetEnvironmentVariable(
    'DOTENV_CONFIG_PATH',
    $workflowEnvironmentPath,
    [System.EnvironmentVariableTarget]::Process)
[System.Environment]::SetEnvironmentVariable(
    'DOTENV_CONFIG_QUIET',
    'true',
    [System.EnvironmentVariableTarget]::Process)
Remove-Item -LiteralPath 'Env:SHIFTFLOW_DEVELOPMENT_CHILD_TOKEN' -ErrorAction SilentlyContinue

Push-Location $repositoryRoot
try {
    switch ($Task) {
        'Doctor' { Invoke-Doctor }
        'Setup' { Invoke-Setup }
        'Quick' { Invoke-Quick }
        'Full' { Invoke-Full }
    }
}
finally {
    Pop-Location
}
