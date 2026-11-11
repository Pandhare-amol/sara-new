import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeStore } from "../knowledgeStore";
import { LearningEngine } from "../learningEngine";

test("learning sessions persist progress and experiments", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sara-learn-")); const knowledge = new KnowledgeStore(path.join(dir, "knowledge.json")); await knowledge.initialize(); const engine = new LearningEngine(path.join(dir, "sessions.json"), knowledge); await engine.initialize(); const session = await engine.start({ topic: "Python", depth: "intermediate" }); const updated = await engine.addExperiment(session.id, { objective: "variables", method: "run a small script", outcome: "output verified", verified: true }); assert.equal(updated.experiments.length, 1); assert.equal(JSON.parse(await readFile(path.join(dir, "sessions.json"), "utf8")).sessions.length, 1);
});
