import assert from "node:assert/strict";
import test from "node:test";
import { BudgetScheduler } from "../agent/budgetScheduler";

test("a timed-out operation keeps its concurrency slot until actual settlement", async () => {
  const scheduler = new BudgetScheduler(1);
  let release: (() => void) | undefined;
  let secondStarted = false;
  const first = scheduler.enqueue(() => new Promise<void>((resolve) => { release = resolve; }), { timeoutMs: 15 });
  const second = scheduler.enqueue(async () => { secondStarted = true; return "second"; });

  await assert.rejects(first, /timeout/i);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(secondStarted, false, "timed-out work must still occupy the sole slot");
  assert.equal(scheduler.status().running, 1);
  release?.();
  assert.equal(await second, "second");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scheduler.status().running, 0);
});
