# en-GB: Implements the docker desktop workflow so Windows operations remain repeatable and observable.
$DockerDesktopStartupTimeoutSeconds = 120

function Test-DockerDaemon {
  try {
    docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Test-LocalDockerEndpoint {
  param(
    [Parameter(Mandatory)]
    [string]$Endpoint
  )

  return $Endpoint -match '^npipe:////[.]/pipe/[A-Za-z0-9._-]+$' -or
    $Endpoint -match '^unix:///' -or
    $Endpoint -match '^tcp://(?:localhost|127[.]0[.]0[.]1|\[::1\])(?::\d+)?$'
}

function Assert-LocalDockerEnvironment {
  if (-not [string]::IsNullOrWhiteSpace($env:DOCKER_HOST)) {
    throw "DOCKER_HOST must be unset for ShiftFlow local platform operations."
  }
  if (-not [string]::IsNullOrWhiteSpace($env:COMPOSE_FILE)) {
    throw "COMPOSE_FILE must be unset for ShiftFlow local platform operations."
  }
  if (-not [string]::IsNullOrWhiteSpace($env:COMPOSE_PROJECT_NAME)) {
    throw "COMPOSE_PROJECT_NAME must be unset for ShiftFlow local platform operations."
  }

  $context = @(& docker context show 2>$null)
  if ($LASTEXITCODE -ne 0 -or $context.Count -ne 1) {
    throw "Docker context could not be resolved."
  }
  $endpoint = @(& docker context inspect $context[0] --format '{{.Endpoints.docker.Host}}' 2>$null)
  if ($LASTEXITCODE -ne 0 -or $endpoint.Count -ne 1 -or
      -not (Test-LocalDockerEndpoint -Endpoint $endpoint[0])) {
    throw "Docker context '$($context[0])' is not an approved local endpoint."
  }
}

function Invoke-ShiftFlowCompose {
  param(
    [Parameter(Mandatory)]
    [string]$RepositoryRoot,

    [Parameter(Mandatory)]
    [string[]]$Arguments
  )

  Assert-LocalDockerEnvironment
  $composeFile = Join-Path $RepositoryRoot 'docker-compose.yml'
  & docker compose `
    --project-directory $RepositoryRoot `
    --file $composeFile `
    --project-name shiftflow `
    @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Get-DockerDesktopPath {
  $basePaths = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    $env:LOCALAPPDATA
  ) | Where-Object { $_ }

  $candidates = foreach ($basePath in $basePaths) {
    if ($basePath -eq $env:LOCALAPPDATA) {
      Join-Path $basePath "Programs/DockerDesktop/Docker Desktop.exe"
      Join-Path $basePath "Programs/Docker/Docker/Docker Desktop.exe"
    } else {
      Join-Path $basePath "Docker/Docker/Docker Desktop.exe"
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Start-DockerDesktopMinimized {
  param(
    [int]$TimeoutSeconds = $DockerDesktopStartupTimeoutSeconds
  )

  Assert-LocalDockerEnvironment
  if (Test-DockerDaemon) {
    Write-Host "Docker daemon is already running."
    return
  }

  $dockerDesktopPath = Get-DockerDesktopPath
  if (-not $dockerDesktopPath) {
    throw "Docker Desktop executable was not found. Install Docker Desktop or update scripts/docker-desktop.ps1 with its path."
  }

  $dockerDesktopProcess = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
  if (-not $dockerDesktopProcess) {
    Write-Host "Starting Docker Desktop..."
    Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden | Out-Null
  } else {
    Write-Host "Docker Desktop is starting. Waiting for Docker daemon..."
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 2

    if (Test-DockerDaemon) {
      Write-Host "Docker daemon is ready."
      return
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker daemon did not become ready within ${TimeoutSeconds}s."
}
