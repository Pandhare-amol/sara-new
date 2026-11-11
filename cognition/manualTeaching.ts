import { randomUUID } from "node:crypto";
import type { LearnedSkill } from "./types";
import type { SkillManager } from "./skillManager";

export interface TeachingDraft {
  id: string;
  name: string;
  description: string;
  expectedOutcome: string;
  steps: LearnedSkill["steps"];
  createdAt: string;
}

/** Ephemeral, user-visible teaching drafts; promotion is explicit and verified. */
export class ManualTeachingStore {
  private readonly drafts = new Map<string, TeachingDraft>();
  constructor(private readonly skills: SkillManager) {}

  start(input: { name: string; description?: string; expectedOutcome?: string }): TeachingDraft {
    const name = String(input.name || "").trim().slice(0, 200);
    if (!name) throw new Error("A teaching name is required.");
    const draft: TeachingDraft = { id: randomUUID(), name, description: String(input.description || `User-taught workflow: ${name}`).slice(0, 1_000), expectedOutcome: String(input.expectedOutcome || "Workflow completes successfully.").slice(0, 500), steps: [], createdAt: new Date().toISOString() };
    this.drafts.set(draft.id, draft);
    return structuredClone(draft);
  }

  addStep(id: string, input: { action: string; tool?: string; arguments?: Record<string, unknown> }): TeachingDraft {
    const draft = this.require(id);
    const action = String(input.action || "").trim().slice(0, 500);
    if (!action) throw new Error("A teaching step needs an action.");
    if (draft.steps.length >= 50) throw new Error("A teaching draft cannot contain more than 50 steps.");
    draft.steps.push({ id: `step-${draft.steps.length + 1}`, action, tool: input.tool ? String(input.tool).slice(0, 100) : undefined, arguments: input.arguments ? structuredClone(input.arguments) : undefined });
    return structuredClone(draft);
  }

  get(id: string): TeachingDraft | null { const draft = this.drafts.get(id); return draft ? structuredClone(draft) : null; }

  async promote(id: string, approved: boolean, verified: boolean): Promise<LearnedSkill> {
    if (!approved) throw new Error("Explicit approval is required before saving a taught skill.");
    if (!verified) throw new Error("The taught workflow must be verified before saving it.");
    const draft = this.require(id);
    if (!draft.steps.length) throw new Error("Teach at least one step before saving the skill.");
    const skill = await this.skills.learn({ ...draft, verified: true });
    this.drafts.delete(id);
    return skill;
  }

  private require(id: string): TeachingDraft { const draft = this.drafts.get(id); if (!draft) throw new Error("Teaching draft not found."); return draft; }
}
