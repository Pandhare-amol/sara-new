import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  HardDrive,
  Lock,
  Mic,
  MicOff,
  Monitor,
  Network,
  Power,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import {
  SaraBootSecurityGate,
  playSaraWelcomeSequence,
  type BootGateStatusView,
} from './SaraBootSecurityGate';
import { LiveDepartmentCommandView } from './LiveDepartmentCommandView';
import { SaraAudioSession, type LiveState } from '../lib/saraAudio';
import { SettingsPanel as SaraGlobalSettingsPanel } from '../components/SettingsPanel';
import { api, type AppSettings, type AppSettingsPatch } from '../lib/appApi';
import { loadSettings, saveSettings, type SaraSettings } from '../lib/saraSettingsStore';

interface HostHealth {
  hostOs: string;
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramFreeGb: number;
  ramPercent: number;
  saraKernelRssMb: number;
  wallpaperEmbedded: boolean;
  onlineNodes: string[];
}

interface ColNode {
  nodeId: string;
  nodeType: string;
  label: string;
  capabilities: string[];
  status: 'ONLINE' | 'OFFLINE';
  lastSeen: string;
  builtIn?: boolean;
}

interface CommandFeedEntry {
  id: string;
  role: 'boss' | 'sara';
  text: string;
  at: number;
}

export interface CentralOsAppProps {
  onSwitchSurface: (mode: 'companion' | 'live_core' | 'ultron' | 'vision' | 'sara_os' | 'central_os') => void;
}

