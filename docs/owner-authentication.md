# SARA owner authentication

SARA now has a local owner session gate for PC-control tools.

## What is protected

- The owner PIN is validated with `scrypt` and a per-enrollment random salt.
- The encrypted record is stored through the existing Windows DPAPI-backed
  `SecretStore`; the PIN is never logged or returned to the renderer.
- Five failed attempts trigger exponential lockout.
- Successful authentication creates an in-memory session with idle and absolute
  expiry. The token is never persisted.
- Windows lock and sleep clear the session when the setting is enabled.
- `ActionExecutor` rejects desktop actions while locked, even if a renderer or
  crafted WebSocket request tries to call a tool directly.

## Current factor availability

PIN is implemented and is the only factor that can unlock desktop-control
actions. The separate `auth/` folder contains legacy offline OpenCV-LBPH face
matching and MFCC voice similarity code. Those matchers are not Windows Hello,
the voice matcher documents that recordings may fool it, and the legacy modules
store biometric templates outside Sara's DPAPI-protected secret store. Sara does
not import or call those modules for owner authorization, and their Settings
switches are disabled. They must not be used as the sole factor for unlocking
desktop control or other sensitive actions.

Before biometric integration, a Windows-specific provider must capture and
protect enrollment data under the current Windows user, include a tested liveness
and spoof-resistance design, require the PIN as a second factor, and fail closed
when its runtime dependencies or Windows protections are unavailable. Windows
Hello is not currently integrated.

## Reset

Open **Settings → Security**. A valid owner PIN is required to reset enrollment.
If the PIN is lost, use the existing local data reset/recovery procedure; SARA
does not provide a bypass that could unlock PC-control tools.

Authentication audit records contain only success/failure/lock events and no
PIN, face data, voice data, screenshots, or audio.
