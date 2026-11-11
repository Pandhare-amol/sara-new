import test from "node:test";
import assert from "node:assert/strict";
import { validatePythonSkill } from "../prometheus";

test("prometheus rejects unsafe generated Python", async () => {
  const result = await validatePythonSkill({ id: "unsafe", name: "unsafe", source: "import subprocess", approved: false, status: "draft" });
  assert.equal(result.status, "rejected");
});

test("prometheus validates safe Python without activating it", async () => {
  const result = await validatePythonSkill({ id: "safe", name: "safe", source: "def add(a, b):\n    return a + b\n", approved: false, status: "draft" });
  assert.equal(result.status, "validated");
});
