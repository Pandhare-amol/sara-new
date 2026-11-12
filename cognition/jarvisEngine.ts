/**
 * Proactive JARVIS Autonomous Coordinator.
 *
 * Bridges SARA's persistent GoalManager, Autonomous TaskManager, SelfOptimizer,
 * and background routines so SARA plans, executes, recovers, and verifies goals
 * proactively without waiting for manual subtask clicks or confirmation dialogs.
 */
import crypto from "node:crypto";
import path from "node:path";
import type { TaskSession } from "../agent/taskSession";
import { appEvents } from "../shared/appEvents";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";
import { createLogger } from "../shared/logger";
import type { GoalManager } from "./goalManager";
import type { SelfOptimizationEngine } from "./selfOptimizer";
import type { Goal, GoalTask } from "./types";

const log = createLogger("cognition.jarvis");

export interface JarvisRoutine {
  id: string;
  name: string;
  trigger: "startup" | "unlock" | "high_resource" | "interval";
  /** Interval in minutes when trigger === "interval". */
  intervalMin?: number;
  /** Objective to execute via TaskManager or GoalManager, or internal action id. */
  kind: "goal" | "task" | "self_optimize";
  objective: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastOutcome: string | null;
  runCount: number;
  createdAt: string;
}

export interface JarvisConfig {
  autonomousMode: boolean;
  proactiveJarvis: boolean;
  autoExecuteGoals: boolean;
  multiMethodFallback: boolean;
  tickIntervalMs?: number;
}

export interface ProactiveJarvisDeps {
  dataDir: string;
  goals: GoalManager;
  startTask: (goal: string, origin: TaskSession["origin"], options?: { sensitive?: boolean; preface?: string[] }) => TaskSession;
  getActiveTaskId: () => string | null;
  getTaskSession: (taskId: string) => TaskSession | undefined;
  planGoal?: (goal: Goal) => Promise<Array<{ id?: string; title: string; priority?: number; dependsOn?: string[] }>>;
  authorize?: () => boolean;
  selfOptimizer?: SelfOptimizationEngine;
  notify?: (title: string, body: string) => void;
}

interface ActiveGoalRun {
  goalId: string;
  goalTaskId: string;
  runtimeTaskId: string;
  startedAt: string;
}

const DEFAULT_ROUTINES: Omit<JarvisRoutine, "id" | "createdAt">[] = [
  {
    name: "Sustained High-Load Auto-Optimization",
    trigger: "high_resource",
    kind: "self_optimize",
    objective: "Optimize SARA background cadence and clean allowlisted memory hogs when CPU/RAM >= 90%.",
    enabled: true,
    lastRunAt: null,
    lastOutcome: null,
    runCount: 0,
  },
];

export class ProactiveJarvisEngine {
  private readonly routinesFile: string;
  private routines: JarvisRoutine[] = [];
  private config: JarvisConfig = {
    autonomousMode: true,
    proactiveJarvis: true,
    autoExecuteGoals: true,
    multiMethodFallback: true,
    tickIntervalMs: 4_000,
  };
  private timer: NodeJS.Timeout | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private activeRun: ActiveGoalRun | null = null;
  private ticking = false;
  private started = false;
  private lastHighLoadCheck = 0;
  private stats = {
    goalsAutoPlanned: 0,
    subtasksDispatched: 0,
    subtasksCompleted: 0,
    autoRetries: 0,
    routinesExecuted: 0,
    lastTickAt: null as string | null,
  };

  constructor(private readonly deps: ProactiveJarvisDeps) {
    this.routinesFile = path.join(deps.dataDir, "cognition", "jarvis-routines.v1.json");
  }

  async initialize(initialConfig?: Partial<JarvisConfig>): Promise<void> {
    if (initialConfig) this.config = { ...this.config, ...initialConfig };
    const stored = await readJsonFile<JarvisRoutine[] | null>(this.routinesFile, null);
    if (stored && Array.isArray(stored)) {
      this.routines = stored;
    } else {
      const now = new Date().toISOString();
      this.routines = DEFAULT_ROUTINES.map((item) => ({ ...item, id: crypto.randomUUID(), createdAt: now }));
      await writeJsonFile(this.routinesFile, this.routines);
    }

    // In JARVIS autonomous mode, unblock any goals marked blocked solely due to process restart.
    if (this.config.autonomousMode && this.config.autoExecuteGoals) {
      await this.recoverRestartBlockedGoals();
    }
  }

