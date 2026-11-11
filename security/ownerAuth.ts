import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface OwnerAuthStore {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

interface RecordV1 {
  version: 1;
  salt: string;
  hash: string;
  failures: number;
  lockedUntil: number;
  enrolledAt: string;
}

export interface OwnerAuthStatus {
  enrolled: boolean;
  authenticated: boolean;
  methods: { pin: boolean; face: false; voice: false; windowsHello: false };
  lockedUntil: number | null;
}

const STORAGE_KEY = "sara.owner-auth.v1";
const LOCKOUT_AFTER = 5;

function rejectPin(pin: string): void {
  if (!/^\d{6,64}$/.test(pin)) throw new Error("PIN must contain at least 6 digits.");
  if (/^(\d)\1+$/.test(pin) || ["123456", "654321", "12345678", "000000"].includes(pin)) throw new Error("Choose a less predictable PIN.");
}

function derive(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 32, { N: 16_384, r: 8, p: 1 });
}

export class OwnerAuth {
  private record: RecordV1 | null = null;
  private token: { value: string; issuedAt: number; lastUsedAt: number } | null = null;
  private idleMs = 10 * 60_000;
  private absoluteMs = 8 * 60 * 60_000;

  constructor(private readonly store: OwnerAuthStore, private readonly now = () => Date.now()) {}

  initialize(): void {
    const raw = this.store.get(STORAGE_KEY);
    try {
      const parsed = raw ? JSON.parse(raw) as RecordV1 : null;
      this.record = parsed?.version === 1 && parsed.salt && parsed.hash ? parsed : null;
    } catch { this.record = null; }
    this.lock();
  }

  configure(options: { idleTimeoutMin?: number; absoluteTimeoutHours?: number }): void {
    if (options.idleTimeoutMin !== undefined) this.idleMs = Math.max(1, Math.min(120, options.idleTimeoutMin)) * 60_000;
    if (options.absoluteTimeoutHours !== undefined) this.absoluteMs = Math.max(1, Math.min(48, options.absoluteTimeoutHours)) * 3_600_000;
  }

  enrollPin(pin: string): void {
    rejectPin(pin);
    const salt = randomBytes(16);
    this.record = { version: 1, salt: salt.toString("base64"), hash: derive(pin, salt).toString("base64"), failures: 0, lockedUntil: 0, enrolledAt: new Date(this.now()).toISOString() };
    this.store.set(STORAGE_KEY, JSON.stringify(this.record));
    this.lock();
  }

  authenticatePin(pin: string): { ok: boolean; reason?: string; retryAfterMs?: number } {
    if (!this.record) return { ok: false, reason: "Owner PIN is not enrolled." };
    const current = this.now();
    if (current < this.record.lockedUntil) return { ok: false, reason: "Authentication is temporarily locked.", retryAfterMs: this.record.lockedUntil - current };
    const expected = Buffer.from(this.record.hash, "base64");
    const actual = derive(pin, Buffer.from(this.record.salt, "base64"));
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!valid) {
      this.record.failures += 1;
      if (this.record.failures >= LOCKOUT_AFTER) this.record.lockedUntil = current + Math.min(15 * 60_000, 30_000 * 2 ** (this.record.failures - LOCKOUT_AFTER));
      this.store.set(STORAGE_KEY, JSON.stringify(this.record));
      return { ok: false, reason: "Invalid owner PIN.", retryAfterMs: Math.max(0, this.record.lockedUntil - current) || undefined };
    }
    this.record.failures = 0; this.record.lockedUntil = 0;
    this.store.set(STORAGE_KEY, JSON.stringify(this.record));
    const issuedAt = current;
    this.token = { value: randomBytes(32).toString("base64url"), issuedAt, lastUsedAt: current };
    return { ok: true };
  }

  isAuthenticated(): boolean {
    if (!this.token) return false;
    const current = this.now();
    if (current - this.token.lastUsedAt > this.idleMs || current - this.token.issuedAt > this.absoluteMs) { this.lock(); return false; }
    return true;
  }

  authorize(): boolean {
    if (!this.isAuthenticated()) return false;
    this.token!.lastUsedAt = this.now();
    return true;
  }

  lock(): void { this.token = null; }

  reset(): void { this.lock(); this.record = null; this.store.delete(STORAGE_KEY); }

  status(): OwnerAuthStatus {
    return { enrolled: Boolean(this.record), authenticated: this.isAuthenticated(), methods: { pin: Boolean(this.record), face: false, voice: false, windowsHello: false }, lockedUntil: this.record?.lockedUntil ? this.record.lockedUntil : null };
  }
}

export const ownerAuthStorageKey = STORAGE_KEY;
