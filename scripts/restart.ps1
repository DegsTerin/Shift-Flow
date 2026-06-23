param(
  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$OpenBrowser,
  [switch]$KeepDatabase,
  [switch]$Attach,
  [switch]$Wait
)

$ErrorActionPreference = "Stop"

$stopScript = Join-Path $PSScriptRoot "stop.ps1"
$startScript = Join-Path $PSScriptRoot "start.ps1"

Write-Host "Restarting ShiftFlow..."

$stopArgs = @()
if ($KeepDatabase) {
  $stopArgs += "-KeepDatabase"
}

& $stopScript @stopArgs

$startArgs = @()
if ($SkipInstall) {
  $startArgs += "-SkipInstall"
}
if ($SkipSeed) {
  $startArgs += "-SkipSeed"
}
if ($OpenBrowser) {
  $startArgs += "-OpenBrowser"
}
if ($Attach) {
  $startArgs += "-Attach"
}
if ($Wait) {
  $startArgs += "-Wait"
}

& $startScript @startArgs
