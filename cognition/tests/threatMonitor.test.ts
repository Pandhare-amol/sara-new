import test from "node:test";
import assert from "node:assert/strict";
import { ThreatMonitor } from "../threatMonitor";

test("threat monitor records sensitive and repeated tool patterns", () => {
  const monitor = new ThreatMonitor();
  assert.equal(monitor.recordTool("systemInfo"), null);
  assert.equal(monitor.recordTool("deleteFile")?.severity, "info");
  for (let i = 0; i < 5; i++) monitor.recordTool("runPythonScript");
  assert.ok(monitor.snapshot().some((event) => event.type === "repeated_tool_pattern"));
});

test("threat monitor supports acknowledgement", () => {
  const monitor = new ThreatMonitor();
  const event = monitor.recordUnauthorized();
  assert.equal(monitor.acknowledge(event.id), true);
  assert.equal(monitor.snapshot()[0].acknowledged, true);
});
