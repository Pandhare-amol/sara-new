import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TaskSession } from "../agent/taskSession";

export type FeedbackLabel = "positive" | "negative" | "ambiguous";

export interface FeedbackClassification { label: FeedbackLabel; reward: number; }
export interface LearningExperience {
  id: string;
  taskId: string;
  category: string;
  strategy: string;
  verified: boolean;
  outcome: "completed" | "failed" | "cancelled" | "interrupted";
  feedbackText: string;
  feedback: FeedbackClassification;
  createdAt: string;
  trainingEligible: boolean;
  failureCategory: string | null;
  verificationEvidence: string | null;
  policyVersionAtExecution: number;
}
interface StrategyStats { attempts: number; rewardTotal: number; positive: number; negative: number; }
interface LearningFile { version: 1; experiences: LearningExperience[]; strategies: Record<string, StrategyStats>; }
interface PolicySnapshot { version: number; strategies: Record<string, StrategyStats>; createdAt: string; }
export interface LearningDashboard {
  totalTasks: number; feedbackTasks: number; positive: number; negative: number; unrated: number;
  cumulativeReward: number; verifiedSuccesses: number; verifiedFailures: number; verifiedSuccessRate: number | null;
  byCategory: Record<string, { tasks: number; feedback: number; reward: number; verifiedSuccesses: number; verifiedFailures: number }>;
  strategies: Record<string, StrategyStats>; policyVersion: number; learningEnabled: boolean; lastUpdateAt: string | null;
}

const POSITIVE = /\b(good|perfect|excellent|great|amazing|works? correctly|exactly what i wanted)\b/i;
const NEGATIVE = /\b(not working|does not work|doesn't work|wrong(?: file| app| result)?|incorrect|failed|failure|bad|did not finish|didn't finish)\b/i;
const normalize = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 1000);

export function classifyFeedback(text: string): FeedbackClassification {
  const value = normalize(text);
  if (!value) return { label: "ambiguous", reward: 0 };
  const negative = NEGATIVE.test(value) || /\bnot\s+(?:good|perfect|great|excellent)\b/i.test(value);
  const positive = POSITIVE.test(value);
  if (negative && positive) return { label: "ambiguous", reward: 0 };
  if (negative) return { label: "negative", reward: -2 };
  if (positive) return { label: "positive", reward: 1 };
  return { label: "ambiguous", reward: 0 };
}

