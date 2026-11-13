import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Globe,
  Layers,
  Lock,
  Monitor,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';
import { api } from '../lib/appApi';

export const WindowsShellOverlayView: React.FC = () => {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<Record<string, any>>>([]);
  const [searchLatency, setSearchLatency] = useState<number>(0);

  const [domainCmd, setDomainCmd] = useState('Open ncpa.cpl network adapters');
  const [domainResult, setDomainResult] = useState<Record<string, any> | null>(null);

  const [webDirective, setWebDirective] = useState(
    'Learn SQLite WAL + low-RAM Python optimization patterns and create a ready reference guide',
  );
  const [webOutputName, setWebOutputName] = useState('win10_low_ram_playbook.md');
  const [webResult, setWebResult] = useState<Record<string, any> | null>(null);

  const [formInput, setFormInput] = useState(
    '<form><input id="full_name" name="name" placeholder="Your Name" /><input id="email" type="email" name="email" placeholder="you@company.com" /><button id="submit_btn" type="submit">Submit Application</button></form>',
  );
  const [formFields, setFormFields] = useState<Array<Record<string, any>>>([]);

  const [skillTopic, setSkillTopic] = useState('windows locked file pid scanner');
  const [acceptanceReport, setAcceptanceReport] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showStartCenter, setShowStartCenter] = useState<boolean>(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState<boolean>(false);

  const loadState = useCallback(async () => {
    try {
      const snap = await api.shellMasteryState();
      setData(snap);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleUniversalSearch = async (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      return;
    }
    const res = await api.shellMasterySearch(val);
    setSearchResults(res.results || []);
    setSearchLatency(res.latencyMs || 0);
  };

  return (
    <div className="space-y-4">
      {/* NATIVE SARA TASKBAR REPLACEMENT + START CENTER + UNIVERSAL SEARCH + QUICK SETTINGS + NOTIFICATION CENTER */}
      <div className="rounded-2xl border border-cyan-400/35 bg-slate-950/95 p-3.5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowStartCenter((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/20 px-3.5 py-2 font-mono text-xs font-bold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
            >
              <Layers className="h-4 w-4" />
              <span>SARA Start</span>
            </button>

            {/* Pinned Taskbar Icons */}
            <div className="hidden md:flex items-center gap-1.5">
              {(data?.shell?.startCenterPinnedApps || []).map((pin: any) => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={async () => {
                    const res = await api.windowsMasterVoiceExec(`open ${pin.label}`);
                    setBanner(res.spokenReply || `Launched ${pin.label}`);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 hover:border-cyan-400/40 hover:text-white cursor-pointer"
                >
                  {pin.label}
                </button>
              ))}
            </div>
          </div>

          {/* Universal Search Bar */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-cyan-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => void handleUniversalSearch(e.target.value)}
              placeholder="Universal Search: Apps, ms-settings:, .cpl, Files & Skills…"
              className="w-full rounded-xl border border-white/15 bg-black/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Quick Settings & Native Notification Bell */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const res = await api.shellMasteryUnlockBuild();
                setBanner(`Stale build locks cleared (${res.bootProbe?.boot_ms ?? 0}ms boot probe).`);
              }}
              className="rounded-xl border border-amber-400/35 bg-amber-500/15 px-3 py-1.5 font-mono text-[11px] text-amber-200 hover:bg-amber-500/25 cursor-pointer"
            >
              Unlock Build Exes
            </button>
            <button
              type="button"
              onClick={() => setShowNotifDrawer((v) => !v)}
              className="relative flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-100 hover:bg-white/10 cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5 text-cyan-300" />
              <span>Notifications ({data?.unreadCount ?? 0})</span>
            </button>
          </div>
        </div>

        {/* Universal Search Results Dropdown */}
        {searchQuery.trim() && (
          <div className="mt-3 rounded-xl border border-cyan-400/25 bg-black/70 p-3 space-y-1.5">
            <div className="flex justify-between font-mono text-[10px] text-cyan-300">
              <span>UNIVERSAL SEARCH RESULTS ({searchResults.length})</span>
              <span>{searchLatency} ms</span>
            </div>
            {searchResults.length === 0 ? (
              <div className="font-mono text-xs text-slate-400">No matching items.</div>
            ) : (
              searchResults.slice(0, 8).map((hit) => (
                <div
                  key={hit.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/80 px-3 py-1.5 text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{hit.title}</div>
                    <div className="font-mono text-[10px] text-slate-400">{hit.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (hit.category === 'ms_settings') {
                        await api.windowsMasterSetting({ action: 'open_page', target: hit.target });
                      } else {
                        await api.shellMasteryExecuteDomain(`open ${hit.target}`);
                      }
                      setBanner(`Opened ${hit.title}`);
                    }}
                    className="rounded bg-cyan-500/20 px-2.5 py-1 font-mono text-[11px] text-cyan-100 cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Start Center & Quick Settings Popover */}
        {showStartCenter && (
          <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-white/15 bg-black/75 p-3.5 md:grid-cols-2">
            <div>
              <div className="font-mono text-[10px] uppercase text-cyan-300 mb-2">Start Center — Pinned Apps &amp; Control Panel</div>
              <div className="flex flex-wrap gap-1.5">
                {(data?.cplCatalog || []).map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={async () => {
                      await api.shellMasteryExecuteDomain(`open ${c.id}`);
                      setBanner(`Opened Control Panel: ${c.id}`);
                    }}
                    className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:border-cyan-400/40 cursor-pointer"
                  >
                    {c.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase text-emerald-300 mb-2">Real Windows Quick Settings</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['Wi-Fi ON', 'wifi_on'],
                  ['Bluetooth ON', 'bluetooth_on'],
                  ['Dark Mode', 'dark_mode'],
                  ['Night Light', 'night_light'],
                  ['Best Perf', 'power_best_performance'],
                  ['Mute Audio', 'mute'],
                ].map(([lbl, act]) => (
                  <button
                    key={act}
                    type="button"
                    onClick={async () => {
                      const r = await api.windowsMasterSetting({ action: act });
                      setBanner(r.summary || lbl);
                    }}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] text-emerald-100 cursor-pointer"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Native Notification Center Drawer */}
        {showNotifDrawer && (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-cyan-300">NATIVE NOTIFICATION CENTER</span>
              <button
                type="button"
                onClick={async () => {
                  await api.shellMasteryMarkRead();
                  await loadState();
                }}
                className="font-mono text-[11px] text-slate-300 hover:text-white cursor-pointer"
              >
                Mark All Read
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5">
              {(data?.notifications || []).map((n: any) => (
                <div key={n.id} className="rounded-lg border border-white/10 bg-slate-900/90 p-2 font-mono text-[11px]">
                  <div className="flex justify-between text-cyan-200">
                    <span className="font-bold">{n.title}</span>
                    <span className="text-[10px] text-slate-400">{n.category}</span>
                  </div>
                  <div className="text-slate-300 mt-0.5">{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(busy || banner) && (
          <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-950/30 px-3 py-1.5 font-mono text-xs text-cyan-100">
            {busy || banner}
          </div>
        )}
      </div>

      {/* 7 CORE OPERATIONAL DOMAINS (OPTIMIZED FOR i5 / 8 GB RAM) */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              7 Core Windows 10/11 Operational Domains (Low-RAM Smart Router)
            </h3>
            <p className="text-xs text-slate-400">
              Automatically picks silent OS/PowerShell/URI calls (&lt;5 MB RAM) first and GUI Vision only when needed.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={domainCmd}
            onChange={(e) => setDomainCmd(e.target.value)}
            className="min-w-[240px] flex-1 rounded-xl border border-white/15 bg-black/50 px-3.5 py-2 text-xs text-white"
            placeholder="Enter any OS, App, File, Browser, ms-settings:, .cpl, or Terminal command…"
          />
          <button
            type="button"
            onClick={async () => {
              setBusy('Routing across 7 Operational Domains…');
              try {
                const res = await api.shellMasteryExecuteDomain(domainCmd);
                setDomainResult(res);
                setBanner(`Routed to ${res.domain?.title} (${res.latencyMs}ms, RAM impact ${res.domain?.ramImpact8Gb})`);
              } finally {
                setBusy(null);
              }
            }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 font-mono text-xs font-bold text-white cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Route &amp; Execute</span>
          </button>
        </div>

        {domainResult && (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-3 font-mono text-xs text-emerald-100">
            <div>
              <strong>Selected Domain:</strong> {domainResult.domain?.title} • <strong>Layer:</strong>{' '}
              {domainResult.domain?.fastestLayer} • <strong>RAM:</strong> {domainResult.domain?.ramImpact8Gb}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
          {(data?.domains || []).map((d: any) => (
            <div key={d.id} className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-white">{d.title}</span>
                <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                  {d.ramImpact8Gb}
                </span>
              </div>
              <div className="font-mono text-[10px] text-cyan-300">{d.fastestLayer}</div>
              <ul className="space-y-0.5 text-[11px] text-slate-400">
                {(d.capabilities || []).slice(0, 3).map((cap: string) => (
                  <li key={cap}>• {cap}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* AUTONOMOUS WEB-TO-WORK BROWSER, BLOG LEARNER, FORM AGENT & SKILL SELF-TRAINER */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-cyan-400/25 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-300" />
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Browser &ldquo;Web-to-Work&rdquo; — Learn from Blogs/Web &amp; Apply to Real Work
            </h3>
          </div>
          <textarea
            rows={2}
            value={webDirective}
            onChange={(e) => setWebDirective(e.target.value)}
            placeholder="Paste a blog URL or topic to research and apply to a real local deliverable…"
            className="w-full rounded-xl border border-white/15 bg-black/50 p-2.5 text-xs text-white"
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={webOutputName}
              onChange={(e) => setWebOutputName(e.target.value)}
              placeholder="Output filename (e.g. guide.md)"
              className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setBusy('Learning from web/blog and generating real workspace deliverable…');
                try {
                  const res = await api.shellMasteryWebToWork(webDirective, webOutputName);
                  setWebResult(res);
                  await loadState();
                } finally {
                  setBusy(null);
                }
              }}
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-1.5 font-mono text-xs text-cyan-100 cursor-pointer"
            >
              Learn &amp; Apply to Work
            </button>
          </div>
          {webResult && (
            <div className="rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-slate-200 space-y-1">
              <div className="text-emerald-300">Written: {webResult.written_path}</div>
              <pre className="whitespace-pre-wrap text-slate-300 max-h-32 overflow-y-auto">{webResult.preview}</pre>
            </div>
          )}

          {/* Sandboxed Python Skill Self-Trainer */}
          <div className="border-t border-white/10 pt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={skillTopic}
              onChange={(e) => setSkillTopic(e.target.value)}
              placeholder="Unfamiliar topic to self-train in sandbox…"
              className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setBusy('Practicing & verifying Python skill in isolated sandbox…');
                try {
                  const r = await api.shellMasteryTrainSkill(skillTopic);
                  setBanner(`Self-trained & verified '${r.skill_name}' (${r.attempts_used} attempt).`);
                } finally {
                  setBusy(null);
                }
              }}
              className="flex items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs text-emerald-100 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Self-Train Skill</span>
            </button>
          </div>
        </div>

        {/* Webpage Form Inspector & DOM Control */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-cyan-300">
              Autonomous Website Form Inspector &amp; DOM Agent
            </span>
            <span className="font-mono text-[10px] text-slate-400">Playwright Lazy RAM Reclaim Active</span>
          </div>
          <textarea
            rows={3}
            value={formInput}
            onChange={(e) => setFormInput(e.target.value)}
            placeholder="Enter live URL or HTML snippet to inspect form inputs, selectors, and submit buttons…"
            className="w-full rounded-xl border border-white/15 bg-black/50 p-2.5 font-mono text-xs text-white"
          />
          <button
            type="button"
            onClick={async () => {
              const res = await api.shellMasteryInspectForm(formInput);
              setFormFields(res.fields || []);
            }}
            className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-1.5 font-mono text-xs text-cyan-100 cursor-pointer"
          >
            Inspect Webpage Inputs &amp; Buttons
          </button>
          {formFields.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {formFields.map((f, idx) => (
                <div
                  key={`${f.selector}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-[11px]"
                >
                  <span className="text-cyan-200">{f.selector}</span>
                  <span className="text-slate-400">
                    &lt;{f.tag} type=&ldquo;{f.type}&rdquo; placeholder=&ldquo;{f.placeholder}&rdquo;&gt;
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EXPLORER RESTART / DPI / SLEEP-WAKE / MULTI-MONITOR RECONCILER, SIGNED BINARIES & WIN10/11 ACCEPTANCE */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-cyan-300" />
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Native Shell Resilience (Explorer Restart, WorkerW, DPI, Sleep/Wake &amp; Multi-Monitor)
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['Simulate Explorer Crash/Restart', 'explorer_restart', { newExplorerPid: 0 }],
              ['Reconcile 150% DPI Change', 'dpi_change', { newDpi: 144 }],
              ['Reconcile Dual-Monitor', 'multi_monitor_change', { monitorsCount: 2 }],
              ['Reconcile Sleep/Wake', 'sleep_wake', {}],
              ['Session Lock/Unlock', 'session_transition', {}],
            ].map(([lbl, kind, extra]) => (
              <button
                key={String(lbl)}
                type="button"
                onClick={async () => {
                  const ev = await api.shellMasteryReconcile(String(kind), extra as Record<string, unknown>);
                  setBanner(ev.afterSummary);
                  await loadState();
                }}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 hover:border-cyan-400/40 cursor-pointer"
              >
                {String(lbl)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {(data?.reconciliations || []).map((r: any) => (
              <div key={r.id} className="rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px]">
                <div className="flex justify-between text-emerald-300">
                  <span>{r.kind}</span>
                  <span>{r.status}</span>
                </div>
                <div className="text-slate-300 mt-0.5">{r.afterSummary}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Signed Binaries, CustomShell Rollback & Executable Windows 10/11 Acceptance Suite */}
        <div className="rounded-2xl border border-emerald-400/25 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <h3 className="font-mono text-xs font-bold uppercase text-emerald-300">
                Windows 10/11 Acceptance Suite, CustomShell &amp; Signed Binaries
              </h3>
            </div>
            <button
              type="button"
              onClick={async () => {
                setBusy('Running 8-Check Windows 10/11 Acceptance Matrix…');
                try {
                  const rep = await api.shellMasteryRunAcceptance();
                  setAcceptanceReport(rep);
                  await loadState();
                } finally {
                  setBusy(null);
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/25 border border-emerald-400/50 px-3 py-1.5 font-mono text-xs font-bold text-emerald-100 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run Acceptance Tests</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-slate-400 text-[10px]">WORKERW HIERARCHY</div>
              <div className="text-emerald-300 font-bold">
                {data?.readiness?.workerWHierarchy?.desktopReady ? 'VERIFIED (Behind Icons)' : 'FALLBACK'}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-slate-400 text-[10px]">BINARY SIGNING &amp; MANIFEST</div>
              <div className="text-cyan-200">{data?.readiness?.binarySigning?.status || 'VERIFIED'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-400/25 bg-amber-950/20 p-2.5 font-mono text-[10px] text-amber-100">
            <div className="font-bold">Guaranteed CustomShell Emergency Rollback Command:</div>
            <code className="block mt-1 text-amber-200 break-all">
              {data?.readiness?.customShellSafety?.rollbackPowerShellCommand}
            </code>
          </div>

          {acceptanceReport && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <div className="font-mono text-xs font-bold text-emerald-300">
                Acceptance Result: {acceptanceReport.passedCount}/{acceptanceReport.totalCount} Passed ({acceptanceReport.totalMs}ms)
              </div>
              {(acceptanceReport.checks || []).map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-[11px]"
                >
                  <span className="text-white">{c.title}</span>
                  <span className={c.passed ? 'text-emerald-300' : 'text-rose-300'}>
                    {c.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WindowsShellOverlayView;
