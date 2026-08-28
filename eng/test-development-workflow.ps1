# en-GB: Exercises the development workflow contract without installing, building, testing or using the network.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$developmentPath = Join-Path $PSScriptRoot 'development.ps1'
$buildPath = Join-Path $PSScriptRoot 'build.ps1'
$ciPath = Join-Path $PSScriptRoot 'ci.ps1'
$environmentExamplePath = Join-Path $repositoryRoot '.env.example'
$nvmPath = Join-Path $repositoryRoot '.nvmrc'
$packagePath = Join-Path $repositoryRoot 'package.json'
$workflowPath = Join-Path $repositoryRoot '.github/workflows/release-gates.yml'
$workflowEnvironmentPath = Join-Path $PSScriptRoot 'workflow.env'
$postgresRegressionPath = Join-Path $repositoryRoot 'prisma/users-tenant-isolation.postgres.test.mjs'

function Assert-Plan {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Task,

        [switch]$Offline,

        [Parameter(Mandatory)]
        [string[]]$Expected
    )

    $arguments = @{
        Task = $Task
        PlanOnly = $true
    }
    if ($Offline) {
        $arguments['Offline'] = $true
    }

    $first = @(& $developmentPath @arguments)
    $second = @(& $developmentPath @arguments)
    $expectedText = $Expected -join "`n"
    if (($first -join "`n") -cne $expectedText -or
        ($second -join "`n") -cne $expectedText) {
        throw "The $Task PlanOnly contract is not exact and deterministic."
    }
}

function Get-DeclaredIsolatedVariables {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Script
    )

    $block = [regex]::Match(
        $Script,
        '(?s)\$isolatedEnvironmentVariables\s*=\s*@\((?<body>.*?)\n\)').Groups['body'].Value
    if ([string]::IsNullOrWhiteSpace($block)) {
        throw 'A workflow script does not declare its project-environment isolation boundary.'
    }

    return @([regex]::Matches($block, "'(?<name>[A-Z0-9_]+)'") |
            ForEach-Object { $_.Groups['name'].Value } |
            Sort-Object -Unique)
}

$developmentScript = Get-Content -LiteralPath $developmentPath -Raw
$buildScript = Get-Content -LiteralPath $buildPath -Raw
$ciScript = Get-Content -LiteralPath $ciPath -Raw
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$workflow = Get-Content -LiteralPath $workflowPath -Raw
$postgresRegression = Get-Content -LiteralPath $postgresRegressionPath -Raw
$documentedProjectVariables = @(
    Get-Content -LiteralPath $environmentExamplePath |
        ForEach-Object {
            if ($_ -match '^\s*(?<name>[A-Z][A-Z0-9_]*)\s*=') {
                $Matches['name']
            }
        } |
        Sort-Object -Unique)
$workflowEnvironment = @(
    Get-Content -LiteralPath $workflowEnvironmentPath |
        Where-Object { $_ -and -not $_.StartsWith('#', [System.StringComparison]::Ordinal) })

$requiredIsolatedVariables = @(
    'API_INSTANCE_COUNT',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_SECRET',
    'NEXT_PUBLIC_API_BASE_URL',
    'NODE_ENV',
    'PGPASSWORD',
    'POSTGRES_PASSWORD',
    'RATE_LIMIT_STORE',
    'REALISTIC_SEED_PASSWORD'
    'REQUIRE_ORIGIN_ON_UNSAFE_REQUESTS'
    'SHIFTFLOW_POSTGRES_INTEGRATION'
)
$developmentIsolatedVariables = @(Get-DeclaredIsolatedVariables -Script $developmentScript)
$ciIsolatedVariables = @(Get-DeclaredIsolatedVariables -Script $ciScript)
if (($developmentIsolatedVariables -join "`n") -cne ($ciIsolatedVariables -join "`n")) {
    throw 'The development entry point and canonical CI must isolate the same project configuration and runtime credential set.'
}
foreach ($variableName in @($requiredIsolatedVariables + $documentedProjectVariables)) {
    if ($developmentScript -notmatch "(?m)^\s*'$([regex]::Escape($variableName))',?\s*$") {
        throw "The isolated workflow does not declare required project variable '$variableName'."
    }
    if ($developmentScript -match "(?i)GetEnvironmentVariable\s*\([^)]*$([regex]::Escape($variableName))" -or
        $developmentScript -match "(?i)\`$env:$([regex]::Escape($variableName))") {
        throw "The development entry point must not read caller project variable '$variableName'."
    }
}

