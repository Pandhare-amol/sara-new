import test from "node:test";
import assert from "node:assert/strict";
import { evaluateChronos } from "../chronos";

test("chronos recommends reducing background work under pressure", () => {
  const result = evaluateChronos({ activeMinutes: 240, cpuPercent: 92, memoryPercent: 90 });
  assert.equal(result.recommendation, "reduce-background-work");
  assert.equal(result.overdrive, false);
});

test("chronos enables advisory overdrive only when resources are healthy", () => {
  const result = evaluateChronos({ activeMinutes: 10, cpuPercent: 20, memoryPercent: 30 });
  assert.equal(result.overdrive, true);
});
