/**
 * SARA Security Shield — independent owner protection layer for SARA.
 *
 * Protects SARA and her autonomous PC-control capabilities against unauthorized
 * access using SARA's own local cryptographic credentials (Owner PIN via
 * OwnerAuth + Owner Passphrase + Emergency Recovery Code + Voice Challenge),
 * while keeping Windows 10 Pro OS internals (Winlogon, Explorer, UAC, Firewall,
 * Microsoft Defender) completely untouched.
 */
import crypto from "node:crypto";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";
import type { OwnerAuth, OwnerAuthStatus, OwnerAuthStore } from "./ownerAuth";

const PASSPHRASE_SECRET_KEY = "sara.shield.passphrase.v1";
const RECOVERY_SECRET_KEY = "sara.shield.recovery.v1";
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 };

const CHALLENGE_WORDS = [
  "aurora", "cobalt", "falcon", "horizon", "meridian", "nebula", "obsidian", "phoenix",
  "quantum", "sentinel", "solstice", "titan", "vanguard", "zenith", "cipher", "polaris",
];

interface StoredCredentialRecord {
  version: 1;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface ShieldConfig {
  shieldEnabled: boolean;
  requireEnrollmentBeforeUse: boolean;
  independentGuard: boolean;
  welcomeOnUnlock: boolean;
}

export interface ShieldAuditEntry {
  at: string;
  event:
    | "passphrase_enrolled"
    | "recovery_generated"
    | "unlock_ok"
    | "unlock_failed"
    | "recovery_unlock"
    | "challenge_issued"
    | "challenge_verified"
    | "lockdown"
    | "shield_reset";
  detail?: string;
}

export interface SaraShieldStatus extends OwnerAuthStatus {
  required: boolean;
  shieldEnabled: boolean;
  requireEnrollmentBeforeUse: boolean;
  independentGuard: boolean;
  welcomeOnUnlock: boolean;
  passphraseEnrolled: boolean;
  recoveryCodeConfigured: boolean;
  anyCredentialEnrolled: boolean;
  gateActive: boolean;
  authorized: boolean;
  lockdownActive: boolean;
  intrusionCount: number;
  windowsSecurityPreserved: true;
}

interface PendingChallenge {
  id: string;
  phrase: string;
  expiresAt: number;
}

export class SaraSecurityShield {
  private readonly auditFile: string;
  private config: ShieldConfig = {
    shieldEnabled: true,
    requireEnrollmentBeforeUse: false,
    independentGuard: true,
    welcomeOnUnlock: true,
  };
  private lockdownActive = false;
  private intrusionCount = 0;
  private failedAttempts = 0;
  private lockedOutUntil = 0;
  private unlockedUntil = 0;
  private lastActivity = 0;
  private idleTimeoutMin = 10;
  private absoluteTimeoutHours = 8;
  private startupVerifiedBypass = false;
  private challenge: PendingChallenge | null = null;

  constructor(
    dataDir: string,
    private readonly ownerAuth: OwnerAuth,
    private readonly store: OwnerAuthStore,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.auditFile = path.join(dataDir, "security", "sara-shield-audit.v1.json");
  }

  configure(
    partial: Partial<ShieldConfig>,
    sessionSettings?: { idleTimeoutMin?: number; absoluteTimeoutHours?: number },
  ): void {
    this.config = { ...this.config, ...partial };
    if (sessionSettings) {
      if (sessionSettings.idleTimeoutMin !== undefined) {
        this.idleTimeoutMin = Math.max(1, Math.min(120, sessionSettings.idleTimeoutMin));
      }
      if (sessionSettings.absoluteTimeoutHours !== undefined) {
        this.absoluteTimeoutHours = Math.max(1, Math.min(48, sessionSettings.absoluteTimeoutHours));
      }
      this.ownerAuth.configure(sessionSettings);
    }
  }

  hasPassphrase(): boolean {
    return Boolean(this.readRecord(PASSPHRASE_SECRET_KEY));
  }

  hasRecoveryCode(): boolean {
    return Boolean(this.readRecord(RECOVERY_SECRET_KEY));
  }

  hasAnyCredential(): boolean {
    return this.ownerAuth.status().enrolled || this.hasPassphrase();
  }

  /**
   * True when SARA actively gates access:
   * - Lockdown mode is active, OR
   * - Shield is enabled AND (an owner PIN/passphrase is enrolled, OR strict enrollment-before-use is enabled).
   */
  isGateActive(forceRequiredEnv = false): boolean {
    if (this.lockdownActive) return true;
    if (!this.config.shieldEnabled) return false;
    if (forceRequiredEnv || this.config.requireEnrollmentBeforeUse) return true;
    return this.hasAnyCredential();
  }