$childRemoval = $developmentScript.IndexOf(
    '[void]$startInfo.Environment.Remove($variableName)',
    [System.StringComparison]::Ordinal)
$syntheticChildDatabase = $developmentScript.IndexOf(
    '$startInfo.Environment[''DATABASE_URL''] = $syntheticDatabaseUrl',
    [System.StringComparison]::Ordinal)
$controlledDotenvPath = $developmentScript.IndexOf(
    '$startInfo.Environment[''DOTENV_CONFIG_PATH''] = $workflowEnvironmentPath',
    [System.StringComparison]::Ordinal)
$childStart = $developmentScript.IndexOf(
    '$process.Start()',
    [System.StringComparison]::Ordinal)
$internalScrub = $developmentScript.IndexOf(
    'Remove-Item -LiteralPath "Env:$variableName" -ErrorAction SilentlyContinue',
    $developmentScript.IndexOf('$expectedChildToken', [System.StringComparison]::Ordinal),
    [System.StringComparison]::Ordinal)
$taskDispatch = $developmentScript.IndexOf(
    'switch ($Task)',
    [System.StringComparison]::Ordinal)
if ($childRemoval -lt 0 -or
    $syntheticChildDatabase -lt 0 -or
    $controlledDotenvPath -lt 0 -or
    $childStart -lt 0 -or
    $childRemoval -gt $syntheticChildDatabase -or
    $syntheticChildDatabase -gt $controlledDotenvPath -or
    $controlledDotenvPath -gt $childStart -or
    $internalScrub -lt 0 -or
    $taskDispatch -lt 0 -or
    $internalScrub -gt $taskDispatch) {
    throw 'Caller project variables must be removed before child start and internal task dispatch.'
}

if ($developmentScript -match '(?s)SetEnvironmentVariable\(\s*\$variableName,\s*\$null' -or
    $ciScript -match '(?s)SetEnvironmentVariable\(\s*\$variableName,\s*\$null' -or
    $ciScript -notmatch 'Remove-Item -LiteralPath "Env:\$variableName" -ErrorAction SilentlyContinue') {
    throw 'Project-environment isolation must remove variables from Env: instead of leaving empty native-process values.'
}

if ($workflowEnvironment.Count -ne 1 -or
    $workflowEnvironment[0] -cne 'DATABASE_URL=postgresql://shiftflow:workflow-local@127.0.0.1:1/shiftflow_workflow?schema=public') {
    throw 'workflow.env must contain only the canonical non-secret synthetic loopback database URL.'
}

if ([regex]::Matches(
        $developmentScript,
        '(?m)^\s*& \$ciEntrypoint @ciArguments\s*$').Count -ne 1) {
    throw 'Full must delegate to the canonical CI entry point exactly once.'
}

if ($package.scripts.build -cne 'pwsh -NoLogo -NoProfile -File ./eng/build.ps1' -or
    $package.scripts.'build:application' -cne 'npm run build:api && npm run build:web' -or
    [regex]::Matches($buildScript, '(?m)^\s*npm run build:application\s*$').Count -ne 1 -or
    $developmentScript.Contains('build:application', [System.StringComparison]::Ordinal) -or
    $ciScript.Contains('build:application', [System.StringComparison]::Ordinal)) {
    throw 'Quick and Full must reach the raw application build only through the canonical metadata-preserving wrapper.'
}

foreach ($requiredBuildRestoration in @(
        '[System.IO.File]::ReadAllBytes($nextMetadataPath)',
        '[System.IO.File]::WriteAllBytes($nextMetadataPath, $metadataBytes)',
        '[System.IO.File]::SetLastWriteTimeUtc($nextMetadataPath, $metadataLastWriteTimeUtc)',
        'Remove-Item -LiteralPath $nextMetadataPath -Force',
        'finally')) {
    if (-not $buildScript.Contains(
            $requiredBuildRestoration,
            [System.StringComparison]::Ordinal)) {
        throw "The canonical build wrapper is missing restoration contract '$requiredBuildRestoration'."
    }
}

Assert-Plan -Task 'Doctor' -Expected @(
    'PLAN|version=1|task=Doctor|mode=Online|classification=WORKFLOW',
    'STEP|1|Validate repository root and required files',
    'STEP|2|Validate PowerShell, Git, Node.js and npm toolchains',
    'STEP|3|Validate tracked npm lock file and package metadata',
    'STEP|4|Report whether prepared dependencies and the generated Prisma client are ready'
)

