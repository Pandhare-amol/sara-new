/**
 * Two-Agent Capability Evaluation & Self-Improvement Loop.
 *
 * Agent 1 — SARA Operator, Mission Assigner & Capability Evaluator:
 *   Discovers installed applications across 12 real-world categories, generates
 *   bounded missions, assigns them through SARA's live TaskManager, verifies
 *   execution evidence, and classifies outcomes honestly.
 *
 * Agent 2 — SARA Developer & System Improver:
 *   Inspects structured failure reports from Agent 1, diagnoses root causes
 *   (UI Automation gap, path resolution, selector mismatch, timeout, missing
 *   adapter), prepares isolated improvement proposals, and schedules retests.
 */
import crypto from "node:crypto";
import path from "node:path";
import type { TaskSession } from "../agent/taskSession";
import { appEvents } from "../shared/appEvents";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";

export type AppCategory =
  | "development"
  | "browsers"
  | "email_communication"
  | "office_productivity"
  | "business_finance"
  | "design_media"
  | "video_audio"
  | "file_management"
  | "database_devtools"
  | "social_media"
  | "system_utilities"
  | "other";

export type MissionOutcome =
  | "completed_independently"
  | "completed_with_approval"
  | "partially_completed"
  | "failed"
  | "capability_unavailable"
  | "not_tested";

export interface InstalledAppEntry {
  id: string;
  name: string;
  executableOrTarget: string;
  category: AppCategory;
  source: "windows_bridge" | "desktop_agent" | "system_probe";
  discoveredAt: string;
}

export interface EvaluationMission {
  id: string;
  appName: string;
  category: AppCategory;
  title: string;
  goalPrompt: string;
  difficulty: "basic" | "intermediate" | "advanced";
  safetyTier: "safe_local" | "external_impact";
  outcome: MissionOutcome;
  runtimeTaskId: string | null;
  attempts: number;
  evidence: string[];
  failureReason: string | null;
  agent2Diagnosis: Agent2Diagnosis | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent2Diagnosis {
  diagnosedAt: string;
  rootCauseCategory:
    | "uia_inaccessible"
    | "element_locator_mismatch"
    | "app_launch_or_path"
    | "permission_or_auth_gate"
    | "model_or_timeout"
    | "missing_tool_adapter"
    | "unknown";
  affectedSubsystem: string;
  recommendedFallback: string;
  proposedFixSummary: string;
  improvementProposalId?: string | null;
  readyForRetest: boolean;
}

interface PersistedTwoAgentState {
  version: 1;
  inventory: InstalledAppEntry[];
  missions: EvaluationMission[];
}

export interface TwoAgentCoordinatorDeps {
  dataDir: string;
  discoverApps: () => Promise<Array<{ name: string; target?: string; source?: InstalledAppEntry["source"] }>>;
  startTask: (goal: string, origin: TaskSession["origin"], options?: { sensitive?: boolean; preface?: string[] }) => TaskSession;
  getTaskSession: (taskId: string) => TaskSession | undefined;
  createImprovementProposal?: (input: { title: string; rationale: string; targetFiles: string[] }) => Promise<{ id: string } | null>;
}

const CATEGORY_RULES: Array<{ category: AppCategory; pattern: RegExp }> = [
  { category: "development", pattern: /\b(visual studio|vscode|code|cursor|pycharm|intellij|webstorm|git|powershell|terminal|cmd|node|python|sublime|notepad\+\+)\b/i },
  { category: "browsers", pattern: /\b(chrome|edge|firefox|brave|opera|vivaldi|arc)\b/i },
  { category: "email_communication", pattern: /\b(outlook|thunderbird|teams|slack|zoom|discord|whatsapp|telegram|skype|mail)\b/i },
  { category: "office_productivity", pattern: /\b(word|excel|powerpoint|onenote|libreoffice|notion|obsidian|acrobat|pdf|notepad|writer|calc)\b/i },
  { category: "business_finance", pattern: /\b(tally|quickbooks|sap|zoho|salesforce|calculator|finance|billing)\b/i },
  { category: "design_media", pattern: /\b(photoshop|illustrator|figma|canva|gimp|blender|inkscape|paint|snipping|photos)\b/i },
  { category: "video_audio", pattern: /\b(vlc|spotify|obs|premiere|davinci|audacity|media player|capcut|itunes)\b/i },
  { category: "file_management", pattern: /\b(explorer|7-zip|winrar|winzip|everything|onedrive|dropbox|google drive|total commander)\b/i },
  { category: "database_devtools", pattern: /\b(postman|docker|dbeaver|pgadmin|mongodb|mysql|sqlite|insomnia|wireshark|putty)\b/i },
  { category: "social_media", pattern: /\b(instagram|facebook|linkedin|twitter|x|youtube|reddit|tiktok)\b/i },
  { category: "system_utilities", pattern: /\b(task manager|settings|control panel|defender|security|device manager|registry|disk cleanup|resource monitor)\b/i },
];

export function categorizeApplication(name: string): AppCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(name)) return rule.category;
  }
  return "other";
}

