import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BridgeConnectionStatus,
  SaraBridgeEventPayload,
  SaraCoreState,
  SystemTelemetrySnapshot,
  ThemeId,
} from '../types';
import { CoreStateManager } from '../states/CoreStateManager';

interface NavigatorWithExtras extends Navigator {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
    downlink?: number;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface SaraNativeWindow extends Window {
  saraBridge?: {
    onEvent?: (cb: (payload: SaraBridgeEventPayload) => void) => () => void;
  };
  electronAPI?: {
    onSaraEvent?: (cb: (payload: SaraBridgeEventPayload) => void) => () => void;
  };
  chrome?: {
    webview?: {
      addEventListener?: (
        type: string,
        listener: (event: { data: unknown }) => void
      ) => void;
      removeEventListener?: (
        type: string,
        listener: (event: { data: unknown }) => void
      ) => void;
      postMessage?: (message: unknown) => void;
    };
  };
}

function readBrowserTelemetry(
  prev: SystemTelemetrySnapshot
): SystemTelemetrySnapshot {
  const nav = navigator as NavigatorWithExtras;
  const perf = performance as PerformanceWithMemory;

  const cpuCoresLogical =
    typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;

  let ramDetail = prev.ramDetail;
  let ramUsagePercent = prev.ramUsagePercent;

  // Only populate browser heap if native host has not provided system-wide RAM
  if (prev.bridgeStatus === 'disconnected' || prev.bridgeStatus === 'error') {
    if (perf.memory && perf.memory.jsHeapSizeLimit > 0) {
      const usedMb = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
      const limitMb = Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024));
      ramUsagePercent = Math.round(
        (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100
      );
      const devMem =
        typeof nav.deviceMemory === 'number'
          ? ` • ${nav.deviceMemory}GB Sys`
          : '';
      ramDetail = `${usedMb}/${limitMb} MB Heap${devMem}`;
    } else if (typeof nav.deviceMemory === 'number') {
      ramDetail = `>= ${nav.deviceMemory} GB System RAM`;
      ramUsagePercent = null;
    } else {
      ramDetail = 'Browser Sandbox Restricted';
      ramUsagePercent = null;
    }
  }

  const online = typeof nav.onLine === 'boolean' ? nav.onLine : true;
  const conn = nav.connection;
  const networkDetail = !online
    ? 'Offline'
    : conn?.effectiveType
    ? `Online (${conn.effectiveType.toUpperCase()}${
        typeof conn.downlink === 'number' ? ` • ${conn.downlink} Mbps` : ''
      })`
    : 'Online';

  const activeApp =
    prev.bridgeStatus !== 'disconnected' && prev.activeApp
      ? prev.activeApp
      : document.hasFocus()
      ? 'SARA Live Core (Active Surface)'
      : 'SARA Live Core (Background)';

  return {
    ...prev,
    cpuCoresLogical,
    ramUsagePercent,
    ramDetail,
    networkOnline: online,
    networkDetail,
    activeApp,
    displayResolution: `${window.screen.width}×${window.screen.height}`,
    devicePixelRatio: Number((window.devicePixelRatio || 1).toFixed(2)),
  };
}

