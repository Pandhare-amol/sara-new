import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeRefreshScheduler } from "../knowledgeRefresh";
import { KnowledgeStore } from "../knowledgeStore";

test("automatic refresh only fetches explicitly allowed hosts and can be paused", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-refresh-"));
  const store = new KnowledgeStore(path.join(dir, "knowledge.json"));
  await store.initialize();
  await store.add({ topic: "allowed", content: "old", source: { kind: "web", locator: "https://docs.example.com/a" }, confidence: 0.8, refreshAfter: new Date(0).toISOString() });
  await store.add({ topic: "blocked", content: "old", source: { kind: "web", locator: "https://untrusted.invalid/a" }, confidence: 0.8, refreshAfter: new Date(0).toISOString() });
  const scheduler = new KnowledgeRefreshScheduler(store, 60_000, ["docs.example.com"]);
  scheduler.pause();
  assert.equal((await scheduler.runOnce()).refreshed, 0);
  assert.equal(scheduler.status().paused, true);
});
