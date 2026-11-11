[CmdletBinding()]
param(
  [ValidateSet('diagnose','backup','status','rollback')]
  [string]$Action = 'diagnose',
  [string]$BackupPath = (Join-Path $env:LOCALAPPDATA 'SARA\shell-recovery.json')
)

$ErrorActionPreference = 'Stop'
$runKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon'
$shellValue = (Get-ItemProperty -Path $runKey -Name Shell -ErrorAction SilentlyContinue).Shell
$explorer = Join-Path $env:WINDIR 'explorer.exe'

function Get-State {
  [pscustomobject]@{
    timestamp = [DateTimeOffset]::Now.ToString('o')
    user = [Environment]::UserName
    windowsShell = if ($shellValue) { [string]$shellValue } else { 'explorer.exe (default)' }
    explorerExists = Test-Path -LiteralPath $explorer
    saraShellActivation = $false
    activationAllowed = $false
    note = 'Phase 2 keeps Explorer active. SARA shell activation is intentionally disabled.'
  }
}

switch ($Action) {
  'diagnose' { Get-State | ConvertTo-Json -Depth 4 }
  'status' { Get-State | ConvertTo-Json -Depth 4 }
  'backup' {
    $parent = Split-Path -Parent $BackupPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Get-State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $BackupPath -Encoding UTF8
    [pscustomobject]@{ ok = $true; backup = $BackupPath; shellActivationChanged = $false } | ConvertTo-Json
  }
  'rollback' {
    if (-not (Test-Path -LiteralPath $BackupPath)) { throw "No SARA shell backup exists at $BackupPath" }
    if ($shellValue -and $shellValue -ne 'explorer.exe') {
      Set-ItemProperty -Path $runKey -Name Shell -Value 'explorer.exe'
    }
    [pscustomobject]@{ ok = $true; shell = 'explorer.exe'; changed = [bool]$shellValue -and $shellValue -ne 'explorer.exe' } | ConvertTo-Json
  }
}
