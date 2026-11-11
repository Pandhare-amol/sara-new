import test from "node:test";
import assert from "node:assert/strict";
import { PerceptionContext } from "../perceptionContext";

test("perception context preserves source, freshness, facts, and separate interpretations", () => {
  const context = new PerceptionContext();
  context.ingest("desktop", { activeWindow: { title: "Editor" } }, {
    confidence: 0.95,
    ttlMs: 5_000,
    interpretations: [{ text: "The user may be coding.", confidence: 0.42 }],
  });
  const entry = context.snapshot(Date.now()).observations[0];
  assert.equal(entry.source, "desktop");
  assert.equal(entry.facts.activeWindow instanceof Object, true);
  assert.equal(entry.interpretations[0].text, "The user may be coding.");
  assert.equal(entry.confidence, 0.95);
});

test("expired observations do not appear and unavailable sources remain explicit", () => {
  const context = new PerceptionContext();
  context.ingest("screen", { frame: "old" }, { ttlMs: 1_000 });
  assert.equal(context.snapshot(Date.now() + 2_000).observations.length, 0);
  context.markUnavailable("camera");
  const camera = context.snapshot().observations.find((item) => item.source === "camera");
  assert.equal(camera?.available, false);
  assert.equal(camera?.confidence, 0);
});
