# en-GB: Validates the project-scoped Codex agent pool and its segregation of duties without invoking agents.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configPath = Join-Path $repositoryRoot '.codex/config.toml'
$agentsPath = Join-Path $repositoryRoot '.codex/agents'
$allowedModel = 'gpt-5.6-sol'
$forbiddenModel = 'gpt-5.3-codex-spark'
$expectedMaximumConcurrency = 3

$expectedAgents = [ordered]@{
    'shift-scout' = [ordered]@{
        File = 'shift-scout.toml'
        Sandbox = 'read-only'
        Required = @(
            'Shift Scout',
            'READ-ONLY ROLE',
            'Do not modify files',
            'normalise the finding and search for duplicates'
        )
    }
    'shift-implementer' = [ordered]@{
        File = 'shift-implementer.toml'
        Sandbox = 'workspace-write'
        Required = @(
            'Shift Implementer',
            'SOLE CANDIDATE WRITER',
            'Modify only the exclusive write set',
            'Never approve or verify your own candidate',
            'preserve the first factual PASS or FAIL without a blind retry'
        )
    }
    'shift-verifier' = [ordered]@{
        File = 'shift-verifier.toml'
        Sandbox = 'read-only'
        Required = @(
            'Shift Verifier',
            'INDEPENDENT READ-ONLY ROLE',
            'identity must differ from the implementer',
            'Missing, stale, partial, not-run or contradictory evidence is not a pass'
        )
    }
    'shift-security-reviewer' = [ordered]@{
        File = 'shift-security-reviewer.toml'
        Sandbox = 'read-only'
        Required = @(
            'Shift Security Reviewer',
            'INDEPENDENT READ-ONLY ROLE',
            'identity must differ from the implementer and ordinary verifier',
            'authentication, authorisation, tenant isolation'
        )
    }
}

function Assert-Contract {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,

        [Parameter(Mandatory)]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Assert-ExactRegex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$Content,

        [Parameter(Mandatory)]
        [string]$Pattern
    )

    $count = [regex]::Matches($Content, $Pattern).Count
    if ($count -ne 1) {
        throw "$Name must contain exactly one contract matching '$Pattern'; found $count."
    }
}

function Get-TomlSection {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Content,

        [Parameter(Mandatory)]
        [string]$Name
    )

    $matches = [regex]::Matches(
        $Content,
        '(?ms)^\[' + [regex]::Escape($Name) + '\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
    if ($matches.Count -ne 1) {
        throw "Codex configuration must contain exactly one [$Name] section; found $($matches.Count)."
    }

    return $matches[0].Groups['body'].Value
}

Assert-Contract `
    -Condition (Test-Path -LiteralPath $configPath -PathType Leaf) `
    -Message "Project Codex configuration is missing: $configPath"
Assert-Contract `
    -Condition (Test-Path -LiteralPath $agentsPath -PathType Container) `
    -Message "Project Codex agent directory is missing: $agentsPath"

