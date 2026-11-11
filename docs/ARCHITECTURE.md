# SARA Windows architecture

SARA runs as an Electron/React interface over the existing Windows installation.
The Node backend coordinates Gemini, permissions, missions, memory, and the
Python Desktop Agent. The authenticated .NET Windows Bridge provides bounded
native observations and validated window operations over loopback IPC.

The experimental `SaraDesktopHost` is isolated from the bridge. It currently
inspects `Progman -> SHELLDLL_DefView -> SysListView32` and can show a small,
explicitly opt-in non-parented diagnostic surface. It does not reparent Explorer
windows, intercept desktop input, or replace the shell.

Security boundaries:

- Renderer code never receives the native bridge token.
- Backend authorization is required before window management.
- Native operations validate HWND and owning process identity.
- Explorer, Windows login, Credential Provider, and CustomShell remain untouched.
- The experimental surface is disabled unless explicitly enabled.
