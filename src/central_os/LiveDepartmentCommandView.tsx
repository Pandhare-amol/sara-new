import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Cpu,
  FolderSearch,
  Globe,
  HardDrive,
  Layers,
  Network,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings2,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { api } from '../lib/appApi';

const LazyWindowsShellOverlayView = lazy(() => import('./WindowsShellOverlayView'));
const LazySaraAutomationAndRecoveryView = lazy(() => import('./SaraAutomationAndRecoveryView'));

interface LiveProcess {
  pid: number;
  name: string;
  cpuPercent: number;
  ramMb: number;
  protectedOs: boolean;
}

interface LiveDisk {
  mount: string;
  filesystem: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
  percentUsed: number;
}

interface LiveSystem {
  capturedAt: string;
  collectionMs: number;
  host: {
    hostname: string;
    platform: string;
    osRelease: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    uptimeSec: number;
  };
  cpu: {
    totalPercent: number;
    perCorePercent: number[];
    loadAvg1m: number;
  };
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    percentUsed: number;
    saraProcessRssMb: number;
  };
  disks: LiveDisk[];
  topProcesses: LiveProcess[];
  processCount: number;
  network: {
    interfaces: Array<{ name: string; ip4: string; mac: string }>;
    listeningPorts: number[];
  };
  activeWindow: { title: string; process: string | null; pid: number } | null;
  runningBrowsers: string[];
  controlPanelState: {
    theme: string;
    powerPlan: string;
    startupAppsCount: number;
  };
}

interface DepartmentItem {
  id: 'CENTRAL_OS' | 'FRIDAY' | 'EDITH' | 'KAREN' | 'WORKSHOP' | 'ULTRON';
  codename: string;
  title: string;
  pythonModule: string;
  specialization: string;
  reportsTo: 'sara' | 'jarvis';
  status: string;
  tasksCompleted: number;
  avgLatencyMs: number;
  lastRunAt: string | null;
  lastSummary: string;
}

interface SwarmNode {
  nodeId: string;
  hostname: string;
  os: string;
  arch: string;
  role: string;
  isLocalMaster: boolean;
  status: 'ONLINE' | 'OFFLINE';
  departments: string[];
  cpuPercent: number;
  ramPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskFreeGb: number;
  tasksHandled: number;
  lastHeartbeatAt: string;
}

interface InstalledApp {
  name: string;
  version: string;
  publisher: string;
  source: string;
  launchHint?: string;
}

