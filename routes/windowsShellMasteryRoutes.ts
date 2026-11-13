import type { Express, Request, Response } from "express";
import type { SaraRuntime } from "../runtime/saraRuntime";

export function registerWindowsShellMasteryRoutes(app: Express, getRuntime: () => SaraRuntime | null): void {
  const safe =
    (handler: (runtime: SaraRuntime, req: Request, res: Response) => Promise<unknown> | unknown) =>
    async (req: Request, res: Response) => {
      const runtime = getRuntime();
      if (!runtime) {
        res.status(503).json({ ok: false, error: "SARA runtime is still initializing." });
        return;
      }
      if (!runtime.isOwnerAuthorized()) {
        res.status(423).json({ ok: false, locked: true, error: runtime.securityShield.visitorSafeReply() });
        return;
      }
      try {
        const out = await handler(runtime, req, res);
        if (!res.headersSent) res.json(out ?? { ok: true });
      } catch (err) {
        if (!res.headersSent) {
          res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
    };

  // Complete Native Shell, 7-Domain Map, Notifications, Reconciler & Binary Readiness Snapshot
  app.get(
    "/api/shell-mastery/state",
    safe((runtime) => runtime.shellMastery.getFullDashboardSnapshot()),
  );

  // Start Center & Universal Search (<20ms)
  app.get(
    "/api/shell-mastery/search",
    safe((runtime, req) => runtime.shellMastery.universalSearch(String(req.query.q || ""))),
  );

  // Taskbar / Start Center / CustomShell Opt-In Config
  app.post(
    "/api/shell-mastery/config",
    safe((runtime, req) => ({
      ok: true,
      shell: runtime.shellMastery.updateShellConfig(req.body || {}),
    })),
  );

  // Native Notification Center
  app.post(
    "/api/shell-mastery/notifications/read-all",
    safe((runtime) => ({
      ok: true,
      notifications: runtime.shellMastery.markNotificationsRead(),
    })),
  );

  // 7-Domain Windows 10/11 Pro Mastery Router
  app.post(
    "/api/shell-mastery/execute-domain",
    safe(async (runtime, req) => {
      const command = String(req.body?.command || "").trim();
      if (!command) throw new Error("`command` is required.");
      return runtime.shellMastery.routeAndExecute7Domain(command);
    }),
  );

  // Stale Build-Lock Unlocker & File-Lock PID Inspector
  app.post(
    "/api/shell-mastery/unlock-build",
    safe((runtime) => runtime.shellMastery.clearStaleBuildLocks()),
  );

  app.post(
    "/api/shell-mastery/file-locks",
    safe((runtime, req) => runtime.shellMastery.findFileLockHolders(String(req.body?.path || "."))),
  );

  // Autonomous Web-to-Work Browser, Blog-Learner, Form Inspector & Sandboxed Skill Trainer
  app.post(
    "/api/shell-mastery/web-inspect-form",
    safe((runtime, req) => runtime.shellMastery.inspectWebForm(String(req.body?.urlOrHtml || ""))),
  );

  app.post(
    "/api/shell-mastery/web-to-work",
    safe((runtime, req) =>
      runtime.shellMastery.runWebToWorkLearnAndApply(
        String(req.body?.directive || ""),
        typeof req.body?.outputFileName === "string" ? req.body.outputFileName : undefined,
      ),
    ),
  );

  app.post(
    "/api/shell-mastery/train-skill",
    safe((runtime, req) => runtime.shellMastery.trainSandboxedSkillFromWeb(String(req.body?.topic || ""))),
  );

  // 4-Layer Shield `.saravault` Encrypt/Decrypt & USB/Rogue-Process Sentinel
  app.post(
    "/api/shell-mastery/vault",
    safe((runtime, req) =>
      runtime.shellMastery.toggleSaraVaultFile(
        String(req.body?.filePath || ""),
        String(req.body?.password || ""),
        req.body?.encrypt !== false,
      ),
    ),
  );

  app.get(
    "/api/shell-mastery/sentinel",
    safe((runtime) => runtime.shellMastery.scanUsbAndRogueProcesses()),
  );

  // Explorer Restart, DPI, Sleep/Wake, Multi-Monitor & Session Event Reconciliation
  app.post(
    "/api/shell-mastery/reconcile",
    safe((runtime, req) =>
      runtime.shellMastery.reconcileNativeEvent({
        kind: req.body?.kind || "explorer_restart",
        newExplorerPid: typeof req.body?.newExplorerPid === "number" ? req.body.newExplorerPid : undefined,
        newDpi: typeof req.body?.newDpi === "number" ? req.body.newDpi : undefined,
        monitorsCount: typeof req.body?.monitorsCount === "number" ? req.body.monitorsCount : undefined,
      }),
    ),
  );

  // Executable Windows 10/11 Acceptance Suite
  app.post(
    "/api/shell-mastery/acceptance-suite",
    safe((runtime) => runtime.shellMastery.runWindowsAcceptanceSuite()),
  );
}
