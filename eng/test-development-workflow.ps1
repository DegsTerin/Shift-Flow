# en-GB: Exercises the development workflow contract without installing, building, testing or using the network.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$developmentPath = Join-Path $PSScriptRoot 'development.ps1'
$buildPath = Join-Path $PSScriptRoot 'build.ps1'
$ciPath = Join-Path $PSScriptRoot 'ci.ps1'
$agentContractPath = Join-Path $PSScriptRoot 'test-agent-contract.ps1'
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
$readinessRuntimePath = Join-Path $repositoryRoot 'prisma/readiness-runtime.mjs'
$ociVerifierPath = Join-Path $repositoryRoot 'scripts/verify-oci-supply-chain.mjs'
$ociVerifierTestPath = Join-Path $repositoryRoot 'scripts/verify-oci-supply-chain.test.mjs'
$ociRuntimeVerifierPath = Join-Path $repositoryRoot 'scripts/verify-oci-runtime-evidence.mjs'
$ociRuntimeVerifierTestPath = Join-Path $repositoryRoot 'scripts/verify-oci-runtime-evidence.test.mjs'
$ociTargetsPath = Join-Path $PSScriptRoot 'oci-targets.json'
$ociExceptionsPath = Join-Path $PSScriptRoot 'oci-cve-exceptions.json'
$ociSpdxSchemaPath = Join-Path $PSScriptRoot 'spdx-2.3-schema.json'
$secretHistoryAllowlistPath = Join-Path $PSScriptRoot 'secret-history-allowlist.json'
$gitAttributesPath = Join-Path $repositoryRoot '.gitattributes'
$dockerDesktopHelperPath = Join-Path $repositoryRoot 'scripts/docker-desktop.ps1'

if (-not (Test-Path -LiteralPath $agentContractPath -PathType Leaf)) {
    throw "The project-scoped agent contract validator is missing: $agentContractPath"
}
if (-not (Test-Path -LiteralPath $readinessRuntimePath -PathType Leaf)) {
    throw "The guarded readiness runtime fixture is missing: $readinessRuntimePath"
}

foreach ($ociPolicyPath in @(
        $ociVerifierPath,
        $ociVerifierTestPath,
        $ociRuntimeVerifierPath,
        $ociRuntimeVerifierTestPath,
        $ociTargetsPath,
        $ociExceptionsPath,
        $ociSpdxSchemaPath,
        $secretHistoryAllowlistPath,
        $gitAttributesPath
    )) {
    if (-not (Test-Path -LiteralPath $ociPolicyPath -PathType Leaf)) {
        throw "The local OCI policy precursor file is missing: $ociPolicyPath"
    }
}

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

function Assert-ExactObjectProperties {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Value,

        [Parameter(Mandatory)]
        [string[]]$Expected,

        [Parameter(Mandatory)]
        [string]$Location
    )

    $observedProperties = @($Value.PSObject.Properties.Name | Sort-Object)
    $expectedProperties = @($Expected | Sort-Object)
    if (($observedProperties -join "`n") -cne ($expectedProperties -join "`n")) {
        throw "The local OCI policy object '$Location' has unexpected or missing properties."
    }
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
$readinessRuntime = Get-Content -LiteralPath $readinessRuntimePath -Raw
$ociVerifier = Get-Content -LiteralPath $ociVerifierPath -Raw
$ociRuntimeVerifier = Get-Content -LiteralPath $ociRuntimeVerifierPath -Raw
$ociTargets = Get-Content -LiteralPath $ociTargetsPath -Raw | ConvertFrom-Json
$ociExceptions = Get-Content -LiteralPath $ociExceptionsPath -Raw | ConvertFrom-Json
$gitAttributes = Get-Content -LiteralPath $gitAttributesPath -Raw
$dockerDesktopHelper = Get-Content -LiteralPath $dockerDesktopHelperPath -Raw
$checkoutCount = [regex]::Matches(
    $workflow,
    '(?m)^\s*uses:\s*actions/checkout@[0-9a-f]{40}\s*$').Count
$nonPersistentCheckoutCount = [regex]::Matches(
    $workflow,
    '(?m)^\s*persist-credentials:\s*false\s*$').Count
if ($checkoutCount -ne 5 -or $nonPersistentCheckoutCount -ne $checkoutCount -or
    $workflow -match '(?m)^\s*persist-credentials:\s*true\s*$') {
    throw 'Every release-gate checkout must remove its Git credential before later steps run.'
}
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
    'DATABASE_URL',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'JWT_ACCESS_SECRET',
    'JWT_SECRET',
    'POSTGRES_PASSWORD',
    'SHIFTFLOW_DISPOSABLE_RUNTIME',
    'SMOKE_ACTION',
    'SMOKE_CREDENTIAL_VERSION',
    'SMOKE_JWT_ID'
)

$perUserDockerDesktopPath = 'Join-Path $basePath "Programs/DockerDesktop/Docker Desktop.exe"'
$legacyPerUserDockerDesktopPath = 'Join-Path $basePath "Programs/Docker/Docker/Docker Desktop.exe"'
if ([regex]::Matches(
        $dockerDesktopHelper,
        [regex]::Escape($perUserDockerDesktopPath)).Count -ne 1 -or
    $dockerDesktopHelper.IndexOf($perUserDockerDesktopPath, [System.StringComparison]::Ordinal) -gt
    $dockerDesktopHelper.IndexOf($legacyPerUserDockerDesktopPath, [System.StringComparison]::Ordinal)) {
    throw 'The Docker Desktop helper must prefer the supported per-user installation path.'
}
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

