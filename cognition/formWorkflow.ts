import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type FormState = "draft" | "awaiting_approval" | "submitted" | "failed";
export interface FormField { id: string; label: string; value: string; sensitive: boolean; approved: boolean; }
export interface FormDraft { id: string; taskId: string | null; site: string; fields: FormField[]; state: FormState; submissionKey: string; verification: { passed: boolean; evidence: string } | null; createdAt: string; updatedAt: string; }

export class FormWorkflowStore {
  private drafts: FormDraft[] = []; private loaded = false; private write: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")); this.drafts = Array.isArray(parsed.drafts) ? parsed.drafts : []; } catch { this.drafts = []; } this.loaded = true; }
  list(): FormDraft[] { this.assertLoaded(); return structuredClone(this.drafts); }
  async create(input: { site: string; taskId?: string | null; fields: Array<{ label: string; value: string; sensitive?: boolean }> }): Promise<FormDraft> { this.assertLoaded(); const now = new Date().toISOString(); const fields = input.fields.map((field) => ({ id: randomUUID(), label: field.label.slice(0, 200), value: field.value.slice(0, 5000), sensitive: field.sensitive === true, approved: false })); const submissionKey = createHash("sha256").update(`${input.site}\n${fields.map((field) => `${field.label}:${field.value}`).join("\n")}`).digest("hex"); const draft: FormDraft = { id: randomUUID(), taskId: input.taskId || null, site: input.site.slice(0, 300), fields, state: "draft", submissionKey, verification: null, createdAt: now, updatedAt: now }; this.drafts.push(draft); await this.persist(); return structuredClone(draft); }
  async approve(id: string, fieldIds?: string[]): Promise<FormDraft> { const draft = this.require(id); const selected = fieldIds ? new Set(fieldIds) : null; for (const field of draft.fields) if (!selected || selected.has(field.id)) field.approved = true; draft.state = draft.fields.every((field) => field.approved || field.value === "") ? "awaiting_approval" : "draft"; draft.updatedAt = new Date().toISOString(); await this.persist(); return structuredClone(draft); }
  async markSubmitted(id: string, evidence: string): Promise<FormDraft> { const draft = this.require(id); if (draft.state !== "awaiting_approval") throw new Error("Form requires field approval before submission."); if (this.drafts.some((item) => item.id !== id && item.submissionKey === draft.submissionKey && item.state === "submitted")) throw new Error("Duplicate form submission prevented."); draft.state = "submitted"; draft.verification = { passed: Boolean(evidence.trim()), evidence: evidence.slice(0, 1000) }; draft.updatedAt = new Date().toISOString(); await this.persist(); return structuredClone(draft); }
  async verify(id: string, passed: boolean, evidence: string): Promise<FormDraft> { const draft = this.require(id); draft.verification = { passed, evidence: evidence.slice(0, 1000) }; if (!passed) draft.state = "failed"; await this.persist(); return structuredClone(draft); }
  private require(id: string): FormDraft { this.assertLoaded(); const draft = this.drafts.find((item) => item.id === id); if (!draft) throw new Error("Form draft not found."); return draft; }
  private assertLoaded(): void { if (!this.loaded) throw new Error("FormWorkflowStore.initialize() must be called first."); }
  private async persist(): Promise<void> { const temp = `${this.filePath}.${process.pid}.tmp`; this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ version: 1, drafts: this.drafts }, null, 2), "utf8"); await fs.rename(temp, this.filePath); }); await this.write; }
}
