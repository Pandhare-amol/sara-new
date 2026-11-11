import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface ApiCatalogEntry { id: string; name: string; description: string; category: string; url: string | null; auth: string; https: boolean | null; source: string; status: "cataloged" | "documentation_reviewed" | "tested" | "disabled"; lastCheckedAt: string; }
interface RegistryFile { version: 1; entries: ApiCatalogEntry[]; importedAt: string | null; }

export class ApiRegistry {
  private entries: ApiCatalogEntry[] = [];
  private importedAt: string | null = null;
  private loaded = false;
  private write: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { const data = JSON.parse(await fs.readFile(this.filePath, "utf8")) as RegistryFile; this.entries = Array.isArray(data.entries) ? data.entries : []; this.importedAt = data.importedAt || null; } catch { this.entries = []; } this.loaded = true; }
  list(): ApiCatalogEntry[] { this.assert(); return this.entries.map((item) => structuredClone(item)); }
  search(query = "", filters: { category?: string; noAuth?: boolean; https?: boolean } = {}): ApiCatalogEntry[] { this.assert(); const terms = query.toLowerCase().split(/\s+/).filter(Boolean); return this.list().filter((item) => (!filters.category || item.category.toLowerCase() === filters.category.toLowerCase()) && (filters.noAuth === undefined || filters.noAuth === (item.auth.toLowerCase() === "no" || item.auth.toLowerCase() === "none")) && (filters.https === undefined || filters.https === item.https) && terms.every((term) => `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(term))).slice(0, 50); }
  async importMarkdown(markdown: string, source: string): Promise<{ imported: number; total: number }> { this.assert(); const parsed = parseCatalog(markdown, source); const byKey = new Map(this.entries.map((item) => [`${item.category}:${item.name}`.toLowerCase(), item])); for (const item of parsed) byKey.set(`${item.category}:${item.name}`.toLowerCase(), item); this.entries = [...byKey.values()]; this.importedAt = new Date().toISOString(); await this.persist(); return { imported: parsed.length, total: this.entries.length }; }
  async importPublicCatalog(): Promise<{ imported: number; total: number }> { const source = "https://raw.githubusercontent.com/public-apis/public-apis/master/README.md"; const response = await fetch(source, { signal: AbortSignal.timeout(15_000), headers: { accept: "text/plain" } }); if (!response.ok) throw new Error(`API catalog HTTP ${response.status}`); return this.importMarkdown(await response.text(), source); }
  status(): { entries: number; importedAt: string | null } { this.assert(); return { entries: this.entries.length, importedAt: this.importedAt }; }
  private assert(): void { if (!this.loaded) throw new Error("ApiRegistry.initialize() must be called first."); }
  private async persist(): Promise<void> { const temp = `${this.filePath}.${process.pid}.tmp`; this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ version: 1, entries: this.entries, importedAt: this.importedAt }, null, 2), "utf8"); await fs.rename(temp, this.filePath); }); await this.write; }
}

function parseCatalog(markdown: string, source: string): ApiCatalogEntry[] { const result: ApiCatalogEntry[] = []; let category = "Uncategorized"; for (const line of markdown.split(/\r?\n/)) { const heading = line.match(/^##\s+(.+?)\s*#*$/); if (heading) { category = heading[1].replace(/\[[^\]]+\]\([^)]*\)/g, "").trim(); continue; } const row = line.match(/^\|\s*\[([^\]]+)\]\s*\(\s*(https?:\/\/[^)]+)\)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/); if (!row) continue; const [, name, url, description, auth, https] = row; result.push({ id: randomUUID(), name: name.trim(), description: description.trim().slice(0, 1000), category, url, auth: auth.trim(), https: /yes|true/i.test(https) ? true : /no|false/i.test(https) ? false : null, source, status: "cataloged", lastCheckedAt: new Date().toISOString() }); } return result; }
