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
      ramDetail = 'Host Telemetry Syncing';
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
      ? 'SARA J.A.R.V.I.S. Core App (Active)'
      : 'SARA J.A.R.V.I.S. Core App (Background)';

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

function mapSaraRuntimeEventToCoreState(raw: Record<string, unknown>): {
  state?: SaraCoreState;
  summary?: string;
  missionStatus?: string;
} {
  const type = String(raw.type || '');
  const payloadObj =
    raw.payload && typeof raw.payload === 'object'
      ? (raw.payload as Record<string, unknown>)
      : raw;

  if (type === 'task.update' || type === 'task.updated' || type === 'task.finished') {
    const task = ((payloadObj.task as Record<string, unknown>) || payloadObj) as Record<
      string,
      unknown
    >;
    const status = String(task.state || task.status || '');
    const goal = String(task.goal || 'Desktop task').slice(0, 48);
    if (status === 'running' || status === 'planning') {
      return {
        state: 'executing',
        summary: `TASK EXECUTING → ${goal}`,
        missionStatus: `Running: ${goal}`,
      };
    }
    if (status === 'completed' || status === 'succeeded') {
      return {
        state: 'completed',
        summary: `TASK COMPLETED → ${goal}`,
        missionStatus: `Completed: ${goal}`,
      };
    }
    if (status === 'waiting_user' || status === 'waiting_confirmation') {
      return {
        state: 'listening',
        summary: `AWAITING BOSS INPUT → ${goal}`,
        missionStatus: `Awaiting confirmation: ${goal}`,
      };
    }
    return {
      state: 'idle',
      summary: `TASK ${status.toUpperCase()} → ${goal}`,
      missionStatus: 'Standby',
    };
  }
  if (type === 'speech.enqueue' || type === 'speech.say') {
    return { state: 'speaking', summary: 'J.A.R.V.I.S. VOICE OUTPUT' };
  }
  if (type === 'speech.done') {
    return { state: 'idle', summary: 'SPEECH COMPLETE' };
  }
  if (type === 'jarvis.simulation' || type === 'ultron.scan_completed') {
    return { state: 'researching', summary: type.toUpperCase() };
  }
  if (type === 'jarvis.blueprint') {
    return { state: 'researching', summary: 'STARK BLUEPRINT RECONSTRUCTION' };
  }
  if (type === 'ultron.evolution' || type === 'ultron.skill_forged') {
    return { state: 'learning', summary: 'ULTRON SELF-EVOLUTION PASS' };
  }
  if (
    type === 'ultron.legion_deployed' ||
    type === 'jarvis.protocol' ||
    type === 'jarvis.protocol_executed' ||
    type === 'optimization.completed'
  ) {
    return { state: 'executing', summary: type.toUpperCase() };
  }
  if (type === 'jarvis.briefing') {
    return { state: 'speaking', summary: 'EXECUTIVE BRIEFING READY' };
  }
  return {};
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
      bridgeStatus: 'connecting',
      bridgeSourceLabel: 'Connecting to SARA Runtime...',
      lastEventTimestamp: null,
      lastEventSummary: 'Establishing J.A.R.V.I.S. Core Telemetry Link',
      operationalStatus: 'J.A.R.V.I.S. Chief-of-Staff Active',
      aiModel: 'Gemini 2.5 / Live Charon',
      missionStatus: 'Standby',
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
      const payload = raw as SaraBridgeEventPayload & Record<string, unknown>;
      if (!payload.type) return;

      const mapped = mapSaraRuntimeEventToCoreState(payload);
      const nextCoreState = payload.state ?? mapped.state;
      if (nextCoreState) {
        stateManager.setState(nextCoreState);
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
          lastEventSummary:
            mapped.summary ??
            `${String(payload.type).toUpperCase()}${
              nextCoreState ? ` → ${nextCoreState}` : ''
            }`,
          operationalStatus:
            payload.operationalStatus ?? prev.operationalStatus,
          aiModel: payload.aiModel !== undefined ? payload.aiModel : prev.aiModel,
          missionStatus:
            payload.missionStatus !== undefined
              ? payload.missionStatus
              : mapped.missionStatus ?? prev.missionStatus,
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

  useEffect(() => {
    return stateManager.subscribe((next) => {
      setActiveState(next);
    });
  }, [stateManager]);

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
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [micStreamActive]);

  // Poll real SARA host telemetry (/api/optimization/status + /api/jarvis/status + /api/tasks)
  useEffect(() => {
    let cancelled = false;

    const syncBackendTelemetry = async () => {
      try {
        const [optRes, jarvisRes, tasksRes] = await Promise.all([
          fetch('/api/optimization/status'),
          fetch('/api/jarvis/status'),
          fetch('/api/tasks'),
        ]);
        if (cancelled) return;
        if (!optRes.ok && !jarvisRes.ok) return;

        const optJson = optRes.ok ? await optRes.json() : null;
        const jarvisJson = jarvisRes.ok ? await jarvisRes.json() : null;
        const tasksJson = tasksRes.ok ? await tasksRes.json() : [];

        const snap = optJson?.snapshot;
        const rawTotalMb = snap?.ramTotalMb ?? snap?.totalMemMb;
        const rawFreeMb = snap?.ramAvailableMb ?? snap?.freeMemMb;
        const totalGb = rawTotalMb ? rawTotalMb / 1024 : null;
        const freeGb = rawFreeMb ? rawFreeMb / 1024 : null;
        const usedGb =
          totalGb !== null && freeGb !== null
            ? Math.max(0, totalGb - freeGb)
            : null;
        const rawRamPct = snap?.ramPercent ?? snap?.usedMemPercent;
        const ramPct =
          typeof rawRamPct === 'number' ? Math.round(rawRamPct) : null;

        const runningTask = Array.isArray(tasksJson)
          ? tasksJson.find(
              (t: { state?: string; status?: string }) =>
                (t.state || t.status) === 'running'
            )
          : null;
        const voiceName = jarvisJson?.voice?.voiceName || 'Charon';
        const voiceStyle = jarvisJson?.voice?.style || 'jarvis';

        setTelemetry((prev) => ({
          ...prev,
          bridgeStatus:
            prev.bridgeStatus === 'disconnected' || prev.bridgeStatus === 'error'
              ? 'connected-websocket'
              : prev.bridgeStatus,
          bridgeSourceLabel: 'SARA Core Runtime Connected',
          operationalStatus: runningTask
            ? `Executing: ${String(runningTask.goal || '').slice(0, 40)}`
            : jarvisJson?.workshop?.auxiliaryPowerReroute
            ? 'Auxiliary Power Reroute Active'
            : 'J.A.R.V.I.S. Autonomous Chief-of-Staff',
          aiModel: `${voiceName} (${String(voiceStyle).toUpperCase()})`,
          missionStatus: runningTask
            ? `Task: ${String(runningTask.goal || '').slice(0, 44)}`
            : `${jarvisJson?.engine?.activeGoalsCount ?? 0} Active Missions`,
          cpuUsagePercent:
            typeof snap?.cpuPercent === 'number'
              ? Math.round(snap.cpuPercent)
              : prev.cpuUsagePercent,
          ramUsagePercent: ramPct ?? prev.ramUsagePercent,
          ramDetail:
            usedGb !== null && totalGb !== null
              ? `${usedGb.toFixed(1)} / ${totalGb.toFixed(1)} GB`
              : prev.ramDetail,
        }));
      } catch {
        // Keep browser telemetry if backend is unreachable
      }
    };

    void syncBackendTelemetry();
    const pollId = window.setInterval(() => {
      void syncBackendTelemetry();
      setTelemetry((prev) => readBrowserTelemetry(prev));
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, []);

  // Attach native bridges (WebView2, Electron, BroadcastChannel, CustomEvent)
  useEffect(() => {
    const w = window as SaraNativeWindow;
    const cleanups: Array<() => void> = [];

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
          'SARA Preload Bridge'
        );
      });
      cleanups.push(unsub);
    }

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

  // Connect to SARA's live /events WebSocket automatically (or custom bridgeWebSocketUrl if set)
  useEffect(() => {
    const defaultEventsWs = `${
      window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    }//${window.location.host}/events`;
    const targetUrl = bridgeWebSocketUrl.trim() || defaultEventsWs;

    let ws: WebSocket | null = null;
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closedByCleanup) return;
      try {
        ws = new WebSocket(targetUrl);
        ws.onopen = () => {
          setTelemetry((prev) => ({
            ...prev,
            bridgeStatus: 'connected-websocket',
            bridgeSourceLabel: 'SARA Live Event Stream (/events)',
          }));
        };
        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(String(ev.data));
            handleIncomingPayload(
              parsed,
              'connected-websocket',
              'SARA Live Event Stream (/events)'
            );
          } catch {
            // Ignore malformed JSON frames
          }
        };
        ws.onclose = () => {
          if (!closedByCleanup) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };
      } catch {
        // Fallback to HTTP polling already active above
      }
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [bridgeWebSocketUrl, handleIncomingPayload]);

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
        lastEventSummary: `CORE OPERATION → ${nextState.toUpperCase()}`,
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
