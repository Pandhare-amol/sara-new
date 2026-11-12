[CmdletBinding()]
param(
  [switch]$Verify,
  [switch]$Electron,
  [switch]$ResetSandboxData,
  [int]$Port = 4310
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

$SandboxRoot = Join-Path $RepoRoot '.sara-sandbox'
if ($ResetSandboxData -and (Test-Path $SandboxRoot)) {
  Write-Host "[Sandbox] Resetting isolated .sara-sandbox directory..." -ForegroundColor Cyan
  Remove-Item -Recurse -Force $SandboxRoot
}

$env:SARA_ENV = 'sandbox'
$env:SARA_DATA_DIR = Join-Path $SandboxRoot 'data'
$env:SARA_PORT = [string]$Port
$env:MYRAA_PORT = [string]$Port
$env:SARA_DISABLE_AUTOSTART = '1'

if ($Verify) {
  Write-Host "[Sandbox] Running full J.A.R.V.I.S. isolated sandbox verification..." -ForegroundColor Cyan
  npm run sandbox:verify
  exit $LASTEXITCODE
}

if ($Electron) {
  Write-Host "[Sandbox] Launching Electron desktop app inside isolated sandbox ($env:SARA_DATA_DIR)..." -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx electron .
  exit $LASTEXITCODE
}

Write-Host "[Sandbox] Starting isolated SARA / J.A.R.V.I.S. sandbox server on http://127.0.0.1:$Port ..." -ForegroundColor Cyan
npm run sandbox
