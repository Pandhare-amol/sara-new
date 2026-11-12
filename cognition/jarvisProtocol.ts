/**
 * J.A.R.V.I.S. Chief-of-Staff Engine:
 *   1. Tactical Executive Briefing (system telemetry, missions, utilities, security, optional live weather)
 *   2. Named Operational Protocols (Focus, Engineering/Dev, Presentation, System Sweep, Lockdown + Custom User Protocols)
 *   3. Local Engineering / Project Inspector (stack detection, git state, scripts, structure summary)
 *
 * Every metric reported is grounded in real local state or verified live endpoints —
 * unavailable sources are explicitly marked rather than fabricated.
 */
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { appEvents } from "../shared/appEvents";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";
import type { GoalManager } from "./goalManager";
import type { SelfOptimizationEngine } from "./selfOptimizer";

const execFileAsync = promisify(execFile);

export type ProtocolStepAction =
  | { type: "set_dnd"; active: boolean }
  | { type: "self_optimize"; level?: 1 | 2 | 3 }
  | { type: "activate_workspace"; name: string }
  | { type: "capture_workspace"; name: string }
  | { type: "start_task"; goal: string }
  | { type: "create_goal"; objective: string }
  | { type: "set_timer"; minutes: number; label: string }
  | { type: "lockdown"; reason?: string };

export interface JarvisProtocol {
  id: string;
  slug: string;
  name: string;
  description: string;
  builtIn: boolean;
  steps: ProtocolStepAction[];
  lastExecutedAt: string | null;
  executionCount: number;
  createdAt: string;
}

export interface ProtocolExecutionResult {
  ok: boolean;
  protocol: JarvisProtocol;
  executedSteps: Array<{ step: string; ok: boolean; detail: string }>;
  spokenSummary: string;
}

export interface ProjectInspectionReport {
  path: string;
  exists: boolean;
  name: string;
  detectedStacks: string[];
  scripts: string[];
  topLevelEntries: string[];
  git: {
    isRepo: boolean;
    branch: string | null;
    dirtyFiles: number;
    recentCommit: string | null;
  };
  inspectedAt: string;
}

export interface JarvisChiefOfStaffDeps {
  dataDir: string;
  goals: GoalManager;
  selfOptimizer: SelfOptimizationEngine;
  getActiveTasksSummary: () => { active: number; completed: number; failed: number; recentGoals: string[] };
  getUpcomingUtilities: () => Array<{ kind: string; label: string; dueAt: string }>;
  getSecuritySummary: () => { shieldEnabled: boolean; gateActive: boolean; authorized: boolean; lockdownActive: boolean; intrusionCount: number };
  setDnd: (active: boolean) => Promise<void>;
  startTask: (goal: string) => { id: string };
  addTimer: (minutes: number, label: string) => Promise<{ id: string }>;
  activateWorkspaceByName: (name: string) => Promise<{ ok: boolean; detail: string }>;
  captureWorkspaceByName: (name: string) => Promise<{ ok: boolean; detail: string }>;
  triggerLockdown: (reason: string) => Promise<void>;
  allowExternalWeather?: boolean;
}

const BUILTIN_PROTOCOLS: Array<Omit<JarvisProtocol, "id" | "lastExecutedAt" | "executionCount" | "createdAt">> = [
  {
    slug: "focus",
    name: "Focus Protocol",
    description: "Silences distractions (Do Not Disturb), optimizes background memory/CPU, activates Focus workspace if saved, and starts a 45-minute deep-work timer.",
    builtIn: true,
    steps: [
      { type: "set_dnd", active: true },
      { type: "self_optimize", level: 2 },
      { type: "activate_workspace", name: "Focus" },
      { type: "set_timer", minutes: 45, label: "JARVIS Deep Focus Session" },
    ],
  },
  {
    slug: "engineering",
    name: "Engineering Protocol",
    description: "Disables DND so tactical updates come through, optimizes background load, and restores the Engineering / Dev workspace layout.",
    builtIn: true,
    steps: [
      { type: "set_dnd", active: false },
      { type: "self_optimize", level: 1 },
      { type: "activate_workspace", name: "Engineering" },
    ],
  },
  {
    slug: "presentation",
    name: "Presentation Protocol",
    description: "Enables Do Not Disturb to suppress interruptions during demos/presentations and activates the Presentation workspace.",
    builtIn: true,
    steps: [
      { type: "set_dnd", active: true },
      { type: "activate_workspace", name: "Presentation" },
    ],
  },
  {
    slug: "clean_slate",
    name: "Clean Slate Protocol",
    description: "Runs Level-2 system resource optimization and cleans allowlisted high-memory background processes.",
    builtIn: true,
    steps: [
      { type: "self_optimize", level: 2 },
    ],
  },
  {
    slug: "night_watch",
    name: "Night Watch Lockdown Protocol",
    description: "Halts all active tasks and locks SARA Security Shield into full Lockdown Mode.",
    builtIn: true,
    steps: [
      { type: "lockdown", reason: "night_watch_protocol" },
    ],
  },
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "custom_protocol";
}

