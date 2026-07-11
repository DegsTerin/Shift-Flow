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

function Get-DockerDesktopPath {
  $basePaths = @(
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)},
    $env:LOCALAPPDATA
  ) | Where-Object { $_ }

  $candidates = foreach ($basePath in $basePaths) {
    if ($basePath -eq $env:LOCALAPPDATA) {
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

function Minimize-DockerDesktopWindow {
  $signature = @"
using System;
using System.Runtime.InteropServices;

public static class WindowTools {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

  if (-not ([System.Management.Automation.PSTypeName]"WindowTools").Type) {
    Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue
  }

  $processes = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    if ($process.MainWindowHandle -ne 0) {
      [WindowTools]::ShowWindowAsync($process.MainWindowHandle, 2) | Out-Null
    }
  }
}

function Start-DockerDesktopMinimized {
  param(
    [int]$TimeoutSeconds = $DockerDesktopStartupTimeoutSeconds
  )

  if (Test-DockerDaemon) {
    Write-Host "Docker daemon is already running."
    Minimize-DockerDesktopWindow
    return
  }

  $dockerDesktopPath = Get-DockerDesktopPath
  if (-not $dockerDesktopPath) {
    throw "Docker Desktop executable was not found. Install Docker Desktop or update scripts/docker-desktop.ps1 with its path."
  }

  $dockerDesktopProcess = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
  if (-not $dockerDesktopProcess) {
    Write-Host "Starting Docker Desktop minimized..."
    Start-Process -FilePath $dockerDesktopPath -WindowStyle Minimized | Out-Null
  } else {
    Write-Host "Docker Desktop is starting. Waiting for Docker daemon..."
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    Start-Sleep -Seconds 2
    Minimize-DockerDesktopWindow

    if (Test-DockerDaemon) {
      Write-Host "Docker daemon is ready."
      Minimize-DockerDesktopWindow
      return
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker daemon did not become ready within ${TimeoutSeconds}s."
}

function Stop-DockerDesktop {
  $processNames = @(
    "Docker Desktop",
    "Docker Desktop Backend",
    "com.docker.backend"
  )

  $processes = foreach ($processName in $processNames) {
    Get-Process -Name $processName -ErrorAction SilentlyContinue
  }

  if (-not $processes) {
    Write-Host "Docker Desktop is not running."
    return
  }

  Write-Host "Closing Docker Desktop..."
  foreach ($process in $processes) {
    if ($process.MainWindowHandle -ne 0) {
      $process.CloseMainWindow() | Out-Null
    }
  }

  Start-Sleep -Seconds 3

  $remainingProcesses = foreach ($processName in $processNames) {
    Get-Process -Name $processName -ErrorAction SilentlyContinue
  }

  foreach ($process in $remainingProcesses) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}
