# en-GB: Implements the clean artifacts workflow so Windows operations remain repeatable and observable.
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$targets = @(
  (Join-Path $root "apps/web/.next"),
  (Join-Path $root "dist")
)

. (Join-Path $PSScriptRoot "platform-common.ps1")

function Assert-PlatformInactiveForCleanup {
  $pidFile = Join-Path $root 'dist/runtime/shiftflow-pids.json'
  if (Test-Path -LiteralPath $pidFile) {
    try {
      $state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    } catch {
      throw "Runtime ownership state could not be verified at $pidFile. Run npm run platform:stop before cleaning."
    }

    if ($state.PSObject.Properties.Name -notcontains 'root' -or
        $state.PSObject.Properties.Name -notcontains 'processes') {
      throw "Runtime ownership state is incomplete at $pidFile. Run npm run platform:stop before cleaning."
    }
    $recordedProcesses = @($state.processes)
    if ($recordedProcesses.Count -eq 0) {
      throw "Runtime ownership state has no verifiable processes at $pidFile. Run npm run platform:stop before cleaning."
    }
    $stateRoot = Get-CanonicalPath -Path ([string]$state.root)
    if (-not $stateRoot.Equals($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Runtime state belongs to a different repository: $stateRoot"
    }

    foreach ($entry in $recordedProcesses) {
      $requiredProperties = @('root', 'pid', 'processName', 'startTimeUtc', 'encodedCommandHash')
      if ($requiredProperties.Where({ $entry.PSObject.Properties.Name -notcontains $_ }).Count -gt 0) {
        throw "Runtime ownership state contains an incomplete process entry. Cleanup was not started."
      }
      $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$entry.pid)
      if (-not $snapshot) {
        continue
      }
      if (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root.Path -Snapshot $snapshot) {
        throw "ShiftFlow is still running with PID $($entry.pid). Run npm run platform:stop before cleaning."
      }
      throw "PID $($entry.pid) is active but runtime ownership cannot be verified. Cleanup was not started."
    }
  }

  $listeners = Get-PortListeners -Ports @(3000, 3001)
  if ($listeners.Count -gt 0) {
    $details = $listeners |
      ForEach-Object { "port $($_.Port) (PID $($_.ProcessId), $($_.ProcessName))" }
    throw "Required ShiftFlow ports are active: $($details -join '; '). Cleanup was not started."
  }
}

function Invoke-ArtifactCleanup {
  Assert-PlatformInactiveForCleanup

  $existingTargets = @(
    foreach ($target in $targets) {
      $item = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
      if ($item) {
        $item
      }
    }
  )

  foreach ($item in $existingTargets) {
    Assert-NoReparsePointsInTree -Path $item.FullName -RepositoryRoot $root.Path
  }

  foreach ($item in $existingTargets) {
    $path = Get-CanonicalPath -Path $item.FullName
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Host "Removed $path"
  }
}

$operationLock = Enter-PlatformOperationLock -RepositoryRoot $root.Path
try {
  Invoke-ArtifactCleanup
} finally {
  Exit-PlatformOperationLock -Lease $operationLock
}
