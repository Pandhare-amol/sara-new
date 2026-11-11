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
  onOpenStudio: () => void;
  onRestartOnboarding: () => void;
  themeColor: string;
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
  ["Charon", "informative (male)"],
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
  ["always_confirm", "Always ask before sending"],
  ["confirm_new_recipients", "Ask for new recipients"],
  ["trusted_without_confirmation", "Trusted contacts send without asking"],
  ["never_without_preview", "Always show a preview"],
];

function AgentSection({ app, patch }: { app: AppSettings; patch: (p: AppSettingsPatch) => void }) {
  const { view, error, set, load } = usePermissions();
  return (
    <div className="space-y-5">
      <Group title="While Sara works">
        <ToggleRow label="Show the task panel" description="See the plan, each step and pause / stop buttons while Sara uses your PC. Approval requests always appear."
          checked={app.autonomy.showTaskHud} onChange={(v) => patch({ autonomy: { showTaskHud: v } })} />
        <SliderRow label="Step limit per task" description="A task that needs more actions than this is stopped. Applies to new tasks." value={app.autonomy.maxSteps} min={5} max={80} onChange={(v) => patch({ autonomy: { maxSteps: v } })} />
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
  const [status, setStatus] = useState<{ enrolled: boolean; authenticated: boolean; required?: boolean; methods: { pin: boolean; face: false; voice: false; windowsHello: false } } | null>(null);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [authVisual, setAuthVisual] = useState<"idle" | "scanning" | "success" | "error">("idle");
  useEffect(() => { void api.securityStatus().then(setStatus).catch(() => undefined); }, []);
  const enroll = async () => { setAuthVisual("scanning"); try { await api.enrollOwnerPin(pin); setPin(""); setMessage("Owner PIN enrolled locally and protected by Windows security."); setAuthVisual("success"); void api.securityStatus().then(setStatus); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not enroll PIN."); setAuthVisual("error"); } };
  const authenticate = async () => { setAuthVisual("scanning"); try { const result = await api.authenticateOwnerPin(pin); setMessage(result.ok ? "Sara unlocked for this session." : (result.reason || "Authentication failed.")); setAuthVisual(result.ok ? "success" : "error"); setPin(""); void api.securityStatus().then(setStatus); } catch (e) { setMessage(e instanceof Error ? e.message : "Authentication failed."); setAuthVisual("error"); } };
  const lock = async () => { await fetch("/api/security/lock", { method: "POST" }); setMessage("Sara is locked."); setAuthVisual("idle"); void api.securityStatus().then(setStatus); };
  const visualLabel = authVisual === "scanning" ? "Checking local credentials…" : authVisual === "success" ? "Authentication ready" : authVisual === "error" ? "Authentication needs attention" : "Secure startup gate";
  return <div className="space-y-5">
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#020914]/80 p-5 shadow-[0_0_40px_rgba(0,190,255,0.08)]">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-cyan-300/10" />
      <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full border border-blue-300/10" />
      <div className="relative flex items-center gap-4">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/5">
          <motion.div animate={authVisual === "scanning" ? { rotate: 360 } : { rotate: 0 }} transition={authVisual === "scanning" ? { repeat: Infinity, duration: 2, ease: "linear" } : { duration: 0.3 }} className="absolute inset-2 rounded-full border border-dashed border-cyan-300/60" />
          <motion.div animate={authVisual === "success" ? { scale: [0.8, 1.12, 1] } : { scale: 1 }} className={`flex h-11 w-11 items-center justify-center rounded-full ${authVisual === "success" ? "bg-emerald-400/20 text-emerald-300" : authVisual === "error" ? "bg-rose-400/15 text-rose-300" : "bg-blue-500/20 text-cyan-200"}`}>
            {authVisual === "success" ? <Check size={22} /> : authVisual === "error" ? <AlertTriangle size={20} /> : <Lock size={20} />}
          </motion.div>
        </div>
        <div className="min-w-0 flex-1"><div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300/80">SARA SECURE STARTUP</div><div className="mt-1 text-lg font-semibold text-white">{visualLabel}</div><div className="mt-1 text-[11px] leading-5 text-slate-400">Local owner verification gates desktop control after SARA starts. Windows logon itself remains protected by Windows.</div></div>
      </div>
      <div className="mt-4 flex items-end gap-1 border-t border-white/5 pt-3" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <motion.span key={i} animate={authVisual === "scanning" ? { height: [4, 8 + ((i * 7) % 18), 5] } : { height: i % 5 === 0 ? 9 : 4 }} transition={authVisual === "scanning" ? { repeat: Infinity, duration: 0.65 + (i % 4) * 0.08, delay: i * 0.02 } : { duration: 0.2 }} className="w-1 rounded-full bg-gradient-to-t from-blue-500 to-cyan-200" />)}</div>
    </motion.div>
    <Note tone={status?.required === false ? "info" : "warn"}>{status?.required === false ? "SARA’s post-login owner gate is temporarily disabled by request. Windows password, PIN, and Windows Hello security are unchanged. The saved SARA authentication setup remains available for re-enabling later." : "Owner authentication is local-only. The PIN is protected by Windows DPAPI and is currently the only factor allowed to unlock desktop-control actions."}</Note>
    <Group title="Owner authentication" hint={status?.required === false ? "Optional setup only; desktop tools are not currently blocked by this SARA gate." : "Sara stays locked until the enrolled owner authenticates. Desktop tools fail closed while locked."}>
      <Row label={status?.enrolled ? (status.authenticated ? "Unlocked" : "Locked") : "Not enrolled"} description="High-risk actions still require the existing permission and confirmation gates."><span className="text-[10px] font-mono text-cyan-300">{status?.enrolled ? (status.authenticated ? "ACTIVE SESSION" : "PIN REQUIRED") : "SET PIN"}</span></Row>
      <Row label="Owner PIN" description="At least 6 digits; avoid predictable sequences."><div className="flex gap-2"><input aria-label="Owner PIN" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button type="button" disabled={pin.length < 6 || authVisual === "scanning"} onClick={() => void (status?.enrolled ? authenticate() : enroll())} className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40">{status?.enrolled ? "Unlock" : "Set up PIN"}</button>{status?.authenticated && <button type="button" onClick={() => void lock()} className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">Lock</button>}</div></Row>
      <ToggleRow label="Lock on Windows lock/sleep" description="Immediately clears Sara's in-memory session when Windows locks or sleeps." checked={app.security.lockOnWindowsLock} onChange={(v) => patch({ security: { lockOnWindowsLock: v } })} />
      <ToggleRow label="Face authentication" description="Unavailable: the legacy OpenCV face matcher is not Windows Hello and cannot safely unlock this app." checked={false} onChange={() => undefined} disabled />
      <ToggleRow label="Voice authentication" description="Unavailable: the legacy MFCC voice matcher can be spoofed and is not accepted as an owner credential." checked={false} onChange={() => undefined} disabled />
      <SliderRow label="Idle session timeout" value={app.security.idleTimeoutMin} min={1} max={120} unit=" min" onChange={(v) => patch({ security: { idleTimeoutMin: v } })} />
      <SliderRow label="Absolute session timeout" value={app.security.absoluteTimeoutHours} min={1} max={48} unit=" h" onChange={(v) => patch({ security: { absoluteTimeoutHours: v } })} />
      {message && <div className="px-4 pb-3 text-[11px] text-cyan-200">{message}</div>}
    </Group>
  </div>;
}