Assert-Plan -Task 'Setup' -Offline -Expected @(
    'PLAN|version=1|task=Setup|mode=Offline|classification=WORKFLOW',
    'STEP|1|Validate repository root, toolchains and package lock',
    'STEP|2|npm ci --offline --ignore-scripts --no-audit --no-fund',
    'STEP|3|npm run prisma:generate'
)

Assert-Plan -Task 'Quick' -Expected @(
    'PLAN|version=1|task=Quick|mode=Online|classification=NON_GATE',
    'STEP|1|Validate repository root, toolchains, package lock and prepared dependencies',
    'STEP|2|npm run quality',
    'STEP|3|npm run test:unit',
    'STEP|4|npm run build',
    'STEP|5|git diff --check for worktree and index'
)

Assert-Plan -Task 'Full' -Expected @(
    'PLAN|version=1|task=Full|mode=Online|classification=WORKFLOW',
    'STEP|1|eng/ci.ps1'
)

Assert-Plan -Task 'Full' -Offline -Expected @(
    'PLAN|version=1|task=Full|mode=Offline|classification=INCOMPLETE_NON_GATE',
    'STEP|1|eng/ci.ps1 -Offline'
)

if ($package.scripts.'test:postgres:users' -cne
    'vitest run --config vitest.postgres.config.ts') {
    throw 'The PostgreSQL User regression must use its dedicated opt-in Vitest configuration.'
}
if (-not $postgresRegression.Contains(
        'if (process.env.SHIFTFLOW_POSTGRES_INTEGRATION !== "1") {',
        [System.StringComparison]::Ordinal) -or
    $postgresRegression.Contains('describe.runIf(', [System.StringComparison]::Ordinal)) {
    throw 'The dedicated PostgreSQL regression must fail closed instead of succeeding with skipped tests.'
}

$quickFunction = [regex]::Match(
    $developmentScript,
    '(?s)function Invoke-Quick \{(?<body>.*?)\n\}').Groups['body'].Value
