# en-GB: Runs the locked .NET restore, dependency audit, formatting, build and tests as one fail-closed component gate.
[CmdletBinding()]
param(
    [switch]$Offline,

    [switch]$SkipRestore,

    [switch]$SkipAudit
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$solutionPath = Join-Path $repositoryRoot 'apps/api-dotnet/ShiftFlow.slnx'

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

function Get-VulnerabilityCount {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value -or $Value -is [string]) {
        return 0
    }

    if ($Value -is [System.Collections.IDictionary]) {
        $count = 0
        foreach ($entry in $Value.GetEnumerator()) {
            if ([string]$entry.Key -ceq 'vulnerabilities') {
                $count += @($entry.Value).Count
            }
            else {
                $count += Get-VulnerabilityCount -Value $entry.Value
            }
        }
        return $count
    }

    if ($Value -is [System.Collections.IEnumerable]) {
        $count = 0
        foreach ($entry in $Value) {
            $count += Get-VulnerabilityCount -Value $entry
        }
        return $count
    }

    return 0
}

Push-Location $repositoryRoot
try {
    if (-not $SkipRestore) {
        dotnet restore $solutionPath --locked-mode
        Assert-LastExitCode -Operation 'Locked .NET restore'
    }

    if ($SkipAudit) {
        Write-Output 'NOT_RUN: .NET dependency audit was intentionally omitted from development feedback.'
    }
    elseif ($Offline) {
        Write-Output 'NOT_RUN: .NET dependency audit requires online NuGet advisory metadata.'
    }
    else {
        $auditOutput = @(
            & dotnet package list `
                --project $solutionPath `
                --vulnerable `
                --include-transitive `
                --format json `
                --no-restore)
        Assert-LastExitCode -Operation '.NET dependency audit'
        try {
            $audit = ($auditOutput -join [System.Environment]::NewLine) |
                ConvertFrom-Json -AsHashtable -Depth 100
        }
        catch {
            throw ".NET dependency audit returned malformed JSON: $($_.Exception.Message)"
        }
        $vulnerabilityCount = Get-VulnerabilityCount -Value $audit
        if ($vulnerabilityCount -ne 0) {
            throw ".NET dependency audit found $vulnerabilityCount vulnerable package reference(s)."
        }
        Write-Output 'PASS: .NET dependency audit found no vulnerable direct or transitive packages.'
    }

    dotnet format $solutionPath --verify-no-changes --no-restore
    Assert-LastExitCode -Operation '.NET formatting verification'
    dotnet build $solutionPath --configuration Release --no-restore
    Assert-LastExitCode -Operation '.NET release build'
    dotnet test $solutionPath --configuration Release --no-build --no-restore
    Assert-LastExitCode -Operation '.NET tests'
}
finally {
    Pop-Location
}
