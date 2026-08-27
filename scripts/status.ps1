# en-GB: Reports verified process ownership and HTTP readiness so foreign listeners cannot be mistaken for a healthy ShiftFlow runtime.
[CmdletBinding()]
param(
  [switch]$RequireReady
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeDir = Join-Path $root "dist/runtime"
$pidFile = Join-Path $runtimeDir "shiftflow-pids.json"

. (Join-Path $PSScriptRoot "platform-common.ps1")

Set-Location $root

function Get-UrlProbe {
  param(
    [Parameter(Mandatory)]
    [string]$Url,

    [string]$ExpectedService
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    if (-not [string]::IsNullOrWhiteSpace($ExpectedService)) {
      $payload = $response.Content | ConvertFrom-Json
      if ([string]$payload.service -ne $ExpectedService) {
        return [pscustomobject]@{
          Available = $false
          Description = "unexpected service identity"
        }
      }
    }
    return [pscustomobject]@{
      Available = $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
      Description = "HTTP $($response.StatusCode)"
    }
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [pscustomobject]@{
        Available = $false
        Description = "HTTP $([int]$_.Exception.Response.StatusCode)"
      }
    }
    return [pscustomobject]@{ Available = $false; Description = "unavailable" }
  }
}

Write-Host "ShiftFlow status"
Write-Host "Root: $($root.Path)"

$verifiedNames = @()
$verifiedEntries = @{}
$foreignProcess = $false
$stateExists = Test-Path -LiteralPath $pidFile
if ($stateExists) {
  $state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  Write-Host "Started at: $($state.startedAt)"
  $recordedState = if ($state.PSObject.Properties.Name -contains 'state') {
    $state.state
  } else {
    'legacy/unverified'
  }
  Write-Host "Recorded state: $recordedState"

  foreach ($entry in $state.processes) {
    $snapshot = Get-ManagedProcessSnapshot -ProcessId ([int]$entry.pid)
    $status = if (-not $snapshot) {
      "stopped"
    } elseif (Test-ManagedProcessOwnership -Entry $entry -RepositoryRoot $root.Path -Snapshot $snapshot) {
      $verifiedNames += [string]$entry.name
      $verifiedEntries[[string]$entry.name] = $entry
      "running (ownership verified)"
    } else {
      $foreignProcess = $true
      "active PID, ownership NOT VERIFIED"
    }
    Write-Host "$($entry.name): $status (PID $($entry.pid))"
  }
} else {
  Write-Host "PID file: not found"
}

$listeners = Get-PortListeners -Ports @(3000, 3001)
foreach ($port in @(3000, 3001)) {
  $portListeners = @($listeners | Where-Object { $_.Port -eq $port })
  if ($portListeners.Count -eq 0) {
    Write-Host "Port ${port}: free"
    continue
  }
  foreach ($listener in $portListeners) {
    Write-Host "Port ${port}: listening (PID $($listener.ProcessId), $($listener.ProcessName))"
  }
}

$healthProbe = Get-UrlProbe -Url 'http://localhost:3001/health' -ExpectedService 'shiftflow-api'
$readyProbe = Get-UrlProbe -Url 'http://localhost:3001/ready' -ExpectedService 'shiftflow-api'
$webProbe = Get-UrlProbe -Url 'http://localhost:3000'
Write-Host "API health: $($healthProbe.Description)"
Write-Host "API readiness: $($readyProbe.Description)"
Write-Host "Web: $($webProbe.Description)"

$ownedRuntime = $verifiedNames -contains 'api' -and $verifiedNames -contains 'web'
$apiPortOwned = $verifiedEntries.ContainsKey('api') -and
  (Test-PortOwnedByManagedEntry `
      -Entry $verifiedEntries['api'] `
      -RepositoryRoot $root.Path `
      -Port 3001)
$webPortOwned = $verifiedEntries.ContainsKey('web') -and
  (Test-PortOwnedByManagedEntry `
      -Entry $verifiedEntries['web'] `
      -RepositoryRoot $root.Path `
      -Port 3000)
Write-Host "API listener ownership: $(if ($apiPortOwned) { 'verified' } else { 'not verified' })"
Write-Host "Web listener ownership: $(if ($webPortOwned) { 'verified' } else { 'not verified' })"

$allReady = $ownedRuntime -and $apiPortOwned -and $webPortOwned -and
  $healthProbe.Available -and $readyProbe.Available -and $webProbe.Available
$externalSignal = $listeners.Count -gt 0 -or
  $healthProbe.Available -or $readyProbe.Available -or $webProbe.Available
$disposition = if ($allReady) {
  'ready'
} elseif ($foreignProcess -or (-not $ownedRuntime -and $externalSignal)) {
  'foreign-or-unverified'
} elseif ($verifiedNames.Count -gt 0) {
  'degraded'
} elseif ($stateExists) {
  'stopped'
} else {
  'unknown'
}

Write-Host "Disposition: $disposition"
Write-Host "Logs: $runtimeDir"

if ($RequireReady -and -not $allReady) {
  throw "ShiftFlow is not ready; disposition is $disposition."
}
