import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

export interface UploadConsent {
  id: string;
  purpose: string;
  provider: string;
  fileNames: string[];
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export class PrivacyConsentStore {
  private consents: UploadConsent[] = [];
  private loaded = false;
  private write: Promise<void> = Promise.resolve();
  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { consents?: UploadConsent[] };
      this.consents = Array.isArray(parsed.consents) ? parsed.consents : [];
    } catch { this.consents = []; }
    this.loaded = true;
  }

  async grant(input: { purpose: string; provider: string; fileNames: string[]; ttlMs?: number }): Promise<UploadConsent> {
    this.assertLoaded();
    if (!input.purpose.trim() || !input.provider.trim() || input.fileNames.length === 0) throw new Error("Purpose, provider, and files are required.");
    const now = Date.now();
    const consent: UploadConsent = {
      id: randomUUID(), purpose: input.purpose.trim(), provider: input.provider.trim(),
      // Store a deterministic path fingerprint so the same consent cannot be
      // reused for another file with the same basename.
      fileNames: input.fileNames.map((name) => fingerprint(name)),
      grantedAt: new Date(now).toISOString(), expiresAt: new Date(now + Math.min(Math.max(input.ttlMs ?? 15 * 60_000, 60_000), 24 * 60 * 60_000)).toISOString(),
    };
    this.consents.push(consent);
    await this.persist();
    return structuredClone(consent);
  }

  list(): UploadConsent[] { this.assertLoaded(); return this.consents.filter((item) => !item.revokedAt && Date.parse(item.expiresAt) > Date.now()).map((item) => structuredClone(item)); }
  has(id: string, provider: string, fileNames: string[]): boolean {
    return this.list().some((item) => item.id === id && item.provider === provider && fileNames.every((name) => item.fileNames.includes(fingerprint(name))));
  }
  async revoke(id: string): Promise<boolean> {
    this.assertLoaded(); const item = this.consents.find((entry) => entry.id === id && !entry.revokedAt); if (!item) return false;
    item.revokedAt = new Date().toISOString(); await this.persist(); return true;
  }
  private assertLoaded(): void { if (!this.loaded) throw new Error("PrivacyConsentStore.initialize() must be called first."); }
  private async persist(): Promise<void> { const temp = `${this.filePath}.${process.pid}.tmp`; this.write = this.write.then(async () => { await fs.writeFile(temp, JSON.stringify({ version: 1, consents: this.consents }, null, 2), "utf8"); await fs.rename(temp, this.filePath); }); await this.write; }
}

function fingerprint(filePath: string): string { return createHash("sha256").update(path.resolve(filePath).toLowerCase()).digest("hex"); }
