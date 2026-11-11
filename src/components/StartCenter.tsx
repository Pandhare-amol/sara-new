import { useEffect, useState } from "react";
import { AppWindow, Brain, FileSearch, Play, RefreshCw, Search, Zap } from "lucide-react";

type SearchResult = { type: "application" | "window" | "skill" | "knowledge"; name?: string; title?: string; processName?: string; shortcut?: string; windowHandle?: string; processId?: number; description?: string; topic?: string };

export function StartCenter() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    if (query.trim().length < 2) { setResults([]); setMessage("Type at least 2 characters to search Windows and SARA knowledge."); return; }
    try { const response = await fetch(`/api/windows/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Universal search unavailable."); setResults(Array.isArray(body.results) ? body.results : []); setMessage(""); }
    catch (error) { setResults([]); setMessage(error instanceof Error ? error.message : "Universal search unavailable."); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [query]);
  const act = async (result: SearchResult) => {
    const key = result.shortcut || result.windowHandle || result.name || result.title || "result"; setBusy(key); setMessage("");
    try {
      const operation = result.type === "application" ? "launch_application" : result.type === "window" ? "focus" : null;
      if (!operation) { setMessage(result.type === "skill" ? "Skill found; run it from the Skills panel." : "Knowledge found; open Memory to inspect its provenance."); return; }
      const arguments_ = operation === "launch_application" ? { shortcutPath: result.shortcut } : { windowHandle: result.windowHandle, processId: result.processId };
      const response = await fetch("/api/windows-bridge/manage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, arguments: arguments_ }) }); const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.data?.status !== "SUCCESS") throw new Error(body.error || body?.data?.message || "Windows did not verify the operation.");
      setMessage(operation === "focus" ? `${result.title || "Window"} focused.` : `${result.name || "Application"} launched.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Windows operation failed."); } finally { setBusy(null); }
  };
  const icon = (type: SearchResult["type"]) => type === "application" ? <Play size={12} className="text-cyan-300" /> : type === "window" ? <AppWindow size={12} className="text-emerald-300" /> : type === "skill" ? <Zap size={12} className="text-violet-300" /> : <Brain size={12} className="text-amber-300" />;
  return <section className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-mono"><Search size={14} className="text-cyan-400" /> SARA Universal Search</div><button type="button" onClick={() => void load()} aria-label="Refresh search" className="text-slate-400 hover:text-white"><RefreshCw size={14} /></button></div>
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Apps, windows, skills, knowledge" className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
    <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">{results.slice(0, 40).map((result, index) => { const label = result.type === "application" ? result.name : result.type === "window" ? result.title : result.type === "skill" ? result.name : result.topic; const detail = result.type === "window" ? result.processName : result.type === "skill" ? result.description : result.type === "knowledge" ? "Stored knowledge with provenance" : result.shortcut; return <button type="button" key={`${result.type}-${label}-${index}`} onClick={() => void act(result)} disabled={busy !== null} className="flex w-full items-center justify-between rounded-lg border border-white/5 px-2 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"><span className="min-w-0"><span className="block truncate">{label || "Unnamed result"}</span><span className="block truncate text-[10px] text-slate-500">{result.type} · {detail || ""}</span></span>{icon(result.type)}</button>; })}{query.trim().length >= 2 && !results.length && !message && <div className="text-[11px] text-slate-500">No authorized results found.</div>}</div>
    {message && <div role="status" className="mt-2 flex items-center gap-1 text-[11px] text-cyan-200"><FileSearch size={12} />{message}</div>}
    <div className="mt-2 text-[10px] text-slate-500">Results come from the authenticated Windows bridge and SARA’s existing skill/knowledge stores. No fake entries are generated.</div>
  </section>;
}