export class TwoAgentEvaluationCoordinator {
  private readonly stateFile: string;
  private state: PersistedTwoAgentState = { version: 1, inventory: [], missions: [] };
  private loaded = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: TwoAgentCoordinatorDeps) {
    this.stateFile = path.join(deps.dataDir, "evaluator", "two-agent-state.v1.json");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    const stored = await readJsonFile<PersistedTwoAgentState | null>(this.stateFile, null);
    if (stored && stored.version === 1) {
      this.state = {
        version: 1,
        inventory: Array.isArray(stored.inventory) ? stored.inventory : [],
        missions: Array.isArray(stored.missions) ? stored.missions : [],
      };
    }
    this.unsubscribe = appEvents.subscribe((event) => {
      if (event.type === "task.finished") {
        const payload = event.payload as { taskId: string; success: boolean; summary: string };
        void this.reconcileTaskOutcome(payload.taskId);
      }
    });
    this.loaded = true;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async refreshInventory(): Promise<InstalledAppEntry[]> {
    await this.initialize();
    const raw = await this.deps.discoverApps();
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const entries: InstalledAppEntry[] = [];

    for (const item of raw) {
      const cleanName = String(item.name || "").trim();
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        id: `app-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 10)}`,
        name: cleanName,
        executableOrTarget: String(item.target || cleanName),
        category: categorizeApplication(cleanName),
        source: item.source || "system_probe",
        discoveredAt: now,
      });
    }

    this.state.inventory = entries;
    await this.save();
    return structuredClone(entries);
  }

  /** Agent 1: Generate bounded, non-destructive capability missions from discovered apps. */
  async generateMissionsForInventory(maxMissions = 24): Promise<EvaluationMission[]> {
    await this.initialize();
    if (this.state.inventory.length === 0) {
      await this.refreshInventory();
    }
    const existingKeys = new Set(this.state.missions.map((m) => `${m.appName.toLowerCase()}::${m.difficulty}`));
    const now = new Date().toISOString();
    const created: EvaluationMission[] = [];

    for (const app of this.state.inventory) {
      if (created.length >= maxMissions) break;
      const key = `${app.name.toLowerCase()}::basic`;
      if (existingKeys.has(key)) continue;
      const spec = buildSafeAppMission(app);
      const mission: EvaluationMission = {
        id: crypto.randomUUID(),
        appName: app.name,
        category: app.category,
        title: spec.title,
        goalPrompt: spec.goalPrompt,
        difficulty: spec.difficulty,
        safetyTier: "safe_local",
        outcome: "not_tested",
        runtimeTaskId: null,
        attempts: 0,
        evidence: [],
        failureReason: null,
        agent2Diagnosis: null,
        createdAt: now,
        updatedAt: now,
      };
      this.state.missions.push(mission);
      created.push(mission);
      existingKeys.add(key);
    }

    if (created.length > 0) await this.save();
    return structuredClone(created);
  }

  async createCustomMission(input: {
    appName: string;
    title: string;
    goalPrompt: string;
    difficulty?: EvaluationMission["difficulty"];
    safetyTier?: EvaluationMission["safetyTier"];
  }): Promise<EvaluationMission> {
    await this.initialize();
    const appName = String(input.appName || "System").trim();
    const title = String(input.title || "").trim();
    const goalPrompt = String(input.goalPrompt || "").trim();
    if (!title || !goalPrompt) throw new Error("Mission title and goalPrompt are required.");
    const now = new Date().toISOString();
    const mission: EvaluationMission = {
      id: crypto.randomUUID(),
      appName,
      category: categorizeApplication(appName),
      title,
      goalPrompt,
      difficulty: input.difficulty || "intermediate",
      safetyTier: input.safetyTier || "safe_local",
      outcome: "not_tested",
      runtimeTaskId: null,
      attempts: 0,
      evidence: [],
      failureReason: null,
      agent2Diagnosis: null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.missions.push(mission);
    await this.save();
    return structuredClone(mission);
  }

  /** Agent 1: Assign and execute a mission through SARA's live TaskManager. */
  async runMission(missionId: string): Promise<EvaluationMission> {
    await this.initialize();
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const preface = [
      `[AGENT-1 CAPABILITY EVALUATION] Application: ${mission.appName} (${mission.category})`,
      "Complete the mission using verified tools. If the primary UI method fails, automatically fall back to keyboard shortcuts, screen vision, or direct filesystem/CLI verification.",
      ...(mission.agent2Diagnosis
        ? [`[AGENT-2 RETEST GUIDANCE] ${mission.agent2Diagnosis.recommendedFallback}`]
        : []),
    ];

    const session = this.deps.startTask(mission.goalPrompt, "text", {
      sensitive: mission.safetyTier === "external_impact",
      preface,
    });
    mission.runtimeTaskId = session.id;
    mission.attempts += 1;
    mission.updatedAt = new Date().toISOString();
    await this.save();
    appEvents.publish("evaluator.mission_started", { missionId: mission.id, runtimeTaskId: session.id });
    return structuredClone(mission);
  }

  /** Agent 1: Evaluate the real TaskSession evidence and classify the outcome honestly. */
  async reconcileTaskOutcome(runtimeTaskId: string): Promise<EvaluationMission | null> {
    await this.initialize();
    const mission = this.state.missions.find((item) => item.runtimeTaskId === runtimeTaskId);
    if (!mission) return null;
    const session = this.deps.getTaskSession(runtimeTaskId);
    if (!session) return null;

    const okActions = (session.actions ?? []).filter((a) => a.status === "ok");
    const manualApprovals = (session.permissions ?? []).filter((p) => p.outcome === "approved" && p.scope !== "JARVIS Autonomous Mode");
    mission.evidence = [
      ...okActions.slice(-8).map((a) => `${a.tool}: ${a.summary}`),
      ...(session.result?.summary ? [`Result: ${session.result.summary}`] : []),
    ];
    mission.updatedAt = new Date().toISOString();

    if (session.state === "completed" && session.result?.success) {
      mission.outcome = manualApprovals.length > 0 ? "completed_with_approval" : "completed_independently";
      mission.failureReason = null;
    } else if (okActions.length > 0 && session.state === "failed") {
      const unavailable = /not installed|unavailable|not configured|unsupported/i.test(session.error || session.result?.summary || "");
      mission.outcome = unavailable ? "capability_unavailable" : "partially_completed";
      mission.failureReason = session.error || session.result?.summary || "Task stopped after partial progress.";
    } else if (session.state === "failed" || session.state === "cancelled") {
      const unavailable = /not installed|unavailable|not configured|unsupported/i.test(session.error || "");
      mission.outcome = unavailable ? "capability_unavailable" : "failed";
      mission.failureReason = session.error || session.result?.summary || "Mission failed.";
    }

    await this.save();
    if (mission.outcome === "failed" || mission.outcome === "partially_completed") {
      await this.diagnoseFailureWithAgent2(mission.id);
    }
    appEvents.publish("evaluator.mission_evaluated", structuredClone(mission));
    return structuredClone(mission);
  }

  /** Agent 2: Diagnose why a mission failed and prepare concrete fallback/code improvement guidance. */
  async diagnoseFailureWithAgent2(missionId: string): Promise<Agent2Diagnosis> {
    await this.initialize();
    const mission = this.state.missions.find((item) => item.id === missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const session = mission.runtimeTaskId ? this.deps.getTaskSession(mission.runtimeTaskId) : undefined;
    const errorText = [
      mission.failureReason || "",
      ...(session?.actions.filter((a) => a.status !== "ok").map((a) => `${a.tool}:${a.failureCategory || ""}:${a.error || ""}`) || []),
    ].join(" | ");

    let rootCauseCategory: Agent2Diagnosis["rootCauseCategory"] = "unknown";
    let affectedSubsystem = "agent/loop.ts";
    let recommendedFallback = "Use structured fs.* / app.* tools first, then verify via screen.look.";
    let proposedFixSummary = "Strengthen planner fallback ordering and post-action verification.";

    if (/ELEMENT_NOT_FOUND|no accessible|inspectUi/i.test(errorText)) {
      rootCauseCategory = "uia_inaccessible";
      affectedSubsystem = "agent/perception/engine.ts";
      recommendedFallback = "Target window exposes sparse UIA controls — switch immediately to keyboard shortcuts (app.focus + keyboard.hotkey) or screen.locate visual grounding.";
      proposedFixSummary = "Auto-trigger vision grounding and keyboard shortcut map when UIA control count is sparse.";
    } else if (/WINDOW_NOT_OPEN|not found|cannot find|app\.launch/i.test(errorText)) {
      rootCauseCategory = "app_launch_or_path";
      affectedSubsystem = "agent/actions/executor.ts";
      recommendedFallback = "Resolve exact Start Menu AppID / executable path via shell.run Get-StartApps or open target file directly with fs.open.";
      proposedFixSummary = "Expand Start Menu alias matching and executable path discovery before app.launch fails.";
    } else if (/PERMISSION_DENIED|locked|approve/i.test(errorText)) {
      rootCauseCategory = "permission_or_auth_gate";
      affectedSubsystem = "permissions/engine.ts";
      recommendedFallback = "Verify SARA Security Shield session is unlocked and JARVIS Autonomous Mode is enabled.";
      proposedFixSummary = "Ensure autonomous override propagates across ActionExecutor and ConfirmationBroker.";
    } else if (/MODEL_FAILURE|timeout|Time limit/i.test(errorText)) {
      rootCauseCategory = "model_or_timeout";
      affectedSubsystem = "agent/planner/stepPlanner.ts";
      recommendedFallback = "Reduce batch size to single deterministic actions and prefer direct CLI/filesystem operations over multi-step GUI clicks.";
      proposedFixSummary = "Add fast deterministic shortcut path for common desktop operations.";
    } else if (/INVALID_ACTION|Unknown action/i.test(errorText)) {
      rootCauseCategory = "missing_tool_adapter";
      affectedSubsystem = "agent/actions/schema.ts";
      recommendedFallback = "Map the requested operation onto supported ActionExecutor tools (fs.*, app.*, ui.*, browser.*, shell.run).";
      proposedFixSummary = "Register dedicated action adapter or alias in schema.ts.";
    } else if (/VERIFICATION_FAILED|UNEXPECTED_UI/i.test(errorText)) {
      rootCauseCategory = "element_locator_mismatch";
      affectedSubsystem = "agent/fallbackStrategies.ts";
      recommendedFallback = "Capture fresh observation with screen.look and verify window foreground state before acting.";
      proposedFixSummary = "Tighten foreground verification and visual locator fallback.";
    }

    let proposalId: string | null = null;
    if (this.deps.createImprovementProposal) {
      const created = await this.deps
        .createImprovementProposal({
          title: `[Agent-2] Fix ${rootCauseCategory} in ${mission.appName}`,
          rationale: `Mission "${mission.title}" (${mission.outcome}): ${proposedFixSummary}`,
          targetFiles: [affectedSubsystem],
        })
        .catch(() => null);
      proposalId = created?.id ?? null;
    }

    const diagnosis: Agent2Diagnosis = {
      diagnosedAt: new Date().toISOString(),
      rootCauseCategory,
      affectedSubsystem,
      recommendedFallback,
      proposedFixSummary,
      improvementProposalId: proposalId,
      readyForRetest: true,
    };

    mission.agent2Diagnosis = diagnosis;
    mission.updatedAt = diagnosis.diagnosedAt;
    await this.save();
    appEvents.publish("evaluator.agent2_diagnosed", { missionId: mission.id, diagnosis });
    return structuredClone(diagnosis);
  }

  getSummary() {
    const byCategory: Record<string, { apps: number; missions: number; completed: number }> = {};
    for (const app of this.state.inventory) {
      byCategory[app.category] ||= { apps: 0, missions: 0, completed: 0 };
      byCategory[app.category].apps += 1;
    }
    const byOutcome: Record<MissionOutcome, number> = {
      completed_independently: 0,
      completed_with_approval: 0,
      partially_completed: 0,
      failed: 0,
      capability_unavailable: 0,
      not_tested: 0,
    };
    for (const mission of this.state.missions) {
      byOutcome[mission.outcome] = (byOutcome[mission.outcome] || 0) + 1;
      byCategory[mission.category] ||= { apps: 0, missions: 0, completed: 0 };
      byCategory[mission.category].missions += 1;
      if (mission.outcome === "completed_independently" || mission.outcome === "completed_with_approval") {
        byCategory[mission.category].completed += 1;
      }
    }
    const tested = this.state.missions.filter((m) => m.outcome !== "not_tested").length;
    const succeeded = byOutcome.completed_independently + byOutcome.completed_with_approval;
    return {
      totalDiscoveredApps: this.state.inventory.length,
      totalMissions: this.state.missions.length,
      testedMissions: tested,
      autonomousCompletionRate: tested > 0 ? Math.round((byOutcome.completed_independently / tested) * 100) : 0,
      overallCompletionRate: tested > 0 ? Math.round((succeeded / tested) * 100) : 0,
      byOutcome,
      byCategory,
      pendingAgent2Retests: this.state.missions.filter((m) => m.agent2Diagnosis?.readyForRetest).length,
      inventory: structuredClone(this.state.inventory),
      missions: structuredClone(this.state.missions),
    };
  }

  private async save(): Promise<void> {
    await writeJsonFile(this.stateFile, this.state);
  }
}

function buildSafeAppMission(app: InstalledAppEntry): {
  title: string;
  goalPrompt: string;
  difficulty: EvaluationMission["difficulty"];
} {
  switch (app.category) {
    case "browsers":
      return {
        title: `Open ${app.name} and verify active window state`,
        goalPrompt: `Launch or focus ${app.name}, verify its window is open on screen, and report the current window title without modifying user bookmarks or accounts.`,
        difficulty: "basic",
      };
    case "office_productivity":
      return {
        title: `Verify ${app.name} document workflow readiness`,
        goalPrompt: `Launch or inspect ${app.name}, confirm it opens cleanly, and verify readiness for creating or viewing local documents without overwriting existing files.`,
        difficulty: "basic",
      };
    case "file_management":
      return {
        title: `Inspect workspace directory with ${app.name}`,
        goalPrompt: `List the user's Documents or Desktop directory non-destructively, verify ${app.name} availability, and summarize the top items.`,
        difficulty: "basic",
      };
    default:
      return {
        title: `Launch & inspect ${app.name}`,
        goalPrompt: `Verify ${app.name} can be discovered, launched or focused cleanly, inspect its main window controls, and report its operational status without destructive changes.`,
        difficulty: "basic",
      };
  }
}
