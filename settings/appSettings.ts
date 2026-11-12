/**
 * Server-side settings for the agent, presence, companion, character,
 * physics, privacy, performance and developer areas.
 *
 * Stored in `<data>/app-settings.v3.json`. The legacy `settings.json`
 * (auto-start, wake word, mic, shine) is left untouched because the Python
 * agent and the existing renderer already read it. Unknown keys are dropped,
 * values are clamped, and missing keys fall back to defaults, so older files
 * always load.
 */
import path from "node:path";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";

export interface AppSettings {
  version: 3;
  onboardingComplete: boolean;
  behavior: {
    proactivity: "quiet" | "balanced" | "lively";
    awayCheckin: boolean;
    returnGreeting: boolean;
    awayAfterMin: number;
    dndManual: boolean;
    autoDndFullscreen: boolean;
    autoDndMeetings: boolean;
    autoDndRecording: boolean;
  };
  autonomy: {
    maxSteps: number;
    conflictWaitSec: number;
    emergencyShortcut: string;
    assistantShortcut: string;
    showTaskHud: boolean;
    keepRunningInBackground: boolean;
  };
  /** JARVIS full-autonomy, multi-method fallback, surface preference, and SARA Security Shield controls. */
  jarvis: {
    /** Execute authorized tasks end-to-end without waiting on manual triggers. */
    autonomousMode: boolean;
    /** Auto-approve capability/tool confirmation gates when owner session is authorized. */
    zeroConfirmationPrompts: boolean;
    /** Proactively decompose, schedule, and advance background goals and routines. */
    proactiveJarvis: boolean;
    /** Automatically try secondary/tertiary execution methods when primary method fails. */
    multiMethodFallback: boolean;
    /** Automatically execute pending GoalManager missions without manual Start clicks. */
    autoExecuteGoals: boolean;
    /** Desktop UI surface mode ("companion" = classic SARA girl UI, "live_core" = JARVIS Core UI, "ultron" = Ultron UI, "vision" = V.I.S.I.O.N. Mind-Stone UI, "sara_os" = Spatial 2050 HUD, "central_os" = Windows 10 Live Wallpaper Central Operating Layer). */
    surfaceMode: "companion" | "live_core" | "ultron" | "vision" | "sara_os" | "central_os";
    /** Enable SARA's independent Security Shield for unauthorized-access protection. */
    shieldEnabled: boolean;
    /** Force owner PIN/passphrase enrollment before allowing any PC-control or chat actions. */
    requireEnrollmentBeforeUse: boolean;
    /** Manage SARA lock/unlock independently from Windows session lock events. */
    independentGuard: boolean;
    /** Speak or display JARVIS-style welcome briefing upon owner unlock. */
    welcomeOnUnlock: boolean;
    /** Instant lockdown shortcut. */
    lockdownShortcut: string;
  };
  /** Project ULTRON — Owner-loyal Perimeter Armor, Hive-Mind Legion Swarm & Self-Evolution Forge. */
  ultron: {
    /** Enable Ultron defensive sentinel, legion swarm, and self-evolution engine. */
    enabled: boolean;
    /** Active operational stance. */
    stance: "standby" | "armor" | "legion" | "evolution" | "omega_lockdown";
    /** Minutes between automatic background perimeter scans when stance !== standby. */
    patrolIntervalMin: number;
    /** Default number of parallel Ultron Sentries deployed per Legion directive (2–5). */
    maxLegionSentries: number;
    /** Automatically verify SHA-256 cryptographic file watchpoints during perimeter scans. */
    autoIntegrityGuard: boolean;
    /** Enable Vibranium Skill Forge & Agent-2 failure adaptation loops. */
    selfEvolutionEnabled: boolean;
  };
  /** Opt-in presentation and interaction preferences; safety remains enforced elsewhere. */
  humanLike: {
    observeVerifyActions: boolean;
    smoothMouseMovement: boolean;
    naturalTypingPauses: boolean;
    pauseOnUserInput: boolean;
    stuckActionLimit: number;
    conciseProgressUpdates: boolean;
  };
  voice: {
    voiceName: string;
    /** Delivery persona: J.A.R.V.I.S. tactical chief-of-staff, natural, or bright anime heroine. */
    style: "jarvis" | "natural" | "anime";
    /** Raise voice pitch by semitones (0 = native voice timbre). */
    pitch: number;
    bargeIn: boolean;
    speakTaskUpdates: "all" | "important" | "none";
  };
  companion: {
    enabled: boolean;
    setupComplete: boolean;
    scale: number;
    monitorId: string | null;
    position: { x: number; y: number } | null;
    anchor: { kind: "free" | "desktop" | "taskbar" | "window"; edge?: "top" | "bottom" | "left" | "right"; offset?: number; windowTitle?: string } | null;
    fullscreenBehavior: "hide" | "notifications_only" | "always" | "game_aware";
    clickThrough: boolean;
    interactionLevel: "minimal" | "normal" | "playful";
    walkAround: boolean;
    /** She may pull desktop icons around (always restorable). Off by default. */
    iconPlay: boolean;
    /** 0..1: outline and shadow that keep her readable on busy wallpapers. */
    standOut: number;
    /** She sometimes hides behind a screen edge and peeks back in. */
    hideAndPeek: boolean;
    /** Keep the companion as a passive desktop background layer below normal windows. */
    desktopLayer: boolean;
  };
  desktopHost: {
    enabled: boolean;
    monitorDevice: string;
  };
  character: {
    activeCharacterId: string;
    eyeFollowCursor: boolean;
    headFollowCursor: boolean;
    idleVariety: number;
  };
  graphics: {
    /** 0 = art-directed anime shading, 1 = physically based "realistic" shading. */
    realism: number;
    /** GPU budget: high, balanced (Medium), low (Optimized), potato. "auto" picks for the PC. */
    quality: "auto" | "potato" | "low" | "balanced" | "high";
    /** Levels Auto has stepped down after crashes on this PC (0..3). */
    autoStep: number;
  };
  physics: {
    enabled: boolean;
    quality: "low" | "balanced" | "high";
    secondaryMotion: number;
    gravityMultiplier: number;
    stiffness: number;
    damping: number;
    drag: number;
    collisionQuality: "off" | "low" | "high";
    wind: number;
    /** Vertex-level cloth on every garment (stays worn). */
    clothEnabled: boolean;
    /** 0..2: how far fabric may move away from the body. */
    clothLooseness: number;
  };
  privacy: {
    screenAwareness: boolean;
    screenAutoResume: boolean;
    cameraPresence: boolean;
    clipboardInContext: boolean;
  };
  security: {
    faceEnabled: boolean;
    voiceEnabled: boolean;
    idleTimeoutMin: number;
    absoluteTimeoutHours: number;
    lockOnWindowsLock: boolean;
  };
  performance: {
    activeFps: number;
    idleFps: number;
    sleepFps: number;
    perceptionPollSec: number;
  };
  developer: {
    debugView: boolean;
    physicsDebug: boolean;
    verboseLogs: boolean;
  };
  /** SARA / J.A.R.V.I.S. / ULTRON / V.I.S.I.O.N. / F.R.I.D.A.Y. multi-persona & separate voice state (all Avengers modes stay OFF until activated). */
  personas: {
    activeMode: "sara" | "jarvis" | "ultron" | "vision" | "friday";
    jarvisActive: boolean;
    ultronActive: boolean;
    visionActive: boolean;
    fridayActive: boolean;
    saraVoiceName: string;
    jarvisVoiceName: string;
    ultronVoiceName: string;
    visionVoiceName: string;
    fridayVoiceName: string;
  };
  /** Additive advanced modules. All are opt-in; existing core behavior is unchanged. */
  advancedFeatures: {
    adaptiveTone: boolean;
    skillAcquisition: boolean;
    predictiveSuggestions: boolean;
    deviceSync: boolean;
    secureVaultRecords: boolean;
    selfEvolutionProposals: boolean;
    immersiveAdapters: boolean;
  };
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 3,
  onboardingComplete: false,
  behavior: {
    proactivity: "balanced",
    awayCheckin: true,
    returnGreeting: true,
    awayAfterMin: 5,
    dndManual: false,
    autoDndFullscreen: true,
    autoDndMeetings: true,
    autoDndRecording: false,
  },
  autonomy: {
    maxSteps: 30,
    conflictWaitSec: 6,
    emergencyShortcut: "Control+Alt+Shift+S",
    assistantShortcut: "Control+Alt+Space",
    showTaskHud: true,
    keepRunningInBackground: false,
  },
  jarvis: {
    autonomousMode: true,
    zeroConfirmationPrompts: true,
    proactiveJarvis: true,
    multiMethodFallback: true,
    autoExecuteGoals: true,
    surfaceMode: "companion",
    shieldEnabled: true,
    requireEnrollmentBeforeUse: false,
    independentGuard: true,
    welcomeOnUnlock: true,
    lockdownShortcut: "Control+Alt+Shift+L",
  },
  ultron: {
    enabled: true,
    stance: "armor",
    patrolIntervalMin: 15,
    maxLegionSentries: 4,
    autoIntegrityGuard: true,
    selfEvolutionEnabled: true,
  },
  humanLike: {
    observeVerifyActions: true,
    smoothMouseMovement: true,
    naturalTypingPauses: false,
    pauseOnUserInput: true,
    stuckActionLimit: 3,
    conciseProgressUpdates: true,
  },
  voice: {
    voiceName: "Charon",
    style: "jarvis",
    pitch: 0,
    bargeIn: true,
    speakTaskUpdates: "important",
  },
  companion: {
    enabled: false,
    setupComplete: false,
    scale: 1,
    monitorId: null,
    position: null,
    anchor: { kind: "taskbar", edge: "top", offset: 0.85 },
    fullscreenBehavior: "game_aware",
    clickThrough: true,
    interactionLevel: "normal",
    walkAround: true,
    iconPlay: false,
    standOut: 0.7,
    hideAndPeek: true,
    desktopLayer: false,
  },
  desktopHost: {
    enabled: false,
    monitorDevice: "",
  },
  character: {
    activeCharacterId: "",
    eyeFollowCursor: true,
    headFollowCursor: true,
    idleVariety: 0.6,
  },
  graphics: {
    realism: 0.85,
    quality: "auto",
    autoStep: 0,
  },
  physics: {
    enabled: true,
    quality: "balanced",
    secondaryMotion: 100,
    gravityMultiplier: 1,
    stiffness: 1,
    damping: 1,
    drag: 1,
    collisionQuality: "low",
    wind: 0,
    clothEnabled: true,
    clothLooseness: 1,
  },
  privacy: {
    screenAwareness: true,
    screenAutoResume: false,
    cameraPresence: false,
    clipboardInContext: false,
  },
  security: { faceEnabled: false, voiceEnabled: false, idleTimeoutMin: 10, absoluteTimeoutHours: 8, lockOnWindowsLock: true },
  performance: {
    activeFps: 60,
    idleFps: 30,
    sleepFps: 10,
    perceptionPollSec: 4,
  },
  developer: {
    debugView: false,
    physicsDebug: false,
    verboseLogs: false,
  },
  personas: {
    activeMode: "sara",
    jarvisActive: false,
    ultronActive: false,
    visionActive: false,
    fridayActive: false,
    saraVoiceName: "Aoede",
    jarvisVoiceName: "Charon",
    ultronVoiceName: "Fenrir",
    visionVoiceName: "Orus",
    fridayVoiceName: "Kore",
  },
  advancedFeatures: {
    adaptiveTone: false,
    skillAcquisition: false,
    predictiveSuggestions: false,
    deviceSync: false,
    secureVaultRecords: false,
    selfEvolutionProposals: false,
    immersiveAdapters: false,
  },
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? value as T : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Merge a (possibly partial or stale) settings object over defaults, validating every field. */
export function normalizeSettings(input: unknown, base: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const d = base;
  const b = raw.behavior || {}, a = raw.autonomy || {}, j = raw.jarvis || {}, u = raw.ultron || {}, h = raw.humanLike || {}, v = raw.voice || {}, c = raw.companion || {}, dh = raw.desktopHost || {}, ch = raw.character || {}, p = raw.physics || {}, pr = raw.privacy || {}, sec = raw.security || {}, pe = raw.performance || {}, dev = raw.developer || {}, gr = raw.graphics || {}, per = raw.personas || {}, af = raw.advancedFeatures || {};
  return {
    version: 3,
    onboardingComplete: bool(raw.onboardingComplete, d.onboardingComplete),
    behavior: {
      proactivity: oneOf(b.proactivity, ["quiet", "balanced", "lively"] as const, d.behavior.proactivity),
      awayCheckin: bool(b.awayCheckin, d.behavior.awayCheckin),
      returnGreeting: bool(b.returnGreeting, d.behavior.returnGreeting),
      awayAfterMin: clamp(b.awayAfterMin, 2, 60, d.behavior.awayAfterMin),
      dndManual: bool(b.dndManual, d.behavior.dndManual),
      autoDndFullscreen: bool(b.autoDndFullscreen, d.behavior.autoDndFullscreen),
      autoDndMeetings: bool(b.autoDndMeetings, d.behavior.autoDndMeetings),
      autoDndRecording: bool(b.autoDndRecording, d.behavior.autoDndRecording),
    },
    autonomy: {
      maxSteps: clamp(a.maxSteps, 5, 120, d.autonomy.maxSteps),
      conflictWaitSec: clamp(a.conflictWaitSec, 1, 30, d.autonomy.conflictWaitSec),
      emergencyShortcut: typeof a.emergencyShortcut === "string" && /^[A-Za-z0-9+]{3,40}$/.test(a.emergencyShortcut) ? a.emergencyShortcut : d.autonomy.emergencyShortcut,
      assistantShortcut: typeof a.assistantShortcut === "string" && /^[A-Za-z0-9+]{3,40}$/.test(a.assistantShortcut) ? a.assistantShortcut : d.autonomy.assistantShortcut,
      showTaskHud: bool(a.showTaskHud, d.autonomy.showTaskHud),
      keepRunningInBackground: bool(a.keepRunningInBackground, d.autonomy.keepRunningInBackground),
    },
    jarvis: {
      autonomousMode: bool(j.autonomousMode, d.jarvis.autonomousMode),
      zeroConfirmationPrompts: bool(j.zeroConfirmationPrompts, d.jarvis.zeroConfirmationPrompts),
      proactiveJarvis: bool(j.proactiveJarvis, d.jarvis.proactiveJarvis),
      multiMethodFallback: bool(j.multiMethodFallback, d.jarvis.multiMethodFallback),
      autoExecuteGoals: bool(j.autoExecuteGoals, d.jarvis.autoExecuteGoals),
      surfaceMode: oneOf(j.surfaceMode, ["companion", "live_core", "ultron", "vision", "sara_os", "central_os"] as const, d.jarvis.surfaceMode),
      shieldEnabled: bool(j.shieldEnabled, d.jarvis.shieldEnabled),
      requireEnrollmentBeforeUse: bool(j.requireEnrollmentBeforeUse, d.jarvis.requireEnrollmentBeforeUse),
      independentGuard: bool(j.independentGuard, d.jarvis.independentGuard),
      welcomeOnUnlock: bool(j.welcomeOnUnlock, d.jarvis.welcomeOnUnlock),
      lockdownShortcut: typeof j.lockdownShortcut === "string" && /^[A-Za-z0-9+]{3,40}$/.test(j.lockdownShortcut) ? j.lockdownShortcut : d.jarvis.lockdownShortcut,
    },
    ultron: {
      enabled: bool(u.enabled, d.ultron.enabled),
      stance: oneOf(u.stance, ["standby", "armor", "legion", "evolution", "omega_lockdown"] as const, d.ultron.stance),
      patrolIntervalMin: Math.round(clamp(u.patrolIntervalMin, 1, 240, d.ultron.patrolIntervalMin)),
      maxLegionSentries: Math.round(clamp(u.maxLegionSentries, 2, 5, d.ultron.maxLegionSentries)),
      autoIntegrityGuard: bool(u.autoIntegrityGuard, d.ultron.autoIntegrityGuard),
      selfEvolutionEnabled: bool(u.selfEvolutionEnabled, d.ultron.selfEvolutionEnabled),
    },
    humanLike: {
      observeVerifyActions: bool(h.observeVerifyActions, d.humanLike.observeVerifyActions),
      smoothMouseMovement: bool(h.smoothMouseMovement, d.humanLike.smoothMouseMovement),
      naturalTypingPauses: bool(h.naturalTypingPauses, d.humanLike.naturalTypingPauses),
      pauseOnUserInput: bool(h.pauseOnUserInput, d.humanLike.pauseOnUserInput),
      stuckActionLimit: Math.round(clamp(h.stuckActionLimit, 2, 5, d.humanLike.stuckActionLimit)),
      conciseProgressUpdates: bool(h.conciseProgressUpdates, d.humanLike.conciseProgressUpdates),
    },
    voice: {
      voiceName: typeof v.voiceName === "string" && /^[A-Za-z]{2,24}$/.test(v.voiceName) ? v.voiceName : d.voice.voiceName,
      style: oneOf(v.style, ["jarvis", "natural", "anime"] as const, d.voice.style),
      pitch: clamp(v.pitch, 0, 5, d.voice.pitch),
      bargeIn: bool(v.bargeIn, d.voice.bargeIn),
      speakTaskUpdates: oneOf(v.speakTaskUpdates, ["all", "important", "none"] as const, d.voice.speakTaskUpdates),
    },
    companion: {
      enabled: bool(c.enabled, d.companion.enabled),
      setupComplete: bool(c.setupComplete, d.companion.setupComplete),
      scale: clamp(c.scale, 0.4, 2.5, d.companion.scale),
      monitorId: typeof c.monitorId === "string" ? c.monitorId : c.monitorId === null ? null : d.companion.monitorId,
      position: c.position && Number.isFinite(c.position.x) && Number.isFinite(c.position.y) ? { x: Math.round(c.position.x), y: Math.round(c.position.y) } : c.position === null ? null : d.companion.position,
      anchor: c.anchor && typeof c.anchor === "object" && ["free", "desktop", "taskbar", "window"].includes(c.anchor.kind)
        ? {
            kind: c.anchor.kind,
            edge: oneOf(c.anchor.edge, ["top", "bottom", "left", "right"] as const, "top"),
            offset: clamp(c.anchor.offset, 0, 1, 0.5),
            ...(typeof c.anchor.windowTitle === "string" ? { windowTitle: c.anchor.windowTitle.slice(0, 200) } : {}),
          }
        : c.anchor === null ? null : d.companion.anchor,
      fullscreenBehavior: oneOf(c.fullscreenBehavior, ["hide", "notifications_only", "always", "game_aware"] as const, d.companion.fullscreenBehavior),
      clickThrough: bool(c.clickThrough, d.companion.clickThrough),
      interactionLevel: oneOf(c.interactionLevel, ["minimal", "normal", "playful"] as const, d.companion.interactionLevel),
      walkAround: bool(c.walkAround, d.companion.walkAround),
      iconPlay: bool(c.iconPlay, d.companion.iconPlay),
      standOut: clamp(c.standOut, 0, 1, d.companion.standOut),
      hideAndPeek: bool(c.hideAndPeek, d.companion.hideAndPeek),
      desktopLayer: bool(c.desktopLayer, d.companion.desktopLayer),
    },
    desktopHost: {
      enabled: bool(dh.enabled, d.desktopHost.enabled),
      monitorDevice: typeof dh.monitorDevice === "string" && dh.monitorDevice.length <= 128 ? dh.monitorDevice : d.desktopHost.monitorDevice,
    },
    character: {
      activeCharacterId: typeof ch.activeCharacterId === "string" && /^[a-z0-9_-]{1,64}$/.test(ch.activeCharacterId) ? ch.activeCharacterId : d.character.activeCharacterId,
      eyeFollowCursor: bool(ch.eyeFollowCursor, d.character.eyeFollowCursor),
      headFollowCursor: bool(ch.headFollowCursor, d.character.headFollowCursor),
      idleVariety: clamp(ch.idleVariety, 0, 1, d.character.idleVariety),
    },
    graphics: {
      realism: clamp(gr.realism, 0, 1, d.graphics.realism),
      quality: oneOf(gr.quality, ["auto", "potato", "low", "balanced", "high"] as const, d.graphics.quality),
      autoStep: Math.round(clamp(gr.autoStep, 0, 3, d.graphics.autoStep)),
    },
    physics: {
      enabled: bool(p.enabled, d.physics.enabled),
      quality: oneOf(p.quality, ["low", "balanced", "high"] as const, d.physics.quality),
      secondaryMotion: clamp(p.secondaryMotion, 0, 100, d.physics.secondaryMotion),
      gravityMultiplier: clamp(p.gravityMultiplier, 0, 3, d.physics.gravityMultiplier),
      stiffness: clamp(p.stiffness, 0.2, 3, d.physics.stiffness),
      damping: clamp(p.damping, 0.2, 3, d.physics.damping),
      drag: clamp(p.drag, 0.2, 3, d.physics.drag),
      collisionQuality: oneOf(p.collisionQuality, ["off", "low", "high"] as const, d.physics.collisionQuality),
      wind: clamp(p.wind, 0, 1, d.physics.wind),
      clothEnabled: bool(p.clothEnabled, d.physics.clothEnabled),
      clothLooseness: clamp(p.clothLooseness, 0, 2, d.physics.clothLooseness),
    },
    privacy: {
      screenAwareness: bool(pr.screenAwareness, d.privacy.screenAwareness),
      screenAutoResume: bool(pr.screenAutoResume, d.privacy.screenAutoResume),
      cameraPresence: bool(pr.cameraPresence, d.privacy.cameraPresence),
      clipboardInContext: bool(pr.clipboardInContext, d.privacy.clipboardInContext),
    },
    security: {
      faceEnabled: bool(sec.faceEnabled, d.security.faceEnabled),
      voiceEnabled: bool(sec.voiceEnabled, d.security.voiceEnabled),
      idleTimeoutMin: Math.round(clamp(sec.idleTimeoutMin, 1, 120, d.security.idleTimeoutMin)),
      absoluteTimeoutHours: Math.round(clamp(sec.absoluteTimeoutHours, 1, 48, d.security.absoluteTimeoutHours)),
      lockOnWindowsLock: bool(sec.lockOnWindowsLock, d.security.lockOnWindowsLock),
    },
    performance: {
      activeFps: clamp(pe.activeFps, 24, 144, d.performance.activeFps),
      idleFps: clamp(pe.idleFps, 10, 60, d.performance.idleFps),
      sleepFps: clamp(pe.sleepFps, 2, 30, d.performance.sleepFps),
      perceptionPollSec: clamp(pe.perceptionPollSec, 2, 30, d.performance.perceptionPollSec),
    },
    developer: {
      debugView: bool(dev.debugView, d.developer.debugView),
      physicsDebug: bool(dev.physicsDebug, d.developer.physicsDebug),
      verboseLogs: bool(dev.verboseLogs, d.developer.verboseLogs),
    },
    personas: {
      activeMode: oneOf(per.activeMode, ["sara", "jarvis", "ultron", "vision", "friday"] as const, d.personas.activeMode),
      jarvisActive: bool(per.jarvisActive, d.personas.jarvisActive),
      ultronActive: bool(per.ultronActive, d.personas.ultronActive),
      visionActive: bool(per.visionActive, d.personas.visionActive),
      fridayActive: bool(per.fridayActive, d.personas.fridayActive),
      saraVoiceName: typeof per.saraVoiceName === "string" && /^[A-Za-z]{2,24}$/.test(per.saraVoiceName) ? per.saraVoiceName : d.personas.saraVoiceName,
      jarvisVoiceName: typeof per.jarvisVoiceName === "string" && /^[A-Za-z]{2,24}$/.test(per.jarvisVoiceName) ? per.jarvisVoiceName : d.personas.jarvisVoiceName,
      ultronVoiceName: typeof per.ultronVoiceName === "string" && /^[A-Za-z]{2,24}$/.test(per.ultronVoiceName) ? per.ultronVoiceName : d.personas.ultronVoiceName,
      visionVoiceName: typeof per.visionVoiceName === "string" && /^[A-Za-z]{2,24}$/.test(per.visionVoiceName) ? per.visionVoiceName : d.personas.visionVoiceName,
      fridayVoiceName: typeof per.fridayVoiceName === "string" && /^[A-Za-z]{2,24}$/.test(per.fridayVoiceName) ? per.fridayVoiceName : d.personas.fridayVoiceName,
    },
    advancedFeatures: {
      adaptiveTone: bool(af.adaptiveTone, d.advancedFeatures.adaptiveTone),
      skillAcquisition: bool(af.skillAcquisition, d.advancedFeatures.skillAcquisition),
      predictiveSuggestions: bool(af.predictiveSuggestions, d.advancedFeatures.predictiveSuggestions),
      deviceSync: bool(af.deviceSync, d.advancedFeatures.deviceSync),
      secureVaultRecords: bool(af.secureVaultRecords, d.advancedFeatures.secureVaultRecords),
      selfEvolutionProposals: bool(af.selfEvolutionProposals, d.advancedFeatures.selfEvolutionProposals),
      immersiveAdapters: bool(af.immersiveAdapters, d.advancedFeatures.immersiveAdapters),
    },
  };
}

/** Deep merge of a partial patch onto current settings, then validation. */
export function patchSettings(current: AppSettings, patch: unknown): AppSettings {
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source || {})) {
      out[key] = value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object"
        ? merge(target[key] as Record<string, unknown>, value as Record<string, unknown>)
        : value;
    }
    return out;
  };
  return normalizeSettings(merge(current as unknown as Record<string, unknown>, (patch || {}) as Record<string, unknown>), current);
}

export class AppSettingsStore {
  private settings: AppSettings = structuredClone(DEFAULT_APP_SETTINGS);
  private readonly file: string;
  private readonly listeners = new Set<(settings: AppSettings, previous: AppSettings) => void>();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "app-settings.v3.json");
  }

  async initialize(legacy: Record<string, unknown> = {}): Promise<AppSettings> {
    const stored = await readJsonFile<unknown>(this.file, null);
    if (stored) {
      this.settings = normalizeSettings(stored);
    } else {
      // First run of this version: users of the previous release have already
      // been through first-use, so only the new areas get defaults.
      this.settings = normalizeSettings({ onboardingComplete: false });
      if (legacy.autoStart !== undefined || legacy.wakeWordEnabled !== undefined) this.settings.onboardingComplete = false;
      await writeJsonFile(this.file, this.settings);
    }
    return this.get();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  async update(patch: unknown): Promise<AppSettings> {
    const previous = this.settings;
    this.settings = patchSettings(this.settings, patch);
    await writeJsonFile(this.file, this.settings);
    for (const listener of this.listeners) listener(this.get(), previous);
    return this.get();
  }

  onChange(listener: (settings: AppSettings, previous: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
