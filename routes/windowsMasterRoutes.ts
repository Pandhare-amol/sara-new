import type { Express, Request, Response } from "express";
import { WINDOWS_11_SETTINGS_CATALOG } from "../cognition/windowsSettingsMasterEngine";
import type { SaraRuntime } from "../runtime/saraRuntime";

export function registerWindowsMasterRoutes(app: Express, getRuntime: () => SaraRuntime | null): void {
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

  // Full Windows 10/11 Settings live state + catalog
  app.get(
    "/api/windows-master/state",
    safe(async (runtime, req) => {
      const refresh = req.query.refresh === "1" || req.query.refresh === "true";
      const [settingsState, securityPosture] = await Promise.all([
        runtime.windowsMaster.getDetailedSettingsState(refresh),
        runtime.antiAttacker.inspectLiveSecurityPosture(),
      ]);
      return {
        ok: true,
        state: settingsState,
        catalog: WINDOWS_11_SETTINGS_CATALOG,
        customization: runtime.windowsMaster.getCustomization(),
        security: securityPosture,
      };
    }),
  );

  // Execute any Windows 10/11 setting / hardware toggle directly (<150ms)
  app.post(
    "/api/windows-master/setting",
    safe(async (runtime, req) => {
      const body = req.body || {};
      return runtime.windowsMaster.executeSettingAction({
        action: String(body.action || "open_page"),
        target: typeof body.target === "string" ? body.target : undefined,
        value: body.value,
      });
    }),
  );

  // Fast natural voice / multi-app workflow command router
  app.post(
    "/api/windows-master/voice-exec",
    safe(async (runtime, req) => {
      const command = String(req.body?.command || req.body?.utterance || "").trim();
      if (!command) throw new Error("`command` is required.");
      const fast = await runtime.windowsMaster.tryFastExecuteVoiceOrTask(command);
      if (fast.handled) {
        return { ok: fast.ok !== false, mode: "instant_fast_path", ...fast };
      }
      const mission = await runtime.commanderSwarm.dispatchCommanderMission(command);
      return {
        ok: mission.ok,
        mode: "commander_department_swarm",
        latencyMs: mission.totalElapsedMs,
        spokenReply: mission.executiveBrief,
        mission,
      };
    }),
  );

  // Multi-step custom workflow runner
  app.post(
    "/api/windows-master/workflow",
    safe(async (runtime, req) => {
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
      if (!steps.length) throw new Error("`steps` array is required.");
      const res = await runtime.windowsMaster.executeWorkflowSteps(steps);
      return { ...res };
    }),
  );

  // Full User Customization Studio CRUD
  app.get(
    "/api/windows-master/customization",
    safe((runtime) => ({
      ok: true,
      customization: runtime.windowsMaster.getCustomization(),
    })),
  );

  app.post(
    "/api/windows-master/customization",
    safe((runtime, req) => ({
      ok: true,
      customization: runtime.windowsMaster.updateCustomization(req.body || {}),
    })),
  );

  app.post(
    "/api/windows-master/macros",
    safe((runtime, req) => ({
      ok: true,
      customization: runtime.windowsMaster.upsertVoiceMacro(req.body || {}),
    })),
  );

  app.delete(
    "/api/windows-master/macros/:id",
    safe((runtime, req) => ({
      ok: true,
      customization: runtime.windowsMaster.deleteVoiceMacro(String(req.params.id)),
    })),
  );

  app.post(
    "/api/windows-master/aliases",
    safe((runtime, req) => ({
      ok: true,
      customization: runtime.windowsMaster.upsertAppAlias(req.body || {}),
    })),
  );

  app.delete(
    "/api/windows-master/aliases/:alias",
    safe((runtime, req) => ({
      ok: true,
      customization: runtime.windowsMaster.deleteAppAlias(String(req.params.alias)),
    })),
  );

  // Production Anti-Attacker Security Shield inspection & payload firewall test
  app.get(
    "/api/windows-master/security",
    safe(async (runtime) => ({
      ok: true,
      security: await runtime.antiAttacker.inspectLiveSecurityPosture(),
    })),
  );

  app.post(
    "/api/windows-master/security/inspect-payload",
    safe((runtime, req) => {
      const payload = String(req.body?.payload || "");
      return {
        ok: true,
        verdict: runtime.antiAttacker.inspectPayloadForAttacks(payload, req.ip || "local"),
      };
    }),
  );
}
