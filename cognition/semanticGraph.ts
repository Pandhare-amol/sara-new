import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface GraphNode { id: string; type: "knowledge" | "topic" | "skill" | "project"; label: string; sourceId?: string; updatedAt: string; }
export interface GraphEdge { from: string; to: string; relation: string; weight: number; }
interface GraphFile { version: 1; nodes: GraphNode[]; edges: GraphEdge[]; }

/** Lightweight persistent graph layered over the existing KnowledgeStore. */
export class SemanticGraph {
  private file: GraphFile = { version: 1, nodes: [], edges: [] };
  private loaded = false;
  constructor(private readonly filePath: string) {}
  async initialize(): Promise<void> { if (this.loaded) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); try { this.file = JSON.parse(await fs.readFile(this.filePath, "utf8")) as GraphFile; } catch { /* new graph */ } this.loaded = true; }
  list(): GraphFile { if (!this.loaded) throw new Error("SemanticGraph.initialize() must be called first."); return structuredClone(this.file); }
  async upsertKnowledge(input: { id: string; topic: string; type?: GraphNode["type"] }): Promise<void> { const now = new Date().toISOString(); const knowledgeId = `knowledge:${input.id}`; const topicId = `topic:${input.topic.toLowerCase().replace(/\W+/g, "-").slice(0, 80)}`; this.upsertNode({ id: knowledgeId, type: input.type || "knowledge", label: input.topic, sourceId: input.id, updatedAt: now }); this.upsertNode({ id: topicId, type: "topic", label: input.topic, updatedAt: now }); if (!this.file.edges.some((e) => e.from === knowledgeId && e.to === topicId && e.relation === "about")) this.file.edges.push({ from: knowledgeId, to: topicId, relation: "about", weight: 1 }); await fs.writeFile(`${this.filePath}.${process.pid}.tmp`, JSON.stringify(this.file, null, 2), "utf8"); await fs.rename(`${this.filePath}.${process.pid}.tmp`, this.filePath); }
  related(id: string, hops = 2): GraphNode[] { const seen = new Set([id]); let frontier = [id]; for (let i = 0; i < Math.max(1, Math.min(3, hops)); i++) { const next: string[] = []; for (const edge of this.file.edges) if (seen.has(edge.from) && !seen.has(edge.to)) { seen.add(edge.to); next.push(edge.to); } frontier = next; if (!frontier.length) break; } return this.file.nodes.filter((node) => seen.has(node.id)); }
  private upsertNode(node: GraphNode): void { const existing = this.file.nodes.find((item) => item.id === node.id); if (existing) Object.assign(existing, node); else this.file.nodes.push(node); }
}
