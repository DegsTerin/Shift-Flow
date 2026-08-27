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
. (Join-Path $PSScriptRoot "platform-common.ps1")

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

  $process.Refresh()
  $startTimeUtc = $process.StartTime.ToUniversalTime().ToString('o')

  Write-Host "$Name started with PID $($process.Id)"
  return @{
    name = $Name
    pid = $process.Id
    root = $root.Path
    processName = $process.ProcessName
    startTimeUtc = $startTimeUtc
    encodedCommandHash = Get-Sha256Text -Value $encodedCommand
    command = $Command
    stdout = $OutLog
    stderr = $ErrLog
  }
}

function Wait-ForUrl {
  param(
    [string]$Name,
    [string]$Url,
    [object]$ManagedEntry,
    [int]$Port,
    [string]$ExpectedService,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      if (Test-PortOwnedByManagedEntry `
          -Entry $ManagedEntry `
          -RepositoryRoot $root.Path `
          -Port $Port) {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        $serviceMatches = $true
        if (-not [string]::IsNullOrWhiteSpace($ExpectedService)) {
          $payload = $response.Content | ConvertFrom-Json
          $serviceMatches = [string]$payload.service -eq $ExpectedService
        }
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400 -and $serviceMatches) {
          Write-Host "$Name is available at $Url with verified process ownership"
          return
        }
      }
    } catch {}
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "$Name did not become available from the managed ShiftFlow process at $Url within ${TimeoutSeconds}s."
}

function Watch-PlatformLogs {
  param(
    [string]$ApiLog,
    [string]$WebLog
  )

  Write-Host ""
  Write-Host "Attached to ShiftFlow logs. Press Ctrl+C to stop API and Web."
  Write-Host "PostgreSQL will remain running. Use npm run platform:stop to stop everything."
  Write-Host ""

  $readers = @{}

  try {
    while ($true) {
      foreach ($logPath in @($ApiLog, $WebLog)) {
        if (-not (Test-Path $logPath)) {
          continue
        }

        if (-not $readers.ContainsKey($logPath)) {
          $stream = [System.IO.File]::Open(
            $logPath,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
          )
          $readers[$logPath] = [System.IO.StreamReader]::new($stream)
        }

        while (-not $readers[$logPath].EndOfStream) {
          $readers[$logPath].ReadLine()
        }
      }
      Start-Sleep -Milliseconds 750
    }
  } finally {
    foreach ($reader in $readers.Values) {
      $reader.Dispose()
    }
    Write-Host ""
    Write-Host "Stopping API and Web..."
    & (Join-Path $PSScriptRoot "stop.ps1") -KeepDatabase
  }
}

function Assert-PlatformCanStart {
  if (Test-Path -LiteralPath $pidFile) {
    $state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $stateRoot = Get-CanonicalPath -Path ([string]$state.root)
    if (-not $stateRoot.Equals($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Runtime state belongs to a different repository: $stateRoot"
    }

    foreach ($entry in $state.processes) {
      $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$entry.pid)
      if (-not $snapshot) {
        continue
      }
      if (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root.Path -Snapshot $snapshot) {
        throw "ShiftFlow is already running with PID $($entry.pid). Run npm run platform:stop first."
      }
      throw "PID $($entry.pid) from the runtime state is active but ownership cannot be verified."
    }

    Remove-Item -LiteralPath $pidFile -Force
    Write-Host "Removed stale ShiftFlow runtime state."
  }

  $listeners = Get-PortListeners -Ports @(3000, 3001)
  if ($listeners.Count -gt 0) {
    $details = $listeners |
      ForEach-Object { "port $($_.Port) (PID $($_.ProcessId), $($_.ProcessName))" }
    throw "Required ShiftFlow ports are occupied: $($details -join '; '). No process was stopped."
  }
}

function Stop-PartialLaunch {
  param(
    [object[]]$Entries
  )

  $cleanupComplete = $true
  for ($index = $Entries.Count - 1; $index -ge 0; $index--) {
    $entry = $Entries[$index]
    $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$entry.pid)
    if (-not $snapshot) {
      continue
    }
    if (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root.Path -Snapshot $snapshot) {
      Stop-VerifiedProcessTree -ProcessId ([int]$entry.pid)
    } else {
      $cleanupComplete = $false
      Write-Warning "Partial launch PID $($entry.pid) remains active because ownership could not be verified."
    }
  }

  if ($cleanupComplete -and (Test-Path -LiteralPath $pidFile)) {
    Remove-Item -LiteralPath $pidFile -Force
  }
}

function Invoke-PlatformStart {
Set-Location $root

Assert-PlatformCanStart

if (-not $SkipInstall -and -not (Test-Path (Join-Path $root "node_modules"))) {
  Invoke-Step "Installing dependencies" { npm ci }
}

Invoke-Step "Starting Docker Desktop" { Start-DockerDesktopMinimized }
Invoke-Step "Starting PostgreSQL" {
  Invoke-ShiftFlowCompose -RepositoryRoot $root.Path -Arguments @('up', '-d', 'postgres')
}
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

$processes = @()
$apiOutLog = Join-Path $runtimeDir "api.out.log"
$apiErrLog = Join-Path $runtimeDir "api.err.log"
$webOutLog = Join-Path $runtimeDir "web.out.log"
$webErrLog = Join-Path $runtimeDir "web.err.log"

$startedAt = (Get-Date).ToString('o')
$state = @{
  state = 'starting'
  startedAt = $startedAt
  root = $root.Path
  processes = $processes
}

try {
  $processes += Start-ManagedProcess `
    -Name "api" `
    -Command "node.exe node_modules/tsx/dist/cli.mjs watch apps/api/src/server.ts" `
    -OutLog $apiOutLog `
    -ErrLog $apiErrLog
  $state.processes = $processes
  Write-PlatformState -Path $pidFile -State $state

  $processes += Start-ManagedProcess `
    -Name "web" `
    -Command "node.exe node_modules/next/dist/bin/next dev apps/web" `
    -OutLog $webOutLog `
    -ErrLog $webErrLog
  $state.processes = $processes
  Write-PlatformState -Path $pidFile -State $state

  if ($Wait) {
    $apiEntry = @($processes | Where-Object { $_.name -eq 'api' })[0]
    $webEntry = @($processes | Where-Object { $_.name -eq 'web' })[0]
    Wait-ForUrl `
      -Name "API readiness" `
      -Url "http://localhost:3001/ready" `
      -ManagedEntry $apiEntry `
      -Port 3001 `
      -ExpectedService 'shiftflow-api'
    Wait-ForUrl `
      -Name "Web" `
      -Url "http://localhost:3000" `
      -ManagedEntry $webEntry `
      -Port 3000
    $state.state = 'ready'
    $state.readyAt = (Get-Date).ToString('o')
  } else {
    $state.state = 'started'
  }
  Write-PlatformState -Path $pidFile -State $state
} catch {
  Stop-PartialLaunch -Entries $processes
  throw
}

if ($OpenBrowser) {
  Start-Process "http://localhost:3000"
}

Write-Host ""
$runtimeStatus = if ($Wait) {
  "and are ready"
} else {
  "but readiness was not requested; use -Wait or npm run platform:status to verify it"
}
Write-Host "ShiftFlow processes started $runtimeStatus`:"
Write-Host "  Web: http://localhost:3000"
Write-Host "  API: http://localhost:3001/health"
Write-Host "  Logs: $runtimeDir"
Write-Host "  Stop: npm run platform:stop"
Write-Host "  Follow logs: Get-Content dist/runtime/api.out.log -Wait"

if ($Attach) {
  Watch-PlatformLogs -ApiLog $apiOutLog -WebLog $webOutLog
}
}

$operationLock = Enter-PlatformOperationLock -RepositoryRoot $root.Path
try {
  Invoke-PlatformStart
} finally {
  Exit-PlatformOperationLock -Lease $operationLock
}
