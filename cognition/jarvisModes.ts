/**
 * Contextual 5-Mode J.A.R.V.I.S. State Machine & Proactive Workshop Co-Pilot.
 *
 * Dynamically adapts SARA's working posture, Gemini generation temperature,
 * notification etiquette, resource allocation (low-VRAM friendly), proactive
 * IDE traceback diagnostics, return-to-desk welcome briefings, and voice
 * barge-in interruption without touching SARA's UI or adding Ollama.
 */

import type { ModelRouter } from "../models/router";
import { appEvents } from "../shared/appEvents";

export type JarvisWorkingMode =
  | "SENTRY"
  | "CO_PILOT"
  | "ASI_AUTONOMOUS"
  | "TACTICAL"
  | "GHOST";

export interface ModeDirective {
  mode: JarvisWorkingMode;
  label: string;
  promptDirective: string;
  temperature: number;
  allowProactiveSpeech: boolean;
  allowBackgroundLearning: boolean;
  visionCadenceMs: number | null;
  resourceProfile: "minimal_idle" | "ide_copilot" | "deep_workflow" | "rapid_stabilize" | "silent_background";
}

export interface ModeTransitionRecord {
  from: JarvisWorkingMode;
  to: JarvisWorkingMode;
  reason: string;
  at: string;
}

export interface WorkshopDiagnostic {
  detectedErrorType: string;
  summary: string;
  suggestedPatch: string;
  analyzedAt: string;
}

const MODE_DIRECTIVES: Record<JarvisWorkingMode, ModeDirective> = {
  SENTRY: {
    mode: "SENTRY",
    label: "Sentry Watchdog (Idle / Away)",
    promptDirective:
      "You are SARA in SENTRY MODE. The owner is away from the desk. Keep CPU/RAM usage minimal, stay silent unless an urgent alert occurs, and prepare a concise welcome-back briefing when Boss returns.",
    temperature: 0.2,
    allowProactiveSpeech: false,
    allowBackgroundLearning: true,
    visionCadenceMs: null,
    resourceProfile: "minimal_idle",
  },
  CO_PILOT: {
    mode: "CO_PILOT",
    label: "J.A.R.V.I.S. Workshop Co-Pilot",
    promptDirective:
      "You are SARA in JARVIS CO-PILOT MODE. Boss is actively coding or working. Proactively diagnose compiler/traceback errors, verify constraints formally, support instant voice barge-in, and keep answers crisp and technical.",
    temperature: 0.45,
    allowProactiveSpeech: true,
    allowBackgroundLearning: false,
    visionCadenceMs: 4_000,
    resourceProfile: "ide_copilot",
  },
  ASI_AUTONOMOUS: {
    mode: "ASI_AUTONOMOUS",
    label: "Autonomous Deep Workflow Mode",
    promptDirective:
      "You are SARA in AUTONOMOUS WORKFLOW MODE. Execute multi-step objectives end-to-end using Plan-and-Solve, Formal Constraint verification, Lateral Strategy synthesis, and Episodic RL memory without asking routine confirmation.",
    temperature: 0.7,
    allowProactiveSpeech: true,
    allowBackgroundLearning: true,
    visionCadenceMs: 3_000,
    resourceProfile: "deep_workflow",
  },
  TACTICAL: {
    mode: "TACTICAL",
    label: "Tactical Resource & System Stabilization",
    promptDirective:
      "You are SARA in TACTICAL DIAGNOSTICS MODE. System CPU or RAM pressure is elevated. Prioritize fast deterministic diagnostics, safe allowlisted background process cleanup, and low-latency stability.",
    temperature: 0.1,
    allowProactiveSpeech: true,
    allowBackgroundLearning: false,
    visionCadenceMs: null,
    resourceProfile: "rapid_stabilize",
  },
  GHOST: {
    mode: "GHOST",
    label: "Ghost Quiet / Stealth Focus Mode",
    promptDirective:
      "You are SARA in QUIET GHOST MODE. Suppress proactive audio and non-critical popups while executing Boss's background tasks silently and cleanly.",
    temperature: 0.35,
    allowProactiveSpeech: false,
    allowBackgroundLearning: false,
    visionCadenceMs: null,
    resourceProfile: "silent_background",
  },
};

