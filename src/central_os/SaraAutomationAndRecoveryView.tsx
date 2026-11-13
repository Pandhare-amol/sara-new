import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FolderKanban,
  Languages,
  Play,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/appApi';

export const SaraAutomationAndRecoveryView: React.FC = () => {
  const [state, setState] = useState<Record<string, any> | null>(null);
  const [checklist, setChecklist] = useState<Record<string, any> | null>(null);
  const [cmdInput, setCmdInput] = useState('SARA, Chrome kholo aur YouTube par search karo latest AI news');
  const [lastReply, setLastReply] = useState<string>('');
  const [folderInput, setFolderInput] = useState('');
  const [fileReport, setFileReport] = useState<Record<string, any> | null>(null);
  const [backupBucket, setBackupBucket] = useState<'daily' | 'weekly' | 'before_updates' | 'recovery_points'>('recovery_points');
  const [backupLabel, setBackupLabel] = useState('manual_stable_checkpoint');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await api.masterAutoState();
      setState(snap);
      if (!folderInput && snap.context?.currentFolder) {
        setFolderInput(snap.context.currentFolder);
      }
    } catch {
      /* ignore */
    }
  }, [folderInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const run17Audit = async () => {
    setBusy('Running live 17/17 SARA AI Project Completion & Automation Audit…');
    try {
      const res = await api.masterAutoVerify17();
      setChecklist(res);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 17/17 LIVE PROJECT COMPLETION TRACKER */}
      <div className="rounded-2xl border border-emerald-400/35 bg-slate-950/95 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
              LIVE AUTOMATION AUDIT • MODULES 1–25
            </div>
            <h3 className="text-base font-bold text-white">
              SARA AI Project Completion Tracker:{' '}
              <span className="text-emerald-300">{checklist?.scoreLabel || 'Ready to Verify (17 Pillars)'}</span>
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run17Audit()}
              disabled={Boolean(busy)}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 px-4 py-2 font-mono text-xs font-bold text-white shadow hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run Live 17/17 Automation Check</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                setBusy('Triggering Emergency Recovery Mode…');
                try {
                  await api.masterAutoEmergency(Boolean(state?.emergencyRecoveryActive));
                  await load();
                } finally {
                  setBusy(null);
                }
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/20 px-3.5 py-2 font-mono text-xs font-bold text-rose-100 cursor-pointer"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{state?.emergencyRecoveryActive ? 'Exit Emergency Mode' : 'Emergency Recovery Mode'}</span>
            </button>
          </div>
        </div>

        {busy && (
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-3 py-2 font-mono text-xs text-cyan-100">
            {busy}
          </div>
        )}

        {checklist?.pillars && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {checklist.pillars.map((p: any) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/45 p-2.5"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold text-white">
                    {p.index}/17 • {p.title}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{p.evidence}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold ${
                    p.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {p.passed ? 'PASS' : 'CHECK'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* UNIFIED HINDI / ENGLISH / HINGLISH VOICE & TEXT ENGINE + SHORT-TERM CONTEXT */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-cyan-400/25 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-cyan-300" />
              <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                Hindi • Hinglish • English Contextual Engine (Online + Offline)
              </h3>
            </div>
            <select
              value={state?.context?.permissionPolicy || 'owner_fast_autonomous'}
              onChange={async (e) => {
                await api.masterAutoPolicy({ permissionPolicy: e.target.value });
                await load();
              }}
              className="rounded-lg border border-white/15 bg-black/60 px-2 py-1 font-mono text-[11px] text-cyan-200"
            >
              <option value="owner_fast_autonomous">Owner Fast Mode (Level 3 Guard)</option>
              <option value="tiered_3_level_confirmation">Strict 3-Level Confirmation</option>
            </select>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              placeholder="e.g. 'SARA, Chrome kholo aur YouTube par search karo latest AI news'"
              className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await api.masterAutoCommand(cmdInput, 'text');
                setLastReply(`${res.spokenReply} [${res.permission?.tier || 'OK'} • ${res.latencyMs ?? 0}ms]`);
                await load();
              }}
              className="rounded-xl bg-cyan-500/25 border border-cyan-400/50 px-4 py-2 font-mono text-xs font-bold text-cyan-100 cursor-pointer"
            >
              Execute
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              'SARA, Chrome kholo',
              'YouTube par jao',
              'Ab AI assistant development search karo',
              'SARA, mera PC slow kyu chal raha hai?',
              'SARA, check your system',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setCmdInput(sample)}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-300 hover:text-white cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>

          {lastReply && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-2.5 font-mono text-xs text-emerald-100">
              {lastReply}
            </div>
          )}

          {/* Live Conversational Reference Context */}
          <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-slate-400">ACTIVE APP</div>
              <div className="truncate text-cyan-200 mt-0.5">{state?.context?.currentApp || '—'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-slate-400">ACTIVE WEBSITE</div>
              <div className="truncate text-cyan-200 mt-0.5">{state?.context?.currentUrl || '—'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-slate-400">MODE</div>
              <div className="truncate text-emerald-300 mt-0.5">
                {state?.context?.operatingMode === 'online_cloud_plus_local' ? 'Online + Local' : 'Offline Ready'}
              </div>
            </div>
          </div>
        </div>

        {/* ADVANCED FILE MANAGEMENT (DUPLICATES & SMART CATEGORY ORGANIZER) */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-cyan-300" />
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Advanced File Manager (SHA-256 Duplicates &amp; Category Organizer)
            </h3>
          </div>
          <input
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder="Target folder path…"
            className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 font-mono text-xs text-white"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await api.masterAutoDuplicates(folderInput);
                setFileReport(r);
              }}
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs text-cyan-100 cursor-pointer"
            >
              Scan SHA-256 Duplicates
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await api.masterAutoOrganize(folderInput, true);
                setFileReport(r);
              }}
              className="rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 font-mono text-xs text-amber-100 cursor-pointer"
            >
              Preview Category Organize (Safe Dry-Run)
            </button>
          </div>
          {fileReport && (
            <pre className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-black/50 p-2.5 font-mono text-[11px] text-slate-200">
              {JSON.stringify(fileReport, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* MODULE 18: STANDALONE RECOVERY, SELF-HEALING & SECRET-SCRUBBED BACKUP ENGINE */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-emerald-300" />
              <h3 className="font-mono text-xs font-bold uppercase text-emerald-300">
                Module 18 — Self-Healing &amp; Recovery Report (&ldquo;SARA, check your system&rdquo;)
              </h3>
            </div>
            <button
              type="button"
              onClick={async () => {
                await api.masterAutoDiagnostics();
                await load();
              }}
              className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-200 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Re-Diagnose</span>
            </button>
          </div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-emerald-400/20 bg-black/60 p-3 font-mono text-xs text-emerald-200">
            {state?.diagnostics?.formatted_report || 'Running diagnostics…'}
          </pre>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-cyan-300" />
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Secret-Scrubbed Versioned Backups &amp; Git Checkpoint
            </h3>
          </div>
          <div className="font-mono text-xs text-slate-300">
            Git Branch:{' '}
            <span className="text-cyan-300">
              {state?.diagnostics?.git?.branch}@{state?.diagnostics?.git?.stable_head}
            </span>{' '}
            • SQLite Integrity:{' '}
            <span className="text-emerald-300">{state?.diagnostics?.database?.integrity || 'ok'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={backupBucket}
              onChange={(e) => setBackupBucket(e.target.value as typeof backupBucket)}
              className="rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-xs text-white"
            >
              <option value="recovery_points">recovery_points/</option>
              <option value="before_updates">before_updates/</option>
              <option value="daily">daily/</option>
              <option value="weekly">weekly/</option>
            </select>
            <input
              type="text"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
            />
            <button
              type="button"
              onClick={async () => {
                setBusy('Creating SHA-256 verified secret-scrubbed backup…');
                try {
                  await api.masterAutoBackup(backupBucket, backupLabel);
                  await load();
                } finally {
                  setBusy(null);
                }
              }}
              className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-1.5 font-mono text-xs font-bold text-cyan-100 cursor-pointer"
            >
              + Create Backup
            </button>
          </div>
          {state?.diagnostics?.latest_backup && (
            <div className="rounded-xl border border-white/10 bg-black/45 p-3 font-mono text-[11px] text-slate-300 space-y-1">
              <div className="flex justify-between text-emerald-300">
                <span>Latest Verified Backup ({state.diagnostics.latest_backup.bucket})</span>
                <span>{state.diagnostics.latest_backup.files_count} files</span>
              </div>
              <div className="truncate text-[10px] text-slate-400">
                SHA-256: {state.diagnostics.latest_backup.sha256}
              </div>
              <div className="text-[10px] text-amber-200">
                Credentials/API keys scrubbed: {state.diagnostics.latest_backup.scrubbed_secrets_count}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaraAutomationAndRecoveryView;
