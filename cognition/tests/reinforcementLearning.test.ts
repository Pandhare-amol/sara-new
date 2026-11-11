import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyFeedback, ReinforcementLearningStore } from "../reinforcementLearning";

test("classifies explicit feedback and leaves ambiguous text unscored", () => {
  assert.deepEqual(classifyFeedback("PERFECT!"), { label: "positive", reward: 1 });
  assert.deepEqual(classifyFeedback("The wrong file opened"), { label: "negative", reward: -2 });
  assert.deepEqual(classifyFeedback("okay, try again"), { label: "ambiguous", reward: 0 });
  assert.deepEqual(classifyFeedback("good but not working"), { label: "ambiguous", reward: 0 });
});

test("persists task rewards, rejects duplicates, and updates strategy statistics", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-learning-"));
  const store = new ReinforcementLearningStore(path.join(dir, "experiences.json"));
  await store.initialize();
  await store.recordTask({
    id: "task-1", goal: "Open report.pdf", actions: [{ tool: "fs.open", verification: { passed: true } }],
    result: { success: true }, state: "completed",
  } as never);
  const first = await store.processFeedback("task-1", "Perfect");
  const duplicate = await store.processFeedback("task-1", "Perfect");
  assert.equal(first.saved, true);
  assert.equal(first.classification.reward, 1);
  assert.equal(duplicate.saved, false);
  assert.equal(duplicate.reason, "feedback_already_processed");
  assert.equal(store.stats()["file_operation:fs.open"].rewardTotal, 1);

  const reloaded = new ReinforcementLearningStore(path.join(dir, "experiences.json"));
  await reloaded.initialize();
  assert.equal(reloaded.list()[0].feedback.reward, 1);
  assert.equal(reloaded.chooseStrategy("file_operation", ["fs.open", "openFolder"]), "fs.open");
});

test("excluded experiences do not enter training eligibility", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-learning-"));
  const store = new ReinforcementLearningStore(path.join(dir, "experiences.json"));
  await store.initialize();
  await store.recordTask({ id: "task-2", goal: "Open file.txt", actions: [], result: { success: true }, state: "completed" } as never);
  const item = store.list()[0];
  assert.equal(await store.setTrainingEligibility(item.id, false), true);
  assert.equal((await store.train()).reason, "insufficient_data");
});
