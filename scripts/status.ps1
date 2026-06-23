$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $root "dist/runtime"
$pidFile = Join-Path $runtimeDir "shiftflow-pids.json"

Set-Location $root

Write-Host "ShiftFlow status"
Write-Host "Root: $($root.Path)"

if (Test-Path $pidFile) {
  $state = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
  Write-Host "Started at: $($state.startedAt)"

  foreach ($entry in $state.processes) {
    $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    $status = if ($process) { "running" } else { "stopped" }
    Write-Host "$($entry.name): $status (PID $($entry.pid))"
  }
} else {
  Write-Host "PID file: not found"
}

foreach ($port in @(3000, 3001)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  if ($listeners) {
    foreach ($processId in $listeners) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $name = if ($process) { $process.ProcessName } else { "unknown" }
      Write-Host "Port ${port}: listening (PID $processId, $name)"
    }
  } else {
    Write-Host "Port ${port}: free"
  }
}

Write-Host "Logs: $runtimeDir"
