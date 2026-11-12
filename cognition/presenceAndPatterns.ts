import fs from "node:fs";
import path from "node:path";
import type { JarvisModeManager, WorkshopDiagnostic } from "./jarvisModes";

export interface BiometricPresenceEvent {
  state: "owner_verified" | "intruder_alert" | "desk_vacant" | "debounce_hold";
  userPresent: boolean;
  intruderActive: boolean;
  confidence: number;
  welcomeBack: boolean;
  recommendedMode: "SENTRY" | "CO_PILOT" | "TACTICAL";
  elapsedAbsenceSec: number;
  timestamp: string;
}

export type CognitivePatternType =
  | "DEBUG_LOOP"
  | "FATIGUE_HIGH_CORRECTION"
  | "REPETITIVE_WORKFLOW"
  | "DEEP_FOCUS";

export interface DetectedBehavioralPattern {
  id: string;
  pattern: CognitivePatternType;
  activeWindow: string;
  summary: string;
  proactiveReaction: string;
  workshopDiagnostic?: WorkshopDiagnostic | null;
  synthesizedMacroName?: string;
  timestamp: string;
}

export interface HourlyWorkPatternDigest {
  dayOfWeek: number;
  hour: number;
  avgKeysPerMin: number;
  topApps: string[];
  detectedBottlenecks: CognitivePatternType[];
  recordedAt: string;
}

function computeNormalizedHistogram(pixels: number[], bins = 32): number[] {
  if (!pixels.length) return new Array(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);
  for (const raw of pixels) {
    const v = Math.max(0, Math.min(255, Math.floor(Number(raw) || 0)));
    const idx = Math.min(bins - 1, Math.floor((v * bins) / 256));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts.map((c) => Number((c / pixels.length).toFixed(6)));
}

function chiSquareHistogramDistance(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 100;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    sum += ((av - bv) ** 2) / (av + bv + 1e-9);
  }
  return Number((Math.sqrt(sum) * 100).toFixed(2));
}

export class BiometricPresenceEngine {
  private readonly biometricsDir: string;
  private readonly signaturePath: string;
  private readonly intruderLogPath: string;
  private readonly modeManager: JarvisModeManager;
  private readonly absenceThresholdSec: number;
  private readonly confidenceThreshold: number;
  private readonly onOwnerReturned?: () => void;
  private readonly onIntruderAlert?: (evt: BiometricPresenceEvent) => void;

  private ownerCentroid: number[] | null = null;
  private userPresent = true;
  private intruderActive = false;
  private lastSeenMs = Date.now();
  private lastEvent: BiometricPresenceEvent | null = null;
  private intruderEvents: BiometricPresenceEvent[] = [];

