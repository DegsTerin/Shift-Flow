# en-GB: Implements the start workflow so Windows operations remain repeatable and observable.
param(
  [switch]$SkipInstall,
  [switch]$SkipSeed,
  [switch]$OpenBrowser,
  [switch]$Attach,
  [switch]$Wait
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $root "dist/runtime"
$pidFile = Join-Path $runtimeDir "shiftflow-pids.json"

. (Join-Path $PSScriptRoot "docker-desktop.ps1")

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Test-IntegrationSeedEnv {
  return -not [string]::IsNullOrWhiteSpace($env:E2E_EMAIL) -and
    -not [string]::IsNullOrWhiteSpace($env:E2E_PASSWORD)
}

function Start-ManagedProcess {
  param(
    [string]$Name,
    [string]$Command,
    [string]$OutLog,
    [string]$ErrLog
  )

  $rootLiteral = "'" + ($root.Path -replace "'", "''") + "'"
  $outLiteral = "'" + ($OutLog -replace "'", "''") + "'"
  $errLiteral = "'" + ($ErrLog -replace "'", "''") + "'"
  $childCommand = "Set-Location -LiteralPath $rootLiteral; cmd.exe /d /s /c `"$Command`" 1> $outLiteral 2> $errLiteral"
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($childCommand))

  $process = Start-Process `
    -FilePath "powershell" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

  Write-Host "$Name started with PID $($process.Id)"
  return @{
    name = $Name
    pid = $process.Id
    command = $Command
    stdout = $OutLog
    stderr = $ErrLog
  }
}

function Wait-ForUrl {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Host "$Name is available at $Url"
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  Write-Warning "$Name did not become available at $Url within ${TimeoutSeconds}s"
}

function Watch-PlatformLogs {
  param(
    [string]$ApiLog,
    [string]$WebLog
  )

  Write-Host ""
  Write-Host "Attached to ShiftFlow logs. Press Ctrl+C to stop API and Web."
  Write-Host "PostgreSQL will remain running. Use npm run stop to stop everything."
  Write-Host ""

  $positions = @{}
  $positions[$ApiLog] = 0
  $positions[$WebLog] = 0

  try {
    while ($true) {
      foreach ($logPath in @($ApiLog, $WebLog)) {
        if (-not (Test-Path $logPath)) {
          continue
        }

        $lines = @(Get-Content -Path $logPath)
        $startAt = [Math]::Min($positions[$logPath], $lines.Count)
        if ($lines.Count -gt $startAt) {
          $lines[$startAt..($lines.Count - 1)]
          $positions[$logPath] = $lines.Count
        }
      }
      Start-Sleep -Milliseconds 750
    }
  } finally {
    Write-Host ""
    Write-Host "Stopping API and Web..."
    & (Join-Path $PSScriptRoot "stop.ps1") -KeepDatabase
  }
}

Set-Location $root

if (-not $SkipInstall -and -not (Test-Path (Join-Path $root "node_modules"))) {
  Invoke-Step "Installing dependencies" { npm ci }
}

Invoke-Step "Starting Docker Desktop" { Start-DockerDesktopMinimized }
Invoke-Step "Starting PostgreSQL" { docker compose up -d postgres }
Invoke-Step "Generating Prisma client" { npm run prisma:generate }
Invoke-Step "Applying database migrations" { npx prisma migrate deploy }

if (-not $SkipSeed) {
  if (Test-IntegrationSeedEnv) {
    Invoke-Step "Seeding integration data" { npm run seed:integration }
    Invoke-Step "Seeding homologation data" { npm run homologation:seed }
  } else {
    Write-Warning "Skipping integration and homologation seeds because E2E_EMAIL and E2E_PASSWORD are not set in the current runtime."
    Write-Warning "Provide them through the shell or CI secrets, or run npm run platform:start -- -SkipSeed when seed data is not needed."
  }
}

if (Test-Path $pidFile) {
  Write-Warning "Existing PID file found at $pidFile. Run npm run platform:stop if old services are still running."
}

$processes = @()
$apiOutLog = Join-Path $runtimeDir "api.out.log"
$apiErrLog = Join-Path $runtimeDir "api.err.log"
$webOutLog = Join-Path $runtimeDir "web.out.log"
$webErrLog = Join-Path $runtimeDir "web.err.log"

$processes += Start-ManagedProcess `
  -Name "api" `
  -Command "node.exe node_modules/tsx/dist/cli.mjs watch apps/api/src/server.ts" `
  -OutLog $apiOutLog `
  -ErrLog $apiErrLog

$processes += Start-ManagedProcess `
  -Name "web" `
  -Command "node.exe node_modules/next/dist/bin/next dev apps/web" `
  -OutLog $webOutLog `
  -ErrLog $webErrLog

$state = @{
  startedAt = (Get-Date).ToString("o")
  root = $root.Path
  processes = $processes
}

$state | ConvertTo-Json -Depth 5 | Set-Content -Path $pidFile -Encoding UTF8

if ($Wait) {
  Wait-ForUrl -Name "API" -Url "http://localhost:3001/health"
  Wait-ForUrl -Name "Web" -Url "http://localhost:3000"
}

if ($OpenBrowser) {
  Start-Process "http://localhost:3000"
}

Write-Host ""
Write-Host "ShiftFlow is running:"
Write-Host "  Web: http://localhost:3000"
Write-Host "  API: http://localhost:3001/health"
Write-Host "  Logs: $runtimeDir"
Write-Host "  Stop: npm run platform:stop"
Write-Host "  Follow logs: Get-Content dist/runtime/api.out.log -Wait"

if ($Attach) {
  Watch-PlatformLogs -ApiLog $apiOutLog -WebLog $webOutLog
}
