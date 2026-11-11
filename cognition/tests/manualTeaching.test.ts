import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ManualTeachingStore } from "../manualTeaching";
import { SkillManager } from "../skillManager";

test("manual teaching requires approval and verification before promotion", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-teaching-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const skills = new SkillManager(path.join(dir, "skills.json"));
  await skills.initialize();
  const teaching = new ManualTeachingStore(skills);
  const draft = teaching.start({ name: "Organize reports" });
  await assert.rejects(() => teaching.promote(draft.id, false, false), /approval/);
  teaching.addStep(draft.id, { action: "Find report files", tool: "fs.search" });
  const skill = await teaching.promote(draft.id, true, true);
  assert.equal(skill.verified, true);
  assert.equal(skills.list().length, 1);
});