const IDE_WINDOW_HINTS = /\b(visual studio code|vs code|code\.exe|cursor|antigravity|windsurf|pycharm|intellij|webstorm|terminal|powershell|cmd\.exe|neovim|vim|studio)\b/i;
const ERROR_SNIPPET_PATTERN = /(Traceback \(most recent call last\)|SyntaxError:|TypeError:|ReferenceError:|error TS\d{3,5}:|UnhandledPromiseRejection|ModuleNotFoundError:|ImportError:|ENOENT:|EADDRINUSE)/i;

export class JarvisModeManager {
  private currentMode: JarvisWorkingMode = "CO_PILOT";
  private manualLock = false;
  private wasUserPresent = true;
  private transitions: ModeTransitionRecord[] = [];
  private lastDiagnostic: WorkshopDiagnostic | null = null;
  private lastAnalyzedSnippetHash = "";
  private bargeInCount = 0;

  constructor(
    private readonly deps: {
      router: ModelRouter;
      onWelcomeReturn?: () => void;
      onHighLoadTactical?: (cpuPercent: number, ramPercent: number) => void;
      interruptVoiceOutput?: () => number;
    },
  ) {}

  getMode(): JarvisWorkingMode {
    return this.currentMode;
  }

  isLocked(): boolean {
    return this.manualLock;
  }

  getDirectives(mode: JarvisWorkingMode = this.currentMode): ModeDirective {
    return MODE_DIRECTIVES[mode];
  }

  setMode(mode: JarvisWorkingMode, options?: { lock?: boolean; reason?: string }): ModeDirective {
    if (!MODE_DIRECTIVES[mode]) {
      throw new Error(`Unsupported JARVIS mode: ${mode}`);
    }
    const prev = this.currentMode;
    this.manualLock = options?.lock ?? true;
    if (prev !== mode) {
      this.currentMode = mode;
      this.recordTransition(prev, mode, options?.reason || "Manual mode switch");
    }
    return MODE_DIRECTIVES[this.currentMode];
  }

  unlockAutoSwitching(): ModeDirective {
    this.manualLock = false;
    return MODE_DIRECTIVES[this.currentMode];
  }

  /**
   * Evaluates live OS context (CPU/RAM load, user presence, active foreground
   * window) and transitions SARA across SENTRY, CO_PILOT, and TACTICAL modes
   * unless manually locked into ASI_AUTONOMOUS or GHOST.
   */
  evaluateEnvironment(context: {
    cpuPercent: number;
    ramPercent?: number;
    userPresent: boolean;
    activeWindowTitle?: string | null;
  }): { mode: JarvisWorkingMode; changed: boolean; directive: ModeDirective; welcomeBackTriggered: boolean } {
    const returnedFromAway = !this.wasUserPresent && context.userPresent;
    this.wasUserPresent = context.userPresent;

    if (this.manualLock) {
      return {
        mode: this.currentMode,
        changed: false,
        directive: MODE_DIRECTIVES[this.currentMode],
        welcomeBackTriggered: false,
      };
    }

    let nextMode: JarvisWorkingMode = this.currentMode;
    let reason = "Context steady";

    if (context.cpuPercent > 92 || (context.ramPercent ?? 0) > 94) {
      nextMode = "TACTICAL";
      reason = `High resource pressure (CPU ${context.cpuPercent}%, RAM ${context.ramPercent ?? 0}%)`;
    } else if (!context.userPresent) {
      nextMode = "SENTRY";
      reason = "Owner away / idle — conserving resources";
    } else if (context.activeWindowTitle && IDE_WINDOW_HINTS.test(context.activeWindowTitle)) {
      nextMode = "CO_PILOT";
      reason = `Developer workspace active (${context.activeWindowTitle.slice(0, 60)})`;
    } else if (this.currentMode === "SENTRY" && context.userPresent) {
      nextMode = "CO_PILOT";
      reason = "Owner returned to desk";
    }

    const changed = nextMode !== this.currentMode;
    if (changed) {
      const prev = this.currentMode;
      this.currentMode = nextMode;
      this.recordTransition(prev, nextMode, reason);
      if (nextMode === "TACTICAL") {
        this.deps.onHighLoadTactical?.(context.cpuPercent, context.ramPercent ?? 0);
      }
    }

    if (returnedFromAway) {
      this.deps.onWelcomeReturn?.();
    }

    return {
      mode: this.currentMode,
      changed,
      directive: MODE_DIRECTIVES[this.currentMode],
      welcomeBackTriggered: returnedFromAway,
    };
  }

