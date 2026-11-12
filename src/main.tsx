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
// Live Core (assets/core ui) is kept completely separate from Classic SARA UI.
const LiveCoreApp = lazy(() =>
  import('../assets/core ui/src/sara-live-core/LiveCoreApp.tsx').then((module) => ({
    default: module.LiveCoreApp,
  })),
);
// SARA OS 4-Theme Morphing Futuristic Desktop is also completely separate from Classic SARA UI.
const SaraOsApp = lazy(() =>
  import('./sara_os/SaraOsApp.tsx').then((module) => ({
    default: module.SaraOsApp,
  })),
);

const urlMode = new URLSearchParams(location.search).get('mode');
const isCompanion = urlMode === 'companion';
const forceLiveCore = urlMode === 'live-core';
const forceSaraOs = urlMode === 'sara-os';
const forceClassic = urlMode === 'classic';

function RootSurfaceRouter() {
  const [surfaceMode, setSurfaceMode] = useState<'companion' | 'live_core' | 'sara_os'>(
    forceLiveCore ? 'live_core' : forceSaraOs ? 'sara_os' : 'companion',
  );

  useEffect(() => {
    if (forceLiveCore || forceSaraOs || forceClassic) return;
    let cancelled = false;
    void api
      .appSettings()
      .then((s) => {
        if (!cancelled && (s?.jarvis?.surfaceMode === 'live_core' || s?.jarvis?.surfaceMode === 'sara_os')) {
          setSurfaceMode(s.jarvis.surfaceMode);
        }
      })
      .catch(() => undefined);

    const onCustomSwitch = (ev: Event) => {
      const detail = (ev as CustomEvent<{surfaceMode?: string}>).detail;
      if (detail?.surfaceMode === 'live_core' || detail?.surfaceMode === 'sara_os' || detail?.surfaceMode === 'companion') {
        setSurfaceMode(detail.surfaceMode);
      }
    };
    window.addEventListener('sara:surface-mode-change', onCustomSwitch);

    let ws: WebSocket | null = null;
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/events`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg?.type === 'settings') {
            const nextMode = msg.settings?.jarvis?.surfaceMode;
            if (nextMode === 'live_core' || nextMode === 'sara_os' || nextMode === 'companion') {
              setSurfaceMode(nextMode);
            }
          }
        } catch {
          // Ignore malformed event
        }
      };
    } catch {
      // Ignore WS connect errors
    }

    return () => {
      cancelled = true;
      window.removeEventListener('sara:surface-mode-change', onCustomSwitch);
      ws?.close();
    };
  }, []);

  const handleSwitchSurface = useCallback((target: 'companion' | 'live_core') => {
    if ((forceLiveCore || forceSaraOs) && target === 'companion') {
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
    void api.updateAppSettings({jarvis: {surfaceMode: target}}).catch(() => undefined);
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

  if (surfaceMode === 'live_core') {
    return (
      <OwnerAuthGate>
        <Suspense fallback={null}>
          <LiveCoreApp onSwitchToExistingShell={handleSwitchToClassicShell} />
        </Suspense>
      </OwnerAuthGate>
    );
  }

  if (surfaceMode === 'sara_os') {
    return (
      <OwnerAuthGate>
        <Suspense fallback={null}>
          <SaraOsApp onSwitchSurface={handleSwitchSurface} />
        </Suspense>
      </OwnerAuthGate>
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
