import test from "node:test";
import assert from "node:assert/strict";
import { assessTruthfulness, classifyClaim, detectContradictions } from "../truthFirst";

test("truth-first refuses unsupported certainty", () => {
  const result = assessTruthfulness({ claim: "This product will be profitable for everyone" });
  assert.equal(result.verdict, "INSUFFICIENT INFORMATION");
  assert.ok(result.unknowns.length > 0);
  assert.ok(result.risks.length > 0);
});

test("truth-first preserves evidence and flags assumptions", () => {
  const result = assessTruthfulness({ claim: "This tested design is promising", evidence: ["test passed", "customer interview"], knownFacts: ["prototype exists"] });
  assert.equal(result.verdict, "STRONG IDEA");
  assert.deepEqual(result.facts, ["prototype exists"]);
});

test("truth-first classifies unsupported claims as assumptions", () => {
  const result = classifyClaim("The launch will be profitable");
  assert.equal(result.classification, "PREDICTION");
  assert.equal(result.confidence, "Low");
});

test("truth-first detects direct negation conflicts", () => {
  const conflicts = detectContradictions(["The service is available", "The service is not available"]);
  assert.equal(conflicts.length, 1);
});
