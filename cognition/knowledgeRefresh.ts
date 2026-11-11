import { KnowledgeStore } from "./knowledgeStore";

export class KnowledgeRefreshScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastRunAt: string | null = null;
  private lastError: string | null = null;
  private paused = false;
  private readonly allowedHosts: Set<string> | null;
  constructor(private readonly store: KnowledgeStore, private readonly intervalMs = 60_000, allowedHosts?: string[]) {
    const configured = allowedHosts ?? (process.env.MYRAA_KNOWLEDGE_ALLOWED_HOSTS || "").split(",").map((host) => host.trim()).filter(Boolean);
    this.allowedHosts = configured.length ? new Set(configured.map((host) => host.toLowerCase())) : null;
  }
  start(): void { if (this.timer || this.paused) return; this.timer = setInterval(() => { void this.runOnce(); }, this.intervalMs); this.timer.unref?.(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  pause(): void { this.paused = true; this.stop(); }
  resume(): void { this.paused = false; this.start(); }
  status(): { enabled: boolean; paused: boolean; running: boolean; lastRunAt: string | null; lastError: string | null; due: number } { return { enabled: Boolean(this.timer), paused: this.paused, running: this.running, lastRunAt: this.lastRunAt, lastError: this.lastError, due: this.store.due().length }; }
  async runOnce(): Promise<{ due: number; refreshed: number; skipped: number }> {
    if (this.paused) return { due: this.store.due().length, refreshed: 0, skipped: this.store.due().length };
    if (this.running) return { due: this.store.due().length, refreshed: 0, skipped: this.store.due().length };
    this.running = true; this.lastError = null;
    try {
      const due = this.store.due();
      let refreshed = 0;
      let skipped = 0;
      for (const entry of due.slice(0, 3)) {
        const locator = entry.source.locator || "";
        if (entry.source.kind !== "web" || !/^https:\/\//i.test(locator) || !this.isAllowed(locator)) { skipped++; continue; }
        try {
          const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000);
          const response = await fetch(locator, { signal: controller.signal, headers: { accept: "text/plain,text/html" } });
          clearTimeout(timeout);
          if (!response.ok) { skipped++; continue; }
          const text = (await response.text()).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50_000);
          if (!text) { skipped++; continue; }
          await this.store.add({ topic: entry.topic, content: text, source: entry.source, confidence: entry.confidence, refreshAfter: new Date(Date.now() + 24 * 60 * 60_000).toISOString() });
          refreshed++;
        } catch { skipped++; }
      }
      this.lastRunAt = new Date().toISOString();
      return { due: due.length, refreshed, skipped: skipped + Math.max(0, due.length - 3) };
    } catch (error) { this.lastError = error instanceof Error ? error.message : String(error); throw error; }
    finally { this.running = false; }
  }

  private isAllowed(locator: string): boolean {
    try {
      const hostname = new URL(locator).hostname.toLowerCase();
      return !this.allowedHosts || [...this.allowedHosts].some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
    } catch { return false; }
  }
}
