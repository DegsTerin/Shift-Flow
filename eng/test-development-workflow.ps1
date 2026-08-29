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
$composePath = Join-Path $repositoryRoot 'docker-compose.yml'
$nodeDockerfilePath = Join-Path $repositoryRoot 'infra/docker/node.Dockerfile'
$dotnetDockerfilePath = Join-Path $repositoryRoot 'apps/api-dotnet/Dockerfile'
$prismaConfigPath = Join-Path $repositoryRoot '.config/prisma.ts'
$unitVitestConfigPath = Join-Path $repositoryRoot '.config/vitest.config.ts'
$postgresVitestConfigPath = Join-Path $repositoryRoot '.config/vitest.postgres.config.ts'
$workflowEnvironmentPath = Join-Path $PSScriptRoot 'workflow.env'
$postgresRegressionPath = Join-Path $repositoryRoot 'prisma/users-tenant-isolation.postgres.test.mjs'
$stranglerFixturePath = Join-Path $repositoryRoot 'prisma/strangler-integration-seed.mjs'
$stranglerSecurityControlPath = Join-Path $repositoryRoot 'prisma/strangler-security-control.mjs'
$stranglerSmokePath = Join-Path $PSScriptRoot 'smoke-strangler.ps1'
$stranglerRuntimePath = Join-Path $PSScriptRoot 'strangler-runtime.ps1'

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
$composeConfiguration = Get-Content -LiteralPath $composePath -Raw
$nodeDockerfile = Get-Content -LiteralPath $nodeDockerfilePath -Raw
$dotnetDockerfile = Get-Content -LiteralPath $dotnetDockerfilePath -Raw
$postgresRegression = Get-Content -LiteralPath $postgresRegressionPath -Raw
$stranglerFixture = Get-Content -LiteralPath $stranglerFixturePath -Raw
$stranglerSecurityControl = Get-Content -LiteralPath $stranglerSecurityControlPath -Raw
$stranglerSmoke = Get-Content -LiteralPath $stranglerSmokePath -Raw
$stranglerRuntime = Get-Content -LiteralPath $stranglerRuntimePath -Raw
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

$runtimeEnvironmentBoundary = [regex]::Match(
    $stranglerRuntime,
    '(?s)\$runtimeVariableNames\s*=\s*@\((?<body>.*?)\r?\n\)')
$expectedRuntimeVariables = @(
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_SECRET',
    'POSTGRES_PASSWORD',
    'SMOKE_ACTION',
    'SMOKE_CREDENTIAL_VERSION',
    'SMOKE_JWT_ID'
)
$observedRuntimeVariables = @(
    [regex]::Matches($runtimeEnvironmentBoundary.Groups['body'].Value, "'(?<name>[A-Z0-9_]+)'") |
        ForEach-Object { $_.Groups['name'].Value } |
        Sort-Object -Unique)
if (-not $runtimeEnvironmentBoundary.Success -or
    @(Compare-Object $expectedRuntimeVariables $observedRuntimeVariables).Count -ne 0) {
    throw 'The strangler runtime must preserve the exact runtime and internal-smoke caller environment boundary.'
}

$requiredIsolatedVariables = @(
    'API_INSTANCE_COUNT',
    'AUTH_DEMO_EMAIL',
    'AUTH_MODE',
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
    'STEP|2|Validate PowerShell, Git, Node.js, npm and .NET SDK toolchains',
    'STEP|3|Validate tracked npm and NuGet lock metadata',
    'STEP|4|Report whether prepared Node.js, Prisma and .NET dependencies are ready'
)

Assert-Plan -Task 'Setup' -Offline -Expected @(
    'PLAN|version=1|task=Setup|mode=Offline|classification=WORKFLOW',
    'STEP|1|Validate repository root, toolchains and package lock',
    'STEP|2|npm ci --offline --ignore-scripts --no-audit --no-fund',
    'STEP|3|dotnet restore apps/api-dotnet/ShiftFlow.slnx --locked-mode (online) or validate the prepared offline graph',
    'STEP|4|npm run prisma:generate'
)

