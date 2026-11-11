[CmdletBinding()]
param(
  [ValidateSet('inspect','backup','validate','status','recovery-account','explorer-health','rollback')]
  [string]$Action = 'inspect',
  [string]$StatePath = (Join-Path $env:LOCALAPPDATA 'SARA\deployment'),
  [switch]$ConfirmRollback
)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($StatePath)
$Backups = Join-Path $Root 'backups'
$Latest = Join-Path $Root 'latest.json'
$Winlogon = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon'
function Safe([string]$Path) { $full = [IO.Path]::GetFullPath($Path); if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path is outside deployment directory.' }; return $full }
function Identity { $r = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'; $o = Get-CimInstance Win32_OperatingSystem; return [pscustomobject]@{ productName=$r.ProductName; edition=$r.EditionID; displayVersion=$r.DisplayVersion; build=$r.CurrentBuildNumber; ubr=$r.UBR; installationType=$r.InstallationType; architecture=$o.OSArchitecture; caption=$o.Caption; version=$o.Version } }
function ValueState([string]$Path, [string]$Name) { $key = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue; if ($null -eq $key -or -not ($key.GetValueNames() -contains $Name)) { return [pscustomobject]@{path=$Path;name=$Name;exists=$false;kind=$null;value=$null} }; return [pscustomobject]@{path=$Path;name=$Name;exists=$true;kind=[string]$key.GetValueKind($Name);value=$key.GetValue($Name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)} }
function ExplorerHealth { $p = @(Get-Process explorer -ErrorAction SilentlyContinue); $s = ValueState $Winlogon 'Shell'; return [pscustomobject]@{processExists=($p.Count -gt 0);processCount=$p.Count;configuredShell=if($s.exists){$s.value}else{'explorer.exe (default)'};executableExists=(Test-Path (Join-Path $env:WINDIR 'explorer.exe'));status=if($p.Count -gt 0){'PASS'}else{'FAIL'};note='Process presence is not a complete desktop responsiveness test.'} }
function RecoveryAccount { $a = @(Get-LocalUser -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -and $_.Name -notin @($env:USERNAME,'DefaultAccount','Guest','WDAGUtilityAccount') }); return [pscustomobject]@{status='NOT_VERIFIED';independentAccounts=@($a | ForEach-Object Name);testedLogin=$false;explorerShellVerified=$false;instructionsAvailable=(Test-Path (Join-Path $PSScriptRoot 'RECOVERY.md'));note='Existence is not proof of recovery capability.'} }
function Hash([string]$Json) { $h=[Security.Cryptography.SHA256]::Create(); return ([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Json)))).Replace('-','').ToLowerInvariant() }
function Atomic([string]$Path,[string]$Content) { $full=Safe $Path; $tmp="$full.$([guid]::NewGuid().ToString('N')).tmp"; [IO.File]::WriteAllText($tmp,$Content,(New-Object Text.UTF8Encoding($false))); Move-Item -LiteralPath $tmp -Destination $full -Force }
function Payload { return [pscustomobject]@{formatVersion=2;deploymentId=[guid]::NewGuid().ToString('D');createdAt=[DateTimeOffset]::UtcNow.ToString('o');windows=Identity;registry=@(ValueState $Winlogon 'Shell');recovery=RecoveryAccount;explorer=ExplorerHealth;sara=@{activation='DISABLED';loginModification='DISABLED';credentialProvider='DISABLED'}} }
function Inspect { return [pscustomobject]@{status='ACTIVATION_BLOCKED';windows=Identity;shell=ValueState $Winlogon 'Shell';explorer=ExplorerHealth;recovery=RecoveryAccount;customShellActivation='DISABLED'} | ConvertTo-Json -Depth 10 }
switch ($Action) {
  'inspect' { Inspect }
  'status' { if (Test-Path $Latest) { Get-Content $Latest -Raw } else { Inspect } }
  'recovery-account' { RecoveryAccount | ConvertTo-Json -Depth 6 }
  'explorer-health' { ExplorerHealth | ConvertTo-Json -Depth 6 }
  'backup' { New-Item -ItemType Directory -Path $Backups -Force | Out-Null; $p=Payload; $j=$p | ConvertTo-Json -Depth 12 -Compress; $d=[pscustomobject]@{payload=$p;integrity=@{algorithm='SHA-256';sha256=Hash $j}}; $f=Join-Path $Backups "$($p.deploymentId).json"; Atomic $f ($d | ConvertTo-Json -Depth 12); Atomic $Latest (([pscustomobject]@{latest=$f;sha256=$d.integrity.sha256}) | ConvertTo-Json); [pscustomobject]@{status='PASS';backup=$f;sha256=$d.integrity.sha256} | ConvertTo-Json }
  'validate' { if (-not (Test-Path $Latest)) { throw 'No backup exists.' }; $f=(Get-Content $Latest -Raw | ConvertFrom-Json).latest; $d=Get-Content (Safe $f) -Raw | ConvertFrom-Json; $ok=((Hash ($d.payload | ConvertTo-Json -Depth 12 -Compress)) -eq $d.integrity.sha256); [pscustomobject]@{status=if($ok){'PASS'}else{'FAIL'};integrity=if($ok){'PASS'}else{'FAIL'};backup=$f} | ConvertTo-Json }
  'rollback' { if (-not $ConfirmRollback) { [pscustomobject]@{status='PREVIEW';message='Re-run with -ConfirmRollback for restoration.';current=ValueState $Winlogon 'Shell'} | ConvertTo-Json; break }; if (-not (Test-Path $Latest)) { throw 'No backup exists.' }; $f=(Get-Content $Latest -Raw | ConvertFrom-Json).latest; $d=Get-Content (Safe $f) -Raw | ConvertFrom-Json; $v=$d.payload.registry | Select-Object -First 1; if ($v.exists) { Set-ItemProperty -LiteralPath $Winlogon -Name Shell -Value $v.value } else { Remove-ItemProperty -LiteralPath $Winlogon -Name Shell -ErrorAction SilentlyContinue }; [pscustomobject]@{status='PASS';restored=(ValueState $Winlogon 'Shell');source=$f} | ConvertTo-Json }
}
