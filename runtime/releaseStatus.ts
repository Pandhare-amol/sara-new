import fs from "node:fs/promises";
import path from "node:path";
export interface ReleaseStatus { currentVersion: string; channel: string; manifestUrl: string | null; updateAvailable: boolean; latestVersion: string | null; releaseUrl: string | null; checkedAt: string; error: string | null; }
export async function getReleaseStatus(projectRoot: string): Promise<ReleaseStatus> {
  const checkedAt = new Date().toISOString(); let currentVersion = "unknown";
  try { const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8")); currentVersion = String(pkg.version || currentVersion); } catch {}
  const manifestUrl = process.env.SARA_RELEASE_MANIFEST_URL?.trim() || process.env.MYRAA_RELEASE_MANIFEST_URL?.trim() || null;
  const out: ReleaseStatus = { currentVersion, channel: process.env.SARA_RELEASE_CHANNEL || "stable", manifestUrl, updateAvailable: false, latestVersion: null, releaseUrl: null, checkedAt, error: null };
  if (!manifestUrl) return out;
  try { const response = await fetch(manifestUrl, { signal: AbortSignal.timeout(5_000) }); if (!response.ok) throw new Error(`manifest HTTP ${response.status}`); const m = await response.json() as { version?: string; url?: string; channel?: string }; if (!m.version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(m.version)) throw new Error("invalid release manifest version"); out.channel = m.channel || out.channel; out.latestVersion = m.version; out.releaseUrl = m.url || null; out.updateAvailable = compare(m.version, currentVersion) > 0; } catch (error) { out.error = error instanceof Error ? error.message : String(error); }
  return out;
}
function compare(a: string, b: string): number { const x = a.split("-")[0].split(".").map(Number), y = b.split("-")[0].split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; }