Assert-Plan -Task 'Quick' -Expected @(
    'PLAN|version=1|task=Quick|mode=Online|classification=NON_GATE',
    'STEP|1|Validate repository root, toolchains, package lock and prepared dependencies',
    'STEP|2|npm run quality',
    'STEP|3|npm run test:unit',
    'STEP|4|npm run build',
    'STEP|5|eng/dotnet.ps1 -SkipRestore -SkipAudit',
    'STEP|6|git diff --check for worktree and index'
)

Assert-Plan -Task 'Full' -Expected @(
    'PLAN|version=1|task=Full|mode=Online|classification=WORKFLOW',
    'STEP|1|eng/ci.ps1'
)

Assert-Plan -Task 'Full' -Offline -Expected @(
    'PLAN|version=1|task=Full|mode=Offline|classification=INCOMPLETE_NON_GATE',
    'STEP|1|eng/ci.ps1 -Offline'
)

foreach ($centralConfigPath in @(
        $prismaConfigPath,
        $unitVitestConfigPath,
        $postgresVitestConfigPath
    )) {
    if (-not (Test-Path -LiteralPath $centralConfigPath -PathType Leaf)) {
        throw "Central configuration file is missing: $centralConfigPath"
    }
}
foreach ($obsoleteRootConfig in @(
        'prisma.config.ts',
        'vitest.config.ts',
        'vitest.postgres.config.ts',
        '.prettierrc'
    )) {
    if (Test-Path -LiteralPath (Join-Path $repositoryRoot $obsoleteRootConfig)) {
        throw "Configuration file must not return to the repository root: $obsoleteRootConfig"
    }
}
if ($package.scripts.'test:unit' -cne
    'vitest run --config .config/vitest.config.ts') {
    throw 'The unit-test gate must use the central Vitest configuration.'
}
if ($package.scripts.'test:postgres:users' -cne
    'vitest run --config .config/vitest.postgres.config.ts') {
    throw 'The PostgreSQL User regression must use its dedicated opt-in Vitest configuration.'
}
if (-not $nodeDockerfile.Contains(
        'COPY .config/prisma.ts ./.config/prisma.ts',
        [System.StringComparison]::Ordinal)) {
    throw 'The Node.js container build must copy the central Prisma configuration.'
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
    '& $developmentEntrypoint Doctor -CorePreflightOnly -CoreComponent $Component',
    [System.StringComparison]::Ordinal)
$ciInstallBranch = $ciScript.IndexOf(
    'if ($runNode -and -not $SkipInstall)',
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
        [regex]::Escape('& $developmentEntrypoint Doctor -CorePreflightOnly -CoreComponent $Component')).Count -ne 1) {
    throw 'Canonical CI must scrub caller project values, run the shared preflight before every install path, and generate Prisma once under the controlled environment before dependency validation.'
}

