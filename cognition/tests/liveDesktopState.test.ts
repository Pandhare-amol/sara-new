import assert from "node:assert/strict";
import test from "node:test";
import { PerceptionContext, type LiveDesktopState } from "../perceptionContext";

test("stores a bounded canonical desktop state with UI and text evidence", () => {
  const context = new PerceptionContext();
  const state: LiveDesktopState = {
    activeWindow: { title: "Editor", process: "editor", pid: 42 },
    cursor: { x: 100, y: 200, monitor: 0 },
    uiElements: [{ id: "save", role: "button", name: "Save", confidence: 0.98 }],
    visibleText: [{ text: "Ready", confidence: 0.99 }],
    source: "uia",
    capturedAt: new Date().toISOString(),
    confidence: 0.98,
  };
  context.ingestDesktop(state);
  const snapshot = context.snapshot();
  const desktop = snapshot.observations.find((item) => item.source === "desktop");
  assert.deepEqual((desktop?.facts as { state: LiveDesktopState }).state.uiElements[0].name, "Save");
  assert.equal(desktop?.available, true);
});