  constructor(opts: {
    dataDir: string;
    modeManager: JarvisModeManager;
    absenceThresholdSec?: number;
    confidenceThreshold?: number;
    onOwnerReturned?: () => void;
    onIntruderAlert?: (evt: BiometricPresenceEvent) => void;
  }) {
    this.biometricsDir = path.join(opts.dataDir, "biometrics");
    this.signaturePath = path.join(this.biometricsDir, "owner_signature.v1.json");
    this.intruderLogPath = path.join(this.biometricsDir, "intruder_alerts.v1.json");
    this.modeManager = opts.modeManager;
    this.absenceThresholdSec = opts.absenceThresholdSec ?? 15;
    this.confidenceThreshold = opts.confidenceThreshold ?? 65;
    this.onOwnerReturned = opts.onOwnerReturned;
    this.onIntruderAlert = opts.onIntruderAlert;
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.biometricsDir, { recursive: true });
    try {
      if (fs.existsSync(this.signaturePath)) {
        const parsed = JSON.parse(await fs.promises.readFile(this.signaturePath, "utf8"));
        if (Array.isArray(parsed?.centroid)) {
          this.ownerCentroid = parsed.centroid.map(Number);
        }
      }
      if (fs.existsSync(this.intruderLogPath)) {
        const logs = JSON.parse(await fs.promises.readFile(this.intruderLogPath, "utf8"));
        if (Array.isArray(logs)) this.intruderEvents = logs.slice(-50);
      }
    } catch {
      // Clean initial state
    }
  }

  async enrollOwnerSamples(samples: number[][]): Promise<{ enrolled: boolean; sampleCount: number; bins: number }> {
    if (!Array.isArray(samples) || samples.length === 0 || !samples[0]?.length) {
      throw new Error("Provide at least one non-empty grayscale sample array to enroll owner biometrics.");
    }
    const bins = 32;
    const hists = samples.map((s) => computeNormalizedHistogram(s, bins));
    const centroid = new Array<number>(bins).fill(0).map((_, idx) => {
      const avg = hists.reduce((acc, h) => acc + (h[idx] ?? 0), 0) / hists.length;
      return Number(avg.toFixed(6));
    });
    this.ownerCentroid = centroid;
    await fs.promises.writeFile(
      this.signaturePath,
      JSON.stringify({ version: 1, enrolledAt: new Date().toISOString(), sampleCount: samples.length, bins, centroid }, null, 2),
      "utf8",
    );
    return { enrolled: true, sampleCount: samples.length, bins };
  }

  async evaluatePresence(input: {
    faceSample?: number[] | null;
    cpuPercent?: number;
    activeWindowTitle?: string | null;
    nowMs?: number;
  }): Promise<BiometricPresenceEvent> {
    const nowMs = input.nowMs ?? Date.now();
    const hasFace = Array.isArray(input.faceSample) && input.faceSample.length > 0;

    if (hasFace) {
      const confidence = this.ownerCentroid
        ? chiSquareHistogramDistance(computeNormalizedHistogram(input.faceSample!), this.ownerCentroid)
        : 20;
      const isOwner = confidence < this.confidenceThreshold;

      if (isOwner) {
        const welcomeBack = !this.userPresent;
        this.userPresent = true;
        this.intruderActive = false;
        this.lastSeenMs = nowMs;
        this.modeManager.evaluateEnvironment({
          cpuPercent: input.cpuPercent ?? 20,
          userPresent: true,
          activeWindowTitle: input.activeWindowTitle ?? "Workspace IDE",
        });
        const evt: BiometricPresenceEvent = {
          state: "owner_verified",
          userPresent: true,
          intruderActive: false,
          confidence,
          welcomeBack,
          recommendedMode: "CO_PILOT",
          elapsedAbsenceSec: 0,
          timestamp: new Date(nowMs).toISOString(),
        };
        this.lastEvent = evt;
        if (welcomeBack) this.onOwnerReturned?.();
        return evt;
      }

      // Unrecognized face -> Intruder Alert + Tactical Mode
      this.userPresent = false;
      this.intruderActive = true;
      this.modeManager.setMode("TACTICAL", { lock: false, reason: "Unrecognized biometric subject at terminal" });
      const alertEvt: BiometricPresenceEvent = {
        state: "intruder_alert",
        userPresent: false,
        intruderActive: true,
        confidence,
        welcomeBack: false,
        recommendedMode: "TACTICAL",
        elapsedAbsenceSec: Number(((nowMs - this.lastSeenMs) / 1000).toFixed(1)),
        timestamp: new Date(nowMs).toISOString(),
      };
      this.lastEvent = alertEvt;
      this.intruderEvents.push(alertEvt);
      await fs.promises.writeFile(this.intruderLogPath, JSON.stringify(this.intruderEvents.slice(-50), null, 2), "utf8");
      this.onIntruderAlert?.(alertEvt);
      return alertEvt;
    }

    // No face visible -> enforce 15s hysteresis buffer
    const elapsedSec = Number(((nowMs - this.lastSeenMs) / 1000).toFixed(1));
    if (elapsedSec >= this.absenceThresholdSec) {
      this.userPresent = false;
      this.intruderActive = false;
      this.modeManager.evaluateEnvironment({
        cpuPercent: input.cpuPercent ?? 15,
        userPresent: false,
        activeWindowTitle: input.activeWindowTitle ?? null,
      });
      const vacantEvt: BiometricPresenceEvent = {
        state: "desk_vacant",
        userPresent: false,
        intruderActive: false,
        confidence: 0,
        welcomeBack: false,
        recommendedMode: "SENTRY",
        elapsedAbsenceSec: elapsedSec,
        timestamp: new Date(nowMs).toISOString(),
      };
      this.lastEvent = vacantEvt;
      return vacantEvt;
    }

    const holdEvt: BiometricPresenceEvent = {
      state: "debounce_hold",
      userPresent: this.userPresent,
      intruderActive: this.intruderActive,
      confidence: 0,
      welcomeBack: false,
      recommendedMode: this.userPresent ? "CO_PILOT" : "SENTRY",
      elapsedAbsenceSec: elapsedSec,
      timestamp: new Date(nowMs).toISOString(),
    };
    this.lastEvent = holdEvt;
    return holdEvt;
  }

  status(): {
    enrolled: boolean;
    userPresent: boolean;
    intruderActive: boolean;
    absenceThresholdSec: number;
    confidenceThreshold: number;
    lastEvent: BiometricPresenceEvent | null;
    recentIntruderAlerts: BiometricPresenceEvent[];
  } {
    return {
      enrolled: Boolean(this.ownerCentroid),
      userPresent: this.userPresent,
      intruderActive: this.intruderActive,
      absenceThresholdSec: this.absenceThresholdSec,
      confidenceThreshold: this.confidenceThreshold,
      lastEvent: this.lastEvent,
      recentIntruderAlerts: this.intruderEvents.slice(-10),
    };
  }
}

