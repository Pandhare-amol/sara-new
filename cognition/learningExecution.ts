import type { LearningEngine, LearningSession } from "./learningEngine";
import type { LearnedSkill } from "./types";
import type { SkillManager } from "./skillManager";

export type LearningExecutionPreparation =
  | { mode: "reuse_verified_skill"; goal: string; skill: LearnedSkill; learningSession: null }
  | { mode: "learn_then_execute"; goal: string; skill: null; learningSession: LearningSession };

/** Connects verified procedural memory with the existing task executor. */
export class LearningExecutionCoordinator {
  constructor(private readonly skills: SkillManager, private readonly learning: LearningEngine) {}

  async prepare(goal: string, depth: "beginner" | "intermediate" | "advanced" = "beginner"): Promise<LearningExecutionPreparation> {
    const normalized = goal.trim();
    if (!normalized) throw new Error("A task goal is required.");
    const candidate = this.skills.search(normalized)[0] || null;
    if (candidate?.verified && (candidate.successRate >= 0.6 || candidate.uses === 0)) {
      return { mode: "reuse_verified_skill", goal: normalized, skill: candidate, learningSession: null };
    }
    const session = await this.learning.start({ topic: normalized, objective: `Learn and safely practice: ${normalized}`, depth });
    return { mode: "learn_then_execute", goal: normalized, skill: null, learningSession: session };
  }
}
