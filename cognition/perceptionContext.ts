/** Local fusion layer for facts Sara has actually received from authorized inputs. */
export type PerceptionSource = "voice" | "desktop" | "screen" | "document" | "camera" | "sensor";

export interface PerceptionObservation {
  source: PerceptionSource;
  observedAt: string;
  expiresAt: string;
  confidence: number;
  available: boolean;
  facts: Record<string, unknown>;
  interpretations: Array<{ text: string; confidence: number }>;
}

export interface LiveDesktopState {
  activeWindow: { title: string | null; process: string | null; pid: number | null; bounds?: Record<string, number> | null };
  cursor: { x: number; y: number; monitor?: number | null } | null;
  uiElements: Array<{ id?: string; role?: string; name?: string; bounds?: Record<string, number>; enabled?: boolean; source?: string; confidence?: number }>;
  visibleText: Array<{ text: string; bounds?: Record<string, number>; confidence?: number; source?: string }>;
  source: "uia" | "ocr" | "vision" | "unknown";
  capturedAt: string;
  confidence: number;
}

export class PerceptionContext {
  private readonly observations = new Map<PerceptionSource, PerceptionObservation>();

  ingest(source: PerceptionSource, facts: Record<string, unknown>, options: { confidence?: number; available?: boolean; ttlMs?: number; interpretations?: Array<{ text: string; confidence: number }> } = {}): void {
    const now = Date.now();
    const ttlMs = Math.max(1_000, Math.min(options.ttlMs ?? 15_000, 24 * 60 * 60_000));
    this.observations.set(source, {
      source, observedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), confidence: clamp(options.confidence ?? 1), available: options.available ?? true,
      facts: structuredClone(facts),
      interpretations: (options.interpretations || []).map((item) => ({ text: String(item.text).slice(0, 1_000), confidence: clamp(item.confidence) })),
    });
  }

  markUnavailable(source: PerceptionSource): void { this.ingest(source, {}, { available: false, confidence: 0, ttlMs: 30_000 }); }

  /** Canonical live desktop observation consumed by planning and verification. */
  ingestDesktop(state: LiveDesktopState, options: { ttlMs?: number; confidence?: number } = {}): void {
    this.ingest("desktop", { state: structuredClone(state) }, {
      ttlMs: options.ttlMs ?? 5_000,
      confidence: options.confidence ?? state.confidence,
    });
  }

  snapshot(now = Date.now()): { generatedAt: string; observations: PerceptionObservation[] } {
    return { generatedAt: new Date(now).toISOString(), observations: [...this.observations.values()].filter((item) => Date.parse(item.expiresAt) > now).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).map((item) => structuredClone(item)) };
  }

  clear(source?: PerceptionSource): void { if (source) this.observations.delete(source); else this.observations.clear(); }
}

function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