  /**
   * Grants zero-mid-task-prompt authorization after SARA/J.A.R.V.I.S. startup verification
   * succeeds (or in VM instant-bypass mode). Explicitly cleared if `lock()` or `lockdown()` is called.
   */
  grantStartupVerifiedSession(): void {
    this.lockdownActive = false;
    this.startupVerifiedBypass = true;
    this.startShieldSession();
  }

  /** Synchronous backend enforcement hook for ActionExecutor, routes, and Live tools. */
  authorize(forceRequiredEnv = false): boolean {
    if (this.lockdownActive) return false;
    if (this.startupVerifiedBypass && !forceRequiredEnv) return true;
    if (!this.isGateActive(forceRequiredEnv)) return true;
    if (this.ownerAuth.authorize()) return true;
    return this.isShieldSessionUnlocked();
  }

  private isShieldSessionUnlocked(): boolean {
    const current = this.now();
    if (!this.unlockedUntil || current >= this.unlockedUntil) {
      this.unlockedUntil = 0;
      return false;
    }
    if (current - this.lastActivity > this.idleTimeoutMin * 60_000) {
      this.unlockedUntil = 0;
      return false;
    }
    this.lastActivity = current;
    return true;
  }

  private startShieldSession(): void {
    const current = this.now();
    this.lockdownActive = false;
    this.failedAttempts = 0;
    this.lockedOutUntil = 0;
    this.lastActivity = current;
    this.unlockedUntil = current + this.absoluteTimeoutHours * 3_600_000;
  }

  async enrollPassphrase(
    passphrase: string,
    currentSecret?: string,
  ): Promise<{ ok: boolean; error?: string; recoveryCode?: string; status: SaraShieldStatus }> {
    const clean = String(passphrase || "").trim();
    if (clean.length < 6 || clean.length > 128) {
      return { ok: false, error: "Passphrase must be between 6 and 128 characters.", status: this.status() };
    }
    if (/^(password|123456|qwerty|letmein|admin123|sara123)$/i.test(clean)) {
      return { ok: false, error: "Choose a less predictable passphrase.", status: this.status() };
    }
    if (this.hasPassphrase()) {
      const verified = this.verifyStoredSecret(PASSPHRASE_SECRET_KEY, String(currentSecret || "").trim());
      if (!verified) {
        await this.record("unlock_failed", "passphrase_change_verification_failed");
        return { ok: false, error: "Current passphrase is required to replace an enrolled passphrase.", status: this.status() };
      }
    } else if (this.ownerAuth.status().enrolled && currentSecret) {
      const pinCheck = this.ownerAuth.authenticatePin(String(currentSecret));
      if (!pinCheck.ok) {
        return { ok: false, error: "Current owner PIN did not match.", status: this.status() };
      }
    }

    this.storeSecret(PASSPHRASE_SECRET_KEY, clean);
    let recoveryCode: string | undefined;
    if (!this.hasRecoveryCode()) {
      recoveryCode = await this.generateRecoveryCodeInternal();
    }
    this.startShieldSession();
    await this.record("passphrase_enrolled");
    return { ok: true, recoveryCode, status: this.status() };
  }

  async rotateRecoveryCode(ownerPinOrPassphrase: string): Promise<{ ok: boolean; recoveryCode?: string; error?: string }> {
    const secret = String(ownerPinOrPassphrase || "").trim();
    const passOk = this.hasPassphrase() && this.verifyStoredSecret(PASSPHRASE_SECRET_KEY, secret);
    const pinOk = !passOk && this.ownerAuth.status().enrolled ? this.ownerAuth.authenticatePin(secret).ok : false;
    if (!passOk && !pinOk) {
      await this.record("unlock_failed", "recovery_rotation_rejected");
      return { ok: false, error: "Valid owner PIN or passphrase is required to generate a recovery code." };
    }
    const code = await this.generateRecoveryCodeInternal();
    return { ok: true, recoveryCode: code };
  }

  private async generateRecoveryCodeInternal(): Promise<string> {
    const raw = crypto.randomBytes(9).toString("hex").toUpperCase();
    const formatted = `${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}`;
    this.storeSecret(RECOVERY_SECRET_KEY, formatted);
    await this.record("recovery_generated");
    return formatted;
  }

