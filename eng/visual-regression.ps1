# en-GB: Runs the reviewed Windows visual baselines with one managed browser identity and explicit mode.
#Requires -Version 7.0

[CmdletBinding()]
param(
    [switch]$UpdateSnapshots
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
    throw 'The reviewed visual baselines are Windows-specific; use the functional E2E gate on other platforms.'
}

$previousBrowser = $env:PLAYWRIGHT_CHROME_EXECUTABLE_PATH
$previousVisualMode = $env:VISUAL_REGRESSION
try {
    $env:PLAYWRIGHT_CHROME_EXECUTABLE_PATH = 'bundled'
    $env:VISUAL_REGRESSION = '1'

    & npm run e2e:prepare
    if ($LASTEXITCODE -ne 0) {
        throw "Visual regression preparation failed with exit code $LASTEXITCODE."
    }

    $arguments = @(
        'playwright',
        'test',
        'tests/e2e/state08-visual-regression.spec.ts')
    if ($UpdateSnapshots) {
        $arguments += '--update-snapshots'
    }
    & npx @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Visual regression execution failed with exit code $LASTEXITCODE."
    }
}
finally {
    $env:PLAYWRIGHT_CHROME_EXECUTABLE_PATH = $previousBrowser
    $env:VISUAL_REGRESSION = $previousVisualMode
}
