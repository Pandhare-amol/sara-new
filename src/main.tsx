import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ApiKeyGate} from './components/ApiKeyGate.tsx';
import {CrashGuard} from './components/CrashGuard.tsx';
import './index.css';

// The desktop companion window loads the same bundle with ?mode=companion and
// renders only the character, without the app shell or key gate.
const CompanionApp = lazy(() => import('./companion/CompanionApp.tsx'));
// Live Core is an optional desktop-app surface. Keep it lazy and out of the
// normal assistant bundle path until Electron opens it with its dedicated mode.
const LiveCoreApp = lazy(() =>
  import('../assets/core ui/src/sara-live-core/LiveCoreApp.tsx').then((module) => ({
    default: module.LiveCoreApp,
  })),
);
const isCompanion = new URLSearchParams(location.search).get('mode') === 'companion';
const isLiveCore = new URLSearchParams(location.search).get('mode') === 'live-core';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashGuard>
    {isLiveCore ? (
      <Suspense fallback={null}>
        <LiveCoreApp />
      </Suspense>
    ) : isCompanion ? (
      <Suspense fallback={null}>
        <CompanionApp />
      </Suspense>
    ) : (
      <ApiKeyGate><App /></ApiKeyGate>
    )}
    </CrashGuard>
  </StrictMode>,
);
