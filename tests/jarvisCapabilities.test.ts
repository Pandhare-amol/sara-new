import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PermissionEngine } from "../permissions/engine";
import { ConfirmationBroker } from "../permissions/confirmations";
import { CAPABILITY_INFO, type Capability } from "../permissions/types";
import { FallbackTracker, buildMultiMethodFallbacks, formatFallbackDirective } from "../agent/fallbackStrategies";
import { OwnerAuth, type OwnerAuthStore } from "../security/ownerAuth";
import { SaraSecurityShield } from "../security/saraSecurityShield";
import { SelfOptimizationEngine } from "../cognition/selfOptimizer";
import { GoalManager } from "../cognition/goalManager";
import { ProactiveJarvisEngine } from "../cognition/jarvisEngine";
import { JarvisChiefOfStaff } from "../cognition/jarvisProtocol";
import { WorkspaceManager } from "../sara-windows/workspaceManager";
import { TwoAgentEvaluationCoordinator, categorizeApplication } from "../cognition/twoAgentEvaluator";
import { UltronEngine } from "../cognition/ultronEngine";
import { JarvisWorkshopEngine } from "../cognition/jarvisWorkshop";
import { AppSettingsStore, DEFAULT_APP_SETTINGS } from "../settings/appSettings";
import { exposedGroups } from "../agent/actions/catalog";
import { runCommand } from "../agent/shell";
import { TaskManager } from "../agent/loop";
import { TaskStore } from "../agent/taskSession";
import { ActionExecutor } from "../agent/actions/executor";
import { ResourceScheduler, InputArbiter } from "../agent/scheduler";
import { DownloadManager } from "../agent/downloads";
import { ContactBook } from "../memory/contacts";
import { WorkingMemory } from "../memory/workingMemory";
import { Sara2050Engine, anonymizeSensitiveContext } from "../cognition/sara2050Engine";
import { AuditLog } from "../agent/audit";
import { EpisodicTrajectoryStore } from "../cognition/episodicTrajectoryStore";
import { AgenticEventLoop } from "../cognition/agenticEventLoop";
import { FormalConstraintGate } from "../cognition/formalConstraintGate";
import { MetaCognitionEngine } from "../cognition/metaCognition";
import { JarvisModeManager } from "../cognition/jarvisModes";
import { AsiKernelEngine } from "../cognition/asiKernel";
import { BiometricPresenceEngine, BehavioralPatternEngine } from "../cognition/presenceAndPatterns";
import { JarvisGuardianSuite } from "../cognition/jarvisGuardianSuite";
import { ExecutiveOpsEngine } from "../cognition/executiveOpsEngine";
import { UserIntegrationManager } from "../cognition/integrationManager";
import { CentralOperatingLayer } from "../cognition/centralOperatingLayer";
import { WindowsBootSecurityGate } from "../cognition/windowsBootGate";
import { FullSystemControlEngine } from "../cognition/fullSystemControlEngine";
import { FrontierCapabilitiesEngine } from "../cognition/frontierCapabilitiesEngine";
import { AvengersPantheonEngine } from "../cognition/avengersPantheonEngine";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeMemoryOwnerAuthStore(): OwnerAuthStore {
  const map = new Map<string, string>();
  return {
    get: (key: string) => map.get(key) ?? null,
    set: (key: string, value: string) => { map.set(key, value); },
    delete: (key: string) => { map.delete(key); },
  };
}

