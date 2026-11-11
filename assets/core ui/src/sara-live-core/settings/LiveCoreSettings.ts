import {
  CoreThemeColors,
  CustomThemePreset,
  LiveCoreSettings,
  PerformanceQuality,
  QualityProfile,
} from '../types';
import { DEFAULT_CUSTOM_COLORS } from '../themes/themeRegistry';

const STORAGE_KEY = 'sara.liveCore.settings.v1';

export const QUALITY_PROFILES: Record<PerformanceQuality, QualityProfile> = {
  low: {
    id: 'low',
    label: 'Low (Battery / Background)',
    baseParticleCount: 1200,
    ambientParticleCount: 160,
    maxSynapticLinks: 300,
    synapticSampleLimit: 180,
    sphereSegments: 32,
    maxPixelRatio: 1.0,
    enableBloomLayers: false,
    enableSynapticWeb: true,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced (Desktop Standard)',
    baseParticleCount: 2600,
    ambientParticleCount: 320,
    maxSynapticLinks: 650,
    synapticSampleLimit: 260,
    sphereSegments: 48,
    maxPixelRatio: 1.5,
    enableBloomLayers: true,
    enableSynapticWeb: true,
  },
  high: {
    id: 'high',
    label: 'High (Cinematic Core)',
    baseParticleCount: 4500,
    ambientParticleCount: 520,
    maxSynapticLinks: 1100,
    synapticSampleLimit: 340,
    sphereSegments: 64,
    maxPixelRatio: 2.0,
    enableBloomLayers: true,
    enableSynapticWeb: true,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra (Maximum Neural Density)',
    baseParticleCount: 7000,
    ambientParticleCount: 800,
    maxSynapticLinks: 1700,
    synapticSampleLimit: 420,
    sphereSegments: 80,
    maxPixelRatio: 2.0,
    enableBloomLayers: true,
    enableSynapticWeb: true,
  },
};

export function createDefaultSettings(): LiveCoreSettings {
  return {
    enabled: true,
    autoColorCycle: true,
    colorCycleSpeed: 1.0,
    themeId: 'ultron-blue',
    customColors: { ...DEFAULT_CUSTOM_COLORS },
    savedCustomThemes: [],
    animationSpeed: 1.0,
    particleDensity: 1.0,
    glowIntensity: 1.15,
    coreSize: 1.0,
    ringSpeed: 1.0,
    brightness: 1.0,
    backgroundIntensity: 0.9,
    quality: 'high',
    respectReducedMotion: true,
    hudMode: 'minimal',
    indicators: {
      dateTime: true,
      saraStatus: true,
      aiModel: true,
      cpuUsage: true,
      ramUsage: true,
      networkStatus: true,
      activeApp: false,
      missionStatus: true,
      microphoneStatus: true,
      voiceActivity: true,
    },
    multiMonitor: {
      spanMode: 'primary',
      targetDisplayIndex: 0,
      backgroundFpsCap: 30,
      pauseWhenOccluded: true,
      clickThroughDesktopMode: false,
    },
    bridgeWebSocketUrl: '',
  };
}

function mergeSettings(
  defaults: LiveCoreSettings,
  parsed: Partial<LiveCoreSettings>
): LiveCoreSettings {
  return {
    ...defaults,
    ...parsed,
    customColors: {
      ...defaults.customColors,
      ...(parsed.customColors ?? {}),
    },
    savedCustomThemes: Array.isArray(parsed.savedCustomThemes)
      ? parsed.savedCustomThemes
      : defaults.savedCustomThemes,
    indicators: {
      ...defaults.indicators,
      ...(parsed.indicators ?? {}),
    },
    multiMonitor: {
      ...defaults.multiMonitor,
      ...(parsed.multiMonitor ?? {}),
    },
  };
}

export class LiveCoreSettingsStore {
  private settings: LiveCoreSettings;
  private listeners = new Set<(settings: LiveCoreSettings) => void>();

  constructor() {
    this.settings = this.loadFromStorage();
  }

  private loadFromStorage(): LiveCoreSettings {
    const defaults = createDefaultSettings();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<LiveCoreSettings>;
      return mergeSettings(defaults, parsed);
    } catch {
      return defaults;
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota / privacy mode errors cleanly
    }

    // Optional forwarding to native host bridge if present
    try {
      const w = window as unknown as {
        saraBridge?: { saveLiveCoreSettings?: (s: LiveCoreSettings) => void };
        chrome?: { webview?: { postMessage?: (msg: unknown) => void } };
      };
      w.saraBridge?.saveLiveCoreSettings?.(this.settings);
      w.chrome?.webview?.postMessage?.({
        channel: 'sara-live-core-settings',
        payload: this.settings,
      });
    } catch {
      // Host bridge optional
    }
  }

  public getSettings(): LiveCoreSettings {
    return this.settings;
  }

  public updateSettings(
    updater:
      | Partial<LiveCoreSettings>
      | ((prev: LiveCoreSettings) => LiveCoreSettings)
  ): void {
    const next =
      typeof updater === 'function'
        ? updater(this.settings)
        : mergeSettings(this.settings, updater);
    this.settings = next;
    this.persist();
    this.notify();
  }

  public updateCustomColor(key: keyof CoreThemeColors, value: string): void {
    this.updateSettings((prev) => ({
      ...prev,
      autoColorCycle: false,
      themeId: 'custom-rgb',
      customColors: {
        ...prev.customColors,
        [key]: value,
      },
    }));
  }

  public saveCustomThemePreset(name: string): CustomThemePreset {
    const preset: CustomThemePreset = {
      id: `custom-${Date.now()}`,
      name: name.trim() || `Custom Matrix ${this.settings.savedCustomThemes.length + 1}`,
      colors: { ...this.settings.customColors },
      createdAt: Date.now(),
    };
    this.updateSettings((prev) => ({
      ...prev,
      autoColorCycle: false,
      themeId: 'custom-rgb',
      savedCustomThemes: [preset, ...prev.savedCustomThemes.slice(0, 11)],
    }));
    return preset;
  }

  public deleteCustomThemePreset(id: string): void {
    this.updateSettings((prev) => ({
      ...prev,
      savedCustomThemes: prev.savedCustomThemes.filter((t) => t.id !== id),
    }));
  }

  public applyCustomThemePreset(preset: CustomThemePreset): void {
    this.updateSettings((prev) => ({
      ...prev,
      autoColorCycle: false,
      themeId: 'custom-rgb',
      customColors: { ...preset.colors },
    }));
  }

  public resetToDefaults(): void {
    this.settings = createDefaultSettings();
    this.persist();
    this.notify();
  }

  public subscribe(listener: (settings: LiveCoreSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }
}
