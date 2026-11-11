import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldModel } from "../worldModel";

test("world model persists entities and relations and removes connected edges", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-world-"));
  try {
    const file = path.join(dir, "world.json"); const model = new WorldModel(file); await model.initialize();
    const sara = await model.upsertEntity({ type: "assistant", name: "Sara", attributes: { role: "assistant" }, confidence: 1, verifiedAt: new Date().toISOString() });
    const project = await model.upsertEntity({ type: "project", name: "Demo", attributes: { status: "active" }, confidence: 0.9, verifiedAt: null });
    await model.addRelation({ from: sara.id, type: "supports", to: project.id, confidence: 0.8 });
    const restored = new WorldModel(file); await restored.initialize(); assert.equal(restored.entities().length, 2); assert.equal(restored.relations().length, 1);
    assert.equal(await restored.remove(sara.id), true); assert.equal(restored.relations().length, 0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
