import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface WorldEntity { id: string; type: string; name: string; attributes: Record<string, unknown>; source?: string; confidence: number; acquiredAt: string; verifiedAt: string | null; active: boolean; }
export interface WorldRelation { id: string; from: string; type: string; to: string; source?: string; confidence: number; acquiredAt: string; active: boolean; }
interface WorldFile { version: 1; entities: WorldEntity[]; relations: WorldRelation[]; }

export class WorldModel {
  private file: WorldFile = { version: 1, entities: [], relations: [] };
  private loaded = false; private write: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { this.file = JSON.parse(await fs.readFile(this.filePath, "utf8")) as WorldFile; } catch { /* empty model */ } this.loaded = true; }
  entities(): WorldEntity[] { this.assert(); return this.file.entities.filter((item) => item.active).map((item) => structuredClone(item)); }
  relations(): WorldRelation[] { this.assert(); return this.file.relations.filter((item) => item.active).map((item) => structuredClone(item)); }
  async upsertEntity(input: Omit<WorldEntity, "id" | "acquiredAt" | "active">): Promise<WorldEntity> { this.assert(); const current = this.file.entities.find((item) => item.active && item.type === input.type && item.name.toLowerCase() === input.name.toLowerCase()); const entity = current ? Object.assign(current, input, { verifiedAt: input.verifiedAt || current.verifiedAt }) : { ...input, id: randomUUID(), acquiredAt: new Date().toISOString(), active: true }; if (!current) this.file.entities.push(entity); await this.persist(); return structuredClone(entity); }
  async addRelation(input: Omit<WorldRelation, "id" | "acquiredAt" | "active">): Promise<WorldRelation> { this.assert(); if (!this.file.entities.some((item) => item.id === input.from && item.active) || !this.file.entities.some((item) => item.id === input.to && item.active)) throw new Error("Both relation endpoints must be active entities."); const relation = { ...input, id: randomUUID(), acquiredAt: new Date().toISOString(), active: true }; this.file.relations.push(relation); await this.persist(); return structuredClone(relation); }
  async remove(id: string): Promise<boolean> { this.assert(); const item = this.file.entities.find((entry) => entry.id === id && entry.active); if (!item) return false; item.active = false; for (const relation of this.file.relations.filter((entry) => entry.from === id || entry.to === id)) relation.active = false; await this.persist(); return true; }
  export(): WorldFile { this.assert(); return structuredClone(this.file); }
  private assert(): void { if (!this.loaded) throw new Error("WorldModel.initialize() must be called first."); }
  private async persist(): Promise<void> { const temp = `${this.filePath}.${process.pid}.tmp`; this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify(this.file, null, 2), "utf8"); await fs.rename(temp, this.filePath); }); await this.write; }
}
