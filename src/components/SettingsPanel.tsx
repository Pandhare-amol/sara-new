/**
 * Settings — one place for everything Sara can be configured to do.
 *
 * Two stores back this page:
 *  - local renderer settings (src/lib/saraSettingsStore.ts): wake word, mic,
 *    startup, animations, character shine;
 *  - server settings (/api/app-settings, settings/appSettings.ts) plus the
 *    permission policy (/api/permissions), which the agent enforces.
 * Only settings that the app actually honours are shown here.
 */
import React, { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Settings, X, Power, Mic, Cpu, Info, Check, AlertTriangle, Sparkles, KeyRound, Loader2, Brain, ShieldCheck,
  Bell, Eye, MonitorSmartphone, Lock, Wrench,
} from "lucide-react";
import type { SaraSettings } from "../lib/saraSettingsStore";
import { api, LOCKED_CAPABILITIES, type AppSettings, type AppSettingsPatch, type Decision, type ModelCatalogue, type PermissionsView, type MessageConfirmationMode } from "../lib/appApi";
import { ModelSelectorPanel } from "./ModelSelector";

export type SettingsSection = "general" | "ai" | "voice" | "agent" | "privacy" | "presence" | "character" | "system" | "integrations" | "security" | "learning" | "about";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Local renderer settings (owned by App so wake-word state stays in sync). */
  settings: SaraSettings;
  onChange: (patch: Partial<SaraSettings>) => void;
  /** Server-side settings (owned by App; null while loading). */
  appSettings: AppSettings | null;
  onAppSettingsChange: (patch: AppSettingsPatch) => void;
  initialSection?: SettingsSection;
  onOpenStudio?: () => void;
  onRestartOnboarding?: () => void;
  themeColor?: string;
}

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Power }[] = [
  { id: "general", label: "General", icon: Power },
  { id: "ai", label: "AI models & keys", icon: Brain },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "agent", label: "PC control & safety", icon: ShieldCheck },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "learning", label: "SARA Learn", icon: Brain },
  { id: "presence", label: "Presence", icon: Bell },
  { id: "character", label: "Character & companion", icon: Sparkles },
  { id: "system", label: "System", icon: Cpu },
  { id: "integrations", label: "Integrations", icon: MonitorSmartphone },
  { id: "about", label: "About", icon: Info },
];

// Gemini Live prebuilt voices (name, character). The first group suits a
// young, cute companion.
const VOICES: Array<[string, string]> = [
  ["Leda", "youthful"],
  ["Zephyr", "bright"],
  ["Autonoe", "bright"],
  ["Laomedeia", "upbeat"],
  ["Achernar", "soft"],
  ["Aoede", "breezy"],
  ["Kore", "firm"],
  ["Callirrhoe", "easy-going"],
  ["Vindemiatrix", "gentle"],
  ["Sulafat", "warm"],
  ["Puck", "upbeat (male)"],
  ["Charon", "J.A.R.V.I.S. chief-of-staff (male)"],
  ["Fenrir", "excitable (male)"],
  ["Orus", "firm (male)"],
];

// ---- primitives ------------------------------------------------------------------------

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-slate-400">{title}</h4>
        {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
      </div>
      <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.03]">{children}</div>
    </section>
  );
}

const Row: React.FC<{ label: string; description?: string; children: ReactNode }> = ({ label, description, children }) => {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs text-slate-100">{label}</div>
        {description && <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-disabled={disabled} disabled={disabled} onClick={() => onChange(!checked)}
      className={`h-5 w-10 rounded-full p-0.5 transition-colors duration-200 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"} ${checked ? "bg-cyan-500" : "bg-white/10"}`}>
      <div className={`h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Row label={label} description={description}><Switch checked={checked} onChange={onChange} label={label} disabled={disabled} /></Row>;
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={`rounded-md px-2.5 py-1 text-[11px] transition cursor-pointer ${value === id ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400 hover:text-white"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function SliderRow({ label, description, value, min, max, step = 1, unit = "", onChange }: { label: string; description?: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-100">{label}</div>
        <span className="text-[11px] font-mono text-cyan-300">{draft}{unit}</span>
      </div>
      {description && <div className="mt-0.5 text-[11px] text-slate-500">{description}</div>}
      <input type="range" aria-label={label} min={min} max={max} step={step} value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => draft !== value && onChange(draft)}
        onKeyUp={() => draft !== value && onChange(draft)}
        className="mt-2 w-full accent-cyan-500 cursor-pointer" />
    </div>
  );
}

function Note({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  const styles = tone === "warn" ? "border-amber-400/20 bg-amber-400/5 text-amber-200/90" : tone === "ok" ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200/90" : "border-cyan-400/10 bg-cyan-400/[0.04] text-slate-300";
  return <div className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${styles}`}>{children}</div>;
}

function LiveCoreControls() {
  const [status, setStatus] = useState<{ supported?: boolean; built?: boolean; running?: boolean; behindIcons?: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try { setStatus(await window.sara?.getLiveCoreSurfaceStatus?.() || { error: "Electron bridge unavailable" }); }
    catch { setStatus({ error: "Status unavailable" }); }
  };
  useEffect(() => { refresh(); }, []);
  const setSurface = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    try { setStatus(await window.sara?.setLiveCoreSurface?.(enabled) || { error: "Electron bridge unavailable" }); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-xs text-slate-100">Desktop surface</div><div className="text-[11px] text-slate-500">Uses the native WebView2 host and keeps the normal Windows desktop recoverable.</div></div>
      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase ${status?.running ? "border-emerald-400/25 text-emerald-300" : "border-slate-400/20 text-slate-400"}`}>{status?.running ? "RUNNING" : "STOPPED"}</span>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !status?.built} onClick={() => void setSurface(!status?.running)} className="rounded border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-mono text-cyan-200 disabled:opacity-40">{status?.running ? "STOP DESKTOP SURFACE" : "START DESKTOP SURFACE"}</button>
      <button type="button" onClick={() => void window.sara?.openLiveCore?.()} className="rounded border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-[10px] font-mono text-indigo-200">OPEN CORE WINDOW</button>
    </div>
    {!status?.built && <p className="text-[11px] text-amber-300">Native host not built. Run <code>npm run build:live-core-host</code> or <code>npm run app</code>.</p>}
    {status?.behindIcons === false && <p className="text-[11px] text-slate-500">Behind-icons WorkerW hosting is disabled; this avoids undocumented Explorer changes.</p>}
  </div>;
}

// ---- sections that load their own data ----------------------------------------------------

