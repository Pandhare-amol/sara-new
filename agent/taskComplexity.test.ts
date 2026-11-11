import assert from "node:assert/strict";
import test from "node:test";
import { classifyTaskComplexity } from "./taskComplexity";
test("classifies short safe commands as quick", () => assert.equal(classifyTaskComplexity("open calculator").level, "quick"));
test("classifies workflows as complex", () => assert.equal(classifyTaskComplexity("create a detailed report and presentation from these files").level, "complex"));
test("complexity is not authorization", () => assert.equal(classifyTaskComplexity("delete the old file").level, "standard"));
