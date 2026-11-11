import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";

const executable = path.resolve("sara-windows/native/WindowsBridge/publish/Sara.WindowsBridge.exe");

async function reserveLoopbackPort(): Promise<number> {
  const listener = net.createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("published Windows bridge authenticates and reports native observations and process lifecycle", {
  skip: process.platform !== "win32" || !fs.existsSync(executable),
}, async (t) => {
  const token = randomBytes(32).toString("base64url");
  const port = await reserveLoopbackPort();
  const child = spawn(executable, [], {
    env: { ...process.env, SARA_WINDOWS_BRIDGE_TOKEN: token, SARA_WINDOWS_BRIDGE_PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  t.after(() => {
    if (!child.killed) child.kill();
  });

  const request = async (operation: string, authorization = `Bearer ${token}`, timestamp = new Date().toISOString(), requestId = randomUUID()) => fetch(`http://127.0.0.1:${port}/v1/observe`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      id: "sara.windows.bridge.v1",
      operation,
      requestId,
      timestamp,
      arguments: {},
    }),
  });

  let health: Response | null = null;
  for (let attempt = 0; attempt < 30 && !health; attempt += 1) {
    try {
      const response = await request("health");
      if (response.ok) health = response;
    } catch { /* bridge is still starting */ }
    if (!health) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(health, "bridge should start and accept authenticated health probes");
  const ready = await health.json() as { ok?: boolean; data?: { readOnly?: boolean } };
  assert.equal(ready.ok, true);
  assert.equal(ready.data?.readOnly, true);

  const foregroundResponse = await request("foreground_window");
  assert.equal(foregroundResponse.status, 200);
  const foreground = await foregroundResponse.json() as { ok?: boolean; operation?: string; data?: { available?: boolean; processId?: number } };
  assert.equal(foreground.ok, true);
  assert.equal(foreground.operation, "foreground_window");
  assert.equal(typeof foreground.data?.available, "boolean");
  const systemResponse = await request("system_info");
  assert.equal(systemResponse.status, 200);
  const system = await systemResponse.json() as { ok?: boolean; data?: { processCount?: number; memory?: { totalBytes?: number } } };
  assert.equal(system.ok, true);
  assert.ok(Number(system.data?.processCount) > 0);
  assert.ok(Number(system.data?.memory?.totalBytes) > 0);
  const monitorsResponse = await request("monitors");
  assert.equal(monitorsResponse.status, 200);
  const monitors = await monitorsResponse.json() as { ok?: boolean; data?: Array<{ width?: number; height?: number; dpiX?: number }> };
  assert.equal(monitors.ok, true);
  assert.ok(Array.isArray(monitors.data));
  assert.ok(monitors.data?.every((monitor) => Number(monitor.width) > 0 && Number(monitor.height) > 0));

  const eventStatusResponse = await request("event_status");
  assert.equal(eventStatusResponse.status, 200);
  const eventStatus = await eventStatusResponse.json() as { ok?: boolean; data?: { running?: boolean; hooksInstalled?: boolean; hookCount?: number } };
  assert.equal(eventStatus.ok, true);
  assert.equal(eventStatus.data?.running, true);
  assert.equal(eventStatus.data?.hooksInstalled, true);
  assert.ok(Number(eventStatus.data?.hookCount) >= 4, "foreground, move/resize, minimize/restore, and window-object event hooks should be installed");

  assert.equal((await request("health", "Bearer invalid")).status, 401);
  assert.equal((await request("launch_process")).status, 400);
  assert.equal((await request("health", `Bearer ${token}`, new Date(Date.now() - 120_000).toISOString())).status, 400);
  const replayId = randomUUID();
  assert.equal((await request("health", `Bearer ${token}`, new Date().toISOString(), replayId)).status, 200);
  assert.equal((await request("health", `Bearer ${token}`, new Date().toISOString(), replayId)).status, 409);

  const streamAbort = new AbortController();
  const streamResponse = await fetch(`http://127.0.0.1:${port}/v1/events`, { headers: { Authorization: `Bearer ${token}` }, signal: streamAbort.signal });
  assert.equal(streamResponse.status, 200);
  assert.ok(streamResponse.body, "authenticated event stream should expose a body");
  const reader = streamResponse.body!.getReader();
  let buffer = "";
  const waitForEvent = async (predicate: (event: any) => boolean, timeoutMs = 9_000): Promise<any> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(100, deadline - Date.now());
      const result = await Promise.race([
        reader.read(),
        new Promise<{ timeout: true }>((resolve) => setTimeout(() => resolve({ timeout: true }), remaining)),
      ]);
      if ((result as { timeout?: boolean }).timeout) break;
      const chunk = result as ReadableStreamReadResult<Uint8Array>;
      if (chunk.done) break;
      buffer += new TextDecoder().decode(chunk.value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { const event = JSON.parse(line); if (predicate(event)) return event; } catch { /* skip malformed stream data */ }
      }
    }
    throw new Error("Timed out waiting for the expected native Windows event.");
  };

  const sleeper = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", "ping 127.0.0.1 -n 5 > nul"], { windowsHide: true, stdio: "ignore" });
  try {
    const started = await waitForEvent((event) => event.eventType === "process_started" && Number(event.processId) === Number(sleeper.pid));
    assert.equal(Number(started.processId), Number(sleeper.pid));
    sleeper.kill();
    const exited = await waitForEvent((event) => event.eventType === "process_exited" && Number(event.processId) === Number(sleeper.pid));
    assert.equal(Number(exited.processId), Number(sleeper.pid));
  } finally {
    if (!sleeper.killed) sleeper.kill();
    streamAbort.abort();
  }
});
