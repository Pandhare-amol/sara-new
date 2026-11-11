import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { CorrectionStore, evaluateDecision, isImportantQuestion, needsResearch, reviewContradictions } from "../intelligenceReview";

test("important questions trigger bounded research recommendations", () => {
  assert.equal(isImportantQuestion("Should I use this framework?"), true);
  assert.equal(needsResearch("What is the latest version?"), true);
  assert.equal(needsResearch("Tell me a joke"), false);
});

test("decision review uses an explicit priority and exposes unknowns", () => {
  const result = evaluateDecision([{ name: "A", time: "fast" }, { name: "B", risk: "low", reversible: true, evidence: ["test"] }], "risk");
  assert.equal(result.recommendation, "B");
  assert.ok(result.unknowns.some((item) => item.includes("A")));
});

test("contradictions are surfaced instead of silently overwritten", () => {
  assert.equal(reviewContradictions(["The API is available", "The API is not available"]).length, 1);
});

test("corrections persist with provenance", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sara-corrections-"));
  const store = new CorrectionStore(path.join(dir, "corrections.json"));
  await store.initialize();
  await store.add({ original: "old", corrected: "new", reason: "test evidence", source: "test://evidence", confidence: "High" });
  assert.equal(store.list()[0].source, "test://evidence");
});
