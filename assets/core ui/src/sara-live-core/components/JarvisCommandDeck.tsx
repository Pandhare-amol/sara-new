import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BatteryCharging,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Eye,
  FileCode2,
  FlaskConical,
  Layers,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Pause,
  Pin,
  Play,
  Plus,
  Power,
  Radar,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  StopCircle,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { PerformanceQuality, SaraCoreState } from '../types';

export type DeckTabId =
  | 'command'
  | 'tasks'
  | 'workshop'
  | 'protocols'
  | 'ultron';

interface SaraWindowBridge {
  isDesktop?: boolean;
  windowMinimize?: () => Promise<unknown>;
  windowMaximizeToggle?: () => Promise<{ maximized?: boolean }>;
  windowClose?: () => Promise<unknown>;
  windowAlwaysOnTop?: (enabled?: boolean) => Promise<{ alwaysOnTop?: boolean }>;
  windowGetState?: () => Promise<{ maximized?: boolean; alwaysOnTop?: boolean }>;
}

interface TaskItem {
  id: string;
  goal: string;
  state?: string;
  status?: string;
  pendingQuestion?: { id: string; text: string } | null;
  question?: string | null;
  lastStepSummary?: string | null;
}

interface ConfirmationItem {
  id: string;
  summary?: string;
  tool?: string;
  risk?: string;
}

interface GoalItem {
  id: string;
  objective: string;
  status: string;
}

interface UtilityItem {
  id: string;
  kind: 'alarm' | 'reminder' | 'timer';
  label: string;
  dueAt: number;
  status: string;
}

interface ProtocolItem {
  slug: string;
  name: string;
  description: string;
  builtIn?: boolean;
}

interface WorkspaceItem {
  id: string;
  name: string;
  windows?: Array<{ title?: string; processName?: string }>;
}

interface SimulationReport {
  id: string;
  label: string;
  checkType: string;
  passed: boolean;
  riskLevel: string;
  filesCloned: number;
  durationMs: number;
  jarvisAdvisory: string;
}

interface BlueprintReport {
  id: string;
  totalFiles: number;
  totalLines: number;
  architectureSummary: string;
  jarvisCommentary: string;
  apiRoutes: string[];
  anomalies: string[];
  hotspots: Array<{ file: string; lines: number; reason: string }>;
}

interface CanaryItem {
  id: string;
  path: string;
  label: string;
  status: 'intact' | 'tripped' | 'deleted';
}

interface SnapshotItem {
  id: string;
  originalPath: string;
  label: string;
  sizeBytes: number;
  restoredCount: number;
}

interface FatigueStatus {
  sessionMinutes: number;
  fatigueScore: number;
  fatigueLevel: string;
  cpuLoadPercent: number;
  freeMemMb: number;
  auxiliaryPowerReroute: boolean;
  jarvisNote: string;
}

interface TranscriptEntry {
  id: string;
  role: 'boss' | 'jarvis';
  text: string;
  intent?: string;
  at: number;
}

export interface JarvisCommandDeckProps {
  activeTab: DeckTabId;
  deckExpanded: boolean;
  onChangeTab: (tab: DeckTabId) => void;
  onToggleDeckExpanded: () => void;
  onSetCoreState: (state: SaraCoreState, voiceLevel?: number) => void;
  onPulseWave: () => void;
  onSetQualityForPowerReroute: (quality: PerformanceQuality) => void;
  onOpenVisualSettings: () => void;
  onSwitchToExistingShell?: () => void;
  externalActionNonce?: { action: string; nonce: number } | null;
}

const TABS: Array<{
  id: DeckTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'command', label: 'J.A.R.V.I.S.', icon: Bot },
  { id: 'tasks', label: 'Tasks & Ops', icon: Terminal },
  { id: 'workshop', label: 'Workshop', icon: FlaskConical },
  { id: 'protocols', label: 'Protocols', icon: Workflow },
  { id: 'ultron', label: 'Ultron', icon: Shield },
];

