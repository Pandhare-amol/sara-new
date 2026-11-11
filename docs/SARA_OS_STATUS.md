# SARA OS — Current Status

This document records the current implementation boundary. It distinguishes working foundations from partial integrations and unverified or intentionally blocked shell capabilities. “Working or mostly working” describes the current project status; it is not a claim that every item has completed a Windows 11 production acceptance campaign.

## Working or mostly working

- Electron + React SARA interface.
- Existing avatar, voice, themes, and conversation UI.
- Node/Express backend and Python Desktop Agent.
- Gemini/model routing.
- Memory, RAG, missions, learning, and permissions.
- Authenticated loopback Windows Bridge.
- Foreground-window observation and window enumeration.
- UI Automation snapshots and DPI-aware monitor detection.
- Native focus, minimize, maximize, restore, close, and move/resize operations.
- Backend `/api/windows/state` and `/api/windows/applications` endpoints.
- Electron Windows control panel.
- Deployment backups with SHA-256 validation.
- Explorer diagnostics and experimental desktop-host inspection.
- Safe operation with Explorer remaining active.

## Partially implemented

- **Native Windows event streaming:** subscriptions now cover foreground changes, system move/resize and minimize/restore transitions, plus window-object creation/destruction/show/hide/focus/location/name changes. The authenticated bridge integration test verifies that all four hook groups install. Actual event delivery across all Windows versions is not yet acceptance-tested.
- **Window-state reconciliation:** snapshot refresh works; complete event-driven reconciliation is incomplete.
- **Electron live updates:** WebSocket handling exists, but broader UI integration is incomplete.
- **Application discovery:** Start Menu shortcuts work; packaged-app discovery, AUMID, publisher, icons, and robust launch verification are incomplete.
- **Window management:** native operations exist, but complete permission/risk integration and disposable-window testing are incomplete.
- **Desktop surface:** the native host displays the existing React UI in a borderless window filling the selected monitor's usable work area. Its live-backend integration test verifies the UI, backend health, and work-area bounds. This is a tested overlay, not behind-icons wallpaper; it covers icons while visible. Right-click provides host actions, Escape hides it (except in editable fields), and hiding reveals the normal Explorer desktop. Icon coexistence, multi-monitor physical validation, and Explorer restart recovery remain incomplete.
- **Explorer monitoring:** PID observation exists; real Explorer restart recovery is untested.
- **Deployment manager:** backup, inspection, preview rollback, and diagnostics exist; activation readiness is blocked.
- **System dashboard:** real status panels exist, but this is not a complete desktop shell.
- **Screen understanding:** existing SARA features are available, but continuous desktop-context integration is incomplete.

## Missing or incomplete for SARA OS

### Native Windows integration

- Process start, exit, and crash events; session lock/unlock; Explorer restart; display and DPI changes.
- Explicit event acknowledgements, reliable subscription lifecycle/reconnect, stronger deduplication, and process/window identity beyond HWND.

### Window manager

- Complete visual window manager and real window previews.
- Stale-HWND, process-ownership-mismatch, access-denied, and protected-window tests.
- Full move/resize UI and application-launch-to-window association.

### Taskbar and Start Center

- SARA taskbar, running-app grouping, active-window indication, and real application switching.
- Start button/Start Center, pinned and recent applications.
- Keyboard navigation, accessibility, and multi-monitor taskbar behavior.

### Universal Search

- Indexed application search UI and running-window search.
- Authorized file/folder indexing and search across SARA memory, skills, missions, and settings.
- Ranking, filters, cancellation, permission enforcement, and real open/launch actions.

### Workspaces

- Workspace creation, naming, switching, deletion, and window-layout persistence.
- Multi-monitor workspace restoration.
- Explicit separation between SARA-managed workspaces and native Windows virtual desktops.

### Notifications and system controls

- Native Windows toast registration, click actions, notification history, and dismissal.
- Quick Settings connected to real Wi-Fi, Bluetooth, audio, display, battery, and power APIs.
- Honest unavailable states for unsupported controls.

### Desktop background integration

- Verified wallpaper-like SARA surface and z-order behind desktop icons.
- Preservation of native icon selection, dragging, double-click, and context menus.
- Empty-desktop SARA context menu, Explorer-restart reattachment, and multi-monitor desktop surfaces.
- DPI and negative-coordinate validation, plus WorkerW/Progman feasibility testing.

### Reliability

- Independent watchdog with functional health checks, bounded restart, and backoff.
- SARA crash recovery and backend/native-bridge recovery.
- Tested Explorer fallback and recovery-account validation.
- Deliberate crash-recovery tests.

### Production deployment

- Signed installer and native bridge/host binaries, release certificate chain, and timestamping.
- Production integrity verification and stable installation paths.
- Reversible shell deployment.

### Primary-shell transformation — not implemented and intentionally disabled

- Supported per-user shell registration, CustomShell activation, and SARA as the primary desktop shell.
- Full Windows 11 VM/device test campaign.
- Credential Provider integration and Windows login modification.

## Pre-login authentication boundary

The requested Windows pre-login Face OR Voice OR Password system is **NOT IMPLEMENTED**. Windows sign-in, Windows Hello, and recovery accounts remain under Windows control; SARA does not expose its desktop before normal Windows sign-in and does not change Credential Provider registration.

The existing SARA authentication modules are application-level prototypes, not Windows credentials: face matching uses OpenCV LBPH and heuristic blink/head-turn challenges, while voice matching explicitly uses MFCC similarity and is not production-grade speaker verification. They do not establish the robust anti-spoofing, liveness, secure-template lifecycle, and recovery guarantees needed to unlock a Windows account. Because OR-based access inherits the weakest factor's security, these modules must not be used as alternate Windows login factors. Do not add a custom Credential Provider or deploy one on the everyday Windows installation; investigate it separately in a disposable VM with a recovery account and a specialist security review.

For now, use standard Windows sign-in and Windows Hello. Any SARA-only post-login gate must remain distinct from Windows authentication and must not claim to protect the Windows session.

## Five largest blockers

1. Full native event lifecycle and state reconciliation.
2. Functional taskbar, Start Center, and Universal Search.
3. Tested independent watchdog and Explorer fallback.
4. Verified desktop-background and desktop-icon coexistence.
5. Isolated Windows 11 production deployment and rollback testing.

## Current truthful status

```text
SARA assistant: functional foundation
Windows integration: partially implemented
SARA desktop shell: incomplete
Interactive wallpaper: unverified
Phase 2: NOT VERIFIED
Phase 3: ACTIVATION BLOCKED
```

Explorer remains active. WorkerW/Progman attachment and CustomShell activation are not implemented or enabled. Do not treat the diagnostic desktop surface as an interactive wallpaper or a supported shell. See [SARA_OS_ROADMAP.md](SARA_OS_ROADMAP.md) for phase gates and [DESKTOP_HOST_FEASIBILITY_REPORT.md](DESKTOP_HOST_FEASIBILITY_REPORT.md) for desktop-host-specific findings.
