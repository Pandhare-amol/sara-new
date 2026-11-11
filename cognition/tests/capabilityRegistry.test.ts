import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CapabilityRegistry } from "../capabilityRegistry";
test("capability registry persists defaults and evidence-backed validation", async () => { const dir = await mkdtemp(path.join(os.tmpdir(), "sara-capabilities-")); const registry = new CapabilityRegistry(path.join(dir, "capabilities.json")); await registry.initialize(); assert.ok(registry.summary().total >= 7); await assert.rejects(() => registry.validate("computer.desktop-control", { status: "available", successRate: 0.8 })); const item = await registry.validate("computer.desktop-control", { status: "available", successRate: 0.8, evidence: "Windows integration test completed." }); assert.equal(item.status, "available"); assert.equal(item.successRate, 0.8); });