type LearningSessionView = { id: string; topic: string; objective: string; depth: string; status: string; modules: string[]; sources: Array<{ url: string; title: string; review?: string; preview?: string }>; experiments: Array<{ id: string; objective: string; verified: boolean; outcome: string }>; assessment?: { status: string; evidence: string | null }; progress: number };
function LearningSection() {
  const [sessions, setSessions] = useState<LearningSessionView[]>([]);
  const [topic, setTopic] = useState("");
  const [urls, setUrls] = useState("");
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => { try { const data = await fetch("/api/learn/sessions", { cache: "no-store" }).then((r) => r.json()); setSessions(Array.isArray(data) ? data : []); } catch { setMessage("Learning service is unavailable."); } };
  useEffect(() => { void load(); }, []);
  const run = async (url: string, body?: unknown) => { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Learning request failed."); return data; };
  const start = async () => { if (!topic.trim() || busy) return; setBusy(true); setMessage(""); try { const session = await run("/api/learn/sessions", { topic: topic.trim(), depth: "beginner" }); setTopic(""); setActiveId(session.id); setMessage("Learning plan created."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not start learning."); } finally { setBusy(false); } };
  const research = async () => { if (!activeId || busy) return; setBusy(true); try { const links = urls.split(/\s+/).map((x) => x.trim()).filter(Boolean); await run(`/api/learn/sessions/${encodeURIComponent(activeId)}/research`, { urls: links }); setUrls(""); setMessage("Sources fetched. Review each source before saving knowledge."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Research failed."); } finally { setBusy(false); } };
  const practice = async (session: LearningSessionView, objective: string) => { try { const task = await run(`/api/learn/sessions/${encodeURIComponent(session.id)}/practice`, { objective }); setMessage(`Practice task started (${String(task.taskId).slice(0, 8)}). SARA will record it after task verification.`); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not start practice task."); } };
  const review = async (sessionId: string, url: string, approved: boolean) => { try { await run(`/api/learn/sessions/${encodeURIComponent(sessionId)}/sources/review`, { url, approved }); setMessage(approved ? "Source saved to knowledge." : "Source rejected."); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Source review failed."); } };
  const active = sessions.find((item) => item.id === activeId) || sessions[0];
  return <div className="space-y-5">
    <Note>SARA Learn creates a study path, researches URLs you provide, and asks you to review sources before saving them. A topic being researched does not mean SARA has mastered or tested it.</Note>
    <Group title="Start self-learning" hint="Enter any subject; broad subjects get a staged path.">
      <Row label="Topic or skill"><div className="flex gap-2"><input aria-label="Learning topic" value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void start()} placeholder="e.g. Excel formulas, Python" className="w-56 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button type="button" disabled={busy || !topic.trim()} onClick={() => void start()} className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40">{busy ? "Working…" : "Start"}</button></div></Row>
      <Row label="Research sources" description="Paste up to 8 HTTPS documentation/article URLs, separated by spaces. Private/local addresses are blocked."><div className="flex gap-2"><input aria-label="Learning source URLs" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://docs.example/..." className="w-56 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" /><button type="button" disabled={busy || !active} onClick={() => void research()} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 disabled:opacity-40">Research</button></div></Row>
    </Group>
    {active && <Group title="Study plan" hint={`${active.topic} · ${active.depth} · ${active.status} · ${Math.round(active.progress * 100)}%`}>
      {active.modules.map((module, index) => <Row key={`${active.id}-${index}`} label={`${index + 1}. ${module}`}><button type="button" onClick={() => void practice(active, module)} className="rounded border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200">Practice</button></Row>)}
      {active.sources.map((source) => <Row key={source.url} label={source.title} description={`${source.url} · ${source.review || "pending review"}${source.preview ? `\n${source.preview}` : ""}`}>
        {(!source.review || source.review === "pending") ? <div className="flex gap-1"><button type="button" onClick={() => void review(active.id, source.url, true)} className="rounded border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-200">Save</button><button type="button" onClick={() => void review(active.id, source.url, false)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">Skip</button></div> : <span className="text-[10px] text-slate-400">{source.review}</span>}
      </Row>)}
      {active.experiments.map((experiment) => <Row key={experiment.id} label={`Practice: ${experiment.objective}`} description={`${experiment.outcome}${experiment.verified ? " · verified" : " · not verified"}`} />)}
      <Row label="Assessment" description={active.assessment?.evidence || "Not yet assessed. Record a real practice outcome to distinguish researched knowledge from demonstrated skill."}><span className="text-[10px] font-mono text-cyan-300">{active.assessment?.status || "not assessed"}</span></Row>
    </Group>}
    {sessions.length > 1 && <Group title="Previous learning sessions">{sessions.slice(1, 8).map((item) => <Row key={item.id} label={item.topic} description={`${item.status} · ${Math.round(item.progress * 100)}%`}><button type="button" onClick={() => setActiveId(item.id)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-200">Open</button></Row>)}</Group>}
    {message && <p role="status" className="text-[11px] text-cyan-200">{message}</p>}
  </div>;
}

function SystemSection({ app, patch, onRestartOnboarding }: { app: AppSettings; patch: (p: AppSettingsPatch) => void; onRestartOnboarding: () => void }) {
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

export function SettingsPanel({ isOpen, onClose, settings, onChange, appSettings, onAppSettingsChange, initialSection = "general", onOpenStudio, onRestartOnboarding, themeColor }: SettingsPanelProps) {
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
                        <Row label="Speaking style" description="Anime: bright, cute and lively delivery with little giggles. Used from the next time you connect.">
                          <Choice label="Speaking style" value={app.voice.style} options={[["natural", "Natural"], ["anime", "Anime girl"]]} onChange={(v) => patch({ voice: { style: v } })} />
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
                  <div className="space-y-5">
                    <Group title="Controlled intelligence" hint="These switches enable local behavior. External accounts remain disconnected until a real connector is configured.">
                      <ToggleRow label="Adaptive communication style" description="Use explicit user preferences and statements to adjust explanations." checked={app.advancedFeatures.adaptiveTone} onChange={(v) => patch({ advancedFeatures: { adaptiveTone: v } })} />
                      <ToggleRow label="Predictive suggestions" description="Prepare reversible suggestions from approved task history; never submit or delete automatically." checked={app.advancedFeatures.predictiveSuggestions} onChange={(v) => patch({ advancedFeatures: { predictiveSuggestions: v } })} />
                      <ToggleRow label="Verified skill learning" description="Allow approved workflows to be saved as reusable skills. Activation remains approval-gated." checked={app.advancedFeatures.skillAcquisition} onChange={(v) => patch({ advancedFeatures: { skillAcquisition: v } })} />
                    </Group>
                    <Group title="SARA Live Core" hint="Open the separate core UI without replacing the existing assistant window.">
                      <LiveCoreControls />
                      <Row label="Open Live Core" description="Launches the integrated SARA core surface in its own Electron window. The existing assistant remains available.">
                        <button
                          type="button"
                          onClick={() => void window.sara?.openLiveCore?.()}
                          className="rounded border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-mono text-cyan-200 hover:bg-cyan-400/20"
                        >
                          OPEN CORE UI
                        </button>
                      </Row>
                    </Group>
                    <Group title="Account connections" hint="No external account is connected by default. Configure a provider-specific connector before enabling access.">
                      <Row label="Connector Hub" description="Discover and health-check approved real API connectors. Credentials are still entered per provider and never exposed to the renderer."><button type="button" onClick={() => void fetch("/api/api-hub/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: false }) })} className="rounded border border-cyan-400/30 px-2 py-1 text-[10px] font-mono text-cyan-200 hover:bg-cyan-400/10">SYNC CONNECTORS</button></Row>
                      <Row label="Calendar" description="Read-only schedule access and conflict suggestions. Status: not configured."><span className="text-[10px] font-mono text-amber-300">NOT CONFIGURED</span></Row>
                      <Row label="Email and chat" description="Communication analysis requires an approved provider connector. Status: not configured."><span className="text-[10px] font-mono text-amber-300">NOT CONFIGURED</span></Row>
                      <Row label="Shared documents" description="Collaboration requires a supported document API or UI Automation adapter. Status: not configured."><span className="text-[10px] font-mono text-amber-300">NOT CONFIGURED</span></Row>
                      <Row label="YouTube/media learning" description="Provide a URL or transcript; SARA asks before storing knowledge. This workflow is available now."><span className="text-[10px] font-mono text-emerald-300">APPROVAL REQUIRED</span></Row>
                    </Group>
                  </div>
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
