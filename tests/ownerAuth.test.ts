import assert from "node:assert/strict";
import test from "node:test";
import { OwnerAuth } from "../security/ownerAuth";

function memoryStore() {
  const values = new Map<string, string>();
  return { get: (key: string) => values.get(key), set: (key: string, value: string) => values.set(key, value), delete: (key: string) => values.delete(key) };
}

test("owner PIN enrollment and in-memory session fail closed", () => {
  let now = 1_000_000;
  const auth = new OwnerAuth(memoryStore(), () => now);
  auth.initialize();
  assert.equal(auth.authorize(), false);
  assert.deepEqual(auth.status().methods, { pin: false, face: false, voice: false, windowsHello: false });
  assert.throws(() => auth.enrollPin("123456"));
  auth.enrollPin("918273");
  assert.equal(auth.authenticatePin("918272").ok, false);
  assert.equal(auth.authenticatePin("918273").ok, true);
  assert.deepEqual(auth.status().methods, { pin: true, face: false, voice: false, windowsHello: false });
  assert.equal(auth.authorize(), true);
  now += 10 * 60_000 + 1;
  assert.equal(auth.authorize(), false);
});

test("five failed PIN attempts create bounded lockout", () => {
  let now = 2_000_000;
  const auth = new OwnerAuth(memoryStore(), () => now);
  auth.enrollPin("918273");
  for (let i = 0; i < 5; i++) assert.equal(auth.authenticatePin("111111").ok, false);
  const locked = auth.authenticatePin("918273");
  assert.equal(locked.ok, false);
  assert.ok((locked.retryAfterMs || 0) > 0);
  now += (locked.retryAfterMs || 30_000) + 1;
  assert.equal(auth.authenticatePin("918273").ok, true);
});
