/**
 * Self-Optimization & Safe Allowlisted Resource Cleanup Engine.
 *
 * Implements:
 * - Level 1: SARA internal workload optimization (task/cache trim, nonessential refresh throttling)
 * - Level 2/3: Persisted user-configurable process cleanup allowlist (never allowing OS/security processes)
 * - Measured before/after CPU, RAM, and freed-memory optimization reports
 */
import crypto from "node:crypto";
import path from "node:path";
import { appEvents } from "../shared/appEvents";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";

const PROTECTED_SYSTEM_PROCESSES = new Set([
  "system",
  "registry",
  "smss",
  "smss.exe",
  "csrss",
  "csrss.exe",
  "wininit",
  "wininit.exe",
  "services",
  "services.exe",
  "lsass",
  "lsass.exe",
  "svchost",
  "svchost.exe",
  "winlogon",
  "winlogon.exe",
  "explorer",
  "explorer.exe",
  "dwm",
  "dwm.exe",
  "msmpeng",
  "msmpeng.exe",
  "securityhealthservice",
  "securityhealthservice.exe",
  "sihost",
  "sihost.exe",
  "taskhostw",
  "taskhostw.exe",
  "audiodg",
  "audiodg.exe",
  "sara",
  "sara.exe",
  "electron",
  "electron.exe",
  "node",
  "node.exe",
  "python",
  "python.exe",
  "windowsbridge",
  "windowsbridge.exe",
  "desktophost",
  "desktophost.exe",
]);

export interface AllowlistedProcessEntry {
  processName: string;
  maxRamMb: number;
  autoCleanup: boolean;
  addedAt: string;
  notes?: string;
}

export interface OptimizationSnapshot {
  capturedAt: string;
  cpuPercent: number;
  ramPercent: number;
  ramUsedMb: number;
  ramAvailableMb: number;
}

export interface OptimizationReport {
  id: string;
  startedAt: string;
  completedAt: string;
  trigger: "manual" | "proactive_high_load" | "scheduled";
  level: 1 | 2 | 3;
  before: OptimizationSnapshot;
  after: OptimizationSnapshot;
  deltaCpuPercent: number;
  deltaRamMb: number;
  internalActions: string[];
  cleanedProcesses: Array<{ processName: string; pid?: number; result: string }>;
  skippedProcesses: Array<{ processName: string; reason: string }>;
}

export interface SelfOptimizerDeps {
  dataDir: string;
  callDesktopTool: (tool: string, args?: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  authorize?: () => boolean;
  onInternalOptimize?: () => Promise<string[]> | string[];
}

export class SelfOptimizationEngine {
  private readonly allowlistFile: string;
  private readonly reportsFile: string;
  private allowlist: AllowlistedProcessEntry[] = [];
  private reports: OptimizationReport[] = [];
  private throttledMode = false;
  private loaded = false;

  constructor(private readonly deps: SelfOptimizerDeps) {
    this.allowlistFile = path.join(deps.dataDir, "optimization", "allowlist.v1.json");
    this.reportsFile = path.join(deps.dataDir, "optimization", "reports.v1.json");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.allowlist = await readJsonFile<AllowlistedProcessEntry[]>(this.allowlistFile, []);
    this.reports = await readJsonFile<OptimizationReport[]>(this.reportsFile, []);
    this.loaded = true;
  }

  isThrottled(): boolean {
    return this.throttledMode;
  }

  getAllowlist(): AllowlistedProcessEntry[] {
    return structuredClone(this.allowlist);
  }

  getReports(limit = 20): OptimizationReport[] {
    return structuredClone(this.reports.slice(-Math.max(1, Math.min(100, limit)))).reverse();
  }

  static isProtectedProcess(name: string): boolean {
    const clean = String(name || "").trim().toLowerCase();
    const base = clean.replace(/\.exe$/i, "");
    return !clean || PROTECTED_SYSTEM_PROCESSES.has(clean) || PROTECTED_SYSTEM_PROCESSES.has(base);
  }

  async upsertAllowlist(entry: {
    processName: string;
    maxRamMb?: number;
    autoCleanup?: boolean;
    notes?: string;
  }): Promise<AllowlistedProcessEntry> {
    await this.initialize();
    const clean = String(entry.processName || "").trim();
    if (!clean || !/^[A-Za-z0-9._-]{2,80}$/.test(clean)) {
      throw new Error("Process name must be 2–80 alphanumeric characters (for example 'UpdaterHelper.exe').");
    }
    if (SelfOptimizationEngine.isProtectedProcess(clean)) {
      throw new Error(`'${clean}' is a protected Windows/SARA process and cannot be added to cleanup allowlists.`);
    }
    const normalized = clean.toLowerCase();
    const record: AllowlistedProcessEntry = {
      processName: clean,
      maxRamMb: Math.max(64, Math.min(32_768, Math.round(Number(entry.maxRamMb ?? 512)))),
      autoCleanup: entry.autoCleanup !== false,
      addedAt: new Date().toISOString(),
      ...(entry.notes ? { notes: String(entry.notes).slice(0, 200) } : {}),
    };
    const idx = this.allowlist.findIndex((item) => item.processName.toLowerCase() === normalized);
    if (idx >= 0) this.allowlist[idx] = record;
    else this.allowlist.push(record);
    await writeJsonFile(this.allowlistFile, this.allowlist);
    return structuredClone(record);
  }

  async removeAllowlist(processName: string): Promise<boolean> {
    await this.initialize();
    const normalized = String(processName || "").trim().toLowerCase();
    const before = this.allowlist.length;
    this.allowlist = this.allowlist.filter((item) => item.processName.toLowerCase() !== normalized);
    if (this.allowlist.length !== before) {
      await writeJsonFile(this.allowlistFile, this.allowlist);
      return true;
    }
    return false;
  }