export const JarvisCommandDeck: React.FC<JarvisCommandDeckProps> = ({
  activeTab,
  deckExpanded,
  onChangeTab,
  onToggleDeckExpanded,
  onSetCoreState,
  onPulseWave,
  onSetQualityForPowerReroute,
  onOpenVisualSettings,
  onSwitchToExistingShell,
  externalActionNonce,
}) => {
  // Window state (native Electron or browser fullscreen fallback)
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  // J.A.R.V.I.S. Voice & Tone State
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceStyle, setVoiceStyle] = useState<'jarvis' | 'natural' | 'anime'>('jarvis');
  const [voiceName, setVoiceName] = useState('Charon');
  const [dictating, setDictating] = useState(false);

  // Command & Transcript
  const [commandInput, setCommandInput] = useState('');
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([
    {
      id: 'boot-1',
      role: 'jarvis',
      text: 'J.A.R.V.I.S. Core Command Application online, Boss. Digital Twin Simulator, Blueprint Scanner, Ghost Canary Tripwires, Task Orchestrator, and Project Ultron are standing by.',
      intent: 'boot',
      at: Date.now(),
    },
  ]);

  // Tasks, Confirmations, Missions, Utilities
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmationItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [utilities, setUtilities] = useState<UtilityItem[]>([]);
  const [newTaskGoal, setNewTaskGoal] = useState('');
  const [newMissionObj, setNewMissionObj] = useState('');
  const [taskAnswerMap, setTaskAnswerMap] = useState<Record<string, string>>({});
  const [timerLabel, setTimerLabel] = useState('Deployment check');
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [utilityKind, setUtilityKind] = useState<'timer' | 'reminder'>('timer');

  // Stark Workshop State
  const [simCheckType, setSimCheckType] = useState<
    'structural_audit' | 'typescript' | 'python_compile' | 'node_test'
  >('structural_audit');
  const [latestSim, setLatestSim] = useState<SimulationReport | null>(null);
  const [latestBlueprint, setLatestBlueprint] = useState<BlueprintReport | null>(null);
  const [canaries, setCanaries] = useState<CanaryItem[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotPathInput, setSnapshotPathInput] = useState('package.json');
  const [fatigue, setFatigue] = useState<FatigueStatus | null>(null);

  // Touchless Air-Gesture Optical Sensor
  const [gestureActive, setGestureActive] = useState(false);
  const [lastGestureLabel, setLastGestureLabel] = useState<string>('Sensor Off');
  const gestureVideoRef = useRef<HTMLVideoElement | null>(null);
  const gestureCleanupRef = useRef<(() => void) | null>(null);

  // Protocols & Workspaces
  const [protocols, setProtocols] = useState<ProtocolItem[]>([]);
  const [customProtoName, setCustomProtoName] = useState('');
  const [customProtoGoal, setCustomProtoGoal] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  // Project Ultron State
  const [ultronStance, setUltronStance] = useState<string>('standby');
  const [ultronThreat, setUltronThreat] = useState<string>('nominal');
  const [ultronPortsCount, setUltronPortsCount] = useState<number>(0);
  const [legionDirective, setLegionDirective] = useState(
    'Audit workspace health, verify critical files, and summarize risk posture'
  );
  const [legionSummary, setLegionSummary] = useState<string | null>(null);

  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  const speakJarvisLine = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /en-GB/i.test(v.lang) && /Daniel|George|Arthur|Ryan|Male/i.test(v.name)) ||
          voices.find((v) => /en-GB/i.test(v.lang)) ||
          voices.find((v) => /en/i.test(v.lang));
        if (preferred) utter.voice = preferred;
        utter.rate = voiceStyle === 'jarvis' ? 1.02 : 1.0;
        utter.pitch = voiceStyle === 'jarvis' ? 0.88 : voiceStyle === 'anime' ? 1.25 : 1.0;
        utter.onstart = () => onSetCoreState('speaking', 0.65);
        utter.onend = () => onSetCoreState('idle', 0);
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore browser TTS unavailability
      }
    },
    [ttsEnabled, voiceStyle, onSetCoreState]
  );

  const appendJarvisReply = useCallback(
    (text: string, intent?: string, speak = true) => {
      setTranscript((prev) => [
        ...prev.slice(-24),
        { id: `${Date.now()}-${Math.random()}`, role: 'jarvis', text, intent, at: Date.now() },
      ]);
      if (speak) speakJarvisLine(text);
    },
    [speakJarvisLine]
  );

  // Sync window state + all SARA operational state
  const refreshAllData = useCallback(async () => {
    try {
      const [
        tasksRes,
        confRes,
        goalsRes,
        utilRes,
        jarvisRes,
        wsRes,
        ultronRes,
        appSettingsRes,
      ] = await Promise.all([
        fetch('/api/tasks?limit=15'),
        fetch('/api/confirmations'),
        fetch('/api/goals'),
        fetch('/api/utilities'),
        fetch('/api/jarvis/status'),
        fetch('/api/windows/workspaces'),
        fetch('/api/ultron/status'),
        fetch('/api/app-settings'),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (confRes.ok) setConfirmations(await confRes.json());
      if (goalsRes.ok) setGoals(await goalsRes.json());
      if (utilRes.ok) setUtilities(await utilRes.json());
      if (wsRes.ok) setWorkspaces(await wsRes.json());

      if (jarvisRes.ok) {
        const j = await jarvisRes.json();
        if (Array.isArray(j.protocols)) setProtocols(j.protocols);
        if (j.workshop) {
          if (Array.isArray(j.workshop.canaries)) setCanaries(j.workshop.canaries);
          if (Array.isArray(j.workshop.snapshots)) setSnapshots(j.workshop.snapshots);
          if (j.workshop.fatigue) setFatigue(j.workshop.fatigue);
          if (Array.isArray(j.workshop.simulations) && j.workshop.simulations[0]) {
            setLatestSim((prev) => prev ?? j.workshop.simulations[0]);
          }
          if (Array.isArray(j.workshop.blueprints) && j.workshop.blueprints[0]) {
            setLatestBlueprint((prev) => prev ?? j.workshop.blueprints[0]);
          }
        }
      }

      if (ultronRes.ok) {
        const u = await ultronRes.json();
        setUltronStance(u.stance || 'standby');
        if (u.lastPerimeterScan) {
          setUltronThreat(
            u.lastPerimeterScan.armorScore !== undefined
              ? `ARMOR ${u.lastPerimeterScan.armorScore}`
              : 'nominal'
          );
          setUltronPortsCount(
            Number(u.lastPerimeterScan.exposedPortCount || 0) +
              Number(u.lastPerimeterScan.loopbackPortCount || 0)
          );
        }
      }

      if (appSettingsRes.ok) {
        const s = await appSettingsRes.json();
        if (s?.voice?.style) setVoiceStyle(s.voice.style);
        if (s?.voice?.voiceName) setVoiceName(s.voice.voiceName);
      }
    } catch {
      // Non-fatal during transient reconnects
    }
  }, []);

  useEffect(() => {
    void refreshAllData();
    const id = window.setInterval(() => void refreshAllData(), 4000);
    const bridge = (window as unknown as { sara?: SaraWindowBridge }).sara;
    void bridge?.windowGetState?.().then((st) => {
      if (st) {
        setIsMaximized(Boolean(st.maximized));
        setIsAlwaysOnTop(Boolean(st.alwaysOnTop));
      }
    });
    return () => window.clearInterval(id);
  }, [refreshAllData]);

  // Execute unified J.A.R.V.I.S. command
  const submitJarvisCommand = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? commandInput).trim();
      if (!text) return;
      if (!overrideText) setCommandInput('');

      setTranscript((prev) => [
        ...prev.slice(-24),
        { id: `${Date.now()}-u`, role: 'boss', text, at: Date.now() },
      ]);
      setBusyLabel('Processing J.A.R.V.I.S. directive...');
      onSetCoreState('thinking');

      try {
        const res = await fetch('/api/jarvis/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text }),
        });
        const data = await res.json();
        if (!res.ok) {
          appendJarvisReply(data.error || 'Directive failed.', 'error');
          onSetCoreState('idle');
          return;
        }
        onPulseWave();
        appendJarvisReply(
          data.reply || 'Directive completed, Boss.',
          data.intent
        );
        if (data.intent === 'simulation' && data.data) setLatestSim(data.data);
        if (data.intent === 'blueprint' && data.data) setLatestBlueprint(data.data);
        void refreshAllData();
      } catch (err) {
        appendJarvisReply(
          err instanceof Error ? err.message : 'Unable to reach SARA runtime.',
          'error'
        );
        onSetCoreState('idle');
      } finally {
        setBusyLabel(null);
      }
    },
    [commandInput, onSetCoreState, onPulseWave, appendJarvisReply, refreshAllData]
  );

  // Voice Dictation (Web Speech API)
  const toggleVoiceDictation = useCallback(() => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any })
        .webkitSpeechRecognition;
    if (!SpeechRec) {
      appendJarvisReply(
        'Browser speech recognition is unavailable in this environment, Boss — type any directive below and I will execute it immediately.',
        'voice',
        false
      );
      commandInputRef.current?.focus();
      return;
    }
    if (dictating) {
      setDictating(false);
      onSetCoreState('idle');
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setDictating(true);
      onSetCoreState('listening', 0.55);
      rec.onresult = (ev: any) => {
        const transcriptText = String(ev.results?.[0]?.[0]?.transcript || '').trim();
        setDictating(false);
        if (transcriptText) {
          void submitJarvisCommand(transcriptText);
        } else {
          onSetCoreState('idle');
        }
      };
      rec.onerror = () => {
        setDictating(false);
        onSetCoreState('idle');
      };
      rec.onend = () => {
        setDictating(false);
      };
      rec.start();
    } catch {
      setDictating(false);
      onSetCoreState('idle');
    }
  }, [dictating, onSetCoreState, submitJarvisCommand, appendJarvisReply]);

  // Apply Voice Tone Preset to SARA Backend
  const updateBackendVoiceTone = async (nextStyle: 'jarvis' | 'natural' | 'anime') => {
    setVoiceStyle(nextStyle);
    const nextVoice = nextStyle === 'jarvis' ? 'Charon' : voiceName;
    setVoiceName(nextVoice);
    await fetch('/api/app-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: { style: nextStyle, voiceName: nextVoice, pitch: 0 },
      }),
    }).catch(() => undefined);
    appendJarvisReply(
      nextStyle === 'jarvis'
        ? 'Voice matrix calibrated to J.A.R.V.I.S. Chief-of-Staff cadence (Charon), Boss.'
        : `Voice delivery updated to ${nextStyle} profile, Boss.`,
      'voice'
    );
  };

  // Tasks & Missions Handlers
  const handleStartTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const goal = newTaskGoal.trim();
    if (!goal) return;
    setNewTaskGoal('');
    setBusyLabel('Dispatching task...');
    onSetCoreState('executing');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, origin: 'text' }),
      });
      const data = await res.json();
      if (res.ok) {
        appendJarvisReply(`Task dispatched, Boss: "${goal}".`, 'task');
        void refreshAllData();
      } else {
        appendJarvisReply(data.error || 'Could not start task.', 'error');
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleTaskAction = async (
    taskId: string,
    action: 'pause' | 'resume' | 'stop' | 'continue' | 'answer'
  ) => {
    const body =
      action === 'answer'
        ? { text: taskAnswerMap[taskId] || 'Proceed' }
        : {};
    await fetch(`/api/tasks/${encodeURIComponent(taskId)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (action === 'answer') {
      setTaskAnswerMap((prev) => ({ ...prev, [taskId]: '' }));
    }
    void refreshAllData();
  };

  const handleResolveConfirmation = async (id: string, approved: boolean) => {
    await fetch(`/api/confirmations/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    });
    void refreshAllData();
  };

  const handleEmergencyStopAll = async () => {
    await fetch('/api/autonomy/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'jarvis_core_ui_stop' }),
    });
    onSetCoreState('idle');
    appendJarvisReply(
      'Emergency halt executed, Boss. All active desktop tasks and pending operations have been terminated.',
      'stop'
    );
    void refreshAllData();
  };

  const handleCreateMission = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const objective = newMissionObj.trim();
    if (!objective) return;
    setNewMissionObj('');
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objective, successCriteria: [] }),
    });
    if (res.ok) {
      await fetch('/api/jarvis/tick', { method: 'POST' });
      appendJarvisReply(`Autonomous mission registered: "${objective}".`, 'mission');
      void refreshAllData();
    }
  };

  const handleCancelMission = async (goalId: string) => {
    await fetch(`/api/goals/${encodeURIComponent(goalId)}/cancel`, {
      method: 'POST',
    });
    void refreshAllData();
  };

  const handleAddUtility = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const res = await fetch('/api/utilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: utilityKind,
        label: timerLabel.trim() || 'J.A.R.V.I.S. Timer',
        inSeconds: Math.max(10, Number(timerMinutes) * 60),
      }),
    });
    if (res.ok) {
      appendJarvisReply(
        `${utilityKind === 'timer' ? 'Timer' : 'Reminder'} set for ${timerMinutes} minute(s), Boss.`,
        'utility'
      );
      void refreshAllData();
    }
  };

  const handleRemoveUtility = async (id: string) => {
    await fetch(`/api/utilities/${encodeURIComponent(id)}`, { method: 'DELETE' });
    void refreshAllData();
  };

  // Stark Workshop Handlers
  const handleRunSimulation = useCallback(async () => {
    setBusyLabel('Cloning Digital Twin & running pre-flight simulation...');
    onSetCoreState('researching');
    try {
      const res = await fetch('/api/jarvis/workshop/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkType: simCheckType,
          label: `Workshop ${simCheckType}`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.simulation) {
        setLatestSim(data.simulation);
        onSetCoreState(data.simulation.passed ? 'completed' : 'idle');
        onPulseWave();
        appendJarvisReply(data.simulation.jarvisAdvisory, 'simulation');
      }
    } finally {
      setBusyLabel(null);
    }
  }, [simCheckType, onSetCoreState, onPulseWave, appendJarvisReply]);

  const handleScanBlueprint = useCallback(async () => {
    setBusyLabel('Reconstructing Stark holographic blueprint...');
    onSetCoreState('researching');
    try {
      const res = await fetch('/api/jarvis/workshop/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.blueprint) {
        setLatestBlueprint(data.blueprint);
        onSetCoreState('completed');
        onPulseWave();
        appendJarvisReply(data.blueprint.jarvisCommentary, 'blueprint');
      }
    } finally {
      setBusyLabel(null);
    }
  }, [onSetCoreState, onPulseWave, appendJarvisReply]);

  const handleDeployCanary = async () => {
    const res = await fetch('/api/jarvis/workshop/canary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Core-UI-Tripwire' }),
    });
    const data = await res.json();
    if (res.ok) {
      appendJarvisReply(
        'Ghost-in-the-Net decoy tripwire planted and SHA-256 fingerprinted, Boss.',
        'ghost'
      );
      void refreshAllData();
    } else if (data.error) {
      appendJarvisReply(data.error, 'error');
    }
  };

  const handleVerifyCanaries = useCallback(async () => {
    const res = await fetch('/api/jarvis/workshop/canary/verify', {
      method: 'POST',
    });
    const data = await res.json();
    if (res.ok) {
      onSetCoreState('completed');
      onPulseWave();
      appendJarvisReply(
        data.compromised > 0
          ? `Security alert, Boss: ${data.compromised} canary tripwire(s) tampered!`
          : `Ghost tripwire sweep green, Boss — ${data.intact} decoy(s) intact.`,
        'ghost'
      );
      void refreshAllData();
    }
  }, [onSetCoreState, onPulseWave, appendJarvisReply, refreshAllData]);

  const handleCreateSnapshot = async () => {
    const p = snapshotPathInput.trim();
    if (!p) return;
    const res = await fetch('/api/jarvis/workshop/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, label: `Snapshot: ${p}` }),
    });
    const data = await res.json();
    if (res.ok) {
      appendJarvisReply(`Shadow Snapshot captured for ${p}, Boss.`, 'snapshot');
      void refreshAllData();
    } else {
      appendJarvisReply(data.error || 'Snapshot failed.', 'error');
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    const res = await fetch(
      `/api/jarvis/workshop/snapshot/${encodeURIComponent(id)}/restore`,
      { method: 'POST' }
    );
    const data = await res.json();
    if (res.ok) {
      onPulseWave();
      appendJarvisReply(
        `Self-healing rollback verified (${data.sha256?.slice(0, 10)}), Boss.`,
        'snapshot'
      );
      void refreshAllData();
    }
  };

  const handleTogglePowerReroute = async () => {
    const next = !(fatigue?.auxiliaryPowerReroute ?? false);
    const res = await fetch('/api/jarvis/workshop/power-reroute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.fatigue) setFatigue(data.fatigue);
      onSetQualityForPowerReroute(next ? 'low' : 'high');
      appendJarvisReply(data.spokenNote || 'Power allocation updated, Boss.', 'power');
    }
  };

  // Touchless Air-Gesture Optical Sensor (real WebRTC camera frame motion analysis)
  const toggleAirGestureSensor = async () => {
    if (gestureActive) {
      gestureCleanupRef.current?.();
      gestureCleanupRef.current = null;
      setGestureActive(false);
      setLastGestureLabel('Sensor Off');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setLastGestureLabel('Camera unavailable in sandbox');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, frameRate: 15 },
        audio: false,
      });
      if (gestureVideoRef.current) {
        gestureVideoRef.current.srcObject = stream;
        await gestureVideoRef.current.play().catch(() => {});
      }
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      let prevFrame: Uint8ClampedArray | null = null;
      let lastTriggerAt = 0;

      const timer = window.setInterval(() => {
        const video = gestureVideoRef.current;
        if (!ctx || !video || video.readyState < 2) return;
        ctx.drawImage(video, 0, 0, 64, 48);
        const frame = ctx.getImageData(0, 0, 64, 48).data;
        if (prevFrame) {
          let leftMotion = 0;
          let rightMotion = 0;
          let totalMotion = 0;
          for (let y = 0; y < 48; y++) {
            for (let x = 0; x < 64; x++) {
              const idx = (y * 64 + x) * 4;
              const diff =
                Math.abs(frame[idx] - prevFrame[idx]) +
                Math.abs(frame[idx + 1] - prevFrame[idx + 1]) +
                Math.abs(frame[idx + 2] - prevFrame[idx + 2]);
              if (diff > 95) {
                totalMotion++;
                if (x < 24) leftMotion++;
                else if (x > 40) rightMotion++;
              }
            }
          }
          const now = Date.now();
          if (now - lastTriggerAt > 1600) {
            if (totalMotion > 620) {
              lastTriggerAt = now;
              setLastGestureLabel('Center Surge → Core Pulse');
              onPulseWave();
            } else if (leftMotion > 180 && leftMotion > rightMotion * 1.7) {
              lastTriggerAt = now;
              setLastGestureLabel('Wave Left → Prev Deck');
              const idx = TABS.findIndex((t) => t.id === activeTab);
              onChangeTab(TABS[(idx - 1 + TABS.length) % TABS.length].id);
            } else if (rightMotion > 180 && rightMotion > leftMotion * 1.7) {
              lastTriggerAt = now;
              setLastGestureLabel('Wave Right → Next Deck');
              const idx = TABS.findIndex((t) => t.id === activeTab);
              onChangeTab(TABS[(idx + 1) % TABS.length].id);
            }
          }
        }
        prevFrame = new Uint8ClampedArray(frame);
      }, 150);

      setGestureActive(true);
      setLastGestureLabel('Tracking Hand Motion');
      gestureCleanupRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
      };
    } catch {
      setLastGestureLabel('Camera permission denied');
    }
  };

  useEffect(() => {
    return () => {
      gestureCleanupRef.current?.();
    };
  }, []);

  // Protocols, Workspaces & Self-Optimizer
  const handleExecuteProtocol = async (slug: string) => {
    setBusyLabel(`Engaging protocol ${slug}...`);
    onSetCoreState('executing');
    try {
      const res = await fetch(
        `/api/jarvis/protocols/${encodeURIComponent(slug)}/execute`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (res.ok) {
        onPulseWave();
        appendJarvisReply(
          data.spokenSummary || `Protocol ${data.protocol?.name || slug} engaged, Boss.`,
          'protocol'
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleSaveCustomProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProtoName.trim() || !customProtoGoal.trim()) return;
    const res = await fetch('/api/jarvis/protocols', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customProtoName.trim(),
        description: `Custom Core UI protocol: ${customProtoGoal.trim()}`,
        steps: [{ type: 'start_task', goal: customProtoGoal.trim() }],
      }),
    });
    if (res.ok) {
      setCustomProtoName('');
      setCustomProtoGoal('');
      appendJarvisReply('Custom J.A.R.V.I.S. protocol saved, Boss.', 'protocol');
      void refreshAllData();
    }
  };

  const handleDeleteProtocol = async (slug: string) => {
    await fetch(`/api/jarvis/protocols/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    void refreshAllData();
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWorkspaceName.trim() || `Workspace ${workspaces.length + 1}`;
    setNewWorkspaceName('');
    const res = await fetch('/api/windows/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, captureCurrent: true }),
    });
    if (res.ok) {
      appendJarvisReply(`Windows workspace "${name}" captured, Boss.`, 'workspace');
      void refreshAllData();
    }
  };

  const handleActivateWorkspace = async (id: string, name: string) => {
    const res = await fetch(
      `/api/windows/workspaces/${encodeURIComponent(id)}/activate`,
      { method: 'POST' }
    );
    if (res.ok) {
      appendJarvisReply(`Restoring Windows workspace "${name}", Boss.`, 'workspace');
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    await fetch(`/api/windows/workspaces/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    void refreshAllData();
  };

  const handleRunOptimizer = async () => {
    setBusyLabel('Running host memory & CPU self-optimization...');
    onSetCoreState('executing');
    try {
      const res = await fetch('/api/optimization/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 2 }),
      });
      const data = await res.json();
      if (res.ok) {
        onPulseWave();
        appendJarvisReply(
          `System optimization complete, Boss. Available RAM stands at ${data.after?.ramAvailableMb ?? data.after?.freeMemMb ?? 'nominal'} MB.`,
          'optimize'
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleMorningBriefing = useCallback(async () => {
    setBusyLabel('Compiling executive briefing...');
    onSetCoreState('speaking', 0.6);
    try {
      const res = await fetch('/api/jarvis/briefing');
      const data = await res.json();
      if (res.ok) {
        onPulseWave();
        appendJarvisReply(
          data.spokenBriefing || data.spokenScript || 'Systems green, Boss. Executive briefing ready.',
          'briefing'
        );
      }
    } finally {
      setBusyLabel(null);
    }
  }, [onSetCoreState, onPulseWave, appendJarvisReply]);

  // Project Ultron Handlers
  const handleSetUltronStance = async (stance: string) => {
    const res = await fetch('/api/ultron/stance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stance, reason: 'core_ui_command_deck' }),
    });
    if (res.ok) {
      setUltronStance(stance);
      onPulseWave();
      appendJarvisReply(
        `Project Ultron transitioned to ${stance.replace(/_/g, ' ').toUpperCase()}, Boss.`,
        'ultron'
      );
      void refreshAllData();
    }
  };

  const handleUltronScan = async () => {
    setBusyLabel('Running Ultron TCP perimeter & watchpoint sweep...');
    onSetCoreState('researching');
    try {
      const res = await fetch('/api/ultron/scan', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const portTotal =
          Number(data.exposedPortCount || 0) + Number(data.loopbackPortCount || 0);
        setUltronThreat(`ARMOR ${data.armorScore ?? 100}`);
        setUltronPortsCount(portTotal);
        appendJarvisReply(
          data.spokenSummary ||
            `Ultron perimeter scan complete: ${portTotal} listening ports, armor score ${data.armorScore ?? 100}/100.`,
          'ultron'
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleDeployLegion = async () => {
    if (!legionDirective.trim()) return;
    setBusyLabel('Deploying Iron Legion multi-sentry swarm...');
    onSetCoreState('executing');
    try {
      const res = await fetch('/api/ultron/legion/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directive: legionDirective.trim(),
          maxSentries: 4,
          dispatchLiveTask: false,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const synth =
          data.hiveMindSynthesis || data.summary || 'Iron Legion mission completed.';
        setLegionSummary(synth);
        onPulseWave();
        appendJarvisReply(synth, 'ultron');
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleUltronEvolve = useCallback(async () => {
    setBusyLabel('Running Ultron autonomous self-evolution pass...');
    onSetCoreState('learning');
    try {
      const res = await fetch('/api/ultron/evolve', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        onPulseWave();
        appendJarvisReply(
          data.summary || 'Self-evolution adaptation cycle complete, Boss.',
          'ultron'
        );
      }
    } finally {
      setBusyLabel(null);
    }
  }, [onSetCoreState, onPulseWave, appendJarvisReply]);

  const handleUltronKillSwitch = async () => {
    const res = await fetch('/api/ultron/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'core_ui_kill_switch', haltRuntimeTasks: true }),
    });
    if (res.ok) {
      setUltronStance('standby');
      onSetCoreState('idle');
      appendJarvisReply(
        'Ultron Kill Switch engaged. All sentries recalled and returned to standby, Boss.',
        'ultron'
      );
      void refreshAllData();
    }
  };

  // Wire external dock button triggers from FloatingIndicators so every bottom dock button performs a real SARA action!
  useEffect(() => {
    if (!externalActionNonce) return;
    const act = externalActionNonce.action;
    if (act === 'listen') {
      onChangeTab('command');
      toggleVoiceDictation();
    } else if (act === 'think') {
      void fetch('/api/jarvis/tick', { method: 'POST' }).then(() => refreshAllData());
      onChangeTab('tasks');
    } else if (act === 'speak') {
      void handleMorningBriefing();
    } else if (act === 'execute') {
      onChangeTab('tasks');
      setTimeout(() => taskInputRef.current?.focus(), 60);
    } else if (act === 'learn') {
      void handleUltronEvolve();
    } else if (act === 'research') {
      onChangeTab('workshop');
      void handleScanBlueprint();
    } else if (act === 'completed') {
      void handleVerifyCanaries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalActionNonce?.nonce]);

  // Native Windows Application Window Controls
  const handleWinMinimize = () => {
    const bridge = (window as unknown as { sara?: SaraWindowBridge }).sara;
    if (bridge?.windowMinimize) {
      void bridge.windowMinimize();
    } else {
      onToggleDeckExpanded();
    }
  };

  const handleWinMaximize = async () => {
    const bridge = (window as unknown as { sara?: SaraWindowBridge }).sara;
    if (bridge?.windowMaximizeToggle) {
      const res = await bridge.windowMaximizeToggle();
      setIsMaximized(Boolean(res?.maximized));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setIsMaximized(false);
    } else {
      await document.documentElement.requestFullscreen().catch(() => {});
      setIsMaximized(true);
    }
  };

  const handleWinPin = async () => {
    const bridge = (window as unknown as { sara?: SaraWindowBridge }).sara;
    if (bridge?.windowAlwaysOnTop) {
      const res = await bridge.windowAlwaysOnTop(!isAlwaysOnTop);
      setIsAlwaysOnTop(Boolean(res?.alwaysOnTop));
    } else {
      setIsAlwaysOnTop((v) => !v);
    }
  };

  const handleWinClose = () => {
    const bridge = (window as unknown as { sara?: SaraWindowBridge }).sara;
    if (bridge?.windowClose) {
      void bridge.windowClose();
    } else if (onSwitchToExistingShell) {
      onSwitchToExistingShell();
    }
  };

  const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <>
      {/* NATIVE WINDOWS 10/11 APPLICATION TITLEBAR */}
      <header
        style={dragStyle}
        className="pointer-events-auto fixed top-0 right-0 left-0 z-30 flex h-9 items-center justify-between border-b border-cyan-400/20 bg-[#040914]/92 pl-3 text-slate-200 backdrop-blur-xl"
      >
        {/* Left: Windows App Icon + Title + J.A.R.V.I.S. Voice Badge */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-white uppercase">
            SARA // J.A.R.V.I.S. CORE
          </span>
          <span className="hidden rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200 md:inline-block">
            {voiceName.toUpperCase()} • {voiceStyle.toUpperCase()} TONE
          </span>
          {fatigue?.auxiliaryPowerReroute && (
            <span className="hidden rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] text-amber-200 lg:inline-block">
              AUX POWER REROUTED
            </span>
          )}
        </div>

        {/* Center: Windows App Ribbon Tabs */}
        <nav style={noDragStyle} className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const selected = activeTab === t.id && deckExpanded;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChangeTab(t.id);
                  if (!deckExpanded) onToggleDeckExpanded();
                }}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-semibold tracking-wider uppercase transition cursor-pointer ${
                  selected
                    ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-100 shadow-[0_0_12px_rgba(0,210,255,0.2)]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onToggleDeckExpanded}
            title={deckExpanded ? 'Collapse Command Deck (Full 3D Core View)' : 'Expand Command Deck'}
            className="ml-1 flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[10px] text-slate-300 hover:bg-white/10 cursor-pointer"
          >
            {deckExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            <span className="hidden md:inline">
              {deckExpanded ? 'Hide Deck' : 'Show Deck'}
            </span>
          </button>
        </nav>

        {/* Right: Voice Toggle + Classic UI Switch + Native Windows 10/11 Caption Controls */}
        <div style={noDragStyle} className="flex h-full items-center">
          <button
            type="button"
            onClick={() => setTtsEnabled((v) => !v)}
            title={ttsEnabled ? 'Mute J.A.R.V.I.S. Spoken Replies' : 'Enable J.A.R.V.I.S. Spoken Replies'}
            className={`mr-1 flex h-6 items-center gap-1 rounded px-2 text-[10px] transition cursor-pointer ${
              ttsEnabled
                ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            {ttsEnabled ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
          </button>

          {onSwitchToExistingShell && (
            <button
              type="button"
              onClick={onSwitchToExistingShell}
              title="Switch back to Classic SARA UI"
              className="mr-1.5 flex h-6 items-center gap-1 rounded border border-cyan-400/30 bg-cyan-500/10 px-2 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
            >
              <ArrowLeftRight className="h-3 w-3" />
              <span className="hidden lg:inline">Classic UI</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleWinPin()}
            title="Pin Window Always on Top"
            className={`flex h-full w-9 items-center justify-center transition hover:bg-white/10 cursor-pointer ${
              isAlwaysOnTop ? 'text-cyan-300' : 'text-slate-400'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleWinMinimize}
            title="Minimize"
            aria-label="Minimize window"
            className="flex h-full w-10 items-center justify-center text-slate-300 transition hover:bg-white/10 cursor-pointer"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleWinMaximize()}
            title={isMaximized ? 'Restore Down' : 'Maximize'}
            aria-label="Maximize window"
            className="flex h-full w-10 items-center justify-center text-slate-300 transition hover:bg-white/10 cursor-pointer"
          >
            {isMaximized ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleWinClose}
            title="Close Window"
            aria-label="Close window"
            className="flex h-full w-11 items-center justify-center text-slate-300 transition hover:bg-rose-600 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Hidden optical camera element for Touchless Air-Gesture Workshop Sensor */}
      <video ref={gestureVideoRef} muted playsInline className="hidden" />

      {/* DOCKABLE J.A.R.V.I.S. COMMAND DECK (Left Windows Application Dock) */}
      {deckExpanded && (
        <aside className="sara-glass-panel sara-scrollbar pointer-events-auto fixed top-12 bottom-20 left-4 z-20 flex w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#050b18]/88 shadow-[0_20px_60px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
          {/* Status Strip */}
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              <span className="font-mono text-[10px] font-bold tracking-widest text-cyan-100 uppercase">
                {TABS.find((t) => t.id === activeTab)?.label} Console
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {busyLabel ? (
                <span className="flex items-center gap-1 text-amber-300">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="max-w-[170px] truncate">{busyLabel}</span>
                </span>
              ) : (
                <span className="font-mono text-emerald-300">
                  {tasks.filter((t) => (t.state || t.status) === 'running').length} LIVE •{' '}
                  {goals.filter((g) => g.status === 'active').length} MISSIONS
                </span>
              )}
              <button
                type="button"
                onClick={() => void refreshAllData()}
                title="Refresh Live State"
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="sara-scrollbar flex-1 space-y-3.5 overflow-y-auto p-4 text-xs text-slate-200">
            {/* ==================== TAB 1: J.A.R.V.I.S. COMMAND & VOICE ==================== */}
            {activeTab === 'command' && (
              <>
                {/* Voice Cadence & Tone Control */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] tracking-wider text-slate-400 uppercase">
                      Voice Cadence & Tone
                    </span>
                    <span className="font-mono text-[10px] text-cyan-300">
                      {voiceName} ({voiceStyle})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ['jarvis', 'J.A.R.V.I.S.'],
                        ['natural', 'Natural'],
                        ['anime', 'Anime'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void updateBackendVoiceTone(id)}
                        className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition cursor-pointer ${
                          voiceStyle === id
                            ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                            : 'border-white/10 bg-black/30 text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Executive Actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleMorningBriefing()}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-2 text-left text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/20 cursor-pointer"
                  >
                    <Volume2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <span>Executive Briefing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunSimulation()}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-2 text-left text-[11px] font-medium text-cyan-100 hover:bg-cyan-500/20 cursor-pointer"
                  >
                    <FlaskConical className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <span>Run Twin Simulation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleScanBlueprint()}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 cursor-pointer"
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <span>Scan Blueprint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunOptimizer()}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10 cursor-pointer"
                  >
                    <Cpu className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <span>Optimize System</span>
                  </button>
                </div>

                {/* Live J.A.R.V.I.S. Dialogue Stream */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-mono uppercase">J.A.R.V.I.S. Telemetry Log</span>
                    <button
                      type="button"
                      onClick={onOpenVisualSettings}
                      className="text-cyan-300 hover:underline cursor-pointer"
                    >
                      Core Visuals
                    </button>
                  </div>
                  <div className="sara-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
                    {transcript.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                          item.role === 'boss'
                            ? 'ml-6 border border-white/10 bg-white/10 text-white'
                            : 'mr-3 border border-cyan-400/20 bg-cyan-950/35 text-cyan-50'
                        }`}
                      >
                        <div className="mb-0.5 font-mono text-[9px] tracking-wider text-slate-400 uppercase">
                          {item.role === 'boss' ? 'Boss' : 'J.A.R.V.I.S.'}
                          {item.intent ? ` • ${item.intent}` : ''}
                        </div>
                        <div>{item.text}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Command Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitJarvisCommand();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <button
                    type="button"
                    onClick={toggleVoiceDictation}
                    title="Dictate Voice Directive to J.A.R.V.I.S."
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition cursor-pointer ${
                      dictating
                        ? 'border-rose-400 bg-rose-500/25 text-rose-200 animate-pulse'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {dictating ? (
                      <Mic className="h-4 w-4" />
                    ) : (
                      <MicOff className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={commandInputRef}
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="Direct J.A.R.V.I.S. (e.g. 'run a simulation', 'task: open calculator')..."
                    className="h-9 flex-1 rounded-lg border border-white/15 bg-black/50 px-3 text-xs text-white outline-none focus:border-cyan-400/60"
                  />
                  <button
                    type="submit"
                    aria-label="Send J.A.R.V.I.S. command"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/50 bg-cyan-500/25 text-cyan-100 hover:bg-cyan-500/35 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </>
            )}

            {/* ==================== TAB 2: TASKS, MISSIONS & TIMERS ==================== */}
            {activeTab === 'tasks' && (
              <>
                {/* Pending Security Confirmations */}
                {confirmations.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-amber-200 uppercase">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Awaiting Boss Confirmation ({confirmations.length})</span>
                    </div>
                    {confirmations.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-black/40 p-2 text-[11px]"
                      >
                        <span className="truncate text-amber-100">
                          {c.summary || c.tool || 'Confirm desktop operation'}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => void handleResolveConfirmation(c.id, true)}
                            className="rounded bg-emerald-500/30 px-2 py-1 text-[10px] text-emerald-100 hover:bg-emerald-500/45 cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleResolveConfirmation(c.id, false)}
                            className="rounded bg-rose-500/30 px-2 py-1 text-[10px] text-rose-100 hover:bg-rose-500/45 cursor-pointer"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Launch Desktop Task */}
                <form onSubmit={(e) => void handleStartTask(e)} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-400 uppercase">
                      Dispatch Autonomous Desktop Task
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleEmergencyStopAll()}
                      className="flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                    >
                      <StopCircle className="h-3 w-3" />
                      <span>Halt All</span>
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      ref={taskInputRef}
                      type="text"
                      value={newTaskGoal}
                      onChange={(e) => setNewTaskGoal(e.target.value)}
                      placeholder="e.g. Open Notepad and draft release notes..."
                      className="h-8 flex-1 rounded-lg border border-white/15 bg-black/45 px-2.5 text-xs text-white outline-none focus:border-cyan-400/60"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-3 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                    >
                      Execute
                    </button>
                  </div>
                </form>

                {/* Active & Recent Tasks */}
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="font-mono text-[10px] text-slate-400 uppercase">
                    Task Queue ({tasks.length})
                  </div>
                  {tasks.length === 0 ? (
                    <p className="py-2 text-[11px] text-slate-500">
                      No tasks queued. Enter any desktop objective above.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {tasks.slice(0, 8).map((t) => {
                        const taskState = t.state || t.status || 'queued';
                        const taskQuestion = t.pendingQuestion?.text || t.question;
                        return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-white/10 bg-black/40 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] font-medium text-white">
                              {t.goal}
                            </span>
                            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase">
                              {taskState}
                            </span>
                          </div>
                          {taskQuestion && (
                            <div className="mt-1.5 flex gap-1">
                              <input
                                type="text"
                                value={taskAnswerMap[t.id] || ''}
                                onChange={(e) =>
                                  setTaskAnswerMap((prev) => ({
                                    ...prev,
                                    [t.id]: e.target.value,
                                  }))
                                }
                                placeholder={taskQuestion}
                                className="h-7 flex-1 rounded border border-cyan-400/40 bg-black/60 px-2 text-[10px] text-white"
                              />
                              <button
                                type="button"
                                onClick={() => void handleTaskAction(t.id, 'answer')}
                                className="rounded bg-cyan-500/25 px-2 text-[10px] text-cyan-100 cursor-pointer"
                              >
                                Reply
                              </button>
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center gap-1">
                            {taskState === 'running' && (
                              <button
                                type="button"
                                onClick={() => void handleTaskAction(t.id, 'pause')}
                                className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] hover:bg-white/20 cursor-pointer"
                              >
                                <Pause className="h-2.5 w-2.5" /> Pause
                              </button>
                            )}
                            {taskState === 'paused' && (
                              <button
                                type="button"
                                onClick={() => void handleTaskAction(t.id, 'resume')}
                                className="flex items-center gap-1 rounded bg-emerald-500/25 px-2 py-0.5 text-[10px] text-emerald-100 cursor-pointer"
                              >
                                <Play className="h-2.5 w-2.5" /> Resume
                              </button>
                            )}
                            {(taskState === 'running' ||
                              taskState === 'paused' ||
                              taskState === 'waiting_user') && (
                              <button
                                type="button"
                                onClick={() => void handleTaskAction(t.id, 'stop')}
                                className="flex items-center gap-1 rounded bg-rose-500/25 px-2 py-0.5 text-[10px] text-rose-200 cursor-pointer"
                              >
                                <Square className="h-2.5 w-2.5" /> Stop
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Autonomous Background Missions */}
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="font-mono text-[10px] text-slate-400 uppercase">
                    Autonomous Missions ({goals.filter((g) => g.status === 'active').length} Active)
                  </div>
                  <form onSubmit={(e) => void handleCreateMission(e)} className="flex gap-1.5">
                    <input
                      type="text"
                      value={newMissionObj}
                      onChange={(e) => setNewMissionObj(e.target.value)}
                      placeholder="New background mission..."
                      className="h-7 flex-1 rounded border border-white/15 bg-black/45 px-2 text-[11px] text-white outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2.5 text-[10px] text-cyan-100 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </form>
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {goals.slice(0, 6).map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between gap-2 rounded bg-black/35 px-2 py-1 text-[11px]"
                      >
                        <span className="truncate">{g.objective}</span>
                        {g.status === 'active' ? (
                          <button
                            type="button"
                            onClick={() => void handleCancelMission(g.id)}
                            className="text-rose-300 hover:text-rose-200 cursor-pointer"
                            title="Cancel Mission"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="font-mono text-[9px] text-slate-400 uppercase">
                            {g.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timers & Reminders */}
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                  <div className="font-mono text-[10px] text-slate-400 uppercase">
                    Timers & Reminders ({utilities.length})
                  </div>
                  <form onSubmit={(e) => void handleAddUtility(e)} className="flex gap-1">
                    <select
                      value={utilityKind}
                      onChange={(e) =>
                        setUtilityKind(e.target.value as 'timer' | 'reminder')
                      }
                      className="h-7 rounded border border-white/15 bg-black/60 px-1.5 text-[10px] text-white"
                    >
                      <option value="timer">Timer</option>
                      <option value="reminder">Reminder</option>
                    </select>
                    <input
                      type="text"
                      value={timerLabel}
                      onChange={(e) => setTimerLabel(e.target.value)}
                      className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-black/45 px-2 text-[11px] text-white"
                    />
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(Number(e.target.value) || 5)}
                      className="h-7 w-12 rounded border border-white/15 bg-black/45 px-1.5 text-center text-[11px] text-white"
                    />
                    <button
                      type="submit"
                      className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2 text-[10px] text-cyan-100 cursor-pointer"
                    >
                      Arm
                    </button>
                  </form>
                  {utilities.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded bg-black/35 px-2 py-1 text-[10px]"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Clock className="h-3 w-3 text-cyan-300" />
                        <span>{u.label}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveUtility(u.id)}
                        className="text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ==================== TAB 3: STARK WORKSHOP (MOVIE FEATURES) ==================== */}
            {activeTab === 'workshop' && (
              <>
                {/* 1. Digital-Twin Pre-Execution Simulation */}
                <div className="space-y-2 rounded-xl border border-cyan-400/25 bg-cyan-950/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-cyan-200 uppercase">
                      1. Digital-Twin Simulation
                    </span>
                    <select
                      value={simCheckType}
                      onChange={(e) =>
                        setSimCheckType(e.target.value as typeof simCheckType)
                      }
                      className="rounded border border-white/15 bg-black/60 px-2 py-0.5 text-[10px] text-white"
                    >
                      <option value="structural_audit">Structural Audit</option>
                      <option value="typescript">TypeScript Twin</option>
                      <option value="python_compile">Python Compile</option>
                      <option value="node_test">Node Test Suite</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunSimulation()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/20 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    <span>Clone Isolated Twin & Simulate</span>
                  </button>
                  {latestSim && (
                    <div className="rounded-lg bg-black/45 p-2 text-[10px] text-slate-300">
                      <div className="flex justify-between font-mono">
                        <span className={latestSim.passed ? 'text-emerald-300' : 'text-rose-300'}>
                          {latestSim.passed ? 'PASSED' : 'RISK DETECTED'} •{' '}
                          {latestSim.riskLevel.toUpperCase()}
                        </span>
                        <span>
                          {latestSim.filesCloned} files • {latestSim.durationMs}ms
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300">{latestSim.jarvisAdvisory}</p>
                    </div>
                  )}
                </div>

                {/* 2. Stark Blueprint & Forensic Reconstruction */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-200 uppercase">
                      2. Stark Blueprint & Forensics
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleScanBlueprint()}
                      className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
                    >
                      Scan Codebase
                    </button>
                  </div>
                  {latestBlueprint && (
                    <div className="space-y-1 rounded-lg bg-black/45 p-2 text-[10px]">
                      <div className="font-mono text-cyan-200">
                        {latestBlueprint.totalFiles} files •{' '}
                        {latestBlueprint.totalLines.toLocaleString()} lines •{' '}
                        {latestBlueprint.apiRoutes.length} API routes
                      </div>
                      <p className="text-slate-300">{latestBlueprint.jarvisCommentary}</p>
                    </div>
                  )}
                </div>

                {/* 3. Ghost-in-the-Net Canary Tripwires & Shadow Snapshots */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] font-bold text-slate-200 uppercase">
                    3. Ghost-in-the-Net Protocol
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleDeployCanary()}
                      className="rounded border border-white/15 bg-white/5 py-1.5 text-[10px] hover:bg-white/10 cursor-pointer"
                    >
                      Deploy Canary Trap ({canaries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleVerifyCanaries()}
                      className="rounded border border-emerald-400/35 bg-emerald-500/15 py-1.5 text-[10px] text-emerald-100 hover:bg-emerald-500/25 cursor-pointer"
                    >
                      Verify Canaries
                    </button>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={snapshotPathInput}
                      onChange={(e) => setSnapshotPathInput(e.target.value)}
                      placeholder="File path to snapshot..."
                      className="h-7 flex-1 rounded border border-white/15 bg-black/45 px-2 text-[10px] text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateSnapshot()}
                      className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2.5 text-[10px] text-cyan-100 cursor-pointer"
                    >
                      Snapshot
                    </button>
                  </div>
                  {snapshots.slice(0, 3).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded bg-black/40 px-2 py-1 text-[10px]"
                    >
                      <span className="truncate text-slate-300">{s.label}</span>
                      <button
                        type="button"
                        onClick={() => void handleRestoreSnapshot(s.id)}
                        className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-0.5 text-[9px] text-cyan-200 hover:bg-cyan-500/35 cursor-pointer"
                      >
                        <RotateCcw className="h-2.5 w-2.5" /> Restore
                      </button>
                    </div>
                  ))}
                </div>

                {/* 4. Touchless Air-Gesture Sensor & 5. Fatigue / Power Reroute */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="font-mono text-[9px] text-slate-400 uppercase">
                      4. Air-Gesture Sensor
                    </div>
                    <div className="mt-1 truncate text-[10px] text-cyan-200">
                      {lastGestureLabel}
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleAirGestureSensor()}
                      className={`mt-2 flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] font-semibold cursor-pointer ${
                        gestureActive
                          ? 'bg-emerald-500/25 text-emerald-100'
                          : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      <Camera className="h-3 w-3" />
                      <span>{gestureActive ? 'Disable Cam' : 'Enable Cam'}</span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="font-mono text-[9px] text-slate-400 uppercase">
                      5. Fatigue & Aux Power
                    </div>
                    <div className="mt-1 text-[10px] text-amber-200">
                      Fatigue: {fatigue?.fatigueScore ?? 0}% ({fatigue?.fatigueLevel ?? 'fresh'})
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleTogglePowerReroute()}
                      className={`mt-2 flex w-full items-center justify-center gap-1 rounded py-1 text-[10px] font-semibold cursor-pointer ${
                        fatigue?.auxiliaryPowerReroute
                          ? 'bg-amber-500/30 text-amber-100'
                          : 'bg-white/10 text-slate-200 hover:bg-white/15'
                      }`}
                    >
                      <BatteryCharging className="h-3 w-3" />
                      <span>
                        {fatigue?.auxiliaryPowerReroute ? 'Restore Normal' : 'Reroute Power'}
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ==================== TAB 4: PROTOCOLS & WORKSPACES ==================== */}
            {activeTab === 'protocols' && (
              <>
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] font-bold text-cyan-200 uppercase">
                    Named J.A.R.V.I.S. Protocols
                  </div>
                  <div className="space-y-1.5">
                    {protocols.map((p) => (
                      <div
                        key={p.slug}
                        className="flex items-center justify-between gap-2 rounded-lg bg-black/40 p-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-white">
                            {p.name}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {p.description}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleExecuteProtocol(p.slug)}
                            className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                          >
                            Engage
                          </button>
                          {!p.builtIn && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteProtocol(p.slug)}
                              className="rounded p-1 text-slate-400 hover:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Create Custom Protocol */}
                  <form onSubmit={(e) => void handleSaveCustomProtocol(e)} className="space-y-1.5 pt-2">
                    <input
                      type="text"
                      value={customProtoName}
                      onChange={(e) => setCustomProtoName(e.target.value)}
                      placeholder="Custom protocol name (e.g. Clean Build)"
                      className="h-7 w-full rounded border border-white/15 bg-black/45 px-2 text-[11px] text-white"
                    />
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={customProtoGoal}
                        onChange={(e) => setCustomProtoGoal(e.target.value)}
                        placeholder="Task step goal..."
                        className="h-7 flex-1 rounded border border-white/15 bg-black/45 px-2 text-[11px] text-white"
                      />
                      <button
                        type="submit"
                        className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2.5 text-[10px] text-cyan-100 cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </div>

                {/* Windows Multi-Desktop Workspaces */}
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] font-bold text-slate-200 uppercase">
                    Windows Application Workspaces
                  </div>
                  <form onSubmit={(e) => void handleSaveWorkspace(e)} className="flex gap-1.5">
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="Capture current Windows layout as..."
                      className="h-7 flex-1 rounded border border-white/15 bg-black/45 px-2 text-[11px] text-white"
                    />
                    <button
                      type="submit"
                      className="rounded border border-cyan-400/40 bg-cyan-500/20 px-2.5 text-[10px] text-cyan-100 cursor-pointer"
                    >
                      Capture
                    </button>
                  </form>
                  {workspaces.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded bg-black/40 px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="truncate">{w.name}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleActivateWorkspace(w.id, w.name)}
                          className="rounded bg-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-100 cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteWorkspace(w.id)}
                          className="text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ==================== TAB 5: PROJECT ULTRON ==================== */}
            {activeTab === 'ultron' && (
              <>
                <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-950/15 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-rose-200 uppercase">
                      Project Ultron Stance
                    </span>
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[9px] text-rose-200 uppercase">
                      {ultronStance} • {ultronThreat}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['standby', 'armor', 'legion', 'evolution', 'omega_lockdown'] as const).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => void handleSetUltronStance(st)}
                          className={`rounded border px-2 py-1.5 text-[10px] font-semibold uppercase cursor-pointer ${
                            ultronStance === st
                              ? 'border-rose-400 bg-rose-500/30 text-white'
                              : 'border-white/10 bg-black/40 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {st.replace('_', ' ')}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => void handleUltronKillSwitch()}
                      className="rounded border border-rose-500 bg-rose-600/30 px-2 py-1.5 text-[10px] font-bold text-rose-100 uppercase hover:bg-rose-600/50 cursor-pointer"
                    >
                      Kill Switch
                    </button>
                  </div>
                </div>

                {/* Perimeter & Evolution */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleUltronScan()}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2 text-[10px] font-semibold hover:bg-white/10 cursor-pointer"
                  >
                    <Radar className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Perimeter Scan ({ultronPortsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleUltronEvolve()}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 py-2 text-[10px] font-semibold hover:bg-white/10 cursor-pointer"
                  >
                    <Zap className="h-3.5 w-3.5 text-amber-300" />
                    <span>Self-Evolution Pass</span>
                  </button>
                </div>

                {/* Iron Legion Swarm */}
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-mono text-[10px] font-bold text-slate-200 uppercase">
                    Iron Legion Multi-Sentry Swarm
                  </div>
                  <input
                    type="text"
                    value={legionDirective}
                    onChange={(e) => setLegionDirective(e.target.value)}
                    className="h-8 w-full rounded border border-white/15 bg-black/45 px-2.5 text-[11px] text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleDeployLegion()}
                    className="w-full rounded-lg border border-cyan-400/45 bg-cyan-500/20 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    Deploy 4-Sentry Legion Swarm
                  </button>
                  {legionSummary && (
                    <p className="rounded bg-black/45 p-2 text-[10px] text-slate-300">
                      {legionSummary}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
