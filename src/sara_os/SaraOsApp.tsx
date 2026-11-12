import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  Database,
  FileCheck2,
  FlaskConical,
  GitBranch,
  HeartHandshake,
  Leaf,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Orbit,
  Plus,
  Power,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Volume2,
  VolumeX,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { SaraAudioSession, type LiveState } from "../lib/saraAudio";
import { SettingsPanel } from "../components/SettingsPanel";
import { api, type AppSettings, type AppSettingsPatch } from "../lib/appApi";
import { loadSettings, saveSettings, type SaraSettings } from "../lib/saraSettingsStore";
import type {
  AffectiveCalibrationProfile,
  ContinuousGoalPlan,
  MemoryGraphNode,
  ProofCarryingDecision,
  SustainabilityMetrics,
  WorldModelPrediction,
} from "../../cognition/sara2050Engine";

type SpatialThemeId = "aurora" | "violet" | "sentinel" | "stealth";
type WorkspaceTabId = "command" | "agency" | "world_proofs" | "memory_privacy";

interface SpatialThemeSpec {
  id: SpatialThemeId;
  label: string;
  subtitle: string;
  bgClass: string;
  orbRing: string;
  accentText: string;
  accentBorder: string;
  accentBg: string;
  badgeBg: string;
}

const SPATIAL_THEMES: Record<SpatialThemeId, SpatialThemeSpec> = {
  aurora: {
    id: "aurora",
    label: "Aurora Cyan",
    subtitle: "Spatial Command",
    bgClass: "from-[#030816] via-[#061226] to-[#030712]",
    orbRing: "shadow-[0_0_55px_rgba(34,211,238,0.35)] border-cyan-400/50",
    accentText: "text-cyan-300",
    accentBorder: "border-cyan-400/35",
    accentBg: "bg-cyan-500/15 hover:bg-cyan-500/25",
    badgeBg: "bg-cyan-500/15 text-cyan-200 border-cyan-400/30",
  },
  violet: {
    id: "violet",
    label: "Iris Violet",
    subtitle: "Deep Synthesis",
    bgClass: "from-[#090418] via-[#120829] to-[#05030d]",
    orbRing: "shadow-[0_0_55px_rgba(168,85,247,0.35)] border-purple-400/50",
    accentText: "text-purple-300",
    accentBorder: "border-purple-400/35",
    accentBg: "bg-purple-500/15 hover:bg-purple-500/25",
    badgeBg: "bg-purple-500/15 text-purple-200 border-purple-400/30",
  },
  sentinel: {
    id: "sentinel",
    label: "Amber Sentinel",
    subtitle: "Active Verification",
    bgClass: "from-[#120904] via-[#1c0f06] to-[#080503]",
    orbRing: "shadow-[0_0_55px_rgba(251,191,36,0.32)] border-amber-400/50",
    accentText: "text-amber-300",
    accentBorder: "border-amber-400/35",
    accentBg: "bg-amber-500/15 hover:bg-amber-500/25",
    badgeBg: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  },
  stealth: {
    id: "stealth",
    label: "Emerald Stealth",
    subtitle: "Low Cognitive Load",
    bgClass: "from-[#040d0a] via-[#071712] to-[#030706]",
    orbRing: "shadow-[0_0_55px_rgba(16,185,129,0.30)] border-emerald-400/50",
    accentText: "text-emerald-300",
    accentBorder: "border-emerald-400/35",
    accentBg: "bg-emerald-500/15 hover:bg-emerald-500/25",
    badgeBg: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  },
};

interface ChatEntry {
  id: string;
  role: "user" | "sara";
  text: string;
  tag?: string;
  at: number;
}

interface MountedLabApp {
  id: string;
  name: string;
  specification: string;
  testsPassed: boolean;
  attemptsUsed: number;
}

export interface SaraOsAppProps {
  onSwitchSurface: (mode: "companion" | "live_core" | "ultron" | "sara_os" | "central_os") => void;
}

