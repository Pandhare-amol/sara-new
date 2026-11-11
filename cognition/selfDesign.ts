import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DesignSignal = { source: "screen" | "camera" | "log" | "health"; detail: string; observedAt?: string };
export type DesignProposal = { id: string; title: string; rationale: string; changes: string[]; signals: DesignSignal[]; risk: "low" | "medium"; status: "proposed" | "approved" | "rejected" | "applied"; createdAt: string; appliedAt?: string };

/** Proposes reversible product/UI adaptations from telemetry. It never writes code or security policy. */
export class SelfDesignEngine {
  private proposals: DesignProposal[] = [];
  constructor(private readonly file: string) {}
  async initialize(): Promise<void> { try { this.proposals = JSON.parse(await fs.readFile(this.file, "utf8")) as DesignProposal[]; } catch { this.proposals = []; } }
  list(): DesignProposal[] { return [...this.proposals].reverse(); }
  async observe(signals: DesignSignal[]): Promise<DesignProposal[]> {
    if (!signals.length) return [];
    const text = signals.map((s) => s.detail).join(" ");
    const created: DesignProposal[] = [];
    if (/ram\D*(8[5-9]|9\d)|memory\D*(8[5-9]|9\d)/i.test(text)) created.push(this.make("Enable low-resource presentation", "High memory pressure was observed.", ["Reduce background refresh frequency", "Pause nonessential visual effects"], signals));
    if (/screen.*(error|blocked|unclear)|camera.*(unclear|unavailable)/i.test(text)) created.push(this.make("Increase observation clarity", "A perception signal indicates uncertainty.", ["Show the latest observation status", "Request a fresh authorized frame before acting"], signals));
    if (/repeated|timeout|failed|dropped/i.test(text)) created.push(this.make("Add a recovery hint", "Repeated runtime failures were observed.", ["Expose the affected component", "Suggest a bounded retry or manual review"], signals));
    if (!created.length) created.push(this.make("Keep current design", "No safe adaptation was justified by the observed signals.", ["Retain the current interface and monitoring policy"], signals));
    this.proposals.push(...created); this.proposals = this.proposals.slice(-100); await this.persist(); return created;
  }
  async decide(id: string, approved: boolean): Promise<DesignProposal | null> {
    const item = this.proposals.find((p) => p.id === id); if (!item || item.status !== "proposed") return null;
    item.status = approved ? "approved" : "rejected"; if (approved) { item.status = "applied"; item.appliedAt = new Date().toISOString(); } await this.persist(); return item;
  }
  private make(title: string, rationale: string, changes: string[], signals: DesignSignal[]): DesignProposal { return { id: randomUUID(), title, rationale, changes, signals: signals.slice(0, 20), risk: "low", status: "proposed", createdAt: new Date().toISOString() }; }
  private async persist(): Promise<void> { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(this.file, JSON.stringify(this.proposals, null, 2), "utf8"); }
}
