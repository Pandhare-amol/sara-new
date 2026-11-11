[CmdletBinding()]
param(
  [ValidateSet('all','crash-recovery','explorer-fallback','monitor-topology','windows-version','toast-click')]
  [string]$Scenario = 'all',
  [switch]$ExecuteDestructiveTests
)
$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[object]]::new()
function Add-Result([string]$Name,[string]$Status,[string]$Evidence,[string]$Reason='') { $results.Add([pscustomobject]@{test=$Name;status=$Status;evidence=$Evidence;reason=$Reason}) }
function Run-WindowsVersion {
  $reg=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  $os=Get-CimInstance Win32_OperatingSystem
  $computerInfo=$null
  try { $computerInfo=Get-ComputerInfo -Property WindowsProductName,WindowsDisplayVersion,WindowsBuildLabEx,OsArchitecture -ErrorAction Stop } catch { }
  $build=[int]$reg.CurrentBuildNumber
  $caption=[string]$os.Caption
  $edition=if($computerInfo){[string]$computerInfo.WindowsProductName}else{$caption}
  $display=if($computerInfo){[string]$computerInfo.WindowsDisplayVersion}else{[string]$reg.DisplayVersion}
  $lab=if($computerInfo){[string]$computerInfo.WindowsBuildLabEx}else{''}
  $ok=($caption -match 'Windows 11' -or $edition -match 'Windows 11' -or $build -ge 22000)
  $discrepancy=if($reg.ProductName -notmatch 'Windows 11' -and $ok){'Registry ProductName differs from OS/CIM build identity.'}else{''}
  $evidence="Caption=$caption; ComputerInfoProduct=$edition; ProductName=$($reg.ProductName); Build=$build; DisplayVersion=$display; BuildLab=$lab; Architecture=$($os.OSArchitecture)"
  Add-Result 'Windows 11 identity' $(if($ok){'PASS'}else{'FAIL'}) $evidence $discrepancy
}
function Run-MonitorTopology {
  $hostExe=Join-Path $PSScriptRoot '..\sara-windows\native\DesktopHost\publish\Sara.DesktopHost.exe'
  if(Test-Path $hostExe){
    try {
      $psi=[Diagnostics.ProcessStartInfo]::new()
      $psi.FileName=(Resolve-Path $hostExe).Path
      $psi.Arguments='--self-test'
      $psi.UseShellExecute=$false
      $psi.CreateNoWindow=$true
      $psi.RedirectStandardOutput=$true
      $psi.RedirectStandardError=$true
      $probeProcess=[Diagnostics.Process]::Start($psi)
      $raw=$probeProcess.StandardOutput.ReadToEnd()
      $null=$probeProcess.StandardError.ReadToEnd()
      $null=$probeProcess.WaitForExit(10000)
      $probe=$raw | ConvertFrom-Json
      if($probe.ok -and [int]$probe.monitorCount -gt 0){
        $details=($probe.monitors | ForEach-Object { "$($_.Device) $($_.Width)x$($_.Height) work=$($_.WorkWidth)x$($_.WorkHeight) dpi=$($_.DpiX)x$($_.DpiY)" }) -join '; '
        Add-Result 'Monitor topology baseline' 'PASS' "Native DesktopHost: $details" 'Disconnect/reconnect requires physical hardware or a VM.'
        return
      }
    } catch { }
  }
  $m=@(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue)
  if($m.Count -gt 0){Add-Result 'Monitor topology baseline' 'PASS' "$($m.Count) WMI monitor descriptor(s) detected" 'Native DesktopHost self-test was unavailable; disconnect/reconnect requires physical hardware or a VM.'}
  else{Add-Result 'Monitor topology baseline' 'BLOCKED BY ENVIRONMENT' 'No native or WMI monitor descriptors available' 'Topology change was not simulated.'}
}
function Run-CrashRecovery { if(-not $ExecuteDestructiveTests){Add-Result 'SARA crash recovery' 'NOT RUN' 'Safe mode only' 'Requires isolated VM/test account and independent watchdog.'}else{Add-Result 'SARA crash recovery' 'BLOCKED BY ENVIRONMENT' 'No independent watchdog executable is registered' 'No process was terminated.'} }
function Run-ExplorerFallback { $p=Get-Process explorer -ErrorAction SilentlyContinue;if($p){Add-Result 'Explorer fallback readiness' 'PASS' "Explorer PID $($p.Id) is running" 'This is readiness, not a fallback simulation.'}else{Add-Result 'Explorer fallback readiness' 'FAIL' 'Explorer is not running' 'Explorer was not started or terminated.'};if(-not $ExecuteDestructiveTests){Add-Result 'Explorer fallback simulation' 'NOT RUN' 'No process termination performed' 'Use an isolated VM only.'} }
function Run-ToastClick { Add-Result 'Native toast click action' 'BLOCKED BY ENVIRONMENT' 'No registered native toast activation harness' 'Requires packaged app identity and interactive click verification.' }
if($Scenario-in @('all','windows-version')){Run-WindowsVersion};if($Scenario-in @('all','monitor-topology')){Run-MonitorTopology};if($Scenario-in @('all','crash-recovery')){Run-CrashRecovery};if($Scenario-in @('all','explorer-fallback')){Run-ExplorerFallback};if($Scenario-in @('all','toast-click')){Run-ToastClick};$results|ConvertTo-Json -Depth 5;if($results.status -contains 'FAIL'){exit 1}
