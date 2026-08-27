# en-GB: Verifies platform-script composition and ownership safeguards without starting services, touching ports or invoking Docker.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$commonPath = Join-Path $repositoryRoot 'scripts/platform-common.ps1'
$stopPath = Join-Path $repositoryRoot 'scripts/stop.ps1'
$restartPath = Join-Path $repositoryRoot 'scripts/restart.ps1'
$cleanPath = Join-Path $repositoryRoot 'scripts/clean-artifacts.ps1'
$startPath = Join-Path $repositoryRoot 'scripts/start.ps1'
$statusPath = Join-Path $repositoryRoot 'scripts/status.ps1'
$dockerPath = Join-Path $repositoryRoot 'scripts/docker-desktop.ps1'
$resetRealisticPath = Join-Path $repositoryRoot 'prisma/reset-realistic.mjs'

. $commonPath
. $dockerPath

function Assert-True {
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

$root = $repositoryRoot
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('test-command'))
$entry = [pscustomobject]@{
  root = $root
  pid = 1234
  processName = 'powershell'
  startTimeUtc = '2026-08-27T12:00:00.0000000Z'
  encodedCommandHash = Get-Sha256Text -Value $encodedCommand
}
$snapshot = [pscustomobject]@{
  ProcessId = 1234
  Name = 'powershell'
  StartTimeUtc = '2026-08-27T12:00:00.0000000Z'
  CommandLine = "powershell -NoProfile -EncodedCommand $encodedCommand"
}

Assert-True -Condition (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root -Snapshot $snapshot) `
  -Message 'A matching managed process was not recognised.'

$wrongRoot = $entry.PSObject.Copy()
$wrongRoot.root = 'C:\Projects\AnotherProject'
Assert-True -Condition (-not (Test-ManagedProcessOwnership -Entry $wrongRoot -RepositoryRoot $root -Snapshot $snapshot)) `
  -Message 'A process from another repository was accepted.'

$reusedPid = $snapshot.PSObject.Copy()
$reusedPid.StartTimeUtc = '2026-08-27T13:00:00.0000000Z'
Assert-True -Condition (-not (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root -Snapshot $reusedPid)) `
  -Message 'A reused PID was accepted.'

$differentCommand = $snapshot.PSObject.Copy()
$differentCommand.CommandLine = 'powershell -NoProfile -EncodedCommand ZGlmZmVyZW50'
Assert-True -Condition (-not (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root -Snapshot $differentCommand)) `
  -Message 'A process with a different launch command was accepted.'

Assert-True -Condition (Test-PathWithinRoot -Path (Join-Path $root 'dist') -RepositoryRoot $root) `
  -Message 'A child path in the repository was rejected.'
Assert-True -Condition (-not (Test-PathWithinRoot -Path "$root-copy\dist" -RepositoryRoot $root)) `
  -Message 'A sibling repository sharing the root prefix was accepted.'

$lockPath = Join-Path ([System.IO.Path]::GetTempPath()) "shiftflow-$([guid]::NewGuid().ToString('N')).lock"
$firstLock = Enter-ExclusiveFileLock -Path $lockPath
try {
  $secondLockRejected = $false
  try {
    $secondLock = Enter-ExclusiveFileLock -Path $lockPath
    $secondLock.Dispose()
  } catch {
    $secondLockRejected = $true
  }
  Assert-True -Condition $secondLockRejected -Message 'A concurrent platform lock was accepted.'
} finally {
  $firstLock.Dispose()
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}

$operationTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) "shiftflow-operation-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $operationTestRoot | Out-Null
$operationLease = Enter-PlatformOperationLock -RepositoryRoot $operationTestRoot
try {
  $nestedLease = Enter-PlatformOperationLock -RepositoryRoot $operationTestRoot
  Assert-True -Condition $operationLease.IsOwner -Message 'The first platform operation did not own its lock.'
  Assert-True -Condition (-not $nestedLease.IsOwner) -Message 'A nested operation was not treated as re-entrant.'

  $externalLeaseRejected = $false
  try {
    $externalLease = Enter-ExclusiveFileLock -Path $operationLease.Path
    $externalLease.Dispose()
  } catch {
    $externalLeaseRejected = $true
  }
  Assert-True -Condition $externalLeaseRejected -Message 'A concurrent platform operation acquired the shared lock.'
  Exit-PlatformOperationLock -Lease $nestedLease
} finally {
  Exit-PlatformOperationLock -Lease $operationLease
  $releasedLease = Enter-ExclusiveFileLock -Path $operationLease.Path
  $releasedLease.Dispose()
  $resolvedOperationRoot = [System.IO.Path]::GetFullPath($operationTestRoot)
  $tempBoundary = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  Assert-True -Condition ($resolvedOperationRoot.StartsWith($tempBoundary, [System.StringComparison]::OrdinalIgnoreCase)) `
    -Message 'The operation-lock test cleanup target escaped the temporary directory.'
  Remove-Item -LiteralPath $resolvedOperationRoot -Recurse -Force -ErrorAction SilentlyContinue
}

foreach ($localEndpoint in @(
    'npipe:////./pipe/dockerDesktopLinuxEngine',
    'unix:///var/run/docker.sock',
    'tcp://127.0.0.1:2375',
    'tcp://[::1]:2375')) {
  Assert-True -Condition (Test-LocalDockerEndpoint -Endpoint $localEndpoint) `
    -Message "A local Docker endpoint was rejected: $localEndpoint"
}
foreach ($remoteEndpoint in @('ssh://host/run/docker.sock', 'tcp://db.example.com:2375')) {
  Assert-True -Condition (-not (Test-LocalDockerEndpoint -Endpoint $remoteEndpoint)) `
    -Message "A remote Docker endpoint was accepted: $remoteEndpoint"
}
Assert-True -Condition (-not (Test-LocalDockerEndpoint -Endpoint 'npipe:////remote-host/pipe/docker_engine')) `
  -Message 'A remote named pipe Docker endpoint was accepted.'

$managedListeners = @(
  [pscustomobject]@{ ProcessId = 2001 },
  [pscustomobject]@{ ProcessId = 2002 }
)
Assert-True -Condition (Test-ListenerOwnership -Listeners $managedListeners -AllowedProcessIds @(2000, 2001, 2002)) `
  -Message 'Managed descendant listeners were rejected.'
$foreignListeners = @($managedListeners + [pscustomobject]@{ ProcessId = 9000 })
Assert-True -Condition (-not (Test-ListenerOwnership -Listeners $foreignListeners -AllowedProcessIds @(2000, 2001, 2002))) `
  -Message 'A foreign listener was accepted as part of the managed process tree.'

$reparseTestRoot = Join-Path ([System.IO.Path]::GetTempPath()) "shiftflow-reparse-$([guid]::NewGuid().ToString('N'))"
$reparseRepository = Join-Path $reparseTestRoot 'repository'
$reparseTarget = Join-Path $reparseRepository 'dist'
$reparseExternal = Join-Path $reparseTestRoot 'external'
$reparseLink = Join-Path $reparseTarget 'linked-directory'
New-Item -ItemType Directory -Force -Path $reparseTarget, $reparseExternal | Out-Null
try {
  $reparseItemType = if (
    [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
  ) {
    'Junction'
  } else {
    'SymbolicLink'
  }
  New-Item -ItemType $reparseItemType -Path $reparseLink -Target $reparseExternal | Out-Null
  $reparseRejected = $false
  try {
    Assert-NoReparsePointsInTree -Path $reparseTarget -RepositoryRoot $reparseRepository
  } catch {
    $reparseRejected = $true
  }
  Assert-True -Condition $reparseRejected -Message 'A descendant reparse point was not rejected.'
} finally {
  if (Test-Path -LiteralPath $reparseLink) {
    Remove-Item -LiteralPath $reparseLink -Force
  }
  $resolvedReparseRoot = [System.IO.Path]::GetFullPath($reparseTestRoot)
  $tempBoundary = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  Assert-True -Condition ($resolvedReparseRoot.StartsWith($tempBoundary, [System.StringComparison]::OrdinalIgnoreCase)) `
    -Message 'The reparse test cleanup target escaped the temporary directory.'
  Remove-Item -LiteralPath $resolvedReparseRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$stopScript = Get-Content -LiteralPath $stopPath -Raw
$restartScript = Get-Content -LiteralPath $restartPath -Raw
$cleanScript = Get-Content -LiteralPath $cleanPath -Raw
$startScript = Get-Content -LiteralPath $startPath -Raw
$statusScript = Get-Content -LiteralPath $statusPath -Raw
$resetRealisticScript = Get-Content -LiteralPath $resetRealisticPath -Raw

Assert-True -Condition ($stopScript -notmatch '(?mi)^\s*exit(?:\s|$)') `
  -Message 'stop.ps1 must remain composable and cannot terminate its caller.'
Assert-True -Condition ($stopScript -notmatch 'Stop-ShiftFlowPorts|Stop-DockerDesktop') `
  -Message 'stop.ps1 must not use ports or Docker Desktop as destructive authority.'
Assert-True -Condition ($restartScript -match '\[switch\]\$KeepDatabase') `
  -Message 'restart.ps1 must expose the documented KeepDatabase switch.'
Assert-True -Condition ($cleanScript -notmatch 'Get-CimInstance|Stop-Process') `
  -Message 'Artifact cleanup must not discover or terminate processes.'
Assert-True -Condition ($cleanScript -match 'Assert-NoReparsePointsInTree' -and
    $cleanScript -match 'Assert-PlatformInactiveForCleanup') `
  -Message 'Artifact cleanup must reject reparse trees and active or unverified runtimes.'
foreach ($operationScript in @($startScript, $stopScript, $restartScript, $cleanScript)) {
  Assert-True -Condition ($operationScript -match 'Enter-PlatformOperationLock') `
    -Message 'Every mutating platform workflow must acquire the shared operation lock.'
}
Assert-True -Condition ($statusScript -match '\[switch\]\$RequireReady' -and
    $statusScript -match "'degraded'" -and
    $statusScript -match 'Test-PortOwnedByManagedEntry') `
  -Message 'Platform status must expose an automation-ready check and a degraded disposition.'
Assert-True -Condition ($startScript -match 'Test-PortOwnedByManagedEntry' -and
    $startScript -match "ExpectedService 'shiftflow-api'") `
  -Message 'Platform start readiness must bind listeners and API identity to managed processes.'
Assert-True -Condition ($resetRealisticScript -match 'process\.execPath' -and $resetRealisticScript -notmatch 'npx') `
  -Message 'The realistic reset must use the locked Prisma CLI through Node without npx or a shell.'

Write-Output 'All platform workflow policy tests passed.'
