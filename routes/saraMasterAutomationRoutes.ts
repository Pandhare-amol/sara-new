import type { Express, Request, Response } from "express";
import type { SaraRuntime } from "../runtime/saraRuntime";

export function registerSaraMasterAutomationRoutes(app: Express, getRuntime: () => SaraRuntime | null): void {
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

  // Full Module 18 Diagnostics, Context Memory & Unified Command History
  app.get(
    "/api/master-automation/state",
    safe((runtime) => runtime.masterAutomation.getDashboardState()),
  );

  // Unified Voice & Text Command Processor (Hindi + English + Hinglish + Context + 3-Level Policy)
  app.post(
    "/api/master-automation/command",
    safe((runtime, req) =>
      runtime.masterAutomation.executeUnifiedCommand(
        String(req.body?.command || req.body?.utterance || ""),
        req.body?.channel === "voice" ? "voice" : "text",
      ),
    ),
  );

  app.post(
    "/api/master-automation/policy",
    safe((runtime, req) => ({
      ok: true,
      context: runtime.masterAutomation.updateContextOrPolicy(req.body || {}),
    })),
  );

  // Advanced File & Folder Management (Duplicates, Large/Today, Category Organizer, Safe Recycle)
  app.post(
    "/api/master-automation/files/duplicates",
    safe((runtime, req) => runtime.masterAutomation.findDuplicates(req.body?.folderPath)),
  );

  app.post(
    "/api/master-automation/files/search-smart",
    safe((runtime, req) => runtime.masterAutomation.findLargeOrTodayFiles(req.body || {})),
  );

  app.post(
    "/api/master-automation/files/organize",
    safe((runtime, req) =>
      runtime.masterAutomation.organizeFolder(
        String(req.body?.folderPath || runtime.masterAutomation.getContextAndPolicy().currentFolder),
        req.body?.dryRun !== false,
      ),
    ),
  );

  app.post(
    "/api/master-automation/files/recycle",
    safe((runtime, req) => runtime.masterAutomation.recycleFileSafe(String(req.body?.filePath || ""))),
  );

  app.post(
    "/api/master-automation/files/restore",
    safe((runtime, req) => runtime.masterAutomation.restoreRecycledFile(String(req.body?.recycleToken || ""))),
  );

  // Module 18: Standalone Self-Diagnostics, Secret-Scrubbed Backups, Restore & Emergency Mode
  app.post(
    "/api/master-automation/diagnostics",
    safe((runtime) => runtime.masterAutomation.runSelfDiagnostics()),
  );

  app.post(
    "/api/master-automation/backup",
    safe((runtime, req) =>
      runtime.masterAutomation.createBackup(
        req.body?.bucket || "recovery_points",
        String(req.body?.label || "manual_checkpoint"),
      ),
    ),
  );

  app.post(
    "/api/master-automation/restore",
    safe((runtime, req) => runtime.masterAutomation.restoreBackup(String(req.body?.archivePath || ""))),
  );

  app.post(
    "/api/master-automation/emergency",
    safe((runtime, req) => {
      if (req.body?.exit === true) return runtime.masterAutomation.exitEmergencyRecoveryMode();
      return runtime.masterAutomation.triggerEmergencyRecoveryMode(String(req.body?.reason || "Dashboard emergency trigger"));
    }),
  );

  // Live 17/17 Project Completion Audit
  app.post(
    "/api/master-automation/verify-17",
    safe((runtime) => runtime.masterAutomation.verify17PointProjectChecklist()),
  );
}
