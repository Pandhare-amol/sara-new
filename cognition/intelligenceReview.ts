import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { classifyClaim, detectContradictions, type ClaimReview, type Contradiction } from "./truthFirst";

export type DecisionPriority = "cost" | "speed" | "reliability" | "maintainability" | "risk";
export interface DecisionOption { name: string; benefit?: string; cost?: string; time?: string; complexity?: string; risk?: string; reversible?: boolean; evidence?: string[]; }
export interface DecisionReview { recommendation: string; rationale: string[]; tradeoffs: string[]; unknowns: string[]; options: Array<DecisionOption & { score: number }>; }
export interface CorrectionRecord { id: string; original: string; corrected: string; reason: string; source?: string; confidence: "High" | "Medium" | "Low"; createdAt: string; }
interface CorrectionFile { version: 1; records: CorrectionRecord[]; }

export function isImportantQuestion(text: string): boolean {
  return /\b(should|recommend|decide|compare|business|startup|profit|risk|architecture|research|latest|current|why|plan|is it true|evaluate|correct|wrong|contradict)/i.test(text);
}

export function needsResearch(text: string, now = new Date()): boolean {
  if (!isImportantQuestion(text)) return false;
  if (/\b(latest|current|today|now|price|law|regulation|market|competitor|available|version)\b/i.test(text)) return true;
  return /\b(research|sources|evidence|verify|check online)\b/i.test(text);
}

export function reviewClaims(claims: Array<{ text: string; evidence?: string[]; contradictingEvidence?: string[]; verified?: boolean }>): ClaimReview[] {
  return claims.slice(0, 30).map((claim) => classifyClaim(claim.text, { supportingEvidence: claim.evidence, contradictingEvidence: claim.contradictingEvidence, verified: claim.verified }));
}

export function reviewContradictions(statements: string[]): Contradiction[] {
  return detectContradictions(statements.slice(0, 100));
}

export function evaluateDecision(options: DecisionOption[], priority: DecisionPriority = "reliability"): DecisionReview {
  if (!options.length) throw new Error("At least one decision option is required.");
  const scored = options.map((option) => {
    let score = 0;
    if (priority === "cost" && /low|cheap|small/i.test(option.cost || "")) score += 3;
    if (priority === "speed" && /fast|short|low/i.test(option.time || "")) score += 3;
    if (priority === "reliability" && /low|reliable|tested/i.test(option.risk || "")) score += 3;
    if (priority === "maintainability" && /low|simple|easy/i.test(option.complexity || "")) score += 3;
    if (priority === "risk" && option.reversible === true) score += 3;
    score += Math.min(2, (option.evidence || []).length);
    return { ...option, score };
  }).sort((a, b) => b.score - a.score);
  const winner = scored[0];
  return { recommendation: winner.name, rationale: [`Selected using the explicit '${priority}' priority.`, `${winner.evidence?.length || 0} evidence item(s) were supplied for the leading option.`], tradeoffs: scored.slice(1).map((item) => `${item.name} scored ${item.score} versus ${winner.name}'s ${winner.score}.`), unknowns: scored.filter((item) => !item.evidence?.length).map((item) => `No evidence supplied for ${item.name}.`), options: scored };
}

export class CorrectionStore {
  private file: CorrectionFile = { version: 1, records: [] };
  private loaded = false;
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { this.file = JSON.parse(await fs.readFile(this.filePath, "utf8")) as CorrectionFile; } catch { /* new store */ } this.loaded = true; }
  list(): CorrectionRecord[] { if (!this.loaded) throw new Error("CorrectionStore.initialize() must be called first."); return structuredClone(this.file.records); }
  async add(input: Omit<CorrectionRecord, "id" | "createdAt">): Promise<CorrectionRecord> { if (!this.loaded) throw new Error("CorrectionStore.initialize() must be called first."); const record = { ...input, id: randomUUID(), createdAt: new Date().toISOString() }; this.file.records.push(record); this.file.records = this.file.records.slice(-500); await fs.writeFile(`${this.filePath}.${process.pid}.tmp`, JSON.stringify(this.file, null, 2), "utf8"); await fs.rename(`${this.filePath}.${process.pid}.tmp`, this.filePath); return structuredClone(record); }
}