  async captureSnapshot(): Promise<OptimizationSnapshot> {
    const res = await this.deps.callDesktopTool("getResourceSnapshot", {}).catch(() => ({ ok: false, result: undefined as unknown }));
    const raw = (res.ok && res.result && typeof res.result === "object" ? res.result : {}) as Record<string, any>;
    const cpuPercent = Number(raw.cpu?.percent ?? raw.cpu_percent ?? 0);
    const ramPercent = Number(raw.memory?.percent ?? raw.ram_percent ?? 0);
    const ramUsedMb = Number(raw.memory?.used_mb ?? raw.ram_used_mb ?? Math.round((process.memoryUsage().rss || 0) / (1024 * 1024)));
    const ramAvailableMb = Number(raw.memory?.available_mb ?? raw.ram_available_mb ?? 0);
    return {
      capturedAt: new Date().toISOString(),
      cpuPercent: Number.isFinite(cpuPercent) ? Math.round(cpuPercent * 10) / 10 : 0,
      ramPercent: Number.isFinite(ramPercent) ? Math.round(ramPercent * 10) / 10 : 0,
      ramUsedMb: Number.isFinite(ramUsedMb) ? Math.round(ramUsedMb) : 0,
      ramAvailableMb: Number.isFinite(ramAvailableMb) ? Math.round(ramAvailableMb) : 0,
    };
  }

  async optimize(options: {
    trigger?: OptimizationReport["trigger"];
    level?: 1 | 2 | 3;
  } = {}): Promise<OptimizationReport> {
    await this.initialize();
    if (this.deps.authorize && !this.deps.authorize()) {
      throw new Error("Owner authentication required for system optimization.");
    }
    const startedAt = new Date().toISOString();
    const trigger = options.trigger ?? "manual";
    const level = options.level ?? 2;
    const before = await this.captureSnapshot();
    const internalActions: string[] = [];
    const cleanedProcesses: OptimizationReport["cleanedProcesses"] = [];
    const skippedProcesses: OptimizationReport["skippedProcesses"] = [];

    // Level 1: Optimize SARA's own runtime footprint first.
    this.throttledMode = before.cpuPercent >= 80 || before.ramPercent >= 85;
    internalActions.push(
      this.throttledMode
        ? "Enabled SARA low-overhead background cadence while host load is elevated."
        : "Verified SARA background cadence within healthy resource budget.",
    );
    if (this.deps.onInternalOptimize) {
      const extra = await this.deps.onInternalOptimize();
      internalActions.push(...extra);
    }

    // Level 2 & 3: Safe allowlisted process cleanup via Desktop Agent.
    if (level >= 2 && this.allowlist.length > 0) {
      const topRes = await this.deps.callDesktopTool("listResourceProcesses", { limit: 40 }).catch(() => ({ ok: false, result: undefined as unknown }));
      const processes = Array.isArray((topRes.result as any)?.processes)
        ? ((topRes.result as any).processes as Array<Record<string, any>>)
        : [];
      const allowMap = new Map(this.allowlist.map((entry) => [entry.processName.toLowerCase(), entry]));

      for (const proc of processes) {
        const procName = String(proc.name || "").trim();
        const rule = allowMap.get(procName.toLowerCase()) || allowMap.get(`${procName.toLowerCase()}.exe`);
        if (!rule) continue;
        if (!rule.autoCleanup && trigger !== "manual") {
          skippedProcesses.push({ processName: procName, reason: "Auto-cleanup disabled for this allowlist entry." });
          continue;
        }
        if (SelfOptimizationEngine.isProtectedProcess(procName)) {
          skippedProcesses.push({ processName: procName, reason: "Protected OS/SARA process." });
          continue;
        }
        const rssMb = Number(proc.memory_mb ?? proc.rss_mb ?? 0);
        if (level === 2 && rssMb > 0 && rssMb < rule.maxRamMb) {
          skippedProcesses.push({ processName: procName, reason: `Using ${Math.round(rssMb)} MB (< ${rule.maxRamMb} MB threshold).` });
          continue;
        }
        const cleanup = await this.deps.callDesktopTool("cleanupAllowlistedProcess", {
          pid: proc.pid,
          name: procName,
          process_name: procName,
          executablePath: String(proc.executablePath || ""),
          startedAt: Number(proc.startedAt || 0),
          allowlisted: true,
          allowlist: this.allowlist.map((item) => item.processName),
        }).catch((err) => ({ ok: false, result: undefined as unknown, error: String(err) }));
        if (cleanup.ok) {
          cleanedProcesses.push({
            processName: procName,
            pid: typeof proc.pid === "number" ? proc.pid : undefined,
            result: String((cleanup.result as any)?.result || "Terminated allowlisted background process cleanly."),
          });
        } else {
          skippedProcesses.push({
            processName: procName,
            reason: cleanup.error || "Desktop Agent refused or could not terminate process.",
          });
        }
      }
    }

    const after = await this.captureSnapshot();
    const report: OptimizationReport = {
      id: crypto.randomUUID(),
      startedAt,
      completedAt: new Date().toISOString(),
      trigger,
      level,
      before,
      after,
      deltaCpuPercent: Math.round((before.cpuPercent - after.cpuPercent) * 10) / 10,
      deltaRamMb: Math.round(before.ramUsedMb - after.ramUsedMb),
      internalActions,
      cleanedProcesses,
      skippedProcesses,
    };
    this.reports = [...this.reports.slice(-49), report];
    await writeJsonFile(this.reportsFile, this.reports);
    appEvents.publish("optimization.completed", report);
    return structuredClone(report);
  }
}
