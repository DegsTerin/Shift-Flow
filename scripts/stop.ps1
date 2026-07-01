param(
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $root "dist/runtime"
$pidFile = Join-Path $runtimeDir "shiftflow-pids.json"

. (Join-Path $PSScriptRoot "docker-desktop.ps1")

Set-Location $root

function Stop-ProcessTree {
  param(
    [int]$ProcessId
  )

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-ShiftFlowPorts {
  foreach ($port in @(3000, 3001)) {
    $processIds = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -gt 0 } |
      Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Write-Host "Stopping PID $($process.Id) on port $port"
        Stop-ProcessTree -ProcessId $process.Id
      }
    }
  }
}

if (Test-Path $pidFile) {
  $state = Get-Content -Path $pidFile -Raw | ConvertFrom-Json

  foreach ($entry in $state.processes) {
    $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if ($process) {
      Write-Host "Stopping $($entry.name) with PID $($entry.pid)"
      Stop-ProcessTree -ProcessId $entry.pid
    } else {
      Write-Host "$($entry.name) with PID $($entry.pid) is not running"
    }
  }

  Remove-Item -Path $pidFile -Force
} else {
  Write-Warning "PID file not found at $pidFile. Attempting to stop common ShiftFlow dev ports."
}

Stop-ShiftFlowPorts

if (-not $KeepDatabase) {
  Write-Host "Starting Docker Desktop if needed"
  Start-DockerDesktopMinimized
  Write-Host "Stopping PostgreSQL container"
  docker compose stop --timeout 5 postgres
  Stop-DockerDesktop
}

Write-Host "ShiftFlow stopped."
exit 0
