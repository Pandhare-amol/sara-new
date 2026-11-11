/**
 * MYRAA — Screen Vision pipeline.
 *
 * Wires together:
 *   1. Screen capture (delegated to the Python desktop agent's `viewScreen` /
 *      `takeScreenshot` tools — never re-implements PIL capture in Node).
 *   2. A small intent detector (regex) that recognises explicit user
 *      "look at my screen" requests in both typed and transcribed voice input.
 *   3. An injector that pushes the captured JPEG into the active Gemini Live
 *      session as a `realtimeInput` video frame so the multimodal model
 *      actually sees the screen before answering.
 *   4. A short-lived cache of the most recent capture so follow-up questions
 *      ("what should I click next?") can reuse the same visual context.
 *
 * This module is intentionally side-effect free at import time. Callers
 * register the live session and the agent call function; everything else
 * is pure helpers.
 */

import { createHash } from "node:crypto";

/* ---------------------------------------------------------------------------
 * Intent detection
 * ------------------------------------------------------------------------- */

/**
 * Phrases the user might use to ask MYRAA to look at / describe their screen.
 * Kept conservative on purpose — we only auto-capture when the intent is
 * explicit. Generic chat ("how is the weather") must never trigger a
 * screenshot.
 */
const SCREEN_INTENT_PATTERNS: RegExp[] = [
  /^\s*(?:myraa[,\s]+)?(?:what(?:'s| is) this|what error is this|read this|explain this|look at this|can you see this)\s*[?.!]*\s*$/i,
  /\b(look|see|watch|show)\b[^.?!]{0,40}\b(screen|desktop|display|monitor)\b/i,
  /\bwhat(?:'s| is)\b[^.?!]{0,30}\bon my screen\b/i,
  /\bwhat(?:'s| is)\b[^.?!]{0,30}\b(showing|visible|on display|open)\b/i,
  /\bwhat\s+(?:error|warning|message|popup|dialog)\b[^.?!]{0,30}\b(screen|showing|visible)\b/i,
  /\bread\b[^.?!]{0,30}\b(screen|visible|on my (?:screen|monitor))\b/i,
  /\b(explain|describe|analy[sz]e|summari[sz]e|inspect)\b[^.?!]{0,30}\b(this|what(?:'s| is)?|the)\b[^.?!]{0,30}\b(screen|window|page|app|application|code|error|dialog|popup|message|warning|video|thumbnail|design|image|screenshot)\b/i,
  /\bwhat\s+am\s+i\s+looking\s+at\b/i,
  /\bwhat(?:'s| is)\s+happening\b[^.?!]{0,20}\b(on (?:my )?screen|here)\b/i,
  /\bcan\s+you\s+see\s+(?:this|that|my screen|the screen|it)\b/i,
  /\bhelp\s+me\s+with\s+what(?:'s| is)?\s+open\b/i,
  /\b(explain|describe|analy[sz]e|read)\b[^.?!]{0,40}\bwhat\s+i\s+(?:have|have got|got)\s+open(?:ed)?\b/i,
  /\bwhat\s+should\s+i\s+(?:do|click|tap|press|type)\b[^.?!]{0,40}\b(next|here|now)\b/i,
  /\b(screen vision|screen share|share screen|view my screen|capture my screen|take a look)\b/i,
];

/** Returns true when the text expresses an explicit "look at my screen" intent. */
export function detectScreenVisionIntent(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 4 || trimmed.length > 600) return false;
  return SCREEN_INTENT_PATTERNS.some((re) => re.test(trimmed));
}

/* ---------------------------------------------------------------------------
 * Result shape returned by the Python agent's viewScreen / takeScreenshot
 * ------------------------------------------------------------------------- */

export interface ScreenVisionFrame {
  ok: boolean;
  /** Base64-encoded JPEG, no data-URL prefix. */
  imageBase64: string;
  /** Mime type, always "image/jpeg" for viewScreen. */
  mimeType: string;
  width: number;
  height: number;
  activeWindow?: string | null;
  source: "viewScreen" | "takeScreenshot";
  capturedAt: number;
  /** Optional path to the temp file on disk (for debugging). */
  tempPath?: string;
}

/* ---------------------------------------------------------------------------
 * Session-bound helper
 * ------------------------------------------------------------------------- */

export interface ScreenVisionDeps {
  /** Call the Python desktop agent. Should return { ok, result, error }. */
  callAgent: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
  /** Push an image into the Gemini Live session as a video frame. */
  pushFrameToSession: (frame: { data: string; mimeType: string }) => void;
  /** Optional logger (commands.log). */
  log?: (line: string) => void;
  /** Optional callback so the UI can show a brief "viewing your screen…" indicator. */
  onStateChange?: (state: "idle" | "capturing" | "ready" | "error", info?: { error?: string; activeWindow?: string | null }) => void;
}

export interface ScreenVisionMetrics {
  captured: number;
  injected: number;
  duplicateFrames: number;
  failed: number;
  droppedWhileBusy: number;
  lastCaptureAt: number | null;
  lastInjectionAt: number | null;
  lastCaptureLatencyMs: number | null;
}

const DEFAULT_PRIVACY_WINDOW_PATTERNS = [/password/i, /sign[ -]?in/i, /log[ -]?in/i, /payment/i, /checkout/i, /bank/i, /credit.?card/i, /security code/i];

export function isPrivacySensitiveWindow(title: string | null | undefined, extraPatterns: RegExp[] = []): boolean {
  const value = String(title || "").trim();
  if (!value) return false;
  return [...DEFAULT_PRIVACY_WINDOW_PATTERNS, ...extraPatterns].some((pattern) => pattern.test(value));
}

const RECENT_FRAME_TTL_MS = 90_000; // follow-up questions reuse the capture for ~90s
const DEFAULT_CAPTURE_MAX_DIM = 1440;
const DUPLICATE_INJECTION_WINDOW_MS = 1_500;

export class ScreenVisionPipeline {
  private lastFrame: ScreenVisionFrame | null = null;
  private recentFrameTimer: ReturnType<typeof setTimeout> | null = null;
  private captureInFlight: Promise<ScreenVisionFrame | null> | null = null;
  private lastInjectedFingerprint: string | null = null;
  private lastInjectedAt = 0;
  private readonly metrics: ScreenVisionMetrics = {
    captured: 0, injected: 0, duplicateFrames: 0, failed: 0,
    droppedWhileBusy: 0, lastCaptureAt: null, lastInjectionAt: null,
    lastCaptureLatencyMs: null,
  };

  constructor(private readonly deps: ScreenVisionDeps) {}

  private log(line: string): void {
    // Never include screenshot bytes, OCR text, or window titles in logs.
    console.log(`[ScreenVision] ${line}`);
    try { this.deps.log?.(line); } catch { /* best-effort */ }
  }

  private rememberFrame(frame: ScreenVisionFrame): void {
    this.lastFrame = frame;
    if (this.recentFrameTimer) clearTimeout(this.recentFrameTimer);
    this.recentFrameTimer = setTimeout(() => {
      if (this.lastFrame === frame) this.lastFrame = null;
      this.recentFrameTimer = null;
    }, RECENT_FRAME_TTL_MS);
    this.recentFrameTimer.unref?.();
  }

  /**
   * Returns the most recent successful capture if it is still within the
   * short-lived cache window, otherwise null. Lets follow-up questions
   * reuse a fresh screen context without re-capturing.
   */
  getRecentFrame(): ScreenVisionFrame | null {
    if (!this.lastFrame) return null;
    if (Date.now() - this.lastFrame.capturedAt > RECENT_FRAME_TTL_MS) {
      this.lastFrame = null;
      return null;
    }
    return this.lastFrame;
  }

  getMetrics(): ScreenVisionMetrics { return { ...this.metrics }; }

  /** Immediately discard cached visual context (used when a live session ends). */
  dispose(): void {
    if (this.recentFrameTimer) clearTimeout(this.recentFrameTimer);
    this.recentFrameTimer = null;
    this.lastFrame = null;
    this.lastInjectedFingerprint = null;
    this.lastInjectedAt = 0;
  }

  /**
   * Capture a one-shot frame without choosing how it is sent to Gemini.
   * Typed requests use this so the image and question can be placed in one
   * ordered multimodal `sendClientContent` turn. Concurrent callers share the
   * same in-flight capture instead of taking duplicate screenshots.
   */
  async capture(
    reason: "intent" | "tool" | "manual" = "intent",
    maxDim = DEFAULT_CAPTURE_MAX_DIM,
  ): Promise<ScreenVisionFrame | null> {
    if (this.captureInFlight) {
      this.metrics.droppedWhileBusy += 1;
      this.log("Capture already in progress; reusing the pending frame.");
      return this.captureInFlight;
    }

    const boundedMaxDim = Math.max(320, Math.min(1920, Math.round(maxDim) || DEFAULT_CAPTURE_MAX_DIM));
    this.captureInFlight = this.captureInternal(reason, boundedMaxDim);
    try {
      return await this.captureInFlight;
    } finally {
      this.captureInFlight = null;
    }
  }

  private async captureInternal(
    reason: "intent" | "tool" | "manual",
    maxDim: number,
  ): Promise<ScreenVisionFrame | null> {
    const startedAt = Date.now();
    this.deps.onStateChange?.("capturing");
    this.log(`Screen request detected (reason=${reason}).`);
    this.log("Capturing display.");

    try {
      const result = await this.deps.callAgent("viewScreen", {
        max_dim: maxDim,
        keep_file: false,
        cleanup: true,
      });
      if (result.ok && result.result) {
        const frame = this.processAgentResult(result.result as Record<string, unknown>, "viewScreen");
        if (frame) return this.recordCapture(frame, startedAt);
      }

      this.log(`viewScreen failed (${result.error || "invalid image payload"}); falling back to takeScreenshot.`);
      const fallback = await this.deps.callAgent("takeScreenshot", {
        include_image: true,
        max_dim: maxDim,
      });
      if (!fallback.ok || !fallback.result) {
        const error = fallback.error || result.error || "Desktop agent did not return a frame.";
        this.reportError(`Capture failed: ${error}`);
        return null;
      }
      const frame = this.processAgentResult(fallback.result as Record<string, unknown>, "takeScreenshot");
      if (!frame) this.reportError("Capture failed: no image bytes were returned.");
      return frame ? this.recordCapture(frame, startedAt) : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.reportError(`Capture failed: ${message}`);
      this.metrics.failed += 1;
      return null;
    }
  }

  /**
   * Capture the screen and inject it into the live session as visual
   * context. Safe to call when the agent is offline — the error is reported
   * back through the optional onStateChange callback and never thrown.
   */
  async captureAndInject(
    reason: "intent" | "tool" | "manual" = "intent",
    maxDim = DEFAULT_CAPTURE_MAX_DIM,
  ): Promise<ScreenVisionFrame | null> {
    const frame = await this.capture(reason, maxDim);
    if (frame) this.injectFrame(frame);
    return frame;
  }

  /** Push a captured frame through the realtime-video compatibility path. */
  injectFrame(frame: ScreenVisionFrame): boolean {
    if (isPrivacySensitiveWindow(frame.activeWindow, this.privacyPatterns())) {
      this.log("Skipped cloud vision upload for a privacy-sensitive window.");
      return false;
    }
    // Continuous capture can produce identical JPEGs when the desktop is
    // unchanged. Do not spend network/model quota sending the same frame over
    // and over, while allowing a later frame through for a fresh question.
    const fingerprint = createHash("sha256").update(frame.imageBase64).digest("hex");
    const now = Date.now();
    if (
      fingerprint === this.lastInjectedFingerprint
      && now - this.lastInjectedAt < DUPLICATE_INJECTION_WINDOW_MS
    ) {
      this.metrics.duplicateFrames += 1;
      this.log("Skipped duplicate unchanged frame.");
      return true;
    }
    this.log("Sending image to vision model.");
    try {
      this.deps.pushFrameToSession({ data: frame.imageBase64, mimeType: frame.mimeType });
      this.lastInjectedFingerprint = fingerprint;
      this.lastInjectedAt = now;
      this.metrics.injected += 1;
      this.metrics.lastInjectionAt = now;
      this.markFrameDelivered(frame);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.reportError(`Vision session rejected the image: ${message}`);
      return false;
    }
  }

  private recordCapture(frame: ScreenVisionFrame, startedAt: number): ScreenVisionFrame {
    this.metrics.captured += 1;
    this.metrics.lastCaptureAt = frame.capturedAt;
    this.metrics.lastCaptureLatencyMs = Math.max(0, frame.capturedAt - startedAt);
    return frame;
  }

  private privacyPatterns(): RegExp[] {
    const configured = process.env.MYRAA_SCREEN_PRIVACY_PATTERNS || "";
    return configured.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
      try { return new RegExp(item, "i"); } catch { return /$a/; }
    });
  }

  /** Mark delivery after a caller sends image + question in one ordered turn. */
  markFrameDelivered(frame: ScreenVisionFrame): void {
    this.log("Image delivered to vision model.");
    this.deps.onStateChange?.("ready", { activeWindow: frame.activeWindow });
  }

  /** Surface a screen-vision error through the existing UI/error channel. */
  reportError(message: string): void {
    this.log(message);
    this.deps.onStateChange?.("error", { error: message });
  }

  private processAgentResult(
    payload: Record<string, unknown>,
    source: ScreenVisionFrame["source"],
  ): ScreenVisionFrame | null {
    const ok = payload.ok !== false;
    if (!ok) {
      const err = typeof payload.error === "string" ? payload.error : "Capture returned an error.";
      this.log(`Capture returned not-ok: ${err}`);
      return null;
    }
    const imageBase64 = typeof payload.image_base64 === "string" ? payload.image_base64 : "";
    if (!imageBase64) {
      const err = typeof payload.error === "string" ? payload.error : "No image bytes in agent response.";
      this.log(`Capture returned no image bytes: ${err}`);
      return null;
    }
    const width = Number(payload.width) || 0;
    const height = Number(payload.height) || 0;
    const activeWindow = typeof payload.active_window === "string" ? payload.active_window : null;
    const tempPath = typeof payload.temp_path === "string" ? payload.temp_path : undefined;
    const frame: ScreenVisionFrame = {
      ok: true,
      imageBase64,
      mimeType: "image/jpeg",
      width,
      height,
      activeWindow,
      source,
      capturedAt: Date.now(),
      tempPath,
    };
    this.rememberFrame(frame);
    this.log(`Capture complete (${width}x${height}, source=${source}).`);
    return frame;
  }
}
