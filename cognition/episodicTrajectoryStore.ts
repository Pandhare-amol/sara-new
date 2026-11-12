/**
 * Layer 4: Episodic Trajectory Memory & Reinforcement Learning Engine.
 *
 * Converts SARA's memory from static fact recall into experience-driven
 * reinforcement learning — storing full action trajectories, computing local
 * dense cosine-similarity embeddings (zero external DB / zero Ollama needed),
 * assigning positive/negative RL reward weights from execution/compilation
 * outcomes, and retrieving relevant successes & past mistakes BEFORE every
 * new autonomous task.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { TaskSession } from "../agent/taskSession";

const VECTOR_DIM = 128;
const MAX_TRAJECTORIES = 500;

export interface TrajectoryStepRecord {
  step: number;
  action: string;
  argsSummary: string;
  ok: boolean;
  exitCode?: number | null;
  outputSnippet?: string;
  reflection: string;
  rewardDelta: number;
}

export interface EpisodicTrajectory {
  id: string;
  objective: string;
  triggerSource: "user" | "voice" | "file_dropped" | "cpu_spike" | "scheduled" | "self_generated" | "task_loop";
  plan: string[];
  steps: TrajectoryStepRecord[];
  outcome: "succeeded" | "failed";
  summary: string;
  totalReward: number;
  embedding: number[];
  createdAt: string;
}

export interface ToolRlStats {
  attempts: number;
  successes: number;
  failures: number;
  cumulativeReward: number;
  meanReward: number;
}

interface TrajectoryStoreFile {
  version: 1;
  trajectories: EpisodicTrajectory[];
  toolStats: Record<string, ToolRlStats>;
  cumulativeReward: number;
}

export interface RetrievedExperience {
  trajectory: Omit<EpisodicTrajectory, "embedding">;
  similarity: number;
}

function fnv1aHash(token: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic 128-dim L2-normalized hashed word + bigram + char-trigram
 * vector embedding for fast local cosine-similarity experience retrieval.
 */
export function embedExperienceText(text: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\u0900-\u097f_./\\-]+/g, " ").trim();
  if (!cleaned) return vec;

  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]!;
    const idx = fnv1aHash(w) % VECTOR_DIM;
    const sign = (fnv1aHash(w, 1315423911) & 1) === 0 ? 1 : -1;
    vec[idx] += sign * 1.5;

    if (i + 1 < words.length) {
      const bigram = `${w}_${words[i + 1]}`;
      const bIdx = fnv1aHash(bigram) % VECTOR_DIM;
      const bSign = (fnv1aHash(bigram, 2654435761) & 1) === 0 ? 1 : -1;
      vec[bIdx] += bSign * 1.2;
    }

    for (let c = 0; c + 3 <= w.length; c += 1) {
      const tri = w.slice(c, c + 3);
      const tIdx = fnv1aHash(tri) % VECTOR_DIM;
      vec[tIdx] += 0.35;
    }
  }

  let normSq = 0;
  for (const v of vec) normSq += v * v;
  const norm = Math.sqrt(normSq);
  if (norm > 1e-8) {
    for (let i = 0; i < VECTOR_DIM; i += 1) {
      vec[i] = Number((vec[i]! / norm).toFixed(5));
    }
  }
  return vec;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-8 ? dot / denom : 0;
}

export function computeStepReward(step: { ok: boolean; exitCode?: number | null; action: string }): number {
  if (step.ok && (step.exitCode === undefined || step.exitCode === null || step.exitCode === 0)) {
    const isCodeOrShell = /execute_cmd|write_script|shell\.run|runOsCommand|runPythonScript/i.test(step.action);
    return isCodeOrShell ? 0.6 : 0.35;
  }
  return -0.65;
}

