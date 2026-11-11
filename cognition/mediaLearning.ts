import { randomUUID } from "node:crypto";

export interface MediaLearningDraft {
  id: string;
  locator: string;
  title: string;
  transcript: string;
  segments: Array<{ startSeconds: number | null; endSeconds: number | null; text: string }>;
  source: { kind: "web" | "local"; locator: string };
  createdAt: string;
  approved: boolean;
}

/** Validates user-supplied media metadata; it never downloads or executes media. */
export function prepareMediaLearning(input: { locator: string; title?: string; transcript: string }): MediaLearningDraft {
  const locator = String(input.locator || "").trim();
  const transcript = String(input.transcript || "").replace(/\u0000/g, "").trim().slice(0, 500_000);
  if (!locator || !transcript) throw new Error("A media locator and transcript are required.");
  let source: MediaLearningDraft["source"];
  if (/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(locator)) source = { kind: "web", locator };
  else if (/^[a-zA-Z]:[\\/]/.test(locator)) source = { kind: "local", locator };
  else throw new Error("Only HTTPS YouTube URLs or authorized local paths are supported.");
  return { id: randomUUID(), locator, title: String(input.title || "Untitled media").trim().slice(0, 300), transcript, segments: parseTranscriptSegments(transcript), source, createdAt: new Date().toISOString(), approved: false };
}

/** Normalize common WebVTT/SRT or `[mm:ss] text` captions without executing media. */
function parseTranscriptSegments(input: string): MediaLearningDraft["segments"] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const segments: MediaLearningDraft["segments"] = [];
  let pending: { startSeconds: number | null; endSeconds: number | null } | null = null;
  for (const line of lines) {
    if (/^(WEBVTT|NOTE|\d+)$/.test(line)) continue;
    const range = line.match(/(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{3})?/);
    if (range) {
      const parts = line.split(/\s*-->\s*/);
      pending = { startSeconds: parseTimestamp(parts[0]), endSeconds: parseTimestamp(parts[1]) };
      continue;
    }
    const inline = line.match(/^\[(\d{1,2}:)?\d{1,2}:\d{2}\]\s*(.+)$/);
    if (inline) {
      segments.push({ startSeconds: parseTimestamp(line.slice(1, line.indexOf("]"))), endSeconds: null, text: inline[2].slice(0, 4_000) });
      continue;
    }
    segments.push({ ...(pending || { startSeconds: null, endSeconds: null }), text: line.slice(0, 4_000) });
    pending = null;
  }
  return segments.slice(0, 10_000);
}

function parseTimestamp(value: string): number | null {
  const cleaned = value.trim().replace(",", ".");
  const parts = cleaned.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3_600 + parts[1] * 60 + parts[2];
  return null;
}
