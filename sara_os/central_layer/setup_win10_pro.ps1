<#
.SYNOPSIS
  Safe Windows 10 Pro (Intel Core i5 / 8 GB RAM) Installer & Rollback Script
  for SARA Central Operating Layer (`sara_os/central_layer/`).

.USAGE
  # 1. Install Python venv & lightweight dependencies (<75 MB RAM):
  .\setup_win10_pro.ps1 -Action Install

  # 2. Test the full 4-Stage Boot-to-Wallpaper flow safely in windowed mode:
  .\setup_win10_pro.ps1 -Action TestFlow

  # 3. Enable Pre-Desktop Winlogon User Shell (after testing):
  .\setup_win10_pro.ps1 -Action EnableBootShell

  # 4. Instant 1-Click Rollback back to standard Windows Explorer shell:
  .\setup_win10_pro.ps1 -Action RestoreWindowsShell
#>

param(
  [ValidateSet("Install", "TestFlow", "EnableBootShell", "RestoreWindowsShell")]
  [string]$Action = "TestFlow"
)

$ErrorActionPreference = "Stop"
$LayerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $LayerDir ".venv"
$WinlogonKey = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"

if ($Action -eq "Install") {
  Write-Host "[SARA Win10 Pro] Creating lightweight Python virtual environment in $VenvDir ..." -ForegroundColor Cyan
  python -m venv $VenvDir
  & "$VenvDir\Scripts\pip.exe" install --upgrade pip
  & "$VenvDir\Scripts\pip.exe" install fastapi uvicorn websockets psutil mss pillow google-genai python-dotenv pywin32 opencv-python SpeechRecognition keyboard
  Write-Host "[SARA Win10 Pro] Dependencies installed (<75 MB runtime footprint on 8 GB RAM)." -ForegroundColor Green
}
elseif ($Action -eq "TestFlow") {
  $Py = if (Test-Path "$VenvDir\Scripts\python.exe") { "$VenvDir\Scripts\python.exe" } else { "python" }
  Write-Host "[SARA Win10 Pro] Launching safe windowed test of 3-Factor Security Gate -> Live Wallpaper HUD..." -ForegroundColor Cyan
  & $Py (Join-Path $LayerDir "sara_boot.py") --windowed --no-explorer
}
elseif ($Action -eq "EnableBootShell") {
  $Pyw = Join-Path $VenvDir "Scripts\pythonw.exe"
  $BootPy = Join-Path $LayerDir "sara_boot.py"
  if (-not (Test-Path $Pyw)) {
    throw "Run .\setup_win10_pro.ps1 -Action Install first so $Pyw exists."
  }
  Set-ItemProperty -Path $WinlogonKey -Name "Shell" -Value "`"$Pyw`" `"$BootPy`""
  Write-Host "[SARA Win10 Pro] User-level Winlogon Shell set to SARA Boot Sequencer." -ForegroundColor Green
  Write-Host "Emergency rollback anytime: Ctrl+Shift+Esc -> File -> Run new task -> powershell -File `"$PSCommandPath`" -Action RestoreWindowsShell" -ForegroundColor Yellow
}
elseif ($Action -eq "RestoreWindowsShell") {
  Remove-ItemProperty -Path $WinlogonKey -Name "Shell" -ErrorAction SilentlyContinue
  Write-Host "[SARA Win10 Pro] Restored default Windows 10 Explorer shell cleanly." -ForegroundColor Green
}
