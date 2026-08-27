# en-GB: Runs the application build while preserving the caller's generated Next.js metadata state.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nextMetadataPath = Join-Path $repositoryRoot 'apps/web/next-env.d.ts'
$metadataExisted = Test-Path -LiteralPath $nextMetadataPath -PathType Leaf
$metadataBytes = if ($metadataExisted) {
    [System.IO.File]::ReadAllBytes($nextMetadataPath)
}
else {
    $null
}
$metadataLastWriteTimeUtc = if ($metadataExisted) {
    [System.IO.File]::GetLastWriteTimeUtc($nextMetadataPath)
}
else {
    $null
}

function Restore-NextMetadata {
    if ($metadataExisted) {
        [System.IO.File]::WriteAllBytes($nextMetadataPath, $metadataBytes)
        [System.IO.File]::SetLastWriteTimeUtc($nextMetadataPath, $metadataLastWriteTimeUtc)
    }
    elseif (Test-Path -LiteralPath $nextMetadataPath) {
        Remove-Item -LiteralPath $nextMetadataPath -Force
    }
}

Push-Location $repositoryRoot
try {
    npm run build:application
    if ($LASTEXITCODE -ne 0) {
        throw "Application build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    Restore-NextMetadata
}
