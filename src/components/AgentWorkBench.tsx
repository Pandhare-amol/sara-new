import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";
import type { TaskView } from "../lib/appApi";

type CapabilityRecord = {
  id: string;
  name: string;
  category: string;
  status: "available" | "partial" | "unavailable" | "needs_validation";
  requiredTools: string[];
  limitations: string[];
  successRate: number | null;
  lastValidatedAt: string | null;
};

type CouncilPlan = {
  id: string;
  goal: string;
  members: Array<{ role: string; responsibility: string; required: boolean }>;
  checkpoints: string[];
  approvalRequired: boolean;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}

export function AgentWorkBench() {
  const [capabilities, setCapabilities] = useState<CapabilityRecord[]>([]);
  const [inventory, setInventory] = useState<{ status: "loading" | "available" | "unavailable"; source: string; applications: Array<{ name: string; shortcut?: string; source?: string }>; error?: string }>({ status: "loading", source: "authenticated Windows bridge", applications: [] });
  const [objective, setObjective] = useState("");
  const [plan, setPlan] = useState<CouncilPlan | null>(null);
  const [task, setTask] = useState<TaskView | null>(null);
  const [busy, setBusy] = useState<"capabilities" | "plan" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCapabilities = useCallback(async () => {
    setBusy("capabilities");
    setError(null);
    try {
      const response = await fetch("/api/asi/capabilities", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Capability request failed (${response.status}).`);
      setCapabilities(Array.isArray(result.capabilities) ? result.capabilities : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  }, []);

  const loadInstalledApplications = useCallback(async () => {
    try {
      const response = await fetch("/api/windows/applications", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || `Windows inventory request failed (${response.status}).`);
      setInventory({ status: "available", source: String(result.source || "Windows bridge"), applications: Array.isArray(result.applications) ? result.applications : [] });
    } catch (reason) {
      setInventory({ status: "unavailable", source: "authenticated Windows bridge", applications: [], error: reason instanceof Error ? reason.message : String(reason) });
    }
  }, []);

  useEffect(() => { void loadCapabilities(); void loadInstalledApplications(); }, [loadCapabilities, loadInstalledApplications]);

  const preparePlan = async () => {
    const goal = objective.trim();
    if (!goal) return;
    setBusy("plan");
    setError(null);
    setTask(null);
    try {
      setPlan(await postJson<CouncilPlan>("/api/asi/council/plan", { goal }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const startExecution = async () => {
    if (!plan) return;
    setBusy("execute");
    setError(null);
    try {
      // Starting is always a separate user action after reviewing the plan.
      // The task then goes through SARA's existing permission/confirmation loop.
      setTask(await postJson<TaskView>("/api/tasks", { goal: plan.goal, origin: "text" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const panel = "rounded-xl border border-white/10 bg-white/[0.035] p-3";
  const label = "text-[10px] uppercase tracking-widest text-slate-500 font-mono";

  return <section className={panel}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-mono"><ClipboardList size={14} className="text-cyan-400" /> Capability audit &amp; two-stage task workbench</div>
      <button type="button" onClick={() => void loadCapabilities()} disabled={busy !== null} aria-label="Refresh capability inventory" className="text-slate-400 hover:text-white disabled:opacity-40"><RefreshCw size={14} /></button>
    </div>

    <div className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.035] p-3">
      <div className={label}>Stage 1 · Plan</div>
      <p className="mt-1 text-[10px] text-slate-400">Sara’s council endpoint assigns relevant roles and checkpoints. This is a role-based plan, not separately spawned AI instances.</p>
      <textarea value={objective} onChange={(event) => { setObjective(event.target.value); setPlan(null); setTask(null); }} maxLength={2000} rows={2} placeholder="Describe a bounded task for Sara to plan…" className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white placeholder:text-slate-600" />
      <button type="button" onClick={() => void preparePlan()} disabled={!objective.trim() || busy !== null} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-[11px] text-cyan-100 disabled:opacity-40">
        {busy === "plan" ? <LoaderCircle size={13} className="animate-spin" /> : <ClipboardList size={13} />} Prepare plan
      </button>
    </div>

    {plan && <div className="mt-3 rounded-lg border border-white/10 p-3">
      <div className={label}>Plan review · {plan.members.length} roles · approval checkpoint {plan.approvalRequired ? "included" : "not flagged by council"}</div>
      <ol className="mt-2 space-y-2">{plan.members.map((member, index) => <li key={`${member.role}-${index}`} className="text-[11px]"><span className="text-cyan-200">{member.role}</span>{member.required ? <span className="ml-1 text-amber-300">· required</span> : null}<p className="mt-0.5 text-slate-400">{member.responsibility}</p></li>)}</ol>
      <div className="mt-2 text-[10px] text-slate-500">Checkpoints: {plan.checkpoints.join(" → ")}</div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className={label}>Stage 2 · Execute through Sara</div>
        <p className="mt-1 text-[10px] text-slate-400">Execution uses the existing desktop task runtime, permissions, confirmations, verification, and stop controls. Review before starting; external actions may require approval.</p>
        {!task ? <button type="button" onClick={() => void startExecution()} disabled={busy !== null} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-1.5 text-[11px] text-emerald-100 disabled:opacity-40">
          {busy === "execute" ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />} Start Sara execution
        </button> : <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-200"><CheckCircle2 size={14} /> Task {task.id.slice(0, 8)} started · {task.state}. Follow progress and approvals in the task HUD.</div>}
      </div>
    </div>}

    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-violet-300" /><span className={label}>Reported capability inventory · {capabilities.length}</span></div>
      <p className="mt-1 text-[10px] text-slate-500">Live registry data, not a claim that every installed app or workflow has been tested.</p>
      {capabilities.length > 0 && <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{capabilities.map((item) => <details key={item.id} className="rounded border border-white/5 bg-black/10 px-2 py-1.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px]"><span className="truncate text-slate-200">{item.name}</span><span className={`shrink-0 ${item.status === "available" ? "text-emerald-300" : item.status === "partial" ? "text-amber-300" : "text-slate-400"}`}>{item.status.replaceAll("_", " ")}</span></summary>
        <div className="mt-1 text-[10px] text-slate-400">{item.category} · tools: {item.requiredTools.join(", ") || "none listed"}</div>
        {item.successRate !== null && <div className="mt-1 text-[10px] text-slate-400">Recorded success rate: {Math.round(item.successRate * 100)}%</div>}
        {item.lastValidatedAt && <div className="mt-1 text-[10px] text-slate-500">Last validated: {new Date(item.lastValidatedAt).toLocaleString()}</div>}
        {item.limitations.length > 0 && <ul className="mt-1 list-inside list-disc text-[10px] text-amber-200/80">{item.limitations.map((limitation, index) => <li key={`${item.id}-limitation-${index}`}>{limitation}</li>)}</ul>}
      </details>)}</div>}
      {!capabilities.length && busy === "capabilities" && <div className="mt-2 text-[10px] text-slate-500">Loading registered capabilities…</div>}
    </div>
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className={label}>Installed / Start-menu applications · {inventory.status === "available" ? inventory.applications.length : "—"}</div>
      <p className="mt-1 text-[10px] text-slate-500">Inventory is queried from the authenticated Windows bridge; it does not imply Sara has tested each application’s workflows.</p>
      {inventory.status === "unavailable" && <div className="mt-2 text-[10px] text-amber-200">Unavailable: {inventory.error}</div>}
      {inventory.status === "available" && <div className="mt-2 max-h-36 overflow-y-auto rounded border border-white/5 bg-black/10 p-2 text-[10px] text-slate-300">{inventory.applications.length ? inventory.applications.map((application, index) => <div key={`${application.name}-${index}`} className="truncate py-0.5">{application.name}{application.source ? <span className="text-slate-500"> · {application.source}</span> : null}</div>) : <div className="text-slate-500">The bridge returned no application entries.</div>}</div>}
    </div>
    {error && <div role="alert" className="mt-3 rounded border border-rose-400/20 bg-rose-500/5 p-2 text-[11px] text-rose-200">{error}</div>}
  </section>;
}
