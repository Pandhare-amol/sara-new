import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import test from "node:test";

const executable = path.resolve("sara-windows/native/DesktopHost/publish/Sara.DesktopHost.exe");
const pipePath = "\\\\.\\pipe\\Sara.DesktopHost.v1";

type HostStatus = { ok?: boolean; webViewReady?: boolean; backendOnline?: boolean; offlineBannerVisible?: boolean; fillsSelectedWorkArea?: boolean; sessionLocked?: boolean; suspended?: boolean };

function commandHost(command: string, timeoutMs = 1200, attempt = 0): Promise<HostStatus | null> {
  return new Promise((resolve) => {
    const socket = net.connect(pipePath);
    let body = "";
    let done = false;
    const finish = (status: HostStatus | null) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (!status && attempt < 4) setTimeout(() => commandHost(command, timeoutMs, attempt + 1).then(resolve), 50 * (attempt + 1));
      else resolve(status);
    };
    socket.setTimeout(timeoutMs, () => finish(null));
    socket.once("connect", () => socket.write(`${JSON.stringify({ command })}\n`));
    socket.on("data", (chunk) => {
      body += chunk.toString("utf8");
      const newline = body.indexOf("\n");
      if (newline >= 0) {
        try { finish(JSON.parse(body.slice(0, newline)) as HostStatus); } catch { finish(null); }
      }
    });
    socket.once("error", () => finish(null));
    socket.once("end", () => {
      if (!done && body.trim()) {
        try { finish(JSON.parse(body.trim()) as HostStatus); } catch { finish(null); }
      } else finish(null);
    });
  });
}

const origin = process.env.SARA_HOST_TEST_ORIGIN;
test("native WebView2 loads the existing SARA UI against the live local backend", {
  skip: process.platform !== "win32" || !origin || !/^[a-z]+:\/\/127\.0\.0\.1:\d+$/i.test(origin),
}, async (t) => {
  const child: ChildProcess = spawn(executable, [`--origin=${origin}`], { stdio: "ignore", windowsHide: false });
  t.after(async () => {
    await commandHost("shutdown");
    if (child.exitCode === null) child.kill();
  });

  let status: HostStatus | null = null;
  for (let attempt = 0; attempt < 40 && child.exitCode === null; attempt += 1) {
    status = await commandHost("status");
    if (status?.webViewReady && status.backendOnline && !status.offlineBannerVisible) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(child.exitCode, null, "native host should stay running while the UI is open");
  assert.equal(status?.ok, true, "same-user named-pipe host protocol should respond");
  assert.equal(status?.webViewReady, true, "WebView2 should navigate to the existing local React UI");
  assert.equal(status?.backendOnline, true, "native UI should reach SARA's real local backend health endpoint");
  assert.equal(status?.offlineBannerVisible, false, "the offline fallback must not cover the loaded SARA UI when backend health is good");
  assert.equal(status?.fillsSelectedWorkArea, true, "SARA should fill the selected monitor's usable area without covering the Windows taskbar");

  assert.equal((await commandHost("hide"))?.ok, true, "host should support hiding the companion view");
  assert.equal((await commandHost("show"))?.ok, true, "host should restore the companion view");
  assert.equal((await commandHost("unsupported.native.operation"))?.ok, false, "unknown native operations must be rejected");
});
