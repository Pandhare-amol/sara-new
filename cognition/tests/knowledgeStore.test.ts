import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KnowledgeStore } from "../knowledgeStore";

test("knowledge persists, searches, and deletes with provenance", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-knowledge-"));
  const store = new KnowledgeStore(path.join(dir, "knowledge.json"));
  await store.initialize();
  const saved = await store.add({ topic: "Sara project", content: "Uses a local Node backend.", source: { kind: "user_approved", locator: "conversation:test" }, confidence: 0.9, refreshAfter: null });
  assert.equal(store.search("local Node")[0]?.id, saved.id);
  const second = new KnowledgeStore(path.join(dir, "knowledge.json"));
  await second.initialize();
  assert.equal(second.list()[0]?.source.locator, "conversation:test");
  assert.equal(await second.remove(saved.id), true);
  assert.equal(second.list().length, 0);
  await fs.rm(dir, { recursive: true, force: true });
});
