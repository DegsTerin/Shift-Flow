# en-GB: Runs the canonical runtime-credential-free repository gate locally or in CI without database mutation or runtime services.
[CmdletBinding()]
param(
    [switch]$Offline,

    [switch]$SkipInstall,

    [ValidateSet('All', 'Node', 'DotNet')]
    [string]$Component = 'All',

    [string]$BaseRef
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$developmentEntrypoint = Join-Path $PSScriptRoot 'development.ps1'
$agentContractPath = Join-Path $PSScriptRoot 'test-agent-contract.ps1'
$dotnetEntrypoint = Join-Path $PSScriptRoot 'dotnet.ps1'
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
    'AUTH_DEMO_EMAIL',
    'AUTH_MODE',
    'AUTH_RATE_LIMIT_MAX',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'CORS_ORIGIN',
    'DATA_PROTECTION_KEYS_PATH',
    'ENABLE_INTERNAL_RUNTIME_PROBES',
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
    'NEXT_PUBLIC_ALLOW_INSECURE_LOOPBACK',
    'NEXT_PUBLIC_API_BASE_URL',
    'NEXT_PUBLIC_PORTFOLIO_ACCESS',
    'NEXT_PUBLIC_PORTFOLIO_EMAIL',
    'NODE_ENV',
    'PGPASSFILE',
    'PGPASSWORD',
    'POSTGRES_PASSWORD',
    'PORTFOLIO_ACCESS_EMAIL',
    'PORTFOLIO_ACCESS_ENABLED',
    'RATE_LIMIT_STORE',
    'REDIS_CONNECTION',
    'REDIS_INSTANCE_NAME',
    'REALISTIC_SEED_EMAIL',
    'REALISTIC_SEED_PASSWORD',
    'REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS',
    'SHIFTFLOW_POSTGRES_INTEGRATION',
    'TRUST_PROXY',
    'TRUSTED_PROXY_IPS',
    'USER_PASSWORD'
)
$runNode = $Component -in @('All', 'Node')
$runDotNet = $Component -in @('All', 'DotNet')

if (-not [string]::IsNullOrEmpty($BaseRef) -and
    $BaseRef -notmatch '^[0-9a-fA-F]{40}$') {
    throw '-BaseRef must be a full 40-character Git commit identifier.'
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

function Assert-DependenciesReady {
    foreach ($requiredPath in @(
            (Join-Path $repositoryRoot 'node_modules'),
            (Join-Path $repositoryRoot 'generated/prisma/client.js'))) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Prepared dependency artefact '$requiredPath' is missing. Run eng/development.ps1 Setup first."
        }
    }

    $null = @(& npm ls --all --json 2>$null)
    if ($LASTEXITCODE -ne 0) {
        throw 'Installed dependencies do not satisfy package.json, package-lock.json and npm overrides. Run eng/development.ps1 Setup first.'
    }
}

Push-Location $repositoryRoot
try {
    & $developmentEntrypoint Doctor -CorePreflightOnly -CoreComponent $Component
    & $agentContractPath
    & (Join-Path $PSScriptRoot 'test-development-workflow.ps1')

    if ($runNode -and -not $SkipInstall) {
        if ($Offline) {
            npm ci --offline --ignore-scripts --no-audit --no-fund
            Assert-LastExitCode -Operation 'Offline locked npm restore'
        }
        else {
            npm ci --ignore-scripts --no-audit --no-fund
            Assert-LastExitCode -Operation 'Locked npm restore'
        }
    }

    if ($runNode) {
        npm run prisma:generate
        Assert-LastExitCode -Operation 'Prisma client generation'
        Assert-DependenciesReady

        if ($Offline) {
            Write-Output 'NOT_RUN: npm dependency audit requires online registry metadata.'
        }
        else {
            npm run security:audit
            Assert-LastExitCode -Operation 'npm dependency audit'
        }

        npm run quality
        Assert-LastExitCode -Operation 'Quality checks'
        npm run test:unit
        Assert-LastExitCode -Operation 'Unit tests'
        npm run build
        Assert-LastExitCode -Operation 'Application build'
    }

    if ($runDotNet) {
        $dotnetArguments = @{}
        if ($Offline) {
            $dotnetArguments['Offline'] = $true
        }
        if ($SkipInstall) {
            $dotnetArguments['SkipRestore'] = $true
        }
        & $dotnetEntrypoint @dotnetArguments
    }

    git -C $repositoryRoot diff --check
    Assert-LastExitCode -Operation 'Working-tree diff hygiene'
    git -C $repositoryRoot diff --cached --check
    Assert-LastExitCode -Operation 'Staged diff hygiene'

    if (-not [string]::IsNullOrEmpty($BaseRef)) {
        git -C $repositoryRoot cat-file -e "$BaseRef^{commit}"
        Assert-LastExitCode -Operation 'Remote diff-base validation'
        git -C $repositoryRoot diff --check "$BaseRef...HEAD"
        Assert-LastExitCode -Operation 'Remote candidate diff hygiene'
    }

    if ($Offline) {
        throw 'INCOMPLETE_NON_GATE: one or more online dependency audits were NOT_RUN; offline Full cannot approve the canonical core gate.'
    }
}
finally {
    Pop-Location
}
