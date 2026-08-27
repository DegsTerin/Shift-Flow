# en-GB: Implements the stop workflow so Windows operations remain repeatable and observable.
param(
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $root "dist/runtime"
$pidFile = Join-Path $runtimeDir "shiftflow-pids.json"

. (Join-Path $PSScriptRoot "docker-desktop.ps1")
. (Join-Path $PSScriptRoot "platform-common.ps1")

function Invoke-PlatformStop {
Set-Location $root

$managedProcessDisposition = 'unknown'
$databaseDisposition = if ($KeepDatabase) { 'kept' } else { 'unverified' }

if (Test-Path $pidFile) {
  $state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  $stateRoot = Get-CanonicalPath -Path ([string]$state.root)
  if (-not $stateRoot.Equals($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Runtime state belongs to a different repository: $stateRoot"
  }

  foreach ($entry in $state.processes) {
    $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$entry.pid)
    if (-not $snapshot) {
      Write-Host "$($entry.name) with PID $($entry.pid) is not running"
      continue
    }
    if (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root.Path -Snapshot $snapshot) {
      Write-Host "Stopping $($entry.name) with PID $($entry.pid)"
      Stop-VerifiedProcessTree -ProcessId ([int]$entry.pid)
    } else {
      throw "Refusing to stop PID $($entry.pid): runtime ownership could not be verified."
    }
  }

  Remove-Item -LiteralPath $pidFile -Force
  $managedProcessDisposition = 'stopped'
} else {
  Write-Warning "PID file not found at $pidFile. No process will be stopped without ownership evidence."
}

if (-not $KeepDatabase) {
  Assert-LocalDockerEnvironment
  if (Test-DockerDaemon) {
    Write-Host "Stopping the ShiftFlow PostgreSQL Compose service"
    Invoke-ShiftFlowCompose `
      -RepositoryRoot $root.Path `
      -Arguments @('stop', '--timeout', '5', 'postgres')
    $databaseDisposition = 'stopped'
  } else {
    Write-Host "Docker daemon is unavailable; the PostgreSQL service state was not changed or verified."
  }
}

Write-Host "ShiftFlow managed process disposition: $managedProcessDisposition"
Write-Host "ShiftFlow PostgreSQL disposition: $databaseDisposition"
}

$operationLock = Enter-PlatformOperationLock -RepositoryRoot $root.Path
try {
  Invoke-PlatformStop
} finally {
  Exit-PlatformOperationLock -Lease $operationLock
}