export function useSaraEvents(
  stateManager: CoreStateManager,
  bridgeWebSocketUrl: string,
  onThemeChangeFromBridge?: (themeId: ThemeId) => void
) {
  const [activeState, setActiveState] = useState<SaraCoreState>(() =>
    stateManager.getState()
  );
  const [micStreamActive, setMicStreamActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const [telemetry, setTelemetry] = useState<SystemTelemetrySnapshot>(() =>
    readBrowserTelemetry({
      bridgeStatus: 'disconnected',
      bridgeSourceLabel: 'Standalone WebGL Surface (No Backend Attached)',
      lastEventTimestamp: null,
      lastEventSummary: 'Awaiting SARA backend or host bridge events',
      operationalStatus: 'Standby (Visual Core Active)',
      aiModel: null,
      missionStatus: null,
      activeApp: null,
      cpuCoresLogical: null,
      cpuUsagePercent: null,
      ramUsagePercent: null,
      ramDetail: null,
      networkOnline: true,
      networkDetail: 'Checking...',
      microphoneStatus: 'unknown',
      voiceActivityLevel: 0,
      displayResolution: `${window.screen.width}×${window.screen.height}`,
      devicePixelRatio: Number((window.devicePixelRatio || 1).toFixed(2)),
    })
  );

  const micCleanupRef = useRef<(() => void) | null>(null);

  const handleIncomingPayload = useCallback(
    (
      raw: unknown,
      sourceStatus: BridgeConnectionStatus,
      sourceLabel: string
    ) => {
      if (!raw || typeof raw !== 'object') return;
      const payload = raw as SaraBridgeEventPayload;
      if (!payload.type) return;

      if (payload.state) {
        stateManager.setState(payload.state);
      }
      if (typeof payload.voiceLevel === 'number') {
        stateManager.setVoiceActivity(payload.voiceLevel);
      }
      if (payload.themeId && onThemeChangeFromBridge) {
        onThemeChangeFromBridge(payload.themeId);
      }

      setTelemetry((prev) => {
        let nextRamDetail = prev.ramDetail;
        let nextRamPct = prev.ramUsagePercent;
        if (
          typeof payload.ramUsedGb === 'number' &&
          typeof payload.ramTotalGb === 'number' &&
          payload.ramTotalGb > 0
        ) {
          nextRamPct = Math.round(
            (payload.ramUsedGb / payload.ramTotalGb) * 100
          );
          nextRamDetail = `${payload.ramUsedGb.toFixed(1)} / ${payload.ramTotalGb.toFixed(1)} GB`;
        } else if (typeof payload.ramUsagePercent === 'number') {
          nextRamPct = Math.round(payload.ramUsagePercent);
        }

        return {
          ...prev,
          bridgeStatus: sourceStatus,
          bridgeSourceLabel: sourceLabel,
          lastEventTimestamp: payload.timestamp ?? Date.now(),
          lastEventSummary: `${payload.type.toUpperCase()}${
            payload.state ? ` → ${payload.state}` : ''
          }`,
          operationalStatus:
            payload.operationalStatus ?? prev.operationalStatus,
          aiModel: payload.aiModel !== undefined ? payload.aiModel : prev.aiModel,
          missionStatus:
            payload.missionStatus !== undefined
              ? payload.missionStatus
              : prev.missionStatus,
          activeApp:
            payload.activeApp !== undefined ? payload.activeApp : prev.activeApp,
          cpuUsagePercent:
            typeof payload.cpuUsagePercent === 'number'
              ? Math.round(payload.cpuUsagePercent)
              : prev.cpuUsagePercent,
          ramUsagePercent: nextRamPct,
          ramDetail: nextRamDetail,
          microphoneStatus:
            payload.microphoneActive === true
              ? 'active-mic'
              : prev.microphoneStatus,
          voiceActivityLevel:
            typeof payload.voiceLevel === 'number'
              ? payload.voiceLevel
              : prev.voiceActivityLevel,
        };
      });
    },
    [stateManager, onThemeChangeFromBridge]
  );

  // Subscribe to CoreStateManager state changes
  useEffect(() => {
    return stateManager.subscribe((next) => {
      setActiveState(next);
    });
  }, [stateManager]);

  // Query real microphone permission state
  useEffect(() => {
    let mounted = true;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (!mounted) return;
          const mapPerm = (s: PermissionState) =>
            s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';
          setTelemetry((prev) => ({
            ...prev,
            microphoneStatus: micStreamActive
              ? 'active-mic'
              : mapPerm(status.state),
          }));
          status.onchange = () => {
            if (!mounted) return;
            setTelemetry((prev) => ({
              ...prev,
              microphoneStatus: micStreamActive
                ? 'active-mic'
                : mapPerm(status.state),
            }));
          };
        })
        .catch(() => {
          // Permissions API not supported for microphone in this browser
        });
    }
    return () => {
      mounted = false;
    };
  }, [micStreamActive]);

  // Refresh real browser telemetry on interval + network/focus events
  useEffect(() => {
    const refresh = () => {
      setTelemetry((prev) => readBrowserTelemetry(prev));
    };

    const interval = window.setInterval(refresh, 2000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('blur', refresh);
    window.addEventListener('resize', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('blur', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  // Attach native bridges (WebView2, Electron, BroadcastChannel, CustomEvent)
  useEffect(() => {
    const w = window as SaraNativeWindow;
    const cleanups: Array<() => void> = [];

    // 1. C# .NET 8 WebView2 Host Bridge
    if (w.chrome?.webview?.addEventListener) {
      const onWebViewMessage = (ev: { data: unknown }) => {
        const msg =
          typeof ev.data === 'string'
            ? (() => {
                try {
                  return JSON.parse(ev.data);
                } catch {
                  return null;
                }
              })()
            : ev.data;
        handleIncomingPayload(
          msg,
          'connected-webview2',
          'C# .NET 8 WebView2 Desktop Host'
        );
      };
      w.chrome.webview.addEventListener('message', onWebViewMessage);
      cleanups.push(() =>
        w.chrome?.webview?.removeEventListener?.('message', onWebViewMessage)
      );
    }

    // 2. Electron Preload Bridge
    if (w.electronAPI?.onSaraEvent) {
      const unsub = w.electronAPI.onSaraEvent((payload) => {
        handleIncomingPayload(
          payload,
          'connected-electron',
          'Electron Desktop Host IPC'
        );
      });
      cleanups.push(unsub);
    }

    if (w.saraBridge?.onEvent) {
      const unsub = w.saraBridge.onEvent((payload) => {
        handleIncomingPayload(
          payload,
          'connected-electron',
          'SARA Native Bridge'
        );
      });
      cleanups.push(unsub);
    }

    // 3. Cross-Window BroadcastChannel ('sara-live-core')
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('sara-live-core');
      bc.onmessage = (ev: MessageEvent) => {
        handleIncomingPayload(
          ev.data,
          'connected-broadcast',
          'SARA Cross-Window BroadcastChannel'
        );
      };
      cleanups.push(() => bc?.close());
    }

    // 4. DOM CustomEvent ('sara:event') & window.postMessage
    const onCustomEvent = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      handleIncomingPayload(
        detail,
        'connected-broadcast',
        'SARA DOM Event Bus'
      );
    };
    window.addEventListener('sara:event', onCustomEvent);
    cleanups.push(() => window.removeEventListener('sara:event', onCustomEvent));

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [handleIncomingPayload]);

  // Optional user-configured WebSocket bridge
  useEffect(() => {
    const trimmed = bridgeWebSocketUrl.trim();
    if (!trimmed) return;

    let ws: WebSocket | null = null;
    let closedByCleanup = false;

    try {
      setTelemetry((prev) => ({
        ...prev,
        bridgeStatus: 'connecting',
        bridgeSourceLabel: `Connecting to ${trimmed}...`,
      }));

      ws = new WebSocket(trimmed);
      ws.onopen = () => {
        setTelemetry((prev) => ({
          ...prev,
          bridgeStatus: 'connected-websocket',
          bridgeSourceLabel: `WebSocket (${trimmed})`,
        }));
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data));
          handleIncomingPayload(
            parsed,
            'connected-websocket',
            `WebSocket (${trimmed})`
          );
        } catch {
          // Ignore malformed JSON frames
        }
      };
      ws.onerror = () => {
        if (!closedByCleanup) {
          setTelemetry((prev) => ({
            ...prev,
            bridgeStatus: 'error',
            bridgeSourceLabel: `WebSocket Error (${trimmed})`,
          }));
        }
      };
      ws.onclose = () => {
        if (!closedByCleanup) {
          setTelemetry((prev) => ({
            ...prev,
            bridgeStatus: 'disconnected',
            bridgeSourceLabel: 'Standalone WebGL Surface (WebSocket Closed)',
          }));
        }
      };
    } catch {
      setTelemetry((prev) => ({
        ...prev,
        bridgeStatus: 'error',
        bridgeSourceLabel: `Invalid WebSocket URL (${trimmed})`,
      }));
    }

    return () => {
      closedByCleanup = true;
      ws?.close();
    };
  }, [bridgeWebSocketUrl, handleIncomingPayload]);

  // Optional real Web Audio microphone voice-activity analyser (user-initiated)
  const toggleMicrophoneReactivity = useCallback(async () => {
    if (micStreamActive && micCleanupRef.current) {
      micCleanupRef.current();
      micCleanupRef.current = null;
      setMicStreamActive(false);
      stateManager.setVoiceActivity(0);
      setTelemetry((prev) => ({
        ...prev,
        microphoneStatus: 'granted',
        voiceActivityLevel: 0,
      }));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Microphone API unavailable in this browser context.');
      return;
    }

    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      let lastUiSync = 0;

      const sampleAudio = (now: number) => {
        raf = requestAnimationFrame(sampleAudio);
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const level = Math.min(1, Math.max(0, (rms - 0.015) * 5.5));
        stateManager.setVoiceActivity(level);

        if (now - lastUiSync > 120) {
          lastUiSync = now;
          setTelemetry((prev) => ({
            ...prev,
            microphoneStatus: 'active-mic',
            voiceActivityLevel: level,
          }));
        }
      };

      raf = requestAnimationFrame(sampleAudio);
      setMicStreamActive(true);
      setTelemetry((prev) => ({
        ...prev,
        microphoneStatus: 'active-mic',
      }));

      micCleanupRef.current = () => {
        cancelAnimationFrame(raf);
        source.disconnect();
        ctx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
      };
    } catch (err) {
      setMicError(
        err instanceof Error ? err.message : 'Microphone permission denied.'
      );
    }
  }, [micStreamActive, stateManager]);

  useEffect(() => {
    return () => {
      micCleanupRef.current?.();
    };
  }, []);

  // Diagnostic preview trigger (explicitly labeled in UI as manual diagnostic test)
  const triggerDiagnosticState = useCallback(
    (nextState: SaraCoreState, simulatedVoiceLevel?: number) => {
      stateManager.setState(nextState);
      if (typeof simulatedVoiceLevel === 'number') {
        stateManager.setVoiceActivity(simulatedVoiceLevel);
      } else if (nextState !== 'speaking') {
        stateManager.setVoiceActivity(0);
      }

      setTelemetry((prev) => ({
        ...prev,
        lastEventTimestamp: Date.now(),
        lastEventSummary: `DIAGNOSTIC → ${nextState.toUpperCase()}`,
        voiceActivityLevel:
          typeof simulatedVoiceLevel === 'number'
            ? simulatedVoiceLevel
            : nextState === 'speaking'
            ? prev.voiceActivityLevel
            : 0,
      }));
    },
    [stateManager]
  );

  return {
    activeState,
    telemetry,
    micStreamActive,
    micError,
    toggleMicrophoneReactivity,
    triggerDiagnosticState,
  };
}