foreach ($requiredCorePreflightContract in @(
        '[switch]$CorePreflightOnly',
        "[ValidateSet('All', 'Node', 'DotNet')]",
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
    $ciScript -notmatch "\& \`$dotnetEntrypoint \@dotnetArguments" -or
    [regex]::Matches(
        $ciScript,
        '(?m)^\s*if \(\$Offline\) \{\s*\r?\n\s*throw ''INCOMPLETE_NON_GATE: one or more online dependency audits were NOT_RUN; offline Full cannot approve the canonical core gate[.]''\s*\r?\n\s*\}\s*$').Count -ne 1) {
    throw 'Offline canonical CI must run its local checks and then fail closed as INCOMPLETE_NON_GATE because online audits were NOT_RUN.'
}

$expectedScripts = @{
    'dev:doctor' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Doctor'
    'dev:setup' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Setup'
    'dev:quick' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Quick'
    'dev:full' = 'pwsh -NoLogo -NoProfile -File ./eng/development.ps1 Full'
    'dev:workflow:test' = 'pwsh -NoLogo -NoProfile -File ./eng/test-development-workflow.ps1'
    'dev:dotnet' = 'dotnet run --project apps/api-dotnet/src/ShiftFlow.Api/ShiftFlow.Api.csproj'
    'build:dotnet' = 'dotnet build apps/api-dotnet/ShiftFlow.slnx --configuration Release'
    'test:dotnet' = 'dotnet test apps/api-dotnet/ShiftFlow.slnx --configuration Release'
    'test:runtime:strangler' = 'pwsh -NoLogo -NoProfile -File ./eng/strangler-runtime.ps1'
}
foreach ($scriptName in $expectedScripts.Keys) {
    if ($package.scripts.$scriptName -cne $expectedScripts[$scriptName]) {
        throw "package.json script '$scriptName' does not match the canonical workflow command."
    }
}
if ($null -ne $package.scripts.PSObject.Properties['test:smoke:strangler']) {
    throw 'The mutating strangler smoke must remain internal to its authority-bound disposable wrapper.'
}

if ($package.engines.node -cne '>=22.12.0 <23.0.0 || >=24.0.0 <25.0.0' -or
    $package.engines.npm -cne '>=10.0.0 <12.0.0' -or
    (Get-Content -LiteralPath $nvmPath -Raw).Trim() -cne '22') {
    throw 'package.json engines must match the supported Node.js and npm workflow contract.'
}

$remoteCoreCommand = @'
run: pwsh -NoProfile -File eng/ci.ps1 -Component Node -SkipInstall -BaseRef '${{ github.event.pull_request.base.sha || (github.event.before != '0000000000000000000000000000000000000000' && github.event.before) || '' }}'
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
    -not $workflow.Contains('needs: [core-gate, dotnet-gate]', [System.StringComparison]::Ordinal) -or
    -not $workflow.Contains('fetch-depth: 0', [System.StringComparison]::Ordinal) -or
    $remoteCoreGate -lt 0 -or
    $remoteMigration -lt 0 -or
    $remoteCoreGate -gt $remoteMigration) {
    throw 'Remote core lanes must cover Node.js 22 and 24 with full candidate history; runtime stages must follow them and use only fixed non-secret disposable inputs.'
}
foreach ($dotnetWorkflowContract in @(
        'uses: actions/setup-dotnet@a98b56852c35b8e3190ac28c8c2271da59106c68',
        'global-json-file: global.json',
        "run: pwsh -NoProfile -File eng/ci.ps1 -Component DotNet -BaseRef '`${{ github.event.pull_request.base.sha || (github.event.before != '0000000000000000000000000000000000000000' && github.event.before) || '' }}'",
        'runs-on: ubuntu-24.04')) {
    if (-not $workflow.Contains($dotnetWorkflowContract, [System.StringComparison]::Ordinal)) {
        throw "The remote workflow is missing ASP.NET Core or Redis contract '$dotnetWorkflowContract'."
    }
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

$stranglerJob = $workflow.IndexOf(
    'strangler-runtime-gate:',
    [System.StringComparison]::Ordinal)
$stranglerRuntimeRun = $workflow.IndexOf(
    'run: pwsh -NoProfile -File eng/strangler-runtime.ps1 -ProjectName shiftflow-strangler-ci',
    [System.StringComparison]::Ordinal)
if ($stranglerJob -lt 0 -or
    -not $workflow.Contains('needs: runtime-gates', [System.StringComparison]::Ordinal) -or
    $stranglerRuntimeRun -lt $stranglerJob -or
    [regex]::Matches(
        $workflow,
        [regex]::Escape('run: pwsh -NoProfile -File eng/strangler-runtime.ps1 -ProjectName shiftflow-strangler-ci')).Count -ne 1 -or
    $workflow.Contains('REDIS_CONNECTION: localhost:6379,abortConnect=false', [System.StringComparison]::Ordinal)) {
    throw 'The strangler runtime job must run the canonical disposable gate exactly once and only after the existing runtime gate.'
}

if ([regex]::Matches($workflow, '(?m)^\s*runs-on:\s*ubuntu-24[.]04\s*$').Count -ne 4 -or
    $workflow.Contains('ubuntu-latest', [System.StringComparison]::Ordinal) -or
    [regex]::Matches($workflow, [regex]::Escape('Write-Output "::add-mask::$e2ePassword"')).Count -ne 1 -or
    [regex]::Matches($workflow, [regex]::Escape('Write-Output "::add-mask::$jwtSecret"')).Count -ne 1) {
    throw 'Remote jobs must use the explicit stable runner label and mask the existing runtime credentials before export.'
}

foreach ($stranglerRuntimeContract in @(
        "Join-Path `$repositoryRoot 'scripts/docker-desktop.ps1'",
        'Assert-LocalDockerEnvironment',
        '$postgresNonce =',
        '$e2eNonce =',
        'Write-Output "::add-mask::$value"',
        'config --quiet',
        'up --detach --build --wait',
        'migrate node prisma/integration-seed.mjs',
        'migrate node prisma/strangler-integration-seed.mjs',
        "@('postgres', 'redis', 'legacy-api', 'api-dotnet', 'web', 'nginx')",
        'cat /proc/1/status',
        "`$uidMatch.Groups['effective'].Value",
        'run --rm migrate id -u',
        "docker inspect --format '{{.State.Status}}'",
        '$lastHealthStatus',
        'sha256sum /var/lib/shiftflow/keys/key-*.xml',
        'internal/runtime/data-protection-probe',
        'cp api-dotnet:/tmp/shiftflow-data-protection-probe $protectedPayload',
        'rm --stop --force api-dotnet',
        'up --detach --no-deps api-dotnet',
        'cp $protectedPayload api-dotnet:/tmp/shiftflow-data-protection-probe',
        "`$unprotectEvidence.status -cne 'available'",
        'Compare-Object $keyHashesBefore $keyHashesAfter',
        '-PreviousEvidencePath $beforeEvidence',
        '-AllowSecurityMutation',
        'redis-cli pttl',
        '-ExpectRedisUnavailable',
        'wget -qO- http://127.0.0.1:8080/ready',
        "`$readinessEvidence.checks.postgresql -cne 'available'",
        "`$readinessEvidence.checks.redis -cne 'available'",
        "`$readinessEvidence.checks.dataProtection -cne 'available'",
        '-ExpectRedisRecovered',
        'redisRecoveredAfterRestart',
        'logs --no-color --tail 200',
        'down --volumes --remove-orphans',
        '[System.Environment]::GetEnvironmentVariables(',
        '[System.Environment]::SetEnvironmentVariable(',
        'Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue',
        '$environmentRestoreFailure',
        '$cleanupFailure')) {
    if (-not $stranglerRuntime.Contains(
            $stranglerRuntimeContract,
            [System.StringComparison]::Ordinal)) {
        throw "The canonical strangler runtime gate is missing contract '$stranglerRuntimeContract'."
    }
}
$runtimeAuthority = $stranglerRuntime.IndexOf(
    'Assert-LocalDockerEnvironment',
    [System.StringComparison]::Ordinal)
$runtimeFirstDocker = $stranglerRuntime.IndexOf(
    'docker compose',
    [System.StringComparison]::Ordinal)
$runtimeFirstCredential = $stranglerRuntime.IndexOf(
    '$env:POSTGRES_PASSWORD =',
    [System.StringComparison]::Ordinal)
$runtimeSuccessAssignment = $stranglerRuntime.IndexOf(
    '$successEvidence = [ordered]@{',
    [System.StringComparison]::Ordinal)
$runtimeCleanupCheck = $stranglerRuntime.IndexOf(
    'if ($cleanupExitCode -ne 0)',
    [System.StringComparison]::Ordinal)
$runtimeSuccessOutput = $stranglerRuntime.IndexOf(
    'Write-Output ($successEvidence | ConvertTo-Json -Compress)',
    [System.StringComparison]::Ordinal)
$runtimeEnvironmentCheck = $stranglerRuntime.IndexOf(
    'if ($null -ne $environmentRestoreFailure)',
    [System.StringComparison]::Ordinal)
$runtimeCleanupFailureCheck = $stranglerRuntime.IndexOf(
    'if ($null -ne $cleanupFailure)',
    [System.StringComparison]::Ordinal)
if ($runtimeAuthority -lt 0 -or
    $runtimeFirstDocker -lt 0 -or
    $runtimeFirstCredential -lt 0 -or
    $runtimeAuthority -gt $runtimeFirstDocker -or
    $runtimeAuthority -gt $runtimeFirstCredential -or
    $runtimeSuccessAssignment -lt 0 -or
    $runtimeCleanupFailureCheck -lt $runtimeSuccessAssignment -or
    $runtimeCleanupCheck -lt $runtimeSuccessAssignment -or
    $runtimeEnvironmentCheck -lt $runtimeCleanupCheck -or
    $runtimeSuccessOutput -lt $runtimeCleanupCheck -or
    $runtimeSuccessOutput -lt $runtimeCleanupFailureCheck -or
    $runtimeSuccessOutput -lt $runtimeEnvironmentCheck -or
    [regex]::Matches(
        $stranglerRuntime,
        '(?m)^try \{\s*\r?\n\s+\$postgresNonce =').Count -ne 1 -or
    [regex]::Matches(
        $stranglerRuntime,
        [regex]::Escape('Write-Output ($successEvidence | ConvertTo-Json -Compress)')).Count -ne 1 -or
    [regex]::Matches(
        $stranglerRuntime,
        [regex]::Escape('$null = & $smokePath')).Count -ne 4 -or
    [regex]::Matches(
        $stranglerRuntime,
        [regex]::Escape('-ComposeProjectName $ProjectName')).Count -ne 4) {
    throw 'The runtime gate must confirm local Docker authority before credentials or Docker access and emit PASS only after successful cleanup.'
}

$immutableComposeImages = [ordered]@{
    postgres = 'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
    redis = 'redis:8.2.1-alpine@sha256:987c376c727652f99625c7d205a1cba3cb2c53b92b0b62aade2bd48ee1593232'
    nginx = 'nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8'
}
foreach ($serviceName in $immutableComposeImages.Keys) {
    $serviceBlock = [regex]::Match(
        $composeConfiguration,
        '(?ms)^  ' + [regex]::Escape($serviceName) + ':\r?\n(?<body>.*?)(?=^  \S|\z)')
    $expectedImageLine = '    image: ' + $immutableComposeImages[$serviceName]
    if (-not $serviceBlock.Success -or
        [regex]::Matches(
            $serviceBlock.Value,
            '(?m)^' + [regex]::Escape($expectedImageLine) + '\s*$').Count -ne 1 -or
        [regex]::Matches($serviceBlock.Value, '(?m)^    image:\s+').Count -ne 1) {
        throw "Compose service '$serviceName' must use its one exact immutable image contract."
    }
}
foreach ($localServiceName in @('postgres', 'redis')) {
    $localServiceBlock = [regex]::Match(
        $composeConfiguration,
        '(?ms)^  ' + [regex]::Escape($localServiceName) + ':\r?\n(?<body>.*?)(?=^  \S|\z)')
    if (-not $localServiceBlock.Success -or
        $localServiceBlock.Value.IndexOf(
            '      - local-access',
            [System.StringComparison]::Ordinal) -lt 0) {
        throw "Compose service '$localServiceName' must keep loopback publication reachable through the non-internal local-access network."
    }
}
if ($composeConfiguration -notmatch '(?ms)^  local-access:\r?\n    internal: false\s*$') {
    throw 'Compose must declare the local-access network as non-internal for loopback development ports.'
}
$runtimeJob = [regex]::Match(
    $workflow,
    '(?ms)^  runtime-gates:\r?\n(?<body>.*?)(?=^  [a-zA-Z0-9_-]+:\r?$|\z)')
$workflowPostgresImage = '        image: ' + $immutableComposeImages.postgres
if (-not $runtimeJob.Success -or
    [regex]::Matches(
        $runtimeJob.Value,
        '(?m)^' + [regex]::Escape($workflowPostgresImage) + '\s*$').Count -ne 1 -or
    [regex]::Matches($runtimeJob.Value, '(?m)^        image:\s+postgres:').Count -ne 1) {
    throw 'The runtime-gates PostgreSQL service must use its exact immutable image contract.'
}
if (-not $composeConfiguration.Contains(
        'API_RATE_LIMIT_WINDOW_MS: "600000"',
        [System.StringComparison]::Ordinal)) {
    throw 'The disposable profile must keep its Redis persistence proof inside a bounded, runner-safe rate-limit window.'
}
foreach ($composeSecurityContract in @(
        'data-protection-keys:/var/lib/shiftflow/keys',
        'SHIFTFLOW_DISPOSABLE_RUNTIME: CONFIRMED_DISPOSABLE_STRANGLER')) {
    if (-not $composeConfiguration.Contains(
            $composeSecurityContract,
            [System.StringComparison]::Ordinal)) {
        throw "The disposable profile is missing state or authority contract '$composeSecurityContract'."
    }
}
$immutableNodeImage = 'node:22.18.0-alpine3.22@sha256:1b2479dd35a99687d6638f5976fd235e26c5b37e8122f786fcd5fe231d63de5b'
$externalNodeStages = @([regex]::Matches($nodeDockerfile, '(?im)^FROM\s+node:[^\r\n]+$'))
$expectedNodeStages = @('dependencies', 'legacy-api', 'web')
if ($externalNodeStages.Count -ne $expectedNodeStages.Count) {
    throw 'The Node.js container build must retain exactly three externally rooted stages.'
}
foreach ($stageName in $expectedNodeStages) {
    if ([regex]::Matches(
            $nodeDockerfile,
            '(?m)^FROM ' + [regex]::Escape($immutableNodeImage) + ' AS ' + [regex]::Escape($stageName) + '\s*$').Count -ne 1) {
        throw "Node.js stage '$stageName' must use the exact immutable base image."
    }
}
$migrationStage = [regex]::Match(
    $nodeDockerfile,
    '(?ms)^FROM generated AS migration\r?\n(?<body>.*?)(?=^FROM |\z)')
if (-not $migrationStage.Success -or
    [regex]::Matches(
        $migrationStage.Groups['body'].Value,
        '(?m)^USER node\s*$').Count -ne 1) {
    throw 'The exact one-shot migration image stage must run as the non-root node identity.'
}
$immutableDotNetStages = [ordered]@{
    build = 'mcr.microsoft.com/dotnet/sdk:10.0.400-alpine3.23@sha256:b36516b249f0cccf9e5017082f51d4bda2d61469f205a7167fbf3b8498ecdd59'
    runtime = 'mcr.microsoft.com/dotnet/aspnet:10.0.11-alpine3.23@sha256:4d5339ac9814f1a033a09e664bcf159e9fb386c89b6e7917b3dca7254e656027'
}
if ([regex]::Matches($dotnetDockerfile, '(?im)^FROM\s+mcr[.]microsoft[.]com/dotnet/[^\r\n]+$').Count -ne
    $immutableDotNetStages.Count) {
    throw 'The ASP.NET Core container build must retain exactly two externally rooted stages.'
}
foreach ($stageName in $immutableDotNetStages.Keys) {
    if ([regex]::Matches(
            $dotnetDockerfile,
            '(?m)^FROM ' + [regex]::Escape($immutableDotNetStages[$stageName]) + ' AS ' + [regex]::Escape($stageName) + '\s*$').Count -ne 1) {
        throw "ASP.NET Core stage '$stageName' must use its exact immutable base image."
    }
}

foreach ($smokeContract in @(
        "Join-Path `$repositoryRoot 'scripts/docker-desktop.ps1'",
        'Assert-LocalDockerEnvironment',
        "ValidatePattern('^shiftflow-strangler-[a-z0-9][a-z0-9-]*$')",
        '$baseAddress.IsLoopback',
        "`$baseAddress.Scheme -cne 'http'",
        '$AllowSecurityMutation',
        "-Path '/'",
        "'/openapi/v1.json'",
        "'/api/auth/login'",
        "'/api/audit?entityType=MigrationProbe&action=STRANGLER_SMOKE&pageSize=100'",
        "'/api/audit/88888888-8888-4888-8888-888888888881'",
        "'/api/audit/88888888-8888-4888-8888-888888888882'",
        "'x-rate-limit-limit'",
        "'x-rate-limit-remaining'",
        "-Action 'disable-role'",
        "-Action 'advance-credential-version'",
        "-Action 'restore-credential-version'",
        '$credentialControl.previousCredentialVersion',
        '$credentialControl.previousCredentialVersionMilliseconds',
        '$credentialControl.advancedCredentialVersionMilliseconds',
        '$restoreControl.restoredCredentialVersionMilliseconds',
        '$restoredLogin.data.accessToken',
        "-Action 'revoke-token'",
        'Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue',
        "'x-company-id' = '77777777-7777-4777-8777-777777777777'",
        "`$ExpectRedisUnavailable",
        "`$ExpectRedisRecovered",
        'Redis unavailable and recovered expectations are mutually exclusive.',
        "`$recoveryResponse.StatusCode -eq 401",
        "`$recovery.error.code -ceq 'UNAUTHORIZED'",
        "@{ Host = 'untrusted.invalid' }")) {
    if (-not $stranglerSmoke.Contains($smokeContract, [System.StringComparison]::Ordinal)) {
        throw "The strangler smoke is missing contract '$smokeContract'."
    }
}
$smokeAuthority = $stranglerSmoke.IndexOf(
    'Assert-LocalDockerEnvironment',
    [System.StringComparison]::Ordinal)
$smokeFirstRequest = $stranglerSmoke.IndexOf(
    'Invoke-WebRequest',
    [System.StringComparison]::Ordinal)
if ($smokeAuthority -lt 0 -or
    $smokeFirstRequest -lt 0 -or
    $smokeAuthority -gt $smokeFirstRequest) {
    throw 'The focused smoke must confirm local Docker authority before it can transmit runtime credentials or mutate controls.'
}
foreach ($securityControlContract in @(
        'disable-role',
        'enable-role',
        'advance-credential-version',
        'restore-credential-version',
        'revoke-token',
        'prisma.accessTokenRevocation.upsert',
        'prisma.role.update',
        'prisma.user.update',
        'previousCredentialVersionMilliseconds',
        'advancedCredentialVersionMilliseconds',
        'restoredCredentialVersionMilliseconds',
        'MILLISECONDS:',
        '/^MILLISECONDS:(0|[1-9]\d*)$/',
        'Number.isSafeInteger(milliseconds)',
        '8_640_000_000_000_000',
        'SHIFTFLOW_DISPOSABLE_RUNTIME',
        'CONFIRMED_DISPOSABLE_STRANGLER',
        'databaseUrl.protocol !== "postgresql:"',
        'databaseUrl.hostname !== "postgres"',
        'databaseUrl.port !== "5432"',
        'databaseUrl.username !== "shiftflow"',
        'databaseUrl.search !== "?schema=public"',
        'databaseUrl.hash !== ""',
        'databaseUrl.pathname !== "/shiftflow"')) {
    if (-not $stranglerSecurityControl.Contains(
            $securityControlContract,
            [System.StringComparison]::Ordinal)) {
        throw "The strangler security control is missing contract '$securityControlContract'."
    }
}
if ($stranglerSecurityControl.Contains('dotenv/config', [System.StringComparison]::Ordinal)) {
    throw 'The mutating strangler security control must never load repository dotenv state.'
}
foreach ($fixtureContract in @(
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888881',
        '88888888-8888-4888-8888-888888888882',
        'tenant-visible',
        'tenant-hidden',
        'refresh_token',
        'SHIFTFLOW_DISPOSABLE_RUNTIME',
        'CONFIRMED_DISPOSABLE_STRANGLER',
        'databaseUrl.protocol !== "postgresql:"',
        'databaseUrl.hostname !== "postgres"',
        'databaseUrl.port !== "5432"',
        'databaseUrl.username !== "shiftflow"',
        'databaseUrl.search !== "?schema=public"',
        'databaseUrl.hash !== ""',
        'databaseUrl.pathname !== "/shiftflow"')) {
    if (-not $stranglerFixture.Contains($fixtureContract, [System.StringComparison]::Ordinal)) {
        throw "The deterministic strangler fixture is missing contract '$fixtureContract'."
    }
}
if ($stranglerFixture.Contains('dotenv/config', [System.StringComparison]::Ordinal)) {
    throw 'The mutating strangler fixture must never load repository dotenv state.'
}

Write-Output 'All development workflow policy tests passed.'
