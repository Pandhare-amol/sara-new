import {StrictMode, lazy, Suspense, useEffect, useState, useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ApiKeyGate} from './components/ApiKeyGate.tsx';
import {CrashGuard} from './components/CrashGuard.tsx';
import {OwnerAuthGate} from './components/OwnerAuthGate.tsx';
import {api} from './lib/appApi.ts';
import './index.css';

// The desktop companion window loads the same bundle with ?mode=companion and
// renders only the character, without the app shell or key gate.
const CompanionApp = lazy(() => import('./companion/CompanionApp.tsx'));
// J.A.R.V.I.S. Live Core (assets/core ui) is kept completely separate from Classic SARA UI.
const LiveCoreApp = lazy(() =>
  import('../assets/core ui/src/sara-live-core/LiveCoreApp.tsx').then((module) => ({
    default: module.LiveCoreApp,
  })),
);
// Separate ULTRON Cybernetic Hive-Mind UI.
const UltronApp = lazy(() =>
  import('./ultron_ui/UltronApp.tsx').then((module) => ({
    default: module.UltronApp,
  })),
);
// SARA Spatial 2050 Desktop is also completely separate from Classic SARA UI.
const SaraOsApp = lazy(() =>
  import('./sara_os/SaraOsApp.tsx').then((module) => ({
    default: module.SaraOsApp,
  })),
);
// Windows 10 Pro Central Operating Layer + Live Wallpaper + 3-Factor Boot Gate UI.
const CentralOsApp = lazy(() =>
  import('./central_os/CentralOsApp.tsx').then((module) => ({
    default: module.CentralOsApp,
  })),
);
// V.I.S.I.O.N. & Avengers AI Pantheon Deck + E.D.I.T.H. AR Lens + G.R.I.O.T. Remote Cockpit.
const VisionApp = lazy(() =>
  import('./vision_ui/VisionApp.tsx').then((module) => ({
    default: module.VisionApp,
  })),
);
const EdithArLensView = lazy(() =>
  import('./vision_ui/EdithArLensView.tsx').then((module) => ({
    default: module.EdithArLensView,
  })),
);
const GriotRemoteCockpitView = lazy(() =>
  import('./vision_ui/GriotRemoteCockpitView.tsx').then((module) => ({
    default: module.GriotRemoteCockpitView,
  })),
);

type SurfaceMode = 'companion' | 'live_core' | 'ultron' | 'vision' | 'sara_os' | 'central_os';

const isValidSurface = (val: unknown): val is SurfaceMode =>
  val === 'companion' ||
  val === 'live_core' ||
  val === 'ultron' ||
  val === 'vision' ||
  val === 'sara_os' ||
  val === 'central_os';

const urlMode = new URLSearchParams(location.search).get('mode');
const pathname = location.pathname.replace(/\/+$/, '') || '/';
const isCompanion = urlMode === 'companion';
const isEdithRoute = pathname === '/edith' || urlMode === 'edith';
const isGriotRoute = pathname === '/remote-cockpit' || urlMode === 'remote-cockpit';
const forceLiveCore = urlMode === 'live-core';
const forceUltron = urlMode === 'ultron';
const forceVision = urlMode === 'vision';
const forceSaraOs = urlMode === 'sara-os';
const forceCentralOs = urlMode === 'central-os';
const forceClassic = urlMode === 'classic';