$expectedOciPolicyScript = 'node scripts/verify-oci-supply-chain.mjs --policy-only --targets eng/oci-targets.json --exceptions eng/oci-cve-exceptions.json'
$expectedOciEvidenceScript = 'node scripts/verify-oci-runtime-evidence.mjs'
$expectedQualityScript = 'npm run format:check && npm run comments:verify && npm run platform:workflow:test && npm run lint && npm run typecheck && npm run prisma:validate && npm run audit:overrides && npm run security:oci-policy && npm run security:secrets && npm run security:production-config'
$qualityScript = [string]$package.scripts.quality
$overrideGatePosition = $qualityScript.IndexOf(
    'npm run audit:overrides',
    [System.StringComparison]::Ordinal)
$ociPolicyGatePosition = $qualityScript.IndexOf(
    'npm run security:oci-policy',
    [System.StringComparison]::Ordinal)
$secretGatePosition = $qualityScript.IndexOf(
    'npm run security:secrets',
    [System.StringComparison]::Ordinal)
if ($qualityScript -cne $expectedQualityScript -or
    $package.scripts.'security:oci-policy' -cne $expectedOciPolicyScript -or
    $package.scripts.'security:oci-evidence' -cne $expectedOciEvidenceScript -or
    [regex]::Matches(
        $qualityScript,
        [regex]::Escape('npm run security:oci-policy')).Count -ne 1 -or
    $overrideGatePosition -lt 0 -or
    $ociPolicyGatePosition -lt $overrideGatePosition -or
    $secretGatePosition -lt $ociPolicyGatePosition) {
    throw 'Quality must execute the exact local OCI policy precursor once, after override audit and before secret scanning.'
}
foreach ($forbiddenOciOperation in @(
        'node:child_process',
        'node:http',
        'node:https',
        'node:net',
        'node:tls',
        'fetch(',
        'docker build',
        'docker compose')) {
    if ($ociVerifier.Contains($forbiddenOciOperation, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The local OCI policy precursor must not perform external operation '$forbiddenOciOperation'."
    }
}
foreach ($forbiddenRuntimeVerifierOperation in @(
        'node:child_process',
        'node:http',
        'node:https',
        'node:net',
        'node:tls',
        'fetch(')) {
    if ($ociRuntimeVerifier.Contains(
            $forbiddenRuntimeVerifierOperation,
            [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The OCI runtime evidence verifier must not perform external operation '$forbiddenRuntimeVerifierOperation'."
    }
}

$ociWorkflow = [regex]::Match(
    $workflow,
    '(?ms)^  oci-evidence-gate:\s*$.*?(?=^  runtime-gates:\s*$)')
if (-not $ociWorkflow.Success) {
    throw 'The release workflow must contain the blocking OCI evidence job.'
}
$ociWorkflowText = $ociWorkflow.Value
foreach ($targetId in @('api-dotnet', 'legacy-api', 'migration', 'nginx', 'postgres', 'redis', 'web')) {
    if ([regex]::Matches(
            $ociWorkflowText,
            "(?m)^\s*- id:\s*$([regex]::Escape($targetId))\s*$").Count -ne 1) {
        throw "The OCI evidence matrix must cover target '$targetId' exactly once."
    }
}
$ociTargetContracts = [ordered]@{
    'api-dotnet' = @('sourceKind: build', 'dockerfile: apps/api-dotnet/Dockerfile', 'target: runtime')
    'legacy-api' = @('sourceKind: build', 'dockerfile: infra/docker/node.Dockerfile', 'target: legacy-api')
    'migration' = @('sourceKind: build', 'dockerfile: infra/docker/node.Dockerfile', 'target: migration')
    'nginx' = @('sourceKind: registry', 'image: nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8')
    'postgres' = @('sourceKind: registry', 'image: postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685')
    'redis' = @('sourceKind: registry', 'image: redis:8.2.1-alpine@sha256:987c376c727652f99625c7d205a1cba3cb2c53b92b0b62aade2bd48ee1593232')
    'web' = @('sourceKind: build', 'dockerfile: infra/docker/node.Dockerfile', 'target: web')
}
foreach ($targetId in $ociTargetContracts.Keys) {
    $targetBlock = [regex]::Match(
        $ociWorkflowText,
        '(?ms)^          - id: ' + [regex]::Escape($targetId) + '\r?$' +
        '(?<body>.*?)(?=^          - id: |^    steps:)')
    if (-not $targetBlock.Success) {
        throw "The OCI evidence matrix is missing the exact block for '$targetId'."
    }
    foreach ($targetContract in $ociTargetContracts[$targetId]) {
        if ([regex]::Matches(
                $targetBlock.Value,
                '(?m)^            ' + [regex]::Escape($targetContract) + '\s*$').Count -ne 1) {
            throw "OCI evidence target '$targetId' is missing contract '$targetContract'."
        }
    }
}
foreach ($requiredOciWorkflowContract in @(
        'uses: docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
        'uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8',
        '--metadata-file ''oci-evidence/${{ matrix.id }}.provenance.json''',
        '--provenance=mode=max',
        'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
        '--source-commit "$GITHUB_SHA"',
        'format: spdx-json',
        'format: json',
        'severity: UNKNOWN,MEDIUM,HIGH,CRITICAL',
        'node scripts/verify-oci-runtime-evidence.mjs "${arguments[@]}"')) {
    if (-not $ociWorkflowText.Contains(
            $requiredOciWorkflowContract,
            [System.StringComparison]::Ordinal)) {
        throw "The OCI evidence job is missing contract '$requiredOciWorkflowContract'."
    }
}
if ([regex]::Matches(
        $ociWorkflowText,
        'uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8').Count -ne 2 -or
    [regex]::Matches($ociWorkflowText, '(?m)^          cache: "false"\s*$').Count -ne 2 -or
    $ociWorkflowText -match '(?mi)^\s*(?:push:\s*true|uses:\s*actions/upload-artifact@)' -or
    $ociWorkflowText -match '(?i)--push(?:\s|$)' -or
    $workflow -notmatch '(?m)^\s*needs:\s*\[core-gate, dotnet-gate, oci-evidence-gate\]\s*$') {
    throw 'OCI evidence must be generated and enforced locally without publishing or bypassing downstream gates.'
}
if (-not (Get-Content -LiteralPath $unitVitestConfigPath -Raw).Contains(
        '"scripts/**/*.test.mjs"',
        [System.StringComparison]::Ordinal)) {
    throw 'The central unit-test configuration must discover the local OCI policy regression.'
}

Assert-ExactObjectProperties -Value $ociTargets -Expected @(
    'schemaVersion',
    'classification',
    'policy',
    'targets'
) -Location 'targets'
Assert-ExactObjectProperties -Value $ociTargets.policy -Expected @(
    'platform',
    'minimumBlockedSeverity',
    'blockUnknownSeverity',
    'maximumEvidenceAgeHours',
    'maximumScannerDatabaseAgeHours',
    'maximumExceptionLifetimeDays',
    'sbomFormat',
    'sbomProfile',
    'sbomSchema',
    'scanFormat',
    'attestationPredicateType'
) -Location 'targets.policy'
Assert-ExactObjectProperties -Value $ociTargets.policy.sbomSchema -Expected @(
    'path',
    'sha256',
    'source',
    'sourceSha256',
    'normalisation'
) -Location 'targets.policy.sbomSchema'
if ($ociTargets.schemaVersion -cne 'shiftflow.oci-targets/v1' -or
    $ociTargets.classification -cne 'LOCAL_UNSIGNED_PRECURSOR' -or
    $ociTargets.policy.platform -cne 'linux/amd64' -or
    $ociTargets.policy.minimumBlockedSeverity -cne 'MEDIUM' -or
    $ociTargets.policy.blockUnknownSeverity -cne $true -or
    $ociTargets.policy.maximumEvidenceAgeHours -ne 24 -or
    $ociTargets.policy.maximumScannerDatabaseAgeHours -ne 24 -or
    $ociTargets.policy.maximumExceptionLifetimeDays -ne 30 -or
    $ociTargets.policy.sbomFormat -cne 'spdx-2.3-json' -or
    $ociTargets.policy.sbomProfile -cne 'shiftflow.spdx-2.3-oci-package-profile/v1' -or
    $ociTargets.policy.sbomSchema.path -cne 'eng/spdx-2.3-schema.json' -or
    $ociTargets.policy.sbomSchema.sha256 -cne 'sha256:3ec6cd5b8ba0c9a3e821da48536fa1b814567dc7e4376efe98d3e7b2a7a8d230' -or
    $ociTargets.policy.sbomSchema.source -cne 'https://raw.githubusercontent.com/spdx/spdx-spec/v2.3/schemas/spdx-schema.json' -or
    $ociTargets.policy.sbomSchema.sourceSha256 -cne 'sha256:239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b' -or
    $ociTargets.policy.sbomSchema.normalisation -cne 'terminal-lf-appended' -or
    $ociTargets.policy.scanFormat -cne 'shiftflow.oci-scan/v1' -or
    $ociTargets.policy.attestationPredicateType -cne 'urn:shiftflow:attestation:oci-supply-chain:v1') {
    throw 'The local OCI policy precursor must preserve its exact fail-closed policy values.'
}
$observedSpdxSchemaHash = 'sha256:' + (Get-FileHash -LiteralPath $ociSpdxSchemaPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($observedSpdxSchemaHash -cne $ociTargets.policy.sbomSchema.sha256 -or
    $package.devDependencies.ajv -cne '6.15.0') {
    throw 'The local OCI policy precursor must pin its exact SPDX 2.3 schema bytes and direct validator dependency.'
}
foreach ($strictAjvOption in @(
        'coerceTypes: false',
        'ownProperties: true',
        'removeAdditional: false',
        'strictDefaults: true',
        'strictKeywords: true',
        'strictNumbers: true',
        'useDefaults: false',
        'validateSchema: true')) {
    if ([regex]::Matches(
            $ociVerifier,
            [regex]::Escape($strictAjvOption)).Count -ne 1) {
        throw "The local OCI policy precursor must compile SPDX with exact Ajv option '$strictAjvOption'."
    }
}
if ($ociVerifier.Contains('unknownFormats:', [System.StringComparison]::Ordinal)) {
    throw 'The local OCI policy precursor must not ignore unknown schema formats.'
}
$byteHashedOciPaths = @(
    'docker-compose[.]yml',
    'apps/api-dotnet/Dockerfile',
    'infra/docker/node[.]Dockerfile',
    'eng/spdx-2[.]3-schema[.]json'
)
foreach ($byteHashedOciPath in $byteHashedOciPaths) {
    if ([regex]::Matches(
            $gitAttributes,
            "(?m)^$byteHashedOciPath text eol=lf\s*$").Count -ne 1) {
        throw 'Every byte-hashed OCI source definition must retain LF bytes on every supported checkout platform.'
    }
}

$expectedOciTargets = @(
    [ordered]@{
        id = 'api-dotnet'; composeService = 'api-dotnet'; sourceKind = 'build'; context = '.'
        dockerfile = 'apps/api-dotnet/Dockerfile'; target = 'runtime'
    },
    [ordered]@{
        id = 'legacy-api'; composeService = 'legacy-api'; sourceKind = 'build'; context = '.'
        dockerfile = 'infra/docker/node.Dockerfile'; target = 'legacy-api'
    },
    [ordered]@{
        id = 'migration'; composeService = 'migrate'; sourceKind = 'build'; context = '.'
        dockerfile = 'infra/docker/node.Dockerfile'; target = 'migration'
    },
    [ordered]@{
        id = 'nginx'; composeService = 'nginx'; sourceKind = 'registry'
        image = 'nginx:1.29.1-alpine@sha256:42a516af16b852e33b7682d5ef8acbd5d13fe08fecadc7ed98605ba5e3b26ab8'
    },
    [ordered]@{
        id = 'postgres'; composeService = 'postgres'; sourceKind = 'registry'
        image = 'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
    },
    [ordered]@{
        id = 'redis'; composeService = 'redis'; sourceKind = 'registry'
        image = 'redis:8.2.1-alpine@sha256:987c376c727652f99625c7d205a1cba3cb2c53b92b0b62aade2bd48ee1593232'
    },
    [ordered]@{
        id = 'web'; composeService = 'web'; sourceKind = 'build'; context = '.'
        dockerfile = 'infra/docker/node.Dockerfile'; target = 'web'
    }
)
$observedOciTargets = @($ociTargets.targets)
if ($observedOciTargets.Count -ne $expectedOciTargets.Count) {
    throw 'The local OCI policy precursor must contain exactly seven image targets.'
}
for ($targetIndex = 0; $targetIndex -lt $expectedOciTargets.Count; $targetIndex++) {
    $expectedTarget = $expectedOciTargets[$targetIndex]
    $observedTarget = $observedOciTargets[$targetIndex]
    Assert-ExactObjectProperties -Value $observedTarget -Expected @($expectedTarget.Keys) -Location "targets[$targetIndex]"
    foreach ($propertyName in $expectedTarget.Keys) {
        $observedValue = [string]$observedTarget.PSObject.Properties[$propertyName].Value
        if ($observedValue -cne [string]$expectedTarget[$propertyName]) {
            throw "The local OCI policy target at index $targetIndex does not match '$propertyName'."
        }
    }
}
Assert-ExactObjectProperties -Value $ociExceptions -Expected @(
    'schemaVersion',
    'exceptions'
) -Location 'exceptions'
if ($ociExceptions.schemaVersion -cne 'shiftflow.oci-cve-exceptions/v1' -or
    $null -eq $ociExceptions.exceptions -or
    $ociExceptions.exceptions -isnot [System.Collections.IList] -or
    @($ociExceptions.exceptions).Count -ne 0) {
    throw 'The tracked local OCI exception register must start empty and use its exact schema.'
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
    'STEP|2|eng/test-agent-contract.ps1',
    'STEP|3|npm run quality',
    'STEP|4|npm run test:unit',
    'STEP|5|npm run build',
    'STEP|6|eng/dotnet.ps1 -SkipRestore -SkipAudit',
    'STEP|7|git diff --check for worktree and index'
)

Assert-Plan -Task 'Full' -Expected @(
    'PLAN|version=1|task=Full|mode=Online|classification=WORKFLOW',
    'STEP|1|eng/ci.ps1 (includes eng/test-agent-contract.ps1)'
)

Assert-Plan -Task 'Full' -Offline -Expected @(
    'PLAN|version=1|task=Full|mode=Offline|classification=INCOMPLETE_NON_GATE',
    'STEP|1|eng/ci.ps1 -Offline (includes eng/test-agent-contract.ps1)'
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
if ($package.scripts.'test:postgres:integration' -cne
    'vitest run --config .config/vitest.postgres.config.ts') {
    throw 'The PostgreSQL integration gate must use its dedicated opt-in Vitest configuration.'
}
if ($package.scripts.'test:postgres:users' -cne 'npm run test:postgres:integration') {
    throw 'The legacy PostgreSQL User script must remain a compatibility alias.'
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

if ([regex]::Matches(
        $quickFunction,
        '(?m)^\s*& \$agentContractPath\s*$').Count -ne 1) {
    throw 'Quick must invoke the project-scoped agent contract exactly once before product checks.'
}

$requiredQuickSteps = @(
    @{
        Name = 'npm quality'
        Pattern = '(?m)^\s*npm run quality\s*$'
    },
    @{
        Name = 'unit tests'
        Pattern = '(?m)^\s*npm run test:unit\s*$'
    },
    @{
        Name = 'application build'
        Pattern = '(?m)^\s*npm run build\s*$'
    },
    @{
        Name = '.NET checks'
        Pattern = '(?m)^\s*& \$dotnetEntrypoint -SkipRestore -SkipAudit\s*$'
    }
)
foreach ($requiredQuickStep in $requiredQuickSteps) {
    if ([regex]::Matches(
            $quickFunction,
            $requiredQuickStep.Pattern).Count -ne 1) {
        throw "Quick must invoke $($requiredQuickStep.Name) exactly once."
    }
}

$quickStepPatterns = @(
    '(?m)^\s*& \$agentContractPath\s*$'
) + @($requiredQuickSteps | ForEach-Object { $_.Pattern })
$quickStepIndexes = @($quickStepPatterns | ForEach-Object {
        [regex]::Match($quickFunction, $_).Index
    })
for ($index = 0; $index -lt ($quickStepIndexes.Count - 1); $index++) {
    if ($quickStepIndexes[$index] -lt 0 -or
        $quickStepIndexes[$index] -ge $quickStepIndexes[$index + 1]) {
        throw 'Quick must run the agent contract, npm quality, unit tests, build and .NET checks in strict order.'
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
if ([regex]::Matches(
        $ciScript,
        '(?m)^\s*& \$agentContractPath\s*$').Count -ne 1) {
    throw 'CI must invoke the project-scoped agent contract exactly once.'
}

$ciScrub = $ciScript.IndexOf(
    'Remove-Item -LiteralPath "Env:$variableName" -ErrorAction SilentlyContinue',
    [System.StringComparison]::Ordinal)
$ciPolicy = $ciScript.IndexOf(
    "& (Join-Path `$PSScriptRoot 'test-development-workflow.ps1')",
    [System.StringComparison]::Ordinal)
$ciAgentContract = $ciScript.IndexOf(
    '& $agentContractPath',
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
    $ciAgentContract -lt 0 -or
    $ciPolicy -lt 0 -or
    $ciInstallBranch -lt 0 -or
    $ciGenerate -lt 0 -or
    $ciDependenciesReady -lt 0 -or
    $ciScrub -gt $ciPreflight -or
    $ciPreflight -gt $ciAgentContract -or
    $ciAgentContract -gt $ciPolicy -or
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
    'security:oci-policy' = 'node scripts/verify-oci-supply-chain.mjs --policy-only --targets eng/oci-targets.json --exceptions eng/oci-cve-exceptions.json'
    'security:oci-evidence' = 'node scripts/verify-oci-runtime-evidence.mjs'
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
    'run: npm run test:postgres:integration',
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
        '(?m)^\s*run:\s*npm run test:postgres:integration\s*$').Count -ne 1 -or
    -not $workflow.Contains('SHIFTFLOW_POSTGRES_INTEGRATION: "1"', [System.StringComparison]::Ordinal) -or
    $remotePostgresIntegration -lt 0 -or
    $remoteIntegrationSeed -lt 0 -or
    $remotePostgresIntegration -lt $remoteMigration -or
    $remotePostgresIntegration -gt $remoteIntegrationSeed) {
    throw 'The disposable runtime must execute the opt-in PostgreSQL integration gate after migrations and before shared seed data.'
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

if ([regex]::Matches($workflow, '(?m)^\s*runs-on:\s*ubuntu-24[.]04\s*$').Count -ne 5 -or
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

$expectedReadinessScenarios = @(
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
$readinessScenarioBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)\$readinessScenarios\s*=\s*@\((?<body>.*?)\r?\n\)')
$fixtureScenarioBlock = [regex]::Match(
    $readinessRuntime,
    '(?s)const scenarios = Object[.]freeze\(\[(?<body>.*?)\r?\n\]\);')
$runtimeReadinessScenarios = @(
    [regex]::Matches($readinessScenarioBlock.Groups['body'].Value, "'(?<name>[a-z-]+)'") |
        ForEach-Object { $_.Groups['name'].Value })
$fixtureReadinessScenarios = @(
    [regex]::Matches($fixtureScenarioBlock.Groups['body'].Value, '"(?<name>[a-z-]+)"') |
        ForEach-Object { $_.Groups['name'].Value })
if (-not $readinessScenarioBlock.Success -or
    -not $fixtureScenarioBlock.Success -or
    ($runtimeReadinessScenarios -join "`n") -cne ($expectedReadinessScenarios -join "`n") -or
    ($fixtureReadinessScenarios -join "`n") -cne ($expectedReadinessScenarios -join "`n")) {
    throw 'The readiness runtime must declare the exact ordered eleven-scenario matrix in both orchestrator and fixture.'
}

$runtimeStackStart = $stranglerRuntime.IndexOf(
    '    docker compose @composeArguments up --detach --build --wait',
    [System.StringComparison]::Ordinal)
$runtimeReadinessCall = $stranglerRuntime.IndexOf(
    '    $readinessMatrixEvidence = Invoke-ReadinessRuntimeMatrix -RunId $readinessRunId',
    [System.StringComparison]::Ordinal)
$runtimeSharedSeed = $stranglerRuntime.IndexOf(
    '    docker compose @composeArguments run --rm --env E2E_EMAIL --env E2E_PASSWORD migrate node prisma/integration-seed.mjs',
    [System.StringComparison]::Ordinal)
$runtimeDatabaseReplacement = $stranglerRuntime.IndexOf(
    '    $env:DATABASE_URL = New-ReadinessDatabaseUrl',
    [System.StringComparison]::Ordinal)
$runtimeFirstStackCleanup = $stranglerRuntime.IndexOf(
    '    docker compose @composeArguments down --volumes --remove-orphans',
    [System.StringComparison]::Ordinal)
if ($runtimeStackStart -lt 0 -or
    $runtimeReadinessCall -lt $runtimeStackStart -or
    $runtimeSharedSeed -lt $runtimeReadinessCall -or
    $runtimeDatabaseReplacement -lt 0 -or
    $runtimeDatabaseReplacement -gt $runtimeFirstStackCleanup -or
    [regex]::Matches(
        $stranglerRuntime,
        '(?m)^    \$readinessMatrixEvidence = Invoke-ReadinessRuntimeMatrix -RunId \$readinessRunId\s*$').Count -ne 1) {
    throw 'The readiness matrix must run exactly once after the healthy ordinary stack and before any seed, using a replaced DATABASE_URL.'
}

foreach ($runtimeReadinessContract in @(
        '[System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)).ToLowerInvariant()',
        "-cnotmatch '^[0-9a-f]{24}`$'",
        "`$env:SHIFTFLOW_DISPOSABLE_RUNTIME = 'CONFIRMED_DISPOSABLE_STRANGLER'",
        '$generatedSecretValues = [System.Collections.Generic.List[string]]::new()',
        '$redactedValues = @($generatedSecretValues)',
        '[void]$generatedSecretValues.Add($generatedSecret)',
        'postgresql://shiftflow:${encodedPassword}@postgres:5432/${DatabaseName}?${query}',
        'schema=active%2Cpublic&options=-csearch_path%3Dactive%2Cpublic',
        "'run', '--rm', '--no-deps'",
        "'--no-TTY'",
        "'migrate', 'node', 'prisma/readiness-runtime.mjs'",
        '--env "DATABASE_URL=$DatabaseUrl"',
        '--detach',
        '--no-deps',
        '--name $ContainerName',
        'ConvertFrom-Json -NoEnumerate -ErrorAction Stop',
        '$outputLines.Count -gt 64',
        '$outputText.Length -gt 12000',
        '$receipts.Count -ne 1',
        '$actualProperties = @($Receipt.PSObject.Properties.Name | Sort-Object)',
        "has missing or extra properties.",
        'contains a malformed JSON receipt.',
        '$templateReceipt = Invoke-ReadinessFixture -Action create-template -RunId $RunId',
        '$scenarioReceipt = Invoke-ReadinessFixture',
        '$probeReceipt = Invoke-ReadinessHostProbe',
        '$validatedScenarioReceipts += 1',
        '$validatedHostReceipts += 1',
        '$validatedScenarioReceipts -ne 11',
        '$validatedHostReceipts -ne 22',
        '$readinessMatrixEvidence.ScenarioReceipts',
        '$readinessMatrixEvidence.HostReceipts',
        'docker logs --tail 200 $verifiedContainerId',
        'docker rm --force $verifiedContainerId',
        'Write-ReadinessSecondaryFailure',
        '$runtimeDiagnostics += @(docker compose @composeArguments logs --no-color --tail 200 2>&1)',
        'Protect-ReadinessDiagnostics',
        'finally {',
        "Assert-NativeSuccess 'Migrate the dedicated readiness template database'",
        "-Action create-scenario",
        "-Action probe")) {
    if (-not $stranglerRuntime.Contains(
            $runtimeReadinessContract,
            [System.StringComparison]::Ordinal)) {
        throw "The strangler readiness matrix is missing contract '$runtimeReadinessContract'."
    }
}
if ([regex]::Matches(
        $stranglerRuntime,
        [regex]::Escape('docker rm --force $verifiedContainerId')).Count -ne 1 -or
    $stranglerRuntime.Contains(
        'docker rm --force $containerName',
        [System.StringComparison]::Ordinal) -or
    $stranglerRuntime.Contains(
        'docker rm --force $candidateContainerId',
        [System.StringComparison]::Ordinal) -or
    $stranglerRuntime.Contains(
        '$callerEnvironment[''DATABASE_URL''].Value',
        [System.StringComparison]::Ordinal)) {
    throw 'The readiness matrix must remove only a verified container ID and must never consume caller DATABASE_URL.'
}
$readinessVerifiedStartBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)function Start-VerifiedReadinessHostContainer \{(?<body>.*?)(?=\r?\nfunction Invoke-ReadinessHostProbe \{)')
$verifiedStartBody = $readinessVerifiedStartBlock.Groups['body'].Value
$verifiedStartCommand = $verifiedStartBody.IndexOf(
    '$startOutput = @(docker compose @composeArguments run',
    [System.StringComparison]::Ordinal)
$verifiedStartExitGate = $verifiedStartBody.IndexOf(
    'if ($startExitCode -ne 0)',
    [System.StringComparison]::Ordinal)
$verifiedStartIdGate = $verifiedStartBody.IndexOf(
    "`$containerIdLines[0] -cnotmatch '^[0-9a-f]{64}`$'",
    [System.StringComparison]::Ordinal)
$verifiedOwnershipInspect = $verifiedStartBody.IndexOf(
    '$ownershipOutput = @(docker inspect',
    [System.StringComparison]::Ordinal)
$verifiedOwnershipGate = $verifiedStartBody.IndexOf(
    '$ownership[0] -cne "/$ContainerName"',
    [System.StringComparison]::Ordinal)
$verifiedIdReturn = $verifiedStartBody.IndexOf(
    'return $candidateContainerId',
    [System.StringComparison]::Ordinal)
if (-not $readinessVerifiedStartBlock.Success -or
    $verifiedStartCommand -lt 0 -or
    $verifiedStartExitGate -lt $verifiedStartCommand -or
    $verifiedStartIdGate -lt $verifiedStartExitGate -or
    $verifiedOwnershipInspect -lt $verifiedStartIdGate -or
    $verifiedOwnershipGate -lt $verifiedOwnershipInspect -or
    $verifiedIdReturn -lt $verifiedOwnershipGate) {
    throw 'A readiness host ID may be returned only after successful start, full-ID validation and ownership inspection.'
}
foreach ($ownershipContract in @(
        'com.docker.compose.project',
        'com.docker.compose.service',
        'com.docker.compose.oneoff',
        '$ownership[1] -cne $ProjectName',
        '$ownership[2] -cne $HostName',
        "`$ownership[3] -cne 'True'")) {
    if (-not $verifiedStartBody.Contains(
            $ownershipContract,
            [System.StringComparison]::Ordinal)) {
        throw "Readiness host ownership validation is missing contract '$ownershipContract'."
    }
}
$readinessHostProbeBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)function Invoke-ReadinessHostProbe \{(?<body>.*?)(?=\r?\nfunction Invoke-ReadinessRuntimeMatrix \{)')
$readinessProbeRethrow = $readinessHostProbeBlock.Groups['body'].Value.IndexOf(
    'throw $probeFailure',
    [System.StringComparison]::Ordinal)
$readinessRemovalRethrow = $readinessHostProbeBlock.Groups['body'].Value.IndexOf(
    'throw $removalFailure',
    [System.StringComparison]::Ordinal)
if (-not $readinessHostProbeBlock.Success -or
    $readinessHostProbeBlock.Groups['body'].Value -notmatch
        '(?s)\$verifiedContainerId = \$null.*try \{.*\$verifiedContainerId = Start-VerifiedReadinessHostContainer.*Invoke-ReadinessFixture.*\} catch \{.*docker logs --tail 200 \$verifiedContainerId.*\} finally \{\s*if \(\$null -ne \$verifiedContainerId\) \{.*docker rm --force \$verifiedContainerId' -or
    $readinessProbeRethrow -lt 0 -or
    $readinessRemovalRethrow -lt 0 -or
    $readinessProbeRethrow -gt $readinessRemovalRethrow) {
    throw 'Each readiness host case must preserve its first failure and remove only a successfully verified ID in finally.'
}
$hostSecondaryFailure = $readinessHostProbeBlock.Groups['body'].Value.IndexOf(
    'Write-ReadinessSecondaryFailure',
    [System.StringComparison]::Ordinal)
if ($hostSecondaryFailure -lt 0 -or
    $hostSecondaryFailure -gt $readinessProbeRethrow) {
    throw 'A host probe failure must remain primary while a removal failure is emitted as bounded secondary evidence.'
}
$readinessFixtureBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)function Invoke-ReadinessFixture \{(?<body>.*?)(?=\r?\nfunction Start-VerifiedReadinessHostContainer \{)')
$fixtureExitGate = $readinessFixtureBlock.Groups['body'].Value.IndexOf(
    'if ($fixtureExitCode -ne 0)',
    [System.StringComparison]::Ordinal)
$fixtureReceiptParse = $readinessFixtureBlock.Groups['body'].Value.IndexOf(
    'return ConvertFrom-ReadinessReceiptOutput',
    [System.StringComparison]::Ordinal)
if (-not $readinessFixtureBlock.Success -or
    $fixtureExitGate -lt 0 -or
    $fixtureReceiptParse -lt $fixtureExitGate) {
    throw 'A fixture receipt may be parsed only after the Compose action exits successfully.'
}
$readinessReceiptAssertionBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)function Assert-ExactReadinessReceipt \{(?<body>.*?)(?=\r?\nfunction ConvertFrom-ReadinessReceiptOutput \{)')
foreach ($receiptContract in @(
        "status = 'created'",
        "action = 'create-template'",
        "action = 'create-scenario'",
        "status = 'verified'",
        "action = 'probe'",
        'database = Get-ReadinessDatabaseName',
        'scenario = $Scenario',
        'host = $HostName',
        'container = Get-ReadinessContainerName',
        '$actualProperties -join "`n"',
        '$expectedProperties -join "`n"')) {
    if (-not $readinessReceiptAssertionBlock.Success -or
        -not $readinessReceiptAssertionBlock.Groups['body'].Value.Contains(
            $receiptContract,
            [System.StringComparison]::Ordinal)) {
        throw "Readiness receipt validation is missing exact contract '$receiptContract'."
    }
}
$readinessMatrixBlock = [regex]::Match(
    $stranglerRuntime,
    '(?s)function Invoke-ReadinessRuntimeMatrix \{(?<body>.*?)(?=\r?\n\}\r?\n\r?\ntry \{)')
$scenarioReceiptPosition = $readinessMatrixBlock.Groups['body'].Value.IndexOf(
    '$scenarioReceipt = Invoke-ReadinessFixture',
    [System.StringComparison]::Ordinal)
$scenarioCountPosition = $readinessMatrixBlock.Groups['body'].Value.IndexOf(
    '$validatedScenarioReceipts += 1',
    [System.StringComparison]::Ordinal)
$hostReceiptPosition = $readinessMatrixBlock.Groups['body'].Value.IndexOf(
    '$probeReceipt = Invoke-ReadinessHostProbe',
    [System.StringComparison]::Ordinal)
$hostCountPosition = $readinessMatrixBlock.Groups['body'].Value.IndexOf(
    '$validatedHostReceipts += 1',
    [System.StringComparison]::Ordinal)
if (-not $readinessMatrixBlock.Success -or
    $scenarioReceiptPosition -lt 0 -or
    $scenarioCountPosition -lt $scenarioReceiptPosition -or
    $hostReceiptPosition -lt 0 -or
    $hostCountPosition -lt $hostReceiptPosition -or
    $stranglerRuntime.Contains(
        'readinessScenarios = $readinessScenarios.Count',
        [System.StringComparison]::Ordinal) -or
    $stranglerRuntime.Contains(
        'readinessHostChecks = $readinessScenarios.Count * $readinessHosts.Count',
        [System.StringComparison]::Ordinal)) {
    throw 'Readiness success totals must be incremented only after validated scenario and host receipts return.'
}
$generatedSecretCapture = $stranglerRuntime.IndexOf(
    '[void]$generatedSecretValues.Add($generatedSecret)',
    [System.StringComparison]::Ordinal)
$environmentRestoration = $stranglerRuntime.IndexOf(
    '$restoredEnvironment = [System.Environment]::GetEnvironmentVariables(',
    [System.StringComparison]::Ordinal)
$outerPrimaryFailure = $stranglerRuntime.IndexOf(
    'if ($null -ne $firstFailure)',
    [System.StringComparison]::Ordinal)
$outerSecondaryFailure = $stranglerRuntime.IndexOf(
    'Write-ReadinessSecondaryFailure',
    $outerPrimaryFailure,
    [System.StringComparison]::Ordinal)
$outerPrimaryRethrow = $stranglerRuntime.IndexOf(
    'throw $firstFailure',
    $outerPrimaryFailure,
    [System.StringComparison]::Ordinal)
if ($generatedSecretCapture -lt 0 -or
    $environmentRestoration -lt $generatedSecretCapture -or
    $outerPrimaryFailure -lt $environmentRestoration -or
    $outerSecondaryFailure -lt $outerPrimaryFailure -or
    $outerPrimaryRethrow -lt $outerSecondaryFailure) {
    throw 'Generated secret redaction must survive restoration and outer secondary failures must be emitted before rethrowing the primary failure.'
}

foreach ($fixtureReadinessContract in @(
        'CONFIRMED_DISPOSABLE_STRANGLER',
        'databaseUrl.protocol !== "postgresql:"',
        'databaseUrl.hostname !== "postgres"',
        'databaseUrl.port !== "5432"',
        'userName !== "shiftflow"',
        'databaseName !== expectedDatabase',
        'databaseUrl.search !== "?schema=public"',
        'databaseUrl.hash !== ""',
        '/^[0-9a-f]{24}$/',
        'GENERATED_DATABASE_PATTERN',
        'GENERATED_CONTAINER_PATTERN',
        'quoteIdentifier',
        'CREATE DATABASE ${quoteGeneratedDatabase(databaseName)} WITH OWNER "shiftflow" TEMPLATE template0',
        'TEMPLATE ${quoteGeneratedDatabase(templateName)}',
        'BEGIN',
        'ROLLBACK',
        '20260903023000_add_authentication_session_observations',
        'authentication_session_observations',
        'refresh_tokens_userId_companyId_sessionKind_expiresAt_revokedAt_idx',
        'refresh_tokens_userId_companyId_sessionKind_familyId_revokedAt_idx',
        'user_role_assignments_active_exact_key',
        'authentication_session_observations_pkey',
        'authentication_session_observations_userId_fkey',
        'authentication_session_observations_companyId_fkey',
        'authentication_session_observations_companyId_sessionKind_observedAt_idx',
        'CREATE SCHEMA "active" AUTHORIZATION "shiftflow"',
        'CREATE VIEW public."audit_logs"',
        'REFERENCES public."companies"("id")',
        'WHERE "deletedAt" IS NOT NULL',
        'ALTER COLUMN "familyId" DROP NOT NULL',
        'ALTER COLUMN "emailHash" TYPE text',
        'const NEGATIVE_CONFIRMATION_SAMPLES = 5;',
        'lastObservation.status === 200',
        'consecutiveMatches += 1',
        'consecutiveMatches = 0',
        'consecutiveMatches >= NEGATIVE_CONFIRMATION_SAMPLES',
        'await confirmNegativeReadiness(baseUrl, host, scenario)',
        'preservePrimaryFailure',
        'new AggregateError(',
        'catch (endError)',
        '"PostgreSQL client shutdown"',
        'catch (rollbackError)',
        '"scenario rollback"',
        '"/health"',
        '"/ready"',
        'READINESS_CHECK_FAILED',
        'checks?.postgresql === "unavailable"',
        'checks?.redis === "available"',
        'checks?.dataProtection === "available"')) {
    if (-not $readinessRuntime.Contains(
            $fixtureReadinessContract,
            [System.StringComparison]::Ordinal)) {
        throw "The guarded readiness fixture is missing contract '$fixtureReadinessContract'."
    }
}
$negativeReadinessBlock = [regex]::Match(
    $readinessRuntime,
    '(?s)async function confirmNegativeReadiness\(.*?\) \{(?<body>.*?)(?=\r?\n\}\r?\n\r?\nasync function probeScenario)')
$negativeReadinessBody = $negativeReadinessBlock.Groups['body'].Value
$negativeHttp200Gate = $negativeReadinessBody.IndexOf(
    'if (lastObservation.status === 200)',
    [System.StringComparison]::Ordinal)
$negativeExpectedMatch = $negativeReadinessBody.IndexOf(
    'if (isExpectedReadiness(lastObservation, host, false))',
    [System.StringComparison]::Ordinal)
$negativeConfirmation = $negativeReadinessBody.IndexOf(
    'consecutiveMatches >= NEGATIVE_CONFIRMATION_SAMPLES',
    [System.StringComparison]::Ordinal)
$negativeReset = $negativeReadinessBody.IndexOf(
    'consecutiveMatches = 0',
    $negativeReadinessBody.IndexOf('} else {', [System.StringComparison]::Ordinal),
    [System.StringComparison]::Ordinal)
if (-not $negativeReadinessBlock.Success -or
    $negativeHttp200Gate -lt 0 -or
    $negativeExpectedMatch -lt $negativeHttp200Gate -or
    $negativeConfirmation -lt $negativeExpectedMatch -or
    $negativeReset -lt $negativeConfirmation) {
    throw 'Negative readiness must reject any post-liveness HTTP 200 before counting five consecutive exact 503 observations and reset on transients.'
}
$probeScenarioBlock = [regex]::Match(
    $readinessRuntime,
    '(?s)async function probeScenario\(.*?\) \{(?<body>.*?)(?=\r?\n\}\r?\n\r?\nfunction sanitiseError)')
$probeHealthPosition = $probeScenarioBlock.Groups['body'].Value.IndexOf(
    '"/health"',
    [System.StringComparison]::Ordinal)
$probeNegativePosition = $probeScenarioBlock.Groups['body'].Value.IndexOf(
    'await confirmNegativeReadiness(baseUrl, host, scenario)',
    [System.StringComparison]::Ordinal)
if (-not $probeScenarioBlock.Success -or
    $probeHealthPosition -lt 0 -or
    $probeNegativePosition -lt $probeHealthPosition) {
    throw 'Every negative readiness confirmation must start only after exact host liveness succeeds.'
}
$withClientBlock = [regex]::Match(
    $readinessRuntime,
    '(?s)async function withClient\(.*?\) \{(?<body>.*?)(?=\r?\n\}\r?\n\r?\nasync function createTemplate)')
$clientPrimaryCapture = $withClientBlock.Groups['body'].Value.IndexOf(
    'primaryError = error',
    [System.StringComparison]::Ordinal)
$clientEndFailure = $withClientBlock.Groups['body'].Value.IndexOf(
    'throw preservePrimaryFailure(primaryError, endError, "PostgreSQL client shutdown")',
    [System.StringComparison]::Ordinal)
$scenarioRollbackFailure = $readinessRuntime.IndexOf(
    'throw preservePrimaryFailure(error, rollbackError, "scenario rollback")',
    [System.StringComparison]::Ordinal)
if (-not $withClientBlock.Success -or
    $clientPrimaryCapture -lt 0 -or
    $clientEndFailure -lt $clientPrimaryCapture -or
    $scenarioRollbackFailure -lt 0) {
    throw 'PostgreSQL rollback and client shutdown failures must retain the first query or mutation failure as primary evidence.'
}
$fixtureEnvironmentReads = @(
    [regex]::Matches($readinessRuntime, 'process[.]env[.](?<name>[A-Z0-9_]+)') |
        ForEach-Object { $_.Groups['name'].Value } |
        Sort-Object -Unique)
if (($fixtureEnvironmentReads -join "`n") -cne "DATABASE_URL`nSHIFTFLOW_DISPOSABLE_RUNTIME" -or
    $readinessRuntime.Contains('dotenv/config', [System.StringComparison]::Ordinal) -or
    $readinessRuntime.Contains('process.argv', [System.StringComparison]::Ordinal) -eq $false -or
    [regex]::Matches(
        $readinessRuntime,
        [regex]::Escape('await waitForObservation(')).Count -ne 2) {
    throw 'The readiness fixture must use only its two controlled environment inputs and probe liveness before readiness.'
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
