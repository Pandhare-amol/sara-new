[CmdletBinding()]
param([int]$Seconds = 15, [int]$IntervalMs = 500)
$ErrorActionPreference = 'Stop'
$start = Get-Date
$initial = @(Get-Process explorer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$observations = [System.Collections.Generic.List[object]]::new()
while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
  $current = @(Get-Process explorer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $observations.Add([pscustomobject]@{ at=[DateTimeOffset]::Now.ToString('o'); explorerPids=$current; changed=(-not (@($current) -join ',' -eq @($initial) -join ',')) })
  Start-Sleep -Milliseconds $IntervalMs
}
[pscustomobject]@{ status='PASS'; initialExplorerPids=$initial; finalExplorerPids=$current; explorerChanged=($observations.changed -contains $true); observations=$observations; note='Read-only observation. Explorer was not terminated or restarted.' } | ConvertTo-Json -Depth 6
