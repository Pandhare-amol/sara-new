# Desktop Host Feasibility Report

## Milestone status

- Actual Explorer restart recovery: NOT RUN
- Multi-monitor physical testing: BLOCKED BY ENVIRONMENT
- WorkerW attachment: NOT IMPLEMENTED
- Interactive wallpaper: UNVERIFIED
- SARA shell activation: DISABLED
- Full-work-area interactive overlay: IMPLEMENTED; Windows desktop-icon coexistence: NOT IMPLEMENTED

## Verified results

- Native experimental desktop-host build: PASS
- Desktop hierarchy inspection: PASS
- Actual observed hierarchy:
  - Progman
  - SHELLDLL_DefView
  - SysListView32
  - FolderView
- Explorer remains active.
- No attachment has been performed.

## Safe interpretation

This repository does not activate shell attachment or CustomShell. The native WebView2 host now renders the existing SARA React UI across the selected monitor's usable work area. Its tested behavior is a normal borderless application overlay, not wallpaper behind icons: desktop icons are covered while SARA is visible. The Windows taskbar remains outside the work area, and ordinary application windows can appear above SARA because it is not topmost.

Right-clicking within SARA adds host commands to the WebView context menu (hide SARA, start voice, emergency stop); normal WebView text/link commands remain available. Escape hides SARA unless keyboard focus is in an input/editable control. Hiding reveals the ordinary Explorer desktop, where native icons and their right-click menus work normally. The overlay does not forward clicks to icons underneath and does not provide SARA replacements for Explorer icon selection, dragging, double-click, or context-menu behavior.

## Architecture comparison

1. Experimental WorkerW-based hosting
   - Status: NOT IMPLEMENTED
   - Risk: undocumented Explorer shell integration; not safe for this milestone
   - Result: blocked by shell recovery requirements

2. Separate native desktop surface coordinated with Explorer
   - Status: FULL-WORK-AREA OVERLAY TESTED; BEHIND-ICON COEXISTENCE NOT IMPLEMENTED
   - Risk: while visible, the normal window covers Explorer icons; host crash/recovery and multi-monitor physical behavior still need acceptance testing
   - Result: useful interactive companion overlay; not a true wallpaper or primary shell

3. Supported wallpaper or desktop background API
   - Status: NOT APPLICABLE
   - Reason: static wallpaper APIs do not host an interactive SARA surface behind desktop icons

## Recommended hosting strategy

Keep the current safe model:

- read-only Explorer lifecycle observation
- no reparenting
- no SetParent calls
- no global mouse interception
- no automatic Explorer restart or shell modification
- explicit disabled-by-default prototype with safe shutdown and fallback logging only

## Remaining blockers

- actual Explorer restart testing on a dedicated Windows environment
- real multi-monitor and negative-coordinate geometry validation
- recovery-account and fallback plan before any CustomShell activation
- Windows 11 end-to-end validation for shell stability and taskbar/desktop behavior

For the broader capability inventory and current phase assessment, see
[SARA_OS_STATUS.md](SARA_OS_STATUS.md) and [SARA_OS_ROADMAP.md](SARA_OS_ROADMAP.md).
