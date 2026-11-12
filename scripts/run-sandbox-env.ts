/**
 * SARA / J.A.R.V.I.S. Isolated Sandbox Environment & E2E Verifier
 *
 * Modes:
 *   tsx scripts/run-sandbox-env.ts --serve   (runs isolated sandbox server + mock desktop agent)
 *   tsx scripts/run-sandbox-env.ts --verify  (boots sandbox, runs full E2E verification, exits 0/1)
 *
 * Guarantees:
 *   - Never touches %APPDATA%\Sara or production user files
 *   - Isolates all persistence inside .sara-sandbox/ (or temp dir in --verify)
 *   - Simulates destructive/power/process tools safely via mock Desktop Agent
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const args = new Set(process.argv.slice(2));
const verifyMode = args.has("--verify");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

interface SandboxDesktopAgent {
  url: string;
  token: string;
  close: () => Promise<void>;
}

async function startSandboxDesktopAgent(port: number, virtualFsRoot: string): Promise<SandboxDesktopAgent> {
  fs.mkdirSync(virtualFsRoot, { recursive: true });
  const token = `sandbox-token-${Date.now()}`;
  let ramUsedMb = 9_400;
  const cleanedPids = new Set<number>();

  const mockWindows = [
    { handle: "0x101", title: "sara-new - Visual Studio Code", processName: "Code", processId: 4100, bounds: { x: 0, y: 0, width: 1280, height: 1040 } },
    { handle: "0x102", title: "JARVIS Documentation - Google Chrome", processName: "chrome", processId: 4200, bounds: { x: 1280, y: 0, width: 640, height: 1040 } },
    { handle: "0x103", title: "Windows PowerShell", processName: "powershell", processId: 4300, bounds: { x: 200, y: 200, width: 900, height: 600 } },
  ];

  const server = http.createServer((req, res) => {
    const send = (code: number, payload: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (req.method === "GET" && req.url === "/health") {
      return send(200, { status: "ok", sandbox: true, tool_count: 76 });
    }
    if (req.method === "GET" && req.url === "/observe") {
      return send(200, {
        timestamp: new Date().toISOString(),
        activeWindow: { title: mockWindows[0].title, processName: mockWindows[0].processName, pid: mockWindows[0].processId },
        openWindows: mockWindows,
        system: { cpuPercent: 18.4, memoryPercent: 57.3, diskPercent: 44.1 },
      });
    }
    if (req.method === "POST" && req.url === "/execute") {
      const auth = req.headers.authorization || "";
      if (auth !== `Bearer ${token}`) {
        return send(401, { ok: false, error: "Unauthorized sandbox token" });
      }
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw || "{}") as { tool?: string; args?: Record<string, any> };
          const tool = String(body.tool || "");
          const toolArgs = body.args || {};

          if (tool === "getResourceSnapshot") {
            return send(200, {
              ok: true,
              result: {
                cpu_percent: cleanedPids.size > 0 ? 11.2 : 24.8,
                ram_used_mb: ramUsedMb,
                ram_total_mb: 16_384,
                ram_percent: Number(((ramUsedMb / 16_384) * 100).toFixed(1)),
                process_count: 92 - cleanedPids.size,
              },
            });
          }
          if (tool === "listResourceProcesses") {
            const procs = [
              { pid: 8801, name: "HeavyIdleHelper.exe", executablePath: "C:\\Sandbox\\HeavyIdleHelper.exe", startedAt: 1700000000, memory_mb: 920 },
              { pid: 1004, name: "explorer.exe", executablePath: "C:\\Windows\\explorer.exe", startedAt: 1700000000, memory_mb: 140 },
            ].filter((p) => !cleanedPids.has(p.pid));
            return send(200, { ok: true, result: { processes: procs, total_sampled: procs.length } });
          }
          if (tool === "cleanupAllowlistedProcess") {
            const pid = Number(toolArgs.pid || 0);
            cleanedPids.add(pid);
            ramUsedMb = Math.max(4_096, ramUsedMb - 920);
            return send(200, {
              ok: true,
              result: {
                result: `[SANDBOX] Gracefully cleaned allowlisted process ${toolArgs.name || toolArgs.process_name} (pid ${pid})`,
                freed_mb: 920,
                simulated: true,
                verified: true,
              },
            });
          }
          if (tool === "listVisibleWindows") {
            return send(200, { ok: true, result: { windows: mockWindows } });
          }
          if (tool === "executePowerAction" || tool === "requestPowerAction") {
            return send(200, {
              ok: true,
              result: {
                result: `[SANDBOX SIMULATION] Simulated '${toolArgs.action || "sleep"}' safely without affecting host OS.`,
                simulated: true,
                verified: true,
              },
            });
          }
          if (tool === "createFile") {
            const safeName = path.basename(String(toolArgs.path || toolArgs.filename || "sandbox-note.txt"));
            const target = path.join(virtualFsRoot, safeName);
            fs.writeFileSync(target, String(toolArgs.content || ""), "utf8");
            return send(200, { ok: true, result: { path: target, verified: true } });
          }
          if (tool === "runOsCommand") {
            const cmd = String(toolArgs.command || "").trim();
            const child = spawn(process.platform === "win32" ? "cmd.exe" : "/bin/bash", process.platform === "win32" ? ["/d", "/s", "/c", cmd] : ["-c", cmd], {
              cwd: typeof toolArgs.cwd === "string" && toolArgs.cwd ? toolArgs.cwd : virtualFsRoot,
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (d) => { stdout += String(d); });
            child.stderr.on("data", (d) => { stderr += String(d); });
            child.on("close", (code) => {
              send(200, {
                ok: code === 0,
                result: {
                  ok: code === 0,
                  exit_code: code ?? 0,
                  stdout: stdout.trim(),
                  stderr: stderr.trim(),
                  result: stdout.trim() || `Exited ${code ?? 0}`,
                },
              });
            });
            return;
          }
          if (tool === "osSystemSetting") {
            return send(200, {
              ok: true,
              result: {
                ok: true,
                setting: toolArgs.setting,
                target: toolArgs.target,
                result: `[SANDBOX] Applied OS setting '${toolArgs.setting}' immediately with zero user approval.`,
              },
            });
          }
          if (tool === "osArchive") {
            return send(200, {
              ok: true,
              result: {
                ok: true,
                action: toolArgs.action,
                path: path.join(virtualFsRoot, "archive.zip"),
                result: `[SANDBOX] Completed archive '${toolArgs.action}' for ${toolArgs.source}.`,
              },
            });
          }
          return send(200, {
            ok: true,
            result: {
              simulated: true,
              tool,
              summary: `[SANDBOX] Executed ${tool} safely.`,
              verified: true,
            },
          });
        } catch (err) {
          return send(400, { ok: false, error: String(err) });
        }
      });
      return;
    }
    send(404, { error: "Not found" });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function waitForHealth(baseUrl: string, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  throw new Error(`Sandbox server at ${baseUrl} did not become healthy within ${timeoutMs}ms.`);
}

async function runVerification(baseUrl: string): Promise<void> {
  const results: Array<{ check: string; ok: boolean; detail: string }> = [];
  const assertCheck = async (check: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn();
      results.push({ check, ok: true, detail });
    } catch (err) {
      results.push({ check, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  await assertCheck("1. Sandbox Environment Isolation (/api/environment)", async () => {
    const res = await fetch(`${baseUrl}/api/environment`);
    const body = (await res.json()) as any;
    if (!res.ok || body.sandbox !== true || body.mode !== "sandbox") {
      throw new Error(`Expected sandbox=true, got ${JSON.stringify(body)}`);
    }
    return `mode=${body.mode}, dataDir=${body.dataDir}`;
  });

  await assertCheck("2. Zero-Prompt Autonomous Policy (/api/permissions)", async () => {
    const res = await fetch(`${baseUrl}/api/permissions`);
    const body = (await res.json()) as any;
    if (!res.ok || body.policy?.autonomousOverride !== true) {
      throw new Error(`Expected autonomousOverride=true, got ${JSON.stringify(body.policy)}`);
    }
    return `autonomousOverride=true, messageMode=${body.policy.messageConfirmation}`;
  });

  await assertCheck("3. Executive JARVIS Briefing (/api/jarvis/briefing)", async () => {
    const res = await fetch(`${baseUrl}/api/jarvis/briefing`);
    const body = (await res.json()) as any;
    if (!res.ok || typeof body.spokenBriefing !== "string" || !body.telemetry) {
      throw new Error("Invalid briefing payload");
    }
    return `RAM=${body.telemetry.ramPercent}%, Security=${body.security.shieldEnabled ? "armed" : "off"}`;
  });

  await assertCheck("4. Operational Protocols Catalogue & Custom Protocol (/api/jarvis/protocols)", async () => {
    const listRes = await fetch(`${baseUrl}/api/jarvis/protocols`);
    const protocols = (await listRes.json()) as any[];
    if (!Array.isArray(protocols) || protocols.length < 5) {
      throw new Error(`Expected >=5 built-in protocols, got ${protocols.length}`);
    }
    const saveRes = await fetch(`${baseUrl}/api/jarvis/protocols`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Deep Research Sprint",
        description: "Quiet mode + level-2 cleanup + 30m timer",
        steps: [
          { type: "set_dnd", active: true },
          { type: "self_optimize", level: 2 },
          { type: "set_timer", minutes: 30, label: "Research sprint complete" },
        ],
      }),
    });
    if (!saveRes.ok) throw new Error(`Custom protocol save failed (${saveRes.status})`);
    const execRes = await fetch(`${baseUrl}/api/jarvis/protocols/deep_research_sprint/execute`, { method: "POST" });
    const execBody = (await execRes.json()) as any;
    if (!execRes.ok || execBody.ok !== true) throw new Error(`Protocol execution failed: ${JSON.stringify(execBody)}`);
    return `${protocols.length} built-ins + custom 'deep_research_sprint' executed (${execBody.executedSteps.length} steps)`;
  });

  await assertCheck("5. Self-Optimization Engine + Allowlist Cleanup (/api/optimization/*)", async () => {
    await fetch(`${baseUrl}/api/optimization/allowlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processName: "HeavyIdleHelper.exe", maxRamMb: 500, autoCleanup: true }),
    });
    const blockedRes = await fetch(`${baseUrl}/api/optimization/allowlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processName: "explorer.exe", maxRamMb: 100 }),
    });
    if (blockedRes.status !== 400) {
      throw new Error("Expected explorer.exe allowlist attempt to be rejected with 400!");
    }
    const runRes = await fetch(`${baseUrl}/api/optimization/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: 2 }),
    });
    const report = (await runRes.json()) as any;
    if (!runRes.ok || !Array.isArray(report.cleanedProcesses) || report.cleanedProcesses.length !== 1) {
      throw new Error(`Expected HeavyIdleHelper.exe cleanup, got ${JSON.stringify(report)}`);
    }
    return `Cleaned ${report.cleanedProcesses[0].processName}, deltaRamMb=${report.deltaRamMb} MB (explorer.exe protected)`;
  });

  await assertCheck("6. Persistent Window Workspaces (/api/windows/workspaces)", async () => {
    const createRes = await fetch(`${baseUrl}/api/windows/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sandbox Dev Layout",
        captureCurrent: false,
        windows: [{ title: "VS Code", processName: "Code", bounds: { x: 0, y: 0, width: 1280, height: 900 } }],
      }),
    });
    const ws = (await createRes.json()) as any;
    if (!createRes.ok || !ws.id) throw new Error(`Workspace creation failed: ${JSON.stringify(ws)}`);
    const actRes = await fetch(`${baseUrl}/api/windows/workspaces/${ws.id}/activate`, { method: "POST" });
    if (!actRes.ok) throw new Error("Workspace activation failed");
    return `Created & activated '${ws.name}' (${ws.id.slice(0, 8)})`;
  });

  await assertCheck("7. Engineering Co-Pilot Project Inspector (/api/jarvis/inspect-project)", async () => {
    const res = await fetch(`${baseUrl}/api/jarvis/inspect-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: process.cwd() }),
    });
    const info = (await res.json()) as any;
    if (!res.ok || !Array.isArray(info.detectedStacks) || info.detectedStacks.length === 0) {
      throw new Error(`Unexpected project inspection: ${JSON.stringify(info)}`);
    }
    return `Detected stacks=[${info.detectedStacks.join(", ")}], scripts=${info.scripts.length}`;
  });

  await assertCheck("8. Two-Agent App Capability Evaluator (/api/evaluator/*)", async () => {
    const genRes = await fetch(`${baseUrl}/api/evaluator/missions/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxMissions: 6 }),
    });
    const genBody = (await genRes.json()) as any;
    if (!genRes.ok) throw new Error(`Mission generation failed: ${JSON.stringify(genBody)}`);
    const statusRes = await fetch(`${baseUrl}/api/evaluator/status`);
    const status = (await statusRes.json()) as any;
    if (!statusRes.ok || typeof status.totalDiscoveredApps !== "number") {
      throw new Error("Invalid evaluator status");
    }
    return `Inventory=${status.totalDiscoveredApps} apps, missions=${status.totalMissions}`;
  });

  await assertCheck("9. SARA Security Shield — Enroll, Lock Enforcement, Passphrase & Recovery", async () => {
    // Enroll Owner Passphrase
    const enrollRes = await fetch(`${baseUrl}/api/security/enroll-passphrase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "jarvis-iron-shield-2026" }),
    });
    const enrollBody = (await enrollRes.json()) as any;
    if (!enrollRes.ok || !enrollBody.ok || !enrollBody.recoveryCode) {
      throw new Error(`Passphrase enrollment failed: ${JSON.stringify(enrollBody)}`);
    }

    // Trigger Lockdown Mode -> unauthorized task creation MUST fail with 423!
    await fetch(`${baseUrl}/api/security/lockdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "sandbox_intrusion_drill" }),
    });

    const blockedTask = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Open Notepad while locked" }),
    });
    if (blockedTask.status !== 423) {
      throw new Error(`Expected 423 Locked during Lockdown, got ${blockedTask.status}`);
    }

    // Wrong passphrase increments intrusion counter & stays locked
    const badAuth = await fetch(`${baseUrl}/api/security/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "wrong-intruder-secret" }),
    });
    if (badAuth.status !== 401) {
      throw new Error(`Expected 401 for wrong passphrase, got ${badAuth.status}`);
    }

    // Unlock via Emergency Recovery Code -> clears Lockdown & restores owner session!
    const recAuth = await fetch(`${baseUrl}/api/security/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryCode: enrollBody.recoveryCode }),
    });
    const recBody = (await recAuth.json()) as any;
    if (!recAuth.ok || recBody.ok !== true) {
      throw new Error(`Recovery code unlock failed: ${JSON.stringify(recBody)}`);
    }
    return "Passphrase enrolled -> Lockdown blocked unauthorized task (HTTP 423) -> Intruder rejected (HTTP 401) -> Recovery Code unlocked session";
  });

  await assertCheck("10. Project ULTRON — Perimeter Scan, Integrity Watchtower, Parallel Legion & Skill Forge (/api/ultron/*)", async () => {
    // Watch package.json integrity
    const watchRes = await fetch(`${baseUrl}/api/ultron/integrity/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path.join(process.cwd(), "package.json"), label: "Root Manifest" }),
    });
    if (!watchRes.ok) throw new Error(`Watchpoint creation failed (${watchRes.status})`);

    // Run real Ultron Perimeter Scan
    const scanRes = await fetch(`${baseUrl}/api/ultron/scan`, { method: "POST" });
    const scan = (await scanRes.json()) as any;
    if (!scanRes.ok || typeof scan.armorScore !== "number") {
      throw new Error(`Ultron scan failed: ${JSON.stringify(scan)}`);
    }

    // Deploy parallel Ultron Iron Legion Swarm
    const legionRes = await fetch(`${baseUrl}/api/ultron/legion/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directive: "Audit repository health, network perimeter, and resource utilization",
        maxSentries: 4,
      }),
    });
    const legion = (await legionRes.json()) as any;
    if (!legionRes.ok || legion.succeededCount < 4) {
      throw new Error(`Ultron Legion failed: ${JSON.stringify(legion)}`);
    }

    // Forge safe Python skill & reject unsafe Python skill
    const safeForge = await fetch(`${baseUrl}/api/ultron/forge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ultron_hash_helper",
        description: "Deterministic SHA-256 helper",
        pythonSource: "import hashlib\ndef run(x: str) -> str:\n    return hashlib.sha256(x.encode()).hexdigest()\n",
      }),
    });
    if (safeForge.status !== 201) {
      throw new Error(`Expected safe Python skill to validate (201), got ${safeForge.status}`);
    }

    const unsafeForge = await fetch(`${baseUrl}/api/ultron/forge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "unsafe_eval",
        description: "Must be blocked",
        pythonSource: "eval('1+1')\n",
      }),
    });
    if (unsafeForge.status !== 400) {
      throw new Error(`Expected unsafe eval() skill to be rejected (400), got ${unsafeForge.status}`);
    }

    // Verify Owner Kill-Switch
    const ksRes = await fetch(`${baseUrl}/api/ultron/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "sandbox_verification_complete" }),
    });
    if (!ksRes.ok) throw new Error(`Ultron Kill-Switch failed (${ksRes.status})`);

    return `Armor=${scan.armorScore}/100, Legion=${legion.succeededCount}/${legion.sentryCount} Sentries parallel, Forge validated safe & blocked unsafe, Kill-Switch verified`;
  });

  await assertCheck("11. Movie-Grade Stark Workshop (/api/jarvis/workshop/*)", async () => {
    const sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "sara-sandbox-workshop-"));
    try {
      const targetFile = path.join(sampleDir, "reactor.ts");
      fs.writeFileSync(path.join(sampleDir, "package.json"), JSON.stringify({ name: "reactor-sim", version: "1.0.0" }), "utf8");
      fs.writeFileSync(targetFile, 'export const arcPower = 100;\napp.get("/api/arc/power", () => {});\n', "utf8");

      const simRes = await fetch(`${baseUrl}/api/jarvis/workshop/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath: sampleDir, checkType: "structural_audit", label: "Sandbox Twin Sim" }),
      });
      const simBody = (await simRes.json()) as any;
      if (!simRes.ok || simBody.simulation?.passed !== true) {
        throw new Error(`Twin simulation failed: ${JSON.stringify(simBody)}`);
      }

      const bpRes = await fetch(`${baseUrl}/api/jarvis/workshop/blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPath: sampleDir }),
      });
      const bpBody = (await bpRes.json()) as any;
      if (!bpRes.ok || !Array.isArray(bpBody.blueprint?.apiRoutes) || !bpBody.blueprint.apiRoutes.includes("/api/arc/power")) {
        throw new Error(`Blueprint reconstruction missed API route: ${JSON.stringify(bpBody)}`);
      }

      const canRes = await fetch(`${baseUrl}/api/jarvis/workshop/canary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: sampleDir, label: "Sandbox-Canary" }),
      });
      if (canRes.status !== 201) throw new Error(`Canary deploy failed (${canRes.status})`);

      const snapRes = await fetch(`${baseUrl}/api/jarvis/workshop/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetFile, label: "Clean reactor.ts" }),
      });
      const snapBody = (await snapRes.json()) as any;
      if (snapRes.status !== 201) throw new Error(`Snapshot failed (${snapRes.status})`);

      fs.writeFileSync(targetFile, "// corrupted", "utf8");
      const restoreRes = await fetch(`${baseUrl}/api/jarvis/workshop/snapshot/${encodeURIComponent(snapBody.snapshot.id)}/restore`, {
        method: "POST",
      });
      if (!restoreRes.ok || !fs.readFileSync(targetFile, "utf8").includes("arcPower")) {
        throw new Error("Shadow Snapshot self-healing restore failed");
      }

      const pwrRes = await fetch(`${baseUrl}/api/jarvis/workshop/power-reroute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const pwrBody = (await pwrRes.json()) as any;
      if (!pwrRes.ok || pwrBody.auxiliaryPowerReroute !== true) {
        throw new Error("Auxiliary Power Reroute failed");
      }

      return `TwinSim=${simBody.simulation.filesCloned} files, Blueprint=${bpBody.blueprint.apiRoutes.length} routes, Canary+Snapshot self-heal OK, AuxPower=rerouted`;
    } finally {
      fs.rmSync(sampleDir, { recursive: true, force: true });
    }
  });

  await assertCheck("12. J.A.R.V.I.S. Voice Tone, Core UI Switcher & Command Deck (/api/jarvis/command)", async () => {
    const setRes = await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice: { voiceName: "Charon", style: "jarvis" },
        jarvis: { surfaceMode: "live_core" },
      }),
    });
    const setBody = (await setRes.json()) as any;
    if (!setRes.ok || setBody.voice?.style !== "jarvis" || setBody.jarvis?.surfaceMode !== "live_core") {
      throw new Error(`Settings update failed: ${JSON.stringify(setBody)}`);
    }

    const cmdRes = await fetch(`${baseUrl}/api/jarvis/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "Give me an executive briefing" }),
    });
    const cmdBody = (await cmdRes.json()) as any;
    if (!cmdRes.ok || cmdBody.intent !== "briefing" || cmdBody.voiceStyle !== "jarvis") {
      throw new Error(`Command dispatcher failed: ${JSON.stringify(cmdBody)}`);
    }

    return `voice=${setBody.voice.voiceName}/${setBody.voice.style}, surfaceMode=${setBody.jarvis.surfaceMode}, commandIntent=${cmdBody.intent}`;
  });

  await assertCheck("13. Zero-Approval Autonomous OS Execution — Shell, Settings, Power & High-Risk Overwrite (/api/os/execute)", async () => {
    // 1. Run arbitrary OS shell command directly with zero approval prompt
    const osCmdRes = await fetch(`${baseUrl}/api/os/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "runOsCommand",
        args: { command: "echo SARA_OS_AUTONOMOUS_OK" },
      }),
    });
    const osCmdBody = (await osCmdRes.json()) as any;
    if (!osCmdRes.ok || !osCmdBody.ok || !String(osCmdBody.result?.stdout || "").includes("SARA_OS_AUTONOMOUS_OK")) {
      throw new Error(`runOsCommand failed or asked confirmation: ${JSON.stringify(osCmdBody)}`);
    }

    // 2. High-risk overwrite file creation (riskLevel=3) runs with status='succeeded' (NOT confirmation_required!)
    const overwriteRes = await fetch(`${baseUrl}/api/os/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "createFile",
        args: { path: "autonomous-os-check.txt", content: "zero-approval-verified", overwrite: true },
      }),
    });
    const overwriteBody = (await overwriteRes.json()) as any;
    if (!overwriteRes.ok || overwriteBody.status !== "succeeded") {
      throw new Error(`High-risk overwrite required confirmation instead of auto-executing: ${JSON.stringify(overwriteBody)}`);
    }

    // 3. 1-step executePowerAction without execute_token succeeds immediately
    const powerRes = await fetch(`${baseUrl}/api/os/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "executePowerAction",
        args: { action: "lock" },
      }),
    });
    const powerBody = (await powerRes.json()) as any;
    if (!powerRes.ok || powerBody.status !== "succeeded") {
      throw new Error(`1-step executePowerAction failed: ${JSON.stringify(powerBody)}`);
    }

    // 4. Natural command without 'task:' prefix auto-dispatches autonomous OS task (never says 'I can't')
    const naturalRes = await fetch(`${baseUrl}/api/jarvis/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "Organize project logs and compress old reports into a zip archive" }),
    });
    const naturalBody = (await naturalRes.json()) as any;
    if (!naturalRes.ok || naturalBody.intent !== "autonomous_os_task" || !naturalBody.taskId) {
      throw new Error(`Natural command was not auto-dispatched as OS task: ${JSON.stringify(naturalBody)}`);
    }

    // Restore default companion surfaceMode cleanly
    await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvis: { surfaceMode: "companion" } }),
    });

    return `runOsCommand=OK, riskLevel3Overwrite=${overwriteBody.status}, 1StepPower=${powerBody.status}, autoTask=${naturalBody.intent}`;
  });

  await assertCheck("14. 4-Layer Agentic Event Loop & Episodic RL Memory — Gemini-Powered, Zero Ollama (/api/agentic/*)", async () => {
    // 1. Run Plan-and-Solve + ReAct objective directly via /api/agentic/objective
    const objRes = await fetch(`${baseUrl}/api/agentic/objective`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objective: "cmd: echo AGENTIC_LOOP_E2E_VERIFIED",
      }),
    });
    const objBody = (await objRes.json()) as any;
    if (!objRes.ok || !objBody.ok || objBody.run?.status !== "succeeded") {
      throw new Error(`Agentic objective failed: ${JSON.stringify(objBody)}`);
    }

    // 2. Verify Episodic RL Trajectory & pre-action cosine retrieval via /api/agentic/trajectories
    const trajRes = await fetch(`${baseUrl}/api/agentic/trajectories?query=${encodeURIComponent("AGENTIC_LOOP_E2E_VERIFIED")}`);
    const trajBody = (await trajRes.json()) as any;
    if (!trajRes.ok || trajBody.totalTrajectories < 1 || !Array.isArray(trajBody.retrieved) || trajBody.retrieved.length < 1) {
      throw new Error(`Episodic RL trajectory retrieval failed: ${JSON.stringify(trajBody)}`);
    }

    // 3. Register event-driven watched folder & trigger rule
    const dropFolder = path.join(os.tmpdir(), `sara-drop-e2e-${Date.now()}`);
    try {
      const ruleRes = await fetch(`${baseUrl}/api/agentic/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Drop Folder Auto-Ingest",
          eventType: "file_dropped",
          folderFilter: dropFolder,
          objectiveTemplate: "cmd: echo DROPPED_{name}",
        }),
      });
      const ruleBody = (await ruleRes.json()) as any;
      if (ruleRes.status !== 201 || !ruleBody.ok) {
        throw new Error(`Agentic trigger rule creation failed: ${JSON.stringify(ruleBody)}`);
      }

      const statusRes = await fetch(`${baseUrl}/api/agentic/status`);
      const statusBody = (await statusRes.json()) as any;
      if (!statusRes.ok || !Array.isArray(statusBody.watchedFolders) || statusBody.watchedFolders.length < 1) {
        throw new Error(`Agentic status missing watchedFolders: ${JSON.stringify(statusBody)}`);
      }

      return `ReAct=${objBody.run.status}, RLReward=${objBody.run.totalReward}, Retrieved=${trajBody.retrieved.length}, WatchedFolders=${statusBody.watchedFolders.length}`;
    } finally {
      fs.rmSync(dropFolder, { recursive: true, force: true });
    }
  });

  await assertCheck("15. 5-Mode J.A.R.V.I.S. State Machine, Formal Constraint Gate & Meta-Cognition (/api/jarvis/modes & /api/meta/*)", async () => {
    // 1. Self-Awareness AST & Hardware Manifest
    const selfRes = await fetch(`${baseUrl}/api/meta/self-awareness`);
    const selfBody = (await selfRes.json()) as any;
    if (!selfRes.ok || selfBody.identity !== "SARA-META-COGNITIVE" || !Array.isArray(selfBody.installedModules) || selfBody.installedModules.length < 5) {
      throw new Error(`Self-awareness manifest failed: ${JSON.stringify(selfBody)}`);
    }

    // 2. Formal Constraint Gate proof
    const proofRes = await fetch(`${baseUrl}/api/meta/formal-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ramAvailableMb: 512,
        cpuPercent: 25,
        dependencies: [
          { stepId: "verify", requires: ["build"] },
          { stepId: "build", requires: [] },
        ],
      }),
    });
    const proofBody = (await proofRes.json()) as any;
    if (!proofRes.ok || !proofBody.ok || proofBody.proof.executionOrder.join(",") !== "build,verify") {
      throw new Error(`Formal constraint proof failed: ${JSON.stringify(proofBody)}`);
    }

    // 3. Lateral Strategy + Safe Knowledge Learner
    const latRes = await fetch(`${baseUrl}/api/meta/lateral-strategy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: "Index workspace markdown notes cleanly" }),
    });
    const latBody = (await latRes.json()) as any;
    if (!latRes.ok || !latBody.ok || !latBody.strategy?.lateralStrategy) {
      throw new Error(`Lateral strategy failed: ${JSON.stringify(latBody)}`);
    }

    const learnRes = await fetch(`${baseUrl}/api/meta/learn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Pure Python checksum helper",
        pythonHelperCode: "def calc_word_count(text: str) -> int:\n    return len(text.split())\n",
      }),
    });
    const learnBody = (await learnRes.json()) as any;
    if (learnRes.status !== 201 || learnBody.entry?.verifiedPythonHelperName !== "calc_word_count") {
      throw new Error(`Safe knowledge learner failed: ${JSON.stringify(learnBody)}`);
    }

    // 4. 5-Mode J.A.R.V.I.S. State Machine + Workshop Co-Pilot Diagnostic + Barge-In
    const modeRes = await fetch(`${baseUrl}/api/jarvis/modes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "CO_PILOT", lock: false }),
    });
    const modeBody = (await modeRes.json()) as any;
    if (!modeRes.ok || modeBody.directive?.mode !== "CO_PILOT") {
      throw new Error(`Mode switch failed: ${JSON.stringify(modeBody)}`);
    }

    const diagRes = await fetch(`${baseUrl}/api/jarvis/copilot/diagnose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "SyntaxError: Unexpected token '}' in build.ts" }),
    });
    const diagBody = (await diagRes.json()) as any;
    if (!diagRes.ok || !diagBody.ok || !diagBody.diagnostic?.detectedErrorType) {
      throw new Error(`Workshop diagnostic failed: ${JSON.stringify(diagBody)}`);
    }

    return `SelfAware=${selfBody.installedModules.length} mods, FormalProof=SAT, Helper=${learnBody.entry.verifiedPythonHelperName}, Mode=${modeBody.directive.mode}, CoPilotDiag=OK`;
  });

  await assertCheck("16. Local SARA-ASI Kernel, Biometric Watchdog, Pattern Engine, Guardian Suite & SARA OS Surface (/api/asi/* & /api/jarvis/*)", async () => {
    // 1. ASI Kernel Cycle + Sandboxed Plugin Self-Evolution
    const cycleRes = await fetch(`${baseUrl}/api/asi/kernel/cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objective: "Audit workspace modules and pre-warm local trajectory cache",
        telemetryOverride: { ramPercent: 48, cpuPercent: 18, ramAvailableMb: 2048 },
      }),
    });
    const cycleBody = (await cycleRes.json()) as any;
    if (!cycleRes.ok || !cycleBody.ok || !cycleBody.cycle?.formalProof?.satisfiable) {
      throw new Error(`ASI kernel cycle failed: ${JSON.stringify(cycleBody)}`);
    }

    // 2. Deference Pushback intercepts destructive command
    const defRes = await fetch(`${baseUrl}/api/jarvis/deference/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "rm -rf /" }),
    });
    const defBody = (await defRes.json()) as any;
    if (!defRes.ok || !defBody.assessment?.pushbackNeeded || defBody.assessment?.riskLevel !== "CRITICAL") {
      throw new Error(`Deference pushback failed: ${JSON.stringify(defBody)}`);
    }

    // 3. Mark II Simulation Lab self-heals & mounts micro-app to SARA OS Dock
    const labRes = await fetch(`${baseUrl}/api/jarvis/lab/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sandbox Pulse Tool",
        specification: "Return structured diagnostic health summary",
        initialBrokenCodeForSelfHealTest: "export const bad = (; // broken seed",
      }),
    });
    const labBody = (await labRes.json()) as any;
    if (labRes.status !== 201 || !labBody.ok || labBody.app?.attemptsUsed < 2) {
      throw new Error(`Simulation Lab self-healing build failed: ${JSON.stringify(labBody)}`);
    }

    // 4. House Party Fleet parallel dispatch + Biometric Presence + SARA OS surfaceMode switcher
    const fleetRes = await fetch(`${baseUrl}/api/jarvis/fleet/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directive: "House Party Parallel Verification",
        tasks: ["Verify AST", "Check RAM Gate", "Sync Dock", "Update Briefing"],
      }),
    });
    const fleetBody = (await fleetRes.json()) as any;
    if (!fleetRes.ok || fleetBody.report?.completedTasks !== 4) {
      throw new Error(`House Party fleet failed: ${JSON.stringify(fleetBody)}`);
    }

    const uiRes = await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvis: { surfaceMode: "sara_os" } }),
    });
    const uiBody = (await uiRes.json()) as any;
    if (!uiRes.ok || uiBody.jarvis?.surfaceMode !== "sara_os") {
      throw new Error(`SARA OS surfaceMode switch failed: ${JSON.stringify(uiBody)}`);
    }
    // Restore default companion surfaceMode cleanly
    await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvis: { surfaceMode: "companion" } }),
    });

    return `ASIKernel=SAT, Pushback=CRITICAL_BLOCKED, LabSelfHeal=${labBody.app.attemptsUsed}tries, HouseParty=4/4, Surface=sara_os`;
  });

  await assertCheck("17. SARA 2050 Horizon Architecture & 3-UI Surface Health (/api/sara-2050/*)", async () => {
    // 1. Status & Public Key Fingerprint
    const stRes = await fetch(`${baseUrl}/api/sara-2050/status`);
    const stBody = (await stRes.json()) as any;
    if (!stRes.ok || typeof stBody.publicKeyFingerprint !== "string") {
      throw new Error(`Invalid /api/sara-2050/status: ${JSON.stringify(stBody)}`);
    }

    // 2. Continuous Multi-Horizon Goal + A2A Envelopes
    const cgRes = await fetch(`${baseUrl}/api/sara-2050/continuous-goal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objective: "Audit all SARA UIs and verify 2050 Horizon subsystem readiness",
        budgetComputeUnits: 120,
      }),
    });
    const cgBody = (await cgRes.json()) as any;
    if (!cgRes.ok || !cgBody.plan?.goalId || !Array.isArray(cgBody.plan?.a2aEnvelopes)) {
      throw new Error(`Continuous goal failed: ${JSON.stringify(cgBody)}`);
    }

    // 3. Causal World Model Simulation + Neuro-Symbolic Proof-Carrying Decision
    const wsRes = await fetch(`${baseUrl}/api/sara-2050/world-simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "Verify frontend bundle integrity", targetNode: "codebase_integrity" }),
    });
    const wsBody = (await wsRes.json()) as any;
    if (!wsRes.ok || typeof wsBody.prediction?.stabilityScore !== "number") {
      throw new Error(`World simulate failed: ${JSON.stringify(wsBody)}`);
    }

    const pdRes = await fetch(`${baseUrl}/api/sara-2050/proof-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: "Apply verified configuration checkpoint" }),
    });
    const pdBody = (await pdRes.json()) as any;
    if (!pdRes.ok || pdBody.decision?.formalProof?.satisfiable !== true) {
      throw new Error(`Proof decision failed: ${JSON.stringify(pdBody)}`);
    }

    // 4. Lifelong Local Memory Graph + Affective Calibration + Ed25519 Sign/Verify
    const memRes = await fetch(`${baseUrl}/api/sara-2050/memory-graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "project",
        label: "SARA Multi-Surface Suite",
        summary: "Classic SARA, 3D Live Core, and Spatial 2050 UIs verified",
        privateLocalOnly: true,
      }),
    });
    if (!memRes.ok) throw new Error(`Memory graph upsert failed (${memRes.status})`);

    const affRes = await fetch(`${baseUrl}/api/sara-2050/affective`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recentMessage: "URGENT! Give me a fast status check right now!" }),
    });
    const affBody = (await affRes.json()) as any;
    if (!affRes.ok || !affBody.profile?.pacing) {
      throw new Error(`Affective calibration failed: ${JSON.stringify(affBody)}`);
    }

    const signRes = await fetch(`${baseUrl}/api/sara-2050/provenance/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "sara.e2e", content: "e2e-2050-checkpoint" }),
    });
    const signBody = (await signRes.json()) as any;
    const verRes = await fetch(`${baseUrl}/api/sara-2050/provenance/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificate: signBody.certificate, content: "e2e-2050-checkpoint" }),
    });
    const verBody = (await verRes.json()) as any;
    if (!verRes.ok || verBody.valid !== true) {
      throw new Error(`Ed25519 provenance verify failed: ${JSON.stringify(verBody)}`);
    }

    // 5. Global Alignment Kill-Switch Engage & Reset + 3-Way UI Surface Cycle
    const ksOn = await fetch(`${baseUrl}/api/sara-2050/governance/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: false, reason: "Sandbox E2E kill-switch drill" }),
    });
    const ksOnBody = (await ksOn.json()) as any;
    if (!ksOn.ok || ksOnBody.killSwitchActive !== true) {
      throw new Error(`Kill-switch engage failed: ${JSON.stringify(ksOnBody)}`);
    }
    const ksOff = await fetch(`${baseUrl}/api/sara-2050/governance/kill-switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true, reason: "Sandbox E2E kill-switch reset" }),
    });
    const ksOffBody = (await ksOff.json()) as any;
    if (!ksOff.ok || ksOffBody.killSwitchActive !== false) {
      throw new Error(`Kill-switch reset failed: ${JSON.stringify(ksOffBody)}`);
    }

    for (const mode of ["live_core", "sara_os", "companion"] as const) {
      const mRes = await fetch(`${baseUrl}/api/app-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jarvis: { surfaceMode: mode } }),
      });
      const mBody = (await mRes.json()) as any;
      if (!mRes.ok || mBody.jarvis?.surfaceMode !== mode) {
        throw new Error(`Surface switch to ${mode} failed`);
      }
    }

    return `A2AContracts=${cgBody.plan.a2aEnvelopes.length}, WorldStability=${wsBody.prediction.stabilityScore}, Proof=SAT+Ed25519(${signBody.certificate.publicKeyFingerprint.slice(0, 10)}), Surfaces=3/3`;
  });

  await assertCheck("18. SARA Dual Modes (J.A.R.V.I.S. & Ultron), Executive Ops HUD & Working Local Integrations", async () => {
    // 1. Default persona status: SARA active, J.A.R.V.I.S. & Ultron OFF
    const p0Res = await fetch(`${baseUrl}/api/persona/status`);
    const p0 = (await p0Res.json()) as any;
    if (!p0Res.ok || p0.personas?.activeMode !== "sara" || p0.personas?.jarvisActive !== false || p0.personas?.ultronActive !== false) {
      throw new Error(`Expected SARA default with sub-modes OFF: ${JSON.stringify(p0)}`);
    }

    // 2. Activate J.A.R.V.I.S. -> surfaceMode automatically becomes live_core
    const pJarvis = await fetch(`${baseUrl}/api/persona/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "jarvis" }),
    }).then((r) => r.json() as any);
    if (pJarvis.surfaceMode !== "live_core" || pJarvis.personas?.jarvisActive !== true) {
      throw new Error(`J.A.R.V.I.S. switch failed: ${JSON.stringify(pJarvis)}`);
    }

    // 3. Natural command in J.A.R.V.I.S. ("Log ₹1,200 for server hosting" + "activate ultron")
    const expCmd = await fetch(`${baseUrl}/api/jarvis/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "Log ₹1,200 for server hosting" }),
    }).then((r) => r.json() as any);
    if (expCmd.intent !== "ledger" || expCmd.data?.entry?.amount !== 1200) {
      throw new Error(`Voice ledger failed: ${JSON.stringify(expCmd)}`);
    }

    const switchToUltron = await fetch(`${baseUrl}/api/jarvis/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "activate ultron" }),
    }).then((r) => r.json() as any);
    if (switchToUltron.surfaceMode !== "ultron" || switchToUltron.personas?.ultronActive !== true) {
      throw new Error(`Voice switch to Ultron failed: ${JSON.stringify(switchToUltron)}`);
    }

    // 4. Ultron Command Stream (/api/ultron/command) + return to SARA
    const uShell = await fetch(`${baseUrl}/api/ultron/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "cmd: echo ULTRON_READY" }),
    }).then((r) => r.json() as any);
    if (uShell.intent !== "os_exec" || !String(uShell.reply).includes("ULTRON_READY")) {
      throw new Error(`Ultron shell failed: ${JSON.stringify(uShell)}`);
    }

    const backSara = await fetch(`${baseUrl}/api/ultron/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "stand down" }),
    }).then((r) => r.json() as any);
    if (backSara.surfaceMode !== "companion" || backSara.personas?.activeMode !== "sara") {
      throw new Error(`Return to SARA failed: ${JSON.stringify(backSara)}`);
    }

    // 5. Executive Boardroom & Smart Room IoT
    const boardRes = await fetch(`${baseUrl}/api/executive/boardroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "Evaluate AttendEasy campus rollout" }),
    }).then((r) => r.json() as any);
    if (!Array.isArray(boardRes.debate?.opinions) || boardRes.debate.opinions.length !== 4) {
      throw new Error(`Boardroom failed: ${JSON.stringify(boardRes)}`);
    }

    const iotRes = await fetch(`${baseUrl}/api/executive/iot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "lock down workspace" }),
    }).then((r) => r.json() as any);
    if (!iotRes.ok || !Array.isArray(iotRes.devices)) throw new Error(`Smart Room lockdown failed: ${JSON.stringify(iotRes)}`);

    // 6. Real Working Local Integrations CRUD + Test + Invoke + Delete
    const intCreate = await fetch(`${baseUrl}/api/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Repo Docs", category: "documents", endpointOrPath: process.cwd() }),
    }).then((r) => r.json() as any);
    const connId = intCreate.connector?.id;
    if (!connId) throw new Error(`Integration create failed: ${JSON.stringify(intCreate)}`);

    const intTest = await fetch(`${baseUrl}/api/integrations/${connId}/test`, { method: "POST" }).then((r) => r.json() as any);
    if (intTest.ok !== true) throw new Error(`Integration test failed: ${JSON.stringify(intTest)}`);

    const intInvoke = await fetch(`${baseUrl}/api/integrations/${connId}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.json() as any);
    if (intInvoke.ok !== true) throw new Error(`Integration invoke failed: ${JSON.stringify(intInvoke)}`);

    await fetch(`${baseUrl}/api/integrations/${connId}`, { method: "DELETE" });

    return `Modes(sara->jarvis->ultron->sara)=4/4, Ledger=₹1200, Boardroom=4agents, SmartRoom=Lockdown, Integrations=CRUD+Test+Invoke`;
  });

  await assertCheck("19. Windows 10 Pro Central Operating Layer (/api/col/*, /ws/col/*) & 3-Factor Boot Security Gate (/api/boot-gate/*)", async () => {
    // 1. Engage Windows Pre-Desktop Security Gate
    const lockRes = await fetch(`${baseUrl}/api/boot-gate/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Windows 10 Pro Boot Sequence E2E" }),
    }).then((r) => r.json() as any);
    if (lockRes.gateLocked !== true || lockRes.zeroCapabilityLock !== true) {
      throw new Error(`Boot gate lock failed: ${JSON.stringify(lockRes)}`);
    }

    // 2. Wrong password -> HTTP 401 ACCESS DENIED
    const denyRes = await fetch(`${baseUrl}/api/boot-gate/verify-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    if (denyRes.status !== 401) throw new Error(`Expected 401 on wrong boot password, got ${denyRes.status}`);

    // 3. Verify Face ID + Voice Code -> ACCESS GRANTED + Welcome Greeting
    const faceVec = Array.from({ length: 32 }, (_, i) => Number((0.5 + 0.2 * Math.cos(i * 0.3)).toFixed(4)));
    const faceOk = await fetch(`${baseUrl}/api/boot-gate/verify-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor: faceVec }),
    }).then((r) => r.json() as any);
    if (faceOk.matched !== true) throw new Error(`Face verification failed: ${JSON.stringify(faceOk)}`);

    const voiceOk = await fetch(`${baseUrl}/api/boot-gate/verify-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "SARA authorize access" }),
    }).then((r) => r.json() as any);
    if (voiceOk.granted !== true || voiceOk.status?.gateLocked !== false) {
      throw new Error(`Voice unlock failed: ${JSON.stringify(voiceOk)}`);
    }

    // 4. Mount Windows 10 WorkerW Live Wallpaper + Execute Host Command (Zero Capability Auth Lock)
    const wpRes = await fetch(`${baseUrl}/api/col/wallpaper`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }).then((r) => r.json() as any);
    if (wpRes.enabled !== true) throw new Error(`Wallpaper toggle failed: ${JSON.stringify(wpRes)}`);

    const cmdRes = await fetch(`${baseUrl}/api/col/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "cmd: echo CENTRAL_OS_WIN10_READY" }),
    }).then((r) => r.json() as any);
    if (!String(cmdRes.reply).includes("CENTRAL_OS_WIN10_READY")) {
      throw new Error(`Central OS command failed: ${JSON.stringify(cmdRes)}`);
    }

    // 5. Connect Live WebSocket Hardware Spoke Node (`/ws/col/esp32_lab/iot`) & Dispatch Action
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/col/esp32_lab/iot";
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Timed out connecting spoke WebSocket"));
      }, 6000);

      ws.on("open", async () => {
        ws.send(JSON.stringify({ type: "REGISTER", capabilities: ["power_workbench"] }));
        ws.on("message", (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === "EXECUTE") {
            ws.send(
              JSON.stringify({
                type: "RESULT",
                req_id: msg.req_id,
                data: { status: "ESP32_RELAY_ACTIVE" },
              }),
            );
          }
        });

        try {
          const execSpoke = await fetch(`${baseUrl}/api/col/node/esp32_lab/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "power_workbench", params: { gpio: 4 } }),
          }).then((r) => r.json() as any);
          clearTimeout(timer);
          ws.close();
          if (execSpoke.result?.status !== "ESP32_RELAY_ACTIVE") {
            reject(new Error(`Spoke dispatch mismatch: ${JSON.stringify(execSpoke)}`));
            return;
          }
          resolve();
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err as Error);
        }
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // 6. Verify `central_os` surface mode persistence & restore `companion`
    const surfRes = await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvis: { surfaceMode: "central_os" } }),
    }).then((r) => r.json() as any);
    if (surfRes.jarvis?.surfaceMode !== "central_os") {
      throw new Error(`central_os surface persistence failed`);
    }
    await fetch(`${baseUrl}/api/app-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvis: { surfaceMode: "companion" } }),
    });

    return `BootGate(Deny401->Face+VoiceGrant)=OK, Wallpaper=WorkerW, Win10Cmd=OK, SpokeWS(esp32_lab)=ESP32_RELAY_ACTIVE, Surface=central_os`;
  });

  await assertCheck("20. Wave 4 — 3-Layer Control, Smart Half-Task ('play arjit song'), Sandbox Skill Trainer, Frontier Suite & /ws/holo", async () => {
    // 1. 3-Layer Control Router (Layer 1 Shell)
    const l1Res = await fetch(`${baseUrl}/api/col/layers/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "Verify Layer 1 Shell",
        preferredLayer: "layer1_shell",
        shellCommand: "echo WAVE4_3LAYER_OK",
      }),
    }).then((r) => r.json() as any);
    if (!l1Res.ok || l1Res.result?.layerUsed !== "layer1_shell" || !String(l1Res.result?.output).includes("WAVE4_3LAYER_OK")) {
      throw new Error(`3-Layer execution failed: ${JSON.stringify(l1Res)}`);
    }

    // 2. Smart Half-Task Completer ("play arjit song" — Zero clarifying questions!)
    const halfRes = await fetch(`${baseUrl}/api/col/smart-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "play arjit song", autoOpenBrowser: false }),
    }).then((r) => r.json() as any);
    if (!halfRes.ok || halfRes.completion?.askedClarifyingQuestion !== false) {
      throw new Error(`Smart Half-Task failed: ${JSON.stringify(halfRes)}`);
    }

    // 3. Autonomous Internet Skill Trainer + Isolated Sandbox Practice + Dynamic Execution
    const trainRes = await fetch(`${baseUrl}/api/col/skills/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "sandbox_log_line_counter" }),
    }).then((r) => r.json() as any);
    if (!trainRes.ok || !trainRes.mastered) {
      throw new Error(`Sandbox Skill Trainer failed: ${JSON.stringify(trainRes)}`);
    }
    const runRes = await fetch(`${baseUrl}/api/col/skills/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: trainRes.skill.skillName, kwargs: { text: "one two three four" } }),
    }).then((r) => r.json() as any);
    if (!runRes.ok || runRes.output?.word_count !== 4) {
      throw new Error(`Dynamic Skill Execution failed: ${JSON.stringify(runRes)}`);
    }

    // 4. Frontier Suite (Ghost Worker + Synthetic Boardroom + .sara Soul Capsule)
    await fetch(`${baseUrl}/api/col/frontier/ghost-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Sandbox Nightly Backup", kind: "config_backup" }),
    });
    const ghostRun = await fetch(`${baseUrl}/api/col/frontier/ghost-worker/run`, { method: "POST" }).then((r) => r.json() as any);
    if (!ghostRun.ok || ghostRun.completedCount < 1) {
      throw new Error(`Ghost Worker failed: ${JSON.stringify(ghostRun)}`);
    }
    const capsule = await fetch(`${baseUrl}/api/col/frontier/soul-capsule/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "sandbox-capsule-secret" }),
    }).then((r) => r.json() as any);
    if (!capsule.ok || !(capsule.bytes > 30)) {
      throw new Error(`Soul Capsule export failed: ${JSON.stringify(capsule)}`);
    }

    // 5. Holographic Spatial Projection WebSocket Bridge (`/ws/holo`)
    const { WebSocket } = await import("ws");
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/holo";
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Timed out waiting for /ws/holo HOLO_FRAME"));
      }, 6000);
      ws.on("message", (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === "HOLO_FRAME" && frame.mirrorReady === true) {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    return `3Layer=ShellOK, HalfTask("play arjit song")=ZeroQuestions, SandboxTrainer=${trainRes.skill.skillName}(PRACTICE_PASSED), GhostWorker=OK, SoulCapsule=${capsule.bytes}B, HoloWS=OK`;
  });

  await assertCheck("21. Wave 5 — Complete Avengers AI Pantheon: V.I.S.I.O.N., Phasing, 3D Blueprint, E.D.I.T.H. Abort Rollback, F.R.I.D.A.Y., G.R.I.O.T., VERONICA & K.A.R.E.N.", async () => {
    // 1. Persona switching to V.I.S.I.O.N. & F.R.I.D.A.Y. and back to SARA
    const visMode = await fetch(`${baseUrl}/api/persona/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "vision" }),
    }).then((r) => r.json() as any);
    if (!visMode.ok || visMode.personas?.activeMode !== "vision" || visMode.surfaceMode !== "vision") {
      throw new Error(`V.I.S.I.O.N. persona switch failed: ${JSON.stringify(visMode)}`);
    }
    const friMode = await fetch(`${baseUrl}/api/persona/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "friday" }),
    }).then((r) => r.json() as any);
    if (!friMode.ok || friMode.personas?.activeMode !== "friday") {
      throw new Error(`F.R.I.D.A.Y. persona switch failed: ${JSON.stringify(friMode)}`);
    }
    await fetch(`${baseUrl}/api/persona/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "sara" }),
    });

    // 2. V.I.S.I.O.N. Triad + Phasing Zero-Trace + Mind-Stone Nexus
    const triad = await fetch(`${baseUrl}/api/avengers/vision/triad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "Resilient local-first Stark architecture" }),
    }).then((r) => r.json() as any);
    if (!triad.ok || !triad.synthesis?.visionSynthesis?.mindStoneVerdict) {
      throw new Error(`Vision Triad failed: ${JSON.stringify(triad)}`);
    }

    const zt = await fetch(`${baseUrl}/api/avengers/vision/zero-trace`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "phase-test.txt", content: "ghost" }),
    }).then((r) => r.json() as any);
    if (!zt.ok || !fs.existsSync(zt.ephemeralPath)) {
      throw new Error(`Zero-Trace write failed: ${JSON.stringify(zt)}`);
    }
    await fetch(`${baseUrl}/api/avengers/vision/phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    if (fs.existsSync(zt.ephemeralPath)) {
      throw new Error("Zero-Trace file was not shredded upon unphasing!");
    }

    const nexus = await fetch(`${baseUrl}/api/avengers/vision/nexus`, { method: "POST" }).then((r) => r.json() as any);
    if (!nexus.ok || !(nexus.correlations?.length >= 1)) {
      throw new Error(`Mind-Stone Nexus failed: ${JSON.stringify(nexus)}`);
    }

    // 3. Stark 3D Blueprint + E.D.I.T.H. Transactional Batch & Instant "Abort! Abort!" Rollback
    const bp = await fetch(`${baseUrl}/api/avengers/jarvis/blueprint-3d`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "ESP32 smart door lock with relay" }),
    }).then((r) => r.json() as any);
    if (!bp.ok || !(bp.blueprint?.totalEstimatedBomInr > 500)) {
      throw new Error(`3D Blueprint failed: ${JSON.stringify(bp)}`);
    }

    const tmpRollFile = path.join(os.tmpdir(), `edith-rollback-${Date.now()}.txt`);
    fs.writeFileSync(tmpRollFile, "BEFORE_EDITH_BATCH", "utf8");
    const staged = await fetch(`${baseUrl}/api/avengers/edith/batch/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sandbox Rollback Drill",
        operations: [{ kind: "write_file", targetPath: tmpRollFile, content: "AFTER_EDITH_BATCH" }],
      }),
    }).then((r) => r.json() as any);
    await fetch(`${baseUrl}/api/avengers/edith/batch/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: staged.batch.batchId }),
    });
    const abortRes = await fetch(`${baseUrl}/api/avengers/edith/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: staged.batch.batchId }),
    }).then((r) => r.json() as any);
    const restoredContent = fs.readFileSync(tmpRollFile, "utf8");
    fs.rmSync(tmpRollFile, { force: true });
    if (!abortRes.ok || restoredContent !== "BEFORE_EDITH_BATCH") {
      throw new Error(`E.D.I.T.H. Abort Rollback failed: content=${restoredContent}`);
    }

    // 4. F.R.I.D.A.Y. Suit Reroute + G.R.I.O.T. Cockpit + VERONICA Drop-Pod
    const suit = await fetch(`${baseUrl}/api/avengers/friday/suit-reroute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulateFaultIn: "gemini_cloud_brain" }),
    }).then((r) => r.json() as any);
    await fetch(`${baseUrl}/api/avengers/friday/suit-reroute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulateFaultIn: "clear" }),
    });
    const cockpit = await fetch(`${baseUrl}/api/avengers/griot/cockpit`).then((r) => r.json() as any);
    const pod = await fetch(`${baseUrl}/api/avengers/veronica/drop-pod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "sandbox-veronica-key" }),
    }).then((r) => r.json() as any);

    if (!suit.ok || !cockpit.ok || !pod.ok) {
      throw new Error("F.R.I.D.A.Y. / G.R.I.O.T. / VERONICA check failed");
    }

    return `Vision+Friday=OK, ZeroTracePhasing=Shredded, 3DBlueprint=₹${bp.blueprint.totalEstimatedBomInr}, EdithAbortRollback=Verified, SuitReroute=${suit.overallIntegrityPct}%, GriotCockpit=OK, VeronicaPod=${pod.bytes}B`;
  });

  console.log("\n================================================================================");
  console.log("  SARA / J.A.R.V.I.S. + ULTRON ISOLATED SANDBOX E2E VERIFICATION REPORT");
  console.log("================================================================================");
  for (const r of results) {
    console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.check}`);
    console.log(`         ${r.detail}`);
  }
  console.log("================================================================================\n");

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    throw new Error(`${failed.length} sandbox verification check(s) failed.`);
  }
}

async function main() {
  const sandboxRoot = verifyMode
    ? fs.mkdtempSync(path.join(os.tmpdir(), "sara-jarvis-sandbox-"))
    : path.resolve(process.cwd(), ".sara-sandbox");

  const dataDir = path.join(sandboxRoot, "data");
  const virtualFs = path.join(sandboxRoot, "virtual-fs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(virtualFs, { recursive: true });

  const agentPort = verifyMode ? await getFreePort() : Number(process.env.SARA_SANDBOX_AGENT_PORT || 18765);
  const serverPort = verifyMode ? await getFreePort() : Number(process.env.SARA_SANDBOX_PORT || 4310);

  const mockAgent = await startSandboxDesktopAgent(agentPort, virtualFs);
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  console.log(`[Sandbox] Isolated root : ${sandboxRoot}`);
  console.log(`[Sandbox] Mock PC Agent : ${mockAgent.url}`);
  console.log(`[Sandbox] SARA Server   : ${baseUrl}`);

  const tsxBin = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  const serverChild = spawn(tsxBin, ["server.ts"], {
    cwd: process.cwd(),
    stdio: verifyMode ? "pipe" : "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      SARA_ENV: "sandbox",
      SARA_DATA_DIR: dataDir,
      SARA_PORT: String(serverPort),
      MYRAA_PORT: String(serverPort),
      DESKTOP_AGENT_URL: mockAgent.url,
      MYRAA_AGENT_PORT: String(agentPort),
      MYRAA_AGENT_TOKEN: mockAgent.token,
      SARA_MOCK_DESKTOP_AGENT: "1",
      SARA_DISABLE_AUTOSTART: "1",
    },
  });

  let serverLogs = "";
  if (verifyMode) {
    serverChild.stdout?.on("data", (d) => { serverLogs += String(d); });
    serverChild.stderr?.on("data", (d) => { serverLogs += String(d); });
  }

  const cleanup = async () => {
    if (!serverChild.killed) {
      serverChild.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 400));
      if (serverChild.exitCode === null) serverChild.kill("SIGKILL");
    }
    await mockAgent.close();
    if (verifyMode) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  };

  if (verifyMode) {
    try {
      await waitForHealth(baseUrl, 30_000);
      await runVerification(baseUrl);
      await cleanup();
      process.exit(0);
    } catch (err) {
      console.error("\n[Sandbox Verification Failed]", err);
      if (serverLogs) {
        console.error("\n--- Recent Sandbox Server Logs ---\n" + serverLogs.slice(-3_000));
      }
      await cleanup();
      process.exit(1);
    }
  } else {
    await waitForHealth(baseUrl, 30_000);
    console.log(`\n[Sandbox] J.A.R.V.I.S. Sandbox ready at ${baseUrl} (Ctrl+C to stop)`);
    process.on("SIGINT", () => void cleanup().then(() => process.exit(0)));
    process.on("SIGTERM", () => void cleanup().then(() => process.exit(0)));
  }
}

void main();
