# SARA OS roadmap

SARA OS is a Windows-based user experience, not a replacement kernel or a
second operating system. Windows authentication, drivers, Explorer recovery,
UAC, and native application compatibility remain intact.

## Current truthful status

See [SARA_OS_STATUS.md](SARA_OS_STATUS.md) for the full capability inventory.
The assistant has a functional foundation, Windows integration is partial, the
desktop shell is incomplete, interactive wallpaper is unverified, Phase 2 is
NOT VERIFIED, and Phase 3 activation is BLOCKED. Explorer remains active;
CustomShell activation remains disabled pending recovery-safe testing.

## Environment audit

- Detected edition: Windows 10 Pro
- Detected build: 26300
- Architecture: 64-bit
- Repository UI: React 19 + TypeScript + Vite inside Electron
- Backend: Node/Express `server.ts`
- Desktop control: Python `desktop_agent/`
- Native integration: `.NET 8` `sara-windows/native/WindowsBridge`
- Desktop host: `.NET 8` `sara-windows/native/DesktopHost`

The reported edition must be rechecked on the target Windows 11 machine before
Windows 11-specific acceptance testing.

## Phase 1 — Windows Intelligence Layer

Current foundation:

- Authenticated loopback native bridge with per-launch token.
- Foreground-window and DPI-aware monitor observations.
- Read-only native system information.
- Existing Python Desktop Agent with permission checks and verification.
- Electron startup/tray/background operation.
- Screen perception, memory, missions, learning, recovery, and audit paths.
- Desktop host lifecycle/DPI foundation and self-test.

Acceptance gates before Phase 2:

1. Native bridge build and integration tests pass.
2. Desktop Agent and bridge restart recovery is bounded.
3. Renderer refresh cannot bypass backend permissions.
4. Screen, UI Automation, and native observations remain privacy-filtered.
5. Windows recovery route remains available.

The native event bridge currently installs WinEvent hooks for foreground,
move/resize, minimize/restore, and window-object lifecycle changes. This is
partial lifecycle coverage, not proof of process, session, Explorer, display,
or DPI event delivery; those remain explicit Phase 2 verification work.

## Phase 2 — SARA Desktop Shell

Build only after Phase 1 gates pass:

- Event subscriptions for foreground, window, session, and lifecycle changes.
- Actual window focus, minimize, maximize, restore, and close operations with
  user approval gates on consequential actions.
- Native toast notifications for user attention, approvals, and system events.
- Shell watchdog and Explorer fallback for crash recovery and safe rollback.
- SARA taskbar, Start Center, and universal search shell UI surfaces.
- Notification center and quick settings for SARA/Windows integration.
- Workspaces and window-manager integration.
- Existing SARA avatar and voice surface reused.
- Explicit Explorer fallback and safe-mode entry.
- Signed native binaries and installer packaging for release builds.
- CustomShell activation behind an explicit user opt-in and documented recovery path.

The first shell version should be opt-in per user and reversible. It must not
replace Explorer during development or on the only administrator account.

The above items are planned shell capabilities and are not yet implemented in the
current codebase. Each feature must ship behind a recovery-safe toggle, a
session restore path, and clear Windows 11 validation before it is exposed as a
supported mode.

## Phase 3 — Primary SARA shell

Only after a separate recovery-safe Windows account and VM/device test:

- Per-user shell registration through a supported Windows configuration.
- Automatic crash recovery to Explorer.
- Watchdog and rollback.
- Signed installer and signed native binaries.
- Full Windows 11 login, Explorer restart, display, sleep/wake, and lock/unlock
  test campaign.

CustomShell activation must remain disabled until a recovery account is available,
Explorer fallback is proven, and crash-recovery tests pass on a suitable Windows
test environment. The project will not activate CustomShell on the active user
session without that validation.

SARA-specific face/voice/password authentication is not a Windows login system.
Windows Hello and standard Windows sign-in remain authoritative. The existing
application-level face and voice prototypes are not suitable to unlock Windows;
Credential Provider work is unimplemented and requires a disposable VM,
recovery account, supported Windows interfaces, and independent security review.

Windows Credential Provider is a separate native C++/COM project. It must not
be mixed into the Electron bridge and must never be installed on the only
working login path without a recovery account and rollback procedure.

Release criteria for the Windows shell:

- Event subscriptions are tested for foreground, focus, minimize, maximize,
  restore, close, session lock, and Explorer restart transitions.
- Native toast notifications are delivered and clickable without breaking the
  app or user session.
- Shell watchdog verifies Explorer health and falls back to a safe Explorer
  restore path when SARA shell hosting becomes unstable.
- SARA Start Center and universal search are validated against taskbar/launcher
  integration and default Windows 11 behavior.
- All native assemblies are signed and packaged with a release certificate chain.
- CustomShell activation is reversible and disabled by default.
- Credential Provider work is isolated to a dedicated native project and is not
  deployed on production machines without a verified recovery plan.
- Full Windows 11 end-to-end testing covers login, lock/unlock, Explorer restart,
  display topology, DPI scaling, sleep/wake, and user approval flows.

## Non-goals

- No kernel replacement.
- No LSASS or Windows password interception.
- No UAC/CAPTCHA/DRM/secure-desktop bypass.
- No unrestricted AI shell or administrator command runner.
- No claim of true wallpaper hosting until Explorer/WorkerW behavior is tested
  on the target Windows version and a recovery path is proven.
