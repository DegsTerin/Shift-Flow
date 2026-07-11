# en-GB: Implements the clean artifacts workflow so Windows operations remain repeatable and observable.
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$rootPattern = [regex]::Escape($root.Path)
$targets = @(
  (Join-Path $root "apps/web/.next"),
  (Join-Path $root "dist")
)

function Stop-ArtifactUsers {
  $patterns = @(
    "playwright\\test\\cli\.js test-server",
    "node_modules\\@playwright\\test\\cli\.js test-server",
    "tsx.*watch apps/api/src/server\.ts",
    "tsx.*apps/api/src/server\.ts",
    "next.*dev apps/web",
    "apps\\web\\.next\\"
  )

  function Test-ArtifactUserCommand {
    param([string]$CommandLine)

    foreach ($pattern in $patterns) {
      if ($CommandLine -match $pattern) {
        return $true
      }
    }

    return $false
  }

  Get-CimInstance Win32_Process |
    Where-Object {
      $commandLine = $_.CommandLine
      ($_.Name -eq "node.exe" -or $_.Name -eq "cmd.exe") -and
      (
        ($commandLine -match $rootPattern -and (Test-ArtifactUserCommand -CommandLine $commandLine)) -or
        ($commandLine -match "tsx watch apps/api/src/server\.ts") -or
        ($commandLine -match "next dev apps/web")
      )
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped artifact user PID $($_.ProcessId)"
    }
}

Stop-ArtifactUsers

foreach ($target in $targets) {
  $resolved = Resolve-Path -LiteralPath $target -ErrorAction SilentlyContinue
  if (-not $resolved) {
    continue
  }

  $path = $resolved.Path
  if (-not $path.StartsWith($root.Path, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside workspace: $path"
  }

  Remove-Item -LiteralPath $path -Recurse -Force
  Write-Host "Removed $path"
}