  async unlock(input: { pin?: string; passphrase?: string; recoveryCode?: string }): Promise<{
    ok: boolean;
    method?: "pin" | "passphrase" | "recovery";
    welcomeMessage?: string;
    reason?: string;
    retryAfterMs?: number;
    status: SaraShieldStatus;
  }> {
    const current = this.now();
    if (this.lockedOutUntil > current) {
      const retryAfterMs = this.lockedOutUntil - current;
      return {
        ok: false,
        reason: `SARA Security Shield locked out after intrusion attempts. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
        retryAfterMs,
        status: this.status(),
      };
    }

    if (input.pin) {
      const res = this.ownerAuth.authenticatePin(String(input.pin));
      if (res.ok) {
        this.startShieldSession();
        await this.record("unlock_ok", "pin");
        return {
          ok: true,
          method: "pin",
          welcomeMessage: this.config.welcomeOnUnlock
            ? "Welcome back, Boss. SARA Security Shield verified — full autonomous JARVIS systems online."
            : undefined,
          status: this.status(),
        };
      }
      this.registerFailure();
      await this.record("unlock_failed", "pin");
      return { ok: false, reason: res.reason || "Invalid owner PIN.", retryAfterMs: res.retryAfterMs, status: this.status() };
    }

    if (input.passphrase) {
      if (!this.hasPassphrase()) {
        return { ok: false, reason: "No owner passphrase is enrolled yet.", status: this.status() };
      }
      if (this.verifyStoredSecret(PASSPHRASE_SECRET_KEY, String(input.passphrase).trim())) {
        this.startShieldSession();
        await this.record("unlock_ok", "passphrase");
        return {
          ok: true,
          method: "passphrase",
          welcomeMessage: this.config.welcomeOnUnlock
            ? "Welcome back, Boss. SARA Security Shield verified — full autonomous JARVIS systems online."
            : undefined,
          status: this.status(),
        };
      }
      this.registerFailure();
      await this.record("unlock_failed", "passphrase");
      return {
        ok: false,
        reason: "Incorrect passphrase.",
        retryAfterMs: Math.max(0, this.lockedOutUntil - this.now()) || undefined,
        status: this.status(),
      };
    }

    if (input.recoveryCode) {
      if (!this.hasRecoveryCode()) {
        return { ok: false, reason: "No emergency recovery code is configured.", status: this.status() };
      }
      const normalized = String(input.recoveryCode).trim().toUpperCase();
      if (this.verifyStoredSecret(RECOVERY_SECRET_KEY, normalized)) {
        this.store.delete(RECOVERY_SECRET_KEY);
        this.startShieldSession();
        await this.record("recovery_unlock");
        return {
          ok: true,
          method: "recovery",
          welcomeMessage: "Emergency recovery verified. Generate a fresh recovery code in Security settings.",
          status: this.status(),
        };
      }
      this.registerFailure();
      await this.record("unlock_failed", "recovery_code");
      return { ok: false, reason: "Invalid emergency recovery code.", status: this.status() };
    }

    return { ok: false, reason: "Provide a PIN, passphrase, or emergency recovery code.", status: this.status() };
  }

  issueVoiceChallenge(): { challengeId: string; phrase: string; expiresInSec: number } {
    const picked: string[] = [];
    while (picked.length < 4) {
      const word = CHALLENGE_WORDS[crypto.randomInt(0, CHALLENGE_WORDS.length)];
      if (!picked.includes(word)) picked.push(word);
    }
    const id = crypto.randomUUID();
    const phrase = picked.join(" ");
    this.challenge = { id, phrase, expiresAt: this.now() + 90_000 };
    void this.record("challenge_issued");
    return { challengeId: id, phrase, expiresInSec: 90 };
  }

  verifyVoiceChallenge(challengeId: string, spokenTranscript: string): { ok: boolean; error?: string } {
    if (!this.challenge || this.challenge.id !== challengeId || this.now() > this.challenge.expiresAt) {
      this.challenge = null;
      return { ok: false, error: "Voice challenge expired or invalid." };
    }
    const expected = this.challenge.phrase.toLowerCase().split(/\s+/);
    const actual = String(spokenTranscript || "").toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/);
    this.challenge = null;
    const matched = expected.every((word) => actual.includes(word));
    if (!matched) {
      this.registerFailure();
      void this.record("unlock_failed", "voice_challenge_mismatch");
      return { ok: false, error: "Spoken challenge phrase did not match." };
    }
    void this.record("challenge_verified");
    return { ok: true };
  }

  lock(): SaraShieldStatus {
    this.startupVerifiedBypass = false;
    this.unlockedUntil = 0;
    this.lastActivity = 0;
    this.ownerAuth.lock();
    return this.status();
  }

  async lockdown(reason = "instant_lockdown"): Promise<SaraShieldStatus> {
    this.startupVerifiedBypass = false;
    this.lockdownActive = true;
    this.unlockedUntil = 0;
    this.lastActivity = 0;
    this.ownerAuth.lock();
    await this.record("lockdown", reason);
    return this.status();
  }

  async resetAll(pinOrPassphrase: string): Promise<{ ok: boolean; error?: string; status: SaraShieldStatus }> {
    const secret = String(pinOrPassphrase || "").trim();
    const passOk = this.hasPassphrase() && this.verifyStoredSecret(PASSPHRASE_SECRET_KEY, secret);
    const pinOk = !passOk && this.ownerAuth.status().enrolled ? this.ownerAuth.authenticatePin(secret).ok : false;
    if (!passOk && !pinOk) {
      return { ok: false, error: "Valid owner PIN or passphrase required to reset SARA Security Shield.", status: this.status() };
    }
    this.ownerAuth.reset();
    this.store.delete(PASSPHRASE_SECRET_KEY);
    this.store.delete(RECOVERY_SECRET_KEY);
    this.lockdownActive = false;
    this.unlockedUntil = 0;
    this.failedAttempts = 0;
    this.lockedOutUntil = 0;
    await this.record("shield_reset");
    return { ok: true, status: this.status() };
  }

  visitorSafeReply(forceRequiredEnv = false): string {
    if (!this.hasAnyCredential() && (forceRequiredEnv || this.config.requireEnrollmentBeforeUse)) {
      return "SARA Security Shield requires initial owner PIN or passphrase enrollment before system capabilities are unlocked.";
    }
    if (this.lockdownActive) {
      return "SARA Security Shield is in Lockdown Mode. All autonomous and desktop operations are suspended until the enrolled owner authenticates.";
    }
    return "SARA Security Shield is locked. I can only answer lock-status inquiries right now — authenticate with your owner PIN or passphrase to unlock full JARVIS capabilities.";
  }

  status(forceRequiredEnv = false): SaraShieldStatus {
    const base = this.ownerAuth.status();
    const passphraseEnrolled = this.hasPassphrase();
    const recoveryCodeConfigured = this.hasRecoveryCode();
    const anyCredentialEnrolled = base.enrolled || passphraseEnrolled;
    const gateActive = this.isGateActive(forceRequiredEnv);
    const authorized = this.authorize(forceRequiredEnv);
    const lockedUntil = Math.max(base.lockedUntil ?? 0, this.lockedOutUntil) || null;
    return {
      ...base,
      enrolled: anyCredentialEnrolled,
      authenticated: base.authenticated || this.isShieldSessionUnlocked(),
      lockedUntil,
      required: gateActive,
      shieldEnabled: this.config.shieldEnabled,
      requireEnrollmentBeforeUse: this.config.requireEnrollmentBeforeUse,
      independentGuard: this.config.independentGuard,
      welcomeOnUnlock: this.config.welcomeOnUnlock,
      passphraseEnrolled,
      recoveryCodeConfigured,
      anyCredentialEnrolled,
      gateActive,
      authorized,
      lockdownActive: this.lockdownActive,
      intrusionCount: this.intrusionCount,
      windowsSecurityPreserved: true,
    };
  }

  async recentAudit(limit = 30): Promise<ShieldAuditEntry[]> {
    const items = await readJsonFile<ShieldAuditEntry[]>(this.auditFile, []);
    return items.slice(-Math.max(1, Math.min(100, limit)));
  }

  private registerFailure(): void {
    this.failedAttempts += 1;
    this.intrusionCount += 1;
    if (this.failedAttempts >= 5) {
      const exponent = Math.min(6, this.failedAttempts - 5);
      this.lockedOutUntil = Math.min(this.now() + 15 * 60_000, this.now() + 30_000 * 2 ** exponent);
      this.unlockedUntil = 0;
    }
  }

  private readRecord(secretKey: string): StoredCredentialRecord | null {
    const raw = this.store.get(secretKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredCredentialRecord;
      if (parsed?.version === 1 && typeof parsed.salt === "string" && typeof parsed.hash === "string") {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  private storeSecret(secretKey: string, value: string): void {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(value, salt, 32, SCRYPT_PARAMS);
    const record: StoredCredentialRecord = {
      version: 1,
      salt: salt.toString("base64"),
      hash: hash.toString("base64"),
      createdAt: new Date(this.now()).toISOString(),
    };
    this.store.set(secretKey, JSON.stringify(record));
  }

  private verifyStoredSecret(secretKey: string, candidate: string): boolean {
    const stored = this.readRecord(secretKey);
    if (!stored || !candidate) return false;
    const salt = Buffer.from(stored.salt, "base64");
    const expected = Buffer.from(stored.hash, "base64");
    const actual = crypto.scryptSync(candidate, salt, expected.length, SCRYPT_PARAMS);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  private async record(event: ShieldAuditEntry["event"], detail?: string): Promise<void> {
    const existing = await readJsonFile<ShieldAuditEntry[]>(this.auditFile, []);
    const next = [...existing.slice(-199), { at: new Date(this.now()).toISOString(), event, ...(detail ? { detail } : {}) }];
    await writeJsonFile(this.auditFile, next);
  }
}