export class JarvisChiefOfStaff {
  private readonly protocolsFile: string;
  private protocols: JarvisProtocol[] = [];
  private loaded = false;

  constructor(private readonly deps: JarvisChiefOfStaffDeps) {
    this.protocolsFile = path.join(deps.dataDir, "cognition", "jarvis-protocols.v1.json");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    const stored = await readJsonFile<JarvisProtocol[] | null>(this.protocolsFile, null);
    const now = new Date().toISOString();
    if (stored && Array.isArray(stored) && stored.length > 0) {
      this.protocols = stored;
      // Ensure any newly added built-in protocols exist.
      for (const builtIn of BUILTIN_PROTOCOLS) {
        if (!this.protocols.some((p) => p.slug === builtIn.slug)) {
          this.protocols.push({ ...builtIn, id: crypto.randomUUID(), lastExecutedAt: null, executionCount: 0, createdAt: now });
        }
      }
    } else {
      this.protocols = BUILTIN_PROTOCOLS.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        lastExecutedAt: null,
        executionCount: 0,
        createdAt: now,
      }));
      await writeJsonFile(this.protocolsFile, this.protocols);
    }
    this.loaded = true;
  }

  listProtocols(): JarvisProtocol[] {
    return structuredClone(this.protocols);
  }

  async saveCustomProtocol(input: {
    name: string;
    description?: string;
    steps: ProtocolStepAction[];
  }): Promise<JarvisProtocol> {
    await this.initialize();
    const cleanName = String(input.name || "").trim();
    if (!cleanName) throw new Error("Protocol name is required.");
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      throw new Error("Protocol must include at least one step.");
    }
    const slug = slugify(cleanName);
    const existingIdx = this.protocols.findIndex((p) => p.slug === slug && !p.builtIn);
    const now = new Date().toISOString();
    const record: JarvisProtocol = {
      id: existingIdx >= 0 ? this.protocols[existingIdx].id : crypto.randomUUID(),
      slug,
      name: cleanName.slice(0, 80),
      description: String(input.description || `Custom JARVIS protocol (${input.steps.length} step(s))`).slice(0, 240),
      builtIn: false,
      steps: input.steps.slice(0, 12),
      lastExecutedAt: existingIdx >= 0 ? this.protocols[existingIdx].lastExecutedAt : null,
      executionCount: existingIdx >= 0 ? this.protocols[existingIdx].executionCount : 0,
      createdAt: existingIdx >= 0 ? this.protocols[existingIdx].createdAt : now,
    };
    if (existingIdx >= 0) this.protocols[existingIdx] = record;
    else this.protocols.push(record);
    await writeJsonFile(this.protocolsFile, this.protocols);
    return structuredClone(record);
  }

  async deleteProtocol(idOrSlug: string): Promise<boolean> {
    await this.initialize();
    const target = String(idOrSlug || "").trim().toLowerCase();
    const found = this.protocols.find((p) => p.id === idOrSlug || p.slug === target);
    if (!found || found.builtIn) return false;
    this.protocols = this.protocols.filter((p) => p.id !== found.id);
    await writeJsonFile(this.protocolsFile, this.protocols);
    return true;
  }

  async executeProtocol(nameOrSlugOrId: string): Promise<ProtocolExecutionResult> {
    await this.initialize();
    const needle = String(nameOrSlugOrId || "").trim().toLowerCase();
    const slugNeedle = slugify(needle.replace(/\bprotocol\b/gi, "").trim());
    const protocol = this.protocols.find(
      (p) =>
        p.id === nameOrSlugOrId ||
        p.slug === needle ||
        p.slug === slugNeedle ||
        p.name.toLowerCase() === needle ||
        p.name.toLowerCase().includes(slugNeedle.replace(/_/g, " ")),
    );
    if (!protocol) {
      throw new Error(`Unknown protocol "${nameOrSlugOrId}". Available: ${this.protocols.map((p) => p.name).join(", ")}.`);
    }

    const executedSteps: Array<{ step: string; ok: boolean; detail: string }> = [];
    for (const step of protocol.steps) {
      try {
        switch (step.type) {
          case "set_dnd":
            await this.deps.setDnd(step.active);
            executedSteps.push({ step: "set_dnd", ok: true, detail: `Do Not Disturb ${step.active ? "enabled" : "disabled"}.` });
            break;
          case "self_optimize": {
            const report = await this.deps.selfOptimizer.optimize({ trigger: "manual", level: step.level ?? 2 });
            executedSteps.push({
              step: "self_optimize",
              ok: true,
              detail: `CPU ${report.before.cpuPercent}% → ${report.after.cpuPercent}%, RAM Δ${report.deltaRamMb} MB.`,
            });
            break;
          }
          case "activate_workspace": {
            const ws = await this.deps.activateWorkspaceByName(step.name);
            executedSteps.push({ step: "activate_workspace", ok: ws.ok, detail: ws.detail });
            break;
          }
          case "capture_workspace": {
            const ws = await this.deps.captureWorkspaceByName(step.name);
            executedSteps.push({ step: "capture_workspace", ok: ws.ok, detail: ws.detail });
            break;
          }
          case "start_task": {
            const task = this.deps.startTask(step.goal);
            executedSteps.push({ step: "start_task", ok: true, detail: `Dispatched task ${task.id}: ${step.goal}` });
            break;
          }
          case "create_goal": {
            const goal = await this.deps.goals.create({ objective: step.objective, priority: 0.8 });
            executedSteps.push({ step: "create_goal", ok: true, detail: `Created autonomous mission ${goal.id}: ${step.objective}` });
            break;
          }
          case "set_timer": {
            await this.deps.addTimer(step.minutes, step.label);
            executedSteps.push({ step: "set_timer", ok: true, detail: `Started ${step.minutes}-minute timer "${step.label}".` });
            break;
          }
          case "lockdown":
            await this.deps.triggerLockdown(step.reason || "protocol_lockdown");
            executedSteps.push({ step: "lockdown", ok: true, detail: "SARA Security Shield entered Lockdown Mode." });
            break;
        }
      } catch (error) {
        executedSteps.push({
          step: step.type,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    protocol.lastExecutedAt = new Date().toISOString();
    protocol.executionCount += 1;
    await writeJsonFile(this.protocolsFile, this.protocols);

    const succeeded = executedSteps.filter((s) => s.ok).length;
    const spokenSummary = `${protocol.name} engaged, Boss (${succeeded}/${executedSteps.length} operations verified).`;
    appEvents.publish("jarvis.protocol_executed", { protocol: protocol.name, executedSteps, spokenSummary });
    return {
      ok: succeeded > 0,
      protocol: structuredClone(protocol),
      executedSteps,
      spokenSummary,
    };
  }

  async generateBriefing(options: { latitude?: number; longitude?: number } = {}) {
    await this.initialize();
    const hour = new Date().getHours();
    const salutation = hour < 12 ? "Good morning, Boss." : hour < 17 ? "Good afternoon, Boss." : "Good evening, Boss.";
    const resources = await this.deps.selfOptimizer.captureSnapshot();
    const tasks = this.deps.getActiveTasksSummary();
    const goals = this.deps.goals.list();
    const activeGoals = goals.filter((g) => g.status === "active" || g.status === "pending");
    const completedGoals = goals.filter((g) => g.status === "completed");
    const utilities = this.deps.getUpcomingUtilities();
    const security = this.deps.getSecuritySummary();

    let weather: { available: boolean; temperatureC?: number; windKmh?: number; source?: string; note?: string } = {
      available: false,
      note: "Location coordinates not supplied or external weather disabled.",
    };
    if (
      this.deps.allowExternalWeather !== false &&
      typeof options.latitude === "number" &&
      typeof options.longitude === "number" &&
      Number.isFinite(options.latitude) &&
      Number.isFinite(options.longitude)
    ) {
      weather = await fetchOpenMeteoWeather(options.latitude, options.longitude);
    }

    const lines = [
      salutation,
      `System telemetry: CPU ${resources.cpuPercent}%, RAM ${resources.ramPercent}% (${resources.ramUsedMb} MB used), host ${os.hostname()} (${os.platform()} ${os.release()}).`,
      `Autonomous missions: ${activeGoals.length} active mission(s), ${completedGoals.length} completed, ${tasks.active} live task(s) running.`,
      utilities.length > 0
        ? `Upcoming schedule: ${utilities.slice(0, 3).map((u) => `${u.label} (${new Date(u.dueAt).toLocaleTimeString()})`).join(", ")}.`
        : "Schedule: No pending alarms or reminders.",
      `SARA Security Shield: ${security.lockdownActive ? "LOCKDOWN" : security.gateActive ? (security.authorized ? "ARMED & VERIFIED" : "LOCKED") : "STANDBY (enroll PIN/passphrase to arm)"}${security.intrusionCount ? ` · ${security.intrusionCount} blocked attempt(s)` : ""}.`,
      ...(weather.available ? [`Local weather: ${weather.temperatureC}°C, wind ${weather.windKmh} km/h (${weather.source}).`] : []),
    ];

    return {
      generatedAt: new Date().toISOString(),
      salutation,
      spokenBriefing: lines.join(" "),
      telemetry: {
        ...resources,
        hostname: os.hostname(),
        platform: os.platform(),
        osRelease: os.release(),
        uptimeMinutes: Math.round(os.uptime() / 60),
      },
      missions: {
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        activeTasks: tasks.active,
        completedTasks: tasks.completed,
        recentObjectives: activeGoals.slice(0, 5).map((g) => g.objective),
      },
      upcomingUtilities: utilities.slice(0, 5),
      security,
      weather,
      availableProtocols: this.protocols.map((p) => ({ slug: p.slug, name: p.name, builtIn: p.builtIn })),
    };
  }

  async inspectProject(targetDir: string): Promise<ProjectInspectionReport> {
    const resolved = path.resolve(String(targetDir || process.cwd()));
    const name = path.basename(resolved);
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) throw new Error("Not a directory");
    } catch {
      return {
        path: resolved,
        exists: false,
        name,
        detectedStacks: [],
        scripts: [],
        topLevelEntries: [],
        git: { isRepo: false, branch: null, dirtyFiles: 0, recentCommit: null },
        inspectedAt: new Date().toISOString(),
      };
    }

    const entries = await fs.readdir(resolved).catch(() => [] as string[]);
    const lower = new Set(entries.map((e) => e.toLowerCase()));
    const detectedStacks: string[] = [];
    const scripts: string[] = [];

    if (lower.has("package.json")) {
      detectedStacks.push("Node.js / TypeScript-JavaScript");
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(resolved, "package.json"), "utf-8")) as { scripts?: Record<string, string> };
        scripts.push(...Object.keys(pkg.scripts || {}).slice(0, 20));
      } catch {
        /* ignore malformed package.json */
      }
    }
    if (lower.has("tsconfig.json")) detectedStacks.push("TypeScript");
    if (lower.has("pyproject.toml") || lower.has("requirements.txt")) detectedStacks.push("Python");
    if (entries.some((e) => e.endsWith(".sln") || e.endsWith(".csproj"))) detectedStacks.push(".NET / C#");
    if (lower.has("cargo.toml")) detectedStacks.push("Rust");
    if (lower.has("go.mod")) detectedStacks.push("Go");
    if (lower.has("dockerfile") || lower.has("docker-compose.yml")) detectedStacks.push("Docker");

    let isRepo = false;
    let branch: string | null = null;
    let dirtyFiles = 0;
    let recentCommit: string | null = null;

    try {
      const branchOut = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: resolved, timeout: 4_000 });
      isRepo = true;
      branch = branchOut.stdout.trim() || null;
      const statusOut = await execFileAsync("git", ["status", "--porcelain"], { cwd: resolved, timeout: 4_000 });
      dirtyFiles = statusOut.stdout.split(/\r?\n/).filter(Boolean).length;
      const logOut = await execFileAsync("git", ["log", "-1", "--oneline"], { cwd: resolved, timeout: 4_000 });
      recentCommit = logOut.stdout.trim() || null;
    } catch {
      /* not a git repository or git unavailable */
    }

    return {
      path: resolved,
      exists: true,
      name,
      detectedStacks,
      scripts,
      topLevelEntries: entries.slice(0, 40),
      git: { isRepo, branch, dirtyFiles, recentCommit },
      inspectedAt: new Date().toISOString(),
    };
  }
}

async function fetchOpenMeteoWeather(lat: number, lon: number): Promise<{
  available: boolean;
  temperatureC?: number;
  windKmh?: number;
  source?: string;
  note?: string;
}> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3_500) });
    if (!res.ok) return { available: false, note: `Weather provider HTTP ${res.status}` };
    const data = (await res.json()) as { current_weather?: { temperature?: number; windspeed?: number } };
    if (typeof data.current_weather?.temperature !== "number") {
      return { available: false, note: "Weather payload missing current_weather." };
    }
    return {
      available: true,
      temperatureC: data.current_weather.temperature,
      windKmh: data.current_weather.windspeed ?? 0,
      source: "open-meteo.com",
    };
  } catch {
    return { available: false, note: "Offline or weather endpoint unreachable." };
  }
}