export class EpisodicTrajectoryStore {
  private readonly filePath: string;
  private data: TrajectoryStoreFile = {
    version: 1,
    trajectories: [],
    toolStats: {},
    cumulativeReward: 0,
  };
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "learning", "trajectories.v1.json");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<TrajectoryStoreFile>;
      if (Array.isArray(raw.trajectories)) {
        this.data = {
          version: 1,
          trajectories: raw.trajectories.slice(-MAX_TRAJECTORIES),
          toolStats: raw.toolStats && typeof raw.toolStats === "object" ? raw.toolStats : {},
          cumulativeReward: Number(raw.cumulativeReward) || 0,
        };
      }
    } catch {
      /* fresh episodic store */
    }
    this.loaded = true;
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    this.writeChain = this.writeChain
      .then(() => fs.writeFile(this.filePath, payload, "utf8"))
      .catch(() => undefined);
    return this.writeChain;
  }

  async recordTrajectory(input: {
    objective: string;
    triggerSource: EpisodicTrajectory["triggerSource"];
    plan: string[];
    steps: TrajectoryStepRecord[];
    outcome: "succeeded" | "failed";
    summary: string;
  }): Promise<EpisodicTrajectory> {
    await this.initialize();
    const stepSum = input.steps.reduce((acc, s) => acc + s.rewardDelta, 0);
    const terminalBonus = input.outcome === "succeeded" ? 1.5 : -1.5;
    const totalReward = Number((stepSum + terminalBonus).toFixed(3));

    const trajectory: EpisodicTrajectory = {
      id: randomUUID(),
      objective: input.objective.trim().slice(0, 500),
      triggerSource: input.triggerSource,
      plan: input.plan.slice(0, 10),
      steps: input.steps.slice(0, 30),
      outcome: input.outcome,
      summary: input.summary.slice(0, 500),
      totalReward,
      embedding: embedExperienceText(`${input.objective} ${input.steps.map((s) => s.action).join(" ")}`),
      createdAt: new Date().toISOString(),
    };

    for (const s of trajectory.steps) {
      const current = this.data.toolStats[s.action] || {
        attempts: 0,
        successes: 0,
        failures: 0,
        cumulativeReward: 0,
        meanReward: 0,
      };
      current.attempts += 1;
      if (s.ok) current.successes += 1;
      else current.failures += 1;
      current.cumulativeReward = Number((current.cumulativeReward + s.rewardDelta).toFixed(3));
      current.meanReward = Number((current.cumulativeReward / current.attempts).toFixed(3));
      this.data.toolStats[s.action] = current;
    }

    this.data.cumulativeReward = Number((this.data.cumulativeReward + totalReward).toFixed(3));
    this.data.trajectories.push(trajectory);
    if (this.data.trajectories.length > MAX_TRAJECTORIES) {
      this.data.trajectories.splice(0, this.data.trajectories.length - MAX_TRAJECTORIES);
    }
    await this.persist();
    return trajectory;
  }

  async recordFromTaskSession(session: TaskSession): Promise<EpisodicTrajectory | null> {
    if (!session.actions.length) return null;
    const steps: TrajectoryStepRecord[] = session.actions.map((a, idx) => {
      const ok = a.status === "ok";
      const rewardDelta = computeStepReward({ ok, action: a.tool });
      return {
        step: idx + 1,
        action: a.tool,
        argsSummary: a.argsSummary || "",
        ok,
        reflection: ok
          ? a.verification?.evidence || a.summary
          : `Failed (${a.failureCategory || "error"}): ${a.error || a.summary}`,
        rewardDelta,
      };
    });
    const succeeded = session.state === "completed" && session.result?.success === true;
    return this.recordTrajectory({
      objective: session.goal,
      triggerSource: "task_loop",
      plan: session.plan?.steps.map((s) => s.text) || [],
      steps,
      outcome: succeeded ? "succeeded" : "failed",
      summary: session.result?.summary || session.error || session.currentStatus || session.state,
    });
  }

  retrieveSimilar(objective: string, topK = 4, minSimilarity = 0.18): RetrievedExperience[] {
    if (!this.data.trajectories.length) return [];
    const queryVec = embedExperienceText(objective);
    const scored = this.data.trajectories
      .map((t) => {
        const { embedding, ...rest } = t;
        return {
          trajectory: rest,
          similarity: Number(cosineSimilarity(queryVec, embedding).toFixed(4)),
        };
      })
      .filter((item) => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity || b.trajectory.totalReward - a.trajectory.totalReward);

    return scored.slice(0, topK);
  }

  /**
   * Formats retrieved episodic experiences & RL tool preferences so Gemini knows
   * BEFORE acting: "Have I solved a problem like this before? What mistakes did I make last time?"
   */
  buildPreActionContext(objective: string): string {
    const matches = this.retrieveSimilar(objective, 4, 0.18);
    if (!matches.length) return "";

    const winners = matches.filter((m) => m.trajectory.outcome === "succeeded" && m.trajectory.totalReward > 0);
    const mistakes = matches.filter((m) => m.trajectory.outcome === "failed" || m.trajectory.steps.some((s) => !s.ok));

    const lines: string[] = ["EPISODIC REINFORCEMENT MEMORY (Pre-Action Experience Retrieval):"];
    if (winners.length) {
      lines.push("- Proven Past Solutions (positive RL reward — reuse this trajectory pattern):");
      for (const w of winners.slice(0, 2)) {
        const chain = w.trajectory.steps
          .filter((s) => s.ok)
          .map((s) => `${s.action}(${s.argsSummary || "ok"})`)
          .join(" -> ");
        lines.push(`  * [sim=${w.similarity.toFixed(2)}, reward=+${w.trajectory.totalReward}] "${w.trajectory.objective}" => ${chain || w.trajectory.summary}`);
      }
    }
    if (mistakes.length) {
      lines.push("- Past Mistakes & Anti-Patterns to Avoid (negative RL reward — do NOT repeat):");
      for (const m of mistakes.slice(0, 2)) {
        const failedSteps = m.trajectory.steps
          .filter((s) => !s.ok)
          .map((s) => `${s.action}: ${s.reflection}`)
          .slice(0, 2)
          .join("; ");
        if (failedSteps) {
          lines.push(`  * [sim=${m.similarity.toFixed(2)}] On "${m.trajectory.objective}": ${failedSteps}`);
        }
      }
    }
    return lines.length > 1 ? lines.join("\n") : "";
  }

  snapshot() {
    return {
      totalTrajectories: this.data.trajectories.length,
      succeededCount: this.data.trajectories.filter((t) => t.outcome === "succeeded").length,
      failedCount: this.data.trajectories.filter((t) => t.outcome === "failed").length,
      cumulativeReward: this.data.cumulativeReward,
      toolStats: { ...this.data.toolStats },
      recentTrajectories: this.data.trajectories.slice(-15).reverse().map(({ embedding: _e, ...rest }) => rest),
    };
  }
}