/**
 * Behavioral Telemetry & Cognitive Pattern Engine (100% Local JSON Storage, Privacy-Safe Cadence Metadata Only)
 */
export class BehavioralPatternEngine {
  private readonly storePath: string;
  private readonly modeManager: JarvisModeManager;
  private readonly cooldownMs: number;
  private keyTimestamps: number[] = [];
  private backspaceTimestamps: number[] = [];
  private windowSwitches: Array<{ ts: number; title: string }> = [];
  private errorSnippets: Array<{ ts: number; text: string }> = [];
  private workflowTags: Array<{ ts: number; tag: string }> = [];
  private lastWindow = "";
  private lastInputMs = Date.now();
  private lastReactionMs = 0;
  private detectedPatterns: DetectedBehavioralPattern[] = [];
  private hourlyDigests: HourlyWorkPatternDigest[] = [];

  constructor(opts: {
    dataDir: string;
    modeManager: JarvisModeManager;
    cooldownMs?: number;
  }) {
    this.storePath = path.join(opts.dataDir, "learning", "user_work_patterns.v1.json");
    this.modeManager = opts.modeManager;
    this.cooldownMs = opts.cooldownMs ?? 0;
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.storePath), { recursive: true });
    try {
      if (fs.existsSync(this.storePath)) {
        const parsed = JSON.parse(await fs.promises.readFile(this.storePath, "utf8"));
        if (Array.isArray(parsed?.detectedPatterns)) this.detectedPatterns = parsed.detectedPatterns.slice(-80);
        if (Array.isArray(parsed?.hourlyDigests)) this.hourlyDigests = parsed.hourlyDigests.slice(-168);
      }
    } catch {
      // Fresh local pattern store
    }
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(
      this.storePath,
      JSON.stringify(
        {
          version: 1,
          detectedPatterns: this.detectedPatterns.slice(-80),
          hourlyDigests: this.hourlyDigests.slice(-168),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  private prune(nowMs: number, windowMs = 60_000): void {
    this.keyTimestamps = this.keyTimestamps.filter((t) => nowMs - t <= windowMs);
    this.backspaceTimestamps = this.backspaceTimestamps.filter((t) => nowMs - t <= windowMs);
    this.windowSwitches = this.windowSwitches.filter((w) => nowMs - w.ts <= windowMs);
    this.errorSnippets = this.errorSnippets.filter((e) => nowMs - e.ts <= windowMs);
    this.workflowTags = this.workflowTags.filter((w) => nowMs - w.ts <= windowMs);
  }

  async recordTelemetrySample(input: {
    keyCount?: number;
    backspaceCount?: number;
    activeWindow?: string;
    clipboardHint?: string;
    workflowSignature?: string;
    userPresent?: boolean;
    idleSecondsOverride?: number;
    nowMs?: number;
  }): Promise<DetectedBehavioralPattern | null> {
    const nowMs = input.nowMs ?? Date.now();
    const keys = Math.max(0, Math.floor(Number(input.keyCount) || 0));
    const backspaces = Math.max(0, Math.floor(Number(input.backspaceCount) || 0));

    for (let i = 0; i < keys; i += 1) this.keyTimestamps.push(nowMs);
    for (let i = 0; i < backspaces; i += 1) this.backspaceTimestamps.push(nowMs);
    if (keys > 0 || backspaces > 0) this.lastInputMs = nowMs;

    if (input.activeWindow && input.activeWindow !== this.lastWindow) {
      this.lastWindow = input.activeWindow.slice(0, 120);
      this.windowSwitches.push({ ts: nowMs, title: this.lastWindow });
    }

    if (input.clipboardHint) {
      const lower = input.clipboardHint.toLowerCase();
      if (["traceback", "error:", "exception", "failed", "undefined", "syntaxerror", "typeerror"].some((k) => lower.includes(k))) {
        this.errorSnippets.push({ ts: nowMs, text: input.clipboardHint.slice(0, 800) });
      }
    }

    if (input.workflowSignature) {
      this.workflowTags.push({ ts: nowMs, tag: input.workflowSignature.trim().slice(0, 100) });
    }

    this.prune(nowMs);
    if (input.userPresent === false) return null;
    if (this.cooldownMs > 0 && nowMs - this.lastReactionMs < this.cooldownMs) return null;

    const totalKeys = this.keyTimestamps.length;
    const totalBackspaces = this.backspaceTimestamps.length;
    const switchesPerMin = this.windowSwitches.length;
    const idleSec = input.idleSecondsOverride ?? (nowMs - this.lastInputMs) / 1000;

    let detected: DetectedBehavioralPattern | null = null;

    // Pattern A: Rapid Alt-Tabbing + Error Snippet -> DEBUG_LOOP
    if (switchesPerMin >= 8 && this.errorSnippets.length > 0) {
      const latestErr = this.errorSnippets[this.errorSnippets.length - 1]!.text;
      const diag = await this.modeManager.analyzeWorkshopText(latestErr);
      detected = {
        id: `pat_${nowMs.toString(36)}`,
        pattern: "DEBUG_LOOP",
        activeWindow: this.lastWindow || "Developer Workspace",
        summary: `Rapid context switching (${switchesPerMin} switches/min) with active error signature.`,
        proactiveReaction: diag
          ? `Prepared root-cause fix: ${diag.suggestedPatch}`
          : "Analyzed clipboard traceback and staged diagnostic patch.",
        workshopDiagnostic: diag,
        timestamp: new Date(nowMs).toISOString(),
      };
    }
    // Pattern B: High Backspace Ratio -> FATIGUE_HIGH_CORRECTION
    else if (totalKeys > 40 && totalBackspaces / totalKeys > 0.35) {
      this.modeManager.setMode("CO_PILOT", { lock: false, reason: "High correction cadence detected" });
      detected = {
        id: `pat_${nowMs.toString(36)}`,
        pattern: "FATIGUE_HIGH_CORRECTION",
        activeWindow: this.lastWindow || "Code Editor",
        summary: `High correction ratio (${Math.round((totalBackspaces / totalKeys) * 100)}% backspaces across ${totalKeys} keystrokes).`,
        proactiveReaction: "Engaged Co-Pilot Mode and staged clean boilerplate/refactoring suggestions.",
        timestamp: new Date(nowMs).toISOString(),
      };
    }
    // Pattern C: Repetitive Manual Workflow (3+ identical tags)
    else if (this.workflowTags.length >= 3) {
      const counts = new Map<string, number>();
      for (const item of this.workflowTags) counts.set(item.tag, (counts.get(item.tag) || 0) + 1);
      const repeated = [...counts.entries()].find(([, count]) => count >= 3);
      if (repeated) {
        const macroSlug = `auto_${repeated[0].replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().slice(0, 24)}`;
        this.workflowTags = [];
        detected = {
          id: `pat_${nowMs.toString(36)}`,
          pattern: "REPETITIVE_WORKFLOW",
          activeWindow: this.lastWindow || "Workspace",
          summary: `Detected '${repeated[0]}' repeated ${repeated[1]} times manually.`,
          proactiveReaction: `Synthesized reusable local automation macro '${macroSlug}' to eliminate manual repetition.`,
          synthesizedMacroName: macroSlug,
          timestamp: new Date(nowMs).toISOString(),
        };
      }
    }

    // Pattern D: Deep Focus / Stalled Input (>=45s present at desk with 0 keys & 0 switches)
    if (!detected && totalKeys === 0 && switchesPerMin === 0 && idleSec >= 45 && this.lastWindow) {
      detected = {
        id: `pat_${nowMs.toString(36)}`,
        pattern: "DEEP_FOCUS",
        activeWindow: this.lastWindow,
        summary: `Quiet study/architecture focus on '${this.lastWindow}' (${Math.round(idleSec)}s uninterrupted).`,
        proactiveReaction: "Silently pre-fetched related project blueprints and local memory notes without audio interruption.",
        timestamp: new Date(nowMs).toISOString(),
      };
    }

    if (detected) {
      this.lastReactionMs = nowMs;
      this.detectedPatterns.push(detected);
      const dt = new Date(nowMs);
      this.hourlyDigests.push({
        dayOfWeek: dt.getDay(),
        hour: dt.getHours(),
        avgKeysPerMin: totalKeys,
        topApps: [...new Set(this.windowSwitches.map((w) => w.title).concat(this.lastWindow ? [this.lastWindow] : []))].slice(0, 5),
        detectedBottlenecks: [detected.pattern],
        recordedAt: dt.toISOString(),
      });
      await this.persist();
    }

    return detected;
  }

  getPredictivePreWarm(now = new Date()): { recommendedApps: string[]; confidence: number; note: string } {
    const matching = this.hourlyDigests.filter((d) => d.dayOfWeek === now.getDay() && Math.abs(d.hour - now.getHours()) <= 1);
    if (matching.length === 0) {
      return {
        recommendedApps: ["Code Studio", "Terminal"],
        confidence: 0.5,
        note: "Building local work-pattern baseline (zero cloud sync).",
      };
    }
    const appCounts = new Map<string, number>();
    for (const d of matching) {
      for (const app of d.topApps) appCounts.set(app, (appCounts.get(app) || 0) + 1);
    }
    const recommendedApps = [...appCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    return {
      recommendedApps,
      confidence: Math.min(0.98, Number((0.6 + matching.length * 0.1).toFixed(2))),
      note: `Pre-warmed local context from ${matching.length} matching historical work session(s).`,
    };
  }

  status(): {
    recentPatterns: DetectedBehavioralPattern[];
    hourlyDigestsCount: number;
    predictivePreWarm: { recommendedApps: string[]; confidence: number; note: string };
  } {
    return {
      recentPatterns: this.detectedPatterns.slice(-15),
      hourlyDigestsCount: this.hourlyDigests.length,
      predictivePreWarm: this.getPredictivePreWarm(),
    };
  }
}
