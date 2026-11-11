import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  source: { kind: "user_approved" | "web" | "document" | "feedback" | "conversation_auto"; locator?: string };
  confidence: number;
  createdAt: string;
  updatedAt: string;
  refreshAfter: string | null;
  embedding?: number[];
  active: boolean;
}

interface KnowledgeFile { version: 1; entries: KnowledgeEntry[]; }

export class KnowledgeStore {
  private entries: KnowledgeEntry[] = [];
  private loaded = false;
  private write: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as KnowledgeFile;
      this.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch { this.entries = []; }
    this.loaded = true;
  }

  list(): KnowledgeEntry[] { this.assertLoaded(); return this.entries.filter((entry) => entry.active).map((entry) => structuredClone(entry)); }

  async add(input: Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt" | "active">): Promise<KnowledgeEntry> {
    this.assertLoaded();
    if (!input.content.trim() || !input.topic.trim()) throw new Error("Knowledge topic and content are required.");
    if (!["user_approved", "web", "document", "feedback", "conversation_auto"].includes(input.source.kind)) throw new Error("Unsupported knowledge source.");
    const now = new Date().toISOString();
    const existing = this.entries.find((entry) => entry.active && entry.topic === input.topic && entry.source.locator === input.source.locator);
    const entry: KnowledgeEntry = existing ? { ...existing, ...input, updatedAt: now } : { ...input, id: randomUUID(), createdAt: now, updatedAt: now, active: true };
    if (existing) Object.assign(existing, entry); else this.entries.push(entry);
    await this.persist();
    return structuredClone(entry);
  }

  search(query: string, limit = 12): KnowledgeEntry[] {
    return this.searchHybrid(query, undefined, limit);
  }

  searchHybrid(query: string, queryEmbedding?: number[], limit = 12): KnowledgeEntry[] {
    this.assertLoaded();
    const tokens = query.toLowerCase().split(/\W+/).filter((token) => token.length >= 2);
    return this.list().map((entry) => {
      const lexical = tokens.reduce((score, token) => score + ((entry.topic + " " + entry.content).toLowerCase().includes(token) ? 1 : 0), 0);
      const semantic = queryEmbedding && entry.embedding ? cosineSimilarity(queryEmbedding, entry.embedding) : 0;
      return { entry, score: lexical + Math.max(0, semantic) * Math.max(1, tokens.length) };
    })
      .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 50))).map((item) => item.entry);
  }

  async remove(id: string): Promise<boolean> {
    this.assertLoaded();
    const entry = this.entries.find((item) => item.id === id && item.active);
    if (!entry) return false;
    entry.active = false;
    entry.updatedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  due(now = Date.now()): KnowledgeEntry[] { return this.list().filter((entry) => entry.refreshAfter && new Date(entry.refreshAfter).getTime() <= now); }

  private assertLoaded(): void { if (!this.loaded) throw new Error("KnowledgeStore.initialize() must be called first."); }
  private async persist(): Promise<void> {
    const temp = `${this.filePath}.${process.pid}.tmp`;
    this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ version: 1, entries: this.entries }, null, 2), "utf8"); await fs.rename(temp, this.filePath); });
    await this.write;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
