# SARA Windows Integration Layer

This modular subsystem extends the existing Electron/React app, Node backend, and Python Desktop Agent. Windows remains the operating system; no Explorer, logon, or protected OS components are modified.

## Phase 1 implementation

`native/WindowsBridge` is a separate .NET 8 Windows process. Sara generates a fresh 256-bit bearer token for each backend launch and passes it only through the bridge process environment and authenticated loopback requests. The listener binds IPv4 loopback only, validates the v1 envelope, timestamp, request ID, operation allowlist, empty argument object and token using a constant-time comparison. Requests are size-limited, replay IDs are rejected, and the process stops with the backend.

Implemented read-only operations:

- `health`: protocol/component readiness.
- `foreground_window`: foreground HWND (as hex), title, PID, process name, bounds and window DPI.
- `monitors`: monitor/work-area bounds, primary status, device name and DPI.
- `system_info`: OS/machine metadata, bounded process name/PID list, CPU, RAM, storage, battery, network status and idle time.

Sara prefers the bridge for its periodic Windows desktop-perception snapshot. If the native process is absent or fails, the existing Python observer and Win32 fallback remain in use. The renderer is not given the bridge token, and raw foreground observations are not exposed through a public HTTP route.

The bridge is deliberately read-only in this phase: no shell execution, process termination, file operations, or UI actions are exposed. Process monitoring is a snapshot, not yet a lifecycle event stream. Authenticated UI Automation, lock/unlock event enforcement within the bridge, toasts, wallpaper hosting, face/voice verification, recovery supervision and Windows Hello are not implemented in Phase 1. Existing Electron/Python session lock behavior remains in place.

## Desktop lifecycle integration

The installed Electron app can now register or remove a per-user Windows login launch from Settings → General → Startup & appearance. The registration launches Sara with `--sara-background`, so the main window stays hidden while the backend and configured desktop companion start. This is intentionally available only in packaged Windows builds; development/browser sessions cannot register themselves. It does not install a Windows service, request administrator access, or modify Windows logon components. The app remains manually launchable from its Start Menu/Desktop shortcut, and its tray menu retains the quit/stop controls.

This is the first lifecycle integration step, not the complete WIS architecture. Wallpaper hosting, a global assistant hotkey, native notification delivery, authenticated UI Automation, and broader allowlisted actions remain separate roadmap work. Any new action surface should preserve user approval for consequential changes and must not expose a general-purpose shell to the AI.

## Planned SARA shell features

The following items are intentionally not implemented in the current native host and must be treated as Phase 2/3 work rather than shipped behavior:

- Event subscriptions for foreground, window, session, and lifecycle changes.
- Actual window focus/minimize/maximize/restore/close operations.
- Native toast notifications.
- Shell watchdog and Explorer fallback.
- SARA taskbar, Start Center, and universal search shell UI.
- Signed packaging and release-signing requirements.
- CustomShell activation behind a user opt-in and recovery path.
- Windows Credential Provider work in a separate native project.
- Full Windows 11 end-to-end validation across login, lock/unlock, sleep/wake, and Explorer recovery.

These items are documented as future shell capabilities and are not supported claims in the current build.

CustomShell activation is explicitly deferred. It will not be enabled until a recovery account, Explorer fallback, and crash-recovery tests are completed on a suitable Windows test environment.

## Desktop background layer status

The existing React companion renderer (`?mode=companion`) reuses `SaraCharacter`, character settings, animation/physics, and the existing backend runtime. Electron creates it as a transparent, frameless companion window. The existing “Desktop background layer” option places that window in the non-topmost z-order and is intended as a passive presentation mode; it is **not** a true Explorer/WorkerW wallpaper host, does not render the full SARA application controls, and does not guarantee placement behind desktop icons across Windows 11 shell versions. Normal companion mode retains its current silhouette hit-testing and drag interaction.

Passive mode now enforces click-through even if renderer hit-testing requests interaction, rejects drag initiation, and suppresses the optional desktop-icon play action. A focused policy test covers this invariant. This preserves desktop input in the passive mode without changing the existing main UI or normal companion behavior.

Windows' documented `IDesktopWallpaper` API manages static wallpaper images; it is not an API for hosting an interactive React surface. Explorer `WorkerW`/`Progman` window reparenting is an undocumented shell technique, so it is not represented as a supported or reliable Windows 11 feature here. A real separate C#/.NET host plus interactive overlay would need an explicitly isolated prototype and Windows 11 validation (Explorer restart, logon/session locking, mixed-DPI displays, input/z-order, and recovery) before it could be exposed as a supported mode. No such host is included yet. The full existing `App` is also intentionally not mounted in the companion window: it would add the main shell and controls over desktop icons rather than provide a transparent, regionally interactive wallpaper surface.

## System-wide access and approved actions

Packaged desktop builds now register a configurable global “Open SARA” shortcut (default `Ctrl+Alt+Space`) in addition to the existing emergency-stop shortcut. It restores/focuses the ordinary SARA window; it does not silently start a microphone session or bypass the app's voice controls. The shortcut is managed through Electron and is removed by Electron on app exit. Native desktop notifications can be clicked to bring SARA forward, including normal runtime notices and attention/approval notices.

Computer actions continue to use SARA's existing backend action catalog, permission policy, and confirmation flow; the Windows Bridge remains read-only. This change does not add arbitrary shell commands or broaden the AI's privilege. Existing `app.launch`, `window.*`, file, and other registered actions remain subject to their configured capability decisions and the agent's implementation. Review the PC control & safety settings before enabling any capability.

This is a partial Windows integration increment, not a completed Windows Intelligence System. No native wallpaper host, full-UI wallpaper renderer, overlay hit-region system, wallpaper voice surface, native UI Automation action API, or Windows 11 acceptance matrix is implemented or claimed.

## Native desktop-host foundation

An independent .NET 8 WinForms process now exists under `native/DesktopHost`. It is a non-elevated native tray/diagnostics foundation with single-instance enforcement, bounded file logging, PerMonitorV2 initialization, monitor/work-area/effective-DPI inventory, and Windows session-lock, display-change, and power-event handling. It can be built/published and self-tested with `npm run build:desktop-host` and `npm run test:desktop-host`. The test checks the Windows build is 22000 or newer, DPI initialization succeeds, and at least one display is enumerated. The published executable is not yet included in Electron packaging and is not registered for Windows startup.

The host deliberately renders no wallpaper or overlay and does not connect to SARA's backend. Microsoft documents [`IDesktopWallpaper`](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-idesktopwallpaper) as an API for managing desktop wallpaper images; it does not host interactive application windows. This native milestone therefore does not meet the eventual wallpaper or interactive-control requirements. Explorer `WorkerW`/`Progman` reparenting remains excluded because it is undocumented and cannot support a reliable behind-icons guarantee without Windows-version-specific testing and an explicit acceptance of shell-recovery risks.

## Build and tests

Prerequisite: .NET 8 SDK. The native process runs on Windows x64.

- `npm run build:windows-bridge` publishes a self-contained executable to the ignored `native/WindowsBridge/publish` output folder.
- `npm run test:windows-bridge` runs the protocol validation harness.
- Sara's `app`, `dist`, and `dist:public` scripts build the bridge before launching/packaging it.

The bridge and protocol harness have been compiled and protocol tests run on the current Windows development environment. This is not a claim of full Windows 11 matrix, multi-monitor/DPI, installer, signing, or VM/recovery testing.