export const CentralOsApp: React.FC<CentralOsAppProps> = ({ onSwitchSurface }) => {
  const [bootGate, setBootGate] = useState<BootGateStatusView | null>(null);
  const [showBootGateOverlay, setShowBootGateOverlay] = useState(false);

  const [hostHealth, setHostHealth] = useState<HostHealth | null>(null);
  const [nodes, setNodes] = useState<ColNode[]>([]);
  const [wallpaperMode, setWallpaperMode] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'live_command' | 'wallpaper_hud' | 'layers_trainer' | 'frontier_suite' | 'nodes' | 'win10_plan'
  >('live_command');

  // Wave 4: 3-Layer Control + Smart Half-Task + Autonomous Skill Trainer
  const [layerGoal, setLayerGoal] = useState('Check git status cleanly via Layer 1 Shell');
  const [preferredLayer, setPreferredLayer] = useState<'auto' | 'layer1_shell' | 'layer2_uia' | 'layer3_vision'>('auto');
  const [layerShellCmd, setLayerShellCmd] = useState('git status --short');
  const [lastLayerResult, setLastLayerResult] = useState<Record<string, any> | null>(null);

  const [halfTaskInput, setHalfTaskInput] = useState('play arjit song');
  const [halfTaskResult, setHalfTaskResult] = useState<Record<string, any> | null>(null);

  const [skillTopicInput, setSkillTopicInput] = useState('csv_row_summary_analyzer');
  const [masteredSkills, setMasteredSkills] = useState<Array<Record<string, any>>>([]);
  const [skillOutput, setSkillOutput] = useState<string>('');

  // Wave 4: Coworker, Platform, Frontier, Hologram & Soul Capsule
  const [frontierStatus, setFrontierStatus] = useState<Record<string, any> | null>(null);
  const [clipboardInput, setClipboardInput] = useState('SELECT * FROM attendance WHERE present = 0');
  const [clipboardMode, setClipboardMode] = useState<'explain' | 'fix_code' | 'to_typescript' | 'to_sql' | 'to_markdown_table'>('to_typescript');
  const [clipboardOutput, setClipboardOutput] = useState('');
  const [widgetPrompt, setWidgetPrompt] = useState('25-minute AttendEasy sprint timer & checklist');
  const [activeWidgetHtml, setActiveWidgetHtml] = useState('');
  const [boardroomDilemma, setBoardroomDilemma] = useState('Should we keep SQLite WAL locally or migrate to a cloud DB?');
  const [boardroomOut, setBoardroomOut] = useState<Record<string, any> | null>(null);
  const [butterflyTarget, setButterflyTarget] = useState('runtime/saraRuntime.ts');
  const [butterflyOut, setButterflyOut] = useState<Record<string, any> | null>(null);
  const [screenRecallQuery, setScreenRecallQuery] = useState('');
  const [screenRecallMatches, setScreenRecallMatches] = useState<Array<Record<string, any>>>([]);
  const [morningDiff, setMorningDiff] = useState('');
  const [soulCapsulePreview, setSoulCapsulePreview] = useState('');
  const [holoMirrorActive, setHoloMirrorActive] = useState(false);
  const [holoFrame, setHoloFrame] = useState<Record<string, any> | null>(null);
  const holoSocketRef = useRef<WebSocket | null>(null);

  // Alt+Space Floating Spotlight Command Bar
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [busy, setBusy] = useState(false);
  const spotlightInputRef = useRef<HTMLInputElement | null>(null);

  // Credential Enrollment Inputs
  const [newPassword, setNewPassword] = useState('');
  const [newVoicePhrase, setNewVoicePhrase] = useState('');
  const [configMsg, setConfigMsg] = useState('');

  // Simulated Hardware Spoke Connection (`esp32_lab`)
  const [simLabConnected, setSimLabConnected] = useState(false);
  const simSocketRef = useRef<WebSocket | null>(null);

  // Full-Duplex Gemini Live Voice ("Hey SARA")
  const [liveState, setLiveState] = useState<LiveState>('disconnected');
  const [micPaused, setMicPaused] = useState(false);
  const [speechMuted, setSpeechMuted] = useState(false);
  const liveSessionRef = useRef<SaraAudioSession | null>(null);

  // Global SARA Settings Modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saraLocalSettings, setSaraLocalSettings] = useState<SaraSettings>(() => loadSettings());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [feed, setFeed] = useState<CommandFeedEntry[]>([
    {
      id: 'col-ready',
      role: 'sara',
      text: "SARA Central Operating Layer online across Windows 10 Pro. Zero capability locks active — speak ('Hey SARA') or press Alt + Space to control apps, files, screen vision, wallpaper, and connected hardware nodes.",
      at: Date.now(),
    },
  ]);

  const appendSara = useCallback((text: string) => {
    setFeed((prev) => [
      ...prev.slice(-24),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'sara', text, at: Date.now() },
    ]);
  }, []);

  const refreshColStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/col/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.hostHealth) setHostHealth(data.hostHealth);
      if (Array.isArray(data.nodes)) setNodes(data.nodes);
      if (typeof data.wallpaperEmbedded === 'boolean') setWallpaperMode(data.wallpaperEmbedded);
      if (data.bootGate) {
        setBootGate(data.bootGate);
        if (data.bootGate.gateLocked) setShowBootGateOverlay(true);
      }
    } catch {
      // Resilient background poll
    }
  }, []);

  const refreshWave4Data = useCallback(async () => {
    try {
      const [skillsRes, frontierRes] = await Promise.all([
        api.colListSkills(),
        api.colFrontierStatus(),
      ]);
      if (Array.isArray(skillsRes.skills)) setMasteredSkills(skillsRes.skills);
      setFrontierStatus(frontierRes);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void refreshColStatus();
    void refreshWave4Data();
    void api.appSettings().then(setAppSettings).catch(() => undefined);
    const timer = window.setInterval(() => void refreshColStatus(), 3500);
    return () => window.clearInterval(timer);
  }, [refreshColStatus, refreshWave4Data]);

  // Global Alt + Space Instant Text Command Bar + Ctrl + Shift + S Ghost Clipboard Hotkey
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
      } else if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        setActiveTab('frontier_suite');
        void navigator.clipboard
          ?.readText()
          .then((txt) => {
            if (txt && txt.trim()) setClipboardInput(txt.trim());
          })
          .catch(() => undefined);
      } else if (e.key === 'Escape' && spotlightOpen) {
        setSpotlightOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [spotlightOpen]);

  // Holographic Spatial Projection Bridge (`/ws/holo`)
  useEffect(() => {
    if (!holoMirrorActive) {
      holoSocketRef.current?.close();
      holoSocketRef.current = null;
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/holo`);
    holoSocketRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data));
        if (parsed.type === 'HOLO_FRAME') setHoloFrame(parsed);
      } catch {
        // Ignore
      }
    };
    return () => {
      ws.close();
      holoSocketRef.current = null;
    };
  }, [holoMirrorActive]);

  useEffect(() => {
    if (spotlightOpen) {
      window.setTimeout(() => spotlightInputRef.current?.focus(), 40);
    }
  }, [spotlightOpen]);

  // Gemini Live Voice Session
  useEffect(() => {
    const session = new SaraAudioSession({
      onStateChange: (st) => {
        setLiveState(st);
        if (st === 'disconnected') setMicPaused(false);
      },
      onTranscription: (role, text) => {
        if (!text.trim()) return;
        setFeed((prev) => [
          ...prev.slice(-24),
          {
            id: `${Date.now()}-${role}`,
            role: role === 'user' ? 'boss' : 'sara',
            text,
            at: Date.now(),
          },
        ]);
      },
      onToolCall: (_name, _args, cb) => {
        cb({ result: 'Executed by SARA Central Operating Layer.' });
      },
      onError: (err) => appendSara(`Voice notice: ${err}`),
    });
    liveSessionRef.current = session;
    return () => {
      session.disconnect();
      liveSessionRef.current = null;
      simSocketRef.current?.close();
    };
  }, [appendSara]);

  useEffect(() => {
    liveSessionRef.current?.setSpeechMuted(speechMuted);
  }, [speechMuted]);

  const toggleVoice = async () => {
    const s = liveSessionRef.current;
    if (!s) return;
    if (liveState !== 'disconnected') {
      s.disconnect();
      return;
    }
    try {
      await s.connect(true);
    } catch (err) {
      appendSara(err instanceof Error ? err.message : 'Unable to start live voice.');
    }
  };

  const sendCentralCommand = async (overrideText?: string) => {
    const text = (overrideText ?? commandInput).trim();
    if (!text) return;
    if (!overrideText) setCommandInput('');
    setSpotlightOpen(false);

    setFeed((prev) => [...prev.slice(-24), { id: `${Date.now()}-u`, role: 'boss', text, at: Date.now() }]);
    setBusy(true);
    try {
      const res = await fetch('/api/col/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text, source: 'wallpaper_hud' }),
      });
      const data = await res.json().catch(() => ({}));
      appendSara(data.reply || data.error || 'Command executed.');
      await refreshColStatus();
    } catch (err) {
      appendSara(err instanceof Error ? err.message : 'Central Operating Layer unreachable.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleWallpaper = async () => {
    const next = !wallpaperMode;
    const bridge = (window as unknown as {
      sara?: { setWallpaperMode?: (enabled: boolean) => Promise<{ enabled?: boolean }> };
    }).sara;
    await bridge?.setWallpaperMode?.(next).catch(() => undefined);
    const res = await fetch('/api/col/wallpaper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    const data = await res.json().catch(() => ({}));
    setWallpaperMode(Boolean(data.enabled));
    appendSara(data.detail || (next ? 'Wallpaper mode enabled.' : 'Window mode restored.'));
  };

  const handleEngageBootGate = async () => {
    const res = await fetch('/api/boot-gate/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Testing Windows 10 Pro 3-Factor Boot Security Gate' }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.gateLocked !== undefined) setBootGate(data);
    setShowBootGateOverlay(true);
  };

  const toggleLabSpokeSimulator = () => {
    if (simLabConnected && simSocketRef.current) {
      simSocketRef.current.close();
      simSocketRef.current = null;
      setSimLabConnected(false);
      void refreshColStatus();
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/col/esp32_lab/iot`);
    ws.onopen = () => {
      setSimLabConnected(true);
      ws.send(
        JSON.stringify({
          type: 'REGISTER',
          label: 'Lab Workbench ESP32 Relay',
          capabilities: ['power_on', 'power_off', 'workbench_lights', 'sensor_read'],
        }),
      );
      void refreshColStatus();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === 'EXECUTE') {
          ws.send(
            JSON.stringify({
              type: 'RESULT',
              req_id: msg.req_id,
              data: {
                status: `ESP32 executed '${msg.command}' (GPIO Relay ACTIVE, 3.3V nominal)`,
              },
            }),
          );
        }
      } catch {
        // Ignore
      }
    };
    ws.onclose = () => {
      setSimLabConnected(false);
      void refreshColStatus();
    };
    simSocketRef.current = ws;
  };

  const saveNewPassword = async () => {
    if (!newPassword.trim()) return;
    const res = await fetch('/api/boot-gate/enroll-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNewPassword('');
      setBootGate(data);
      setConfigMsg('Master Password updated locally for Windows Boot Security Gate.');
    } else {
      setConfigMsg(data.error || 'Failed to update password.');
    }
  };

  const saveNewVoicePhrase = async () => {
    if (!newVoicePhrase.trim()) return;
    const res = await fetch('/api/boot-gate/enroll-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase: newVoicePhrase.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNewVoicePhrase('');
      setBootGate(data);
      setConfigMsg(`Voice Authorization Phrase updated to ${data.voicePassphraseHint}.`);
    } else {
      setConfigMsg(data.error || 'Failed to update voice phrase.');
    }
  };

  const updateGatePolicy = async (policy: BootGateStatusView['policy']) => {
    const res = await fetch('/api/boot-gate/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setBootGate(data);
      setConfigMsg(`Updated boot verification policy to ${policy}.`);
    }
  };

  const handleSaraLocalSettingsChange = useCallback((patch: Partial<SaraSettings>) => {
    setSaraLocalSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleAppSettingsChange = useCallback((patch: AppSettingsPatch) => {
    void api.updateAppSettings(patch).then(setAppSettings).catch(() => undefined);
  }, []);

  if (showBootGateOverlay && bootGate) {
    return (
      <SaraBootSecurityGate
        status={bootGate}
        onStatusChange={setBootGate}
        onUnlocked={(speech) => {
          setShowBootGateOverlay(false);
          appendSara(
            speech ||
              'Access granted. Live desktop wallpaper and Central Operating Layer unlocked — ready for voice and text commands.',
          );
          void refreshColStatus();
        }}
      />
    );
  }

  return (
    <div className="relative flex h-screen w-screen flex-col justify-between overflow-hidden bg-[#020611] text-slate-100 select-none">
      {/* Ambient Live Desktop Wallpaper Core Backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(14,165,233,0.22), rgba(2,6,17,0.94) 62%), linear-gradient(rgba(56,189,248,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.05) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
        }}
      />

      {/* TOP LIVE WALLPAPER TELEMETRY & SURFACE BAR */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/20 bg-slate-950/75 px-5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-cyan-400" />
          <div>
            <div className="font-mono text-xs font-bold tracking-[0.18em] text-white uppercase">
              S.A.R.A. // CENTRAL OPERATING LAYER
            </div>
            <div className="font-mono text-[10px] text-cyan-300/80">
              {wallpaperMode
                ? 'WINDOWS 10 WORKERW LIVE WALLPAPER ACTIVE'
                : 'INTERACTIVE DESKTOP HUB • ZERO CAPABILITY LOCK'}
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="flex flex-wrap items-center gap-1.5">
          {[
            ['live_command', '⚡ Live OS & 6 Depts'],
            ['wallpaper_hud', 'Live Wallpaper HUD'],
            ['layers_trainer', `3-Layer & Self-Trainer (${masteredSkills.length})`],
            ['frontier_suite', 'Coworker & Frontier'],
            ['nodes', `Hardware Nodes (${nodes.filter((n) => n.status === 'ONLINE').length})`],
            ['win10_plan', 'Win10 Boot & Security'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase transition cursor-pointer ${
                activeTab === id
                  ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right Controls: Boot Gate Lock, Wallpaper Toggle, Voice, Surface Switchers */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleEngageBootGate()}
            title="Test Full-Screen Windows 10 Face + Voice + Password Security Gate"
            className="flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/25 cursor-pointer"
          >
            <Lock className="h-3 w-3" />
            <span>Boot Gate</span>
          </button>

          <button
            type="button"
            onClick={() => void handleToggleWallpaper()}
            title="Mount or Detach SARA UI as Windows 10 Live Desktop Wallpaper (WorkerW)"
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-semibold cursor-pointer ${
              wallpaperMode
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
            }`}
          >
            <Monitor className="h-3 w-3" />
            <span>{wallpaperMode ? 'Wallpaper ON' : 'Set Wallpaper'}</span>
          </button>

          <button
            type="button"
            onClick={() => playSaraWelcomeSequence(undefined, true)}
            title="Play SARA Unlock Welcome Chime & Greeting"
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/15 cursor-pointer"
          >
            Welcome Sound
          </button>

          <button
            type="button"
            onClick={() => void toggleVoice()}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-semibold cursor-pointer ${
              liveState !== 'disconnected'
                ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
                : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
            }`}
          >
            <Power className="h-3 w-3" />
            <span>{liveState !== 'disconnected' ? `Voice (${liveState})` : 'Hey SARA Voice'}</span>
          </button>

          {liveState !== 'disconnected' && (
            <button
              type="button"
              onClick={() => {
                const next = !micPaused;
                setMicPaused(next);
                liveSessionRef.current?.setListeningPaused(next);
              }}
              className="rounded-lg border border-white/15 bg-white/10 p-1 text-slate-200 cursor-pointer"
            >
              {micPaused ? <MicOff className="h-3.5 w-3.5 text-amber-300" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSpeechMuted((v) => !v)}
            className="rounded-lg border border-white/15 bg-white/10 p-1 text-slate-200 cursor-pointer"
          >
            {speechMuted ? <VolumeX className="h-3.5 w-3.5 text-rose-300" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSwitchSurface('vision')}
            className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/35 cursor-pointer"
          >
            V.I.S.I.O.N.
          </button>
          <button
            type="button"
            onClick={() => onSwitchSurface('live_core')}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
          >
            J.A.R.V.I.S.
          </button>
          <button
            type="button"
            onClick={() => onSwitchSurface('ultron')}
            className="rounded-lg border border-red-500/40 bg-red-600/15 px-2.5 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-600/25 cursor-pointer"
          >
            ULTRON
          </button>
          <button
            type="button"
            onClick={() => onSwitchSurface('companion')}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-200 hover:bg-white/15 cursor-pointer"
          >
            SARA UI
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-slate-200 hover:bg-white/15 cursor-pointer"
            title="Open SARA Global Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT BODY */}
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {/* TAB 1: LIVE DESKTOP WALLPAPER HUD */}
        {activeTab === 'wallpaper_hud' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left / Center: Orbital Wallpaper Reactor + 8 GB RAM Lean Gauges */}
            <div className="flex flex-col justify-between rounded-2xl border border-cyan-400/20 bg-slate-950/45 p-5 backdrop-blur-md lg:col-span-7">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-mono text-sm font-bold tracking-wider text-cyan-200 uppercase">
                    Live Desktop Wallpaper Core
                  </h2>
                  <p className="text-xs text-slate-400">
                    Sits cleanly behind Windows 10 Pro desktop icons via <code className="text-cyan-300">WorkerW</code> • Press{' '}
                    <kbd className="rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-100">
                      Alt + Space
                    </kbd>{' '}
                    anytime for Spotlight bar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSpotlightOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35 cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Alt + Space Bar</span>
                </button>
              </div>

              {/* Central Animated Reactor Ring */}
              <div className="my-6 flex flex-col items-center justify-center">
                <div className="relative flex h-44 w-44 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/5 shadow-[0_0_70px_rgba(34,211,238,0.2)]">
                  <div className="absolute inset-3 animate-spin rounded-full border border-dashed border-cyan-300/40 [animation-duration:18s]" />
                  <div className="absolute inset-7 rounded-full border border-cyan-400/50 bg-cyan-500/10" />
                  <div className="text-center">
                    <Sparkles className="mx-auto h-6 w-6 text-cyan-300" />
                    <div className="mt-1 font-mono text-xs font-bold tracking-widest text-white">
                      S.A.R.A. OS
                    </div>
                    <div className="font-mono text-[10px] text-cyan-300">
                      {hostHealth ? `${hostHealth.onlineNodes.length} NODES LIVE` : 'INITIALIZING'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Intel i5 / 8 GB RAM Lean Telemetry Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 uppercase">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" /> CPU Load
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-white">
                    {hostHealth ? `${hostHealth.cpuPercent}%` : '--'}
                  </div>
                  <div className="truncate text-[10px] text-slate-400">
                    {hostHealth ? `${hostHealth.cpuCores} Threads` : 'i5 Profile'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 uppercase">
                    <HardDrive className="h-3.5 w-3.5 text-cyan-400" /> System RAM
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-white">
                    {hostHealth ? `${hostHealth.ramPercent}%` : '--'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {hostHealth ? `${hostHealth.ramUsedGb} / ${hostHealth.ramTotalGb} GB` : '8 GB Optimized'}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 uppercase">
                    <Activity className="h-3.5 w-3.5 text-emerald-400" /> Kernel RSS
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-emerald-300">
                    {hostHealth ? `${hostHealth.saraKernelRssMb} MB` : '<75 MB'}
                  </div>
                  <div className="text-[10px] text-slate-400">Cloud Brain: Gemini</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 uppercase">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> PC Capabilities
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-emerald-200">UNLOCKED</div>
                  <div className="text-[10px] text-slate-400">Zero Auth Friction</div>
                </div>
              </div>
            </div>

            {/* Right: Voice + Text Central Command Stream */}
            <div className="flex min-h-[380px] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950/55 backdrop-blur-md lg:col-span-5">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-200 uppercase">
                  Voice & Text System Control
                </span>
                <span className="font-mono text-[10px] text-emerald-300">WIN10_PC READY</span>
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                {feed.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      item.role === 'boss'
                        ? 'ml-8 border border-white/20 bg-white/10 text-white'
                        : 'mr-4 border border-cyan-400/25 bg-cyan-950/35 text-cyan-50'
                    }`}
                  >
                    <div className="mb-0.5 font-mono text-[9px] uppercase text-slate-400">
                      {item.role === 'boss' ? 'You' : 'SARA Central Layer'}
                    </div>
                    <div className="whitespace-pre-wrap">{item.text}</div>
                  </div>
                ))}
              </div>

              {/* 1-Click OS Action Chips */}
              <div className="flex flex-wrap gap-1.5 border-t border-white/10 bg-black/30 px-3.5 py-2">
                {[
                  ['Check RAM', 'Check my RAM usage and CPU health'],
                  ['Open VS Code', 'Open vscode'],
                  ['Analyze Screen', 'Check what is on my screen'],
                  ['Mount Wallpaper', 'Embed wallpaper'],
                  ['Lock PC Gate', 'Lock PC'],
                ].map(([label, cmd]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void sendCentralCommand(cmd)}
                    className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCentralCommand();
                }}
                className="flex gap-2 border-t border-white/10 bg-black/45 p-3"
              >
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  disabled={busy}
                  placeholder="Type any PC/hardware command (or press Alt+Space)…"
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="Execute Central OS Command"
                  className="flex items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-500/25 px-3.5 py-2 text-cyan-100 hover:bg-cyan-500/40 disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: DISTRIBUTED HARDWARE & LAB SPOKE NODES */}
        {activeTab === 'nodes' && (
          <div className="space-y-4 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-5 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-sm font-bold text-cyan-200 uppercase">
                  Hub-and-Spoke Distributed Hardware Mesh
                </h2>
                <p className="text-xs text-slate-400">
                  Connect your Windows 10 Pro PC, Android Phone, and ESP32 / Smart Room hardware to{' '}
                  <code className="text-cyan-300">ws://&lt;PC_IP&gt;:3000/ws/col/&lt;node_id&gt;/&lt;type&gt;</code>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleLabSpokeSimulator}
                  className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                    simLabConnected
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100'
                      : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/30'
                  }`}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  <span>{simLabConnected ? 'Disconnect ESP32 Lab Sim' : 'Connect Live ESP32 Lab Node'}</span>
                </button>
                {simLabConnected && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('wallpaper_hud');
                      void sendCentralCommand('node esp32_lab: power_on');
                    }}
                    className="rounded-xl border border-amber-400/45 bg-amber-500/20 px-3.5 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 cursor-pointer"
                  >
                    Trigger ESP32 Workbench Relay
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {nodes.map((n) => (
                <div
                  key={n.nodeId}
                  className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-cyan-400" />
                      <span className="font-mono text-xs font-bold text-white">{n.label}</span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                        n.status === 'ONLINE'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : 'bg-rose-500/20 text-rose-200'
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-slate-400">
                    Node ID: <span className="text-cyan-300">{n.nodeId}</span> · Type: {n.nodeType}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {n.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] text-cyan-100"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: WINDOWS 10 PRO (i5 / 8 GB RAM) 4-STAGE BOOT PLAN & CREDENTIAL CONFIG */}
        {activeTab === 'win10_plan' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-cyan-400/20 bg-slate-950/65 p-5 backdrop-blur-md">
              <h3 className="font-mono text-xs font-bold tracking-wider text-cyan-200 uppercase">
                Windows 10 Pro (i5 / 8 GB RAM) 4-Stage Boot Pipeline
              </h3>
              <p className="text-xs text-slate-400">
                Complete standalone scripts are ready in{' '}
                <code className="text-cyan-300">sara_os/central_layer/</code> (including{' '}
                <code className="text-cyan-300">setup_win10_pro.ps1</code> with 1-click rollback).
              </p>

              <div className="space-y-2.5">
                {[
                  [
                    'Stage 1 — Pre-Desktop Boot Sequencer',
                    'sara_os/central_layer/sara_boot.py launches sara_kernel.py + win10_node.py (~75 MB RAM) before explorer.exe.',
                  ],
                  [
                    'Stage 2 — 3-Factor SARA Windows Security Gate',
                    'Verifies Face ID + Voice Passphrase + Master Password, grants or denies access, and plays the Welcome Chime + TTS greeting.',
                  ],
                  [
                    'Stage 3 — Explorer.exe + WorkerW Live Wallpaper',
                    'Starts Windows desktop and embeds SARA HUD cleanly behind desktop icons via Progman 0x052C -> WorkerW.',
                  ],
                  [
                    'Stage 4 — Full Voice + Alt+Space System Control',
                    'Controls apps, files, screen vision, processes, and IoT/phone nodes with zero capability-lock prompts.',
                  ],
                ].map(([title, desc], idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="font-mono text-xs font-semibold text-emerald-300">{title}</div>
                    <div className="mt-1 text-[11px] text-slate-300">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-cyan-400/20 bg-slate-950/65 p-5 backdrop-blur-md">
              <h3 className="font-mono text-xs font-bold tracking-wider text-cyan-200 uppercase">
                Configure Windows Boot Gate Credentials
              </h3>

              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] text-slate-400 uppercase">
                  Verification Policy
                </label>
                <select
                  aria-label="Boot Gate Verification Policy"
                  value={bootGate?.policy || 'face_voice_or_password'}
                  onChange={(e) => void updateGatePolicy(e.target.value as BootGateStatusView['policy'])}
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="face_voice_or_password">
                    Balanced: (Face ID + Voice Code) OR Master Password
                  </option>
                  <option value="all_three">Strict: Require All 3 (Face + Voice + Password)</option>
                  <option value="any_single">Fast: Any Single Enrolled Factor</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] text-slate-400 uppercase">
                  Update Master Password
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Windows Gate Master Password…"
                    className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => void saveNewPassword()}
                    className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    Save Password
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] text-slate-400 uppercase">
                  Update Voice Authorization Code (Current: {bootGate?.voicePassphraseHint || '"sara authorize access"'})
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newVoicePhrase}
                    onChange={(e) => setNewVoicePhrase(e.target.value)}
                    placeholder="e.g. sara authorize access"
                    className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => void saveNewVoicePhrase()}
                    className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    Save Phrase
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleEngageBootGate()}
                className="w-full rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-xs font-bold tracking-wider text-amber-100 uppercase hover:bg-amber-500/35 cursor-pointer"
              >
                Launch Full-Screen Boot Security Gate Test Now
              </button>

              {configMsg && <div className="text-xs text-emerald-300">{configMsg}</div>}
            </div>
          </div>
        )}

        {/* TAB: WAVE 4 — 3-LAYER FULL-SYSTEM CONTROL + SMART HALF-TASK + AUTONOMOUS INTERNET SKILL TRAINER */}
        {activeTab === 'layers_trainer' && (
          <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-3">
            {/* 1. 3-Layer Control Router */}
            <div className="space-y-3 rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-wider text-cyan-300 uppercase">
                  1. 3-Layer System Control Router
                </span>
                <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
                  Shell → UIA → Vision
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Cascades Layer 1 (Instant Invisible Shell/Win32) → Layer 2 (Windows UI Automation Tree) → Layer 3 (See → Think → Act → Verify).
              </p>

              <select
                value={preferredLayer}
                onChange={(e) => setPreferredLayer(e.target.value as typeof preferredLayer)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
              >
                <option value="auto">Auto Smart Cascade (Layer 1 → 2 → 3)</option>
                <option value="layer1_shell">Layer 1: Instant Shell / OS API</option>
                <option value="layer2_uia">Layer 2: Windows UI Automation Tree</option>
                <option value="layer3_vision">Layer 3: Vision Computer Use (See→Think→Act→Verify)</option>
              </select>

              <input
                type="text"
                value={layerGoal}
                onChange={(e) => setLayerGoal(e.target.value)}
                placeholder="Goal (e.g. Check workspace git status)"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
              />
              <input
                type="text"
                value={layerShellCmd}
                onChange={(e) => setLayerShellCmd(e.target.value)}
                placeholder="Optional Layer 1 command (e.g. git status --short)"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 font-mono text-xs text-cyan-200 outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const out = await api.colExecuteThreeLayer({
                      goal: layerGoal,
                      preferredLayer,
                      shellCommand: preferredLayer === 'layer1_shell' || preferredLayer === 'auto' ? layerShellCmd : undefined,
                    });
                    setLastLayerResult(out.result);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-100 uppercase hover:bg-cyan-500/35 cursor-pointer"
              >
                Execute 3-Layer Control
              </button>

              {lastLayerResult && (
                <div className="space-y-1.5 rounded-xl border border-emerald-400/30 bg-black/60 p-3 font-mono text-[11px]">
                  <div className="text-emerald-300">
                    Active Layer: <strong>{String(lastLayerResult.layerUsed)}</strong> • Verified:{' '}
                    {String(lastLayerResult.verification?.verified)}
                  </div>
                  <div className="text-slate-300">{String(lastLayerResult.verification?.summary || '')}</div>
                  {lastLayerResult.output && (
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-cyan-200">
                      {String(lastLayerResult.output)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* 2. Smart Half-Task Completer */}
            <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-wider text-emerald-300 uppercase">
                  2. Smart Half-Task Executor
                </span>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                  Zero Questions
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Follows &ldquo;Act First with Smart Defaults, Suggest Next&rdquo; — never asks &ldquo;Which app?&rdquo; or &ldquo;Which song?&rdquo;.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {['play arjit song', 'start my work', 'open attendeasy project'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHalfTaskInput(preset)}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-200 hover:bg-white/15 cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={halfTaskInput}
                onChange={(e) => setHalfTaskInput(e.target.value)}
                placeholder="Incomplete command (e.g. play arjit song)"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const out = await api.colSmartIntent(halfTaskInput, false);
                    setHalfTaskResult(out.completion);
                    appendSara(`${out.completion.spokenConfirmation} ${out.completion.proactiveSuggestion}`);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 uppercase hover:bg-emerald-500/35 cursor-pointer"
              >
                Act Immediately (Smart Defaults)
              </button>

              {halfTaskResult && (
                <div className="space-y-1.5 rounded-xl border border-emerald-400/30 bg-black/60 p-3 text-xs">
                  <div className="font-semibold text-emerald-300">
                    {String(halfTaskResult.spokenConfirmation)}
                  </div>
                  <div className="text-[11px] text-cyan-200">
                    Suggestion: {String(halfTaskResult.proactiveSuggestion)}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    Action: {String(halfTaskResult.chosenAction)}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Voyager + Reflexion Autonomous Internet Skill Trainer */}
            <div className="space-y-3 rounded-2xl border border-purple-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-wider text-purple-300 uppercase">
                  3. Sandbox Self-Trainer
                </span>
                <span className="rounded-md bg-purple-500/20 px-2 py-0.5 font-mono text-[10px] text-purple-200">
                  PRACTICE_PASSED
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Researches docs → writes Python <code className="text-purple-200">execute(**kwargs)</code> → practices in isolated <code className="text-purple-200">sandbox_temp</code> → saves verified skill.
              </p>

              <input
                type="text"
                value={skillTopicInput}
                onChange={(e) => setSkillTopicInput(e.target.value)}
                placeholder="Skill topic (e.g. log_error_frequency_counter)"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const out = await api.colTrainSkill(skillTopicInput);
                      setSkillOutput(JSON.stringify(out.skill || out, null, 2));
                      await refreshWave4Data();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex-1 rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-2 text-xs font-bold text-purple-100 uppercase hover:bg-purple-500/35 cursor-pointer"
                >
                  Study &amp; Practice
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const out = await api.colRunSkill(skillTopicInput, { text: 'Live verification payload' });
                      setSkillOutput(JSON.stringify(out, null, 2));
                      await refreshWave4Data();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex-1 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-100 uppercase hover:bg-cyan-500/35 cursor-pointer"
                >
                  Run / Auto-Learn
                </button>
              </div>

              <div className="max-h-32 space-y-1 overflow-y-auto">
                {masteredSkills.map((sk) => (
                  <div
                    key={String(sk.skillName)}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-purple-200">{String(sk.skillName)}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const out = await api.colRunSkill(String(sk.skillName), { text: 'Quick run' });
                        setSkillOutput(JSON.stringify(out, null, 2));
                      }}
                      className="rounded border border-cyan-400/40 px-2 py-0.5 font-mono text-[10px] text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
                    >
                      Run (&lt;5ms)
                    </button>
                  </div>
                ))}
              </div>

              {skillOutput && (
                <pre className="max-h-28 overflow-auto rounded-xl border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-emerald-200">
                  {skillOutput}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* TAB: WAVE 4 — COWORKER, PLATFORM, FRONTIER, HOLOGRAM & SOUL CAPSULE */}
        {activeTab === 'frontier_suite' && (
          <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-3">
            {/* Column 1: Ghost Worker + Screen Memory + Soul Capsule */}
            <div className="space-y-3 rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="font-mono text-xs font-bold tracking-wider text-cyan-300 uppercase">
                Ghost Worker &amp; Photographic Memory (&lt;2 MB)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await api.colFrontierAction('ghost-worker', {
                      title: 'Overnight Workspace & Config Backup',
                      kind: 'config_backup',
                      targetOrPrompt: 'SARA Central OS',
                    });
                    const runOut = await api.colFrontierAction('ghost-worker/run');
                    setMorningDiff(String(runOut.morningDiffReport || ''));
                    await refreshWave4Data();
                  }}
                  className="flex-1 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-2 text-[11px] font-bold text-cyan-100 hover:bg-cyan-500/35 cursor-pointer"
                >
                  Run Ghost Worker + Diff
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.colFrontierAction('soul-capsule/export', {
                      passphrase: 'sara-owner-vault-key',
                    });
                    setSoulCapsulePreview(`Saved ${out.bytes}B AES-256-GCM .sara capsule -> ${out.capsulePath}`);
                  }}
                  className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-100 hover:bg-amber-500/30 cursor-pointer"
                >
                  Export .sara Capsule
                </button>
              </div>
              {morningDiff && <div className="rounded-lg bg-black/50 p-2 text-[11px] text-emerald-200">{morningDiff}</div>}
              {soulCapsulePreview && (
                <div className="rounded-lg bg-black/50 p-2 font-mono text-[10px] text-amber-200">{soulCapsulePreview}</div>
              )}

              <div className="pt-1 font-mono text-[10px] text-slate-400 uppercase">
                Photographic Screen Memory Recall
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={screenRecallQuery}
                  onChange={(e) => setScreenRecallQuery(e.target.value)}
                  placeholder="Search past window titles / OCR text…"
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await api.colFrontierAction('screen-memory', {
                      windowTitle: 'AttendEasy - Architecture Notes',
                      appName: 'VS Code',
                      extractedText: 'SQLite WAL + Gemini 2.5 Flash local-first architecture',
                    });
                    const res = await fetch(
                      `/api/col/frontier/screen-memory?q=${encodeURIComponent(screenRecallQuery || 'AttendEasy')}`,
                    );
                    const data = await res.json();
                    setScreenRecallMatches(data.matches || []);
                  }}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 cursor-pointer"
                >
                  Recall
                </button>
              </div>
              {screenRecallMatches.slice(0, 2).map((m) => (
                <div key={String(m.id)} className="rounded-lg border border-white/10 bg-black/40 p-2 text-[11px]">
                  <div className="font-semibold text-cyan-200">{String(m.windowTitle)}</div>
                  <div className="text-[10px] text-slate-400">{String(m.extractedText)}</div>
                </div>
              ))}
            </div>

            {/* Column 2: Ghost Clipboard (Ctrl+Shift+S) + Ephemeral Zero-App Widget */}
            <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-wider text-emerald-300 uppercase">
                  Ghost Clipboard (Ctrl+Shift+S) &amp; Zero-App UI
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={clipboardMode}
                  onChange={(e) => setClipboardMode(e.target.value as typeof clipboardMode)}
                  className="rounded-xl border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="to_typescript">SQL/JSON → TypeScript</option>
                  <option value="explain">Explain Clearly</option>
                  <option value="fix_code">Fix Bugs</option>
                  <option value="to_sql">Natural → SQL</option>
                  <option value="to_markdown_table">To Markdown Table</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.colFrontierAction('clipboard', {
                      text: clipboardInput,
                      mode: clipboardMode,
                    });
                    setClipboardOutput(String(out.output || ''));
                  }}
                  className="flex-1 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-100 cursor-pointer"
                >
                  Transform Clipboard
                </button>
              </div>
              <textarea
                rows={2}
                value={clipboardInput}
                onChange={(e) => setClipboardInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 p-2 font-mono text-[11px] text-white outline-none"
              />
              {clipboardOutput && (
                <pre className="max-h-24 overflow-auto rounded-xl border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-emerald-200">
                  {clipboardOutput}
                </pre>
              )}

              <div className="pt-1 font-mono text-[10px] text-slate-400 uppercase">
                Ephemeral &ldquo;Zero-App&rdquo; On-Demand Micro-Widget
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={widgetPrompt}
                  onChange={(e) => setWidgetPrompt(e.target.value)}
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.colFrontierAction('ephemeral-widget', { prompt: widgetPrompt });
                    setActiveWidgetHtml(String(out.widget?.html || ''));
                  }}
                  className="rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-100 cursor-pointer"
                >
                  Spawn UI
                </button>
              </div>
              {activeWidgetHtml && (
                <iframe
                  title="SARA Ephemeral Micro-App"
                  sandbox="allow-scripts"
                  srcDoc={activeWidgetHtml}
                  className="h-36 w-full rounded-xl border border-cyan-400/30 bg-slate-950"
                />
              )}
            </div>

            {/* Column 3: Synthetic Boardroom + Butterfly Effect + /ws/holo Prism Bridge */}
            <div className="space-y-3 rounded-2xl border border-purple-400/25 bg-slate-950/80 p-4 backdrop-blur-md">
              <div className="font-mono text-xs font-bold tracking-wider text-purple-300 uppercase">
                Synthetic Boardroom, Butterfly AST &amp; /ws/holo Prism
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={boardroomDilemma}
                  onChange={(e) => setBoardroomDilemma(e.target.value)}
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.colFrontierAction('boardroom', { dilemma: boardroomDilemma });
                    setBoardroomOut(out);
                  }}
                  className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 text-xs font-bold text-purple-100 cursor-pointer"
                >
                  Debate
                </button>
              </div>
              {boardroomOut && (
                <div className="space-y-1 rounded-xl border border-white/10 bg-black/60 p-2 text-[10px]">
                  <div className="font-semibold text-amber-300">{String(boardroomOut.devilsAdvocateChallenge)}</div>
                  <div className="text-emerald-300">{String(boardroomOut.executiveVerdict)}</div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={butterflyTarget}
                  onChange={(e) => setButterflyTarget(e.target.value)}
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 font-mono text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.colFrontierAction('butterfly', { targetFile: butterflyTarget });
                    setButterflyOut(out);
                  }}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-100 cursor-pointer"
                >
                  Blast Radius
                </button>
              </div>
              {butterflyOut && (
                <div className="rounded-xl border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-cyan-200">
                  Risk: <strong>{String(butterflyOut.blastRadiusRisk).toUpperCase()}</strong> • Direct:{' '}
                  {butterflyOut.directDependents?.length || 0} • Transitive:{' '}
                  {butterflyOut.transitiveDependents?.length || 0}
                </div>
              )}

              <button
                type="button"
                onClick={() => setHoloMirrorActive((v) => !v)}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-bold uppercase cursor-pointer ${
                  holoMirrorActive
                    ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
                    : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                }`}
              >
                {holoMirrorActive ? 'Pepper’s Ghost /ws/holo Prism ACTIVE (Mirrored)' : 'Launch /ws/holo Spatial Prism Bridge'}
              </button>

              {holoMirrorActive && (
                <div
                  style={{ transform: 'scaleX(-1)' }}
                  className="rounded-xl border border-cyan-400/40 bg-black p-3 text-center font-mono text-[11px] text-cyan-300"
                >
                  <div>HOLO PRISM • SKILLS: {holoFrame?.masteredSkillsCount ?? masteredSkills.length}</div>
                  <div>RAM: {holoFrame?.hostHealth?.ramPercent ?? hostHealth?.ramPercent ?? 0}% • NODES: {(holoFrame?.onlineNodes || []).length}</div>
                </div>
              )}

              {frontierStatus?.powerReroute && (
                <div className="font-mono text-[10px] text-slate-400">
                  8GB RAM Guard: {String(frontierStatus.powerReroute.actions?.[0] || 'Active')}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'live_command' && (
          <div className="mx-auto max-w-[1480px] p-4">
            <LiveDepartmentCommandView />
          </div>
        )}
      </main>

      {/* FLOATING ALT + SPACE SPOTLIGHT COMMAND BAR */}
      {spotlightOpen && (
        <div
          onClick={() => setSpotlightOpen(false)}
          className="fixed inset-0 z-40 flex items-start justify-center bg-black/55 pt-28 backdrop-blur-sm"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void sendCentralCommand();
            }}
            className="flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-cyan-400/50 bg-[#061126]/95 px-5 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.75)]"
          >
            <Terminal className="h-5 w-5 text-cyan-400" />
            <input
              ref={spotlightInputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="SARA Spotlight (Alt+Space) — e.g. 'open vscode', 'check RAM', 'cmd: git status', 'lock pc'…"
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 outline-none"
            />
            <button
              type="submit"
              className="rounded-xl border border-cyan-400/50 bg-cyan-500/25 px-4 py-1.5 text-xs font-bold text-cyan-100 hover:bg-cyan-500/40 cursor-pointer"
            >
              Execute
            </button>
          </form>
        </div>
      )}

      {/* Global Settings Panel */}
      <SaraGlobalSettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={saraLocalSettings}
        onChange={handleSaraLocalSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
    </div>
  );
};

export default CentralOsApp;
