import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LearningExecutionCoordinator } from "../learningExecution";
import { LearningEngine } from "../learningEngine";
import { KnowledgeStore } from "../knowledgeStore";
import { SkillManager } from "../skillManager";

test("unknown work creates a learning session before execution", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-learning-execution-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const knowledge = new KnowledgeStore(path.join(dir, "knowledge.json"));
  await knowledge.initialize();
  const learning = new LearningEngine(path.join(dir, "learning.json"), knowledge);
  await learning.initialize();
  const skills = new SkillManager(path.join(dir, "skills.json"));
  await skills.initialize();
  const result = await new LearningExecutionCoordinator(skills, learning).prepare("Use an unfamiliar editor");
  assert.equal(result.mode, "learn_then_execute");
  assert.equal(result.learningSession?.status, "planned");
});

test("verified skills are selected for reuse", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-learning-skill-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const knowledge = new KnowledgeStore(path.join(dir, "knowledge.json"));
  await knowledge.initialize();
  const learning = new LearningEngine(path.join(dir, "learning.json"), knowledge);
  await learning.initialize();
  const skills = new SkillManager(path.join(dir, "skills.json"));
  await skills.initialize();
  await skills.learn({ name: "Open report", description: "Open report file", steps: [{ id: "open", action: "Open the exact report file", tool: "fs.open" }], expectedOutcome: "Report is open", verified: true });
  const result = await new LearningExecutionCoordinator(skills, learning).prepare("open report");
  assert.equal(result.mode, "reuse_verified_skill");
  assert.equal(result.skill?.verified, true);
});
