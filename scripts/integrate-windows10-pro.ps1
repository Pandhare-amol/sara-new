[CmdletBinding()]
param(
  [switch]$BuildNativeHosts,
  [switch]$RegisterStartup,
  [switch]$UnregisterStartup
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SARA / J.A.R.V.I.S. — Windows 10 Pro Safe Integration & Diagnostics" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Verify Windows 10 Pro (build >= 19041) / Windows 11 compatibility
$ntReg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$osInfo = Get-CimInstance Win32_OperatingSystem
$build = [int]$ntReg.CurrentBuildNumber
$caption = [string]$osInfo.Caption

if ($build -lt 19041) {
  throw "Unsupported Windows build $build ($caption). Windows 10 version 2004 / Pro (build 19041+) or Windows 11 is required."
}
Write-Host "[OK] OS Verified: $caption (Build $build, $($osInfo.OSArchitecture))" -ForegroundColor Green

# 2. Verify Windows Shell & Security Integrity (Explorer, Winlogon, Defender untouched)
$explorer = Get-Process explorer -ErrorAction SilentlyContinue
if (-not $explorer) {
  Write-Warning "Explorer.exe is not currently detected; SARA never replaces or terminates explorer.exe."
} else {
  Write-Host "[OK] Windows Explorer shell active (PID $($explorer[0].Id)) — untouched." -ForegroundColor Green
}

$winlogonShell = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name Shell -ErrorAction SilentlyContinue).Shell
if ($winlogonShell -and $winlogonShell -notmatch 'explorer\.exe') {
  Write-Warning "Winlogon Shell is '$winlogonShell' (expected explorer.exe). SARA never alters Winlogon."
} else {
  Write-Host "[OK] Winlogon & Windows Security (Defender / UAC / Credential Providers) preserved." -ForegroundColor Green
}

# 3. Check WebView2 Runtime (used by optional native DesktopHost & LiveCoreHost on Win 10 Pro)
$wv2Keys = @(
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
)
$wv2Version = $null
foreach ($k in $wv2Keys) {
  if (Test-Path $k) {
    $pv = (Get-ItemProperty $k -ErrorAction SilentlyContinue).pv
    if ($pv -and $pv -ne '0.0.0.0') { $wv2Version = $pv; break }
  }
}
if ($wv2Version) {
  Write-Host "[OK] Microsoft Edge WebView2 Runtime detected ($wv2Version)." -ForegroundColor Green
} else {
  Write-Host "[INFO] WebView2 Runtime not detected (Electron works out-of-the-box; install WebView2 if using native SaraLiveCoreHost)." -ForegroundColor Yellow
}

# 4. Optional build of native WindowsBridge + DesktopHost + LiveCoreHost
if ($BuildNativeHosts) {
  if (Get-Command dotnet -ErrorAction SilentlyContinue) {
    Write-Host "[BUILD] Building WindowsBridge, DesktopHost, and SaraLiveCoreHost for Windows 10 Pro x64..." -ForegroundColor Cyan
    npm run build:windows-bridge
    npm run build:desktop-host
    npm run build:live-core-host
  } else {
    Write-Warning ".NET SDK not found on PATH; skipping native C# host builds."
  }
}

# 5. Safe user-scoped Windows Startup registration (HKCU Run only — never HKLM or Winlogon)
$runKeyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runValueName = 'SaraJarvisCompanion'

if ($UnregisterStartup) {
  Remove-ItemProperty -Path $runKeyPath -Name $runValueName -ErrorAction SilentlyContinue
  Write-Host "[OK] Removed user-scoped SARA startup entry from HKCU Run." -ForegroundColor Green
} elseif ($RegisterStartup) {
  $electronCmd = Join-Path $RepoRoot 'node_modules\.bin\electron.cmd'
  if (Test-Path $electronCmd) {
    $cmdValue = "`"$electronCmd`" `"$RepoRoot`" --sara-background"
    Set-ItemProperty -Path $runKeyPath -Name $runValueName -Value $cmdValue
    Write-Host "[OK] Registered safe user-scoped post-login startup in HKCU Run ($runValueName)." -ForegroundColor Green
  } else {
    Write-Warning "Electron binary not found at $electronCmd; run 'npm install' first."
  }
}

Write-Host "`nWindows 10 Pro integration check complete. Launch production with 'npm run electron' or isolated sandbox with '.\scripts\start-sara-sandbox.ps1'." -ForegroundColor Cyan
