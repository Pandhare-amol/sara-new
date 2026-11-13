import type { Express, Request, Response } from "express";
import type { WebSocket } from "ws";
import type { DepartmentId, SupremeCommanderId } from "../cognition/commanderSwarmEngine";
import type { SaraRuntime } from "../runtime/saraRuntime";

export function registerCommanderSwarmRoutes(app: Express, getRuntime: () => SaraRuntime | null): void {
  const safe =
    (handler: (runtime: SaraRuntime, req: Request, res: Response) => Promise<unknown> | unknown) =>
    async (req: Request, res: Response) => {
      const runtime = getRuntime();
      if (!runtime) {
        res.status(503).json({ ok: false, error: "SARA runtime is still initializing." });
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

  app.get(
    "/api/commander/status",
    safe(async (runtime, req) => {
      const includeSystem = req.query.live !== "0";
      const system = includeSystem ? await runtime.commanderSwarm.collectLiveSystemSnapshot(25) : null;
      return {
        ok: true,
        commander: runtime.commanderSwarm.getCommanderProfile(),
        departments: runtime.commanderSwarm.listDepartments(),
        swarmNodes: runtime.commanderSwarm.listSwarmNodes(),
        recentReports: runtime.commanderSwarm.getRecentReports(20),
        system,
      };
    }),
  );

  app.get(
    "/api/commander/live-system",
    safe(async (runtime, req) => {
      const limit = Math.max(5, Math.min(100, Number(req.query.limit) || 35));
      const system = await runtime.commanderSwarm.collectLiveSystemSnapshot(limit);
      return { ok: true, system };
    }),
  );

  app.get(
    "/api/commander/installed-apps",
    safe(async (runtime, req) => {
      const force = req.query.refresh === "1" || req.query.refresh === "true";
      const apps = await runtime.commanderSwarm.collectInstalledApps(force);
      return { ok: true, count: apps.length, installedApps: apps };
    }),
  );

  app.post(
    "/api/commander/switch",
    safe(async (runtime, req) => {
      const target: SupremeCommanderId = String(req.body?.commander || "").toLowerCase() === "jarvis" ? "jarvis" : "sara";
      const profile = await runtime.commanderSwarm.switchSupremeCommander(target);
      return { ok: true, commander: profile };
    }),
  );

  app.get(
    "/api/commander/startup-auth",
    safe((runtime) => ({
      ok: true,
      startupAuth: runtime.commanderSwarm.getPublicStartupAuth(),
    })),
  );

  app.post(
    "/api/commander/startup-auth/config",
    safe(async (runtime, req) => {
      const status = await runtime.commanderSwarm.configureStartupAuth(req.body || {});
      return { ok: true, startupAuth: status };
    }),
  );

  app.post(
    "/api/commander/startup-auth/verify",
    safe(async (runtime, req, res) => {
      const verdict = await runtime.commanderSwarm.verifyStartupSession(req.body || {});
      if (!verdict.ok) {
        res.status(401).json(verdict);
        return;
      }
      return verdict;
    }),
  );

  app.post(
    "/api/commander/os-control",
    safe(async (runtime, req) => {
      const body = req.body || {};
      const report = await runtime.commanderSwarm.executeDirectOsControl({
        category: body.category || "task_manager",
        action: String(body.action || "list"),
        target: typeof body.target === "string" ? body.target : undefined,
        pid: typeof body.pid === "number" ? body.pid : body.pid ? Number(body.pid) : undefined,
        urls: Array.isArray(body.urls) ? body.urls.map(String) : undefined,
        browser: typeof body.browser === "string" ? body.browser : undefined,
        args: typeof body.args === "object" && body.args ? body.args : body,
      });
      return { ok: report.ok, report };
    }),
  );

  app.post(
    "/api/commander/department/:id",
    safe(async (runtime, req) => {
      const dept = String(req.params.id || "FRIDAY").toUpperCase() as DepartmentId;
      const body = req.body || {};
      const report = await runtime.commanderSwarm.runDepartmentAction(
        dept,
        String(body.action || "scan"),
        body.params || body,
        typeof body.preferredNodeId === "string" ? body.preferredNodeId : undefined,
      );
      return { ok: report.ok, report };
    }),
  );

  app.post(
    "/api/commander/dispatch",
    safe(async (runtime, req) => {
      const goal = String(req.body?.goal || "").trim();
      if (!goal) throw new Error("Mission `goal` is required.");
      const departments = Array.isArray(req.body?.departments)
        ? (req.body.departments.map((d: unknown) => String(d).toUpperCase()) as DepartmentId[])
        : undefined;
      return runtime.commanderSwarm.dispatchCommanderMission(goal, departments);
    }),
  );

  app.get(
    "/api/commander/swarm/nodes",
    safe((runtime) => ({
      ok: true,
      nodes: runtime.commanderSwarm.listSwarmNodes(),
    })),
  );

  app.post(
    "/api/commander/swarm/register",
    safe((runtime, req) => {
      const body = req.body || {};
      if (!body.nodeId) throw new Error("`nodeId` is required.");
      const node = runtime.commanderSwarm.registerHttpWorkerNode(body);
      return { ok: true, node };
    }),
  );
}

export function handleCommanderSwarmSocket(pathname: string, ws: WebSocket, runtime: SaraRuntime | null): boolean {
  if (!runtime) return false;
  if (pathname === "/ws/swarm") {
    runtime.commanderSwarm.attachSwarmWorkerSocket(ws);
    return true;
  }
  if (pathname === "/ws/commander-telemetry") {
    runtime.commanderSwarm.attachTelemetrySubscriber(ws);
    return true;
  }
  return false;
}
