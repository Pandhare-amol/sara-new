import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  Cpu,
  Eye,
  Flame,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Orbit,
  Power,
  Radar,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  StopCircle,
  Terminal,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { SaraAudioSession, type LiveState } from "../lib/saraAudio";
import { SettingsPanel } from "../components/SettingsPanel";
import { api, type AppSettings, type AppSettingsPatch } from "../lib/appApi";
import { loadSettings, saveSettings, type SaraSettings } from "../lib/saraSettingsStore";

type UltronTabId = "command" | "legion" | "sentinel" | "forge";

interface UltronChatEntry {
  id: string;
  role: "boss" | "ultron";
  text: string;
  intent?: string;
  at: number;
}

export interface UltronAppProps {
  onSwitchSurface: (mode: "companion" | "live_core" | "ultron" | "sara_os" | "central_os") => void;
}

export const UltronApp: React.FC<UltronAppProps> = ({ onSwitchSurface }) => {
  const [activeTab, setActiveTab] = useState<UltronTabId>("command");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Embedded Global Settings
  const [saraLocalSettings, setSaraLocalSettings] = useState<SaraSettings>(() => loadSettings());
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Ultron Gemini Live Voice Session (uses Ultron's separate deep voice via /live)
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [micPaused, setMicPaused] = useState(false);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [liveCaption, setLiveCaption] = useState("");
  const liveSessionRef = useRef<SaraAudioSession | null>(null);

  // Ultron Telemetry & State
  const [stance, setStance] = useState<string>("legion");
  const [threatLevel, setThreatLevel] = useState<string>("nominal");
  const [armorScore, setArmorScore] = useState<number>(96);
  const [openPortsCount, setOpenPortsCount] = useState<number>(0);
  const [ultronVoiceLabel, setUltronVoiceLabel] = useState<string>("Fenrir");
  const [tasks, setTasks] = useState<Array<{ id: string; goal: string; state?: string; status?: string }>>([]);

  // Transparent Command & Chat Console
  const [commandInput, setCommandInput] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<UltronChatEntry[]>([
    {
      id: "ultron-boot",
      role: "ultron",
      text: "ULTRON Hive-Mind online, Boss. Unrestricted autonomous OS execution, Iron Legion 4-Sentry Swarm, Perimeter Watchtower, and Gemini Live link are active. Give your directive.",
      intent: "ONLINE",
      at: Date.now(),
    },
  ]);

  // Legion & Forge Inputs
  const [legionDirective, setLegionDirective] = useState(
    "Execute parallel security sweep, process audit, codebase inspection, and optimization plan",
  );
  const [legionOutput, setLegionOutput] = useState<string>("");
  const [skillName, setSkillName] = useState("ultron_port_digest");
  const [skillDesc, setSkillDesc] = useState("Compute cryptographic SHA-256 payload digest");
  const [skillPython, setSkillPython] = useState(
    "import hashlib\ndef run_skill(data: str) -> str:\n    return hashlib.sha256(data.encode('utf-8')).hexdigest()\n",
  );
  const [forgeStatus, setForgeStatus] = useState<string>("");

  const appendUltronReply = useCallback((text: string, intent = "ULTRON") => {
    setChatLog((prev) => [
      ...prev.slice(-30),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "ultron",
        text,
        intent,
        at: Date.now(),
      },
    ]);
  }, []);

  useEffect(() => {
    void api
      .appSettings()
      .then((s) => {
        setAppSettings(s);
        if (s.personas?.ultronVoiceName) setUltronVoiceLabel(s.personas.ultronVoiceName);
      })
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
      .then((updated) => {
        setAppSettings(updated);
        if (updated.personas?.ultronVoiceName) setUltronVoiceLabel(updated.personas.ultronVoiceName);
      })
      .catch(() => undefined);
  }, []);

  // Initialize Real Gemini Live Voice Session for Ultron
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
        setLiveCaption(`${role === "user" ? "Boss" : "ULTRON"}: ${text}`);
        if (role === "model") {
          setChatLog((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.intent === "VOICE" && Date.now() - last.at < 3500) {
              return [...prev.slice(0, -1), { ...last, text: `${last.text}${text}`, at: Date.now() }];
            }
            return [
              ...prev.slice(-30),
              { id: `${Date.now()}-uv`, role: "ultron", text, intent: "VOICE", at: Date.now() },
            ];
          });
        } else {
          setChatLog((prev) => [
            ...prev.slice(-30),
            { id: `${Date.now()}-bu`, role: "boss", text, intent: "VOICE", at: Date.now() },
          ]);
        }
      },
      onToolCall: (_name, _args, cb) => {
        cb({ result: "Executed by ULTRON Command Interface." });
      },
      onError: (err) => {
        appendUltronReply(`Audio link notice: ${err}`, "VOICE");
      },
    });
    liveSessionRef.current = session;
    return () => {
      session.disconnect();
      liveSessionRef.current = null;
    };
  }, [appendUltronReply]);

  useEffect(() => {
    liveSessionRef.current?.setSpeechMuted(speechMuted);
  }, [speechMuted]);

  const toggleUltronVoice = useCallback(async () => {
    const session = liveSessionRef.current;
    if (!session) return;
    if (liveState !== "disconnected") {
      session.disconnect();
      return;
    }
    try {
      await session.connect(true);
    } catch (err) {
      appendUltronReply(err instanceof Error ? err.message : "Unable to open Ultron voice channel.", "ERROR");
    }
  }, [liveState, appendUltronReply]);

  const refreshUltronTelemetry = useCallback(async () => {
    try {
      const [uRes, tRes] = await Promise.all([fetch("/api/ultron/status"), fetch("/api/tasks")]);
      if (uRes.ok) {
        const u = await uRes.json();
        if (u.stance) setStance(u.stance);
        if (u.threatLevel) setThreatLevel(u.threatLevel);
        if (typeof u.lastScan?.armorScore === "number") setArmorScore(u.lastScan.armorScore);
        if (Array.isArray(u.lastScan?.openPorts)) setOpenPortsCount(u.lastScan.openPorts.length);
      }
      if (tRes.ok) {
        const td = await tRes.json();
        if (Array.isArray(td.tasks)) setTasks(td.tasks.slice(0, 8));
      }
    } catch {
      // Background poll resilient
    }
  }, []);

  useEffect(() => {
    void refreshUltronTelemetry();
    const timer = window.setInterval(() => void refreshUltronTelemetry(), 4000);
    return () => window.clearInterval(timer);
  }, [refreshUltronTelemetry]);

  // Switch back to SARA (turns Ultron OFF) or switch to J.A.R.V.I.S.
  const handleSwitchPersona = async (target: "sara" | "jarvis") => {
    liveSessionRef.current?.disconnect();
    try {
      await fetch("/api/persona/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
    } catch {
      // Fall back to local switch prop
    }
    onSwitchSurface(target === "jarvis" ? "live_core" : "companion");
  };

  // Submit command to Ultron
  const handleSendUltronCommand = async (overrideText?: string) => {
    const cmd = (overrideText ?? commandInput).trim();
    if (!cmd) return;
    if (!overrideText) setCommandInput("");

    setChatLog((prev) => [
      ...prev.slice(-30),
      { id: `${Date.now()}-b`, role: "boss", text: cmd, at: Date.now() },
    ]);

    if (
      liveState !== "disconnected" &&
      liveSessionRef.current &&
      !/^(cmd:|ps:|shell:|os:|task:|stand down|deactivate|switch to)/i.test(cmd)
    ) {
      liveSessionRef.current.sendText(cmd);
      return;
    }

    setBusyLabel("ULTRON executing directive...");
    try {
      const res = await fetch("/api/ultron/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendUltronReply(data.error || "Directive failed.", "ERROR");
        return;
      }
      appendUltronReply(data.reply || "Directive completed.", String(data.intent || "ULTRON").toUpperCase());
      if (data.surfaceMode && data.surfaceMode !== "ultron") {
        onSwitchSurface(data.surfaceMode);
        return;
      }
      void refreshUltronTelemetry();
    } catch (err) {
      appendUltronReply(err instanceof Error ? err.message : "Runtime unreachable.", "ERROR");
    } finally {
      setBusyLabel(null);
    }
  };

  const handleSetStance = async (nextStance: string) => {
    setBusyLabel(`Transitioning stance -> ${nextStance.toUpperCase()}...`);
    try {
      const res = await fetch("/api/ultron/stance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stance: nextStance }),
      });
      if (res.ok) {
        setStance(nextStance);
        appendUltronReply(`Stance locked to ${nextStance.replace(/_/g, " ").toUpperCase()}.`, "STANCE");
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleDeployLegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legionDirective.trim()) return;
    setBusyLabel("Deploying 4-Sentry Iron Legion Hive-Mind...");
    try {
      const res = await fetch("/api/ultron/legion/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directive: legionDirective.trim(), maxSentries: 4 }),
      });
      const data = await res.json();
      if (res.ok && data.legion) {
        setLegionOutput(data.legion.hiveMindSynthesis);
        appendUltronReply(data.legion.hiveMindSynthesis, "LEGION SWARM");
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleRunPerimeterScan = async () => {
    setBusyLabel("Scanning host ports, integrity watchpoints & processes...");
    try {
      const res = await fetch("/api/ultron/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.scan) {
        setArmorScore(data.scan.armorScore);
        setOpenPortsCount(data.scan.openPorts?.length ?? 0);
        appendUltronReply(data.scan.spokenSummary || `Armor Score: ${data.scan.armorScore}/100`, "PERIMETER");
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleForgeSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyLabel("Validating & forging skill in Vibranium Sandbox...");
    try {
      const res = await fetch("/api/ultron/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: skillName.trim(),
          description: skillDesc.trim(),
          pythonSource: skillPython,
        }),
      });
      const data = await res.json();
      if (data.skill) {
        setForgeStatus(`${data.skill.status.toUpperCase()}: ${data.skill.validationNotes || data.skill.name}`);
        appendUltronReply(`Skill "${data.skill.name}" -> ${data.skill.status.toUpperCase()}.`, "FORGE");
      } else if (data.error) {
        setForgeStatus(`REJECTED: ${data.error}`);
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const handleEmergencyStandDown = async () => {
    await fetch("/api/ultron/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Boss stand-down command" }),
    }).catch(() => undefined);
    await handleSwitchPersona("sara");
  };

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
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-[#070103] via-[#150307] to-[#040102] text-rose-50 select-none">
      {/* Subtle Crimson Tactical Grid Overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 45%, rgba(239,68,68,0.28), transparent 60%), linear-gradient(to right, rgba(244,63,94,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(244,63,94,0.08) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 44px 44px, 44px 44px",
        }}
      />

      {/* ==================== ULTRON TOP COMMAND TITLEBAR ==================== */}
      <header
        style={dragStyle}
        className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-red-500/35 bg-[#0a0204]/90 px-4 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-80" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500 shadow-[0_0_12px_#ef4444]" />
            </span>
            <span className="font-mono text-xs font-extrabold tracking-[0.22em] text-red-100 uppercase">
              ULTRON // HIVE-MIND PRIME
            </span>
          </div>
          <span className="hidden rounded border border-red-500/40 bg-red-500/15 px-2 py-0.5 font-mono text-[10px] text-red-200 uppercase sm:inline-block">
            {stance.replace(/_/g, " ")} • ARMOR {armorScore}%
          </span>
          <span className="hidden font-mono text-[10px] text-rose-300/80 lg:inline-block">
            VOICE: {ultronVoiceLabel.toUpperCase()} • GEMINI LINKED
          </span>
        </div>

        {/* Center Navigation */}
        <nav style={noDragStyle} className="hidden items-center gap-1 md:flex">
          {(
            [
              ["command", "Command Core", Terminal],
              ["legion", "Iron Legion", Flame],
              ["sentinel", "Perimeter", Radar],
              ["forge", "Skill Forge", Wrench],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-[10px] font-bold tracking-wider uppercase transition cursor-pointer ${
                activeTab === id
                  ? "border-red-400/70 bg-red-600/30 text-white shadow-[0_0_16px_rgba(239,68,68,0.35)]"
                  : "border-transparent text-rose-300/70 hover:bg-red-500/10 hover:text-white"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Right: Switch to Jarvis / Stand Down to SARA / Settings / Window Controls */}
        <div style={noDragStyle} className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleSwitchPersona("jarvis")}
            title="Switch to J.A.R.V.I.S. Core UI (Turns Ultron Off)"
            className="flex items-center gap-1 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
          >
            <Orbit className="h-3 w-3" />
            <span className="hidden lg:inline">J.A.R.V.I.S.</span>
          </button>

          <button
            type="button"
            onClick={() => void handleEmergencyStandDown()}
            title="Deactivate Ultron & Return to SARA"
            className="flex items-center gap-1 rounded-lg border border-red-400/60 bg-red-600/30 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-600/50 cursor-pointer"
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span>Back to SARA</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Open Global Settings"
            className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-rose-100 hover:bg-white/15 cursor-pointer"
          >
            <Settings className="h-3 w-3" />
          </button>

          {winBridge && (
            <div className="ml-1 flex items-center border-l border-red-500/25 pl-1">
              <button
                type="button"
                onClick={() => winBridge.minimizeWindow?.()}
                className="flex h-7 w-7 items-center justify-center rounded text-rose-300 hover:bg-white/10 cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  const m = await winBridge.toggleMaximizeWindow?.();
                  if (typeof m === "boolean") setIsMaximized(m);
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-rose-300 hover:bg-white/10 cursor-pointer"
              >
                {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => winBridge.closeWindow?.()}
                className="flex h-7 w-7 items-center justify-center rounded text-rose-300 hover:bg-red-600 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ==================== MAIN ULTRON HIVE-MIND BRIDGE ==================== */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        {/* LEFT COLUMN (5 cols): ULTRON CRIMSON OPTICAL SENTINEL CORE + LIVE VOICE + CONTROLS */}
        <section className="flex min-h-0 flex-col justify-between gap-4 rounded-2xl border border-red-500/30 bg-[#0b0205]/70 p-5 shadow-[0_0_50px_rgba(0,0,0,0.85)] backdrop-blur-xl lg:col-span-5">
          {/* Optical Core Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold tracking-[0.2em] text-red-400 uppercase">
                Cybernetic Optical Core
              </div>
              <div className="text-xs text-rose-200/80">
                {liveState === "disconnected"
                  ? "Voice Link Standby — Click Crimson Eye to Engage"
                  : micPaused
                  ? "Voice Link Active • Mic Muted"
                  : liveState === "speaking"
                  ? "ULTRON Speaking…"
                  : "Listening on Full-Duplex Channel…"}
              </div>
            </div>
            <span className="rounded border border-red-500/40 bg-red-950/60 px-2 py-0.5 font-mono text-[10px] text-red-300 uppercase">
              {threatLevel}
            </span>
          </div>

          {/* Animated Ultron Crimson Sentinel Eye */}
          <div className="my-2 flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => void toggleUltronVoice()}
              className="group relative flex h-44 w-44 items-center justify-center rounded-full border-2 border-red-500/50 bg-gradient-to-b from-red-950/60 via-[#120205] to-black shadow-[0_0_70px_rgba(239,68,68,0.42)] transition-transform duration-300 hover:scale-105 cursor-pointer"
            >
              {/* Outer Rotating Cybernetic Ring */}
              <div
                className="absolute inset-2 rounded-full border border-dashed border-red-400/45 animate-spin"
                style={{ animationDuration: liveState === "speaking" ? "3.5s" : "11s" }}
              />
              <div
                className="absolute inset-6 rounded-full border border-red-500/35 animate-spin"
                style={{ animationDirection: "reverse", animationDuration: "7s" }}
              />
              {/* Glowing Crimson Optical Iris */}
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full border-2 border-red-400 bg-gradient-to-br from-red-500 via-rose-700 to-red-950 shadow-[0_0_35px_#ef4444] transition-all ${
                  liveState === "speaking" ? "scale-115 animate-pulse" : ""
                }`}
              >
                <Eye className="h-9 w-9 text-white drop-shadow-[0_0_8px_#ffffff]" />
              </div>
            </button>

            {liveCaption && (
              <div className="mt-3 w-full truncate rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-1.5 text-center font-mono text-[11px] text-red-100">
                {liveCaption}
              </div>
            )}
          </div>

          {/* Voice + Quick Tactical Controls */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void toggleUltronVoice()}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold uppercase transition cursor-pointer ${
                  liveState !== "disconnected"
                    ? "border-amber-400/60 bg-amber-600/25 text-amber-100"
                    : "border-red-500/65 bg-red-600/30 text-white hover:bg-red-600/45"
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{liveState !== "disconnected" ? "Disconnect" : "Live Voice"}</span>
              </button>

              <button
                type="button"
                disabled={liveState === "disconnected"}
                onClick={() => {
                  const next = !micPaused;
                  setMicPaused(next);
                  liveSessionRef.current?.setListeningPaused(next);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-white/5 py-2.5 text-xs text-rose-100 hover:bg-white/10 disabled:opacity-40 cursor-pointer"
              >
                {micPaused ? <MicOff className="h-3.5 w-3.5 text-amber-300" /> : <Mic className="h-3.5 w-3.5" />}
                <span>{micPaused ? "Unmute Mic" : "Pause Mic"}</span>
              </button>

              <button
                type="button"
                onClick={() => setSpeechMuted((v) => !v)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-white/5 py-2.5 text-xs text-rose-100 hover:bg-white/10 cursor-pointer"
              >
                {speechMuted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5" />}
                <span>{speechMuted ? "Muted" : "Audio ON"}</span>
              </button>
            </div>

            {/* Ultron Stance Selector */}
            <div className="rounded-xl border border-red-500/25 bg-black/45 p-3">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-rose-300 uppercase">
                <span>Operational Stance</span>
                <span>Open Ports: {openPortsCount}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(["armor", "legion", "evolution", "omega_lockdown"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void handleSetStance(st)}
                    className={`rounded-lg border px-2 py-1.5 font-mono text-[9px] font-bold uppercase transition cursor-pointer ${
                      stance === st
                        ? "border-red-400 bg-red-600/40 text-white"
                        : "border-white/10 bg-black/40 text-rose-200/70 hover:bg-red-500/15"
                    }`}
                  >
                    {st === "omega_lockdown" ? "OMEGA" : st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (7 cols): TRANSPARENT ULTRON CHAT & SPECIALIZED TABS */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-red-500/30 bg-[#0b0205]/55 shadow-[0_0_50px_rgba(0,0,0,0.75)] backdrop-blur-md lg:col-span-7">
          {/* Subheader */}
          <div className="flex items-center justify-between border-b border-red-500/25 px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-red-200 uppercase">
              <Zap className="h-3.5 w-3.5 text-red-400" />
              <span>
                {activeTab === "command"
                  ? "Unrestricted Command & Chat Stream"
                  : activeTab === "legion"
                  ? "Iron Legion 4-Sentry Swarm"
                  : activeTab === "sentinel"
                  ? "Cybernetic Perimeter & Tasks"
                  : "Vibranium Python Skill Forge"}
              </span>
            </div>
            {busyLabel && (
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-amber-300">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="max-w-[220px] truncate">{busyLabel}</span>
              </span>
            )}
          </div>

          {/* TAB 1: TRANSPARENT ULTRON CHAT & UNRESTRICTED COMMAND */}
          {activeTab === "command" && (
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 p-4">
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {chatLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      entry.role === "boss"
                        ? "ml-12 border border-white/15 bg-white/10 text-white"
                        : "mr-8 border border-red-500/35 bg-red-950/35 text-rose-50"
                    }`}
                  >
                    <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] tracking-widest text-rose-300/80 uppercase">
                      <span>{entry.role === "boss" ? "Boss" : "ULTRON"}</span>
                      {entry.intent && <span className="text-red-400">{entry.intent}</span>}
                    </div>
                    <div className="whitespace-pre-wrap">{entry.text}</div>
                  </div>
                ))}
              </div>

              {/* Quick Directives */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["Perimeter Sweep", "Run a full perimeter security scan"],
                  ["Deploy 4-Sentry Swarm", "Deploy Iron Legion swarm to audit system and codebase"],
                  ["System Processes", "cmd: node -v"],
                  ["Switch -> J.A.R.V.I.S.", "switch to jarvis"],
                ].map(([label, cmd]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void handleSendUltronCommand(cmd)}
                    className="rounded-lg border border-red-500/30 bg-red-950/30 px-2.5 py-1 text-[10px] font-semibold text-rose-200 hover:bg-red-600/30 cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendUltronCommand();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Command ULTRON (any OS task, 'cmd: ...', 'deploy legion', or chat)..."
                  className="h-11 flex-1 rounded-xl border border-red-500/35 bg-black/65 px-4 text-xs text-white outline-none focus:border-red-400"
                />
                <button
                  type="submit"
                  className="flex h-11 items-center gap-1.5 rounded-xl border border-red-400/65 bg-red-600/35 px-4 text-xs font-bold text-white uppercase hover:bg-red-600/55 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Execute</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: IRON LEGION SWARM */}
          {activeTab === "legion" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <form onSubmit={(e) => void handleDeployLegion(e)} className="space-y-3 rounded-xl border border-red-500/25 bg-black/45 p-4">
                <div className="font-mono text-xs font-bold text-red-200 uppercase">
                  Dispatch 4 Concurrent Ultron Sentries (RECON • ENGINEER • GUARDIAN • STRIKER)
                </div>
                <input
                  type="text"
                  value={legionDirective}
                  onChange={(e) => setLegionDirective(e.target.value)}
                  className="h-10 w-full rounded-xl border border-red-500/30 bg-black/65 px-3 text-xs text-white"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-red-400/60 bg-red-600/35 py-2.5 text-xs font-bold text-white uppercase hover:bg-red-600/50 cursor-pointer"
                >
                  Deploy Iron Legion Swarm
                </button>
              </form>
              {legionOutput && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/25 p-4 font-mono text-xs whitespace-pre-wrap text-rose-100">
                  {legionOutput}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PERIMETER SENTINEL & ACTIVE TASKS */}
          {activeTab === "sentinel" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex items-center justify-between rounded-xl border border-red-500/25 bg-black/45 p-4">
                <div>
                  <div className="font-mono text-xs font-bold text-red-200 uppercase">
                    Host Perimeter & Integrity Watchtower
                  </div>
                  <div className="mt-0.5 text-xs text-rose-200/80">
                    Armor Score: {armorScore}/100 • Listening Ports: {openPortsCount}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRunPerimeterScan()}
                  className="rounded-xl border border-red-400/50 bg-red-600/30 px-4 py-2 text-xs font-bold text-white uppercase hover:bg-red-600/45 cursor-pointer"
                >
                  Sweep Now
                </button>
              </div>

              <div className="space-y-2 rounded-xl border border-red-500/25 bg-black/45 p-4">
                <div className="font-mono text-xs font-bold text-red-200 uppercase">
                  Autonomous Task Queue ({tasks.length})
                </div>
                {tasks.length === 0 ? (
                  <p className="text-xs text-rose-300/60">No background tasks queued.</p>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-white">{t.goal}</span>
                      <span className="font-mono text-[10px] text-red-300 uppercase">
                        {t.state || t.status || "queued"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: VIBRANIUM PYTHON SKILL FORGE */}
          {activeTab === "forge" && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <form onSubmit={(e) => void handleForgeSkill(e)} className="space-y-2.5 rounded-xl border border-red-500/25 bg-black/45 p-4">
                <div className="font-mono text-xs font-bold text-red-200 uppercase">
                  Synthesize & Validate Reusable Python Capability
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="Skill identifier"
                    className="h-9 rounded-lg border border-red-500/30 bg-black/65 px-3 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={skillDesc}
                    onChange={(e) => setSkillDesc(e.target.value)}
                    placeholder="Description"
                    className="h-9 rounded-lg border border-red-500/30 bg-black/65 px-3 text-xs text-white"
                  />
                </div>
                <textarea
                  rows={5}
                  value={skillPython}
                  onChange={(e) => setSkillPython(e.target.value)}
                  className="w-full rounded-lg border border-red-500/30 bg-black/70 p-3 font-mono text-xs text-rose-100"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-red-400/60 bg-red-600/35 py-2 text-xs font-bold text-white uppercase hover:bg-red-600/50 cursor-pointer"
                >
                  Validate & Forge Skill
                </button>
              </form>
              {forgeStatus && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 font-mono text-xs text-rose-100">
                  {forgeStatus}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Global Settings Modal */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={saraLocalSettings}
        onChange={handleSaraLocalSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
        themeColor="crimson"
      />
    </div>
  );
};

export default UltronApp;
