/**
 * SARA Managed Workspaces (distinct from Windows native virtual desktops).
 *
 * Persists named window layouts, captures currently visible Windows Bridge
 * snapshots, and restores window positions/focus/launch targets cleanly on
 * Windows 10 Pro and Windows 11 without touching Explorer internals.
 */
import crypto from "node:crypto";
import path from "node:path";
import { appEvents } from "../shared/appEvents";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";

export interface WorkspaceWindowSpec {
  title: string;
  processName: string;
  hwnd?: number;
  launchTarget?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  minimized?: boolean;
}

export interface SaraWorkspace {
  id: string;
  name: string;
  description: string;
  windows: WorkspaceWindowSpec[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceManagerDeps {
  dataDir: string;
  getLiveWindows: () => Promise<Array<{
    hwnd?: number;
    title?: string;
    processName?: string;
    bounds?: { x?: number; y?: number; width?: number; height?: number; left?: number; top?: number; right?: number; bottom?: number };
    isMinimized?: boolean;
  }>>;
  manageWindow: (op: {
    operation: "focus" | "minimize" | "restore" | "move_resize" | "launch_application";
    hwnd?: number;
    processName?: string;
    target?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export class WorkspaceManager {
  private readonly file: string;
  private workspaces: SaraWorkspace[] = [];
  private loaded = false;

  constructor(private readonly deps: WorkspaceManagerDeps) {
    this.file = path.join(deps.dataDir, "windows", "workspaces.v1.json");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.workspaces = await readJsonFile<SaraWorkspace[]>(this.file, []);
    this.loaded = true;
  }

  async list(): Promise<SaraWorkspace[]> {
    await this.initialize();
    return structuredClone(this.workspaces);
  }

  async create(input: {
    name: string;
    description?: string;
    captureCurrent?: boolean;
    windows?: WorkspaceWindowSpec[];
  }): Promise<SaraWorkspace> {
    await this.initialize();
    const cleanName = String(input.name || "").trim();
    if (!cleanName) throw new Error("Workspace name is required.");

    let windows: WorkspaceWindowSpec[] = Array.isArray(input.windows) ? input.windows : [];
    if (input.captureCurrent) {
      windows = await this.captureLiveSnapshot();
    }

    const now = new Date().toISOString();
    const workspace: SaraWorkspace = {
      id: crypto.randomUUID(),
      name: cleanName.slice(0, 80),
      description: String(input.description || "").slice(0, 240),
      windows,
      active: this.workspaces.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.push(workspace);
    await writeJsonFile(this.file, this.workspaces);
    appEvents.publish("workspaces.updated", { action: "created", workspace });
    return structuredClone(workspace);
  }

  async captureIntoWorkspace(id: string): Promise<SaraWorkspace> {
    await this.initialize();
    const ws = this.workspaces.find((item) => item.id === id);
    if (!ws) throw new Error("Workspace not found.");
    ws.windows = await this.captureLiveSnapshot();
    ws.updatedAt = new Date().toISOString();
    await writeJsonFile(this.file, this.workspaces);
    return structuredClone(ws);
  }

  async activate(id: string): Promise<{
    workspace: SaraWorkspace;
    restoredCount: number;
    launchedCount: number;
    notes: string[];
  }> {
    await this.initialize();
    const ws = this.workspaces.find((item) => item.id === id);
    if (!ws) throw new Error("Workspace not found.");

    for (const item of this.workspaces) item.active = item.id === id;
    ws.updatedAt = new Date().toISOString();
    await writeJsonFile(this.file, this.workspaces);

    const live = await this.deps.getLiveWindows().catch(() => []);
    let restoredCount = 0;
    let launchedCount = 0;
    const notes: string[] = [];

    for (const spec of ws.windows) {
      const match = live.find(
        (w) =>
          (spec.processName && String(w.processName || "").toLowerCase() === spec.processName.toLowerCase()) ||
          (spec.title && String(w.title || "").toLowerCase().includes(spec.title.toLowerCase())),
      );
      if (match?.hwnd) {
        if (spec.minimized) {
          const r = await this.deps.manageWindow({ operation: "minimize", hwnd: match.hwnd, processName: match.processName });
          if (r.ok) restoredCount += 1;
        } else {
          await this.deps.manageWindow({ operation: "restore", hwnd: match.hwnd, processName: match.processName });
          if (spec.bounds && spec.bounds.width > 0 && spec.bounds.height > 0) {
            const moved = await this.deps.manageWindow({
              operation: "move_resize",
              hwnd: match.hwnd,
              processName: match.processName,
              x: spec.bounds.x,
              y: spec.bounds.y,
              width: spec.bounds.width,
              height: spec.bounds.height,
            });
            if (moved.ok) restoredCount += 1;
            else notes.push(`Could not resize "${spec.title || spec.processName}": ${moved.error || "bridge unavailable"}`);
          } else {
            const focused = await this.deps.manageWindow({ operation: "focus", hwnd: match.hwnd, processName: match.processName });
            if (focused.ok) restoredCount += 1;
          }
        }
      } else if (spec.launchTarget) {
        const launched = await this.deps.manageWindow({ operation: "launch_application", target: spec.launchTarget });
        if (launched.ok) launchedCount += 1;
        else notes.push(`Could not launch "${spec.launchTarget}": ${launched.error || "unavailable"}`);
      } else {
        notes.push(`Window "${spec.title || spec.processName}" is not currently open.`);
      }
    }

    appEvents.publish("workspaces.activated", { id: ws.id, name: ws.name, restoredCount, launchedCount });
    return { workspace: structuredClone(ws), restoredCount, launchedCount, notes };
  }

  async remove(id: string): Promise<boolean> {
    await this.initialize();
    const before = this.workspaces.length;
    this.workspaces = this.workspaces.filter((item) => item.id !== id);
    if (this.workspaces.length !== before) {
      await writeJsonFile(this.file, this.workspaces);
      appEvents.publish("workspaces.updated", { action: "deleted", id });
      return true;
    }
    return false;
  }

  private async captureLiveSnapshot(): Promise<WorkspaceWindowSpec[]> {
    const live = await this.deps.getLiveWindows().catch(() => []);
    const result: WorkspaceWindowSpec[] = [];
    for (const win of live.slice(0, 25)) {
      const title = String(win.title || "").trim();
      const processName = String(win.processName || "").trim();
      if (!title && !processName) continue;
      const b = win.bounds;
      const x = Number(b?.x ?? b?.left ?? 0);
      const y = Number(b?.y ?? b?.top ?? 0);
      const width = Number(b?.width ?? (b?.right !== undefined && b?.left !== undefined ? b.right - b.left : 0));
      const height = Number(b?.height ?? (b?.bottom !== undefined && b?.top !== undefined ? b.bottom - b.top : 0));
      result.push({
        title,
        processName,
        ...(typeof win.hwnd === "number" ? { hwnd: win.hwnd } : {}),
        ...(width > 0 && height > 0 ? { bounds: { x, y, width, height } } : {}),
        minimized: Boolean(win.isMinimized),
      });
    }
    return result;
  }
}