function RootSurfaceRouter() {
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(
    forceLiveCore
      ? 'live_core'
      : forceUltron
      ? 'ultron'
      : forceVision
      ? 'vision'
      : forceSaraOs
      ? 'sara_os'
      : forceCentralOs
      ? 'central_os'
      : 'companion',
  );

  useEffect(() => {
    if (forceLiveCore || forceUltron || forceVision || forceSaraOs || forceCentralOs || forceClassic) return;
    let cancelled = false;
    void api
      .appSettings()
      .then((s) => {
        if (!cancelled && isValidSurface(s?.jarvis?.surfaceMode)) {
          setSurfaceMode(s.jarvis.surfaceMode);
        }
      })
      .catch(() => undefined);

    const onCustomSwitch = (ev: Event) => {
      const detail = (ev as CustomEvent<{surfaceMode?: string}>).detail;
      if (isValidSurface(detail?.surfaceMode)) {
        setSurfaceMode(detail.surfaceMode);
      }
    };
    window.addEventListener('sara:surface-mode-change', onCustomSwitch);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connectEventsWs = () => {
      if (cancelled) return;
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${location.host}/events`);
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(String(e.data));
            const nextFromEvent =
              msg?.type === 'model.status' && msg?.payload?.kind === 'settings_changed'
                ? msg.payload.surfaceMode
                : msg?.type === 'settings'
                ? msg.settings?.jarvis?.surfaceMode
                : undefined;
            if (isValidSurface(nextFromEvent)) {
              setSurfaceMode(nextFromEvent);
            }
          } catch {
            // Ignore malformed event
          }
        };
        ws.onclose = () => {
          if (!cancelled) {
            reconnectTimer = window.setTimeout(connectEventsWs, 2500);
          }
        };
      } catch {
        // Ignore WS connect errors
      }
    };
    connectEventsWs();

    return () => {
      cancelled = true;
      window.removeEventListener('sara:surface-mode-change', onCustomSwitch);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const handleSwitchSurface = useCallback((target: SurfaceMode) => {
    if ((forceLiveCore || forceUltron || forceVision || forceSaraOs || forceCentralOs) && target === 'companion') {
      const bridge = (window as unknown as {
        sara?: {focusMainShell?: () => Promise<unknown>; windowClose?: () => Promise<unknown>};
      }).sara;
      if (bridge?.focusMainShell) {
        void bridge.focusMainShell();
        return;
      }
      window.location.href = '/?mode=classic';
      return;
    }
    setSurfaceMode(target);
    if (target === 'companion' || target === 'live_core' || target === 'ultron' || target === 'vision') {
      const personaTarget =
        target === 'live_core'
          ? 'jarvis'
          : target === 'ultron'
            ? 'ultron'
            : target === 'vision'
              ? 'vision'
              : 'sara';
      void fetch('/api/persona/switch', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({target: personaTarget}),
      }).catch(() => {
        void api.updateAppSettings({jarvis: {surfaceMode: target}}).catch(() => undefined);
      });
    } else {
      void api.updateAppSettings({jarvis: {surfaceMode: target}}).catch(() => undefined);
    }
  }, []);

  const handleSwitchToClassicShell = useCallback(() => {
    handleSwitchSurface('companion');
  }, [handleSwitchSurface]);

  if (isCompanion) {
    return (
      <Suspense fallback={null}>
        <CompanionApp />
      </Suspense>
    );
  }

  if (isEdithRoute) {
    return (
      <Suspense fallback={null}>
        <div className="h-screen w-screen bg-[#020916] p-2">
          <EdithArLensView onBack={() => { window.location.href = '/'; }} />
        </div>
      </Suspense>
    );
  }

  if (isGriotRoute) {
    return (
      <Suspense fallback={null}>
        <div className="h-screen w-screen bg-[#050314] p-2">
          <GriotRemoteCockpitView onBack={() => { window.location.href = '/'; }} />
        </div>
      </Suspense>
    );
  }

  if (surfaceMode === 'vision') {
    return (
      <ApiKeyGate>
        <Suspense fallback={null}>
          <VisionApp onSwitchSurface={handleSwitchSurface} />
        </Suspense>
      </ApiKeyGate>
    );
  }

  if (surfaceMode === 'live_core') {
    return (
      <OwnerAuthGate>
        <ApiKeyGate>
          <Suspense fallback={null}>
            <LiveCoreApp
              onSwitchToExistingShell={handleSwitchToClassicShell}
              onSwitchSurface={handleSwitchSurface}
            />
          </Suspense>
        </ApiKeyGate>
      </OwnerAuthGate>
    );
  }

  if (surfaceMode === 'ultron') {
    return (
      <OwnerAuthGate>
        <ApiKeyGate>
          <Suspense fallback={null}>
            <UltronApp onSwitchSurface={handleSwitchSurface} />
          </Suspense>
        </ApiKeyGate>
      </OwnerAuthGate>
    );
  }

  if (surfaceMode === 'sara_os') {
    return (
      <OwnerAuthGate>
        <ApiKeyGate>
          <Suspense fallback={null}>
            <SaraOsApp onSwitchSurface={handleSwitchSurface} />
          </Suspense>
        </ApiKeyGate>
      </OwnerAuthGate>
    );
  }

  if (surfaceMode === 'central_os') {
    return (
      <ApiKeyGate>
        <Suspense fallback={null}>
          <CentralOsApp onSwitchSurface={handleSwitchSurface} />
        </Suspense>
      </ApiKeyGate>
    );
  }

  return (
    <OwnerAuthGate>
      <ApiKeyGate>
        <App />
      </ApiKeyGate>
    </OwnerAuthGate>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
      <RootSurfaceRouter />
    </CrashGuard>
  </StrictMode>,
);
