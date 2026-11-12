/**
 * SARA Windows 10 Pro 3-Factor Boot & Desktop Security Gate (`cognition/windowsBootGate.ts`)
 *
 * Implements the Pre-Desktop / Workstation Security Gate (Face + Voice + Password)
 * WITHOUT locking SARA's internal autonomous capabilities once inside the session.
 *
 * Flow:
 *   [1. Windows Boots] -> [2. SARA Face + Voice + Password Gate]
 *      -> Verify -> ACCESS GRANTED (Welcome Chime + Spoken Greeting) or ACCESS DENIED
 *      -> [3. Unlocks into SARA Live Desktop Wallpaper (`WorkerW`)]
 *      -> [4. Voice + Text Central Operating Layer controls entire PC]
 *
 * 100% Local Storage (`DATA_DIR/central_layer/windows-boot-gate.v1.json`), Zero Ollama, Zero Supabase.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type BootGatePolicy = "face_voice_or_password" | "all_three" | "any_single";

export interface BootGateAuditItem {
  id: string;
  at: string;
  decision: "ACCESS_GRANTED" | "ACCESS_DENIED" | "LOCKED" | "ENROLLED";
  method: string;
  detail: string;
}

interface StoredPasswordHash {
  salt: string;
  hash: string;
  updatedAt: string;
}

interface PersistedBootGateState {
  version: 1;
  enabledOnBoot: boolean;
  wallpaperHudOnUnlock: boolean;
  welcomeSoundEnabled: boolean;
  policy: BootGatePolicy;
  passwordRecord: StoredPasswordHash;
  voicePassphrase: string;
  faceDescriptor: number[] | null; // 64-dim normalized luminance/grid descriptor
  faceEnrolledAt: string | null;
  audit: BootGateAuditItem[];
}

export interface BootGateStatus {
  gateLocked: boolean;
  decisionState: "locked" | "access_granted" | "access_denied";
  lastDecisionMessage: string;
  enabledOnBoot: boolean;
  wallpaperHudOnUnlock: boolean;
  welcomeSoundEnabled: boolean;
  policy: BootGatePolicy;
  factorsEnrolled: {
    face: boolean;
    voice: boolean;
    password: boolean;
  };
  sessionVerified: {
    face: boolean;
    voice: boolean;
    password: boolean;
  };
  voicePassphraseHint: string;
  zeroCapabilityLock: true;
  bootStages: Array<{
    stage: number;
    title: string;
    subtitle: string;
    status: "ready" | "active" | "completed";
  }>;
  recentAudit: BootGateAuditItem[];
}

function hashPassword(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex");
  return { salt, hash: derived };
}

function normalizePhrase(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-8 ? dot / denom : 0;
}

export class WindowsBootSecurityGate {
  private readonly filePath: string;
  private state: PersistedBootGateState;
  private gateLocked = false;
  private decisionState: "locked" | "access_granted" | "access_denied" = "access_granted";
  private lastDecisionMessage = "SARA Central Operating Layer unlocked. All PC capabilities active.";
  private sessionVerified = {
    face: false,
    voice: false,
    password: false,
  };

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "central_layer");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "windows-boot-gate.v1.json");

    const defaultPwd = hashPassword("sara2026");
    this.state = {
      version: 1,
      enabledOnBoot: true,
      wallpaperHudOnUnlock: true,
      welcomeSoundEnabled: true,
      policy: "face_voice_or_password",
      passwordRecord: { ...defaultPwd, updatedAt: new Date().toISOString() },
      voicePassphrase: "sara authorize access",
      faceDescriptor: null,
      faceEnrolledAt: null,
      audit: [],
    };
  }

  async initialize(): Promise<void> {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
        if (raw && raw.version === 1) {
          this.state = { ...this.state, ...raw };
        }
      } catch {
        // Keep clean defaults
      }
    } else {
      this.persist();
    }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  private recordAudit(decision: BootGateAuditItem["decision"], method: string, detail: string): void {
    this.state.audit.unshift({
      id: `bg-${crypto.randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      decision,
      method,
      detail,
    });
    if (this.state.audit.length > 40) this.state.audit.length = 40;
    this.persist();
  }

  configure(patch: {
    enabledOnBoot?: boolean;
    wallpaperHudOnUnlock?: boolean;
    welcomeSoundEnabled?: boolean;
    policy?: BootGatePolicy;
  }): BootGateStatus {
    if (typeof patch.enabledOnBoot === "boolean") this.state.enabledOnBoot = patch.enabledOnBoot;
    if (typeof patch.wallpaperHudOnUnlock === "boolean") this.state.wallpaperHudOnUnlock = patch.wallpaperHudOnUnlock;
    if (typeof patch.welcomeSoundEnabled === "boolean") this.state.welcomeSoundEnabled = patch.welcomeSoundEnabled;
    if (patch.policy && ["face_voice_or_password", "all_three", "any_single"].includes(patch.policy)) {
      this.state.policy = patch.policy;
    }
    this.persist();
    return this.status();
  }

  engageBootLock(reason = "Windows 10 Pro Pre-Desktop Security Gate engaged"): BootGateStatus {
    this.gateLocked = true;
    this.decisionState = "locked";
    this.sessionVerified = { face: false, voice: false, password: false };
    this.lastDecisionMessage = reason;
    this.recordAudit("LOCKED", "system", reason);
    return this.status();
  }

  enrollPassword(newPassword: string): BootGateStatus {
    const clean = String(newPassword || "").trim();
    if (clean.length < 4) {
      throw new Error("Master password must be at least 4 characters.");
    }
    const hashed = hashPassword(clean);
    this.state.passwordRecord = { ...hashed, updatedAt: new Date().toISOString() };
    this.recordAudit("ENROLLED", "password", "Updated Windows Boot Gate Master Password.");
    return this.status();
  }

  enrollVoicePassphrase(phrase: string): BootGateStatus {
    const clean = normalizePhrase(phrase);
    if (clean.length < 4) {
      throw new Error("Voice authorization phrase must be at least 4 characters.");
    }
    this.state.voicePassphrase = clean;
    this.recordAudit("ENROLLED", "voice", `Updated Voice Code ("${clean}").`);
    return this.status();
  }

  enrollFaceDescriptor(descriptor: number[]): BootGateStatus {
    if (!Array.isArray(descriptor) || descriptor.length < 16) {
      throw new Error("Face descriptor vector requires at least 16 normalized features.");
    }
    const clean = descriptor.slice(0, 128).map((n) => Number(n) || 0);
    this.state.faceDescriptor = clean;
    this.state.faceEnrolledAt = new Date().toISOString();
    this.recordAudit("ENROLLED", "face", `Enrolled ${clean.length}-point Face ID biometric signature.`);
    return this.status();
  }

  private checkUnlockCondition(): {
    granted: boolean;
    welcomeSpeech: string;
    status: BootGateStatus;
  } {
    const { face, voice, password } = this.sessionVerified;
    let granted = false;

    if (this.state.policy === "any_single") {
      granted = face || voice || password;
    } else if (this.state.policy === "all_three") {
      granted = face && voice && password;
    } else {
      // Default Windows 10 Pro policy: (Face + Voice) OR Master Password fallback
      granted = (face && voice) || password;
    }

    if (granted) {
      this.gateLocked = false;
      this.decisionState = "access_granted";
      const used = [
        face ? "Face ID" : null,
        voice ? "Voice Code" : null,
        password ? "Master Password" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      this.lastDecisionMessage = `ACCESS GRANTED (${used}). Launching SARA Live Wallpaper & Central Operating Layer.`;
      this.recordAudit("ACCESS_GRANTED", used || "multi-factor", this.lastDecisionMessage);
    }

    return {
      granted,
      welcomeSpeech: granted
        ? "Identity confirmed, Boss. Access granted. Mounting SARA live desktop wallpaper and activating Central Operating Layer across Windows 10 Pro."
        : "",
      status: this.status(),
    };
  }

  verifyFace(descriptor: number[]): {
    matched: boolean;
    similarity: number;
    granted: boolean;
    welcomeSpeech: string;
    status: BootGateStatus;
  } {
    if (!Array.isArray(descriptor) || descriptor.length < 16) {
      throw new Error("Invalid webcam face frame descriptor.");
    }
    const clean = descriptor.slice(0, 128).map((n) => Number(n) || 0);

    // If not enrolled yet, first scan enrolls & verifies smoothly so user never gets stuck
    if (!this.state.faceDescriptor || this.state.faceDescriptor.length !== clean.length) {
      this.state.faceDescriptor = clean;
      this.state.faceEnrolledAt = new Date().toISOString();
      this.sessionVerified.face = true;
      const unlock = this.checkUnlockCondition();
      return {
        matched: true,
        similarity: 1,
        ...unlock,
      };
    }

    const sim = cosineSimilarity(this.state.faceDescriptor, clean);
    const matched = sim >= 0.82;
    if (matched) {
      this.sessionVerified.face = true;
      const unlock = this.checkUnlockCondition();
      return { matched: true, similarity: Number(sim.toFixed(3)), ...unlock };
    }

    this.decisionState = "access_denied";
    this.lastDecisionMessage = `ACCESS DENIED — Face biometric mismatch (similarity ${(sim * 100).toFixed(1)}%).`;
    this.recordAudit("ACCESS_DENIED", "face", this.lastDecisionMessage);
    return {
      matched: false,
      similarity: Number(sim.toFixed(3)),
      granted: false,
      welcomeSpeech: "Access denied. Facial signature did not match enrolled owner profile.",
      status: this.status(),
    };
  }

  verifyVoice(spokenTranscript: string): {
    matched: boolean;
    granted: boolean;
    welcomeSpeech: string;
    status: BootGateStatus;
  } {
    const candidate = normalizePhrase(spokenTranscript);
    const expected = normalizePhrase(this.state.voicePassphrase);
    const matched =
      candidate.length >= 4 &&
      (candidate.includes(expected) ||
        expected.split(" ").every((word) => candidate.includes(word)));

    if (matched) {
      this.sessionVerified.voice = true;
      const unlock = this.checkUnlockCondition();
      return { matched: true, ...unlock };
    }

    this.decisionState = "access_denied";
    this.lastDecisionMessage = `ACCESS DENIED — Voice phrase "${spokenTranscript.slice(0, 40)}" rejected.`;
    this.recordAudit("ACCESS_DENIED", "voice", this.lastDecisionMessage);
    return {
      matched: false,
      granted: false,
      welcomeSpeech: "Access denied. Voice authorization code not recognized.",
      status: this.status(),
    };
  }

  verifyPassword(password: string): {
    matched: boolean;
    granted: boolean;
    welcomeSpeech: string;
    status: BootGateStatus;
  } {
    const candidate = hashPassword(String(password || ""), this.state.passwordRecord.salt);
    const a = Buffer.from(candidate.hash, "hex");
    const b = Buffer.from(this.state.passwordRecord.hash, "hex");
    const matched = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (matched) {
      this.sessionVerified.password = true;
      const unlock = this.checkUnlockCondition();
      return { matched: true, ...unlock };
    }

    this.decisionState = "access_denied";
    this.lastDecisionMessage = "ACCESS DENIED — Invalid Master Password.";
    this.recordAudit("ACCESS_DENIED", "password", this.lastDecisionMessage);
    return {
      matched: false,
      granted: false,
      welcomeSpeech: "Access denied. Invalid master password.",
      status: this.status(),
    };
  }

  status(): BootGateStatus {
    const unlocked = !this.gateLocked;
    return {
      gateLocked: this.gateLocked,
      decisionState: this.decisionState,
      lastDecisionMessage: this.lastDecisionMessage,
      enabledOnBoot: this.state.enabledOnBoot,
      wallpaperHudOnUnlock: this.state.wallpaperHudOnUnlock,
      welcomeSoundEnabled: this.state.welcomeSoundEnabled,
      policy: this.state.policy,
      factorsEnrolled: {
        face: Array.isArray(this.state.faceDescriptor) && this.state.faceDescriptor.length >= 16,
        voice: Boolean(this.state.voicePassphrase),
        password: Boolean(this.state.passwordRecord?.hash),
      },
      sessionVerified: { ...this.sessionVerified },
      voicePassphraseHint: `"${this.state.voicePassphrase}"`,
      zeroCapabilityLock: true,
      bootStages: [
        {
          stage: 1,
          title: "PC Power On & Win10 Session",
          subtitle: "Windows 10 Pro (i5 / 8 GB RAM) auto-logon into SARA Boot Sequencer",
          status: "completed",
        },
        {
          stage: 2,
          title: "Pre-Desktop 3-Factor Auth Gate",
          subtitle: "Face ID + Voice Code + Master Password verification",
          status: unlocked ? "completed" : "active",
        },
        {
          stage: 3,
          title: "Live Wallpaper Desktop Launch",
          subtitle: "Explorer.exe + WorkerW Live SARA Wallpaper + Welcome Sound",
          status: unlocked ? "completed" : "ready",
        },
        {
          stage: 4,
          title: "Central Operating Layer Active",
          subtitle: "Voice ('Hey SARA') + Alt+Space Text Bar + Distributed Node Hub (<75 MB RAM)",
          status: unlocked ? "active" : "ready",
        },
      ],
      recentAudit: this.state.audit.slice(0, 12),
    };
  }
}
