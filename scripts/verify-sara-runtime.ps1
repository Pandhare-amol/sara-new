[CmdletBinding()]
param(
    [switch]$ExerciseRecovery
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules/electron/dist/electron.exe'
$serverUrl = 'http://127.0.0.1:3000'
$started = @()

function Get-Health {
    Invoke-RestMethod "$serverUrl/api/health" -TimeoutSec 5
}

function Wait-Health {
    param([int]$Seconds = 30)
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try { $health = Get-Health; if ($health.service -eq 'sara') { return $health } } catch { }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw 'SARA health endpoint did not become ready.'
}

function Stop-TrackedTree {
    param([int]$RootPid, [switch]$Root)
    $children = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ParentProcessId -eq $RootPid })
    foreach ($child in $children) { Stop-TrackedTree -RootPid ([int]$child.ProcessId) }
    $process = Get-Process -Id $RootPid -ErrorAction SilentlyContinue
    if ($process -and (($Root -and $process.Path -eq $electron) -or -not $Root)) {
        Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $electron)) { throw "Electron executable not found: $electron" }
try {
    try {
        $existing = Get-Health
        if ($existing.instance) { throw "Refusing to test while an existing SARA instance is active: $($existing.instance.id)" }
    } catch [System.Net.WebException] { }

    $first = Start-Process -FilePath $electron -ArgumentList @('.') -WorkingDirectory $root -PassThru
    $started += $first.Id
    $health = Wait-Health
    $firstInstance = $health.instance.id
    $firstPid = [int]$health.instance.pid
    $bridgePid = [int]$health.instance.bridgePid
    Write-Output "PASS first instance: $firstInstance backend=$firstPid bridge=$bridgePid"

    $second = Start-Process -FilePath $electron -ArgumentList @('.') -WorkingDirectory $root -PassThru
    $started += $second.Id
    Start-Sleep -Seconds 2
    $health2 = Get-Health
    if ($health2.instance.id -ne $firstInstance) { throw 'Second launch changed the active runtime instance.' }
    if (-not (Get-Process -Id $first.Id -ErrorAction SilentlyContinue)) { throw 'First Electron instance exited after second launch.' }
    Write-Output "PASS second launch refused/focused existing instance; X-Sara-Instance=$firstInstance"

    if ($health2.instance.pid -ne $firstPid) { throw 'Backend PID changed unexpectedly.' }
    if ($health2.instance.bridgePid -ne $bridgePid) { throw 'Bridge PID changed unexpectedly.' }
    Write-Output 'PASS backend/bridge ownership is stable'

    if ($ExerciseRecovery) {
        Stop-Process -Id $bridgePid -Force
        Start-Sleep -Seconds 5
        $reconnected = Get-Health
        if ($reconnected.components.windowsBridge -ne 'ok') { throw 'Windows Bridge did not reconnect within the bounded recovery window.' }
        Write-Output 'PASS bridge disconnect/reconnect'

        Stop-Process -Id $firstPid -Force
        Start-Sleep -Seconds 5
        $recovered = Wait-Health
        if ($recovered.service -ne 'sara') { throw 'Backend did not recover.' }
        Write-Output 'PASS backend crash/recovery'
    } else {
        Write-Output 'NOT TESTED recovery scenarios (rerun with -ExerciseRecovery)'
    }
}
finally {
    foreach ($trackedPid in $started) {
        Stop-TrackedTree -RootPid $trackedPid -Root
    }
}