foreach ($forbiddenQuickOperation in @(
        'security:audit',
        'npm ci',
        'migrate',
        'seed',
        'e2e',
        'load',
        'playwright')) {
    if ($quickFunction.Contains(
            $forbiddenQuickOperation,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Quick contains forbidden gate operation '$forbiddenQuickOperation'."
    }
}
foreach ($requiredQuickDiffContract in @(
        '(?m)^\s*git -C \$repositoryRoot diff --check\s*\r?\n\s*Assert-LastExitCode -Operation ''Working-tree diff hygiene''\s*$',
        '(?m)^\s*git -C \$repositoryRoot diff --cached --check\s*\r?\n\s*Assert-LastExitCode -Operation ''Staged diff hygiene''\s*$')) {
    if ([regex]::Matches($quickFunction, $requiredQuickDiffContract).Count -ne 1) {
        throw "Quick is missing one fail-closed local diff-hygiene contract: '$requiredQuickDiffContract'."
    }
}

foreach ($forbiddenCoreOperation in @(
        'migrate deploy',
        'seed:integration',
        'homologation:seed',
        'test:e2e',
        'test:load',
        'playwright test')) {
    if ($ciScript.Contains(
            $forbiddenCoreOperation,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Canonical core CI contains runtime operation '$forbiddenCoreOperation'."
    }
}

if ([regex]::Matches(
        $ciScript,
        [regex]::Escape('test-development-workflow.ps1')).Count -ne 1) {
    throw 'CI must invoke the development workflow policy test exactly once.'
}

$ciScrub = $ciScript.IndexOf(
    'Remove-Item -LiteralPath "Env:$variableName" -ErrorAction SilentlyContinue',
    [System.StringComparison]::Ordinal)
$ciPolicy = $ciScript.IndexOf(
    "& (Join-Path `$PSScriptRoot 'test-development-workflow.ps1')",
    [System.StringComparison]::Ordinal)
$ciPreflight = $ciScript.IndexOf(
    '& $developmentEntrypoint Doctor -CorePreflightOnly',
    [System.StringComparison]::Ordinal)
$ciInstallBranch = $ciScript.IndexOf(
    'if (-not $SkipInstall)',
    [System.StringComparison]::Ordinal)
$ciGenerate = $ciScript.IndexOf(
    'npm run prisma:generate',
    $ciInstallBranch,
    [System.StringComparison]::Ordinal)
$ciDependenciesReady = $ciScript.IndexOf(
    'Assert-DependenciesReady',
    $ciGenerate,
    [System.StringComparison]::Ordinal)
if ($ciScrub -lt 0 -or
    $ciPreflight -lt 0 -or
    $ciPolicy -lt 0 -or
    $ciInstallBranch -lt 0 -or
    $ciGenerate -lt 0 -or
    $ciDependenciesReady -lt 0 -or
    $ciScrub -gt $ciPreflight -or
    $ciPreflight -gt $ciPolicy -or
    $ciPolicy -gt $ciInstallBranch -or
    $ciInstallBranch -gt $ciGenerate -or
    $ciGenerate -gt $ciDependenciesReady -or
    [regex]::Matches(
        $ciScript,
        [regex]::Escape('npm run prisma:generate')).Count -ne 1 -or
    [regex]::Matches(
        $ciScript,
        [regex]::Escape('& $developmentEntrypoint Doctor -CorePreflightOnly')).Count -ne 1) {
    throw 'Canonical CI must scrub caller project values, run the shared preflight before every install path, and generate Prisma once under the controlled environment before dependency validation.'
}

foreach ($requiredCorePreflightContract in @(
        '[switch]$CorePreflightOnly',
        "if (`$CorePreflightOnly -and `$Task -cne 'Doctor')",
        'if (-not $CorePreflightOnly)',
        "Name = 'prepared dependencies'",
        "`$startInfo.ArgumentList.Add('-CorePreflightOnly')")) {
    if (-not $developmentScript.Contains(
            $requiredCorePreflightContract,
            [System.StringComparison]::Ordinal)) {
        throw "The shared core preflight is missing contract '$requiredCorePreflightContract'."
    }
}

foreach ($canonicalCoreCommand in @(
        'npm run security:audit',
        'npm run quality',
        'npm run test:unit',
        'npm run build')) {
    if ([regex]::Matches(
            $ciScript,
            [regex]::Escape($canonicalCoreCommand)).Count -ne 1) {
        throw "Canonical CI must invoke '$canonicalCoreCommand' exactly once."
    }
}
foreach ($requiredDiffContract in @(
        '(?m)^\s*git -C \$repositoryRoot diff --check\s*\r?\n\s*Assert-LastExitCode -Operation ''Working-tree diff hygiene''\s*$',
        '(?m)^\s*git -C \$repositoryRoot diff --cached --check\s*\r?\n\s*Assert-LastExitCode -Operation ''Staged diff hygiene''\s*$',
        '(?m)^\s*git -C \$repositoryRoot cat-file -e "\$BaseRef\^\{commit\}"\s*\r?\n\s*Assert-LastExitCode -Operation ''Remote diff-base validation''\s*$',
        '(?m)^\s*git -C \$repositoryRoot diff --check "\$BaseRef[.][.][.]HEAD"\s*\r?\n\s*Assert-LastExitCode -Operation ''Remote candidate diff hygiene''\s*$')) {
    if ([regex]::Matches($ciScript, $requiredDiffContract).Count -ne 1) {
        throw "Canonical CI is missing one fail-closed diff-hygiene contract: '$requiredDiffContract'."
    }
}
if ($ciScript -notmatch 'NOT_RUN: npm dependency audit requires online registry metadata[.]' -or
    [regex]::Matches(
        $ciScript,
        '(?m)^\s*if \(\$Offline\) \{\s*\r?\n\s*throw ''INCOMPLETE_NON_GATE: the online dependency audit was NOT_RUN; offline Full cannot approve the canonical core gate[.]''\s*\r?\n\s*\}\s*$').Count -ne 1) {
    throw 'Offline canonical CI must run its local checks and then fail closed as INCOMPLETE_NON_GATE because the online audit was NOT_RUN.'
}

$expectedScripts = @{
    'dev:doctor' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Doctor'
    'dev:setup' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Setup'
    'dev:quick' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Quick'
    'dev:full' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Full'
    'dev:workflow:test' = 'pwsh -NoLogo -NoProfile -File ./eng/test-development-workflow.ps1'
}
foreach ($scriptName in $expectedScripts.Keys) {
    if ($package.scripts.$scriptName -cne $expectedScripts[$scriptName]) {
        throw "package.json script '$scriptName' does not match the canonical workflow command."
    }
}

if ($package.engines.node -cne '>=22.12.0 <23.0.0 || >=24.0.0 <25.0.0' -or
    $package.engines.npm -cne '>=10.0.0 <12.0.0' -or
    (Get-Content -LiteralPath $nvmPath -Raw).Trim() -cne '22') {
    throw 'package.json engines must match the supported Node.js and npm workflow contract.'
}

$remoteCoreCommand = @'
run: pwsh -NoProfile -File eng/ci.ps1 -SkipInstall -BaseRef '${{ github.event.pull_request.base.sha || github.event.before }}'
'@.Trim()
if ([regex]::Matches(
        $workflow,
        '(?m)^\s*' + [regex]::Escape($remoteCoreCommand) + '\s*$').Count -ne 1) {
    throw 'The remote workflow must call the canonical core CI with candidate diff identity exactly once per supported Node.js lane.'
}
$remoteCoreGate = $workflow.IndexOf(
    $remoteCoreCommand,
    [System.StringComparison]::Ordinal)
$remoteMigration = $workflow.IndexOf(
    'run: npx prisma migrate deploy',
    [System.StringComparison]::Ordinal)
$remotePostgresIntegration = $workflow.IndexOf(
    'run: npm run test:postgres:users',
    [System.StringComparison]::Ordinal)
$remoteIntegrationSeed = $workflow.IndexOf(
    'run: node prisma/integration-seed.mjs',
    [System.StringComparison]::Ordinal)
if ($workflow -match '(?i)\bsecrets\s*(?:[.]|\[)' -or
    -not $workflow.Contains(
        'DATABASE_URL: postgresql://shiftflow:ci-postgres-password@localhost:5432/shiftflow_ci?schema=public',
        [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('E2E_EMAIL: integration.admin@shiftflow.local', [System.StringComparison]::Ordinal) -or
    $workflow -match '(?mi)^\s*(?:E2E_PASSWORD|JWT_SECRET)\s*:' -or
    -not $workflow.Contains('[System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24)', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('Add-Content -LiteralPath $env:GITHUB_ENV -Value "E2E_PASSWORD=$e2ePassword"', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('Add-Content -LiteralPath $env:GITHUB_ENV -Value "JWT_SECRET=$jwtSecret"', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('node-version: [22, 24]', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('node-version: ${{ matrix.node-version }}', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('needs: core-gate', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('fetch-depth: 0', [System.StringComparison]::Ordinal) -or
    $remoteCoreGate -lt 0 -or
    $remoteMigration -lt 0 -or
    $remoteCoreGate -gt $remoteMigration) {
    throw 'Remote core lanes must cover Node.js 22 and 24 with full candidate history; runtime stages must follow them and use only fixed non-secret disposable inputs.'
}
if ([regex]::Matches(
        $workflow,
        '(?m)^\s*run:\s*npm run test:postgres:users\s*$').Count -ne 1 -or
    -not $workflow.Contains('SHIFTFLOW_POSTGRES_INTEGRATION: "1"', [System.StringComparison]::Ordinal) -or
    $remotePostgresIntegration -lt 0 -or
    $remoteIntegrationSeed -lt 0 -or
    $remotePostgresIntegration -lt $remoteMigration -or
    $remotePostgresIntegration -gt $remoteIntegrationSeed) {
    throw 'The disposable runtime must execute the opt-in User aggregate PostgreSQL regression after migrations and before shared seed data.'
}
if ([regex]::Matches(
        $workflow,
        '(?m)^\s*run:\s*npm run prisma:generate\s*$').Count -ne 1 -or
    $workflow.IndexOf(
        'run: npm run prisma:generate',
        [System.StringComparison]::Ordinal) -gt $remoteMigration) {
    throw 'Only the disposable runtime job may generate Prisma outside canonical CI; core generation belongs to the isolated CI script.'
}
foreach ($duplicatedCommand in @(
        'npm run security:audit',
        'npm run quality',
        'npm run test:unit',
        'npm run build')) {
    if ($workflow.Contains($duplicatedCommand, [System.StringComparison]::Ordinal)) {
        throw "The remote workflow duplicates canonical command '$duplicatedCommand'."
    }
}

Write-Output 'All development workflow policy tests passed.'
