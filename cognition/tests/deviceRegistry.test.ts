import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DeviceRegistry } from "../deviceRegistry";

test("enrolls, authenticates, persists, and revokes a device", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-device-"));
  const file = path.join(dir, "devices.json");
  const first = new DeviceRegistry(file);
  await first.initialize();
  const enrolled = await first.enroll({ name: "phone", fingerprint: "fp-1", permissions: ["read_context"] });
  assert.ok(await first.authenticate(enrolled.device.id, enrolled.token));
  assert.equal(await first.authenticate(enrolled.device.id, "wrong-token"), null);
  await first.revoke(enrolled.device.id);
  assert.equal(await first.authenticate(enrolled.device.id, enrolled.token), null);
  const second = new DeviceRegistry(file);
  await second.initialize();
  assert.equal(second.list()[0].revokedAt !== null, true);
});

test("does not grant remote actions during enrollment", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-device-"));
  const registry = new DeviceRegistry(path.join(dir, "devices.json"));
  await registry.initialize();
  await assert.rejects(() => registry.enroll({ name: "remote", fingerprint: "fp", permissions: ["remote_actions"] }), /separate explicit approval/);
});
