import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type DevicePermission = "read_context" | "sync_tasks" | "remote_actions";

export interface RegisteredDevice {
  id: string;
  name: string;
  fingerprint: string;
  permissions: DevicePermission[];
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

interface RegistryFile { version: 1; devices: RegisteredDevice[]; tokenHashes: Record<string, string>; }

/** Persistent allowlist. Tokens are stored only as SHA-256 digests. */
export class DeviceRegistry {
  private file: RegistryFile = { version: 1, devices: [], tokenHashes: {} };
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as RegistryFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.devices) || !parsed.tokenHashes) throw new Error("Unsupported registry format");
      this.file = parsed;
    } catch (error: any) {
      if (error?.code !== "ENOENT") await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`).catch(() => {});
    }
    this.loaded = true;
  }

  async enroll(input: { name: string; fingerprint: string; permissions?: DevicePermission[] }): Promise<{ device: RegisteredDevice; token: string }> {
    this.assertLoaded();
    const name = input.name.trim();
    const fingerprint = input.fingerprint.trim();
    if (!name || !fingerprint) throw new Error("Device name and fingerprint are required.");
    const permissions = [...new Set(input.permissions || ["read_context"])] as DevicePermission[];
    if (permissions.includes("remote_actions")) throw new Error("Remote actions require a separate explicit approval flow.");
    const now = new Date().toISOString();
    const device: RegisteredDevice = { id: randomUUID(), name, fingerprint, permissions, createdAt: now, lastSeenAt: null, revokedAt: null };
    const token = `${randomUUID()}${randomUUID()}`;
    this.file.devices.push(device);
    this.file.tokenHashes[device.id] = digest(token);
    await this.persist();
    return { device: structuredClone(device), token };
  }

  list(): RegisteredDevice[] { this.assertLoaded(); return this.file.devices.map((device) => structuredClone(device)); }

  async revoke(id: string): Promise<RegisteredDevice> {
    this.assertLoaded();
    const device = this.file.devices.find((item) => item.id === id);
    if (!device) throw new Error("Unknown device.");
    device.revokedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(device);
  }

  async authenticate(id: string, token: string): Promise<RegisteredDevice | null> {
    this.assertLoaded();
    const device = this.file.devices.find((item) => item.id === id && !item.revokedAt);
    const expected = device ? this.file.tokenHashes[id] : undefined;
    if (!device || !expected || !token) return null;
    const actual = Buffer.from(digest(token));
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    device.lastSeenAt = new Date().toISOString();
    await this.persist();
    return structuredClone(device);
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.file, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const temp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(temp, snapshot, "utf8");
      await fs.rename(temp, this.filePath);
    });
    await this.writeQueue;
  }

  private assertLoaded(): void { if (!this.loaded) throw new Error("DeviceRegistry.initialize() must be called first."); }
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