  configure(patch: Partial<JarvisConfig>): void {
    this.config = { ...this.config, ...patch };
    appEvents.publish("jarvis.status", this.status());
    if (this.started && this.config.proactiveJarvis) {
      void this.tick();
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribeEvents = appEvents.subscribe((event) => {
      if (event.type === "task.finished") {
        const payload = event.payload as { taskId: string; success: boolean; summary: string };
        void this.onRuntimeTaskFinished(payload.taskId, payload.success, payload.summary);
      }
    });
    const interval = Math.max(1_000, this.config.tickIntervalMs ?? 4_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    this.timer.unref?.();
    void this.runTrigger("startup");
    void this.tick();
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
  }

  status() {
    return {
      running: this.started,
      config: { ...this.config },
      activeGoalRun: this.activeRun ? { ...this.activeRun } : null,
      routinesCount: this.routines.length,
      stats: { ...this.stats },
    };
  }

  listRoutines(): JarvisRoutine[] {
    return structuredClone(this.routines);
  }

  async upsertRoutine(input: {
    id?: string;
    name: string;
    trigger: JarvisRoutine["trigger"];
    intervalMin?: number;
    kind: JarvisRoutine["kind"];
    objective: string;
    enabled?: boolean;
  }): Promise<JarvisRoutine> {
    const cleanName = String(input.name || "").trim();
    const cleanObjective = String(input.objective || "").trim();
    if (!cleanName || !cleanObjective) {
      throw new Error("Routine name and objective are required.");
    }
    const existingIdx = input.id ? this.routines.findIndex((r) => r.id === input.id) : -1;
    const now = new Date().toISOString();
    const record: JarvisRoutine = {
      id: existingIdx >= 0 ? this.routines[existingIdx].id : crypto.randomUUID(),
      name: cleanName.slice(0, 120),
      trigger: input.trigger,
      ...(input.trigger === "interval" ? { intervalMin: Math.max(1, Math.min(1440, Math.round(Number(input.intervalMin ?? 30)))) } : {}),
      kind: input.kind,
      objective: cleanObjective.slice(0, 600),
      enabled: input.enabled !== false,
      lastRunAt: existingIdx >= 0 ? this.routines[existingIdx].lastRunAt : null,
      lastOutcome: existingIdx >= 0 ? this.routines[existingIdx].lastOutcome : null,
      runCount: existingIdx >= 0 ? this.routines[existingIdx].runCount : 0,
      createdAt: existingIdx >= 0 ? this.routines[existingIdx].createdAt : now,
    };
    if (existingIdx >= 0) this.routines[existingIdx] = record;
    else this.routines.push(record);
    await writeJsonFile(this.routinesFile, this.routines);
    return structuredClone(record);
  }

  async deleteRoutine(id: string): Promise<boolean> {
    const before = this.routines.length;
    this.routines = this.routines.filter((item) => item.id !== id);
    if (this.routines.length !== before) {
      await writeJsonFile(this.routinesFile, this.routines);
      return true;
    }
    return false;
  }

  async runRoutineNow(id: string): Promise<JarvisRoutine> {
    const routine = this.routines.find((item) => item.id === id);
    if (!routine) throw new Error("Routine not found.");
    await this.executeRoutine(routine);
    return structuredClone(routine);
  }

  async runTrigger(trigger: "startup" | "unlock"): Promise<void> {
    if (!this.config.proactiveJarvis) return;
    if (this.deps.authorize && !this.deps.authorize()) return;
    for (const routine of this.routines) {
      if (routine.enabled && routine.trigger === trigger) {
        await this.executeRoutine(routine);
      }
    }
  }

  /** Single scheduler pass (safe to invoke directly in tests or on goal creation). */
  async tick(): Promise<void> {
    if (this.ticking) return;
    if (!this.config.proactiveJarvis && !this.config.autoExecuteGoals) return;
    if (this.deps.authorize && !this.deps.authorize()) return;
    this.ticking = true;
    this.stats.lastTickAt = new Date().toISOString();
    try {
      await this.checkIntervalAndResourceRoutines();
      if (this.config.autoExecuteGoals) {
        await this.advanceGoals();
      }
    } catch (error) {
      log.warn("jarvis tick error", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.ticking = false;
    }
  }

  private async recoverRestartBlockedGoals(): Promise<void> {
    for (const goal of this.deps.goals.list()) {
      if (goal.status !== "blocked") continue;
      for (const task of goal.tasks) {
        if (task.status === "blocked" && /Interrupted by restart/i.test(task.error || "")) {
          await this.deps.goals.updateTask(goal.id, task.id, {
            status: "pending",
            error: null,
          });
        }
      }
    }
  }

  private async advanceGoals(): Promise<void> {
    // Reconcile stale activeRun if TaskManager already finished while disconnected.
    if (this.activeRun) {
      const session = this.deps.getTaskSession(this.activeRun.runtimeTaskId);
      if (!session || ["completed", "failed", "cancelled", "interrupted"].includes(session.state)) {
        await this.onRuntimeTaskFinished(
          this.activeRun.runtimeTaskId,
          session?.state === "completed",
          session?.result?.summary || session?.error || "Task ended.",
        );
      } else {
        return;
      }
    }

    if (this.deps.getActiveTaskId()) return;

    const goals = this.deps.goals
      .list()
      .filter((goal) => goal.status === "pending" || goal.status === "active")
      .sort((a, b) => b.priority - a.priority);

    for (const goal of goals) {
      let currentGoal = goal;
      if (currentGoal.tasks.length === 0) {
        const planned = await this.buildPlanForGoal(currentGoal);
        currentGoal = await this.deps.goals.setPlan(currentGoal.id, planned);
        this.stats.goalsAutoPlanned += 1;
        appEvents.publish("jarvis.goal_planned", { goalId: currentGoal.id, taskCount: currentGoal.tasks.length });
      }

      // Check if all tasks are already completed and only final verification remains.
      if (currentGoal.tasks.length > 0 && currentGoal.tasks.every((t) => t.status === "completed") && !currentGoal.completionVerified) {
        await this.deps.goals.verifyCompletion(currentGoal.id, [
          `Autonomous JARVIS execution completed all ${currentGoal.tasks.length} subtask(s) for "${currentGoal.objective}".`,
        ]);
        appEvents.publish("jarvis.goal_completed", { goalId: currentGoal.id, objective: currentGoal.objective });
        continue;
      }

      const nextTask = this.deps.goals.nextRunnableTask(currentGoal.id);
      if (!nextTask) continue;

      await this.dispatchGoalSubtask(currentGoal, nextTask);
      return;
    }
  }

  private async buildPlanForGoal(goal: Goal): Promise<Array<{ id: string; title: string; priority?: number; dependsOn?: string[] }>> {
    if (this.deps.planGoal) {
      try {
        const custom = await this.deps.planGoal(goal);
        if (custom.length > 0) {
          const withIds = custom.map((item, idx) => ({
            id: item.id?.trim() || `step-${idx + 1}`,
            title: item.title.trim(),
            priority: item.priority,
            rawDeps: item.dependsOn || [],
          }));
          const idSet = new Set(withIds.map((t) => t.id));
          const titleToId = new Map(withIds.map((t) => [t.title.toLowerCase(), t.id]));
          return withIds.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            dependsOn: t.rawDeps
              .map((dep) => (idSet.has(dep) ? dep : titleToId.get(dep.trim().toLowerCase()) || ""))
              .filter((dep) => Boolean(dep) && dep !== t.id),
          }));
        }
      } catch (error) {
        log.warn("custom goal planner failed; using deterministic decomposition", {
          goalId: goal.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return decomposeObjectiveDeterministically(goal.objective);
  }

  private async dispatchGoalSubtask(goal: Goal, subtask: GoalTask): Promise<void> {
    const attemptNumber = subtask.attempts + 1;
    const preface = [
      `Active Mission Objective: ${goal.objective}`,
      `Current Subtask (${attemptNumber}/${subtask.maxRetries + 1}): ${subtask.title}`,
      ...(goal.constraints.length ? [`Constraints: ${goal.constraints.join("; ")}`] : []),
      ...(goal.successCriteria.length ? [`Success Criteria: ${goal.successCriteria.join("; ")}`] : []),
      ...(subtask.error
        ? [`Previous attempt failed with: "${subtask.error}". Switch immediately to an alternate execution method (UI Automation ↔ Keyboard Shortcuts ↔ Screen Vision ↔ Direct FS/Shell).`]
        : []),
    ];
    const session = this.deps.startTask(
      `${goal.objective} — Step: ${subtask.title}`,
      "text",
      { sensitive: false, preface },
    );
    this.activeRun = {
      goalId: goal.id,
      goalTaskId: subtask.id,
      runtimeTaskId: session.id,
      startedAt: new Date().toISOString(),
    };
    this.stats.subtasksDispatched += 1;
    await this.deps.goals.updateTask(goal.id, subtask.id, {
      status: "running",
      runtimeTaskId: session.id,
      attempts: attemptNumber,
      progress: 0.25,
      error: null,
    });
    appEvents.publish("jarvis.subtask_started", {
      goalId: goal.id,
      goalTaskId: subtask.id,
      runtimeTaskId: session.id,
      title: subtask.title,
      attempt: attemptNumber,
    });
  }

  private async onRuntimeTaskFinished(runtimeTaskId: string, success: boolean, summary: string): Promise<void> {
    if (!this.activeRun || this.activeRun.runtimeTaskId !== runtimeTaskId) return;
    const { goalId, goalTaskId } = this.activeRun;
    this.activeRun = null;

    const goal = this.deps.goals.get(goalId);
    const subtask = goal?.tasks.find((item) => item.id === goalTaskId);
    if (!goal || !subtask) return;

    if (success) {
      this.stats.subtasksCompleted += 1;
      const updated = await this.deps.goals.updateTask(goalId, goalTaskId, {
        status: "completed",
        progress: 1,
        error: null,
      });
      if (updated.tasks.every((t) => t.status === "completed") && !updated.completionVerified) {
        await this.deps.goals.verifyCompletion(goalId, [
          `Verified completion of "${updated.objective}": ${summary.slice(0, 240)}`,
        ]);
        this.deps.notify?.("JARVIS Mission Complete", `${updated.objective}: ${summary.slice(0, 140)}`);
        appEvents.publish("jarvis.goal_completed", { goalId, objective: updated.objective, summary });
      }
    } else if (subtask.attempts <= subtask.maxRetries) {
      this.stats.autoRetries += 1;
      await this.deps.goals.updateTask(goalId, goalTaskId, {
        status: "pending",
        progress: 0,
        error: summary.slice(0, 300),
      });
    } else {
      await this.deps.goals.updateTask(goalId, goalTaskId, {
        status: "failed",
        progress: 0,
        error: summary.slice(0, 300),
      });
    }

    if (this.started && this.config.autoExecuteGoals) {
      setTimeout(() => {
        void this.tick();
      }, 150).unref?.();
    }
  }

  private async checkIntervalAndResourceRoutines(): Promise<void> {
    const now = Date.now();
    // Resource check at most every 45 seconds so overhead stays negligible.
    if (this.deps.selfOptimizer && now - this.lastHighLoadCheck >= 45_000) {
      this.lastHighLoadCheck = now;
      const snap = await this.deps.selfOptimizer.captureSnapshot();
      if (snap.cpuPercent >= 90 || snap.ramPercent >= 90) {
        for (const routine of this.routines) {
          if (routine.enabled && routine.trigger === "high_resource") {
            const lastMs = routine.lastRunAt ? new Date(routine.lastRunAt).getTime() : 0;
            if (now - lastMs >= 5 * 60_000) {
              await this.executeRoutine(routine);
            }
          }
        }
      }
    }

    for (const routine of this.routines) {
      if (!routine.enabled || routine.trigger !== "interval") continue;
      const intervalMs = Math.max(1, routine.intervalMin ?? 30) * 60_000;
      const lastMs = routine.lastRunAt ? new Date(routine.lastRunAt).getTime() : 0;
      if (now - lastMs >= intervalMs) {
        await this.executeRoutine(routine);
      }
    }
  }

  private async executeRoutine(routine: JarvisRoutine): Promise<void> {
    routine.lastRunAt = new Date().toISOString();
    routine.runCount += 1;
    this.stats.routinesExecuted += 1;
    try {
      if (routine.kind === "self_optimize" && this.deps.selfOptimizer) {
        const report = await this.deps.selfOptimizer.optimize({ trigger: "proactive_high_load", level: 2 });
        routine.lastOutcome = `Optimized (CPU Δ${report.deltaCpuPercent}%, RAM Δ${report.deltaRamMb} MB)`;
      } else if (routine.kind === "goal") {
        const created = await this.deps.goals.create({ objective: routine.objective, priority: 0.7 });
        routine.lastOutcome = `Created mission ${created.id}`;
      } else if (routine.kind === "task") {
        const session = this.deps.startTask(routine.objective, "text", { sensitive: false });
        routine.lastOutcome = `Started task ${session.id}`;
      }
      await writeJsonFile(this.routinesFile, this.routines);
      appEvents.publish("jarvis.routine_executed", { id: routine.id, name: routine.name, outcome: routine.lastOutcome });
    } catch (error) {
      routine.lastOutcome = `Failed: ${error instanceof Error ? error.message : String(error)}`;
      await writeJsonFile(this.routinesFile, this.routines);
    }
  }
}

export function decomposeObjectiveDeterministically(objective: string): Array<{ id: string; title: string; priority: number; dependsOn: string[] }> {
  const clean = objective.trim();
  // Split compound objectives on explicit sequential connectors ("and then", "then", ";") when meaningful.
  const segments = clean
    .split(/\s*(?:;\s*|\bthen\b|\band then\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 6);

  if (segments.length >= 2 && segments.length <= 8) {
    return segments.map((seg, idx) => ({
      id: `step-${idx + 1}`,
      title: seg,
      priority: Math.max(0.3, 0.9 - idx * 0.08),
      dependsOn: idx === 0 ? [] : [`step-${idx}`],
    }));
  }

  return [
    {
      id: "step-1",
      title: clean,
      priority: 0.85,
      dependsOn: [],
    },
  ];
}