export class ReinforcementLearningStore {
  private file: LearningFile = { version: 1, experiences: [], strategies: {} };
  private loaded = false;
  private write: Promise<void> = Promise.resolve();
  private policyVersion = 1;
  private learningEnabled = true;
  private lastUpdateAt: string | null = null;
  private snapshots: PolicySnapshot[] = [];
  private shadowMode = false;

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<LearningFile>;
      this.file = {
        version: 1,
        experiences: Array.isArray(parsed.experiences) ? parsed.experiences.map((item) => ({ trainingEligible: true, failureCategory: null, verificationEvidence: null, policyVersionAtExecution: 1, ...item })) : [],
        strategies: parsed.strategies && typeof parsed.strategies === "object" ? parsed.strategies : {},
      };
      this.policyVersion = Number((parsed as Partial<LearningFile> & { policyVersion?: number }).policyVersion) || 1;
      this.learningEnabled = (parsed as Partial<LearningFile> & { learningEnabled?: boolean }).learningEnabled !== false;
      this.lastUpdateAt = (parsed as Partial<LearningFile> & { lastUpdateAt?: string | null }).lastUpdateAt || null;
      this.snapshots = Array.isArray((parsed as Partial<LearningFile> & { snapshots?: PolicySnapshot[] }).snapshots) ? (parsed as Partial<LearningFile> & { snapshots?: PolicySnapshot[] }).snapshots! : [];
      this.shadowMode = (parsed as Partial<LearningFile> & { shadowMode?: boolean }).shadowMode === true;
    } catch { /* first run or unreadable optional learning file */ }
    this.loaded = true;
  }

  recordTask(session: TaskSession): Promise<void> {
    this.assertLoaded();
    const existing = this.file.experiences.find((item) => item.taskId === session.id);
    if (existing) return Promise.resolve();
    const strategy = session.actions[0]?.tool || "unresolved";
    this.file.experiences.push({
      id: randomUUID(), taskId: session.id, category: inferCategory(session.goal), strategy,
      verified: session.result?.success === true && session.actions.every((action) => action.verification?.passed !== false),
      outcome: session.state as LearningExperience["outcome"], feedbackText: "",
      feedback: { label: "ambiguous", reward: 0 }, createdAt: new Date().toISOString(), trainingEligible: true,
      failureCategory: classifyFailure(session), verificationEvidence: session.actions.at(-1)?.verification?.evidence || null,
      policyVersionAtExecution: this.policyVersion,
    });
    return this.persist();
  }

  async processFeedback(taskId: string, text: string): Promise<{ saved: boolean; classification: FeedbackClassification; reason?: string }> {
    this.assertLoaded();
    const classification = classifyFeedback(text);
    if (classification.label === "ambiguous") return { saved: false, classification, reason: "ambiguous_feedback" };
    const experience = this.file.experiences.find((item) => item.taskId === taskId);
    if (!experience) return { saved: false, classification, reason: "task_not_found" };
    if (experience.feedbackText) return { saved: false, classification, reason: "feedback_already_processed" };
    experience.feedbackText = normalize(text);
    experience.feedback = classification;
    if (!this.learningEnabled) { await this.persist(); return { saved: true, classification, reason: "learning_paused" }; }
    const key = `${experience.category}:${experience.strategy}`;
    const stats = this.file.strategies[key] ||= { attempts: 0, rewardTotal: 0, positive: 0, negative: 0 };
    stats.attempts += 1; stats.rewardTotal += classification.reward;
    if (classification.reward > 0) stats.positive += 1; else stats.negative += 1;
    this.lastUpdateAt = new Date().toISOString();
    await this.persist();
    return { saved: true, classification };
  }
  async correctFeedback(id: string, text: string): Promise<boolean> {
    this.assertLoaded(); const item = this.file.experiences.find((entry) => entry.id === id); if (!item) return false;
    item.feedbackText = normalize(text); item.feedback = classifyFeedback(text); this.rebuildStats(); this.lastUpdateAt = new Date().toISOString(); await this.persist(); return true;
  }

  chooseStrategy(category: string, candidates: string[]): string {
    this.assertLoaded();
    return [...candidates].sort((a, b) => this.mean(category, b) - this.mean(category, a))[0] || candidates[0];
  }

  list(): LearningExperience[] { this.assertLoaded(); return structuredClone(this.file.experiences); }
  stats(): Record<string, StrategyStats> { this.assertLoaded(); return structuredClone(this.file.strategies); }
  dashboard(): LearningDashboard {
    this.assertLoaded();
    const byCategory: LearningDashboard["byCategory"] = {};
    let positive = 0; let negative = 0; let feedbackTasks = 0; let cumulativeReward = 0; let verifiedSuccesses = 0; let verifiedFailures = 0;
    for (const item of this.file.experiences) {
      const row = byCategory[item.category] ||= { tasks: 0, feedback: 0, reward: 0, verifiedSuccesses: 0, verifiedFailures: 0 };
      row.tasks += 1;
      if (item.feedbackText) { feedbackTasks += 1; row.feedback += 1; cumulativeReward += item.feedback.reward; if (item.feedback.reward > 0) positive += 1; if (item.feedback.reward < 0) negative += 1; row.reward += item.feedback.reward; }
      if (item.verified && item.outcome === "completed") { verifiedSuccesses += 1; row.verifiedSuccesses += 1; }
      if (item.verified && item.outcome !== "completed") { verifiedFailures += 1; row.verifiedFailures += 1; }
    }
    const eligible = verifiedSuccesses + verifiedFailures;
    return { totalTasks: this.file.experiences.length, feedbackTasks, positive, negative, unrated: this.file.experiences.length - feedbackTasks, cumulativeReward, verifiedSuccesses, verifiedFailures, verifiedSuccessRate: eligible ? verifiedSuccesses / eligible : null, byCategory, strategies: this.stats(), policyVersion: this.policyVersion, learningEnabled: this.learningEnabled, lastUpdateAt: this.lastUpdateAt };
  }
  setLearningEnabled(enabled: boolean): Promise<void> { this.learningEnabled = enabled; return this.persist(); }
  async train(): Promise<{ accepted: boolean; policyVersion: number; eligible: number; reason: string }> {
    this.assertLoaded();
    if (!this.learningEnabled) return { accepted: false, policyVersion: this.policyVersion, eligible: 0, reason: "learning_paused" };
    const eligible = this.file.experiences.filter((item) => item.trainingEligible && item.feedbackText && item.feedback.label !== "ambiguous");
    if (eligible.length < 2) return { accepted: false, policyVersion: this.policyVersion, eligible: eligible.length, reason: "insufficient_data" };
    const holdout = eligible.filter((_, index) => index % 5 === 0);
    const training = eligible.filter((_, index) => index % 5 !== 0);
    if (holdout.length === 0 || training.length === 0) return { accepted: false, policyVersion: this.policyVersion, eligible: eligible.length, reason: "insufficient_holdout_data" };
    const baseline = holdout.filter((item) => item.verified && item.outcome === "completed").length / holdout.length;
    const candidate = training.filter((item) => item.verified && item.outcome === "completed").length / training.length;
    if (candidate < baseline) return { accepted: false, policyVersion: this.policyVersion, eligible: eligible.length, reason: "candidate_regressed_on_available_evidence" };
    this.snapshots.push({ version: this.policyVersion, strategies: structuredClone(this.file.strategies), createdAt: new Date().toISOString() });
    this.snapshots = this.snapshots.slice(-10); this.policyVersion += 1; this.lastUpdateAt = new Date().toISOString(); await this.persist();
    return { accepted: true, policyVersion: this.policyVersion, eligible: eligible.length, reason: "policy_updated_from_recorded_rewards" };
  }
  async setTrainingEligibility(id: string, eligible: boolean): Promise<boolean> {
    this.assertLoaded(); const item = this.file.experiences.find((entry) => entry.id === id); if (!item) return false;
    item.trainingEligible = eligible; await this.persist(); return true;
  }
  async resetPolicy(): Promise<void> { this.assertLoaded(); this.file.strategies = {}; this.policyVersion += 1; this.lastUpdateAt = new Date().toISOString(); await this.persist(); }
  async rollback(version: number): Promise<boolean> { this.assertLoaded(); const snapshot = this.snapshots.find((item) => item.version === version); if (!snapshot) return false; this.file.strategies = structuredClone(snapshot.strategies); this.policyVersion += 1; this.lastUpdateAt = new Date().toISOString(); await this.persist(); return true; }
  setShadowMode(enabled: boolean): Promise<void> { this.shadowMode = enabled; return this.persist(); }
  isShadowMode(): boolean { return this.shadowMode; }
  snapshotsList(): PolicySnapshot[] { return structuredClone(this.snapshots); }
  exportData(): string { this.assertLoaded(); return JSON.stringify({ format: "sara-learning", version: 1, experiences: this.file.experiences.map(({ feedbackText, ...item }) => ({ ...item, feedbackText })), strategies: this.file.strategies }, null, 2); }
  async importData(raw: unknown): Promise<number> { this.assertLoaded(); const input = typeof raw === "string" ? JSON.parse(raw) : raw as { format?: string; version?: number; experiences?: LearningExperience[] }; if (input?.format !== "sara-learning" || input.version !== 1 || !Array.isArray(input.experiences)) throw new Error("Invalid learning export format."); let count = 0; for (const item of input.experiences) { if (!item?.id || !item.taskId || !item.category || !item.strategy || ![-2, 0, 1].includes(item.feedback?.reward)) continue; if (!this.file.experiences.some((existing) => existing.id === item.id)) { this.file.experiences.push({ trainingEligible: false, failureCategory: null, verificationEvidence: null, policyVersionAtExecution: 1, ...item }); count += 1; } } this.rebuildStats(); await this.persist(); return count; }
  private mean(category: string, strategy: string): number {
    const item = this.file.strategies[`${category}:${strategy}`];
    return item?.attempts ? item.rewardTotal / item.attempts : 0;
  }
  private rebuildStats(): void { this.file.strategies = {}; for (const item of this.file.experiences) { if (!item.feedbackText || !item.trainingEligible || item.feedback.label === "ambiguous") continue; const key = `${item.category}:${item.strategy}`; const stats = this.file.strategies[key] ||= { attempts: 0, rewardTotal: 0, positive: 0, negative: 0 }; stats.attempts += 1; stats.rewardTotal += item.feedback.reward; if (item.feedback.reward > 0) stats.positive += 1; else stats.negative += 1; } }
  private assertLoaded(): void { if (!this.loaded) throw new Error("ReinforcementLearningStore.initialize() must be called first."); }
  private async persist(): Promise<void> {
    const temp = `${this.filePath}.${process.pid}.tmp`;
    this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ ...this.file, policyVersion: this.policyVersion, learningEnabled: this.learningEnabled, lastUpdateAt: this.lastUpdateAt, snapshots: this.snapshots, shadowMode: this.shadowMode }, null, 2), "utf8"); await fs.rename(temp, this.filePath); });
    await this.write;
  }
}

function inferCategory(goal: string): string {
  if (/\b(open|file|folder|copy|move|delete)\b/i.test(goal)) return "file_operation";
  if (/\b(app|application|launch|close|window)\b/i.test(goal)) return "application_control";
  return "general_task";
}

function classifyFailure(session: TaskSession): string | null {
  const action = session.actions.at(-1);
  if (action?.failureCategory) return action.failureCategory;
  if (action?.verification?.passed === false) return "VERIFICATION_FAILED";
  if (session.state === "interrupted") return "TASK_INTERRUPTED";
  if (session.state === "cancelled") return "TASK_CANCELLED";
  return session.state === "failed" ? "UNKNOWN_FAILURE" : null;
}