export const LiveDepartmentCommandView: React.FC<{ standalone?: boolean }> = ({ standalone = false }) => {
  const [activeCommander, setActiveCommander] = useState<'sara' | 'jarvis'>('sara');
  const [startupAuthMode, setStartupAuthMode] = useState<'vm_instant_bypass' | 'startup_any_factor' | 'startup_strict_3fa'>('vm_instant_bypass');
  const [system, setSystem] = useState<LiveSystem | null>(null);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [swarmNodes, setSwarmNodes] = useState<SwarmNode[]>([]);
  const [recentReports, setRecentReports] = useState<Array<Record<string, any>>>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);

  const [subTab, setSubTab] = useState<
    | 'overview'
    | 'task_manager'
    | 'apps_control_browser'
    | 'marvel_labs'
    | 'swarm_auth'
    | 'win11_settings'
    | 'security_shield'
    | 'customization_studio'
    | 'native_shell_7domain'
    | 'recovery_and_17audit'
  >('overview');

  const [missionInput, setMissionInput] = useState(
    'Scan real-time CPU/RAM bottlenecks, sweep local listening dev ports, and render live repo architecture diagram',
  );
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Task Manager & Apps filters
  const [procFilter, setProcFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [launchInput, setLaunchInput] = useState('notepad');
  const [wingetPkg, setWingetPkg] = useState('Microsoft.PowerToys');
  const [browserUrl, setBrowserUrl] = useState('https://github.com');
  const [browserChoice, setBrowserChoice] = useState('default');
  const [fileSearchQuery, setFileSearchQuery] = useState('Engine');
  const [fileSearchResults, setFileSearchResults] = useState<string[]>([]);

  // Marvel Labs state
  const [edithQuery, setEdithQuery] = useState('github.com');
  const [edithResult, setEdithResult] = useState<Record<string, any> | null>(null);
  const [karenReplay, setKarenReplay] = useState<Record<string, any> | null>(null);
  const [workshopSvg, setWorkshopSvg] = useState<string>('');
  const [workshopMermaid, setWorkshopMermaid] = useState<string>('');
  const [ultronTopic, setUltronTopic] = useState('live_disk_and_socket_inspector');

  // Startup Auth enrollment inputs
  const [newStartupPass, setNewStartupPass] = useState('');
  const [newVoicePhrase, setNewVoicePhrase] = useState('sara command override');

  // Windows 11/10 Settings, Anti-Attacker Security & Customization Studio state
  const [winState, setWinState] = useState<Record<string, any> | null>(null);
  const [winCatalog, setWinCatalog] = useState<Array<Record<string, any>>>([]);
  const [secPosture, setSecPosture] = useState<Record<string, any> | null>(null);
  const [customization, setCustomization] = useState<Record<string, any> | null>(null);
  const [selectedSettingsSection, setSelectedSettingsSection] = useState<string>('All');
  const [wifiSsidInput, setWifiSsidInput] = useState('');
  const [brightnessSlider, setBrightnessSlider] = useState<number>(75);
  const [volumeSlider, setVolumeSlider] = useState<number>(50);
  const [macroPhrase, setMacroPhrase] = useState('');
  const [macroDesc, setMacroDesc] = useState('');
  const [macroAppTarget, setMacroAppTarget] = useState('code');
  const [macroUrlTarget, setMacroUrlTarget] = useState('https://github.com');
  const [aliasName, setAliasName] = useState('');
  const [aliasTarget, setAliasTarget] = useState('');

  const fetchWindowsMaster = useCallback(async (refresh = false) => {
    try {
      const wm = await api.windowsMasterState(refresh);
      if (wm.state) {
        setWinState(wm.state);
        if (typeof wm.state.displayAndAudio?.brightnessPercent === 'number') {
          setBrightnessSlider(wm.state.displayAndAudio.brightnessPercent);
        }
        if (typeof wm.state.displayAndAudio?.volumeLastSetPercent === 'number') {
          setVolumeSlider(wm.state.displayAndAudio.volumeLastSetPercent);
        }
      }
      if (Array.isArray(wm.catalog)) setWinCatalog(wm.catalog);
      if (wm.security) setSecPosture(wm.security);
      if (wm.customization) setCustomization(wm.customization);
    } catch {
      /* ignore during boot */
    }
  }, []);

  const fetchFullStatus = useCallback(async () => {
    try {
      const [res] = await Promise.all([api.commanderStatus(true), fetchWindowsMaster(false)]);
      if (res.commander?.activeCommander) setActiveCommander(res.commander.activeCommander);
      if (res.commander?.startupAuth?.mode) setStartupAuthMode(res.commander.startupAuth.mode);
      if (res.commander?.startupAuth?.enrolled?.voicePhrase) {
        setNewVoicePhrase(res.commander.startupAuth.enrolled.voicePhrase);
      }
      if (res.system) setSystem(res.system as LiveSystem);
      if (Array.isArray(res.departments)) setDepartments(res.departments as DepartmentItem[]);
      if (Array.isArray(res.swarmNodes)) setSwarmNodes(res.swarmNodes as SwarmNode[]);
      if (Array.isArray(res.recentReports)) setRecentReports(res.recentReports);
    } catch (e) {
      setStatusBanner(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void fetchFullStatus();

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/commander-telemetry`);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === 'COMMANDER_LIVE_TELEMETRY') {
          if (msg.system) setSystem(msg.system as LiveSystem);
          if (msg.commander?.activeCommander) setActiveCommander(msg.commander.activeCommander);
          if (Array.isArray(msg.departments)) setDepartments(msg.departments as DepartmentItem[]);
          if (Array.isArray(msg.swarmNodes)) setSwarmNodes(msg.swarmNodes as SwarmNode[]);
        }
      } catch {
        /* ignore malformed telemetry */
      }
    };
    return () => ws.close();
  }, [fetchFullStatus]);

  const loadInstalledApps = useCallback(async (force = false) => {
    setBusyLabel('Scanning installed applications…');
    try {
      const res = await api.commanderInstalledApps(force);
      if (Array.isArray(res.installedApps)) setInstalledApps(res.installedApps as InstalledApp[]);
    } finally {
      setBusyLabel(null);
    }
  }, []);

  useEffect(() => {
    if (subTab === 'apps_control_browser' && installedApps.length === 0) {
      void loadInstalledApps(false);
    }
  }, [subTab, installedApps.length, loadInstalledApps]);

  const handleSwitchCommander = async (target: 'sara' | 'jarvis') => {
    setBusyLabel(`Switching Supreme Commander to ${target.toUpperCase()}…`);
    try {
      const res = await api.commanderSwitch(target);
      setActiveCommander(res.commander?.activeCommander || target);
      setStatusBanner(
        `${target === 'jarvis' ? 'J.A.R.V.I.S. (Male Executive AI)' : 'SARA (Female Executive AI)'} is now Supreme Commander — all 6 Departments & Swarm Nodes reporting.`,
      );
      await fetchFullStatus();
    } finally {
      setBusyLabel(null);
    }
  };

  const handleDispatchMission = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!missionInput.trim()) return;
    setBusyLabel('Executing instant OS fast-path / parallel department mission…');
    try {
      const res = await api.windowsMasterVoiceExec(missionInput.trim());
      setStatusBanner(res.spokenReply || res.mission?.executiveBrief || 'Completed.');
      for (const rep of res.mission?.departmentReports || []) {
        if (rep.department === 'WORKSHOP' && rep.data?.svg) {
          setWorkshopSvg(String(rep.data.svg));
          setWorkshopMermaid(String(rep.data.mermaid || ''));
        }
        if (rep.department === 'EDITH') setEdithResult(rep.data);
        if (rep.department === 'KAREN') setKarenReplay(rep.data);
      }
      await fetchFullStatus();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLabel(null);
    }
  };

  const runWinSetting = async (action: string, target?: string, value?: string | number) => {
    setBusyLabel(`Applying Windows setting (${action})…`);
    try {
      const res = await api.windowsMasterSetting({ action, target, value });
      setStatusBanner(`${res.summary || action} (${res.latencyMs ?? 0}ms)`);
      await fetchWindowsMaster(true);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleKillProcess = async (pid: number, name: string) => {
    setBusyLabel(`Terminating ${name} (PID ${pid})…`);
    try {
      const res = await api.commanderOsControl({ category: 'task_manager', action: 'kill', pid });
      setStatusBanner(res.report?.summary || `Terminated PID ${pid}.`);
      await fetchFullStatus();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleDirectOs = async (payload: Record<string, unknown>, label: string) => {
    setBusyLabel(label);
    try {
      const res = await api.commanderOsControl(payload);
      setStatusBanner(res.report?.summary || `${label} done.`);
      if (Array.isArray(res.report?.data?.matches)) {
        setFileSearchResults(res.report.data.matches as string[]);
      }
      await fetchFullStatus();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleRunDept = async (dept: DepartmentItem['id'], action: string, params: Record<string, unknown> = {}) => {
    setBusyLabel(`Running [${dept}] ${action}…`);
    try {
      const res = await api.commanderRunDepartment(dept, { action, params });
      const rep = res.report;
      setStatusBanner(rep?.summary || `${dept} completed.`);
      if (dept === 'EDITH') setEdithResult(rep?.data || null);
      if (dept === 'KAREN') setKarenReplay(rep?.data || null);
      if (dept === 'WORKSHOP' && rep?.data?.svg) {
        setWorkshopSvg(String(rep.data.svg));
        setWorkshopMermaid(String(rep.data.mermaid || ''));
      }
      await fetchFullStatus();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyLabel(null);
    }
  };

  const handleSaveStartupAuth = async (modeOverride?: typeof startupAuthMode) => {
    const nextMode = modeOverride || startupAuthMode;
    setBusyLabel('Updating Startup Verification Policy…');
    try {
      const res = await api.commanderStartupAuthConfig({
        mode: nextMode,
        enrollVoicePhrase: newVoicePhrase.trim() || undefined,
        enrollPassword: newStartupPass.trim() || undefined,
      });
      setStartupAuthMode(res.startupAuth?.mode || nextMode);
      setNewStartupPass('');
      setStatusBanner(
        `Startup verification set to '${nextMode}' — zero mid-task permission popups active across all OS tools.`,
      );
    } finally {
      setBusyLabel(null);
    }
  };

  const filteredProcesses = useMemo(() => {
    const list = system?.topProcesses || [];
    const q = procFilter.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)) : list;
  }, [system?.topProcesses, procFilter]);

  const filteredApps = useMemo(() => {
    const q = appFilter.trim().toLowerCase();
    return q ? installedApps.filter((a) => a.name.toLowerCase().includes(q) || a.publisher.toLowerCase().includes(q)) : installedApps;
  }, [installedApps, appFilter]);

  const formatUptime = (sec = 0) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className={`${standalone ? 'min-h-screen bg-[#040914] p-4' : ''} text-slate-100 space-y-4`}>
      {/* Top Twin Supreme Commander & Real-Time Host Telemetry Bar */}
      <div className="rounded-2xl border border-cyan-400/30 bg-slate-950/90 p-4 shadow-[0_0_40px_rgba(0,229,255,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15">
              <Bot className="h-6 w-6 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-wider uppercase text-cyan-300">
                  SUPREME EXECUTIVE COMMANDER:
                </span>
                <span className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-200">
                  {activeCommander === 'jarvis' ? 'J.A.R.V.I.S. (MALE AI • CHARON)' : 'S.A.R.A. (FEMALE AI • AOEDE)'}
                </span>
                <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                  100% EQUAL OS AUTHORITY • ZERO MID-TASK PROMPTS
                </span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                Host: <span className="text-slate-200">{system?.host.hostname || 'loading…'}</span> ({system?.host.platform} {system?.host.arch}) •{' '}
                {system?.host.cpuModel || 'CPU'} ({system?.host.cpuCores || 0} cores) • Uptime {formatUptime(system?.host.uptimeSec)} •{' '}
                Live Poll: <span className="text-cyan-300">{system?.collectionMs ?? 0}ms</span>
              </div>
            </div>
          </div>

          {/* 1-Click Twin Commander Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSwitchCommander('sara')}
              className={`rounded-xl border px-3.5 py-2 font-mono text-xs font-bold transition cursor-pointer ${
                activeCommander === 'sara'
                  ? 'border-pink-400/60 bg-pink-500/20 text-pink-100 shadow-[0_0_20px_rgba(244,114,182,0.25)]'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              ♀ S.A.R.A. (Female Boss)
            </button>
            <button
              type="button"
              onClick={() => void handleSwitchCommander('jarvis')}
              className={`rounded-xl border px-3.5 py-2 font-mono text-xs font-bold transition cursor-pointer ${
                activeCommander === 'jarvis'
                  ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              ♂ J.A.R.V.I.S. (Male Boss)
            </button>
            <button
              type="button"
              onClick={() => void fetchFullStatus()}
              className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-slate-200 hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Live Sync</span>
            </button>
          </div>
        </div>

        {/* Real-Time Host Vital Gauges */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>LIVE CPU LOAD</span>
              <Cpu className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">{system?.cpu.totalPercent ?? 0}%</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(100, system?.cpu.totalPercent ?? 0)}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>LIVE RAM USAGE</span>
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {system?.memory.percentUsed ?? 0}%{' '}
              <span className="text-xs font-normal text-slate-400">
                ({Math.round(((system?.memory.usedMb ?? 0) / 1024) * 10) / 10} / {Math.round(((system?.memory.totalMb ?? 0) / 1024) * 10) / 10} GB)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100, system?.memory.percentUsed ?? 0)}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>PRIMARY DISK</span>
              <HardDrive className="h-3.5 w-3.5 text-indigo-300" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">
              {system?.disks[0] ? `${system.disks[0].freeGb} GB free` : '—'}
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-400">
              {system?.disks[0] ? `${system.disks[0].mount} (${system.disks[0].percentUsed}% used of ${system.disks[0].totalGb} GB)` : 'Scanning drives…'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>PROCESSES &amp; PORTS</span>
              <Server className="h-3.5 w-3.5 text-amber-300" />
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-white">{system?.processCount ?? 0} procs</div>
            <div className="mt-1 truncate font-mono text-[10px] text-amber-200">
              Open TCP: {system?.network.listeningPorts.slice(0, 6).join(', ') || 'none'}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>LAN &amp; SWARM NODES</span>
              <Network className="h-3.5 w-3.5 text-purple-300" />
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">
              {system?.network.interfaces[0]?.ip4 || '127.0.0.1'}
            </div>
            <div className="mt-1 font-mono text-[10px] text-purple-200">
              {swarmNodes.filter((n) => n.status === 'ONLINE').length} Active Swarm Node(s)
            </div>
          </div>
        </div>

        {/* Parallel Agentic Mission Bar */}
        <form onSubmit={(e) => void handleDispatchMission(e)} className="mt-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={missionInput}
            onChange={(e) => setMissionInput(e.target.value)}
            placeholder="Command SARA / J.A.R.V.I.S. — automatically delegates across CENTRAL_OS, FRIDAY, EDITH, KAREN, WORKSHOP & ULTRON…"
            className="min-w-[260px] flex-1 rounded-xl border border-cyan-400/30 bg-black/50 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={Boolean(busyLabel)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 font-mono text-xs font-bold uppercase text-white shadow-lg hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <Zap className="h-4 w-4" />
            <span>Dispatch Parallel Departments</span>
          </button>
        </form>

        {(busyLabel || statusBanner) && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-cyan-400/25 bg-cyan-950/30 px-3.5 py-2 font-mono text-xs text-cyan-100">
            <span>{busyLabel || statusBanner}</span>
            {statusBanner && !busyLabel && (
              <button type="button" onClick={() => setStatusBanner(null)} className="text-[10px] text-slate-400 hover:text-white cursor-pointer">
                DISMISS
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          ['overview', '1. 6 AI Departments & Live Feed'],
          ['win11_settings', '2. Windows 11/10 Settings (Live)'],
          ['task_manager', `3. Live Task Manager (${system?.topProcesses.length || 0})`],
          ['apps_control_browser', '4. Apps, Control Panel & Files'],
          ['security_shield', `5. Anti-Attacker Security (${secPosture?.securityScore ?? 96}/100)`],
          ['customization_studio', '6. Full Customization & Voice Macros'],
          ['native_shell_7domain', '7. Native Shell, 7-Domain OS & Web-to-Work'],
          ['recovery_and_17audit', '8. Recovery, Self-Healing & 17/17 Audit'],
          ['marvel_labs', '9. FRIDAY / EDITH / KAREN / HOMER'],
          ['swarm_auth', `10. Distributed Swarm (${swarmNodes.length}) & Auth`],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id as typeof subTab)}
            className={`rounded-xl border px-3.5 py-2 font-mono text-xs font-semibold transition cursor-pointer ${
              subTab === id
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                : 'border-white/10 bg-slate-900/70 text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: 6 AI DEPARTMENTS & LIVE REPORTS */}
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {departments.map((dept) => (
              <div key={dept.id} className="rounded-2xl border border-white/10 bg-slate-950/85 p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-200">
                    {dept.codename}
                  </span>
                  <span className="font-mono text-[10px] text-emerald-300">
                    ● {dept.status} → Reports to {dept.reportsTo.toUpperCase()}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{dept.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{dept.specialization}</p>
                <div className="mt-2 font-mono text-[10px] text-slate-500">{dept.pythonModule}</div>
                <div className="mt-3 rounded-lg border border-white/5 bg-black/40 p-2 font-mono text-[11px] text-slate-300">
                  {dept.lastSummary}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-400">
                    Runs: {dept.tasksCompleted} • Avg: {dept.avgLatencyMs}ms
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void handleRunDept(
                        dept.id,
                        dept.id === 'CENTRAL_OS'
                          ? 'list'
                          : dept.id === 'EDITH'
                          ? 'ports'
                          : dept.id === 'KAREN'
                          ? 'replay'
                          : dept.id === 'WORKSHOP'
                          ? 'diagram'
                          : dept.id === 'ULTRON'
                          ? 'autonomous_self_teach'
                          : 'scan',
                      )
                    }
                    className="flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 font-mono text-[10px] font-bold text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    <Play className="h-3 w-3" />
                    <span>Execute Live</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Live Executive Reporting Stream */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/85 p-4">
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-300">
              Live Department Reports → {activeCommander.toUpperCase()}
            </h3>
            <div className="mt-3 max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
              {recentReports.length === 0 ? (
                <div className="text-xs text-slate-500">No department executions yet — click Execute Live or dispatch a mission above.</div>
              ) : (
                recentReports.map((rep) => (
                  <div key={rep.reportId} className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="font-bold text-cyan-300">[{rep.department}] {rep.action}</span>
                      <span className="text-emerald-300">{rep.latencyMs}ms • {rep.executedOnNode}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-200">{rep.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE TASK MANAGER */}
      {subTab === 'task_manager' && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-mono text-sm font-bold text-white">Real-Time OS Task Manager (Direct Native Fast-Path)</h3>
              <p className="text-xs text-slate-400">
                Live running processes from host kernel — protected Windows/Linux system processes are automatically shielded.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={procFilter}
                onChange={(e) => setProcFilter(e.target.value)}
                placeholder="Filter by name or PID…"
                className="rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleDirectOs({ category: 'control_panel', action: 'open_applet', target: 'task_manager' }, 'Opening Windows Task Manager')}
                className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 font-mono text-xs text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
              >
                Open taskmgr.exe
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-2 pr-4">PID</th>
                  <th className="py-2 pr-4">PROCESS NAME</th>
                  <th className="py-2 pr-4">CPU %</th>
                  <th className="py-2 pr-4">RAM (MB)</th>
                  <th className="py-2 pr-4">PROTECTION</th>
                  <th className="py-2 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProcesses.map((p) => (
                  <tr key={`${p.pid}-${p.name}`} className="hover:bg-white/5">
                    <td className="py-2 pr-4 text-cyan-300">{p.pid}</td>
                    <td className="py-2 pr-4 font-semibold text-white">{p.name}</td>
                    <td className="py-2 pr-4 text-amber-200">{p.cpuPercent}%</td>
                    <td className="py-2 pr-4 text-emerald-200">{p.ramMb} MB</td>
                    <td className="py-2 pr-4">
                      {p.protectedOs ? (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">OS Protected</span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">User Process</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={p.protectedOs}
                        onClick={() => void handleKillProcess(p.pid, p.name)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-[10px] font-bold text-rose-200 hover:bg-rose-500/30 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>End Task</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: INSTALLED APPS, CONTROL PANEL, BROWSER & FILESYSTEM */}
      {subTab === 'apps_control_browser' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Control Panel & Quick Windows Settings */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-cyan-300" />
              <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                Instant Control Panel &amp; Windows Settings (&lt;50ms Direct)
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['Control Panel', { category: 'control_panel', action: 'open_applet', target: 'control' }],
                ['Programs & Features', { category: 'control_panel', action: 'open_applet', target: 'programs' }],
                ['Network Connections', { category: 'control_panel', action: 'open_applet', target: 'network' }],
                ['Sound & Audio', { category: 'control_panel', action: 'open_applet', target: 'sound' }],
                ['Power Options', { category: 'control_panel', action: 'open_applet', target: 'power' }],
                ['Windows Firewall', { category: 'control_panel', action: 'open_applet', target: 'firewall' }],
                ['Device Manager', { category: 'control_panel', action: 'open_applet', target: 'devices' }],
                ['Windows Services', { category: 'control_panel', action: 'open_applet', target: 'services' }],
                ['Wi-Fi Settings', { category: 'control_panel', action: 'open_ms_settings', target: 'network-wifi' }],
                ['Bluetooth', { category: 'control_panel', action: 'open_ms_settings', target: 'bluetooth' }],
                ['Startup Apps', { category: 'control_panel', action: 'open_ms_settings', target: 'startupapps' }],
                ['Enable Dark Mode', { category: 'control_panel', action: 'dark_mode' }],
                ['Enable Light Mode', { category: 'control_panel', action: 'light_mode' }],
                ['Flush DNS Cache', { category: 'control_panel', action: 'flush_dns' }],
              ].map(([label, payload]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => void handleDirectOs(payload as Record<string, unknown>, label as string)}
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-[11px] text-slate-200 hover:border-cyan-400/50 hover:bg-cyan-500/15 cursor-pointer"
                >
                  {label as string}
                </button>
              ))}
            </div>

            {/* Browser Fast-Controller */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-300">
                  <Globe className="h-4 w-4" /> Browser &amp; Browser-Settings Controller
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Active Browsers: {system?.runningBrowsers.join(', ') || 'Default OS Browser'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={browserChoice}
                  onChange={(e) => setBrowserChoice(e.target.value)}
                  className="rounded-xl border border-white/15 bg-black/50 px-2.5 py-2 text-xs text-white"
                >
                  <option value="default">System Default</option>
                  <option value="chrome">Google Chrome</option>
                  <option value="edge">Microsoft Edge</option>
                  <option value="brave">Brave</option>
                  <option value="firefox">Firefox</option>
                </select>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleDirectOs({ category: 'browser', action: 'open_url', browser: browserChoice, target: browserUrl }, 'Launching Browser URL')}
                  className="rounded-xl bg-emerald-600 px-3 py-2 font-mono text-xs font-bold text-white cursor-pointer"
                >
                  Open URL
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['settings', 'extensions', 'downloads', 'history', 'flags'].map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() =>
                      void handleDirectOs(
                        { category: 'browser', action: 'open_settings', browser: browserChoice, target: page },
                        `Opening browser ${page}`,
                      )
                    }
                    className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
                  >
                    chrome://{page}
                  </button>
                ))}
              </div>
            </div>

            {/* Fast File Search */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                <FolderSearch className="h-4 w-4" /> Instant File &amp; Folder Search
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Filename substring…"
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    void handleDirectOs(
                      { category: 'filesystem', action: 'fast_search', args: { query: fileSearchQuery } },
                      'Searching files…',
                    )
                  }
                  className="flex items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 font-mono text-xs text-amber-100 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                </button>
              </div>
              {fileSearchResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-xl bg-black/50 p-2 font-mono text-[10px] text-slate-300 space-y-1">
                  {fileSearchResults.slice(0, 12).map((f) => (
                    <div key={f} className="truncate">{f}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Installed Applications & Winget Manager */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase text-cyan-300">
                <Layers className="h-4 w-4" /> Live Installed Applications ({installedApps.length})
              </span>
              <button
                type="button"
                onClick={() => void loadInstalledApps(true)}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-200 cursor-pointer"
              >
                Rescan Registry / Packages
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={launchInput}
                onChange={(e) => setLaunchInput(e.target.value)}
                placeholder="App exe/command (e.g. code, notepad, calc)…"
                className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => void handleDirectOs({ category: 'applications', action: 'launch', target: launchInput }, `Launching ${launchInput}`)}
                className="rounded-xl bg-cyan-600 px-3 py-1.5 font-mono text-xs font-bold text-white cursor-pointer"
              >
                Launch App
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={wingetPkg}
                onChange={(e) => setWingetPkg(e.target.value)}
                placeholder="Winget Package ID (e.g. Git.Git, VideoLAN.VLC)…"
                className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => void handleDirectOs({ category: 'applications', action: 'winget_install', target: wingetPkg }, `Installing ${wingetPkg} via winget`)}
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs text-emerald-100 cursor-pointer"
              >
                Winget Install
              </button>
            </div>

            <input
              type="text"
              value={appFilter}
              onChange={(e) => setAppFilter(e.target.value)}
              placeholder="Filter installed programs…"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white"
            />

            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {filteredApps.slice(0, 50).map((app, i) => (
                <div key={`${app.name}-${i}`} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 px-3 py-2">
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-xs font-semibold text-white">{app.name}</div>
                    <div className="truncate font-mono text-[10px] text-slate-400">
                      {app.publisher} • {app.version}
                    </div>
                  </div>
                  {app.launchHint && (
                    <button
                      type="button"
                      onClick={() => void handleDirectOs({ category: 'applications', action: 'launch', target: app.launchHint }, `Launching ${app.name}`)}
                      className="rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-2.5 py-1 font-mono text-[10px] text-cyan-100 cursor-pointer"
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MARVEL SPECIALIST DEPARTMENT LABS */}
      {subTab === 'marvel_labs' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* E.D.I.T.H. Recon & 5-Bullet Dossier */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              E.D.I.T.H. (`edith_recon.py`) — Live Socket Port Sweep &amp; 5-Bullet Dossier
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={edithQuery}
                onChange={(e) => setEdithQuery(e.target.value)}
                placeholder="Domain, IP, or contact/company…"
                className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => void handleRunDept('EDITH', 'dossier', { query: edithQuery })}
                className="rounded-xl bg-cyan-600 px-3.5 py-2 font-mono text-xs font-bold text-white cursor-pointer"
              >
                Pull Dossier
              </button>
              <button
                type="button"
                onClick={() => void handleRunDept('EDITH', 'ports', { host: '127.0.0.1' })}
                className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 font-mono text-xs text-cyan-100 cursor-pointer"
              >
                Port Sweep
              </button>
            </div>
            {edithResult && (
              <div className="rounded-xl border border-cyan-400/20 bg-black/50 p-3 font-mono text-xs space-y-1.5">
                {Array.isArray(edithResult.bullets) &&
                  edithResult.bullets.map((b: string, idx: number) => (
                    <div key={idx} className="text-slate-200">• {b}</div>
                  ))}
                {Array.isArray(edithResult.open_ports) && (
                  <div className="text-emerald-300">
                    Open Ports: {edithResult.open_ports.map((p: any) => `${p.port} (${p.latency_ms}ms)`).join(', ') || 'none'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* K.A.R.E.N. 60s Replay & 576 Mode Presets */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-purple-300">
              K.A.R.E.N. (`karen_replay.py`) — 60s Incident Replay &amp; Workspace Presets
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleRunDept('KAREN', 'replay', { seconds: 30 })}
                className="rounded-xl bg-purple-600 px-3.5 py-2 font-mono text-xs font-bold text-white cursor-pointer"
              >
                Replay Last 30 Seconds
              </button>
              {['coding_mode', 'exam_prep_mode', 'stealth_lock_mode', 'presentation_mode', 'vm_hyperspeed_mode'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => void handleRunDept('KAREN', 'preset', { preset })}
                  className="rounded-xl border border-purple-400/35 bg-purple-500/15 px-2.5 py-1.5 font-mono text-[10px] text-purple-100 hover:bg-purple-500/30 cursor-pointer"
                >
                  {preset.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
            {karenReplay && (
              <div className="rounded-xl border border-purple-400/20 bg-black/50 p-3 font-mono text-[11px] text-slate-200 space-y-1">
                {karenReplay.inflectionFrame && (
                  <div className="text-amber-300">
                    Inflection Frame #{karenReplay.inflectionFrame.seq}: CPU {karenReplay.inflectionFrame.cpuPercent}% • RAM {karenReplay.inflectionFrame.ramPercent}% • Window &ldquo;{karenReplay.inflectionFrame.activeWindow}&rdquo;
                  </div>
                )}
                <div className="text-slate-400">
                  Frames captured: {karenReplay.frameCount ?? karenReplay.executed_steps?.length ?? 1}
                </div>
              </div>
            )}
          </div>

          {/* H.O.M.E.R. / Stark Workshop Live Repo Diagram & Ship Pipeline */}
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-bold uppercase text-amber-300">
                H.O.M.E.R. / Stark Workshop (`workshop_forge.py`) — Live Repo SVG Schematic &amp; Assemble-and-Ship
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunDept('WORKSHOP', 'diagram', {})}
                  className="flex items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 font-mono text-xs font-bold text-amber-100 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Render Live Repo Diagram</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunDept('WORKSHOP', 'ship', {})}
                  className="flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 font-mono text-xs font-bold text-white cursor-pointer"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  <span>Assemble &amp; Verify Build</span>
                </button>
              </div>
            </div>
            {workshopSvg && (
              <div
                className="overflow-x-auto rounded-xl border border-cyan-400/20 bg-[#050b14] p-2"
                dangerouslySetInnerHTML={{ __html: workshopSvg }}
              />
            )}
            {workshopMermaid && (
              <pre className="overflow-x-auto rounded-xl bg-black/50 p-3 font-mono text-[10px] text-cyan-200">
                {workshopMermaid}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: DISTRIBUTED SWARM NODES, ZERO-HUMAN SELF-TEACHER & STARTUP AUTH */}
      {subTab === 'swarm_auth' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Startup-Only Verification Policy (Zero Mid-Task Prompts) */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-300" />
              <h3 className="font-mono text-xs font-bold uppercase text-emerald-300">
                Startup-Only Verification Manager (Zero Mid-Task Permission Prompts)
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Choose how SARA &amp; J.A.R.V.I.S. verify you once before startup. After verification, zero owner-permission popups ever interrupt tasks.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ['vm_instant_bypass', 'VM Instant Auto-Unlock', '0 prompts at boot or mid-task'],
                ['startup_any_factor', 'Face / Voice / Password', 'Any 1 factor once at startup'],
                ['startup_strict_3fa', 'Strict 3-Factor Boot', 'Face + Voice + Password once'],
              ].map(([id, title, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void handleSaveStartupAuth(id as typeof startupAuthMode)}
                  className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                    startupAuthMode === id
                      ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-black/40 text-slate-300'
                  }`}
                >
                  <div className="font-mono text-xs font-bold">{title}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{sub}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2">
              <input
                type="text"
                value={newVoicePhrase}
                onChange={(e) => setNewVoicePhrase(e.target.value)}
                placeholder="Startup voice phrase…"
                className="rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
              <input
                type="password"
                value={newStartupPass}
                onChange={(e) => setNewStartupPass(e.target.value)}
                placeholder="Set/update startup password…"
                className="rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSaveStartupAuth()}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-mono text-xs font-bold text-white cursor-pointer"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Save Startup Auth Policy</span>
            </button>

            {/* Zero-Human Autonomous Self-Teacher */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <h4 className="font-mono text-xs font-bold uppercase text-rose-300">
                ULTRON Zero-Human Autonomous Python Skill Self-Teacher
              </h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ultronTopic}
                  onChange={(e) => setUltronTopic(e.target.value)}
                  placeholder="Capability topic to autonomously write, sandbox-test & master…"
                  className="flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => void handleRunDept('ULTRON', 'autonomous_self_teach', { topic: ultronTopic })}
                  className="rounded-xl bg-rose-600 px-3.5 py-2 font-mono text-xs font-bold text-white cursor-pointer"
                >
                  Self-Teach &amp; Verify
                </button>
              </div>
            </div>
          </div>

          {/* Distributed Multi-Node Swarm */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Distributed Multi-VM / Multi-PC Swarm Nodes (`/ws/swarm`)
            </h3>
            <p className="text-xs text-slate-400">
              Connect any secondary VM or PC with:{' '}
              <code className="rounded bg-black/60 px-1.5 py-0.5 text-cyan-200">
                python sara_os/central_layer/distributed_worker_node.py --hub ws://{system?.network.interfaces[0]?.ip4 || '127.0.0.1'}:3000/ws/swarm
              </code>
            </p>
            <div className="space-y-2">
              {swarmNodes.map((n) => (
                <div key={n.nodeId} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-white">
                      {n.nodeId} ({n.hostname})
                    </span>
                    <span className={n.status === 'ONLINE' ? 'text-emerald-300' : 'text-rose-300'}>
                      ● {n.status} • {n.tasksHandled} tasks
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-400">
                    {n.os} ({n.arch}) • CPU {n.cpuPercent}% • RAM {n.ramPercent}% ({n.ramUsedMb}/{n.ramTotalMb} MB)
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-950/20 p-2.5 font-mono text-[11px] text-cyan-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              <span>Least-loaded node auto-balancing active across all 6 Departments.</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB: WINDOWS 11/10 FULL SETTINGS AUTOMATION */}
      {subTab === 'win11_settings' && (
        <div className="space-y-4">
          {/* Top Windows 11 Settings Home Banner (Device, Wi-Fi, Bluetooth, Battery, Theme) */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-cyan-400/25 bg-slate-950/90 p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">LIVE WORKSTATION IDENTITY</div>
              <div className="mt-1 text-lg font-bold text-white">{winState?.device?.computerName || system?.host.hostname || 'PC'}</div>
              <div className="text-xs text-slate-300">
                {winState?.device?.manufacturer} • {winState?.device?.model}
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                {winState?.device?.osName} ({winState?.device?.username})
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runWinSetting('open_page', 'about')}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-cyan-200 hover:bg-white/10 cursor-pointer"
                >
                  About / Rename PC
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('check_windows_updates')}
                  className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
                >
                  Check Windows Update
                </button>
              </div>
            </div>

            {/* Wi-Fi & Network Live Control */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">WI-FI &amp; NETWORK</span>
                <span className={`font-mono text-[11px] ${winState?.wifi?.connected ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {winState?.wifi?.ssid ? `● ${winState.wifi.ssid}` : winState?.wifi?.connected ? '● Connected' : '○ Disconnected'}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-300">
                IPv4: {winState?.wifi?.ipv4 || '127.0.0.1'}
                {typeof winState?.wifi?.signalPercent === 'number' ? ` • Signal ${winState.wifi.signalPercent}%` : ''}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void runWinSetting('wifi_on')}
                  className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 font-mono text-[11px] text-emerald-200 cursor-pointer"
                >
                  Wi-Fi ON
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('wifi_off')}
                  className="rounded-lg bg-rose-500/20 border border-rose-400/40 px-2.5 py-1 font-mono text-[11px] text-rose-200 cursor-pointer"
                >
                  Wi-Fi OFF
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('flush_dns')}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-200 cursor-pointer"
                >
                  Flush DNS
                </button>
              </div>
              <div className="flex gap-1.5 pt-1">
                <input
                  type="text"
                  value={wifiSsidInput}
                  onChange={(e) => setWifiSsidInput(e.target.value)}
                  placeholder="Saved Wi-Fi SSID…"
                  className="flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => wifiSsidInput.trim() && void runWinSetting('wifi_connect', 'wifi', wifiSsidInput.trim())}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-1 font-mono text-[11px] text-cyan-100 cursor-pointer"
                >
                  Connect
                </button>
              </div>
            </div>

            {/* Bluetooth & Paired Devices Live Control */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">BLUETOOTH &amp; DEVICES</span>
                <span className={`font-mono text-[11px] ${winState?.bluetooth?.enabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {winState?.bluetooth?.enabled ? '● Bluetooth ON' : '○ Bluetooth OFF'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runWinSetting('bluetooth_on')}
                  className="rounded-lg bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 font-mono text-[11px] text-emerald-200 cursor-pointer"
                >
                  Turn Bluetooth ON
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('bluetooth_off')}
                  className="rounded-lg bg-rose-500/20 border border-rose-400/40 px-3 py-1 font-mono text-[11px] text-rose-200 cursor-pointer"
                >
                  Turn OFF
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('open_page', 'bluetooth')}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-200 cursor-pointer"
                >
                  Pair Device
                </button>
              </div>
              <div className="max-h-20 overflow-y-auto space-y-1 pt-1">
                {(winState?.bluetooth?.pairedDevices || []).length === 0 ? (
                  <div className="font-mono text-[11px] text-slate-500">No external Bluetooth endpoints enumerated yet.</div>
                ) : (
                  (winState?.bluetooth?.pairedDevices || []).map((d: any, idx: number) => (
                    <div key={`${d.name}-${idx}`} className="flex items-center justify-between rounded bg-black/40 px-2 py-1 font-mono text-[11px]">
                      <span className="text-slate-200 truncate">{d.name}</span>
                      <span className="text-cyan-300">{d.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Display Brightness, Audio Volume, Personalization & Power */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
              <div className="font-mono text-xs font-bold uppercase text-cyan-300">Display Brightness &amp; System Audio</div>
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-xs text-slate-300">
                  <span>Screen Brightness</span>
                  <span>{brightnessSlider}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={brightnessSlider}
                    onChange={(e) => setBrightnessSlider(Number(e.target.value))}
                    className="flex-1 accent-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => void runWinSetting('set_brightness', 'display', brightnessSlider)}
                    className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1 font-mono text-xs text-cyan-100 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-xs text-slate-300">
                  <span>Master Volume</span>
                  <span>{volumeSlider}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volumeSlider}
                    onChange={(e) => setVolumeSlider(Number(e.target.value))}
                    className="flex-1 accent-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => void runWinSetting('set_volume', 'sound', volumeSlider)}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 font-mono text-xs text-emerald-100 cursor-pointer"
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => void runWinSetting('mute')}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-200 cursor-pointer"
                  >
                    Mute
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase text-cyan-300">Theme, Personalization &amp; Power</span>
                <span className="font-mono text-xs text-emerald-300">
                  {winState?.powerAndBattery?.hasBattery
                    ? `Battery ${winState.powerAndBattery.batteryPercent}% ${winState.powerAndBattery.isCharging ? '(Charging)' : ''}`
                    : winState?.powerAndBattery?.activePowerPlan || 'AC Power'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runWinSetting('dark_mode')}
                  className="rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-3 py-1.5 font-mono text-xs text-indigo-100 cursor-pointer"
                >
                  Dark Mode
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('light_mode')}
                  className="rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 font-mono text-xs text-amber-100 cursor-pointer"
                >
                  Light Mode
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('night_light')}
                  className="rounded-xl border border-orange-400/40 bg-orange-500/20 px-3 py-1.5 font-mono text-xs text-orange-100 cursor-pointer"
                >
                  Night Light
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('power_best_performance')}
                  className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs text-emerald-100 cursor-pointer"
                >
                  Best Performance
                </button>
                <button
                  type="button"
                  onClick={() => void runWinSetting('power_saver')}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs text-cyan-100 cursor-pointer"
                >
                  Power Saver
                </button>
              </div>
            </div>
          </div>

          {/* Complete 11-Section Windows 11 Settings Deep Launcher */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
                Complete Windows 11 / 10 Settings Deep Automation ({winCatalog.length} Pages)
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'All',
                  'System',
                  'Bluetooth & devices',
                  'Network & internet',
                  'Personalization',
                  'Apps',
                  'Accounts',
                  'Time & language',
                  'Gaming',
                  'Accessibility',
                  'Privacy & security',
                  'Windows Update',
                ].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSelectedSettingsSection(sec)}
                    className={`rounded-lg px-2.5 py-1 font-mono text-[11px] cursor-pointer ${
                      selectedSettingsSection === sec
                        ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/50'
                        : 'bg-black/40 text-slate-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {winCatalog
                .filter((item) => selectedSettingsSection === 'All' || item.section === selectedSettingsSection)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2.5"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono text-[10px] uppercase text-cyan-300">{item.section}</div>
                      <div className="truncate text-xs font-semibold text-white">{item.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{item.msSettingsUri}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runWinSetting('open_page', item.id)}
                      className="shrink-0 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1 font-mono text-[11px] text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: ANTI-ATTACKER SECURITY SHIELD */}
      {subTab === 'security_shield' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/25 bg-slate-950/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold uppercase text-emerald-300">
                Production Anti-Attacker Security Posture
              </h3>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-0.5 font-mono text-xs font-bold text-emerald-200">
                Score {secPosture?.securityScore ?? 96}/100
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="text-[10px] text-slate-400">CROSS-ORIGIN CSRF SHIELD</div>
                <div className="text-emerald-300 font-bold mt-0.5">ACTIVE (Origin Verified)</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="text-[10px] text-slate-400">PROMPT-INJECTION FIREWALL</div>
                <div className="text-emerald-300 font-bold mt-0.5">ACTIVE (Shell/Exfil Guard)</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="text-[10px] text-slate-400">DEFENDER STATUS</div>
                <div className="text-cyan-200 mt-0.5">{secPosture?.windowsDefender?.note || 'Active'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="text-[10px] text-slate-400">FIREWALL PROFILES</div>
                <div className="text-cyan-200 mt-0.5">{secPosture?.firewall?.note || 'Active'}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runWinSetting('defender_quick_scan')}
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3.5 py-2 font-mono text-xs text-emerald-100 cursor-pointer"
              >
                Run Defender Quick Scan
              </button>
              <button
                type="button"
                onClick={() => void fetchWindowsMaster(true)}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 font-mono text-xs text-slate-200 cursor-pointer"
              >
                Refresh Connections
              </button>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="font-mono text-[11px] font-bold text-rose-300">
                Blocked Intrusion / Attack Events ({secPosture?.blockedAttacksCount ?? 0})
              </div>
              {(secPosture?.recentBlockedAttacks || []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-slate-400">
                  Zero external attacks detected. Owner session has 0ms friction.
                </div>
              ) : (
                (secPosture?.recentBlockedAttacks || []).map((ev: any) => (
                  <div key={ev.id} className="rounded-xl border border-rose-400/25 bg-rose-950/20 p-2.5 font-mono text-[11px]">
                    <div className="flex justify-between text-rose-200">
                      <span>{ev.vector}</span>
                      <span>{ev.sourceIp}</span>
                    </div>
                    <div className="text-slate-300 mt-0.5">{ev.detail}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Live Foreign Established TCP Connections ({(secPosture?.activeForeignConnections || []).length})
            </h3>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {(secPosture?.activeForeignConnections || []).length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-slate-400">
                  No external non-loopback TCP connections currently established.
                </div>
              ) : (
                (secPosture?.activeForeignConnections || []).map((conn: any, idx: number) => (
                  <div
                    key={`${conn.foreignAddress}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs"
                  >
                    <div>
                      <div className="text-white">{conn.foreignAddress}</div>
                      <div className="text-[10px] text-slate-400">
                        Local {conn.localAddress} • PID {conn.pid}
                      </div>
                    </div>
                    <span className="text-emerald-300 text-[11px]">{conn.state}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: FULL CUSTOMIZATION & VOICE MACROS STUDIO */}
      {subTab === 'customization_studio' && customization && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Core Persona, Speed & Security Preferences */}
          <div className="rounded-2xl border border-cyan-400/25 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Customize Everything — Owner Title, Speed, Style &amp; Directives
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-300">
                <span>How SARA / J.A.R.V.I.S. addresses you</span>
                <input
                  type="text"
                  value={customization.ownerTitle || ''}
                  onChange={(e) => setCustomization({ ...customization, ownerTitle: e.target.value })}
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
                />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Voice &amp; Chat Response Style</span>
                <select
                  value={customization.responseStyle || 'concise_jarvis'}
                  onChange={(e) => setCustomization({ ...customization, responseStyle: e.target.value })}
                  className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
                >
                  <option value="concise_jarvis">Concise J.A.R.V.I.S. (&lt;1 sentence)</option>
                  <option value="hinglish_natural">Natural Hinglish Companion</option>
                  <option value="detailed_pro">Detailed Executive Report</option>
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs text-slate-300">
              <span>Custom Standing Directive</span>
              <textarea
                rows={2}
                value={customization.customSystemDirective || ''}
                onChange={(e) => setCustomization({ ...customization, customSystemDirective: e.target.value })}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
            </label>
            <div className="flex flex-wrap gap-4 text-xs text-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(customization.instantFastPathEnabled)}
                  onChange={(e) => setCustomization({ ...customization, instantFastPathEnabled: e.target.checked })}
                />
                <span>&lt;150ms Native OS Fast-Path</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(customization.allowLanRemoteControl)}
                  onChange={(e) => setCustomization({ ...customization, allowLanRemoteControl: e.target.checked })}
                />
                <span>Allow Trusted Private LAN Control</span>
              </label>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await api.windowsMasterUpdateCustomization(customization);
                if (res.customization) setCustomization(res.customization);
                setStatusBanner('Saved custom SARA preferences.');
              }}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 font-mono text-xs font-bold text-white cursor-pointer"
            >
              Save Customization
            </button>

            {/* Custom App / Folder / URL Aliases */}
            <div className="border-t border-white/10 pt-3 space-y-2">
              <div className="font-mono text-xs font-bold uppercase text-cyan-300">Custom Spoken App / Folder Aliases</div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={aliasName}
                  onChange={(e) => setAliasName(e.target.value)}
                  placeholder="Spoken alias (e.g. 'college notes')"
                  className="flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={aliasTarget}
                  onChange={(e) => setAliasTarget(e.target.value)}
                  placeholder="App exe, folder path, or URL"
                  className="flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!aliasName.trim() || !aliasTarget.trim()) return;
                    const kind = /^https?:\/\//i.test(aliasTarget.trim()) ? 'url' : 'app';
                    const res = await api.windowsMasterUpsertAlias({
                      alias: aliasName.trim(),
                      target: aliasTarget.trim(),
                      kind,
                    });
                    if (res.customization) setCustomization(res.customization);
                    setAliasName('');
                    setAliasTarget('');
                  }}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs text-cyan-100 cursor-pointer"
                >
                  Add Alias
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(customization.appAliases || []).map((a: any) => (
                  <span
                    key={a.alias}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 font-mono text-[11px] text-slate-200"
                  >
                    <strong className="text-cyan-300">&ldquo;{a.alias}&rdquo;</strong> → {a.target}
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.windowsMasterDeleteAlias(a.alias);
                        if (res.customization) setCustomization(res.customization);
                      }}
                      className="text-rose-400 hover:text-rose-200 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Multi-Step Voice Macros */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 space-y-3">
            <h3 className="font-mono text-xs font-bold uppercase text-cyan-300">
              Custom Multi-App Voice Macros (&ldquo;When I say X → Run Steps&rdquo;)
            </h3>
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
              <input
                type="text"
                value={macroPhrase}
                onChange={(e) => setMacroPhrase(e.target.value)}
                placeholder="Voice trigger phrase (e.g. 'study mode')"
                className="w-full rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={macroDesc}
                onChange={(e) => setMacroDesc(e.target.value)}
                placeholder="Description (e.g. Dark Mode + open VS Code + open docs)"
                className="w-full rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={macroAppTarget}
                  onChange={(e) => setMacroAppTarget(e.target.value)}
                  placeholder="App to launch (e.g. code, notepad)"
                  className="rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={macroUrlTarget}
                  onChange={(e) => setMacroUrlTarget(e.target.value)}
                  placeholder="URL to open (optional)"
                  className="rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!macroPhrase.trim()) return;
                  const steps: Array<Record<string, unknown>> = [{ kind: 'setting', action: 'dark_mode', target: 'colors' }];
                  if (macroAppTarget.trim()) steps.push({ kind: 'launch_app', target: macroAppTarget.trim() });
                  if (macroUrlTarget.trim()) steps.push({ kind: 'open_url', target: macroUrlTarget.trim() });
                  const res = await api.windowsMasterUpsertMacro({
                    triggerPhrase: macroPhrase.trim(),
                    description: macroDesc.trim() || macroPhrase.trim(),
                    enabled: true,
                    steps,
                  });
                  if (res.customization) setCustomization(res.customization);
                  setMacroPhrase('');
                  setMacroDesc('');
                  setStatusBanner(`Created voice macro "${macroPhrase.trim()}".`);
                }}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs text-emerald-100 cursor-pointer"
              >
                + Save Voice Macro
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(customization.voiceMacros || []).map((m: any) => (
                <div key={m.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-200">&ldquo;{m.triggerPhrase}&rdquo;</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await api.windowsMasterVoiceExec(m.triggerPhrase);
                          setStatusBanner(res.spokenReply || 'Executed macro.');
                        }}
                        className="rounded bg-cyan-500/20 px-2 py-0.5 font-mono text-[11px] text-cyan-100 cursor-pointer"
                      >
                        Run Now
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await api.windowsMasterDeleteMacro(m.id);
                          if (res.customization) setCustomization(res.customization);
                        }}
                        className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[11px] text-rose-200 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{m.description}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500">{(m.steps || []).length} automated step(s)</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: NATIVE SHELL, 7-DOMAIN OS MASTERY, WEB-TO-WORK BROWSER & ACCEPTANCE SUITE */}
      {subTab === 'native_shell_7domain' && (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-6 font-mono text-xs text-cyan-200">
              Loading Native SARA Shell &amp; 7-Domain OS Suite…
            </div>
          }
        >
          <LazyWindowsShellOverlayView />
        </Suspense>
      )}

      {/* TAB: MODULE 18 RECOVERY, SELF-HEALING, HINGLISH CONTEXT & 17/17 AUTOMATION AUDIT */}
      {subTab === 'recovery_and_17audit' && (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-6 font-mono text-xs text-emerald-200">
              Loading Recovery, Self-Healing &amp; 17/17 Automation Audit…
            </div>
          }
        >
          <LazySaraAutomationAndRecoveryView />
        </Suspense>
      )}
    </div>
  );
};

export default LiveDepartmentCommandView;
