param(
    [ValidateSet('All', 'WindowsBridge', 'DesktopHost')]
    [string]$Target = 'All'
)

$names = switch ($Target) {
    'WindowsBridge' { @('Sara.WindowsBridge.exe') }
    'DesktopHost' { @('Sara.DesktopHost.exe') }
    default { @('Sara.WindowsBridge.exe', 'Sara.DesktopHost.exe') }
}

foreach ($name in $names) {
    $processes = Get-CimInstance Win32_Process -Filter "Name = '$name'" -ErrorAction SilentlyContinue
    if ($processes) {
        $processes | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

$targets = switch ($Target) {
    'WindowsBridge' { @((Join-Path $PSScriptRoot '..\sara-windows\native\WindowsBridge\publish')) }
    'DesktopHost' { @((Join-Path $PSScriptRoot '..\sara-windows\native\DesktopHost\publish')) }
    default {
        @(
            (Join-Path $PSScriptRoot '..\sara-windows\native\WindowsBridge\publish'),
            (Join-Path $PSScriptRoot '..\sara-windows\native\DesktopHost\publish')
        )
    }
}

foreach ($publishTarget in $targets) {
    if (Test-Path $publishTarget) {
        Remove-Item -Recurse -Force $publishTarget
    }
}
