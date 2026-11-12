/**
 * Real Local Connector & Integration Manager (`cognition/integrationManager.ts`)
 *
 * Powers SARA & J.A.R.V.I.S. Settings -> Integrations so users can connect,
 * health-test, invoke, and manage real external APIs, calendars, webhooks,
 * document folders, Smart Room IoT bridges, and YouTube/web media sources.
 *
 * 100% Local Storage (`DATA_DIR/integrations/user_connectors.v1.json`),
 * secrets masked on UI read, Zero Ollama, Zero Supabase.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fetchPage } from "../agent/webFetch";

export type IntegrationCategory =
  | "calendar"
  | "email_chat"
  | "documents"
  | "iot_smart_room"
  | "youtube_media"
  | "custom_api";

export interface StoredIntegration {
  id: string;
  name: string;
  category: IntegrationCategory;
  endpointOrPath: string;
  method: "GET" | "POST";
  authHeaderName?: string;
  secretToken?: string;
  enabled: boolean;
  status: "connected" | "configured" | "error";
  lastTestDetail: string;
  lastTestedAt: string | null;
  createdAt: string;
}

export interface PublicIntegrationView {
  id: string;
  name: string;
  category: IntegrationCategory;
  endpointOrPath: string;
  method: "GET" | "POST";
  authHeaderName?: string;
  hasSecret: boolean;
  maskedSecret: string | null;
  enabled: boolean;
  status: "connected" | "configured" | "error";
  lastTestDetail: string;
  lastTestedAt: string | null;
  createdAt: string;
}

export class UserIntegrationManager {
  private readonly filePath: string;
  private connectors: StoredIntegration[] = [];

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "integrations");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "user_connectors.v1.json");
  }

  async initialize(): Promise<void> {
    if (fs.existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
        if (Array.isArray(parsed?.connectors)) {
          this.connectors = parsed.connectors;
        }
      } catch {
        this.connectors = [];
      }
    }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, connectors: this.connectors }, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  private toPublicView(item: StoredIntegration): PublicIntegrationView {
    const token = item.secretToken || "";
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      endpointOrPath: item.endpointOrPath,
      method: item.method,
      authHeaderName: item.authHeaderName,
      hasSecret: token.length > 0,
      maskedSecret: token.length > 4 ? `••••${token.slice(-4)}` : token.length > 0 ? "••••" : null,
      enabled: item.enabled,
      status: item.status,
      lastTestDetail: item.lastTestDetail,
      lastTestedAt: item.lastTestedAt,
      createdAt: item.createdAt,
    };
  }

  list(): PublicIntegrationView[] {
    return this.connectors.map((c) => this.toPublicView(c));
  }

  upsert(input: {
    id?: string;
    name: string;
    category: IntegrationCategory;
    endpointOrPath: string;
    method?: "GET" | "POST";
    authHeaderName?: string;
    secretToken?: string;
    enabled?: boolean;
  }): PublicIntegrationView {
    const name = String(input.name || "").trim().slice(0, 100);
    const endpointOrPath = String(input.endpointOrPath || "").trim().slice(0, 600);
    if (!name || !endpointOrPath) {
      throw new Error("Integration name and URL/path are required.");
    }

    const existing = input.id ? this.connectors.find((c) => c.id === input.id) : undefined;
    if (existing) {
      existing.name = name;
      existing.category = input.category;
      existing.endpointOrPath = endpointOrPath;
      existing.method = input.method === "POST" ? "POST" : "GET";
      if (input.authHeaderName !== undefined) existing.authHeaderName = input.authHeaderName.trim() || undefined;
      if (typeof input.secretToken === "string" && input.secretToken.trim().length > 0) {
        existing.secretToken = input.secretToken.trim();
      }
      if (typeof input.enabled === "boolean") existing.enabled = input.enabled;
      this.persist();
      return this.toPublicView(existing);
    }

    const created: StoredIntegration = {
      id: `intg-${crypto.randomUUID().slice(0, 8)}`,
      name,
      category: input.category,
      endpointOrPath,
      method: input.method === "POST" ? "POST" : "GET",
      authHeaderName: input.authHeaderName?.trim() || "Authorization",
      secretToken: input.secretToken?.trim() || undefined,
      enabled: input.enabled !== false,
      status: "configured",
      lastTestDetail: "Configured — click Test to verify live reachability.",
      lastTestedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.connectors.unshift(created);
    this.persist();
    return this.toPublicView(created);
  }

  setEnabled(id: string, enabled: boolean): PublicIntegrationView {
    const found = this.connectors.find((c) => c.id === id);
    if (!found) throw new Error("Integration not found.");
    found.enabled = enabled;
    this.persist();
    return this.toPublicView(found);
  }

  remove(id: string): boolean {
    const before = this.connectors.length;
    this.connectors = this.connectors.filter((c) => c.id !== id);
    if (this.connectors.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * Executes a real connection check:
   *  - Local folder/file path -> fs.existsSync + entry count
   *  - Calendar (.ics / HTTP) -> fetches and counts VEVENT items
   *  - YouTube / Web Media -> fetches page title & preview
   *  - REST API / Webhook / IoT -> performs live HTTP request with auth header
   */
  async testConnection(id: string): Promise<PublicIntegrationView> {
    const found = this.connectors.find((c) => c.id === id);
    if (!found) throw new Error("Integration not found.");

    const now = new Date().toISOString();
    found.lastTestedAt = now;

    try {
      const target = found.endpointOrPath;

      // 1. Local filesystem folder or file integration
      if (!/^https?:\/\//i.test(target)) {
        const resolved = path.resolve(target);
        if (!fs.existsSync(resolved)) {
          throw new Error(`Local path does not exist: ${resolved}`);
        }
        const stat = fs.statSync(resolved);
        const count = stat.isDirectory() ? fs.readdirSync(resolved).length : 1;
        found.status = "connected";
        found.lastTestDetail = stat.isDirectory()
          ? `Connected to local directory (${count} items)`
          : `Connected to local file (${stat.size} bytes)`;
        this.persist();
        return this.toPublicView(found);
      }

      // 2. YouTube / Media / Web page learning link
      if (found.category === "youtube_media") {
        const page = await fetchPage(target, AbortSignal.timeout(8_000));
        found.status = "connected";
        found.lastTestDetail = `Verified media/article: "${page.title || target}" (${page.text.length} chars extracted)`;
        this.persist();
        return this.toPublicView(found);
      }

      // 3. HTTP / Calendar / Webhook / IoT / Custom REST API
      const headers: Record<string, string> = {
        Accept: "application/json, text/calendar, text/plain, */*",
      };
      if (found.secretToken) {
        const headerName = found.authHeaderName || "Authorization";
        headers[headerName] =
          headerName.toLowerCase() === "authorization" && !/^bearer\s+/i.test(found.secretToken)
            ? `Bearer ${found.secretToken}`
            : found.secretToken;
      }

      const res = await fetch(target, {
        method: found.method,
        headers:
          found.method === "POST"
            ? { ...headers, "Content-Type": "application/json" }
            : headers,
        body:
          found.method === "POST"
            ? JSON.stringify({ text: `[SARA/JARVIS] Connector health ping (${found.name})`, ping: true })
            : undefined,
        signal: AbortSignal.timeout(7_000),
      });

      const bodySnippet = (await res.text()).slice(0, 2000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${bodySnippet.slice(0, 90)})`);
      }

      if (found.category === "calendar" && /BEGIN:VCALENDAR/i.test(bodySnippet)) {
        const eventsCount = (bodySnippet.match(/BEGIN:VEVENT/gi) || []).length;
        found.status = "connected";
        found.lastTestDetail = `Calendar feed verified (${eventsCount}+ VEVENT entries reachable)`;
      } else {
        found.status = "connected";
        found.lastTestDetail = `HTTP ${res.status} OK (${bodySnippet.length} bytes received)`;
      }
    } catch (err) {
      found.status = "error";
      found.lastTestDetail = err instanceof Error ? err.message : String(err);
    }

    this.persist();
    return this.toPublicView(found);
  }

  /**
   * Invokes an enabled integration from SARA, J.A.R.V.I.S., or Settings UI.
   */
  async invoke(id: string, payload: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; preview: string }> {
    const found = this.connectors.find((c) => c.id === id);
    if (!found) throw new Error("Integration not found.");
    if (!found.enabled) throw new Error(`Integration "${found.name}" is currently disabled.`);

    if (!/^https?:\/\//i.test(found.endpointOrPath)) {
      const resolved = path.resolve(found.endpointOrPath);
      if (!fs.existsSync(resolved)) throw new Error(`Path not found: ${resolved}`);
      const stat = fs.statSync(resolved);
      const preview = stat.isDirectory()
        ? fs.readdirSync(resolved).slice(0, 30).join(", ")
        : fs.readFileSync(resolved, "utf8").slice(0, 1500);
      return { ok: true, status: 200, preview };
    }

    const headers: Record<string, string> = {};
    if (found.secretToken) {
      const headerName = found.authHeaderName || "Authorization";
      headers[headerName] =
        headerName.toLowerCase() === "authorization" && !/^bearer\s+/i.test(found.secretToken)
          ? `Bearer ${found.secretToken}`
          : found.secretToken;
    }

    const res = await fetch(found.endpointOrPath, {
      method: found.method,
      headers: found.method === "POST" ? { ...headers, "Content-Type": "application/json" } : headers,
      body: found.method === "POST" ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    const text = (await res.text()).slice(0, 1500);
    return { ok: res.ok, status: res.status, preview: text };
  }
}
