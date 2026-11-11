# SARA Android companion

This is an isolated mobile project under `mobile/`. Existing Electron, desktop-agent, memory, voice, and screen files are not replaced.

## Web build

```powershell
cd mobile
npm install
$env:VITE_SARA_BACKEND_URL = "https://your-sara-backend.example"
npm run build
```

The mobile UI dispatches real tasks to the existing backend endpoint `POST /api/tasks`. The backend must be reachable over authenticated HTTPS; do not put Gemini keys in this app.

## Android debug APK

Install Android Studio, Android SDK, and Java 17:

```powershell
npm run cap:sync
npx cap add android
npm run android:debug
npm run android:open
```

The generated debug APK is under `mobile/android/app/build/outputs/apk/debug/`.

## Capability boundary

The first mobile shell includes real task dispatch, native Android share, haptics, capability visibility, and the SARA visual language. Direct screen capture, AccessibilityService automation, notification access, media sessions, alarms, and app-specific intents require native Android permission plugins and are shown as unavailable rather than simulated.

For free web hosting, deploy `mobile/dist` to Vercel as a static site. Vercel does not provide access to the local Windows desktop agent; the backend must be separately deployed with authentication and HTTPS.
