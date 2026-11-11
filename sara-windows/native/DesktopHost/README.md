# SARA Native Desktop Host — Foundation

This standalone .NET 8 WinForms process hosts the existing SARA React UI in a normal, borderless WebView2 window sized to the selected monitor's usable work area. It is an interactive desktop overlay, not a wallpaper renderer: while visible it covers desktop icons, does not attach behind Explorer icons, and is not a replacement for the Windows shell. The taskbar and ordinary application windows remain available; right-click the SARA surface or press Esc to hide it and reveal the Explorer desktop.

## Current scope

- Single-instance native process with tray menu, right-click surface menu, Escape-to-hide, and graceful exit.
- Full selected-monitor work-area layout, preserving the Windows taskbar and supporting the existing SARA UI controls.
- Per-monitor DPI awareness (PerMonitorV2), monitor bounds/work areas/effective DPI inventory.
- Windows session lock/unlock, display-topology and suspend/resume event monitoring. Diagnostics are unavailable while the session is locked or suspended.
- Local bounded diagnostic log under `%LOCALAPPDATA%\Sara\logs`.
- `--self-test` emits a machine-readable monitor/DPI/OS snapshot and exits; useful for validating the native runtime on a target Windows desktop session.

## Build and run

Build/publish from the repository root with `npm run build:desktop-host`. For an interactive run, launch `sara-windows/native/DesktopHost/publish/Sara.DesktopHost.exe`; use its tray icon to open diagnostics or quit. `npm run test:desktop-host` publishes the self-contained Windows x64 binary and runs its native self-test. No administrator access is requested.

## Deliberate non-goals

No rendering surface is created. Windows' supported `IDesktopWallpaper` API sets static wallpaper and does not host an interactive window. Parentage/z-order changes involving Explorer's `WorkerW`/`Progman` windows are undocumented and can break on Explorer restart or Windows updates; this project does not call those APIs and makes no guaranteed behind-icons claim. Adding WebView2 or a React renderer, an interactive overlay, backend connection, authentication/action mediation, startup registration, or recovery supervision requires later design and acceptance testing. The desktop host is not yet included in Electron packaging and does not start automatically.
