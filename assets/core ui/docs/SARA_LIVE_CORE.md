# SARA LIVE CORE — Architecture & Operations Guide

## 1. Overview

**SARA LIVE CORE** is an independent, hardware-accelerated 3D WebGL/GLSL visual module (`src/sara-live-core/`) inspired by sentient AI energy matrices. It is completely isolated from any host SARA assistant UI, stores its own configuration under `localStorage['sara.liveCore.settings.v1']`, and cleanly disposes all GPU geometries, shaders, and particle buffers when disabled or unmounted.

---

## 2. How to Enable and Disable SARA Live Core

### SARA Desktop Application
1. Start the installed SARA application and open its notification-area (tray) menu.
2. Select **Open SARA Live Core**. SARA opens the renderer in its own Electron application window; it does not open a browser tab or replace the main assistant window.
3. Close the Live Core window to return to the existing assistant. Reopen it from the tray menu at any time. Only one Live Core window is created per SARA process.

### In-App Controls
1. **Disable Live Core (Release GPU Resources):**
   - Click **Core Settings** in the bottom-right holographic dock.
   - Toggle **Live Core Renderer** from `Enabled` to `Disabled`.
   - All Three.js geometries, materials, shaders, and animation loops are immediately disposed, placing the surface in low-power standby.
2. **Re-Enable Live Core:**
   - Click **Initialize Live Core** on the standby screen (or toggle **Live Core Renderer** back to `Enabled`).
3. **Minimal presentation (Hide Most HUD Chrome):**
   - Click the HUD mode button (`MINIMAL` / `TELEMETRY` / `ZEN`) in the bottom-right dock until `ZEN` is active, or select **Zen Wallpaper** in **Core Settings → HUD**. This changes the Live Core presentation only; it does not change Windows wallpaper.
4. **Return to Preserved Host Starter View:**
   - Append `?view=existing` to the URL or click **Inspect Preserved Existing Starter View** under **Core Settings → Desktop**.

### Windows desktop surface (opt-in overlay)
1. In the SARA notification-area menu, select **Start Live Core desktop surface**. The C# .NET 8 WebView2 host opens Live Core on the connected displays.
2. Select **Stop Live Core desktop surface** in the SARA tray menu to close it. It is not started automatically; quitting SARA also stops the host.
3. The normal **Open SARA Live Core** command remains available for a regular app window.

This is a borderless interactive overlay in each monitor's usable work area. It is not a video wallpaper, not attached behind Explorer icons, and not a replacement for the Windows shell. The visible overlay covers desktop icons while running; hide/stop it to use the normal desktop. The Windows taskbar is kept outside the overlay. Multi-monitor enumeration is implemented, but mixed-DPI layouts, Explorer restart recovery, and click/context-menu behavior have not been verified as wallpaper behavior. SARA's tray controls provide the supported stop path.

---

## 3. SARA Event Bridge Integration

SARA Live Core never fabricates intelligence states or fake system metrics. When disconnected from a backend, it operates cleanly in standalone mode and displays authentic browser/Web API metrics (`navigator.hardwareConcurrency`, `navigator.onLine`, `performance.memory` where available, and real-time clock).

External SARA backends can drive the core in real time through any of five adapters:

1. **C# .NET 8 WebView2 Host:** `CoreWebView2.PostWebMessageAsJson(json)`
2. **Electron Preload Bridge:** `window.electronAPI.onSaraEvent(callback)`
3. **Cross-Window BroadcastChannel:** `new BroadcastChannel('sara-live-core').postMessage(payload)`
4. **DOM CustomEvent:** `window.dispatchEvent(new CustomEvent('sara:event', { detail: payload }))`
5. **Optional WebSocket Bridge:** Configured by the user in **Core Settings → States → Optional SARA WebSocket Bridge URL**

### Supported Event Payload Schema
```json
{
  "type": "state",
  "state": "thinking",
  "voiceLevel": 0.65,
  "aiModel": "SARA-Core-v4",
  "missionStatus": "Indexing local workspace",
  "cpuUsagePercent": 18,
  "ramUsedGb": 11.4,
  "ramTotalGb": 32.0,
  "themeId": "ultron-blue"
}
```

Valid `state` values: `idle`, `listening`, `thinking`, `speaking`, `executing`, `learning`, `researching`, `warning`, `error`, `completed`.

---

## 4. Windows 10 Pro Desktop Hosting & Technical Limitations

### Why `Progman` / `WorkerW` Injection Is Avoided
Injecting child windows into Windows Explorer's undocumented `WorkerW` hierarchy relies on undocumented `0x052C` messages to `Progman`. Across Windows 10/11 feature updates, wallpaper slideshows, virtual desktops, and DWM composition resets, `WorkerW` parenting frequently detaches or obscures desktop icons.

### Implemented surface and limitations
- **C# .NET 8 WebView2 host (`desktop-host/dotnet/SaraLiveCoreHost/`):** launches Live Core from SARA's tray command, creates one non-activating borderless window per connected display, and uses each monitor's work area so the taskbar remains visible.
- SARA packages the self-contained Windows host; WebView2 Evergreen Runtime is still required on the machine.
- This is a separate top-level overlay. It does not use or attach to `Progman`/`WorkerW`, and desktop-icon visibility, Explorer restart recovery, multi-monitor/DPI behavior, and behind-icons interaction are not certified. Do not describe it as a true behind-icons wallpaper surface.
- The host process is stopped when the tray command is selected again or SARA exits. WebView2 process recovery is handled in the host; automatic restart of the entire native host is not implemented.