  /**
   * Proactive Workshop Co-Pilot Interrupt:
   * Detects compiler/runtime tracebacks in copied or visible text and prepares
   * a root-cause summary + suggested fix via SARA's existing Gemini router.
   */
  async analyzeWorkshopText(text: string, signal?: AbortSignal): Promise<WorkshopDiagnostic | null> {
    const trimmed = text.trim();
    if (!trimmed || !ERROR_SNIPPET_PATTERN.test(trimmed)) return null;

    const match = trimmed.match(ERROR_SNIPPET_PATTERN);
    const detectedErrorType = match?.[1] || "RuntimeError";
    const key = `${detectedErrorType}:${trimmed.slice(0, 180)}`;
    if (key === this.lastAnalyzedSnippetHash && this.lastDiagnostic) {
      return this.lastDiagnostic;
    }
    this.lastAnalyzedSnippetHash = key;

    let summary = `Detected ${detectedErrorType} in active workshop snippet.`;
    let suggestedPatch = "Inspect the failing line in the stack trace and verify types/imports before re-running.";

    try {
      const res = await this.deps.router.generate(
        "coding",
        {
          purpose: "copilot.workshop_diagnostic",
          system:
            "You are SARA's J.A.R.V.I.S. Workshop Co-Pilot. Given an error or traceback, return strict JSON {\"summary\":\"1-sentence root cause\",\"suggestedPatch\":\"concise code fix or command\"}.",
          messages: [{ role: "user", parts: [{ type: "text", text: trimmed.slice(0, 3_000) }] }],
          responseSchema: {
            type: "object",
            required: ["summary", "suggestedPatch"],
            properties: {
              summary: { type: "string" },
              suggestedPatch: { type: "string" },
            },
          },
          temperature: 0.15,
          maxOutputTokens: 350,
        },
        { signal, role: "background", maxAttempts: 1 },
      );
      const parsed = (res.json ?? JSON.parse(res.text || "{}")) as { summary?: string; suggestedPatch?: string };
      if (parsed.summary) summary = parsed.summary;
      if (parsed.suggestedPatch) suggestedPatch = parsed.suggestedPatch;
    } catch {
      /* offline deterministic diagnostic fallback */
    }

    const diag: WorkshopDiagnostic = {
      detectedErrorType,
      summary,
      suggestedPatch,
      analyzedAt: new Date().toISOString(),
    };
    this.lastDiagnostic = diag;
    appEvents.publish("jarvis.status", { kind: "copilot.diagnostic", diagnostic: diag });
    return diag;
  }

  /**
   * Natural Ambient Barge-In: immediately interrupts ongoing SARA TTS/voice
   * playback when Boss begins speaking in Co-Pilot / interactive mode.
   */
  triggerBargeIn(): { interruptedSessions: number; totalBargeIns: number } {
    const count = this.deps.interruptVoiceOutput?.() ?? 0;
    this.bargeInCount += 1;
    appEvents.publish("jarvis.status", { kind: "voice.barge_in", interruptedSessions: count });
    return { interruptedSessions: count, totalBargeIns: this.bargeInCount };
  }

  private recordTransition(from: JarvisWorkingMode, to: JarvisWorkingMode, reason: string): void {
    const entry: ModeTransitionRecord = {
      from,
      to,
      reason,
      at: new Date().toISOString(),
    };
    this.transitions.unshift(entry);
    if (this.transitions.length > 40) this.transitions.length = 40;
    appEvents.publish("jarvis.status", {
      kind: "mode.changed",
      mode: to,
      directive: MODE_DIRECTIVES[to],
      reason,
    });
  }

  status() {
    return {
      currentMode: this.currentMode,
      manualLock: this.manualLock,
      directive: MODE_DIRECTIVES[this.currentMode],
      availableModes: Object.values(MODE_DIRECTIVES),
      recentTransitions: this.transitions.slice(0, 15),
      lastWorkshopDiagnostic: this.lastDiagnostic,
      bargeInCount: this.bargeInCount,
    };
  }
}