$config = Get-Content -LiteralPath $configPath -Raw
$agentsSection = Get-TomlSection -Content $config -Name 'agents'
Assert-ExactRegex -Name 'Project model' -Content $config -Pattern '(?m)^model\s*=\s*"gpt-5[.]6-sol"\s*$'
Assert-ExactRegex -Name 'Root approval policy' -Content $config -Pattern '(?m)^approval_policy\s*=\s*"never"\s*$'
Assert-ExactRegex -Name 'Root sandbox' -Content $config -Pattern '(?m)^sandbox_mode\s*=\s*"workspace-write"\s*$'
Assert-ExactRegex -Name 'Agent enablement' -Content $agentsSection -Pattern '(?m)^enabled\s*=\s*true\s*$'
Assert-ExactRegex -Name 'Agent interrupt delivery' -Content $agentsSection -Pattern '(?m)^interrupt_message\s*=\s*true\s*$'
Assert-ExactRegex `
    -Name 'Agent concurrency' `
    -Content $agentsSection `
    -Pattern ('(?m)^max_concurrent_threads_per_session\s*=\s*' + $expectedMaximumConcurrency + '\s*$')

$registeredAgents = @(
    [regex]::Matches($config, '(?m)^\[agents[.](?<name>[a-z0-9-]+)\]\s*$') |
        ForEach-Object { $_.Groups['name'].Value } |
        Sort-Object)
$expectedAgentNames = @($expectedAgents.Keys | Sort-Object)
Assert-Contract `
    -Condition (@(Compare-Object $expectedAgentNames $registeredAgents).Count -eq 0) `
    -Message 'The registered Codex agent set must contain exactly scout, implementer, verifier and security reviewer.'

$actualAgentFiles = @(
    Get-ChildItem -LiteralPath $agentsPath -File -Filter '*.toml' |
        ForEach-Object { $_.Name } |
        Sort-Object)
$expectedAgentFiles = @(
    $expectedAgents.Values |
        ForEach-Object { $_.File } |
        Sort-Object)
Assert-Contract `
    -Condition (@(Compare-Object $expectedAgentFiles $actualAgentFiles).Count -eq 0) `
    -Message 'The Codex agent directory contains an unexpected or missing TOML role file.'

$workspaceWriters = 0
foreach ($agentName in $expectedAgents.Keys) {
    $definition = $expectedAgents[$agentName]
    $section = Get-TomlSection -Content $config -Name "agents.$agentName"
    Assert-ExactRegex `
        -Name "$agentName description" `
        -Content $section `
        -Pattern '(?m)^description\s*=\s*"[^"\r\n]+"\s*$'
    Assert-ExactRegex `
        -Name "$agentName config path" `
        -Content $section `
        -Pattern ('(?m)^config_file\s*=\s*"agents/' + [regex]::Escape($definition.File) + '"\s*$')

    $agentPath = Join-Path $agentsPath $definition.File
    Assert-Contract `
        -Condition (Test-Path -LiteralPath $agentPath -PathType Leaf) `
        -Message "Agent role file is missing: $agentPath"
    $agent = Get-Content -LiteralPath $agentPath -Raw
    Assert-ExactRegex -Name "$agentName model" -Content $agent -Pattern '(?m)^model\s*=\s*"gpt-5[.]6-sol"\s*$'
    Assert-ExactRegex -Name "$agentName approval policy" -Content $agent -Pattern '(?m)^approval_policy\s*=\s*"never"\s*$'
    Assert-ExactRegex `
        -Name "$agentName sandbox" `
        -Content $agent `
        -Pattern ('(?m)^sandbox_mode\s*=\s*"' + [regex]::Escape($definition.Sandbox) + '"\s*$')
    Assert-ExactRegex `
        -Name "$agentName instructions" `
        -Content $agent `
        -Pattern '(?ms)^developer_instructions\s*=\s*"""\r?\n.+\r?\n"""\s*$'

    if ($definition.Sandbox -ceq 'workspace-write') {
        $workspaceWriters += 1
    }

    foreach ($requiredLiteral in @(
            $definition.Required + @(
                'The coordinating root is the sole integrator',
                'Stop conditions:',
                'Only gpt-5.6-sol is permitted',
                'Never select, inherit, dispatch to or fall back to gpt-5.3-codex-spark',
                'P0 findings:',
                'P1 findings:',
                'P2 findings:',
                'P3 findings:',
                'Integration recommendation: CANDIDATE | NOT_CANDIDATE'
            ))) {
        Assert-Contract `
            -Condition $agent.Contains($requiredLiteral, [System.StringComparison]::Ordinal) `
            -Message "$agentName is missing required role contract '$requiredLiteral'."
    }
}

Assert-Contract `
    -Condition ($workspaceWriters -eq 1) `
    -Message "Exactly one subagent must have workspace-write access; found $workspaceWriters."

$allConfigurationPaths = @($configPath) + @(
    $expectedAgents.Values | ForEach-Object { Join-Path $agentsPath $_.File })
foreach ($configurationPath in $allConfigurationPaths) {
    $configuration = Get-Content -LiteralPath $configurationPath -Raw
    $modelAssignments = [regex]::Matches(
        $configuration,
        '(?m)^model\s*=\s*"(?<model>[^"\r\n]+)"\s*$')
    Assert-Contract `
        -Condition ($modelAssignments.Count -eq 1) `
        -Message "$configurationPath must set exactly one explicit model."
    Assert-Contract `
        -Condition ($modelAssignments[0].Groups['model'].Value -ceq $allowedModel) `
        -Message "$configurationPath selects a model outside the allowed fail-closed boundary."
    Assert-Contract `
        -Condition ($modelAssignments[0].Groups['model'].Value -cne $forbiddenModel) `
        -Message "$configurationPath selects the prohibited model."
}

Write-Output "AGENT_CONTRACT_PASS|roles=$($expectedAgents.Count)|workspace_writers=$workspaceWriters|max_concurrent=$expectedMaximumConcurrency|model=$allowedModel|integrator=root"
