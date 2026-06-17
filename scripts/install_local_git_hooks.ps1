Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

git config core.hooksPath .githooks
Write-Host "Configured local git hooks path to .githooks"
