import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { KnowledgeStore } from "../cognition/knowledgeStore";
import { BudgetScheduler } from "../agent/budgetScheduler";

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-benchmark-"));
  try {
    const store = new KnowledgeStore(path.join(dir, "knowledge.json")); await store.initialize();
    for (let i = 0; i < 100; i++) await store.add({ topic: `project-${i}`, content: `Sara project architecture and verified task detail ${i}`, source: { kind: "user_approved", locator: `benchmark:${i}` }, confidence: 0.9, refreshAfter: null });
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) { const start = performance.now(); const result = store.search("project architecture verified", 5); samples.push(performance.now() - start); if (result.length === 0) throw new Error("Benchmark retrieval returned no results."); }
    const scheduler = new BudgetScheduler(2); const starts: number[] = []; const jobs = [0, 1, 2, 3].map(() => scheduler.enqueue(async () => { starts.push(Date.now()); await new Promise((resolve) => setTimeout(resolve, 20)); }, { priority: 5, timeoutMs: 1_000 })); await Promise.all(jobs);
    // The scheduler settles the caller promise before its internal slot cleanup;
    // yield once so the measured status reflects the completed background work.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sorted = [...samples].sort((a, b) => a - b);
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), knowledge: { entries: store.list().length, query: "project architecture verified", samples: samples.length, p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] }, scheduler: { jobs: jobs.length, observedStarts: starts.length, maxConcurrent: 2, status: scheduler.status() } }, null, 2));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