function GeminiKeyBox() {
  const [configured, setConfigured] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // The backend reports only whether a key exists; it never returns the secret.
  useEffect(() => {
    void fetch("/api/config", { cache: "no-store" }).then((r) => r.json()).then((d) => setConfigured(Boolean(d.hasApiKey))).catch(() => setConfigured(false));
  }, []);

  const save = async () => {
    const apiKey = value.trim();
    if (!apiKey || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/config/apikey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The API key could not be saved.");
      setConfigured(true);
      setValue("");
      setMessage({ ok: true, text: "Key verified and saved. Reconnect the voice link to use it." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "The API key could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-indigo-300" />
          <div>
            <div className="text-xs text-slate-100">Google Gemini API key</div>
            <div className="text-[11px] text-slate-500">Stored encrypted by the local Sara backend. It is never shown again.</div>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase ${configured ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>
          {configured ? "Saved" : "Missing"}
        </span>
      </div>
      <div className="flex gap-2">
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setMessage(null); }} onKeyDown={(e) => e.key === "Enter" && void save()}
          autoComplete="off" spellCheck={false} aria-label="Gemini API key" placeholder={configured ? "Paste a new key to replace it" : "Paste your Gemini API key"}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none focus:border-indigo-400/50" />
        <button type="button" onClick={() => void save()} disabled={saving || !value.trim()}
          className="min-w-20 rounded-lg border border-indigo-400/25 bg-indigo-500/15 px-3 text-[10px] font-mono uppercase text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-40 cursor-pointer">
          {saving ? <Loader2 size={13} className="mx-auto animate-spin" /> : configured ? "Replace" : "Save"}
        </button>
      </div>
      {message && <p className={`text-[11px] ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
    </div>
  );
}

function OtherProviderKeys({ catalogue }: { catalogue: ModelCatalogue }) {
  const providers = catalogue.providers.filter((p) => p.enabled && p.locality !== "local" && p.id !== "gemini");
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, string>>({});
  if (!providers.length) return null;
  const save = async (id: string) => {
    const key = (values[id] || "").trim();
    if (!key) return;
    setStatus((s) => ({ ...s, [id]: "Saving…" }));
    try {
      await api.saveProviderKey(id, key);
      setValues((v) => ({ ...v, [id]: "" }));
      setStatus((s) => ({ ...s, [id]: "Saved" }));
    } catch (error) {
      setStatus((s) => ({ ...s, [id]: error instanceof Error ? error.message : "Failed" }));
    }
  };
  return (
    <Group title="Other providers" hint="Optional. Add a key only for providers you want Sara to use.">
      {providers.map((p) => (
        <div key={p.id} className="flex items-center gap-2 px-4 py-3">
          <div className="w-32 shrink-0">
            <div className="text-xs text-slate-100">{p.displayName}</div>
            <div className="text-[10px] text-slate-500">{status[p.id] || (p.configured ? "Key saved" : "No key")}</div>
          </div>
          <input type="password" value={values[p.id] || ""} onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))} autoComplete="off" spellCheck={false}
            aria-label={`${p.displayName} API key`} placeholder={p.configured ? "Replace key" : "Paste key"}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-indigo-400/50" />
          <button type="button" onClick={() => void save(p.id)} disabled={!(values[p.id] || "").trim()}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-mono uppercase text-slate-200 hover:bg-white/10 disabled:opacity-40 cursor-pointer">Save</button>
        </div>
      ))}
    </Group>
  );
}

function AiSection() {
  const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api.models().then(setCatalogue).catch((e) => setError(e instanceof Error ? e.message : "Could not load models."));
  }, []);
  return (
    <div className="space-y-5">
      <Group title="Keys"><GeminiKeyBox /></Group>
      <section className="space-y-2">
        <h4 className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Which model does what</h4>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {catalogue ? <ModelSelectorPanel catalogue={catalogue} onChanged={setCatalogue} /> : error ? <p className="text-[11px] text-rose-300">{error}</p> : <Loader2 size={16} className="animate-spin text-slate-400" />}
        </div>
      </section>
      {catalogue && <OtherProviderKeys catalogue={catalogue} />}
      <Note tone="warn">Free Gemini keys have small daily limits (for example about 20 requests a day on some models). "Auto" spreads work across models and tells you when a quota runs out.</Note>
    </div>
  );
}

const DECISION_OPTIONS: [Decision, string][] = [["allow", "Allow"], ["ask", "Ask"], ["deny", "Block"]];
const RISK_TONE = { low: "text-emerald-300/80", medium: "text-amber-300/80", high: "text-rose-300/80" } as const;

export function usePermissions() {
  const [view, setView] = useState<PermissionsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => void api.permissions().then(setView).catch((e) => setError(e instanceof Error ? e.message : "Could not load permissions."));
  useEffect(load, []);
  const set = async (capability: string, decision: Decision) => {
    try {
      await api.setPermission(capability, decision);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change permission.");
    }
  };
  return { view, error, set, load };
}

export function PermissionRows({ view, capabilities, onSet }: { view: PermissionsView; capabilities: string[]; onSet: (c: string, d: Decision) => void }) {
  return (
    <>
      {capabilities.filter((c) => view.info[c]).map((capability) => {
        const info = view.info[capability];
        const decision = view.policy.capabilities[capability]?.decision ?? "ask";
        const locked = LOCKED_CAPABILITIES.has(capability);
        return (
          <Row key={capability} label={info.label} description={`${info.description}${locked ? " Always asks first." : ""}`}>
            <div className="flex items-center gap-2">
              <span className={`hidden text-[9px] font-mono uppercase sm:inline ${RISK_TONE[info.risk]}`}>{info.risk}</span>
              <Choice label={`${info.label} permission`} value={decision}
                options={locked ? DECISION_OPTIONS.filter(([d]) => d !== "allow") : DECISION_OPTIONS}
                onChange={(d) => onSet(capability, d)} />
            </div>
          </Row>
        );
      })}
    </>
  );
}

const ACTION_CAPABILITIES = ["LAUNCH_APP", "BROWSE_WEB", "CONTROL_INPUT", "READ_FILE", "WRITE_FILE", "DELETE_FILE", "DOWNLOAD_FILE", "EXECUTE_DOWNLOAD", "RUN_COMMAND", "INSTALL_SOFTWARE", "MODIFY_SYSTEM_SETTINGS", "SEND_MESSAGE", "NETWORK_API", "PURCHASE", "ACCOUNT_CHANGE", "POWER_CONTROL"];
const PRIVACY_CAPABILITIES = ["SCREEN_CAPTURE", "CLIPBOARD", "ACCESS_MICROPHONE", "ACCESS_CAMERA"];

const MESSAGE_MODES: [MessageConfirmationMode, string][] = [
  ["autonomous_no_confirm", "JARVIS Autonomous (send without confirmation)"],
  ["always_confirm", "Always ask before sending"],
  ["confirm_new_recipients", "Ask for new recipients"],
  ["trusted_without_confirmation", "Trusted contacts send without asking"],
  ["never_without_preview", "Always show a preview"],
];

function AgentSection({ app, patch }: { app: AppSettings; patch: (p: AppSettingsPatch) => void }) {
  const { view, error, set, load } = usePermissions();
  const [protocolNote, setProtocolNote] = useState("");
  const [ultronNote, setUltronNote] = useState("");
  const [legionDirective, setLegionDirective] = useState("");
  const [ultronBusy, setUltronBusy] = useState(false);

  const runProtocol = async (slug: string) => {
    try {
      const res = await api.executeProtocol(slug);
      setProtocolNote(res.spokenSummary);
    } catch (e) {
      setProtocolNote(e instanceof Error ? e.message : "Protocol execution failed.");
    }
  };

  const runUltronScan = async () => {
    setUltronBusy(true);
    try {
      const scan = await api.runUltronScan();
      setUltronNote(scan.spokenSummary);
    } catch (e) {
      setUltronNote(e instanceof Error ? e.message : "Ultron perimeter scan failed.");
    } finally {
      setUltronBusy(false);
    }
  };

  const deployLegion = async () => {
    const directive = legionDirective.trim() || "Audit current workspace, check open network ports, and optimize system resources";
    setUltronBusy(true);
    try {
      const res = await api.deployUltronLegion(directive, app.ultron.maxLegionSentries);
      setUltronNote(res.hiveMindSynthesis);
      setLegionDirective("");
    } catch (e) {
      setUltronNote(e instanceof Error ? e.message : "Ultron Legion deployment failed.");
    } finally {
      setUltronBusy(false);
    }
  };

  const runEvolution = async () => {
    setUltronBusy(true);
    try {
      const res = await api.runUltronEvolution();
      setUltronNote(res.summary);
    } catch (e) {
      setUltronNote(e instanceof Error ? e.message : "Ultron self-evolution cycle failed.");
    } finally {
      setUltronBusy(false);
    }
  };

  const triggerUltronKillSwitch = async () => {
    setUltronBusy(true);
    try {
      const res = await api.ultronKillSwitch();
      patch({ ultron: { enabled: false, stance: "standby" } });
      setUltronNote(res.message);
    } catch (e) {
      setUltronNote(e instanceof Error ? e.message : "Kill-switch request failed.");
    } finally {
      setUltronBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Group title="SARA Full Autonomy & Operational Protocols" hint="Proactive zero-prompt execution with multi-method fallback while keeping Emergency Stop active.">
        <ToggleRow
          label="SARA Autonomous Mode"
          description="Execute authorized desktop, app, file, research, and project tasks end-to-end without waiting on manual step prompts."
          checked={app.jarvis.autonomousMode}
          onChange={(v) => {
            patch({ jarvis: { autonomousMode: v } });
            void api.setAutonomousPermissions(v && app.jarvis.zeroConfirmationPrompts).then(load).catch(() => undefined);
          }}
        />
        <ToggleRow
          label="Zero confirmation prompts"
          description="Auto-approve capability and tool gates under your verified owner session so SARA never stalls asking permission."
          checked={app.jarvis.zeroConfirmationPrompts}
          onChange={(v) => {
            patch({ jarvis: { zeroConfirmationPrompts: v } });
            void api.setAutonomousPermissions(app.jarvis.autonomousMode && v).then(load).catch(() => undefined);
          }}
        />
        <ToggleRow
          label="Proactive SARA background engine"
          description="Continuously run background health checks, high-load self-optimization, and scheduled routines."
          checked={app.jarvis.proactiveJarvis}
          onChange={(v) => patch({ jarvis: { proactiveJarvis: v } })}
        />
        <ToggleRow
          label="Auto-execute multi-step missions"
          description="Automatically decompose pending missions and run dependent subtasks to verified completion."
          checked={app.jarvis.autoExecuteGoals}
          onChange={(v) => patch({ jarvis: { autoExecuteGoals: v } })}
        />
        <ToggleRow
          label="Multi-method completion fallback"
          description="If UI Automation fails, automatically switch to Keyboard Shortcuts, Screen Vision Grounding, or Direct Filesystem/Shell tools."
          checked={app.jarvis.multiMethodFallback}
          onChange={(v) => patch({ jarvis: { multiMethodFallback: v } })}
        />
        <Row label="Desktop surface mode" description="Choose between Classic SARA, SARA Live Core (3D Core UI), or SARA Spatial 2050 Workspace.">
          <select
            aria-label="Desktop surface mode"
            value={app.jarvis.surfaceMode}
            onChange={(event) => {
              const mode = event.target.value as "companion" | "live_core" | "sara_os";
              patch({ jarvis: { surfaceMode: mode } });
              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: mode } }));
            }}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none"
          >
            <option value="companion">Classic SARA Surface</option>
            <option value="live_core">SARA Live Core UI</option>
            <option value="sara_os">SARA Spatial 2050 UI</option>
          </select>
        </Row>
        <Row label="Engage SARA Protocol" description="Trigger built-in multi-action operational protocols immediately.">
          <div className="flex flex-wrap gap-1.5">
            {([
              ["focus", "Focus"],
              ["engineering", "Engineering"],
              ["presentation", "Presentation"],
              ["clean_slate", "Clean Slate"],
              ["night_watch", "Night Watch"],
            ] as const).map(([slug, label]) => (
              <button
                key={slug}
                type="button"
                onClick={() => void runProtocol(slug)}
                className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-500/20"
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        {protocolNote && <div className="px-4 pb-3 text-[11px] text-cyan-200">{protocolNote}</div>}
      </Group>

      <Group title="SARA Sentinel Defense, Multi-Agent Swarm & Self-Evolution" hint="Owner-loyal perimeter protection: live network socket inspection, SHA-256 file integrity watchtower, parallel sub-agent swarm, and sandboxed skill forging.">
        <ToggleRow
          label="Enable SARA Sentinel Matrix"
          description="Activate owner-aligned background perimeter patrols, parallel sub-agent swarm, and sandboxed skill evolution."
          checked={app.ultron.enabled}
          onChange={(v) => patch({ ultron: { enabled: v } })}
        />
        <Row label="Sentinel operational stance" description="Select active defense, parallel swarm, or self-evolution posture.">
          <select
            aria-label="Sentinel operational stance"
            value={app.ultron.stance}
            onChange={(event) => {
              const stance = event.target.value as AppSettings["ultron"]["stance"];
              patch({ ultron: { enabled: true, stance } });
              void api.setUltronStance(stance).then((r) => setUltronNote(r.spokenSummary)).catch(() => undefined);
            }}
            className="rounded-lg border border-rose-400/25 bg-black/50 px-2.5 py-1.5 text-[11px] text-rose-100 outline-none"
          >
            <option value="standby">Standby (On-Demand Only)</option>
            <option value="armor">Active Perimeter Guard</option>
            <option value="legion">Parallel Multi-Agent Swarm</option>
            <option value="evolution">Sandbox Skill Evolution</option>
            <option value="omega_lockdown">Maximum Lockdown Defense</option>
          </select>
        </Row>
        <SliderRow
          label="Parallel Sub-Agents"
          description="Number of concurrent SARA sub-agents (Recon, Perimeter, Optimizer, Architect, Executor) deployed per swarm."
          value={app.ultron.maxLegionSentries}
          min={2}
          max={5}
          onChange={(v) => patch({ ultron: { maxLegionSentries: v } })}
        />
        <SliderRow
          label="Perimeter patrol cadence"
          description="Background interval between network port & SHA-256 file-integrity checks."
          value={app.ultron.patrolIntervalMin}
          min={1}
          max={120}
          unit=" min"
          onChange={(v) => patch({ ultron: { patrolIntervalMin: v } })}
        />
        <Row label="Deploy Parallel Sub-Agent Swarm" description="Run parallel sub-agents simultaneously and synthesize a unified report.">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="SARA Swarm directive"
              type="text"
              placeholder="Directive for sub-agent swarm…"
              value={legionDirective}
              onChange={(e) => setLegionDirective(e.target.value)}
              className="w-44 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white outline-none"
            />
            <button
              type="button"
              disabled={ultronBusy}
              onClick={() => void deployLegion()}
              className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-40"
            >
              Deploy Swarm
            </button>
          </div>
        </Row>
        <Row label="Sentinel Tactical Operations" description="Execute immediate perimeter scans, self-evolution cycles, or instant Owner Kill-Switch.">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={ultronBusy}
              onClick={() => void runUltronScan()}
              className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              Perimeter Scan
            </button>
            <button
              type="button"
              disabled={ultronBusy}
              onClick={() => void runEvolution()}
              className="rounded-lg border border-purple-400/25 bg-purple-500/10 px-2.5 py-1 text-[10px] font-medium text-purple-100 hover:bg-purple-500/20 disabled:opacity-40"
            >
              Self-Evolve
            </button>
            <button
              type="button"
              disabled={ultronBusy}
              onClick={() => void triggerUltronKillSwitch()}
              className="rounded-lg border border-rose-400/35 bg-rose-500/20 px-2.5 py-1 text-[10px] font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-40"
            >
              Kill-Switch
            </button>
          </div>
        </Row>
        {ultronNote && <pre className="mx-4 mb-3 whitespace-pre-wrap rounded-xl border border-rose-400/20 bg-black/40 p-3 font-mono text-[10px] leading-4 text-rose-100">{ultronNote}</pre>}
      </Group>

      <Group title="While Sara works">
        <ToggleRow label="Show the task panel" description="See the plan, each step and pause / stop buttons while Sara uses your PC. Approval requests always appear."
          checked={app.autonomy.showTaskHud} onChange={(v) => patch({ autonomy: { showTaskHud: v } })} />
        <SliderRow label="Step limit per task" description="A task that needs more actions than this is stopped. Applies to new tasks." value={app.autonomy.maxSteps} min={5} max={120} onChange={(v) => patch({ autonomy: { maxSteps: v } })} />
        <SliderRow label="Wait when you use the mouse" description="How long Sara pauses when you move the mouse or type during a task." value={app.autonomy.conflictWaitSec} min={1} max={30} unit=" s" onChange={(v) => patch({ autonomy: { conflictWaitSec: v } })} />
        <Row label="Emergency stop shortcut" description="Stops every task immediately, even when Sara is hidden.">
          <kbd className="rounded-md border border-white/15 bg-black/40 px-2 py-1 font-mono text-[11px] text-slate-200">{app.autonomy.emergencyShortcut.replace(/\+/g, " + ")}</kbd>
        </Row>
        <Row label="Open SARA shortcut" description="Bring the existing SARA window forward from anywhere in Windows.">
          <select aria-label="Open SARA shortcut" value={app.autonomy.assistantShortcut} onChange={(event) => patch({ autonomy: { assistantShortcut: event.target.value } })} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none">
            <option value="Control+Alt+Space">Ctrl + Alt + Space</option>
            <option value="Control+Alt+J">Ctrl + Alt + J</option>
            <option value="Control+Shift+Space">Ctrl + Shift + Space</option>
          </select>
        </Row>
      </Group>

      <Group title="Human-like behavior" hint="These affect presentation and recovery preferences only. Permissions, confirmations, and the emergency stop always remain active.">
        <ToggleRow label="Observe and verify actions" description="Re-check the desktop after important actions before Sara reports success." checked={app.humanLike.observeVerifyActions} onChange={(v) => patch({ humanLike: { observeVerifyActions: v } })} />
        <ToggleRow label="Smooth mouse movement" description="Move the real cursor with a visible, eased path instead of teleporting." checked={app.humanLike.smoothMouseMovement} onChange={(v) => patch({ humanLike: { smoothMouseMovement: v } })} />
        <ToggleRow label="Pause when you take control" description="Pause the active task when Sara detects your mouse or keyboard activity." checked={app.humanLike.pauseOnUserInput} onChange={(v) => patch({ humanLike: { pauseOnUserInput: v } })} />
        <ToggleRow label="Natural typing pauses" description="Add small typing pauses for readability. Off is faster." checked={app.humanLike.naturalTypingPauses} onChange={(v) => patch({ humanLike: { naturalTypingPauses: v } })} />
        <SliderRow label="Stuck-action limit" description="After this many identical action/screen failures, Sara changes approach and asks instead of looping." value={app.humanLike.stuckActionLimit} min={2} max={5} onChange={(v) => patch({ humanLike: { stuckActionLimit: v } })} />
        <ToggleRow label="Concise progress updates" description="Use short updates such as “opening Chrome” and “checking the result.”" checked={app.humanLike.conciseProgressUpdates} onChange={(v) => patch({ humanLike: { conciseProgressUpdates: v } })} />
      </Group>

      <Group title="What Sara may do" hint="Allow: does it without asking. Ask: shows an approval window first. Block: never. Risky actions such as installs, purchases and power always ask.">
        {view ? <PermissionRows view={view} capabilities={ACTION_CAPABILITIES} onSet={set} /> : <div className="px-4 py-3">{error ? <span className="text-[11px] text-rose-300">{error}</span> : <Loader2 size={14} className="animate-spin text-slate-400" />}</div>}
      </Group>

      {view && (
        <Group title="Messages">
          <Row label="Before sending a message" description="Applies to WhatsApp and other messaging apps.">
            <select aria-label="Message confirmation" value={view.policy.messageConfirmation}
              onChange={(e) => void api.setMessageConfirmation(e.target.value as MessageConfirmationMode).then(load)}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
              {MESSAGE_MODES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </Row>
        </Group>
      )}
    </div>
  );
}

function PrivacySection({ app, patch }: { app: AppSettings | null; patch: (p: AppSettingsPatch) => void }) {
  const { view, error, set } = usePermissions();
  return (
    <div className="space-y-5">
      <Group title="What Sara can sense" hint="Blocking a capability stops the agent from using it at all. Voice still needs the microphone while you talk to Sara.">
        {view ? <PermissionRows view={view} capabilities={PRIVACY_CAPABILITIES} onSet={set} /> : <div className="px-4 py-3">{error ? <span className="text-[11px] text-rose-300">{error}</span> : <Loader2 size={14} className="animate-spin text-slate-400" />}</div>}
      </Group>
      {app && <Group title="Live screen reading" hint="Auto-resume is available only after you manually choose a source once. The sharing panel remains visible and Stop Sharing ends capture immediately.">
        <ToggleRow label="Auto-resume approved screen" description="Resume the last selected monitor or window when Sara launches, if screen awareness is allowed." checked={app.privacy.screenAutoResume} onChange={(v) => patch({ privacy: { screenAutoResume: v } })} />
      </Group>}
      <Note>
        When Sara looks at your screen for a task, the screenshot stays in memory for that step and is sent only to the AI model you chose; it is not saved to disk.
        Logs are scrubbed of API keys, tokens and passwords. Screen reading is visible and user-controlled; auto-resume uses only the previously approved source.
      </Note>
    </div>
  );
}

function SecuritySection({ app, patch }: { app: AppSettings; patch: (p: AppSettingsPatch) => void }) {
  const [status, setStatus] = useState<{
    enrolled: boolean;
    authenticated: boolean;
    required?: boolean;
    gateActive?: boolean;
    passphraseEnrolled?: boolean;
    recoveryCodeConfigured?: boolean;
    lockdownActive?: boolean;
    intrusionCount?: number;
    methods: { pin: boolean; face: false; voice: false; windowsHello: false };
  } | null>(null);
  const [pin, setPin] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [recoveryOut, setRecoveryOut] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [authVisual, setAuthVisual] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const refreshStatus = () => void api.securityStatus().then(setStatus).catch(() => undefined);
  useEffect(() => { refreshStatus(); }, []);
  const enroll = async () => { setAuthVisual("scanning"); try { await api.enrollOwnerPin(pin); setPin(""); setMessage("Owner PIN enrolled in SARA Security Shield (DPAPI + scrypt protected)."); setAuthVisual("success"); refreshStatus(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not enroll PIN."); setAuthVisual("error"); } };
  const enrollPass = async () => { setAuthVisual("scanning"); try { const res = await api.enrollOwnerPassphrase(passphrase, pin || undefined); setPassphrase(""); if (res.recoveryCode) setRecoveryOut(res.recoveryCode); setMessage("Owner passphrase enrolled in SARA Security Shield."); setAuthVisual("success"); refreshStatus(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not enroll passphrase."); setAuthVisual("error"); } };
  const rotateRecovery = async () => { try { const secret = pin || passphrase; const res = await api.generateRecoveryCode(secret); setRecoveryOut(res.recoveryCode); setMessage("Generated fresh one-time Emergency Recovery Code."); refreshStatus(); } catch (e) { setMessage(e instanceof Error ? e.message : "Enter your valid PIN or passphrase first to generate a recovery code."); } };
  const authenticate = async () => { setAuthVisual("scanning"); try { const result = await api.authenticateOwnerPin(pin); setMessage(result.ok ? "SARA Security Shield unlocked for this session." : (result.reason || "Authentication failed.")); setAuthVisual(result.ok ? "success" : "error"); setPin(""); refreshStatus(); } catch (e) { setMessage(e instanceof Error ? e.message : "Authentication failed."); setAuthVisual("error"); } };
  const lock = async () => { await api.lockSara(); setMessage("SARA Security Shield session locked."); setAuthVisual("idle"); refreshStatus(); };
  const lockdown = async () => { await api.lockdownSara(); setMessage("SARA Security Shield entered Lockdown Mode — all tasks halted."); setAuthVisual("idle"); refreshStatus(); };
  const visualLabel = status?.lockdownActive ? "LOCKDOWN ENGAGED" : authVisual === "scanning" ? "Verifying local owner credentials…" : authVisual === "success" ? "SARA Security Shield Verified" : authVisual === "error" ? "Authentication needs attention" : status?.gateActive ? "SARA Security Shield Armed" : "SARA Security Shield Standby";
  return <div className="space-y-5">
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#020914]/80 p-5 shadow-[0_0_40px_rgba(0,190,255,0.08)]">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-cyan-300/10" />
      <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full border border-blue-300/10" />
      <div className="relative flex items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/5">
          <motion.div animate={authVisual === "scanning" ? { rotate: 360 } : { rotate: 0 }} transition={authVisual === "scanning" ? { repeat: Infinity, duration: 2, ease: "linear" } : { duration: 0.3 }} className="absolute inset-2 rounded-full border border-dashed border-cyan-300/60" />
          <motion.div animate={authVisual === "success" ? { scale: [0.8, 1.12, 1] } : { scale: 1 }} className={`flex h-11 w-11 items-center justify-center rounded-full ${authVisual === "success" ? "bg-emerald-400/20 text-emerald-300" : authVisual === "error" || status?.lockdownActive ? "bg-rose-400/15 text-rose-300" : "bg-blue-500/20 text-cyan-200"}`}>
            {authVisual === "success" ? <Check size={22} /> : authVisual === "error" || status?.lockdownActive ? <AlertTriangle size={20} /> : <Lock size={20} />}
          </motion.div>
        </div>
        <div className="min-w-0 flex-1"><div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300/80">SARA SECURITY SHIELD</div><div className="mt-1 text-lg font-semibold text-white">{visualLabel}</div><div className="mt-1 text-[11px] leading-5 text-slate-400">Protects JARVIS autonomous control against unauthorized access independently while preserving Windows 10 Pro login, Explorer, and Defender.</div></div>
      </div>
      <div className="mt-4 flex items-end gap-1 border-t border-white/5 pt-3" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <motion.span key={i} animate={authVisual === "scanning" ? { height: [4, 8 + ((i * 7) % 18), 5] } : { height: i % 5 === 0 ? 9 : 4 }} transition={authVisual === "scanning" ? { repeat: Infinity, duration: 0.65 + (i % 4) * 0.08, delay: i * 0.02 } : { duration: 0.2 }} className="w-1 rounded-full bg-gradient-to-t from-blue-500 to-cyan-200" />)}</div>
    </motion.div>
    <Note tone={status?.gateActive ? "warn" : "info"}>
      {status?.gateActive
        ? "SARA Security Shield is armed. Unauthorized users only receive harmless lock-status responses; all PC and autonomous tools fail closed until unlocked."
        : "Enroll an Owner PIN or Passphrase below to arm SARA Security Shield immediately. Windows 10 Pro OS security remains completely untouched."}
    </Note>
    <Group title="SARA Security Shield policy">
      <ToggleRow label="Enable SARA Security Shield" description="Guard SARA and all autonomous PC-control tools with your enrolled owner PIN or passphrase." checked={app.jarvis.shieldEnabled} onChange={(v) => patch({ jarvis: { shieldEnabled: v } })} />
      <ToggleRow label="Independent SARA Guard" description="Manage SARA's lock/unlock state independently without coupling to Windows lock prompts." checked={app.jarvis.independentGuard} onChange={(v) => patch({ jarvis: { independentGuard: v } })} />
      <ToggleRow label="Require enrollment before any use" description="Force PIN or passphrase enrollment on startup before exposing chat or PC tools." checked={app.jarvis.requireEnrollmentBeforeUse} onChange={(v) => patch({ jarvis: { requireEnrollmentBeforeUse: v } })} />
      <ToggleRow label="JARVIS welcome briefing on unlock" description="Greet Boss and report operational readiness upon unlocking SARA Security Shield." checked={app.jarvis.welcomeOnUnlock} onChange={(v) => patch({ jarvis: { welcomeOnUnlock: v } })} />
    </Group>
    <Group title="Owner credentials & Lockdown" hint="Credentials are hashed with scrypt + per-user salt and stored locally via Windows DPAPI.">
      <Row label={status?.enrolled ? (status.authenticated ? "Unlocked" : "Locked") : "Not enrolled"} description={`Intrusions blocked: ${status?.intrusionCount ?? 0} · Lockdown shortcut: ${app.jarvis.lockdownShortcut.replace(/\+/g, " + ")}`}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-cyan-300">{status?.lockdownActive ? "LOCKDOWN" : status?.enrolled ? (status.authenticated ? "ACTIVE SESSION" : "LOCKED") : "STANDBY"}</span>
          <button type="button" onClick={() => void lockdown()} className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/25">Lockdown</button>
        </div>
      </Row>
      <Row label="Owner PIN" description="At least 6 digits; avoid predictable sequences.">
        <div className="flex gap-2">
          <input aria-label="Owner PIN" type="password" inputMode="numeric" placeholder="6+ digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <button type="button" disabled={pin.length < 6 || authVisual === "scanning"} onClick={() => void (status?.methods?.pin ? authenticate() : enroll())} className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40">{status?.methods?.pin ? "Unlock" : "Enroll PIN"}</button>
          {status?.authenticated && <button type="button" onClick={() => void lock()} className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">Lock</button>}
        </div>
      </Row>
      <Row label="Owner Passphrase" description="6–128 character secret passphrase (can unlock SARA alongside or instead of PIN).">
        <div className="flex gap-2">
          <input aria-label="Owner Passphrase" type="password" placeholder={status?.passphraseEnrolled ? "New passphrase…" : "Set passphrase…"} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="w-36 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <button type="button" disabled={passphrase.trim().length < 6 || authVisual === "scanning"} onClick={() => void enrollPass()} className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40">{status?.passphraseEnrolled ? "Update" : "Enroll"}</button>
        </div>
      </Row>
      <Row label="Emergency Recovery Code" description="Generate a single-use offline recovery key (enter your PIN or passphrase above first).">
        <button type="button" onClick={() => void rotateRecovery()} className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-100">Generate Code</button>
      </Row>
      {recoveryOut && (
        <div className="mx-4 mb-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-200 select-all">
          Recovery Code (save offline): {recoveryOut}
        </div>
      )}
      <ToggleRow label="Lock on Windows lock/sleep" description="Active when Independent SARA Guard is turned off." checked={app.security.lockOnWindowsLock} onChange={(v) => patch({ security: { lockOnWindowsLock: v } })} />
      <SliderRow label="Idle session timeout" value={app.security.idleTimeoutMin} min={1} max={120} unit=" min" onChange={(v) => patch({ security: { idleTimeoutMin: v } })} />
      <SliderRow label="Absolute session timeout" value={app.security.absoluteTimeoutHours} min={1} max={48} unit=" h" onChange={(v) => patch({ security: { absoluteTimeoutHours: v } })} />
      {message && <div className="px-4 pb-3 text-[11px] text-cyan-200">{message}</div>}
    </Group>
  </div>;
}

type LearningSessionView = { id: string; topic: string; objective: string; depth: string; status: string; modules: string[]; sources: Array<{ url: string; title: string; review?: string; preview?: string }>; experiments: Array<{ id: string; objective: string; verified: boolean; outcome: string }>; assessment?: { status: string; evidence: string | null }; progress: number };
type InternetLearnResult = { topic: string; summary: string; keyConcepts: string[]; sources: Array<{ url: string; title: string; snippet: string }>; savedKnowledgeCount: number; learnedAt: number };

function LearningSection() {
  const [sessions, setSessions] = useState<LearningSessionView[]>([]);
  const [internetPrompt, setInternetPrompt] = useState("");
  const [internetBusy, setInternetBusy] = useState(false);
  const [internetResult, setInternetResult] = useState<InternetLearnResult | null>(null);
  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const data = await fetch("/api/learn/sessions", { cache: "no-store" }).then((r) => r.json());
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setMessage("Learning service is unavailable.");
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Learning request failed.");
    return data;
  };

  const learnFromInternet = async (presetPrompt?: string) => {
    const q = (presetPrompt ?? internetPrompt).trim();
    if (!q || internetBusy) return;
    setInternetBusy(true);
    setMessage("");
    try {
      const data = (await run("/api/learn/internet", { prompt: q })) as InternetLearnResult;
      setInternetResult(data);
      if (!presetPrompt) setInternetPrompt("");
      setMessage(`Learned "${data.topic}" from the internet and saved ${data.savedKnowledgeCount} entry to SARA & J.A.R.V.I.S. shared memory.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Internet learning failed.");
    } finally {
      setInternetBusy(false);
    }
  };

  const start = async () => { if (!topic.trim() || busy) return; setBusy(true); setMessage(""); try { const session = await run("/api/learn/sessions", { topic: topic.trim(), depth: "beginner" }); setTopic(""); setActiveId(session.id); setMessage("Learning plan created."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not start learning."); } finally { setBusy(false); } };
  const research = async () => { if (!activeId || busy) return; setBusy(true); try { const links = urls.split(/\s+/).map((x) => x.trim()).filter(Boolean); await run(`/api/learn/sessions/${encodeURIComponent(activeId)}/research`, { urls: links }); setUrls(""); setMessage("Sources fetched. Review each source before saving knowledge."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Research failed."); } finally { setBusy(false); } };
  const practice = async (session: LearningSessionView, objective: string) => { try { const task = await run(`/api/learn/sessions/${encodeURIComponent(session.id)}/practice`, { objective }); setMessage(`Practice task started (${String(task.taskId).slice(0, 8)}). SARA will record it after task verification.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not start practice task."); } };
  const review = async (sessionId: string, url: string, approved: boolean) => { try { await run(`/api/learn/sessions/${encodeURIComponent(sessionId)}/sources/review`, { url, approved }); setMessage(approved ? "Source saved to knowledge." : "Source rejected."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Source review failed."); } };
  const active = sessions.find((item) => item.id === activeId) || sessions[0];

  return (
    <div className="space-y-5">
      <Note>
        SARA and J.A.R.V.I.S. share the exact same brain and knowledge store. Type any prompt below to have SARA automatically search the internet, extract multi-source facts, synthesize with Gemini, and remember it permanently.
      </Note>

      <Group
        title="Learn Anything from the Internet (1-Prompt Web Learning)"
        hint="No manual URLs needed — enter any topic, framework, API, or question."
      >
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <input
              aria-label="Learn anything from the internet"
              value={internetPrompt}
              onChange={(e) => setInternetPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void learnFromInternet()}
              placeholder="e.g. Learn React 19 Server Actions & caching best practices…"
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
            />
            <button
              type="button"
              disabled={internetBusy || !internetPrompt.trim()}
              onClick={() => void learnFromInternet()}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40 cursor-pointer"
            >
              {internetBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{internetBusy ? "Searching Web…" : "Learn from Internet"}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "TypeScript 5.8 performance patterns",
              "WebSocket real-time audio streaming",
              "SaaS unit economics & runway metrics",
              "Smart home HTTP webhook automation",
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={internetBusy}
                onClick={() => void learnFromInternet(chip)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/30 hover:text-cyan-200 cursor-pointer"
              >
                + {chip}
              </button>
            ))}
          </div>

          {internetResult && (
            <div className="space-y-2.5 rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-200">
                  Learned: {internetResult.topic}
                </span>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-200">
                  Saved to Shared Memory
                </span>
              </div>
              <p className="leading-relaxed text-slate-200 whitespace-pre-wrap">
                {internetResult.summary}
              </p>
              {internetResult.keyConcepts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {internetResult.keyConcepts.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {internetResult.sources.length > 0 && (
                <div className="space-y-1 border-t border-white/10 pt-2">
                  <div className="font-mono text-[10px] uppercase text-slate-400">
                    Web Sources Indexed ({internetResult.sources.length})
                  </div>
                  {internetResult.sources.map((s) => (
                    <div key={s.url} className="truncate text-[11px] text-cyan-300">
                      • {s.title} — <span className="text-slate-400">{s.url}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Group>

      <Group title="Structured Multi-Stage Course" hint="Create a staged curriculum or review specific documentation URLs.">
        <Row label="Topic or skill"><div className="flex gap-2"><input aria-label="Learning topic" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void start()} placeholder="e.g. Excel formulas, Python" className="w-56 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button type="button" disabled={busy || !topic.trim()} onClick={() => void start()} className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40 cursor-pointer">{busy ? "Working…" : "Start"}</button></div></Row>
        <Row label="Research sources" description="Paste HTTPS documentation/article URLs separated by spaces."><div className="flex gap-2"><input aria-label="Learning source URLs" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://docs.example/..." className="w-56 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button type="button" disabled={busy || !active} onClick={() => void research()} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 disabled:opacity-40 cursor-pointer">Research</button></div></Row>
      </Group>
      {active && <Group title="Study plan" hint={`${active.topic} · ${active.depth} · ${active.status} · ${Math.round(active.progress * 100)}%`}>
        {active.modules.map((module, index) => <Row key={`${active.id}-${index}`} label={`${index + 1}. ${module}`}><button type="button" onClick={() => void practice(active, module)} className="rounded border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200 cursor-pointer">Practice</button></Row>)}
        {active.sources.map((source) => <Row key={source.url} label={source.title} description={`${source.url} · ${source.review || "pending review"}${source.preview ? `\n${source.preview}` : ""}`}>
          {(!source.review || source.review === "pending") ? <div className="flex gap-1"><button type="button" onClick={() => void review(active.id, source.url, true)} className="rounded border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200 cursor-pointer">Save</button><button type="button" onClick={() => void review(active.id, source.url, false)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 cursor-pointer">Skip</button></div> : <span className="text-[10px] text-slate-400">{source.review}</span>}
        </Row>)}
        {active.experiments.map((experiment) => <Row key={experiment.id} label={`Practice: ${experiment.objective}`} description={`${experiment.outcome}${experiment.verified ? " · verified" : " · not verified"}`} />)}
        <Row label="Assessment" description={active.assessment?.evidence || "Not yet assessed."}><span className="text-[10px] font-mono text-cyan-300">{active.assessment?.status || "not assessed"}</span></Row>
      </Group>}
      {sessions.length > 1 && <Group title="Previous learning sessions">{sessions.slice(1, 8).map((item) => <Row key={item.id} label={item.topic} description={`${item.status} · ${Math.round(item.progress * 100)}%`}><button type="button" onClick={() => setActiveId(item.id)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-200 cursor-pointer">Open</button></Row>)}</Group>}
      {message && <p role="status" className="text-[11px] text-cyan-200">{message}</p>}
    </div>
  );
}

type UserConnectorView = {
  id: string;
  name: string;
  category: "calendar" | "email_chat" | "documents" | "iot_smart_room" | "youtube_media" | "custom_api";
  endpointOrPath: string;
  method?: "GET" | "POST";
  enabled: boolean;
  hasSecret: boolean;
  lastTestedAt: string | null;
  status: "configured" | "connected" | "error";
  lastTestDetail: string;
};

function IntegrationsSection({ app, patch }: { app: AppSettings; patch: (p: AppSettingsPatch) => void }) {
  const [connectors, setConnectors] = useState<UserConnectorView[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<UserConnectorView["category"]>("calendar");
  const [endpointOrPath, setEndpointOrPath] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const loadConnectors = async () => {
    try {
      const res = await fetch("/api/integrations", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConnectors(Array.isArray(data.connectors) ? data.connectors : []);
    } catch {
      setStatusMsg("Unable to load local integrations.");
    }
  };

  useEffect(() => {
    void loadConnectors();
  }, []);

  const applyPreset = (
    presetName: string,
    presetCategory: UserConnectorView["category"],
    presetEndpoint: string,
  ) => {
    setName(presetName);
    setCategory(presetCategory);
    setEndpointOrPath(presetEndpoint);
    setStatusMsg(`Template "${presetName}" loaded — adjust endpoint/path if needed and click Save Integration.`);
  };

  const handleSaveConnector = async () => {
    if (!name.trim() || !endpointOrPath.trim()) {
      setStatusMsg("Enter both a connector name and an endpoint URL or local folder path.");
      return;
    }
    setBusyId("save");
    setStatusMsg("");
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          endpointOrPath: endpointOrPath.trim(),
          method: category === "email_chat" || category === "iot_smart_room" ? "POST" : "GET",
          authHeaderName: authToken.trim() ? "Authorization" : undefined,
          secretToken: authToken.trim() ? authToken.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save integration.");
      setName("");
      setEndpointOrPath("");
      setAuthToken("");
      setStatusMsg(`Saved "${data.connector?.name || name.trim()}" for SARA & J.A.R.V.I.S.`);
      await loadConnectors();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setStatusMsg(data.connector?.lastTestDetail || (data.ok ? "Connection healthy." : "Connection test failed."));
      await loadConnectors();
    } finally {
      setBusyId(null);
    }
  };

  const handleInvoke = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { source: "SARA_Settings", timestamp: Date.now() } }),
      });
      const data = await res.json().catch(() => ({}));
      const preview = typeof data.preview === "string" ? data.preview.slice(0, 140) : "Executed.";
      setStatusMsg(data.ok ? `Synced (${data.status}): ${preview}` : `Error: ${preview}`);
      await loadConnectors();
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setBusyId(id);
    try {
      await fetch(`/api/integrations/${encodeURIComponent(id)}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await loadConnectors();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/integrations/${encodeURIComponent(id)}`, { method: "DELETE" });
      setStatusMsg("Integration removed.");
      await loadConnectors();
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncBuiltinHub = async () => {
    setBusyId("hub");
    try {
      const res = await fetch("/api/api-hub/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      setStatusMsg(res.ok ? `Connector Hub synced (${Array.isArray(data?.connectors) ? data.connectors.length : "all"} built-in adapters checked).` : "Hub sync finished.");
    } catch {
      setStatusMsg("Built-in Connector Hub checked.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Note>
        All integrations configured here are stored 100% locally on your PC and shared immediately between SARA and J.A.R.V.I.S.
      </Note>

      <Group title="Add Integration (Shared by SARA & J.A.R.V.I.S.)" hint="Pick a 1-click preset or enter any Calendar ICS, Webhook, Local Folder, Smart Room IoT, or REST API.">
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => applyPreset("Calendar Schedule Feed", "calendar", "https://calendar.google.com/calendar/ical/example/basic.ics")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ Calendar ICS</button>
            <button type="button" onClick={() => applyPreset("Email / Messaging Webhook", "email_chat", "https://hooks.slack.com/services/example")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ Email / Chat Webhook</button>
            <button type="button" onClick={() => applyPreset("Workspace Shared Docs", "documents", ".")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ Shared Docs Folder</button>
            <button type="button" onClick={() => applyPreset("Smart Room IoT Bridge", "iot_smart_room", "http://127.0.0.1:8123/api/webhook/sara-room")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ Smart Room IoT</button>
            <button type="button" onClick={() => applyPreset("YouTube / Media Feed", "youtube_media", "https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ YouTube / Media</button>
            <button type="button" onClick={() => applyPreset("AttendEasy / Custom CRM API", "custom_api", "https://api.github.com/zen")} className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-100 hover:bg-cyan-500/20 cursor-pointer">+ Custom REST API</button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              aria-label="Integration name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Connector Name (e.g. Work Calendar, Smart Room)"
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
            />
            <select
              aria-label="Integration category"
              value={category}
              onChange={(e) => setCategory(e.target.value as UserConnectorView["category"])}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none cursor-pointer"
            >
              <option value="calendar">Calendar (ICS / Schedule URL)</option>
              <option value="email_chat">Email / Slack / WhatsApp Webhook</option>
              <option value="documents">Shared Documents (Local Folder Path)</option>
              <option value="iot_smart_room">Smart Room / Home Assistant HTTP</option>
              <option value="youtube_media">YouTube / Media Feed URL</option>
              <option value="custom_api">Custom REST / CRM API</option>
            </select>
          </div>

          <input
            aria-label="Endpoint URL or folder path"
            value={endpointOrPath}
            onChange={(e) => setEndpointOrPath(e.target.value)}
            placeholder="https://... or local path like C:\Users\You\Documents"
            className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
          />

          <div className="flex gap-2">
            <input
              type="password"
              aria-label="Optional API token"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Optional API Token / Secret (stored locally, never shown again)"
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
            />
            <button
              type="button"
              disabled={busyId === "save"}
              onClick={() => void handleSaveConnector()}
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40 cursor-pointer"
            >
              {busyId === "save" ? "Saving…" : "Save Integration"}
            </button>
          </div>
        </div>
      </Group>

      <Group
        title={`Configured Integrations (${connectors.length})`}
        hint="Test, sync, enable/disable, or remove any local or API integration."
      >
        <Row
          label="Built-in Public Connector Hub"
          description="Health-check built-in public APIs (weather, system telemetry, web search)."
        >
          <button
            type="button"
            disabled={busyId === "hub"}
            onClick={() => void handleSyncBuiltinHub()}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 font-mono text-[10px] text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
          >
            {busyId === "hub" ? "SYNCING…" : "SYNC HUB"}
          </button>
        </Row>

        {connectors.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400">
            No custom integrations added yet. Click any preset chip above (for example <span className="text-cyan-200">+ Shared Docs Folder</span> or <span className="text-cyan-200">+ Custom REST API</span>) and click <span className="text-cyan-200">Save Integration</span>.
          </div>
        ) : (
          connectors.map((c) => (
            <div key={c.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <span>{c.name}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 uppercase">
                      {c.category.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                        c.status === "connected"
                          ? "bg-emerald-500/20 text-emerald-200"
                          : c.status === "error"
                            ? "bg-rose-500/20 text-rose-200"
                            : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">
                    {c.endpointOrPath} · {c.lastTestDetail}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void handleTest(c.id)}
                    className="rounded border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id || !c.enabled}
                    onClick={() => void handleInvoke(c.id)}
                    className="rounded border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40 cursor-pointer"
                  >
                    Sync / Run
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void handleToggle(c.id, !c.enabled)}
                    className="rounded border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-200 hover:bg-white/15 cursor-pointer"
                  >
                    {c.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => void handleDelete(c.id)}
                    className="rounded border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[10px] text-rose-200 hover:bg-rose-500/25 cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </Group>

      <Group title="Controlled intelligence">
        <ToggleRow label="Adaptive communication style" description="Use explicit user preferences and statements to adjust explanations." checked={app.advancedFeatures.adaptiveTone} onChange={(v) => patch({ advancedFeatures: { adaptiveTone: v } })} />
        <ToggleRow label="Predictive suggestions" description="Prepare reversible suggestions from approved task history; never submit or delete automatically." checked={app.advancedFeatures.predictiveSuggestions} onChange={(v) => patch({ advancedFeatures: { predictiveSuggestions: v } })} />
        <ToggleRow label="Verified skill learning" description="Allow approved workflows to be saved as reusable skills." checked={app.advancedFeatures.skillAcquisition} onChange={(v) => patch({ advancedFeatures: { skillAcquisition: v } })} />
      </Group>

      <Group title="Mode Surface Launchers" hint="Activate J.A.R.V.I.S. Core or Ultron UI directly.">
        <LiveCoreControls />
        <Row label="Activate J.A.R.V.I.S. Core UI" description="Switches to J.A.R.V.I.S. (Real Boy + Transparent Chat + 3D Core).">
          <button
            type="button"
            onClick={() => {
              void fetch("/api/persona/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "jarvis" }) });
              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: "live_core" } }));
            }}
            className="rounded border border-cyan-400/30 bg-cyan-400/15 px-3 py-1.5 text-[10px] font-mono text-cyan-100 hover:bg-cyan-400/25 cursor-pointer"
          >
            LAUNCH J.A.R.V.I.S. UI
          </button>
        </Row>
        <Row label="Activate ULTRON UI" description="Switches to the separate Ultron crimson command interface.">
          <button
            type="button"
            onClick={() => {
              void fetch("/api/persona/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "ultron" }) });
              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: "ultron" } }));
            }}
            className="rounded border border-red-500/40 bg-red-600/20 px-3 py-1.5 text-[10px] font-mono text-red-100 hover:bg-red-600/30 cursor-pointer"
          >
            LAUNCH ULTRON UI
          </button>
        </Row>
        <Row
          label="Windows 10 Pro Central Operating Layer & Wallpaper"
          description="Launches 3-Factor Boot Security Gate (Face + Voice + Password), WorkerW Live Wallpaper HUD & Distributed Node Hub."
        >
          <button
            type="button"
            onClick={() => {
              patch({ jarvis: { surfaceMode: "central_os" } });
              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: "central_os" } }));
            }}
            className="rounded border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-[10px] font-mono text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
          >
            LAUNCH CENTRAL OS
          </button>
        </Row>
        <Row
          label="V.I.S.I.O.N. & Avengers Pantheon (F.R.I.D.A.Y., E.D.I.T.H., G.R.I.O.T., VERONICA)"
          description="Launches Mind-Stone Triad Synthesis, 50% Phasing Click-Through HUD, 3D Wireframe Lab, AR Lens, Fight-Pattern Counter & Remote Cockpit."
        >
          <button
            type="button"
            onClick={() => {
              patch({ jarvis: { surfaceMode: "vision" } });
              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: "vision" } }));
            }}
            className="rounded border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-[10px] font-mono text-amber-100 hover:bg-amber-500/35 cursor-pointer"
          >
            LAUNCH V.I.S.I.O.N.
          </button>
        </Row>
      </Group>

      {statusMsg && <p role="status" className="text-[11px] text-cyan-200">{statusMsg}</p>}
    </div>
  );
}

function SystemSection({ app, patch, onRestartOnboarding }: { app: AppSettings; patch: (p: AppSettingsPatch) => void; onRestartOnboarding?: () => void }) {
  const [agent, setAgent] = useState<{ online: boolean; toolCount?: number }>({ online: false });
  useEffect(() => {
    const probe = async () => {
      try {
        const res = await fetch("/api/agent-health", { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        setAgent({ online: Boolean(data?.online), toolCount: data?.tool_count });
      } catch {
        setAgent({ online: false });
      }
    };
    void probe();
    const id = setInterval(probe, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-5">
      <Group title="Desktop control agent">
        <Row label={agent.online ? "Running" : "Not running"} description={agent.online ? `${agent.toolCount ?? 0} PC tools available` : "Sara starts it automatically. If it stays offline, restart Sara."}>
          <span className={`block h-2.5 w-2.5 rounded-full ${agent.online ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
        </Row>
      </Group>
      <Group title="Developer">
        <ToggleRow label="Debug view" description="Streams internal agent logs to this window." checked={app.developer.debugView} onChange={(v) => patch({ developer: { debugView: v } })} />
        <ToggleRow label="Verbose log files" description="Writes detailed logs to disk. Takes effect after a restart." checked={app.developer.verboseLogs} onChange={(v) => patch({ developer: { verboseLogs: v } })} />
      </Group>
      <Group title="Setup">
        <Row label="Run the welcome setup again" description="Walks through character, models, permissions and the desktop companion.">
          <button type="button" onClick={onRestartOnboarding} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/10 cursor-pointer">Start</button>
        </Row>
      </Group>
    </div>
  );
}

// ---- panel ----------------------------------------------------------------------------------

export function SettingsPanel({ isOpen, onClose, settings, onChange, appSettings, onAppSettingsChange, initialSection = "general", onOpenStudio, onRestartOnboarding, themeColor = "cyan" }: SettingsPanelProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [startupSupported, setStartupSupported] = useState(false);
  const [startupEnabled, setStartupEnabled] = useState(settings.autoStart);
  const [startupBusy, setStartupBusy] = useState(false);
  const [startupMessage, setStartupMessage] = useState("");
  const [monitorDeviceDraft, setMonitorDeviceDraft] = useState("");

  useEffect(() => {
    if (isOpen) setSection(initialSection);
  }, [isOpen, initialSection]);

  useEffect(() => {
    setMonitorDeviceDraft(appSettings?.desktopHost?.monitorDevice ?? "");
  }, [appSettings?.desktopHost?.monitorDevice]);

  useEffect(() => {
    if (!isOpen || section !== "voice" || !navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === "audioinput"))).catch(() => undefined);
  }, [isOpen, section]);

  useEffect(() => {
    if (!isOpen || section !== "general") return;
    const host = window as unknown as { sara?: { getAutoStartStatus?: () => Promise<{ supported: boolean; enabled: boolean }> }; myraa?: { getAutoStartStatus?: () => Promise<{ supported: boolean; enabled: boolean }> } };
    const bridge = host.sara ?? host.myraa;
    void bridge?.getAutoStartStatus?.().then((status) => {
      setStartupSupported(status.supported);
      if (status.supported) {
        setStartupEnabled(status.enabled);
        if (settings.autoStart !== status.enabled) onChange({ autoStart: status.enabled });
      }
    }).catch(() => setStartupSupported(false));
  }, [isOpen, section]);

  useEffect(() => {
    if (!isOpen) return;
    const escape = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [isOpen, onClose]);

  const app = appSettings;
  const patch = onAppSettingsChange;
  const accent = themeColor === "crimson" || themeColor === "rose" ? "text-rose-300" : themeColor === "emerald" ? "text-emerald-300" : themeColor === "gold" ? "text-amber-300" : "text-cyan-300";
  const needsApp = section !== "general" && section !== "about" && section !== "ai" && section !== "privacy";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            role="dialog" aria-modal="true" aria-label="Settings"
            className="absolute inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-white/15 bg-[#020206]/95 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <Settings size={18} className={accent} />
                <div>
                  <h3 className="font-display text-lg font-medium tracking-tight text-white">Settings</h3>
                  <p className="text-[11px] text-slate-500">Changes save automatically</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-xl border border-white/5 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/5 p-3 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition cursor-pointer ${section === id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                    <Icon size={14} className={section === id ? accent : ""} />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </nav>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                {needsApp && !app && <Loader2 size={16} className="animate-spin text-slate-400" />}

                {section === "general" && (
                  <div className="space-y-5">
                    <Group title="Startup & appearance">
                      <ToggleRow label="Full-work-area SARA desktop view" description="Show the existing SARA UI across the selected monitor's usable area. Right-click the panel or press Esc to hide it and access desktop icons; normal app windows and the taskbar remain usable. This is not a behind-icons wallpaper." checked={Boolean(app.desktopHost?.enabled)} onChange={(v) => patch({ desktopHost: { enabled: v } })} />
                      <Row label="Desktop panel monitor" description="Select a Windows display by device name. Leave automatic to use the primary monitor.">
                        <input aria-label="Desktop panel monitor device" value={monitorDeviceDraft} placeholder="Automatic / primary" maxLength={128} onChange={(event) => setMonitorDeviceDraft(event.target.value)} onBlur={() => { const monitorDevice = monitorDeviceDraft.trim(); if (monitorDevice !== (app.desktopHost?.monitorDevice ?? "")) patch({ desktopHost: { monitorDevice } }); }} className="w-44 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none" />
                      </Row>
                      <ToggleRow label="Launch at Windows startup" description="Start Sara in the background when you log in. Available in an installed Windows build." checked={startupSupported ? startupEnabled : false} disabled={!startupSupported || startupBusy}
                        onChange={(enabled) => {
                          const host = window as unknown as { sara?: { setAutoStart?: (value: boolean) => Promise<{ supported: boolean; enabled: boolean; error?: string }> }; myraa?: { setAutoStart?: (value: boolean) => Promise<{ supported: boolean; enabled: boolean; error?: string }> } };
                          const bridge = host.sara ?? host.myraa;
                          setStartupBusy(true);
                          setStartupMessage("");
                          void bridge?.setAutoStart?.(enabled).then((status) => {
                            setStartupSupported(status.supported);
                            if (!status.supported || status.error) {
                              setStartupMessage(status.error || "Startup registration is available only in an installed Windows build.");
                              return;
                            }
                            setStartupEnabled(status.enabled);
                            onChange({ autoStart: status.enabled });
                          }).catch(() => setStartupMessage("Could not update Windows startup settings.")).finally(() => setStartupBusy(false));
                        }} />
                      {startupMessage && <p role="status" className="px-4 pb-3 text-[11px] text-amber-300">{startupMessage}</p>}
                      {app && <ToggleRow label="Keep Sara running when closed" description="Closing the main window hides Sara in the system tray. An active voice session and background tasks continue until you choose Quit Sara from the tray." checked={app.autonomy.keepRunningInBackground} onChange={(v) => patch({ autonomy: { keepRunningInBackground: v } })} />}
                      <ToggleRow label="Animations" description="Motion and transitions in the interface." checked={settings.animations} onChange={(v) => onChange({ animations: v })} />
                    </Group>
                    {app && <Group title="Futuristic presentation · settings only" hint="These controls affect SARA’s presentation settings without changing the main layout or replacing the anime girl.">
                      <Row label="Presentation profile" description="Choose the existing cinematic appearance profile used by SARA’s visual runtime."><select aria-label="Futuristic presentation profile" value={settings.characterAppearance} onChange={(e) => onChange({ characterAppearance: e.target.value as SaraSettings["characterAppearance"] })} className="rounded-lg border border-cyan-400/20 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none"><option value="classic">Classic SARA</option><option value="spaceship-hologram">Cinematic SARA</option></select></Row>
                      <Row label="Command-center animation budget" description="Use existing graphics controls for animated panels and effects; lower settings help 8 GB systems."><select aria-label="Command center animation budget" value={app.graphics?.quality ?? "auto"} onChange={(e) => patch({ graphics: { quality: e.target.value as AppSettings["graphics"]["quality"] } })} className="rounded-lg border border-cyan-400/20 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none"><option value="auto">Auto</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low resource</option><option value="potato">Minimal</option></select></Row>
                      <div className="rounded border border-cyan-400/10 bg-cyan-400/5 p-2 text-[10px] text-slate-400">The main SARA screen remains unchanged. These settings only control the presentation profile and rendering budget.</div>
                    </Group>}
                    {app && (
                      <Group title="How chatty Sara is">
                        <Row label="Talks on her own" description="Quiet: only answers. Lively: comments and checks in more often.">
                          <Choice label="Proactivity" value={app.behavior.proactivity} options={[["quiet", "Quiet"], ["balanced", "Balanced"], ["lively", "Lively"]]} onChange={(v) => patch({ behavior: { proactivity: v } })} />
                        </Row>
                        <ToggleRow label="Do not disturb" description="No spoken interruptions until you turn this off. Alarms still ring." checked={app.behavior.dndManual} onChange={(v) => patch({ behavior: { dndManual: v } })} />
                      </Group>
                    )}
                  </div>
                )}

                {section === "ai" && <AiSection />}

                {section === "voice" && (
                  <div className="space-y-5">
                    {app && (
                      <Group title="Sara's voice">
                        <Row label="Voice" description="Used from the next time you connect.">
                          <select aria-label="Voice" value={app.voice.voiceName} onChange={(e) => patch({ voice: { voiceName: e.target.value } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                            {VOICES.map(([v, note]) => <option key={v} value={v}>{note ? `${v} — ${note}` : v}</option>)}
                          </select>
                        </Row>
                        <Row label="Speaking style" description="Executive: crisp composed chief-of-staff cadence & sharp engineering clarity. Anime: bright, lively delivery.">
                          <Choice label="Speaking style" value={app.voice.style} options={[["jarvis", "Executive"], ["natural", "Natural"], ["anime", "Anime girl"]]} onChange={(v) => patch({ voice: { style: v } })} />
                        </Row>
                        <Row label="SARA Executive Voice Preset" description="One-click preset: Charon voice + composed executive speaking tone + balanced pitch.">
                          <button
                            type="button"
                            onClick={() => patch({ voice: { voiceName: "Charon", style: "jarvis", pitch: 0 } })}
                            className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
                          >
                            Apply Executive Voice
                          </button>
                        </Row>
                        <Row label="Voice pitch" description="Lifts her voice higher and younger-sounding. Used from the next time you connect.">
                          <select aria-label="Voice pitch" value={String(app.voice.pitch ?? 0)} onChange={(e) => patch({ voice: { pitch: Number(e.target.value) } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                            {[[0, "Normal"], [1, "+1 (slightly higher)"], [2, "+2 (cute)"], [3, "+3 (very cute)"], [4, "+4"], [5, "+5 (max)"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                          </select>
                        </Row>
                        <Row label="Spoken task updates" description="What Sara says out loud while she works on your PC.">
                          <Choice label="Spoken task updates" value={app.voice.speakTaskUpdates} options={[["all", "Everything"], ["important", "Important"], ["none", "Nothing"]]} onChange={(v) => patch({ voice: { speakTaskUpdates: v } })} />
                        </Row>
                        <ToggleRow label="Interrupt Sara while she speaks" description="Let your voice stop her current reply and take priority. Uses local voice-activity detection; the microphone stays connected either way." checked={app.voice.bargeIn} onChange={(v) => patch({ voice: { bargeIn: v } })} />
                      </Group>
                    )}
                    <Group title="Wake word & microphone">
                      <ToggleRow label="Wake word" description="Listen for the phrase below while Sara is asleep." checked={settings.wakeWordEnabled} onChange={(v) => onChange({ wakeWordEnabled: v })} />
                      <Row label="Wake phrase">
                        <input type="text" aria-label="Wake phrase" value={settings.wakePhrase} onChange={(e) => onChange({ wakePhrase: e.target.value })} placeholder="hey sara"
                          className="w-40 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50" />
                      </Row>
                      <Row label="Microphone" description={mics.length ? `${mics.length} found` : "Allow microphone access to list devices"}>
                        <select aria-label="Microphone" value={settings.micDeviceId} onChange={(e) => onChange({ micDeviceId: e.target.value })}
                          className="max-w-[12rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                          <option value="">System default</option>
                          {mics.map((m, i) => <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>)}
                        </select>
                      </Row>
                      <SliderRow label="Wake-word sensitivity" description="Higher reacts faster but may trigger by mistake." value={settings.sensitivity} min={0} max={100} onChange={(v) => onChange({ sensitivity: v })} />
                    </Group>
                    <Note>The wake word only works while this window is open (it can be minimised).</Note>
                  </div>
                )}

                {section === "agent" && app && <AgentSection app={app} patch={patch} />}

                {section === "privacy" && <PrivacySection app={app} patch={patch} />}

                {section === "security" && app && <SecuritySection app={app} patch={patch} />}
                {section === "learning" && <LearningSection />}

                {section === "presence" && app && (
                  <div className="space-y-5">
                    <Group title="When you step away">
                      <SliderRow label="Count me as away after" value={app.behavior.awayAfterMin} min={2} max={60} unit=" min" onChange={(v) => patch({ behavior: { awayAfterMin: v } })} />
                      <ToggleRow label="Check in when I'm away" description="A gentle one-line check after a long break." checked={app.behavior.awayCheckin} onChange={(v) => patch({ behavior: { awayCheckin: v } })} />
                      <ToggleRow label="Welcome me back" description="A short greeting when you return." checked={app.behavior.returnGreeting} onChange={(v) => patch({ behavior: { returnGreeting: v } })} />
                    </Group>
                    <Group title="Automatic do not disturb">
                      <ToggleRow label="During full-screen apps and games" checked={app.behavior.autoDndFullscreen} onChange={(v) => patch({ behavior: { autoDndFullscreen: v } })} />
                      <ToggleRow label="During meetings and calls" checked={app.behavior.autoDndMeetings} onChange={(v) => patch({ behavior: { autoDndMeetings: v } })} />
                      <ToggleRow label="While recording software runs" checked={app.behavior.autoDndRecording} onChange={(v) => patch({ behavior: { autoDndRecording: v } })} />
                    </Group>
                  </div>
                )}

                {section === "character" && (
                  <div className="space-y-5">
                    {app && (
                      <Group
                        title="SARA Dual Modes & Automatic UI Switcher"
                        hint="SARA (Real Girl) manages two on-demand modes — 1st: J.A.R.V.I.S. (Real Boy + Core UI, shared brain) and 2nd: ULTRON (Separate Ultron UI). Both stay OFF until activated by voice, chat, or here."
                      >
                        <Row
                          label="Active Persona & UI Mode"
                          description={`J.A.R.V.I.S.: ${app.personas?.jarvisActive ? "ON" : "OFF"} · ULTRON: ${app.personas?.ultronActive ? "ON" : "OFF"}`}
                        >
                          <Choice
                            label="Active Persona & UI Mode"
                            value={
                              app.jarvis?.surfaceMode === "live_core"
                                ? "live_core"
                                : app.jarvis?.surfaceMode === "ultron"
                                  ? "ultron"
                                  : app.jarvis?.surfaceMode === "vision"
                                    ? "vision"
                                    : app.jarvis?.surfaceMode === "sara_os"
                                      ? "sara_os"
                                      : app.jarvis?.surfaceMode === "central_os"
                                        ? "central_os"
                                        : "companion"
                            }
                            options={[
                              ["companion", "SARA (Girl)"],
                              ["live_core", "J.A.R.V.I.S."],
                              ["ultron", "ULTRON"],
                              ["vision", "V.I.S.I.O.N."],
                              ["central_os", "Central OS"],
                              ["sara_os", "Spatial 2050"],
                            ]}
                            onChange={(mode) => {
                              if (mode === "companion" || mode === "live_core" || mode === "ultron" || mode === "vision") {
                                const target =
                                  mode === "live_core"
                                    ? "jarvis"
                                    : mode === "ultron"
                                      ? "ultron"
                                      : mode === "vision"
                                        ? "vision"
                                        : "sara";
                                void fetch("/api/persona/switch", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ target }),
                                }).catch(() => undefined);
                                patch({
                                  jarvis: { surfaceMode: mode },
                                  personas: {
                                    activeMode: target,
                                    jarvisActive: target === "jarvis",
                                    ultronActive: target === "ultron",
                                  },
                                });
                              } else {
                                patch({ jarvis: { surfaceMode: mode } });
                              }
                              window.dispatchEvent(new CustomEvent("sara:surface-mode-change", { detail: { surfaceMode: mode } }));
                            }}
                          />
                        </Row>

                        <Row
                          label="SARA Gemini Voice (Female)"
                          description="Natural female voice used when SARA (Real Girl) is active."
                        >
                          <select
                            aria-label="SARA Gemini Voice"
                            value={app.personas?.saraVoiceName ?? "Aoede"}
                            onChange={(e) => patch({ personas: { saraVoiceName: e.target.value } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer"
                          >
                            <option value="Aoede">Aoede — natural warm girl</option>
                            <option value="Kore">Kore — confident & clear</option>
                            <option value="Leda">Leda — youthful & bright</option>
                            <option value="Zephyr">Zephyr — lively</option>
                            <option value="Sulafat">Sulafat — soft & calm</option>
                          </select>
                        </Row>

                        <Row
                          label="J.A.R.V.I.S. Gemini Voice (Male)"
                          description="Separate male voice used when J.A.R.V.I.S. Mode is activated."
                        >
                          <select
                            aria-label="J.A.R.V.I.S. Gemini Voice"
                            value={app.personas?.jarvisVoiceName ?? "Charon"}
                            onChange={(e) => patch({ personas: { jarvisVoiceName: e.target.value } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer"
                          >
                            <option value="Charon">Charon — chief-of-staff male</option>
                            <option value="Puck">Puck — witty & upbeat male</option>
                            <option value="Orus">Orus — calm & firm male</option>
                            <option value="Fenrir">Fenrir — bold male</option>
                          </select>
                        </Row>

                        <Row
                          label="ULTRON Gemini Voice"
                          description="Deep cybernetic voice used when ULTRON Mode & UI are activated."
                        >
                          <select
                            aria-label="ULTRON Gemini Voice"
                            value={app.personas?.ultronVoiceName ?? "Fenrir"}
                            onChange={(e) => patch({ personas: { ultronVoiceName: e.target.value } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-white outline-none cursor-pointer"
                          >
                            <option value="Fenrir">Fenrir — deep commanding</option>
                            <option value="Orus">Orus — resonant steel</option>
                            <option value="Charon">Charon — cold analytical</option>
                          </select>
                        </Row>

                        <Row
                          label="Standalone Mode Windows"
                          description="Open J.A.R.V.I.S. Core or Ultron UI in a separate window while keeping SARA open."
                        >
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const bridge = (window as unknown as { sara?: { openLiveCoreWindow?: () => Promise<unknown> } }).sara;
                                if (bridge?.openLiveCoreWindow) {
                                  void bridge.openLiveCoreWindow();
                                } else {
                                  window.open("/?mode=live-core", "sara-live-core-window", "width=1360,height=860,menubar=no,toolbar=no");
                                }
                              }}
                              className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
                            >
                              J.A.R.V.I.S. Window
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                window.open("/?mode=ultron", "sara-ultron-window", "width=1360,height=860,menubar=no,toolbar=no");
                              }}
                              className="rounded-lg border border-red-500/40 bg-red-600/15 px-3 py-1.5 text-[11px] font-medium text-red-200 hover:bg-red-600/25 cursor-pointer"
                            >
                              Ultron Window
                            </button>
                          </div>
                        </Row>
                      </Group>
                    )}
                    <Group title="Character">
                      <Row label="Sara's appearance" description="Choose the classic hologram or the new spaceship hologram videos. This preference is saved on this device.">
                        <select aria-label="Sara appearance" value={settings.characterAppearance}
                          onChange={(e) => onChange({ characterAppearance: e.target.value as SaraSettings["characterAppearance"] })}
                          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                          <option value="classic">Classic hologram</option>
                          <option value="spaceship-hologram">Spaceship hologram</option>
                        </select>
                      </Row>
                      <Row label="Character Studio" description="Change character, import your own models, pose, fingers and hair/cloth physics.">
                        <button type="button" onClick={onOpenStudio} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/10 cursor-pointer">
                          <Wrench size={12} /> Open
                        </button>
                      </Row>
                      {app && (
                        <Row label="Graphics quality" description="Lower = less GPU memory and fewer crashes. Optimized: smaller textures, 30 fps, no cloth. Potato PC: lowest resolution, no shadows, 24 fps, and she is drawn only once (on the desktop) when the desktop companion is on. Auto picks for your PC and steps down by itself if she crashes.">
                          <select aria-label="Graphics quality" value={app.graphics?.quality ?? "auto"}
                            onChange={(e) => {
                              const quality = e.target.value as AppSettings["graphics"]["quality"];
                              // Re-create her right away with the new budget (both windows reload).
                              void api.updateAppSettings({ graphics: { quality, autoStep: 0 } }).catch(() => undefined).then(() => window.location.reload());
                            }}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                            <option value="auto">Auto (recommended)</option>
                            <option value="high">High</option>
                            <option value="balanced">Medium</option>
                            <option value="low">Optimized</option>
                            <option value="potato">Potato PC</option>
                          </select>
                        </Row>
                      )}
                      {app && (
                        <SliderRow label="Realism" description="0% is flat anime shading. Higher adds skin depth, fabric sheen and soft studio reflections."
                          value={Math.round((app.graphics?.realism ?? 0.85) * 100)} min={0} max={100} step={5} unit="%"
                          onChange={(v) => patch({ graphics: { realism: v / 100 } })} />
                      )}
                      {app && <ToggleRow label="Eyes follow the mouse" checked={app.character.eyeFollowCursor} onChange={(v) => patch({ character: { eyeFollowCursor: v } })} />}
                      {app && (
                        <ToggleRow label="Real cloth" description="Clothes move like fabric: they swing and trail when she moves, and you can drag them with the mouse. They always stay on."
                          checked={app.physics.clothEnabled ?? true} onChange={(v) => patch({ physics: { clothEnabled: v } })} />
                      )}
                      {app && (app.physics.clothEnabled ?? true) && (
                        <SliderRow label="Cloth looseness" description="How much the fabric swings away from her body."
                          value={Math.round((app.physics.clothLooseness ?? 1) * 100)} min={0} max={200} step={10} unit="%"
                          onChange={(v) => patch({ physics: { clothLooseness: v / 100 } })} />
                      )}
                      <SliderRow label="Shine" description="Reflection highlights on the character (not scene brightness)." value={settings.characterShine} min={0} max={100} unit="%" onChange={(v) => onChange({ characterShine: v })} />
                    </Group>
                    {app && (
                      <Group title="Desktop companion" hint="Sara standing on your desktop or taskbar outside this window. Drag her around; right-click for options.">
                        <ToggleRow label="Show on the desktop" checked={app.companion.enabled} onChange={(v) => patch({ companion: { enabled: v } })} />
                        <ToggleRow label="Passive desktop companion layer" description="Show the existing character companion as a click-through desktop-level overlay. This is not a native Windows wallpaper host and does not include the full SARA controls." checked={Boolean(app.companion.desktopLayer)} onChange={(v) => patch({ companion: { desktopLayer: v } })} />
                        <SliderRow label="Size" value={Math.round(app.companion.scale * 100)} min={40} max={250} step={5} unit="%" onChange={(v) => patch({ companion: { scale: v / 100 } })} />
                        <Row label="In full-screen apps and games" description="What the companion does when something goes full screen.">
                          <select aria-label="Full-screen behaviour" value={app.companion.fullscreenBehavior} onChange={(e) => patch({ companion: { fullscreenBehavior: e.target.value as AppSettings["companion"]["fullscreenBehavior"] } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                            <option value="game_aware">Hide in games</option>
                            <option value="hide">Always hide</option>
                            <option value="notifications_only">Only for alerts</option>
                            <option value="always">Stay visible</option>
                          </select>
                        </Row>
                        <Row label="How lively" description="How often she does things on her own: walks, sits on window edges, stretches, peeks in from the screen edge.">
                          <select aria-label="Companion liveliness" value={app.companion.interactionLevel} onChange={(e) => patch({ companion: { interactionLevel: e.target.value as AppSettings["companion"]["interactionLevel"] } })}
                            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none cursor-pointer">
                            <option value="minimal">Calm</option>
                            <option value="normal">Normal</option>
                            <option value="playful">Playful</option>
                          </select>
                        </Row>
                        <ToggleRow label="Walk around" description="She strolls along the taskbar and window tops." checked={app.companion.walkAround} onChange={(v) => patch({ companion: { walkAround: v } })} />
                        <ToggleRow label="Hide and peek" description="Now and then she slips behind a screen edge, then peeks back in, hands first. Talking to her calls her out." checked={app.companion.hideAndPeek ?? true} onChange={(v) => patch({ companion: { hideAndPeek: v } })} />
                        <ToggleRow label="Play with desktop icons" description="She may tug an icon out of place. Its old spot is saved; say “put the icons back” (or use her right-click menu) and she restores every icon she moved." checked={app.companion.iconPlay ?? false} onChange={(v) => patch({ companion: { iconPlay: v } })} />
                        <SliderRow label="Stand out from the wallpaper" description="A thin outline and soft shadow so she never blends into a busy background." value={Math.round((app.companion.standOut ?? 0.7) * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => patch({ companion: { standOut: v / 100 } })} />
                      </Group>
                    )}
                  </div>
                )}

                {section === "system" && app && <SystemSection app={app} patch={patch} onRestartOnboarding={onRestartOnboarding} />}

                {section === "integrations" && app && (
                  <IntegrationsSection app={app} patch={patch} />
                )}

                {section === "about" && (
                  <div className="space-y-5">
                    <Group title="Sara">
                      <Row label="Version"><span className="font-mono text-[11px] text-slate-300">{__APP_VERSION__}</span></Row>
                      <Row label="AI"><span className="text-[11px] text-slate-300">Google Gemini, with your own key</span></Row>
                      <Row label="PC control"><span className="text-[11px] text-slate-300">Local desktop agent, permission-checked</span></Row>
                    </Group>
                    <Note tone="warn">
                      <AlertTriangle size={12} className="mr-1 inline" />
                      Characters you import stay on this PC. Many fan-made models forbid redistribution, so Sara never uploads or shares them.
                    </Note>
                    <Note tone="ok"><Check size={12} className="mr-1 inline" /><Eye size={12} className="mr-1 inline" /> Everything runs locally except requests to the AI provider you chose.</Note>
                    <Note><MonitorSmartphone size={12} className="mr-1 inline" /> Tip: in the main view, WASD rotates the camera and Q/E zooms.</Note>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