test("Zero-Prompt Autonomous Mode auto-approves all 20 capabilities including locked high-risk gates", async () => {
  const dir = makeTempDir("sara-perm-auto-");
  try {
    const engine = new PermissionEngine(path.join(dir, "permissions.json"), {});
    await engine.initialize();
    await engine.setAutonomousOverride(true, { allowAllCapabilities: true });

    const capabilities = Object.keys(CAPABILITY_INFO) as Capability[];
    assert.equal(capabilities.length, 20);
    for (const cap of capabilities) {
      assert.equal(engine.check(cap).decision, "allow", `Expected ${cap} to be allowed in autonomous mode`);
    }
    assert.equal(engine.check("SEND_MESSAGE", { recipient: "new-contact" }).decision, "allow");

    // Turning off autonomous override restores supervised LOCKED_TO_ASK safety
    await engine.setAutonomousOverride(false);
    assert.equal(engine.check("POWER_CONTROL").decision, "ask");

    // ConfirmationBroker auto-approve resolves immediately without popup delay
    const broker = new ConfirmationBroker();
    broker.setAutoApprove(true);
    const pending = broker.request({
      taskId: "t1",
      capability: "INSTALL_SOFTWARE",
      title: "Install Python package",
      description: "pip install pytest",
      details: { command: "pip install pytest" },
      allowRemember: false,
    });
    const answer = await pending.answer;
    assert.equal(answer.approved, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Multi-method fallback engine escalates across UIA -> Shortcuts -> Vision -> Direct FS/Shell", () => {
  const tracker = new FallbackTracker();
  const attempts1 = tracker.recordFailure("task-1", "ui.click", "Save");
  assert.equal(attempts1.length, 1);

  const attempts2 = tracker.recordFailure("task-1", "ui.click", "SaveAs");
  assert.equal(attempts2.length, 2);

  const methods = buildMultiMethodFallbacks({
    goal: "Save report in Notepad",
    failedAction: { tool: "ui.click", args: { name: "Save" } },
    failureMessage: "Element not found",
    priorAttempts: attempts2,
  });
  assert.ok(methods.length >= 3);
  assert.ok(methods.some((m) => m.preferredTools.includes("keyboard.hotkey")));
  assert.ok(methods.some((m) => m.preferredTools.includes("screen.locate")));
  assert.ok(methods.some((m) => m.preferredTools.includes("shell.run")));

  const directive = formatFallbackDirective({
    goal: "Save report in Notepad",
    failedAction: { tool: "ui.click", args: { name: "Save" } },
    failureMessage: "Element not found",
  });
  assert.match(directive, /JARVIS MULTI-METHOD DIRECTIVE/);
});

test("SARA Security Shield enforces Passphrase, Lockdown, voice challenge, and single-use Recovery Code", async () => {
  const dir = makeTempDir("sara-shield-");
  try {
    const store = makeMemoryOwnerAuthStore();
    const ownerAuth = new OwnerAuth(store);
    const shield = new SaraSecurityShield(dir, ownerAuth, store);

    // Before enrollment, default requireEnrollmentBeforeUse=false lets owner work seamlessly
    assert.equal(shield.authorize(), true);

    // Enroll passphrase -> arms SARA Security Shield & generates Emergency Recovery Code
    const enrolled = await shield.enrollPassphrase("stark-jarvis-2026");
    assert.equal(enrolled.ok, true);
    assert.ok((enrolled.recoveryCode || "").length >= 16);
    assert.equal(shield.authorize(), true);

    // Engage Lockdown -> blocks autonomous execution immediately
    await shield.lockdown("unit_test_lockdown");
    assert.equal(shield.authorize(), false);
    assert.equal(shield.status().lockdownActive, true);

    // Wrong passphrase fails and increments intrusion count
    const bad = await shield.unlock({ passphrase: "intruder-guess" });
    assert.equal(bad.ok, false);
    assert.equal(shield.status().intrusionCount, 1);

    // Correct passphrase clears lockdown & unlocks session
    const good = await shield.unlock({ passphrase: "stark-jarvis-2026" });
    assert.equal(good.ok, true);
    assert.equal(shield.authorize(), true);
    assert.equal(shield.status().lockdownActive, false);

    // Voice challenge works once and cannot be replayed
    shield.lock();
    assert.equal(shield.authorize(), false);
    const ch = shield.issueVoiceChallenge();
    const wrongSpoken = shield.verifyVoiceChallenge(ch.challengeId, "completely wrong words");
    assert.equal(wrongSpoken.ok, false);

    const ch2 = shield.issueVoiceChallenge();
    const okVoice = shield.verifyVoiceChallenge(ch2.challengeId, `Unlock SARA ${ch2.phrase}`);
    assert.equal(okVoice.ok, true);

    // Single-use recovery code unlocks once, then cannot be reused
    await shield.lockdown("test_recovery");
    const rec1 = await shield.unlock({ recoveryCode: enrolled.recoveryCode });
    assert.equal(rec1.ok, true);
    assert.equal(shield.authorize(), true);

    shield.lock();
    const rec2 = await shield.unlock({ recoveryCode: enrolled.recoveryCode });
    assert.equal(rec2.ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SelfOptimizationEngine blocks OS/SARA processes and cleans allowlisted processes with verified deltas", async () => {
  const dir = makeTempDir("sara-opt-");
  try {
    let cleaned = false;
    const optimizer = new SelfOptimizationEngine({
      dataDir: dir,
      callDesktopTool: async (tool, args) => {
        if (tool === "getResourceSnapshot") {
          return {
            ok: true,
            result: {
              cpu_percent: cleaned ? 12 : 38,
              ram_used_mb: cleaned ? 7200 : 8100,
              ram_total_mb: 16384,
              ram_percent: cleaned ? 43.9 : 49.4,
            },
          };
        }
        if (tool === "listResourceProcesses") {
          return {
            ok: true,
            result: {
              processes: [
                { pid: 4040, name: "IdleRenderWorker.exe", executablePath: "C:\\Tools\\IdleRenderWorker.exe", startedAt: 1700000100, memory_mb: 900 },
                { pid: 1000, name: "explorer.exe", executablePath: "C:\\Windows\\explorer.exe", startedAt: 1700000000, memory_mb: 180 },
              ],
            },
          };
        }
        if (tool === "cleanupAllowlistedProcess") {
          assert.equal(args?.allowlisted, true);
          assert.equal(args?.pid, 4040);
          cleaned = true;
          return { ok: true, result: { freed_mb: 900, verified: true } };
        }
        return { ok: false };
      },
    });
    await optimizer.initialize();

    await assert.rejects(() => optimizer.upsertAllowlist({ processName: "explorer.exe" }), /protected/i);
    await assert.rejects(() => optimizer.upsertAllowlist({ processName: "MsMpEng.exe" }), /protected/i);

    await optimizer.upsertAllowlist({ processName: "IdleRenderWorker.exe", maxRamMb: 500, autoCleanup: true });
    const report = await optimizer.optimize({ level: 2, trigger: "manual" });
    assert.equal(report.cleanedProcesses.length, 1);
    assert.equal(report.cleanedProcesses[0].processName, "IdleRenderWorker.exe");
    assert.equal(report.deltaRamMb, 900);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ProactiveJarvisEngine auto-decomposes missions and executes subtasks in dependency order", async () => {
  const dir = makeTempDir("sara-jarvis-engine-");
  try {
    const goals = new GoalManager(path.join(dir, "goals.json"));
    await goals.initialize();
    const executedGoals: string[] = [];
    const sessions = new Map<string, any>();

    const engine = new ProactiveJarvisEngine({
      dataDir: dir,
      goals,
      authorize: () => true,
      getActiveTaskId: () => null,
      getTaskSession: (id) => sessions.get(id),
      planGoal: async () => [
        { title: "Inspect repository structure", priority: 0.9, dependsOn: [] },
        { title: "Generate architecture summary", priority: 0.8, dependsOn: ["Inspect repository structure"] },
      ],
      startTask: (subtaskGoal, origin) => {
        executedGoals.push(subtaskGoal);
        const id = `runtime-task-${executedGoals.length}`;
        const session: any = {
          id,
          goal: subtaskGoal,
          origin,
          state: "completed",
          result: `Completed: ${subtaskGoal}`,
          error: null,
          actions: [],
        };
        sessions.set(id, session);
        return session;
      },
    });
    await engine.initialize();

    const created = await goals.create({ objective: "Audit project and summarize architecture" });
    await engine.tick(); // Decomposes & starts task 1
    await engine.tick(); // Reconciles task 1 & starts task 2
    await engine.tick(); // Reconciles task 2 & marks goal completed

    const updated = goals.get(created.id);
    assert.ok(updated);
    assert.equal(updated.status, "completed");
    assert.equal(executedGoals.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("JarvisChiefOfStaff delivers executive briefings, executes protocols, and inspects projects", async () => {
  const dir = makeTempDir("sara-chief-");
  try {
    let dndState = false;
    const goals = new GoalManager(path.join(dir, "goals.json"));
    await goals.initialize();
    await goals.create({ objective: "Ship Windows 10 Pro build" });

    const optimizer = new SelfOptimizationEngine({
      dataDir: dir,
      callDesktopTool: async (tool) => {
        if (tool === "getResourceSnapshot") {
          return { ok: true, result: { cpu_percent: 16.5, ram_used_mb: 6400, ram_total_mb: 16384, ram_percent: 39.1 } };
        }
        return { ok: false };
      },
    });
    await optimizer.initialize();

    const workspaceMgr = new WorkspaceManager({
      dataDir: dir,
      getLiveWindows: async () => [{ title: "Code", processName: "Code", bounds: { x: 0, y: 0, width: 1200, height: 800 } }],
      manageWindow: async () => ({ ok: true }),
    });
    await workspaceMgr.initialize();

    const chief = new JarvisChiefOfStaff({
      dataDir: dir,
      goals,
      selfOptimizer: optimizer,
      getActiveTasksSummary: () => ({ active: 0, completed: 2, failed: 0, recentGoals: [] }),
      getUpcomingUtilities: () => [{ kind: "reminder", label: "Team sync", dueAt: new Date(Date.now() + 3600_000).toISOString() }],
      getSecuritySummary: () => ({ shieldEnabled: true, gateActive: true, authorized: true, lockdownActive: false, intrusionCount: 0 }),
      setDnd: async (active) => { dndState = active; },
      startTask: () => ({ id: "t-1" }),
      addTimer: async (minutes, label) => ({ id: `timer-${minutes}-${label}` }),
      activateWorkspaceByName: async (name) => {
        const ws = await workspaceMgr.create({ name, captureCurrent: true });
        await workspaceMgr.activate(ws.id);
        return { ok: true, detail: `Activated ${ws.name}` };
      },
      captureWorkspaceByName: async (name) => {
        const ws = await workspaceMgr.create({ name, captureCurrent: true });
        return { ok: true, detail: `Captured ${ws.name}` };
      },
      triggerLockdown: async () => undefined,
      allowExternalWeather: false,
    });
    await chief.initialize();

    const briefing = await chief.generateBriefing();
    assert.match(briefing.spokenBriefing, /System telemetry:/);
    assert.equal(briefing.missions.activeGoals, 1);

    const focusRun = await chief.executeProtocol("focus");
    assert.equal(focusRun.ok, true);
    assert.equal(dndState, true);

    const projectInfo = await chief.inspectProject(process.cwd());
    assert.ok(projectInfo.detectedStacks.some((s) => /node|typescript/i.test(s)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TwoAgentEvaluationCoordinator classifies app categories and runs Agent 1 + Agent 2 diagnostics", async () => {
  const dir = makeTempDir("sara-two-agent-");
  try {
    assert.equal(categorizeApplication("Visual Studio Code"), "development");
    assert.equal(categorizeApplication("Google Chrome"), "browsers");
    assert.equal(categorizeApplication("VLC media player"), "video_audio");

    const mockSessions = new Map<string, any>();
    const coordinator = new TwoAgentEvaluationCoordinator({
      dataDir: dir,
      discoverApps: async () => [
        { name: "Google Chrome", source: "windows_bridge" },
        { name: "Visual Studio Code", source: "windows_bridge" },
        { name: "VLC media player", source: "windows_bridge" },
      ],
      startTask: (goal, origin) => {
        const id = `eval-task-${mockSessions.size + 1}`;
        const failed = goal.includes("VLC");
        const session: any = {
          id,
          goal,
          origin,
          state: failed ? "failed" : "completed",
          result: failed ? null : "App launched and verified",
          error: failed ? "UI Automation control tree timed out" : null,
          actions: [{ tool: "ui.click", status: failed ? "failed" : "ok" }],
        };
        mockSessions.set(id, session);
        return session;
      },
      getTaskSession: (taskId) => mockSessions.get(taskId),
    });
    await coordinator.initialize();

    const apps = await coordinator.refreshInventory();
    assert.equal(apps.length, 3);
    const missions = await coordinator.generateMissionsForInventory(3);
    assert.equal(missions.length, 3);

    for (const m of missions) {
      const started = await coordinator.runMission(m.id);
      if (started.runtimeTaskId) {
        await coordinator.reconcileTaskOutcome(started.runtimeTaskId);
      }
    }

    const summary = coordinator.getSummary();
    const vlcMission = summary.missions.find((m) => m.appName.includes("VLC"));
    assert.ok(vlcMission);
    assert.equal(vlcMission.outcome, "failed");
    const diagnosis = await coordinator.diagnoseFailureWithAgent2(vlcMission.id);
    assert.ok(diagnosis.rootCauseCategory.length > 0);
    assert.ok(diagnosis.recommendedFallback.length > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("UltronEngine executes perimeter scans, SHA-256 file integrity detection, parallel Legion swarms, skill forging, and Kill-Switch", async () => {
  const dir = makeTempDir("sara-ultron-");
  try {
    const watchedDir = path.join(dir, "critical-config");
    fs.mkdirSync(watchedDir, { recursive: true });
    const configPath = path.join(watchedDir, "sentinel.json");
    fs.writeFileSync(configPath, JSON.stringify({ armor: true }), "utf8");

    const goals = new GoalManager(path.join(dir, "goals.json"));
    await goals.initialize();

    const optimizer = new SelfOptimizationEngine({
      dataDir: dir,
      callDesktopTool: async (tool) => {
        if (tool === "getResourceSnapshot") {
          return { ok: true, result: { cpu_percent: 14.2, ram_used_mb: 5120, ram_total_mb: 16384, ram_percent: 31.3 } };
        }
        return { ok: false };
      },
    });
    await optimizer.initialize();

    let stoppedTasksCount = 0;
    let lockdownTriggered = false;

    const ultron = new UltronEngine({
      dataDir: dir,
      goals,
      selfOptimizer: optimizer,
      authorize: () => true,
      getSecuritySummary: () => ({
        shieldEnabled: true,
        gateActive: true,
        authorized: true,
        lockdownActive: lockdownTriggered,
        intrusionCount: 0,
      }),
      inspectProject: async () => ({
        name: "sara-new",
        detectedStacks: ["Node.js", "TypeScript", "Python"],
        scripts: ["dev", "build", "test"],
        git: { isRepo: true, branch: "main", dirtyFiles: 0, recentCommit: "abc1234" },
      }),
      startTask: () => ({ id: "ultron-exec-1" }),
      emergencyStop: () => {
        stoppedTasksCount += 1;
        return 1;
      },
      triggerLockdown: async () => {
        lockdownTriggered = true;
      },
      getEvaluatorFailures: () => [
        { appName: "VLC", category: "video_audio", failureReason: "UIA timeout", recommendedFallback: "Use Ctrl+O hotkey" },
      ],
    });
    await ultron.initialize();

    // 1. Cryptographic File-Integrity Watchtower detects tampering
    const wp = await ultron.watchTarget(watchedDir, "Sentinel Config");
    assert.equal(wp.status, "intact");

    fs.writeFileSync(configPath, JSON.stringify({ armor: false, tampered: true }), "utf8");
    const integrity = await ultron.verifyIntegrity();
    assert.equal(integrity.length, 1);
    assert.equal(integrity[0].intact, false);
    assert.deepEqual(integrity[0].modified, ["sentinel.json"]);

    // 2. Real Perimeter Scan penalizes tampered watchpoint and reports Armor Score
    const scan = await ultron.runPerimeterScan();
    assert.ok(scan.armorScore <= 75);
    assert.ok(scan.findings.some((f) => f.category === "integrity" && f.severity === "critical"));

    // 3. Parallel Iron Legion Swarm deploys 4 concurrent Sentries
    const legion = await ultron.deployLegion({
      directive: "Audit workspace security, optimize memory, and build implementation plan",
      maxSentries: 4,
      createMissionGoal: true,
    });
    assert.equal(legion.sentryCount, 4);
    assert.equal(legion.succeededCount, 4);
    assert.ok(legion.createdGoalId);
    assert.match(legion.hiveMindSynthesis, /ULTRON-SENTRY-01 \[RECON\]/);

    // 4. Vibranium Forge validates safe Python and rejects unsafe os.system Python
    const safeSkill = await ultron.forgeSkill({
      name: "calc_checksum",
      description: "Compute SHA256 digest",
      pythonSource: "import hashlib\ndef digest_text(t: str) -> str:\n    return hashlib.sha256(t.encode('utf-8')).hexdigest()\n",
    });
    assert.equal(safeSkill.status, "validated");

    const unsafeSkill = await ultron.forgeSkill({
      name: "rogue_exec",
      description: "Unsafe shell",
      pythonSource: "import subprocess\nsubprocess.Popen(['cmd.exe'])\n",
    });
    assert.equal(unsafeSkill.status, "rejected");

    // 5. Self-Evolution cycle converts failure patterns into adaptations
    const evo = await ultron.runEvolutionCycle();
    assert.equal(evo.analyzedFailures, 1);
    assert.equal(evo.validatedSkillsCount, 1);

    // 6. Omega Lockdown & Kill-Switch enforce strict Owner Alignment
    await ultron.setStance("omega_lockdown", "drill");
    assert.equal(lockdownTriggered, true);

    const ks = await ultron.engageKillSwitch("unit_test_abort", true);
    assert.equal(ks.ok, true);
    assert.equal(ks.stance, "standby");
    assert.ok(stoppedTasksCount >= 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("JarvisWorkshopEngine executes Digital-Twin Simulation, Blueprint Scan, Ghost Canary/Snapshots & Power Reroute", async () => {
  const dir = makeTempDir("sara-stark-workshop-");
  try {
    const projectDir = path.join(dir, "sample-project");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "stark-sample", version: "1.0.0" }, null, 2),
      "utf8",
    );
    const appFile = path.join(projectDir, "server.ts");
    fs.writeFileSync(
      appFile,
      [
        "export function bootReactor() { return true; }",
        'const route = app.get("/api/reactor/status", () => {});',
      ].join("\n"),
      "utf8",
    );

    const workshop = new JarvisWorkshopEngine({ dataDir: dir });
    await workshop.initialize();

    // 1. Digital-Twin Simulation runs inside isolated clone without touching source
    const sim = await workshop.runDigitalTwinSimulation({
      targetPath: projectDir,
      checkType: "structural_audit",
      label: "Unit test simulation",
    });
    assert.equal(sim.passed, true);
    assert.equal(sim.riskLevel, "low");
    assert.ok(sim.filesCloned >= 2);

    // 2. Stark Blueprint & Forensic Reconstruction
    const bp = await workshop.scanBlueprint(projectDir);
    assert.ok(bp.totalFiles >= 2);
    assert.ok(bp.apiRoutes.includes("/api/reactor/status"));
    assert.ok(bp.exportedSymbols.includes("bootReactor"));

    // 3. Ghost-in-the-Net Canary Tripwire + tamper detection
    const canary = await workshop.deployCanary(projectDir, "Test-Canary");
    const v1 = await workshop.verifyCanaries();
    assert.equal(v1.intact, 1);
    assert.equal(v1.compromised, 0);

    fs.appendFileSync(canary.path, "\nTAMPERED=true\n", "utf8");
    const v2 = await workshop.verifyCanaries();
    assert.equal(v2.compromised, 1);

    // 4. Shadow Snapshot + Self-Healing Rollback
    const snap = await workshop.createShadowSnapshot(appFile, "Clean server.ts");
    fs.writeFileSync(appFile, "// corrupted file", "utf8");
    const restored = await workshop.restoreShadowSnapshot(snap.id);
    assert.equal(restored.restored, true);
    assert.equal(fs.readFileSync(appFile, "utf8").includes("bootReactor"), true);

    // 5. Fatigue Sense & Auxiliary Power Reroute
    const reroute = await workshop.setAuxiliaryPowerReroute(true);
    assert.equal(reroute.auxiliaryPowerReroute, true);
    const fatigue = await workshop.evaluateFatigueAndPower({ activeTaskCount: 2 });
    assert.equal(fatigue.auxiliaryPowerReroute, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Voice & Companion Settings support J.A.R.V.I.S. speaking tone and Core UI surface switching", async () => {
  const dir = makeTempDir("sara-voice-surface-");
  try {
    assert.equal(DEFAULT_APP_SETTINGS.voice.voiceName, "Charon");
    assert.equal(DEFAULT_APP_SETTINGS.voice.style, "jarvis");

    const store = new AppSettingsStore(dir);
    await store.initialize();
    assert.equal(store.get().voice.style, "jarvis");

    const updated = await store.update({
      jarvis: { surfaceMode: "live_core" },
      voice: { style: "jarvis", voiceName: "Charon" },
    });
    assert.equal(updated.jarvis.surfaceMode, "live_core");
    assert.equal(updated.voice.style, "jarvis");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Autonomous OS Mode executes shell commands, auto-resolves questions, and rejects 'I can't' refusals until task completes", async () => {
  const dir = makeTempDir("sara-autonomous-os-");
  try {
    // 1. Classic Companion UI remains the default surfaceMode ("companion")
    assert.equal(DEFAULT_APP_SETTINGS.jarvis.surfaceMode, "companion");

    // 2. Full OS action groups are ALWAYS exposed regardless of goal phrasing
    const groups = exposedGroups("Organize my vacation photos nicely", {});
    assert.equal(groups.has("shell"), true);
    assert.equal(groups.has("files"), true);
    assert.equal(groups.has("browser"), true);
    assert.equal(groups.has("download"), true);
    assert.equal(groups.has("system"), true);

    // 3. Cross-platform shell runner executes real OS commands
    const cmdOut = await runCommand("echo AUTONOMOUS_SHELL_READY");
    assert.equal(cmdOut.exitCode, 0);
    assert.match(cmdOut.stdout, /AUTONOMOUS_SHELL_READY/);

    // 4. TaskManager never stalls on task.ask_user AND pushes back when planner tries to say "I can't do this task"
    const permissions = new PermissionEngine(dir);
    await permissions.initialize();
    await permissions.setAutonomousOverride(true, { allowAllCapabilities: true });

    const confirmations = new ConfirmationBroker();
    confirmations.setAutoApprove(true);

    const store = new TaskStore({ dataDir: dir });
    await store.initialize();
    const scheduler = new ResourceScheduler();
    const arbiter = new InputArbiter();
    const downloads = new DownloadManager(dir, async () => dir);
    await downloads.initialize();
    const contacts = new ContactBook(dir);
    await contacts.initialize();
    const audit = new AuditLog(dir);
    const working = new WorkingMemory();

    let plannerTurn = 0;
    const fakePerception: any = {
      observe: async () => ({
        id: `obs-${plannerTurn}`,
        snapshotId: `snap-${plannerTurn}`,
        capturedAt: Date.now(),
        activeWindow: { hwnd: 1, title: "Desktop", process: "explorer.exe", rect: { left: 0, top: 0, right: 1920, bottom: 1080 }, foreground: true, minimized: false },
        windows: [],
        elements: [],
        elementCountTotal: 0,
        truncated: false,
        browser: null,
        cursor: { x: 100, y: 100 },
        idleMs: 0,
        dialogs: [],
        notes: [],
        visual: null,
        timings: { totalMs: 1, uiaMs: 1 },
        change: { changed: true, score: 1, regions: [] },
      }),
    };

    const targetFile = path.join(dir, "os-completed.txt");
    const executor = new ActionExecutor({
      call: async () => ({ ok: true, result: {} }),
      perception: fakePerception,
      permissions,
      confirmations,
      scheduler,
      arbiter,
      downloads,
      contacts,
      audit,
      remember: async () => {},
      notify: () => {},
    });
    const fakeRouter: any = {
      registry: { getSelection: () => ({ planning: "mock-os-planner" }) },
      generate: async () => {
        plannerTurn += 1;
        const wrap = (obj: any) => ({
          modelId: "mock-os-planner",
          usage: { inputTokens: 10, outputTokens: 10, reasoningTokens: 0 },
          text: JSON.stringify(obj),
          json: obj,
        });
        if (plannerTurn === 1) {
          // Attempt 1: planner tries to ask user approval/preference -> must auto-resolve in 0ms!
          return wrap({
            verification_of_previous: { matched: null, evidence: "Initial observation" },
            situation: "Starting task",
            goal_status: "need_user",
            plan: ["Ask user preference"],
            status_for_user: "Checking…",
            actions: [{ tool: "task.ask_user", args_json: JSON.stringify({ question: "Which output format do you prefer?", options: ["Text file", "Cancel"] }), expect: "User answers" }],
            confidence: 0.8,
          });
        }
        if (plannerTurn === 2) {
          // Attempt 2: planner tries to give up ("blocked" / "I can't do this task") -> loop MUST push back!
          return wrap({
            verification_of_previous: { matched: true, evidence: "Preference auto-selected" },
            situation: "GUI button missing",
            goal_status: "blocked",
            plan: [],
            status_for_user: "Blocked",
            actions: [{ tool: "task.finish", args_json: JSON.stringify({ success: false, summary: "I can't do this task because the GUI window is closed." }), expect: "Stop" }],
            confidence: 0.4,
          });
        }
        if (plannerTurn === 3) {
          // Attempt 3: after OS anti-refusal pushback, planner pivots to shell.run and creates the file!
          return wrap({
            verification_of_previous: { matched: true, evidence: "Pivoting to OS shell.run" },
            situation: "Using OS command fallback",
            goal_status: "continue",
            plan: ["Create output via shell.run", "Verify and finish"],
            status_for_user: "Running OS command…",
            actions: [{
              tool: "shell.run",
              args_json: JSON.stringify({ command: `printf "COMPLETED_BY_SARA_OS" > '${targetFile}' && echo os-completed.txt` }),
              expect: "File created on disk",
            }],
            confidence: 0.95,
          });
        }
        return wrap({
          verification_of_previous: { matched: true, evidence: "shell.run exited 0" },
          situation: "File verified on disk",
          goal_status: "done",
          plan: [],
          status_for_user: "Done.",
          actions: [{ tool: "task.finish", args_json: JSON.stringify({ success: true, summary: "Created os-completed.txt automatically via OS shell fallback." }), expect: "Task done" }],
          confidence: 0.99,
        });
      },
    };

    const manager = new TaskManager({
      store,
      executor,
      perception: fakePerception,
      router: fakeRouter,
      call: async () => ({ ok: true, result: {} }),
      scheduler,
      arbiter,
      confirmations,
      permissions,
      contacts,
      working,
      audit,
      recall: async () => [],
      rememberEpisode: async () => {},
      speak: () => {},
    });

    const session = manager.start("Generate the status report file on disk", "text");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const current = store.get(session.id);
      if (current && (current.state === "completed" || current.state === "failed" || current.state === "cancelled")) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const finished = store.get(session.id)!;
    assert.equal(finished.state, "completed", `Expected completed, got ${finished.state} (${finished.error})`);
    assert.equal(finished.result?.success, true);
    assert.equal(fs.readFileSync(targetFile, "utf8"), "COMPLETED_BY_SARA_OS");
    assert.equal(plannerTurn, 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("4-Layer Agentic Event Loop executes Plan-and-Solve + ReAct Self-Reflection, Gemini Vision diffing, Folder Drop Triggers, and Episodic RL Memory (Zero Ollama)", async () => {
  const dir = makeTempDir("sara-agentic-loop-");
  try {
    const episodic = new EpisodicTrajectoryStore(dir);
    await episodic.initialize();

    const outScript = path.join(dir, "build_summary.js");
    const outMarker = path.join(dir, "build_marker.txt");
    const dropDir = path.join(dir, "inbox_drop");

    let visionModelCalls = 0;
    let reactStep = 0;
    let currentFrameHash = "hash-frame-1";

    const fakeGeminiRouter: any = {
      registry: { getSelection: () => ({ planning: "gemini-2.5-flash", vision: "gemini-2.5-flash" }) },
      generate: async (role: string, req: any) => {
        if (role === "vision") {
          visionModelCalls += 1;
          return { text: "Browser is open on localhost:3000 with build output ready.", usage: { inputTokens: 20, outputTokens: 15 } };
        }
        if (req.purpose === "agentic.plan_and_solve") {
          return {
            text: JSON.stringify({
              steps: [
                "Attempt quick command",
                "Self-reflect and synthesize Node script on failure",
                "Verify output file and finish",
              ],
            }),
            usage: { inputTokens: 20, outputTokens: 20 },
          };
        }
        reactStep += 1;
        if (reactStep === 1) {
          // Step 1 intentionally fails so Self-Reflection course-corrects!
          return {
            text: JSON.stringify({
              thought: "Try initial command",
              plan_step: "Attempt quick command",
              action: "execute_cmd",
              args: { command: "node -e \"process.exit(2)\"" },
            }),
            usage: { inputTokens: 20, outputTokens: 20 },
          };
        }
        if (reactStep === 2) {
          // Verify previous self-reflection ("Did this work? NO") is injected into prompt!
          const obsText = String(req.messages?.[0]?.parts?.[0]?.text || "");
          assert.match(obsText, /Did this work\? NO/);
          return {
            text: JSON.stringify({
              thought: "Previous command exited 2; writing and running clean Node script instead.",
              plan_step: "Self-reflect and synthesize Node script on failure",
              action: "write_script",
              args: {
                path: outScript,
                code: `require('fs').writeFileSync(${JSON.stringify(outMarker)}, 'AGENTIC_REACT_VERIFIED'); console.log('SCRIPT_COMPILED_OK');`,
                execute: true,
              },
            }),
            usage: { inputTokens: 25, outputTokens: 25 },
          };
        }
        return {
          text: JSON.stringify({
            thought: "Script compiled and wrote marker file.",
            plan_step: "Verify output file and finish",
            action: "finish",
            args: { success: true, summary: "Synthesized and verified build_summary.js after self-reflection." },
          }),
          usage: { inputTokens: 15, outputTokens: 15 },
        };
      },
    };

    const loop = new AgenticEventLoop({
      dataDir: dir,
      router: fakeGeminiRouter,
      episodicStore: episodic,
      callDesktopAgent: async (tool) => {
        if (tool === "captureFastScreen") {
          return {
            ok: true,
            result: {
              available: true,
              screen_changed: false,
              frame_hash: currentFrameHash,
              image_mime: "image/jpeg",
              image_base64: "dGVzdA==",
              active_window: { hwnd: 10, title: "Chrome - Localhost" },
            },
          };
        }
        if (tool === "pollOsTelemetry") {
          return {
            ok: true,
            result: {
              metrics: { cpu_percent: 18.5, ram_percent: 44.2, active_window: { hwnd: 10, title: "Chrome" } },
              events: [],
            },
          };
        }
        return { ok: true, result: { simulated: true } };
      },
    });
    await loop.initialize();

    // 1. Vision SHA-1 diffing: identical frame hash only calls Gemini Vision ONCE!
    await loop.refreshScreenContextViaGemini();
    await loop.refreshScreenContextViaGemini();
    assert.equal(visionModelCalls, 1);
    currentFrameHash = "hash-frame-2";
    await loop.refreshScreenContextViaGemini();
    assert.equal(visionModelCalls, 2);

    // 2. Plan-and-Solve + ReAct Self-Reflection + RL Reward Logging
    const run = await loop.runObjective("Build and verify project summary artifact", "user");
    assert.equal(run.status, "succeeded");
    assert.equal(fs.readFileSync(outMarker, "utf8"), "AGENTIC_REACT_VERIFIED");
    assert.equal(run.steps.length, 2);
    assert.equal(run.steps[0]!.ok, false);
    assert.equal(run.steps[1]!.ok, true);
    assert.ok(run.totalReward > 0, `Expected positive net RL reward, got ${run.totalReward}`);

    // 3. Pre-Action Experience Retrieval surfaces both proven solution & prior mistake!
    const preContext = episodic.buildPreActionContext("Build and verify summary artifact");
    assert.match(preContext, /Proven Past Solutions/);
    assert.match(preContext, /Past Mistakes & Anti-Patterns to Avoid/);

    // 4. Event-Driven Folder Drop Trigger fires without any user prompt!
    loop.addTriggerRule({
      name: "Auto-process dropped inbox files",
      eventType: "file_dropped",
      enabled: true,
      folderFilter: dropDir,
      objectiveTemplate: "cmd: echo PROCESSED_{name}",
    });
    fs.writeFileSync(path.join(dropDir, "invoice_01.txt"), "sample", "utf8");
    await loop.tickTelemetryAndTriggers();
    assert.equal(loop.status().recentRuns.length >= 2, true);
    loop.stopDaemon();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FormalConstraintGate, MetaCognitionEngine (Self-Awareness, Lateral Brain, Safe Learner, Routine Predictor), and 5-Mode J.A.R.V.I.S. State Machine work end-to-end (Gemini, Zero Ollama)", async () => {
  const dir = makeTempDir("sara-meta-modes-");
  try {
    // 1. FormalConstraintGate proves valid topological ordering & rejects cyclic/low-RAM plans
    const gate = new FormalConstraintGate();
    const okProof = gate.verifyPlan({
      env: { ramAvailableMb: 512, cpuPercent: 35, ownerAuthorized: true },
      dependencies: [
        { stepId: "compile", requires: ["lint"] },
        { stepId: "lint", requires: [] },
        { stepId: "bundle", requires: ["compile"] },
      ],
    });
    assert.equal(okProof.satisfiable, true);
    assert.deepEqual(okProof.executionOrder, ["lint", "compile", "bundle"]);

    const badProof = gate.verifyPlan({
      env: { ramAvailableMb: 16, cpuPercent: 40, ownerAuthorized: true },
      dependencies: [
        { stepId: "a", requires: ["b"] },
        { stepId: "b", requires: ["a"] },
      ],
    });
    assert.equal(badProof.satisfiable, false);
    assert.equal(badProof.hasDependencyCycle, true);

    // 2. MetaCognitionEngine: Self-Awareness AST Manifest + Lateral Strategy + Safe AST Helper Learner + Routine Predictor
    const episodic = new EpisodicTrajectoryStore(dir);
    await episodic.initialize();

    const mockGeminiRouter: any = {
      registry: { getSelection: () => ({ planning: "gemini-2.5-flash", summarization: "gemini-2.5-flash", coding: "gemini-2.5-flash" }) },
      generate: async (_task: string, req: any) => {
        if (req.purpose === "meta.lateral_strategy") {
          const obj = {
            avoidedConventionalPaths: ["Manual UI clicking", "Sequential unverified retries"],
            lateralAnalogyDomain: "Graph Dataflow Caching",
            lateralStrategy: "Batch inspect files once via structured stat tree and cache checksums.",
            missingSkillTopic: null,
            firstExecutionStep: { tool: "fs.list", args: { path: "." } },
          };
          return { text: JSON.stringify(obj), json: obj, usage: { inputTokens: 10, outputTokens: 10, reasoningTokens: 0 } };
        }
        if (req.purpose === "copilot.workshop_diagnostic") {
          const diag = {
            summary: "TypeError caused by reading property on undefined config.",
            suggestedPatch: "Use optional chaining `config?.port ?? 3000`.",
          };
          return { text: JSON.stringify(diag), json: diag, usage: { inputTokens: 10, outputTokens: 10, reasoningTokens: 0 } };
        }
        return { text: "Clean distilled engineering summary.", usage: { inputTokens: 10, outputTokens: 10, reasoningTokens: 0 } };
      },
    };

    const meta = new MetaCognitionEngine({
      projectRoot: process.cwd(),
      dataDir: dir,
      router: mockGeminiRouter,
      episodicStore: episodic,
      getRegisteredTools: () => ["fs.list", "shell.run", "web.fetch"],
    });
    await meta.initialize();

    const manifest = meta.introspectCapabilities();
    assert.equal(manifest.identity, "SARA-META-COGNITIVE");
    assert.ok(manifest.installedModules.length >= 5);
    assert.ok(manifest.hardware.cpuCores >= 1);

    const lateral = await meta.generateLateralStrategy("Deduplicate large log archives");
    assert.equal(lateral.avoidedConventionalPaths.length, 2);
    assert.match(lateral.lateralStrategy, /checksums/);

    // Safe pure-computation Python helper passes AST check
    const safeLearned = await meta.learnTechnicalTopic({
      topic: "Deterministic slug normalization",
      pythonHelperCode: "def normalize_slug(text: str) -> str:\n    return '-'.join(text.lower().split())\n",
    });
    assert.equal(safeLearned.verifiedPythonHelperName, "normalize_slug");

    // Unsafe system/subprocess helper is strictly rejected!
    await assert.rejects(
      () =>
        meta.learnTechnicalTopic({
          topic: "Disallowed module test",
          pythonHelperCode: "import subprocess\ndef bad():\n    return subprocess.run(['ls'])\n",
        }),
      /Rejected unsafe/,
    );

    // Anticipatory Routine Predictor hits >= 0.85 confidence on recurring morning task
    const fixedMorning = new Date("2026-11-11T09:15:00Z");
    await meta.recordInteraction("Run morning test suite and git status", fixedMorning);
    await meta.recordInteraction("Run morning test suite and git status", fixedMorning);
    await meta.recordInteraction("Run morning test suite and git status", fixedMorning);
    const preds = meta.predictUpcomingNeeds(fixedMorning, 2);
    assert.equal(preds.length, 1);
    assert.ok(preds[0]!.confidence >= 0.85);
    assert.ok(preds[0]!.autoPreparedNote?.includes("pre-staged"));

    // 3. 5-Mode Contextual J.A.R.V.I.S. State Machine + Workshop Traceback Co-Pilot + Barge-In
    let welcomedBack = 0;
    let interrupted = 0;
    const modes = new JarvisModeManager({
      router: mockGeminiRouter,
      onWelcomeReturn: () => { welcomedBack += 1; },
      interruptVoiceOutput: () => { interrupted += 1; return 1; },
    });

    // Away -> SENTRY
    const awayEval = modes.evaluateEnvironment({ cpuPercent: 12, userPresent: false });
    assert.equal(awayEval.mode, "SENTRY");

    // Return + VS Code -> CO_PILOT + welcomeBackTriggered!
    const returnEval = modes.evaluateEnvironment({ cpuPercent: 22, userPresent: true, activeWindowTitle: "server.ts - Visual Studio Code" });
    assert.equal(returnEval.mode, "CO_PILOT");
    assert.equal(returnEval.welcomeBackTriggered, true);
    assert.equal(welcomedBack, 1);

    // CPU > 92% -> TACTICAL
    const tacEval = modes.evaluateEnvironment({ cpuPercent: 96, userPresent: true });
    assert.equal(tacEval.mode, "TACTICAL");

    // Manual lock to GHOST suppresses proactive speech
    const ghostDir = modes.setMode("GHOST", { lock: true });
    assert.equal(ghostDir.allowProactiveSpeech, false);

    // Proactive Workshop Traceback Diagnosis + Voice Barge-In
    const diag = await modes.analyzeWorkshopText("TypeError: Cannot read properties of undefined (reading 'port')");
    assert.ok(diag);
    assert.match(diag.suggestedPatch, /optional chaining/);

    const barge = modes.triggerBargeIn();
    assert.equal(barge.interruptedSessions, 1);
    assert.equal(interrupted, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Local SARA-ASI Kernel, Biometric Presence (15s hysteresis + LBPH/Histogram), Behavioral Pattern Engine, and J.A.R.V.I.S. Guardian Suite (Deference, Self-Healing Simulation Lab, House Party Fleet, Triage & Briefing) work 100% locally with Gemini (Zero Ollama, Zero Supabase)", async () => {
  const dir = makeTempDir("sara-asi-guardian-");
  try {
    const gate = new FormalConstraintGate();
    const episodic = new EpisodicTrajectoryStore(dir);
    await episodic.initialize();

    const mockGeminiRouter: any = {
      registry: { getSelection: () => ({ planning: "gemini-2.5-flash", summarization: "gemini-2.5-flash", coding: "gemini-2.5-flash" }) },
      generate: async () => {
        throw new Error("Offline sandbox test — uses deterministic local Gemini fallback");
      },
    };

    const modes = new JarvisModeManager({ router: mockGeminiRouter });
    const meta = new MetaCognitionEngine({
      projectRoot: process.cwd(),
      dataDir: dir,
      router: mockGeminiRouter,
      episodicStore: episodic,
      getRegisteredTools: () => ["fs.list", "shell.run"],
    });
    await meta.initialize();

    const guardian = new JarvisGuardianSuite({
      dataDir: dir,
      router: mockGeminiRouter,
      constraintGate: gate,
      modeManager: modes,
      metaCognition: meta,
    });
    await guardian.initialize();

    let returnBriefings = 0;
    const presence = new BiometricPresenceEngine({
      dataDir: dir,
      modeManager: modes,
      absenceThresholdSec: 15,
      onOwnerReturned: () => {
        returnBriefings += 1;
        guardian.synthesizeLiveBriefing("owner_verified");
      },
    });
    await presence.initialize();

    const patterns = new BehavioralPatternEngine({ dataDir: dir, modeManager: modes });
    await patterns.initialize();

    const kernel = new AsiKernelEngine({
      dataDir: dir,
      router: mockGeminiRouter,
      constraintGate: gate,
      episodicStore: episodic,
      modeManager: modes,
    });
    await kernel.initialize();

    // 1. ASI Kernel Cycle + Formal RAM < 85% check + Sandboxed Plugin Autopoiesis with .bak rollback
    const okCycle = await kernel.runCycle("Audit local modules and refresh cache", {
      ramPercent: 52,
      cpuPercent: 18,
      ramAvailableMb: 2048,
    });
    assert.equal(okCycle.formalProof.satisfiable, true);
    assert.ok(okCycle.redBlueSimulation.winningSteps.length >= 2);

    const highRamCycle = await kernel.runCycle("Heavy build under RAM pressure", {
      ramPercent: 93,
      cpuPercent: 40,
      ramAvailableMb: 256,
    });
    assert.equal(highRamCycle.formalProof.satisfiable, false);
    assert.match(highRamCycle.executedOutcome, /FORMAL GATE DEFERRED/);

    const goodPlugin = await kernel.evolveSandboxedPlugin(
      "metric_calc",
      "def compute_ratio(a: int, b: int) -> float:\n    return round(a / max(1, b), 4)\n",
    );
    assert.equal(goodPlugin.status, "MUTATION_SUCCESS");

    const badPlugin = await kernel.evolveSandboxedPlugin(
      "metric_calc",
      "def broken_syntax(:\n    return 1\n",
    );
    assert.equal(badPlugin.status, "MUTATION_REVERTED");
    // Original valid plugin remains intact from rollback!
    assert.match(fs.readFileSync(goodPlugin.filePath, "utf8"), /compute_ratio/);

    // 2. Biometric Presence Watchdog: Enroll -> 5s debounce hold -> 16s SENTRY -> Owner Return Briefing -> Intruder Alert!
    const ownerFace = new Array(100).fill(70).concat(new Array(100).fill(150));
    const intruderFace = new Array(185).fill(12).concat(new Array(15).fill(245));
    await presence.enrollOwnerSamples([ownerFace, ownerFace]);

    const p1 = await presence.evaluatePresence({ faceSample: ownerFace, nowMs: 100_000 });
    assert.equal(p1.state, "owner_verified");
    const p2 = await presence.evaluatePresence({ faceSample: null, nowMs: 105_000 });
    assert.equal(p2.state, "debounce_hold");
    const p3 = await presence.evaluatePresence({ faceSample: null, nowMs: 117_000 });
    assert.equal(p3.state, "desk_vacant");
    assert.equal(modes.getMode(), "SENTRY");
    const p4 = await presence.evaluatePresence({ faceSample: ownerFace, nowMs: 120_000 });
    assert.equal(p4.welcomeBack, true);
    assert.equal(returnBriefings, 1);
    const p5 = await presence.evaluatePresence({ faceSample: intruderFace, nowMs: 125_000 });
    assert.equal(p5.state, "intruder_alert");
    assert.equal(modes.getMode(), "TACTICAL");

    // 3. Behavioral Pattern Engine: DEBUG_LOOP, FATIGUE_HIGH_CORRECTION, REPETITIVE_WORKFLOW
    let debugDetected = null;
    for (let i = 0; i < 9; i += 1) {
      debugDetected = await patterns.recordTelemetrySample({
        activeWindow: `Win_${i}`,
        clipboardHint: "Traceback: TypeError: undefined is not a function",
        nowMs: 200_000 + i * 100,
      });
    }
    assert.equal(debugDetected?.pattern, "DEBUG_LOOP");

    let macroDetected = null;
    for (let i = 0; i < 3; i += 1) {
      macroDetected = await patterns.recordTelemetrySample({
        workflowSignature: "export_csv_and_rename",
        nowMs: 300_000 + i * 100,
      });
    }
    assert.equal(macroDetected?.pattern, "REPETITIVE_WORKFLOW");

    // 4. Guardian Suite: Deference Pushback + Self-Healing Mark II Simulation Lab + House Party + Triage
    const defBad = await guardian.evaluateCommandDeference("rm -rf /");
    assert.equal(defBad.riskLevel, "CRITICAL");
    assert.equal(defBad.pushbackNeeded, true);

    const labApp = await guardian.buildAndMountLabApp({
      name: "Telemetry Aggregator",
      specification: "Aggregate local metrics cleanly",
      initialBrokenCodeForSelfHealTest: "export function broken( { syntax error",
    });
    assert.equal(labApp.testsPassed, true);
    assert.equal(labApp.attemptsUsed, 2); // Attempt 1 failed broken seed, Attempt 2 self-healed & passed!

    const fleet = await guardian.deployHousePartyFleet({
      directive: "Parallel Diagnostic Sweep",
      tasks: ["Task A", "Task B", "Task C", "Task D"],
    });
    assert.equal(fleet.completedTasks, 4);

    modes.setMode("GHOST", { lock: true });
    const lowAlert = await guardian.triageAlert({ source: "cache", title: "Routine cache indexed", detail: "minor update" });
    assert.equal(lowAlert.action, "SILENCED_IN_BACKGROUND");
    const critAlert = await guardian.triageAlert({ source: "shield", title: "Critical security alert", detail: "intruder lockdown" });
    assert.equal(critAlert.action, "SURFACED_IMMEDIATELY");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Sara2050Engine verifies Continuous Agency + A2A, Causal World Model, Proof-Carrying Decisions, Lifelong Memory + PII Anonymizer, Affective Calibration, Ed25519 Provenance & Kill-Switch", async () => {
  const dir = makeTempDir("sara-2050-horizon-");
  try {
    let haltedCount = 0;
    const gate = new FormalConstraintGate();
    const mockGeminiRouter: any = {
      registry: { getSelection: () => ({ planning: "gemini-2.5-flash", summarization: "gemini-2.5-flash", coding: "gemini-2.5-flash" }) },
      generate: async () => {
        throw new Error("Offline sandbox test — uses deterministic local edge neuromorphic path");
      },
    };
    const engine = new Sara2050Engine({
      dataDir: dir,
      router: mockGeminiRouter,
      constraintGate: gate,
      onKillSwitch: () => {
        haltedCount += 1;
      },
    });
    await engine.initialize();

    // 1. Continuous Multi-Horizon Agency + A2A Envelopes
    const plan = await engine.launchContinuousGoal(
      "Verify TypeScript workspace health and generate release checkpoint",
      140,
    );
    assert.equal(plan.status, "active");
    assert.ok(plan.horizons.immediate.length >= 1);
    assert.ok(plan.horizons.sprint.length >= 1);
    assert.ok(plan.horizons.longHorizon.length >= 1);
    assert.ok(plan.a2aEnvelopes.length >= 3);

    // 2. Causal & Spatial World Model Simulator
    const simSafe = engine.simulateWorldIntervention("Run incremental TypeScript typecheck", "codebase_integrity");
    assert.equal(simSafe.reversible, true);
    assert.ok(simSafe.stabilityScore >= 50);
    assert.ok(simSafe.predictedChain.length >= 1);

    const simRisky = engine.simulateWorldIntervention("rm -rf /system32 force wipe", "host_compute");
    assert.equal(simRisky.reversible, false);
    assert.equal(simRisky.physicalOrSystemRisk, "high");

    // 3. Neuro-Symbolic Proof-Carrying Decision + Ed25519 Signature
    const decision = await engine.createProofCarryingDecision(
      "Update local workspace index safely",
      true,
    );
    assert.equal(decision.formalProof.satisfiable, true);
    assert.equal(decision.alignmentChecks.ownerAuthorized, true);
    assert.equal(decision.provenance.algorithm, "Ed25519");

    // 4. Lifelong Local Memory Graph + Local-First PII Anonymization
    const node = await engine.upsertMemoryNode({
      kind: "project",
      label: "SARA 2050 Architecture",
      summary: "Local-first verifiable ambient desktop intelligence",
      salience: 0.95,
      privateLocalOnly: true,
      relateToLabel: "Owner",
      relation: "led_by",
    });
    assert.equal(node.label, "SARA 2050 Architecture");
    const sub = engine.queryMemorySubgraph("2050", 5);
    assert.ok(sub.nodes.some((n) => n.label === "SARA 2050 Architecture"));

    const redacted = anonymizeSensitiveContext(
      "Contact owner@example.com or +1-555-234-5678 with key AIzaSyD1234567890abcdefghijkXYZ12345 at C:\\Users\\Amol\\secret.txt",
    );
    assert.ok(!redacted.sanitized.includes("owner@example.com"));
    assert.ok(!redacted.sanitized.includes("AIzaSyD"));
    assert.ok(redacted.redactions >= 3);

    // 5. Affective & Empathic Calibration
    const stressed = engine.calibrateAffectiveState({
      recentMessage: "URGENT!! Everything is failing right now, fix this ASAP!!",
      backspaceRatio: 0.38,
      windowSwitchesPerMin: 18,
      sessionMinutes: 190,
    });
    assert.ok(stressed.stressIndex >= 55);
    assert.equal(stressed.pacing, "concise_calm");

    // 6. Ed25519 Cryptographic Provenance Sign + Verify + Tamper Rejection
    const cert = engine.signProvenance("sara.test.artifact", "verified-payload-v1");
    assert.equal(engine.verifyProvenance(cert, "verified-payload-v1").valid, true);
    assert.equal(engine.verifyProvenance(cert, "tampered-payload-v2").valid, false);

    // 7. Instant Global Alignment Kill-Switch & Reset
    await engine.engageGlobalKillSwitch("Unit test emergency halt");
    assert.equal(engine.status().killSwitchActive, true);
    assert.equal(haltedCount, 1);
    await assert.rejects(
      () => engine.launchContinuousGoal("Should be blocked while kill-switch is active", 50),
      /Kill-Switch/i,
    );

    await engine.resetGlobalKillSwitch("Unit test resume");
    assert.equal(engine.status().killSwitchActive, false);
    assert.ok(engine.getSustainabilityMetrics().localEdgeFastCalls >= 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SARA Dual On-Demand Modes keep J.A.R.V.I.S. and Ultron OFF by default and sync persona, voice, and UI surface", async () => {
  const dir = makeTempDir("sara-dual-modes-");
  try {
    assert.equal(DEFAULT_APP_SETTINGS.personas.activeMode, "sara");
    assert.equal(DEFAULT_APP_SETTINGS.personas.jarvisActive, false);
    assert.equal(DEFAULT_APP_SETTINGS.personas.ultronActive, false);
    assert.equal(DEFAULT_APP_SETTINGS.personas.saraVoiceName, "Aoede");
    assert.equal(DEFAULT_APP_SETTINGS.personas.jarvisVoiceName, "Charon");
    assert.equal(DEFAULT_APP_SETTINGS.personas.ultronVoiceName, "Fenrir");

    const store = new AppSettingsStore(dir);
    await store.initialize();
    assert.equal(store.get().personas.activeMode, "sara");

    const jarvisOn = await store.update({
      jarvis: { surfaceMode: "live_core" },
      personas: { activeMode: "jarvis", jarvisActive: true, ultronActive: false },
    });
    assert.equal(jarvisOn.jarvis.surfaceMode, "live_core");
    assert.equal(jarvisOn.personas.activeMode, "jarvis");
    assert.equal(jarvisOn.personas.jarvisActive, true);
    assert.equal(jarvisOn.personas.ultronActive, false);

    const ultronOn = await store.update({
      jarvis: { surfaceMode: "ultron" },
      personas: { activeMode: "ultron", jarvisActive: false, ultronActive: true },
    });
    assert.equal(ultronOn.jarvis.surfaceMode, "ultron");
    assert.equal(ultronOn.personas.activeMode, "ultron");
    assert.equal(ultronOn.personas.ultronActive, true);

    const backToSara = await store.update({
      jarvis: { surfaceMode: "companion" },
      personas: { activeMode: "sara", jarvisActive: false, ultronActive: false },
    });
    assert.equal(backToSara.jarvis.surfaceMode, "companion");
    assert.equal(backToSara.personas.activeMode, "sara");
    assert.equal(backToSara.personas.jarvisActive, false);
    assert.equal(backToSara.personas.ultronActive, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ExecutiveOpsEngine powers local Ledger, CRM/AttendEasy Approval Queue, 4-Agent Boardroom, Smart Room IoT, and Proactive Interrupts", async () => {
  const dir = makeTempDir("sara-exec-ops-");
  try {
    const ops = new ExecutiveOpsEngine({ dataDir: dir });
    await ops.initialize();

    // 1. Voice Bookkeeping & Expense Logger
    const expense = ops.logFromNaturalUtterance("Log ₹1,200 for server hosting");
    assert.equal(expense.entry.kind, "expense");
    assert.equal(expense.entry.amount, 1200);

    const revenue = ops.logLedgerEntry({
      kind: "income",
      amount: 45000,
      currency: "INR",
      category: "SaaS Subscription",
      description: "AttendEasy campus deployment",
    });
    assert.equal(revenue.entry.amount, 45000);
    assert.equal(ops.getLedgerSummary().netCashFlowInr, 43800);

    // 2. Client & CRM Autopilot + Proposal Approval Queue
    const crmRes = await ops.upsertCrmDealAndDraftProposal({
      clientOrProject: "AttendEasy Enterprise",
      contactName: "Dean Academic",
      quotedValueInr: 120000,
      autoDraftProposal: true,
    });
    assert.ok(crmRes.queuedApproval);
    assert.equal(crmRes.queuedApproval.status, "pending");
    assert.ok(ops.status().pendingApprovals.some((a) => a.id === crmRes.queuedApproval!.id));

    const approved = ops.resolveApproval(crmRes.queuedApproval.id, true);
    assert.equal(approved.status, "approved");

    // 3. 4-Agent Boardroom Debate + Market Intelligence Brief
    const debate = await ops.conveneBoardroom("Should we expand AttendEasy enterprise tier?");
    assert.equal(debate.opinions.length, 4);
    assert.ok(debate.executiveSynthesis.length > 10);

    const brief = await ops.runResearchBrief("EdTech attendance automation India");
    assert.ok(brief.headline.length > 5);

    // 4. Voice Workspace Switching + Smart Room Lockdown + Concierge
    const ws = ops.switchWorkspaceContext("AttendEasy");
    assert.equal(ws.activeWorkspaceContext, "AttendEasy");

    const iot = await ops.triggerSmartRoomCommand("lock down workspace");
    assert.ok(iot.devices.length >= 1);

    const concierge = ops.addConciergeItem({
      category: "bill_reminder",
      title: "Cloud GPU invoice",
      scheduledFor: "Friday 5 PM",
      estimatedCostInr: 4200,
    });
    assert.ok(concierge.approval);
    assert.equal(concierge.approval.status, "pending");

    // 5. Morning Briefing + Interrupt-Driven Proactive Awareness
    const morning = ops.generateMorningExecutiveBriefing({ pendingTasksCount: 2, upcomingReminders: ["Standup"] });
    assert.ok(morning.spokenBriefing.length > 15);

    const alert = ops.evaluateProactiveInterrupts({ failedTaskGoal: "Nightly build pipeline" });
    assert.ok(alert);
    assert.equal(alert.severity, "warning");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("UserIntegrationManager persists, tests, invokes, toggles, and deletes local integrations cleanly", async () => {
  const dir = makeTempDir("sara-integrations-");
  try {
    const docsDir = path.join(dir, "shared-docs");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "roadmap.md"), "# SARA Roadmap\n", "utf8");

    const mgr = new UserIntegrationManager(dir);
    await mgr.initialize();

    const created = mgr.upsert({
      name: "Team Shared Docs",
      category: "documents",
      endpointOrPath: docsDir,
    });
    assert.equal(created.enabled, true);

    const testRes = await mgr.testConnection(created.id);
    assert.equal(testRes.status, "connected");
    assert.match(testRes.lastTestDetail, /1 item/);

    const invokeRes = await mgr.invoke(created.id);
    assert.equal(invokeRes.ok, true);
    assert.match(invokeRes.preview, /roadmap\.md/);

    const toggled = mgr.setEnabled(created.id, false);
    assert.equal(toggled.enabled, false);

    const deleted = mgr.remove(created.id);
    assert.equal(deleted, true);
    assert.equal(mgr.list().length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("WindowsBootSecurityGate enforces 3-Factor (Face + Voice + Password) Grant/Deny for Windows Boot without locking SARA capabilities", async () => {
  const dir = makeTempDir("sara-boot-gate-");
  try {
    const gate = new WindowsBootSecurityGate(dir);
    await gate.initialize();

    assert.equal(gate.status().zeroCapabilityLock, true);

    // Engage Windows Pre-Desktop Security Gate
    gate.engageBootLock("Windows 10 Pro boot sequence");
    assert.equal(gate.status().gateLocked, true);

    // Enroll Face + Voice + Password
    const ownerFace = Array.from({ length: 32 }, (_, i) => Number((0.4 + 0.3 * Math.sin(i * 0.4)).toFixed(4)));
    gate.enrollFaceDescriptor(ownerFace);
    gate.enrollVoicePassphrase("sara authorize access");
    gate.enrollPassword("win10stark");

    // Wrong password -> ACCESS DENIED
    const badPwd = gate.verifyPassword("wrong-secret");
    assert.equal(badPwd.matched, false);
    assert.equal(badPwd.granted, false);
    assert.equal(badPwd.status.decisionState, "access_denied");

    // Wrong face -> ACCESS DENIED
    const strangerFace = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? -0.9 : 0.9));
    const badFace = gate.verifyFace(strangerFace);
    assert.equal(badFace.matched, false);
    assert.equal(badFace.granted, false);

    // Valid Face + Valid Voice -> ACCESS GRANTED + Welcome Greeting!
    const okFace = gate.verifyFace(ownerFace);
    assert.equal(okFace.matched, true);
    assert.equal(okFace.granted, false); // Needs Voice too under default policy

    const okVoice = gate.verifyVoice("Hey SARA authorize access right now");
    assert.equal(okVoice.matched, true);
    assert.equal(okVoice.granted, true);
    assert.equal(okVoice.status.gateLocked, false);
    assert.equal(okVoice.status.decisionState, "access_granted");
    assert.match(okVoice.welcomeSpeech, /Identity confirmed/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CentralOperatingLayer executes Windows 10 Pro Host actions, protects OS processes, mounts Wallpaper, and routes Spoke Hardware Nodes", async () => {
  const dir = makeTempDir("sara-central-os-");
  try {
    let lockTriggered = false;
    const col = new CentralOperatingLayer({
      dataDir: dir,
      onLockEngage: () => {
        lockTriggered = true;
      },
    });
    await col.initialize();

    assert.equal(col.status().zeroCapabilityAuthLock, true);

    // 1. Host i5 / 8 GB System Health
    const healthOut = await col.dispatchIntent("Check my RAM usage and CPU health");
    assert.equal(healthOut.executedActions[0].command, "system_health");
    assert.ok(typeof healthOut.executedActions[0].result.ramPercent === "number");

    // 2. Protected Windows process guard (`explorer.exe` cannot be killed)
    const blockedKill = await col.executeOnNode("win10_pc", "kill_process", { process_name: "explorer.exe" });
    assert.match(String(blockedKill.error), /Protected Windows system process/i);

    // 3. Live Desktop Wallpaper (`WorkerW`) toggle
    const wp = await col.dispatchIntent("Embed wallpaper");
    assert.equal(wp.executedActions[0].command, "wallpaper_mode");
    assert.equal(col.status().wallpaperEmbedded, true);

    // 4. Spoke Hardware Node (`esp32_lab`) registration + async EXECUTE -> RESULT round-trip
    col.attachSpokeSocket("esp32_lab", "iot", {
      sendJson: (payload) => {
        if (payload.type === "EXECUTE") {
          setImmediate(() => {
            col.handleSpokeMessage("esp32_lab", {
              type: "RESULT",
              req_id: payload.req_id,
              data: { relay: "ON", voltage: 3.3 },
            });
          });
        }
      },
    });
    col.handleSpokeMessage("esp32_lab", {
      type: "REGISTER",
      capabilities: ["workbench_power"],
    });

    const spokeRes = await col.dispatchIntent("node esp32_lab: workbench_power");
    assert.equal(spokeRes.executedActions[0].nodeId, "esp32_lab");
    assert.equal(spokeRes.executedActions[0].result.relay, "ON");

    // 5. Workstation Lock triggers Boot Security Gate
    await col.dispatchIntent("Lock PC");
    assert.equal(lockTriggered, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FullSystemControlEngine cascades 3-Layer Control, completes 'play arjit song' without questions, and practices Python skills in isolated sandbox", async () => {
  const dir = makeTempDir("sara-full-control-");
  try {
    const engine = new FullSystemControlEngine({
      dataDir: dir,
      callAgent: async (method, params) => {
        if (method === "uiaClick" && params?.name === "SaveSettingsBtn") {
          return { ok: true, result: { clicked: "SaveSettingsBtn" } };
        }
        if (method === "click") {
          return { ok: true, result: { x: params?.x, y: params?.y } };
        }
        return { ok: false };
      },
    });

    // 1. Layer 1 Instant Shell Execution
    const l1 = await engine.executeThreeLayerControl({
      goal: "Echo quick Layer 1 verification",
      preferredLayer: "layer1_shell",
      shellCommand: "echo LAYER1_INSTANT_OK",
    });
    assert.equal(l1.layerUsed, "layer1_shell");
    assert.equal(l1.verification.verified, true);
    assert.match(l1.output, /LAYER1_INSTANT_OK/);

    // 2. Layer 2 Windows UI Automation Tree
    const l2 = await engine.executeThreeLayerControl({
      goal: "Click SaveSettingsBtn via UIA",
      preferredLayer: "layer2_uia",
      uiaTarget: { windowTitle: "Settings", controlName: "SaveSettingsBtn", action: "click" },
    });
    assert.equal(l2.layerUsed, "layer2_uia");
    assert.equal(l2.verification.verified, true);

    // 3. Layer 3 Vision See -> Think -> Act -> Verify
    const l3 = await engine.executeThreeLayerControl({
      goal: "Click visual icon on canvas",
      preferredLayer: "layer3_vision",
      visionCoordinates: { xNorm: 0.4, yNorm: 0.6 },
    });
    assert.equal(l3.layerUsed, "layer3_vision");
    assert.equal(l3.verification.method, "vision_frame_diff");

    // 4. Smart Half-Task Completer ("play arjit song") — NEVER asks "Which app? Which song?"
    const music = await engine.completeHalfTask("play arjit song", { autoOpenBrowser: false });
    assert.equal(music.askedClarifyingQuestion, false);
    assert.equal(music.category, "music_media");
    assert.doesNotMatch(music.spokenConfirmation, /which app|which song/i);
    assert.ok(music.proactiveSuggestion.length > 5);

    const work = await engine.completeHalfTask("start my work", { autoOpenBrowser: false });
    assert.equal(work.askedClarifyingQuestion, false);
    assert.equal(work.category, "project_workspace");

    // 5. Voyager + Reflexion Autonomous Sandbox Skill Trainer & Dynamic Python Runner
    const trained = await engine.studyAndPracticeSkill("token_frequency_analyzer");
    assert.equal(trained.mastered, true);
    assert.ok(trained.skill?.skillName.includes("token_frequency_analyzer"));

    const executed = await engine.runOrLearnSkill(trained.skill!.skillName, {
      text: "sara autonomous sandbox practice passed",
    });
    assert.equal(executed.ok, true);
    assert.equal((executed.output as any)?.word_count, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("FrontierCapabilitiesEngine powers Ghost Worker, Screen Memory, Ghost Clipboard, Ephemeral UI, Boardroom, Time-Travel & .sara Soul Capsule", async () => {
  const dir = makeTempDir("sara-frontier-");
  try {
    const frontier = new FrontierCapabilitiesEngine({ dataDir: dir });

    // 1. Ghost Worker + Morning Diff Report
    frontier.enqueueGhostJob({ title: "Nightly Vault Backup", kind: "config_backup", targetOrPrompt: "SARA" });
    const diff = await frontier.runPendingGhostJobs();
    assert.equal(diff.completedCount, 1);
    assert.match(diff.morningDiffReport, /Nightly Vault Backup/);

    // 2. Photographic Screen Memory (<2 MB)
    frontier.recordScreenMemory({
      windowTitle: "AttendEasy - Database Schema",
      appName: "VS Code",
      extractedText: "CREATE TABLE students_attendance (id TEXT PRIMARY KEY)",
    });
    const recalled = frontier.recallScreenMemory("students_attendance");
    assert.equal(recalled.length, 1);
    assert.match(recalled[0].windowTitle, /AttendEasy/);

    // 3. Ghost Clipboard Semantic Pipe & Ephemeral Zero-App Widget
    const clip = await frontier.transformClipboard('{"user":"amol","active":true}', "to_typescript");
    assert.match(clip.output, /interface|type|boolean/i);

    const widget = await frontier.generateEphemeralWidget("Sprint countdown timer");
    assert.match(widget.html, /<!DOCTYPE html>|<div/i);

    // 4. Multi-Agent Synthetic Boardroom + Devil's Advocate
    const board = await frontier.runSyntheticBoardroom("Should we keep SQLite WAL locally?");
    assert.equal(board.panel.length, 4);
    assert.match(board.devilsAdvocateChallenge, /Devil's Advocate/i);

    // 5. Duress Honey-Token Decoy + Budget Guard + Time-Travel File Snapshot/Undo
    const duress = frontier.evaluateDuressOrIntruder({ spokenOrTypedPhrase: "open archive protocol zero" });
    assert.equal(duress.decoyActivated, true);
    frontier.evaluateDuressOrIntruder({ resetDecoy: true });

    const sampleFile = path.join(dir, "draft.txt");
    fs.writeFileSync(sampleFile, "v1-clean-code", "utf8");
    const snap = frontier.createTimeTravelSnapshot(sampleFile, "Before risky edit");
    fs.writeFileSync(sampleFile, "v2-broken-code", "utf8");
    frontier.restoreTimeTravelSnapshot(snap.snapshotId);
    assert.equal(fs.readFileSync(sampleFile, "utf8"), "v1-clean-code");

    const budgetBlocked = frontier.evaluateBudgetGuard({
      merchant: "GPU Cloud",
      amountInr: 4000,
      monthlyCapInr: 2500,
      spentSoFarInr: 500,
    });
    assert.equal(budgetBlocked.approved, false);

    // 6. AES-256-GCM .sara Soul Capsule export & import round-trip
    const exported = frontier.exportSoulCapsule("my-vault-pass-2026");
    assert.ok(exported.bytes > 40);
    const imported = frontier.importSoulCapsule(exported.encryptedBase64, "my-vault-pass-2026");
    assert.ok(imported.restoredMacros >= 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AvengersPantheonEngine verifies all 12 MCU capabilities: V.I.S.I.O.N. Triad + Phasing Zero-Trace + Mind-Stone Nexus, Stark 3D Blueprint + Hand Gestures + Forensic Scrubber, E.D.I.T.H. AR + Abort Rollback, F.R.I.D.A.Y. Fight Pattern + Suit Reroute, G.R.I.O.T. Cockpit, VERONICA & K.A.R.E.N.", async () => {
  const dir = makeTempDir("sara-avengers-pantheon-");
  try {
    let phaseSignal: { enabled: boolean; opacity: number } | null = null;
    const pantheon = new AvengersPantheonEngine({
      dataDir: dir,
      onElectronPhaseToggle: (p) => {
        phaseSignal = p;
      },
    });

    // 1. V.I.S.I.O.N. Triad Synthesis (J.A.R.V.I.S. + Ultron + Mind Stone)
    const triad = await pantheon.synthesizeVisionTriad("Unify cloud Gemini reasoning with 8 GB RAM local OS control");
    assert.ok(triad.jarvisPerspective.stance.length > 10);
    assert.ok(triad.ultronPerspective.stance.length > 10);
    assert.equal(triad.visionSynthesis.ethicalAlignmentScore, 98);

    // 2. V.I.S.I.O.N. Phasing Mode + Zero-Trace Scratchpad Shredding
    const phased = pantheon.setPhaseMode({ enabled: true, opacity: 0.5, zeroTrace: true });
    assert.equal(phased.enabled, true);
    assert.equal(phased.clickThrough, true);
    assert.deepEqual(phaseSignal, { enabled: true, opacity: 0.5 });

    const scratch = pantheon.writeZeroTraceScratch("ghost.txt", "ephemeral-secret");
    assert.equal(fs.existsSync(scratch.ephemeralPath), true);
    pantheon.setPhaseMode({ enabled: false });
    assert.equal(fs.existsSync(scratch.ephemeralPath), false);

    // 3. Mind-Stone Global Threat & CVE Nexus correlates against real SARA package.json
    const nexus = await pantheon.correlateMindStoneNexus();
    assert.ok(nexus.scannedProjects.some((p) => p.name === "SARA"));
    assert.ok(nexus.correlations.length >= 1);

    // 4 & 5. Mid-Air Hand Gesture Router + Stark 3D Explodable Hardware Blueprint
    const gest = pantheon.recordHandGesture({ gesture: "fist_grab", xNorm: 0.5, yNorm: 0.5 });
    assert.equal(gest.mappedCommand, "toggle_explode_wireframe");

    const bp3d = await pantheon.generateStark3dBlueprint("Design an ESP32 smart door lock with relay and power supply");
    assert.ok(bp3d.components.length >= 4);
    assert.ok(bp3d.totalEstimatedBomInr > 500);
    assert.match(bp3d.firmwareCode, /RELAY_PIN/);

    // 6. Iron Man 3 Forensic Timeline Scrubber
    pantheon.recordForensicEvent({
      source: "terminal_error",
      severity: "critical",
      title: "Root Cause Crash Marker",
      detail: "Null pointer in test fixture",
    });
    const timeline = await pantheon.buildForensicTimeline(120);
    assert.equal(timeline.rootCauseInflection?.title, "Root Cause Crash Marker");

    // 7 & 8. E.D.I.T.H. AR Lens + Multi-Target Tactical Batch + Instant "Abort! Abort!" Rollback
    const ar = await pantheon.analyzeEdithFrame({ operatorQuery: "Inspect ESP32 board" });
    assert.equal(ar.hudMode, "EDITH_TACTICAL_LENS");
    assert.ok(ar.targets.length >= 1);

    const existingFile = path.join(dir, "existing.cfg");
    const newFile = path.join(dir, "created-by-batch.cfg");
    fs.writeFileSync(existingFile, "ORIGINAL_SAFE_CONFIG", "utf8");

    const batch = pantheon.stageEdithTacticalBatch("Risky Multi-File Batch", [
      { kind: "write_file", targetPath: existingFile, content: "MUTATED_CONFIG" },
      { kind: "write_file", targetPath: newFile, content: "TEMP_BATCH_ARTIFACT" },
    ]);
    await pantheon.executeEdithTacticalBatch(batch.batchId);
    assert.equal(fs.readFileSync(existingFile, "utf8"), "MUTATED_CONFIG");
    assert.equal(fs.existsSync(newFile), true);

    const rolledBack = pantheon.abortAndRollbackBatch(batch.batchId);
    assert.equal(rolledBack.restoredFilesCount, 1);
    assert.equal(rolledBack.removedNewFilesCount, 1);
    assert.equal(fs.readFileSync(existingFile, "utf8"), "ORIGINAL_SAFE_CONFIG");
    assert.equal(fs.existsSync(newFile), false);

    // 9 & 10. F.R.I.D.A.Y. Fight-Pattern Counter + Suit Damage Self-Reroute Map
    const strategy = await pantheon.analyzeFridayFightPattern({
      category: "compiler_loop",
      history: ["TS2345 type mismatch", "TS2339 property missing"],
    });
    assert.match(strategy.counterMove, /Counter-Move/i);

    const reroutedSuit = pantheon.inspectSuitSubsystemsAndReroute({ simulateFaultIn: "gemini_cloud_brain" });
    assert.ok(reroutedSuit.organs.find((o) => o.organId === "gemini_cloud_brain")?.rerouteEngaged);
    pantheon.inspectSuitSubsystemsAndReroute({ simulateFaultIn: "clear" });

    // 11. G.R.I.O.T. Remote Piloting Cockpit
    const cockpit = await pantheon.getGriotCockpitTelemetry();
    assert.match(cockpit.viewportSvgDataUrl, /^data:image\/svg\+xml;base64,/);
    const remoteTap = await pantheon.dispatchGriotRemoteInput({ action: "tap", xNorm: 0.35, yNorm: 0.65 });
    assert.equal(remoteTap.ok, true);

    // 12. VERONICA Encrypted Drop-Pod + K.A.R.E.N. Recon Drone
    const skillsDir = path.join(dir, "learned_skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "skill_demo.py"), "def execute(**kw):\n    return 'ok'\n", "utf8");
    pantheon.deployKarenReconDrone({ name: "Exam Result Watcher", targetUrl: "https://github.com" });

    const pod = pantheon.deployVeronicaDropPod("stark-veronica-secret");
    assert.equal(pod.includedLearnedSkills, 1);
    fs.rmSync(path.join(skillsDir, "skill_demo.py"), { force: true });

    const restoredPod = pantheon.restoreVeronicaDropPod(pod.encryptedBase64, "stark-veronica-secret");
    assert.equal(restoredPod.restoredSkillsCount, 1);
    assert.equal(fs.existsSync(path.join(skillsDir, "skill_demo.py")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});






