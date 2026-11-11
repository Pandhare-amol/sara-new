import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type PracticeStatus = "not_started" | "in_progress" | "passed" | "needs_review";
export interface ComputerModule { id: string; title: string; category: string; objectives: string[]; status: PracticeStatus; attempts: number; verifiedAt: string | null; lastEvidence: string | null; updatedAt: string; }
interface LabFile { version: 1; modules: ComputerModule[]; }
const CATALOG: Array<Pick<ComputerModule, "id" | "title" | "category" | "objectives">> = [
  { id: "windows.desktop", title: "Windows desktop and windows", category: "Windows", objectives: ["identify the foreground application", "switch and restore a window", "verify the final focused window"] },
  { id: "files.safe", title: "Safe file and folder operations", category: "Files", objectives: ["locate a file", "create a disposable folder", "verify copy or move results"] },
  { id: "browser.navigation", title: "Browser navigation", category: "Browser", objectives: ["identify the active tab", "navigate to a safe page", "verify the resulting page"] },
  { id: "windows.settings", title: "Windows settings inspection", category: "Windows", objectives: ["open a settings page", "read a value", "avoid changing protected settings"] },
];

export class ComputerLearningLab {
  private modules: ComputerModule[] = [];
  private loaded = false;
  private write: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { const data = JSON.parse(await fs.readFile(this.filePath, "utf8")) as LabFile; this.modules = Array.isArray(data.modules) ? data.modules : []; } catch { this.modules = []; } const existing = new Set(this.modules.map((item) => item.id)); const now = new Date().toISOString(); for (const item of CATALOG) if (!existing.has(item.id)) this.modules.push({ ...item, status: "not_started", attempts: 0, verifiedAt: null, lastEvidence: null, updatedAt: now }); this.loaded = true; await this.persist(); }
  list(): ComputerModule[] { this.assert(); return this.modules.map((item) => structuredClone(item)); }
  async recordPractice(id: string, input: { passed: boolean; evidence: string }): Promise<ComputerModule> { this.assert(); const module = this.modules.find((item) => item.id === id); if (!module) throw new Error("Computer learning module not found."); if (!input.evidence.trim()) throw new Error("Verification evidence is required."); module.attempts += 1; module.status = input.passed ? "passed" : "needs_review"; module.lastEvidence = input.evidence.trim().slice(0, 1_000); module.verifiedAt = input.passed ? new Date().toISOString() : module.verifiedAt; module.updatedAt = new Date().toISOString(); await this.persist(); return structuredClone(module); }
  private assert(): void { if (!this.loaded) throw new Error("ComputerLearningLab.initialize() must be called first."); }
  private async persist(): Promise<void> { const temp = `${this.filePath}.${process.pid}.tmp`; this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ version: 1, modules: this.modules }, null, 2), "utf8"); await fs.rename(temp, this.filePath); }); await this.write; }
}
