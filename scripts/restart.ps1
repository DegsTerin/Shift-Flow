# en-GB: Implements the restart workflow so Windows operations remain repeatable and observable.
param(
  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$KeepDatabase,
  [switch]$OpenBrowser,
  [switch]$Attach,
  [switch]$Wait
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$stopScript = Join-Path $PSScriptRoot "stop.ps1"
$startScript = Join-Path $PSScriptRoot "start.ps1"
. (Join-Path $PSScriptRoot "platform-common.ps1")

Write-Host "Restarting ShiftFlow..."

$startArgs = @{}
if ($SkipInstall) {
  $startArgs.SkipInstall = $true
}
if ($SkipSeed) {
  $startArgs.SkipSeed = $true
}
if ($OpenBrowser) {
  $startArgs.OpenBrowser = $true
}
if ($Attach) {
  $startArgs.Attach = $true
}
if ($Wait) {
  $startArgs.Wait = $true
}

$operationLock = Enter-PlatformOperationLock -RepositoryRoot $root.Path
try {
  & $stopScript -KeepDatabase:$KeepDatabase
  & $startScript @startArgs
} finally {
  Exit-PlatformOperationLock -Lease $operationLock
}