export const SaraOsApp: React.FC<SaraOsAppProps> = ({ onSwitchSurface }) => {
  const [themeId, setThemeId] = useState<SpatialThemeId>("aurora");
  const [autoMorph, setAutoMorph] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("command");
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Global SARA Settings state for embedded SettingsPanel
  const [saraLocalSettings, setSaraLocalSettings] = useState<SaraSettings>(() => loadSettings());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Native Window Controls (Electron optional)
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Real Gemini Live Voice (`SaraAudioSession`)
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [micPaused, setMicPaused] = useState<boolean>(false);
  const [speechMuted, setSpeechMuted] = useState<boolean>(false);
  const [liveCaption, setLiveCaption] = useState<string>("");
  const liveSessionRef = useRef<SaraAudioSession | null>(null);

  // Telemetry & 2050 Horizon Status
  const [cpuPercent, setCpuPercent] = useState<number>(12);
  const [ramPercent, setRamPercent] = useState<number>(38);
  const [activeMode, setActiveMode] = useState<string>("CO_PILOT");
  const [presenceLabel, setPresenceLabel] = useState<string>("OWNER PRESENT");
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);
  const [affectiveProfile, setAffectiveProfile] = useState<AffectiveCalibrationProfile>({
    detectedState: "calm_flow",
    stressIndex: 22,
    pacing: "balanced",
    maxRecommendedBullets: 4,
    empathyWarmth: 0.72,
    guidanceNote: "Deliver structured, executive-grade responses with clear status cues.",
    updatedAt: new Date().toISOString(),
  });
  const [sustainability, setSustainability] = useState<SustainabilityMetrics>({
    localEdgeFastCalls: 0,
    hybridCloudCalls: 0,
    edgeOffloadRatio: 1,
    estimatedJoulesSaved: 0,
  });

  // Command & Dialogue State
  const [commandInput, setCommandInput] = useState<string>("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([
    {
      id: "welcome-2050",
      role: "sara",
      text: "SARA Spatial 2050 Workspace ready. Continuous Multi-Horizon Agency, Causal World Simulator, Proof-Carrying Decisions, Lifelong Local Memory Graph, and Gemini Live Voice are online.",
      tag: "READY",
      at: Date.now(),
    },
  ]);
  const [pendingPushback, setPendingPushback] = useState<{
    command: string;
    warning: string;
    saferAlternative: string | null;
  } | null>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; goal: string; state?: string; status?: string }>>([]);

  // Tab 2: 2050 Continuous Agency & Self-Healing Lab
  const [horizonObjective, setHorizonObjective] = useState<string>(
    "Audit workspace build health, verify security invariants, and prepare release readiness summary",
  );
  const [budgetUnits, setBudgetUnits] = useState<number>(120);
  const [horizonGoals, setHorizonGoals] = useState<ContinuousGoalPlan[]>([]);
  const [labAppName, setLabAppName] = useState<string>("TelemetryAnomalyInspector");
  const [labSpec, setLabSpec] = useState<string>("Analyze structured runtime metrics and summarize anomalies");
  const [mountedApps, setMountedApps] = useState<MountedLabApp[]>([]);

  // Tab 3: Causal World Model & Verifiable Proofs
  const [worldActionInput, setWorldActionInput] = useState<string>(
    "Refactor authentication middleware and restart local worker pool",
  );
  const [worldTargetNode, setWorldTargetNode] = useState<string>("codebase_integrity");
  const [latestWorldSim, setLatestWorldSim] = useState<WorldModelPrediction | null>(null);
  const [proofObjectiveInput, setProofObjectiveInput] = useState<string>(
    "Deploy verified configuration update to local workspace",
  );
  const [latestProof, setLatestProof] = useState<ProofCarryingDecision | null>(null);
  const [provenanceStatus, setProvenanceStatus] = useState<string | null>(null);

  // Tab 4: Lifelong Local Memory Graph & Privacy
  const [memorySummary, setMemorySummary] = useState<{
    nodeCount: number;
    edgeCount: number;
    topNodes: MemoryGraphNode[];
  }>({
    nodeCount: 0,
    edgeCount: 0,
    topNodes: [],
  });
  const [memLabel, setMemLabel] = useState<string>("");
  const [memText, setMemText] = useState<string>("");
  const [memKind, setMemKind] = useState<
    "person" | "project" | "concept" | "preference" | "decision" | "episode"
  >("project");
  const [memLocalOnly, setMemLocalOnly] = useState<boolean>(true);

  const theme = useMemo(() => SPATIAL_THEMES[themeId], [themeId]);

  const appendSaraMessage = useCallback((text: string, tag = "SARA") => {
    setChatEntries((prev) => [
      ...prev.slice(-30),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "sara",
        text,
        tag,
        at: Date.now(),
      },
    ]);
  }, []);

  // Load app settings
  useEffect(() => {
    void api
      .appSettings()
      .then((s) => setAppSettings(s))
      .catch(() => undefined);
  }, []);

  const handleSaraLocalSettingsChange = useCallback((patch: Partial<SaraSettings>) => {
    setSaraLocalSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleAppSettingsChange = useCallback((patch: AppSettingsPatch) => {
    setAppSettings((current) => {
      if (!current) return current;
      const next = { ...current } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        const base = (current as unknown as Record<string, unknown>)[key];
        next[key] =
          value && typeof value === "object" && base && typeof base === "object"
            ? { ...(base as object), ...(value as object) }
            : value;
      }
      return next as unknown as AppSettings;
    });
    void api
      .updateAppSettings(patch)
      .then((updated) => setAppSettings(updated))
      .catch(() => undefined);
  }, []);

  // Initialize Real Gemini Live Voice Session (`SaraAudioSession`)
  useEffect(() => {
    const session = new SaraAudioSession({
      onStateChange: (st) => {
        setLiveState(st);
        if (st === "disconnected") {
          setMicPaused(false);
          setLiveCaption("");
        }
      },
      onTranscription: (role, text) => {
        if (!text.trim()) return;
        setLiveCaption(`${role === "user" ? "You" : "SARA"}: ${text}`);
        if (role === "model") {
          setChatEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.tag === "LIVE VOICE" && Date.now() - last.at < 3500) {
              return [...prev.slice(0, -1), { ...last, text: `${last.text}${text}`, at: Date.now() }];
            }
            return [
              ...prev.slice(-30),
              { id: `${Date.now()}-lv`, role: "sara", text, tag: "LIVE VOICE", at: Date.now() },
            ];
          });
        } else {
          setChatEntries((prev) => [
            ...prev.slice(-30),
            { id: `${Date.now()}-lu`, role: "user", text, tag: "VOICE", at: Date.now() },
          ]);
        }
      },
      onToolCall: (_name, _args, cb) => {
        cb({ result: "Executed in SARA Spatial 2050 Workspace." });
      },
      onError: (err) => {
        appendSaraMessage(`Voice notice: ${err}`, "VOICE");
      },
    });
    liveSessionRef.current = session;
    return () => {
      session.disconnect();
      liveSessionRef.current = null;
    };
  }, [appendSaraMessage]);

  useEffect(() => {
    liveSessionRef.current?.setSpeechMuted(speechMuted);
  }, [speechMuted]);

  const toggleLiveVoice = useCallback(async () => {
    const session = liveSessionRef.current;
    if (!session) return;
    if (liveState !== "disconnected") {
      session.disconnect();
      return;
    }
    try {
      await session.connect(true);
    } catch (err) {
      appendSaraMessage(
        err instanceof Error ? err.message : "Could not connect SARA Live Voice.",
        "VOICE",
      );
    }
  }, [liveState, appendSaraMessage]);

  const toggleMicPause = useCallback(() => {
    const next = !micPaused;
    setMicPaused(next);
    liveSessionRef.current?.setListeningPaused(next);
  }, [micPaused]);

  // Refresh SARA runtime + 2050 Horizon telemetry
  const refreshTelemetry = useCallback(async () => {
    try {
      const [asiRes, s2050Res, tasksRes] = await Promise.all([
        fetch("/api/asi/status"),
        fetch("/api/sara-2050/status"),
        fetch("/api/tasks"),
      ]);
      if (asiRes.ok) {
        const asi = await asiRes.json();
        if (asi.mode?.mode) setActiveMode(String(asi.mode.mode).toUpperCase());
        if (asi.presence?.state) {
          setPresenceLabel(
            asi.presence.state === "present_active"
              ? "OWNER PRESENT"
              : String(asi.presence.state).toUpperCase(),
          );
        }
        if (Array.isArray(asi.guardian?.labApps)) {
          setMountedApps(asi.guardian.labApps);
        }
        if (typeof asi.guardian?.latestHealth?.cpuLoadRatio === "number") {
          setCpuPercent(Math.min(100, Math.round(asi.guardian.latestHealth.cpuLoadRatio * 100)));
        }
        if (typeof asi.guardian?.latestHealth?.memoryUsedPercent === "number") {
          setRamPercent(Math.min(100, Math.round(asi.guardian.latestHealth.memoryUsedPercent)));
        }
      }
      if (s2050Res.ok) {
        const s2050 = await s2050Res.json();
        setKillSwitchActive(Boolean(s2050.killSwitchActive));
        if (s2050.affectiveProfile) setAffectiveProfile(s2050.affectiveProfile);
        if (s2050.sustainability) setSustainability(s2050.sustainability);
        if (Array.isArray(s2050.continuousGoals)) {
          setHorizonGoals(s2050.continuousGoals);
        }
        if (s2050.memoryGraphSummary) {
          setMemorySummary(s2050.memoryGraphSummary);
        }
        if (Array.isArray(s2050.recentProofDecisions) && s2050.recentProofDecisions[0]) {
          setLatestProof((prev) => prev ?? s2050.recentProofDecisions[0]);
        }
        if (autoMorph) {
          if (s2050.killSwitchActive) setThemeId("sentinel");
          else if ((s2050.affectiveProfile?.stressIndex ?? 0) >= 68) setThemeId("stealth");
        }
      }
      if (tasksRes.ok) {
        const td = await tasksRes.json();
        if (Array.isArray(td.tasks)) setTasks(td.tasks.slice(0, 6));
      }
    } catch {
      // Keep UI responsive during background reconnects
    }
  }, [autoMorph]);

  useEffect(() => {
    void refreshTelemetry();
    const timer = window.setInterval(() => void refreshTelemetry(), 4500);
    return () => window.clearInterval(timer);
  }, [refreshTelemetry]);

  // Unified SARA Command + Pushback Safety Check
  const handleSendCommand = useCallback(
    async (overrideText?: string, forceBypassPushback = false) => {
      const cmd = (overrideText ?? commandInput).trim();
      if (!cmd) return;
      if (!overrideText) setCommandInput("");

      setChatEntries((prev) => [
        ...prev.slice(-30),
        { id: `${Date.now()}-u`, role: "user", text: cmd, at: Date.now() },
      ]);

      if (autoMorph) {
        const lower = cmd.toLowerCase();
        if (/security|scan|verify|audit|proof/.test(lower)) setThemeId("sentinel");
        else if (/research|simulate|world|memory|graph|architect/.test(lower)) setThemeId("violet");
        else if (/calm|focus|quiet|minimal/.test(lower)) setThemeId("stealth");
        else setThemeId("aurora");
      }

      try {
        setBusyLabel("Evaluating safety & executing...");
        if (!forceBypassPushback) {
          const pbRes = await fetch("/api/asi/pushback/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmd }),
          });
          if (pbRes.ok) {
            const pb = await pbRes.json();
            if (pb.decision?.shouldPushBack) {
              if (!pb.decision.canOverride) {
                appendSaraMessage(pb.decision.spokenWarning, "SAFETY GATE BLOCKED");
                return;
              }
              setPendingPushback({
                command: cmd,
                warning: pb.decision.spokenWarning,
                saferAlternative: pb.decision.saferAlternative,
              });
              appendSaraMessage(pb.decision.spokenWarning, "CONFIRMATION ADVISED");
              return;
            }
          }
        }
        setPendingPushback(null);

        // Calibrate affective state locally
        void fetch("/api/sara-2050/affective", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recentMessage: cmd }),
        }).catch(() => undefined);

        // If Live Voice is connected and this is natural conversation, stream over Live Voice
        if (
          liveState !== "disconnected" &&
          liveSessionRef.current &&
          !/^(task:|mission:|cmd:|ps:|shell:|run a simulation|blueprint|optimize)/i.test(cmd)
        ) {
          liveSessionRef.current.sendText(cmd);
          return;
        }

        // Execute via SARA unified command router
        const res = await fetch("/api/jarvis/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();
        if (!res.ok) {
          appendSaraMessage(data.error || "Unable to complete directive.", "ERROR");
          return;
        }
        appendSaraMessage(
          data.reply || "Directive completed.",
          String(data.intent || "SARA").toUpperCase(),
        );
        void refreshTelemetry();
      } catch (err) {
        appendSaraMessage(
          err instanceof Error ? err.message : "Failed to reach SARA runtime.",
          "ERROR",
        );
      } finally {
        setBusyLabel(null);
      }
    },
    [commandInput, autoMorph, liveState, appendSaraMessage, refreshTelemetry],
  );

  // Tab 2 Actions: Continuous Multi-Horizon Goal + Self-Healing Lab + Multi-Node Macro
  const handleLaunchHorizonGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!horizonObjective.trim()) return;
    setBusyLabel("Decomposing multi-horizon objective & negotiating A2A contracts...");
    try {
      const res = await fetch("/api/sara-2050/continuous-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: horizonObjective.trim(),
          budgetComputeUnits: budgetUnits,
        }),
      });
      const data = await res.json();
      if (res.ok && data.plan) {
        setHorizonGoals((prev) => [data.plan, ...prev]);
        appendSaraMessage(
          `Continuous multi-horizon objective launched (${data.plan.computeTierUsed}) with ${data.plan.a2aEnvelopes?.length ?? 0} Agent-to-Agent contracts.`,
          "2050 AGENCY",
        );
      } else if (data.error) {
        appendSaraMessage(data.error, "ERROR");
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleSynthesizeLabApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labAppName.trim() || !labSpec.trim()) return;
    setBusyLabel("Synthesizing & testing isolated module...");
    try {
      const res = await fetch("/api/asi/lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labAppName.trim(), specification: labSpec.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.app) {
        setMountedApps((prev) => [data.app, ...prev.filter((a) => a.id !== data.app.id)]);
        appendSaraMessage(
          `Lab module "${data.app.name}" verified (${data.app.testsPassed ? "PASS" : "CHECK"}) in ${data.app.attemptsUsed} pass(es).`,
          "LAB SYNTHESIS",
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleRunParallelSwarmMacro = async () => {
    setBusyLabel("Executing parallel 4-node verification swarm...");
    try {
      const res = await fetch("/api/asi/house-party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directive: "Full parallel diagnostics, formal safety audit, and telemetry sync",
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        appendSaraMessage(data.result.synthesis, "SWARM COMPLETE");
      }
    } finally {
      setBusyLabel(null);
    }
  };

  // Tab 3 Actions: Causal World Model + Neuro-Symbolic Proof + Ed25519 Provenance
  const handleSimulateWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worldActionInput.trim()) return;
    setBusyLabel("Running causal & spatial world model simulation...");
    try {
      const res = await fetch("/api/sara-2050/world-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: worldActionInput.trim(),
          targetNode: worldTargetNode,
        }),
      });
      const data = await res.json();
      if (res.ok && data.prediction) {
        setLatestWorldSim(data.prediction);
        appendSaraMessage(
          `World simulation complete: risk ${data.prediction.physicalOrSystemRisk.toUpperCase()}, stability ${data.prediction.stabilityScore}/100, reversible=${data.prediction.reversible}.`,
          "WORLD MODEL",
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleVerifyProofDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofObjectiveInput.trim()) return;
    setBusyLabel("Generating neuro-symbolic proof & Ed25519 signature...");
    try {
      const res = await fetch("/api/sara-2050/proof-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: proofObjectiveInput.trim() }),
      });
      const data = await res.json();
      if (data.decision) {
        setLatestProof(data.decision);
        setProvenanceStatus(null);
        appendSaraMessage(
          `Proof-carrying decision ${data.decision.formalProof.satisfiable ? "VERIFIED (SAT)" : "BLOCKED"} • Signed Ed25519 (${data.decision.provenance.publicKeyFingerprint}).`,
          "FORMAL PROOF",
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleAuditProvenance = async () => {
    setBusyLabel("Signing & verifying Ed25519 provenance certificate...");
    try {
      const payload = latestProof?.recommendedAction || "SARA-2050-VERIFIED-CHECKPOINT";
      const signRes = await fetch("/api/sara-2050/provenance/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: "sara.audit.checkpoint", content: payload }),
      });
      const signed = await signRes.json();
      if (signed.certificate) {
        const verRes = await fetch("/api/sara-2050/provenance/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ certificate: signed.certificate, content: payload }),
        });
        const ver = await verRes.json();
        setProvenanceStatus(
          ver.valid
            ? `VERIFIED • Ed25519 (${signed.certificate.publicKeyFingerprint}) • SHA-256 ${signed.certificate.sha256Digest.slice(0, 14)}…`
            : `FAILED: ${ver.reason}`,
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  // Tab 4 Actions: Lifelong Memory Graph
  const handleAddMemoryNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memLabel.trim() || !memText.trim()) return;
    setBusyLabel("Recording node into local Lifelong Memory Graph...");
    try {
      const res = await fetch("/api/sara-2050/memory-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: memKind,
          label: memLabel.trim(),
          summary: memText.trim(),
          privateLocalOnly: memLocalOnly,
          salience: 0.85,
        }),
      });
      if (res.ok) {
        setMemLabel("");
        setMemText("");
        void refreshTelemetry();
      }
    } finally {
      setBusyLabel(null);
    }
  };

  // Global Alignment Kill-Switch
  const handleToggleKillSwitch = async () => {
    const shouldReset = killSwitchActive;
    const res = await fetch("/api/sara-2050/governance/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reset: shouldReset,
        reason: shouldReset
          ? "Owner authorized resume from SARA Spatial 2050 header"
          : "Human operator alignment override engaged from SARA Spatial 2050 header",
      }),
    });
    if (res.ok) {
      setKillSwitchActive(!shouldReset);
      if (!shouldReset) {
        liveSessionRef.current?.disconnect();
      }
      void refreshTelemetry();
    }
  };

  // Electron Window Controls
  const winBridge = (window as unknown as {
    saraDesktop?: {
      minimizeWindow?: () => void;
      toggleMaximizeWindow?: () => Promise<boolean>;
      closeWindow?: () => void;
    };
  }).saraDesktop;

  const dragStyle = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br ${theme.bgClass} text-slate-100 select-none`}
    >
      {/* ==================== TOP WINDOW & SURFACE HEADER ==================== */}
      <header
        style={dragStyle}
        className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-black/45 px-4 backdrop-blur-xl"
      >
        {/* Left: SARA Spatial 2050 Brand & Live Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
            </span>
            <span className="font-mono text-xs font-bold tracking-[0.18em] text-white uppercase">
              SARA // SPATIAL 2050
            </span>
          </div>
          <span className={`hidden rounded-md border px-2 py-0.5 font-mono text-[10px] sm:inline-block ${theme.badgeBg}`}>
            {activeMode}
          </span>
          <span className="hidden font-mono text-[10px] text-slate-400 lg:inline-block">
            {presenceLabel} • CPU {cpuPercent}% • MEM {ramPercent}%
          </span>
        </div>

        {/* Center: Spatial Theme Pills */}
        <div style={noDragStyle} className="hidden items-center gap-1 md:flex">
          {(Object.values(SPATIAL_THEMES) as SpatialThemeSpec[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setAutoMorph(false);
                setThemeId(t.id);
              }}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium transition cursor-pointer ${
                themeId === t.id
                  ? `${t.badgeBg}`
                  : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAutoMorph((v) => !v)}
            title="Automatically adapt workspace theme to task & cognitive load"
            className={`ml-1 rounded-md border px-2 py-1 font-mono text-[9px] uppercase cursor-pointer ${
              autoMorph
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/5 text-slate-400"
            }`}
          >
            Auto-Morph {autoMorph ? "ON" : "OFF"}
          </button>
        </div>

        {/* Right: Kill-Switch, UI Surface Switchers, Global Settings, Window Caption */}
        <div style={noDragStyle} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleToggleKillSwitch()}
            title="Instant Human-Alignment Override Kill-Switch"
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase transition cursor-pointer ${
              killSwitchActive
                ? "border-rose-400 bg-rose-600/40 text-white animate-pulse"
                : "border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
            }`}
          >
            <StopCircle className="h-3 w-3" />
            <span className="hidden sm:inline">{killSwitchActive ? "Resume SARA" : "Kill Switch"}</span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchSurface("live_core")}
            title="Switch to SARA 3D Live Core UI"
            className="flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
          >
            <Orbit className="h-3 w-3" />
            <span className="hidden lg:inline">3D Core UI</span>
          </button>

          <button
            type="button"
            onClick={() => onSwitchSurface("companion")}
            title="Switch to Classic SARA Companion UI"
            className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/15 cursor-pointer"
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span className="hidden lg:inline">Classic UI</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Open SARA Global Settings"
            className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-200 hover:bg-white/15 cursor-pointer"
          >
            <Settings className="h-3 w-3" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {winBridge && (
            <div className="ml-1 flex items-center border-l border-white/10 pl-1">
              <button
                type="button"
                onClick={() => winBridge.minimizeWindow?.()}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Minimize"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const m = await winBridge.toggleMaximizeWindow?.();
                  if (typeof m === "boolean") setIsMaximized(m);
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Maximize"
              >
                {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => winBridge.closeWindow?.()}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-rose-600 hover:text-white cursor-pointer"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ==================== MAIN SPATIAL WORKSPACE GRID ==================== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        {/* LEFT COLUMN (4 cols): SARA Live Neural Core + Voice + Affective & Sustainability */}
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 lg:col-span-4">
          {/* Interactive Neural Voice Core Card */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                SARA Neural Voice Core
              </span>
              <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase ${theme.badgeBg}`}>
                {liveState === "disconnected" ? "Standby" : liveState}
              </span>
            </div>

            {/* Animated Spatial Orb */}
            <div className="my-4 flex flex-col items-center justify-center">
              <button
                type="button"
                onClick={() => void toggleLiveVoice()}
                title={liveState === "disconnected" ? "Connect SARA Gemini Live Voice" : "Disconnect Live Voice"}
                className={`group relative flex h-28 w-28 items-center justify-center rounded-full border bg-gradient-to-br from-white/10 to-white/[0.02] transition-all duration-300 hover:scale-105 cursor-pointer ${theme.orbRing}`}
              >
                <div
                  className={`absolute inset-2 rounded-full border border-white/15 ${
                    liveState !== "disconnected" ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "8s" }}
                />
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/50 ${
                    liveState === "speaking" ? "scale-110 animate-pulse" : ""
                  }`}
                >
                  {liveState !== "disconnected" ? (
                    <Mic className={`h-7 w-7 ${theme.accentText}`} />
                  ) : (
                    <Bot className={`h-7 w-7 ${theme.accentText}`} />
                  )}
                </div>
              </button>
              <p className="mt-2.5 text-center text-xs text-slate-300">
                {liveState === "disconnected"
                  ? "Tap the Neural Orb to talk to SARA Live"
                  : micPaused
                  ? "Live session active • Microphone paused"
                  : liveState === "speaking"
                  ? "SARA is speaking…"
                  : "Listening in real time…"}
              </p>
              {liveCaption && (
                <div className="mt-2 w-full truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center text-[11px] text-cyan-100">
                  {liveCaption}
                </div>
              )}
            </div>

            {/* Live Audio Controls */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void toggleLiveVoice()}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition cursor-pointer ${
                  liveState !== "disconnected"
                    ? "border-rose-400/50 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                    : `${theme.accentBorder} ${theme.accentBg} text-white`
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{liveState !== "disconnected" ? "End" : "Connect"}</span>
              </button>

              <button
                type="button"
                disabled={liveState === "disconnected"}
                onClick={toggleMicPause}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                {micPaused ? <MicOff className="h-3.5 w-3.5 text-amber-300" /> : <Mic className="h-3.5 w-3.5" />}
                <span>{micPaused ? "Resume" : "Pause"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSpeechMuted((v) => !v)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2 text-xs text-slate-200 hover:bg-white/10 cursor-pointer"
              >
                {speechMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-rose-300" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-emerald-300" />
                )}
                <span>{speechMuted ? "Muted" : "Audio"}</span>
              </button>
            </div>
          </div>

          {/* Low-Friction Intent Shortcuts */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5 backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                Instant Intent Shortcuts
              </span>
              <Zap className={`h-3.5 w-3.5 ${theme.accentText}`} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["Executive Briefing", "Give me a concise executive status briefing"],
                ["Optimize System", "Optimize system memory and performance"],
                ["Scan Blueprint", "Scan codebase architecture blueprint"],
                ["Simulate Safety", "Run a digital twin simulation"],
              ].map(([label, prompt]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void handleSendCommand(prompt)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/10 cursor-pointer"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Affective Calibration + Edge Sustainability Card */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                  <HeartHandshake className="h-3.5 w-3.5 text-pink-300" />
                  Affective Calibration
                </span>
                <span className="font-mono text-[10px] text-cyan-200">
                  {affectiveProfile.pacing.replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Stress Index: {affectiveProfile.stressIndex}%</span>
                <span>Warmth: {Math.round(affectiveProfile.empathyWarmth * 100)}%</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-slate-300">
                {affectiveProfile.guidanceNote}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                  <Leaf className="h-3.5 w-3.5 text-emerald-300" />
                  Edge-Cloud Sustainability
                </span>
                <span className="font-mono text-[10px] text-emerald-300">
                  {Math.round(sustainability.edgeOffloadRatio * 100)}% Local Edge
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Edge Fast Calls: {sustainability.localEdgeFastCalls}</span>
                <span>Saved: {sustainability.estimatedJoulesSaved.toFixed(1)} J</span>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT WORKSPACE (8 cols): 4 Interactive 2050 Tabs */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl lg:col-span-8">
          {/* Workspace Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["command", "Command & Dialogue", Sparkles],
                  ["agency", "2050 Agency & Swarm", Workflow],
                  ["world_proofs", "World Model & Proofs", ShieldCheck],
                  ["memory_privacy", "Lifelong Memory & Privacy", Database],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    activeTab === id
                      ? `${theme.badgeBg}`
                      : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {busyLabel && (
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span className="max-w-[240px] truncate">{busyLabel}</span>
              </div>
            )}
          </div>

          {/* ==================== TAB 1: COMMAND & DIALOGUE ==================== */}
          {activeTab === "command" && (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-4">
              {pendingPushback && (
                <div className="rounded-xl border border-amber-400/45 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-200 uppercase">
                    <AlertTriangle className="h-4 w-4" />
                    <span>SARA Safety Advisory</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-100">{pendingPushback.warning}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {pendingPushback.saferAlternative && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleSendCommand(pendingPushback.saferAlternative!, true)
                        }
                        className="rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
                      >
                        Run Safer Alternative
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSendCommand(pendingPushback.command, true)}
                      className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 cursor-pointer"
                    >
                      Proceed Anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingPushback(null)}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Conversation Stream */}
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {chatEntries.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      item.role === "user"
                        ? "ml-12 border border-white/15 bg-white/10 text-white"
                        : "mr-8 border border-cyan-400/20 bg-white/[0.04] text-slate-100"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-wider text-slate-400 uppercase">
                      <span>{item.role === "user" ? "You" : "SARA"}</span>
                      {item.tag && <span className={theme.accentText}>{item.tag}</span>}
                    </div>
                    <div className="whitespace-pre-wrap">{item.text}</div>
                  </div>
                ))}
              </div>

              {/* Active Desktop Tasks Strip */}
              {tasks.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="mb-1 font-mono text-[10px] text-slate-400 uppercase">
                    Recent Autonomous Tasks ({tasks.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tasks.slice(0, 4).map((t) => (
                      <span
                        key={t.id}
                        className="max-w-[220px] truncate rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-slate-200"
                      >
                        {t.goal} • {(t.state || t.status || "queued").toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Unified Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendCommand();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Ask or command SARA (chat, 'task: ...', 'run a simulation', 'optimize')..."
                  className="h-11 flex-1 rounded-xl border border-white/15 bg-black/55 px-4 text-xs text-white outline-none focus:border-cyan-400/60"
                />
                <button
                  type="submit"
                  className={`flex h-11 items-center gap-1.5 rounded-xl border px-4 text-xs font-semibold text-white transition cursor-pointer ${theme.accentBorder} ${theme.accentBg}`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

          {/* ==================== TAB 2: 2050 CONTINUOUS AGENCY & SWARM ==================== */}
          {activeTab === "agency" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* Multi-Horizon Goal Decomposition + A2A Contracts */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                      Continuous Multi-Horizon Agency & Agent-to-Agent (A2A) Mesh
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Decomposes objectives across Architect, World-Sim, Verifier, Executor, and Economist sub-agents with explicit compute budgets.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunParallelSwarmMacro()}
                    className="shrink-0 rounded-xl border border-purple-400/40 bg-purple-500/20 px-3 py-1.5 text-[11px] font-semibold text-purple-100 hover:bg-purple-500/30 cursor-pointer"
                  >
                    Run 4-Node Swarm
                  </button>
                </div>

                <form onSubmit={(e) => void handleLaunchHorizonGoal(e)} className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="number"
                    min={20}
                    max={500}
                    value={budgetUnits}
                    onChange={(e) => setBudgetUnits(Number(e.target.value) || 100)}
                    title="Compute Unit Budget"
                    className="h-9 w-24 rounded-xl border border-white/15 bg-black/60 px-2.5 text-center text-xs text-white"
                  />
                  <input
                    type="text"
                    value={horizonObjective}
                    onChange={(e) => setHorizonObjective(e.target.value)}
                    placeholder="High-level autonomous objective..."
                    className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className={`h-9 rounded-xl border px-4 text-xs font-semibold text-white cursor-pointer ${theme.accentBorder} ${theme.accentBg}`}
                  >
                    Launch Horizon Plan
                  </button>
                </form>

                {horizonGoals.length > 0 && (
                  <div className="mt-3 space-y-2.5">
                    {horizonGoals.slice(0, 3).map((g) => (
                      <div key={g.goalId} className="rounded-xl border border-white/10 bg-black/45 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{g.objective}</span>
                          <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${theme.badgeBg}`}>
                            {g.status} • {g.computeTierUsed === "local_edge_neuromorphic" ? "LOCAL EDGE" : "HYBRID GEMINI"}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[11px]">
                            <div className="font-mono text-[9px] text-cyan-300 uppercase">Immediate</div>
                            <div className="mt-0.5 text-slate-200">{g.horizons.immediate[0] || "Ready"}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[11px]">
                            <div className="font-mono text-[9px] text-purple-300 uppercase">Sprint</div>
                            <div className="mt-0.5 text-slate-200">{g.horizons.sprint[0] || "Queued"}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[11px]">
                            <div className="font-mono text-[9px] text-emerald-300 uppercase">Long Horizon</div>
                            <div className="mt-0.5 text-slate-200">{g.horizons.longHorizon[0] || "Aligned"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Self-Healing Lab App Synthesizer */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-cyan-300" />
                  <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                    Self-Healing Isolated Lab Synthesizer
                  </h3>
                </div>
                <form onSubmit={(e) => void handleSynthesizeLabApp(e)} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    type="text"
                    value={labAppName}
                    onChange={(e) => setLabAppName(e.target.value)}
                    placeholder="Module name"
                    className="h-9 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={labSpec}
                    onChange={(e) => setLabSpec(e.target.value)}
                    placeholder="Module specification"
                    className="h-9 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white sm:col-span-2"
                  />
                  <button
                    type="submit"
                    className="h-9 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 sm:col-span-3 cursor-pointer"
                  >
                    Synthesize, Verify & Mount Lab Module
                  </button>
                </form>
                {mountedApps.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {mountedApps.slice(0, 4).map((app) => (
                      <div
                        key={app.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs"
                      >
                        <span className="truncate font-medium text-white">{app.name}</span>
                        <span className="font-mono text-[10px] text-emerald-300">
                          {app.testsPassed ? "PASS" : "CHECK"} ({app.attemptsUsed}x)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 3: CAUSAL WORLD MODEL & PROOFS ==================== */}
          {activeTab === "world_proofs" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {/* Causal & Spatial World Model Simulator */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-cyan-300" />
                  <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                    Causal & Spatial World Model Simulator
                  </h3>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Predicts downstream cause-and-effect state propagation, system stability score, and reversibility before acting.
                </p>
                <form onSubmit={(e) => void handleSimulateWorld(e)} className="mt-3 flex flex-wrap gap-2">
                  <select
                    value={worldTargetNode}
                    onChange={(e) => setWorldTargetNode(e.target.value)}
                    className="h-9 rounded-xl border border-white/15 bg-black/60 px-2.5 text-xs text-white"
                  >
                    <option value="codebase_integrity">Codebase Integrity</option>
                    <option value="host_compute">Host Compute</option>
                    <option value="desktop_workspace">Desktop Workspace</option>
                    <option value="security_perimeter">Security Perimeter</option>
                  </select>
                  <input
                    type="text"
                    value={worldActionInput}
                    onChange={(e) => setWorldActionInput(e.target.value)}
                    placeholder="Proposed intervention to simulate..."
                    className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className={`h-9 rounded-xl border px-4 text-xs font-semibold text-white cursor-pointer ${theme.accentBorder} ${theme.accentBg}`}
                  >
                    Simulate Outcome
                  </button>
                </form>

                {latestWorldSim && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/45 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                      <span
                        className={
                          latestWorldSim.physicalOrSystemRisk === "low"
                            ? "text-emerald-300"
                            : "text-amber-300"
                        }
                      >
                        RISK: {latestWorldSim.physicalOrSystemRisk.toUpperCase()} • STABILITY:{" "}
                        {latestWorldSim.stabilityScore}/100
                      </span>
                      <span className="text-slate-400">
                        {latestWorldSim.reversible ? "Reversible" : "Irreversible"}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                      {latestWorldSim.predictedChain.map((step, idx) => (
                        <div key={idx}>
                          • <span className="font-mono text-cyan-200">{step.node}</span> (
                          {step.delta >= 0 ? `+${step.delta}` : step.delta}): {step.effect}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Neuro-Symbolic Proof-Carrying Decision + Ed25519 Provenance */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-emerald-300" />
                    <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                      Neuro-Symbolic Proof-Carrying Decisions & Ed25519 Provenance
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAuditProvenance()}
                    className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
                  >
                    Verify Ed25519 Chain
                  </button>
                </div>

                <form onSubmit={(e) => void handleVerifyProofDecision(e)} className="mt-3 flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={proofObjectiveInput}
                    onChange={(e) => setProofObjectiveInput(e.target.value)}
                    placeholder="Critical objective requiring formal symbolic proof..."
                    className="h-9 min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="h-9 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
                  >
                    Generate Proof
                  </button>
                </form>

                {provenanceStatus && (
                  <div className="mt-2.5 rounded-xl border border-emerald-400/30 bg-emerald-950/30 px-3 py-2 font-mono text-[11px] text-emerald-200">
                    {provenanceStatus}
                  </div>
                )}

                {latestProof && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/45 p-3 text-xs">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span
                        className={
                          latestProof.formalProof.satisfiable ? "text-emerald-300" : "text-rose-300"
                        }
                      >
                        {latestProof.formalProof.satisfiable
                          ? "PROOF VERIFIED (SATISFIABLE)"
                          : "CONSTRAINT BLOCKED (UNSAT)"}
                      </span>
                      <span className="text-slate-400">
                        Key: {latestProof.provenance.publicKeyFingerprint}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-200">
                      {latestProof.recommendedAction}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 4: LIFELONG MEMORY GRAPH & PRIVACY ==================== */}
          {activeTab === "memory_privacy" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-cyan-300" />
                    <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                      100% Local Lifelong Memory Graph & Sovereign Privacy Vault
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] text-cyan-200">
                    {memorySummary.nodeCount} Nodes • {memorySummary.edgeCount} Relations
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Stored strictly on local disk (DATA_DIR/memory/lifelong_graph.v1.json). Zero Supabase, zero external telemetry, automatic PII redaction before external sub-tasks.
                </p>

                <form onSubmit={(e) => void handleAddMemoryNode(e)} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <select
                    value={memKind}
                    onChange={(e) => setMemKind(e.target.value as typeof memKind)}
                    className="h-9 rounded-xl border border-white/15 bg-black/60 px-2.5 text-xs text-white"
                  >
                    <option value="project">Project</option>
                    <option value="preference">Preference</option>
                    <option value="decision">Decision</option>
                    <option value="concept">Concept</option>
                    <option value="episode">Episode</option>
                  </select>
                  <input
                    type="text"
                    value={memLabel}
                    onChange={(e) => setMemLabel(e.target.value)}
                    placeholder="Entity label..."
                    className="h-9 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={memText}
                    onChange={(e) => setMemText(e.target.value)}
                    placeholder="Context summary..."
                    className="h-9 rounded-xl border border-white/15 bg-black/55 px-3 text-xs text-white"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={memLocalOnly ? "local_only" : "anonymizable"}
                      onChange={(e) => setMemLocalOnly(e.target.value === "local_only")}
                      className="h-9 flex-1 rounded-xl border border-white/15 bg-black/60 px-2 text-[11px] text-white"
                    >
                      <option value="local_only">Local Only</option>
                      <option value="anonymizable">Anonymizable</option>
                    </select>
                    <button
                      type="submit"
                      className={`flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold text-white cursor-pointer ${theme.accentBorder} ${theme.accentBg}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </form>

                {/* Graph Nodes Grid */}
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {memorySummary.topNodes.map((node) => (
                    <div
                      key={node.id}
                      className="rounded-xl border border-white/10 bg-black/45 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="text-cyan-300 uppercase">{node.kind}</span>
                        <span className="text-slate-400">
                          {node.privateLocalOnly ? "local_only" : "anonymizable"}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-white">{node.label}</div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{node.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Embedded Full SARA Settings Modal */}
      <SettingsPanel
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

export default SaraOsApp;
