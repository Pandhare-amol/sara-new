import test from "node:test";
import assert from "node:assert/strict";
import { SelfModel } from "../selfModel";

test("self model reports degraded capability state and uncertainty", () => {
  const model = new SelfModel();
  model.recordFailure("Research provider unavailable");
  const snapshot = model.snapshot({ capabilityCount: 10, health: [{ name: "backend", healthy: true }, { name: "research", healthy: false }], safetyEvents: 1 });
  assert.equal(snapshot.state, "degraded");
  assert.deepEqual(snapshot.unhealthyComponents, ["research"]);
  assert.equal(snapshot.uncertaintySignals[0], "Research provider unavailable");
});

test("self model reports ready when monitored components are healthy", () => {
  const snapshot = new SelfModel().snapshot({ capabilityCount: 3, health: [{ name: "backend", healthy: true }], safetyEvents: 0 });
  assert.equal(snapshot.state, "ready");
  assert.equal(snapshot.healthyComponents, 1);
});
