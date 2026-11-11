import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ApiRegistry } from "../apiRegistry";
test("imports and searches catalog rows safely", async () => { const dir = await mkdtemp(path.join(os.tmpdir(), "sara-api-")); const registry = new ApiRegistry(path.join(dir, "registry.json")); await registry.initialize(); await registry.importMarkdown("## Weather\n| [Example] (https://example.com) | Forecast data | No | Yes |", "test"); const result = registry.search("weather", { noAuth: true, https: true }); assert.equal(result.length, 1); assert.equal(result[0].name, "Example"); });
