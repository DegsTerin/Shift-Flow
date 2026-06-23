$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$targets = @(
  (Join-Path $root "apps/web/.next"),
  (Join-Path $root "dist")
)

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
