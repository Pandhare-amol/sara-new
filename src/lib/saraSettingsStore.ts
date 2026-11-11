/**
 * MYRAA Settings Store — persistent user preferences (V2).
 *
 * Establishes the persistence pattern for MYRAA: settings are mirrored to
 * localStorage (instant local read) AND synced to the backend (settings.json)
 * so auto-start / wake-word preferences survive across browsers and the
 * Python desktop agent can read them too.
 *
 * Pattern follows the existing codebase conventions: plain state + ref mirrors.
 * No Context/Zustand — this is deliberately lightweight to match audio.ts/memoryTypes.ts.
 */

export interface SaraSettings {
  /** Launch MYRAA (backends + browser tab) silently on Windows login. */
  autoStart: boolean;
  /** Enable the always-listening wake-word detector. */
  wakeWordEnabled: boolean;
  /** Phrase that activates MYRAA (case-insensitive substring match). */
  wakePhrase: string;
  /** Preferred microphone device id ("" = system default). */
  micDeviceId: string;
  /** Wake-word sensitivity: 0 (strict) .. 100 (loose). Affects debounce window. */
  sensitivity: number;
  /** Master toggle for UI animations. */
  animations: boolean;
  /** Reflected character highlight amount: 0 (matte) .. 100 (strong). */
  characterShine: number;
  /** Preferred main-window companion video appearance. */
  characterAppearance: "classic" | "spaceship-hologram";
}

export const DEFAULT_SETTINGS: SaraSettings = {
  autoStart: false,
  wakeWordEnabled: false,
  wakePhrase: "hey sara",
  micDeviceId: "",
  sensitivity: 60,
  animations: true,
  characterShine: 50,
  characterAppearance: "classic",
};

const STORAGE_KEY = "sara.settings.v1";
const LEGACY_STORAGE_KEY = "myraa.settings.v2";

/** Settings keys that the browser should never persist (security). */
const NEVER_PERSIST: ReadonlySet<keyof SaraSettings> = new Set([]);

/**
 * Load settings from localStorage, merged over defaults so new keys always
 * have a sane value even when an older payload is present.
 */
export function loadSettings(): SaraSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SaraSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (merged.wakePhrase.trim().toLowerCase() === "hey myraa") merged.wakePhrase = DEFAULT_SETTINGS.wakePhrase;
    const shine = Number(merged.characterShine);
    return {
      ...merged,
      characterShine: Number.isFinite(shine) ? Math.max(0, Math.min(100, shine)) : 50,
      characterAppearance: merged.characterAppearance === "spaceship-hologram" ? "spaceship-hologram" : "classic",
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist a full or partial settings update to localStorage.
 * Returns the fully merged settings object.
 */
export function saveSettings(patch: Partial<SaraSettings>): SaraSettings {
  const current = loadSettings();
  const next: SaraSettings = { ...current, ...patch };
  if (typeof window !== "undefined") {
    try {
      // Strip any sensitive keys before writing to localStorage.
      const safe: Record<string, unknown> = {};
      (Object.keys(next) as (keyof SaraSettings)[]).forEach((k) => {
        if (!NEVER_PERSIST.has(k)) safe[k] = next[k];
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      /* localStorage may be unavailable (private mode) — fail silently. */
    }
  }
  // Best-effort sync to backend so the Python agent can read auto-start state.
  void syncSettingsToBackend(next).catch(() => {});
  return next;
}

/** Push settings to the backend (server.ts persists to settings.json). */
async function syncSettingsToBackend(settings: SaraSettings): Promise<void> {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  } catch {
    /* Backend may be briefly unavailable during boot — non-fatal. */
  }
}
