import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import './styles/liveCore.css';
import {
  CoreThemeColors,
  CustomThemePreset,
  HudPresentationMode,
  LiveCoreSettings,
  SaraCoreState,
  ThemeId,
} from './types';
import { LiveCoreSettingsStore } from './settings/LiveCoreSettings';
import { CoreStateManager } from './states/CoreStateManager';
import { ColorEngine } from './themes/colorEngine';
import { resolveThemeColors } from './themes/themeRegistry';
import { useCoreAnimation } from './hooks/useCoreAnimation';
import { useSaraEvents } from './hooks/useSaraEvents';
import { CoreLighting } from './components/CoreLighting';
import { EnergyCore } from './components/EnergyCore';
import { HolographicRings } from './components/HolographicRings';
import { EnergyWaves } from './components/EnergyWaves';
import { SystemInformation } from './components/SystemInformation';
import { FloatingIndicators } from './components/FloatingIndicators';
import { SettingsPanel } from './components/SettingsPanel';
import { DeckTabId, JarvisCommandDeck } from './components/JarvisCommandDeck';
import { TransparentJarvisChat } from './components/TransparentJarvisChat';
import { SettingsPanel as SaraGlobalSettingsPanel } from '../../../../src/components/SettingsPanel';
import { api, type AppSettings, type AppSettingsPatch } from '../../../../src/lib/appApi';
import { loadSettings, saveSettings, type SaraSettings } from '../../../../src/lib/saraSettingsStore';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryInstance {
  props: { children: ReactNode };
  state: ErrorBoundaryState;
  setState(state: ErrorBoundaryState): void;
}

const ErrorBoundaryBase = (React as unknown as {
  Component: new (props: { children: ReactNode }) => ErrorBoundaryInstance;
}).Component;

class LiveCoreErrorBoundary extends ErrorBoundaryBase {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Visual engine fault detected',
    };
  }

  public componentDidCatch(error: unknown, info: unknown): void {
    console.error('[SARA Live Core] Render ErrorBoundary caught:', error, info);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="sara-live-core-root flex items-center justify-center p-6">
          <div className="sara-glass-panel max-w-md rounded-2xl p-6 text-center">
            <ShieldAlert className="mx-auto mb-3 h-9 w-9 text-rose-400" />
            <h2 className="text-sm font-bold tracking-widest text-white uppercase">
              SARA Live Core Recovery
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() =>
                this.setState({ hasError: false, errorMessage: '' })
              }
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-100 uppercase hover:bg-cyan-500/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Restart Visual Engine
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface LiveCoreAppProps {
  onSwitchToExistingShell?: () => void;
  onSwitchSurface?: (mode: 'companion' | 'live_core' | 'ultron' | 'sara_os' | 'central_os') => void;
}

const LiveCoreWorkspace: React.FC<LiveCoreAppProps> = ({
  onSwitchToExistingShell,
  onSwitchSurface,
}) => {
  const settingsStore = useMemo(() => new LiveCoreSettingsStore(), []);
  const [settings, setSettings] = useState<LiveCoreSettings>(() =>
    settingsStore.getSettings()
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saraSettingsOpen, setSaraSettingsOpen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [saraLocalSettings, setSaraLocalSettings] = useState<SaraSettings>(() =>
    loadSettings()
  );
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [activeDeckTab, setActiveDeckTab] = useState<DeckTabId>('command');
  const [deckExpanded, setDeckExpanded] = useState<boolean>(true);
  const [externalActionNonce, setExternalActionNonce] = useState<{
    action: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    void api
      .appSettings()
      .then((s) => setAppSettings(s))
      .catch(() => undefined);
  }, []);

  const handleSaraLocalSettingsChange = useCallback(
    (patch: Partial<SaraSettings>) => {
      setSaraLocalSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const handleAppSettingsChange = useCallback((patch: AppSettingsPatch) => {
    setAppSettings((current) => {
      if (!current) return current;
      const next = { ...current } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        const base = (current as unknown as Record<string, unknown>)[key];
        next[key] =
          value && typeof value === 'object' && base && typeof base === 'object'
            ? { ...(base as object), ...(value as object) }
            : value;
      }
      return next as unknown as AppSettings;
    });
    void api
      .updateAppSettings(patch)
      .then((updated) => setAppSettings(updated))
      .catch(() => undefined);
  }, []);

  const stateManager = useMemo(() => new CoreStateManager(), []);
  const colorEngine = useMemo(
    () =>
      new ColorEngine(
        resolveThemeColors(
          settingsStore.getSettings().themeId,
          settingsStore.getSettings().customColors
        )
      ),
    [settingsStore]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return settingsStore.subscribe((next) => setSettings(next));
  }, [settingsStore]);

  useEffect(() => {
    colorEngine.attachCssHost(rootRef.current);
    return () => colorEngine.attachCssHost(null);
  }, [colorEngine]);

  const handleBridgeThemeChange = useCallback(
    (themeId: ThemeId) => {
      settingsStore.updateSettings({ themeId, autoColorCycle: false });
    },
    [settingsStore]
  );

  const {
    activeState,
    telemetry,
    micStreamActive,
    micError,
    toggleMicrophoneReactivity,
    triggerDiagnosticState,
  } = useSaraEvents(
    stateManager,
    settings.bridgeWebSocketUrl,
    handleBridgeThemeChange
  );

  const { renderStats, pulseWaveManually } = useCoreAnimation(
    canvasHostRef,
    settings,
    stateManager,
    colorEngine
  );

  const handleUpdateSettings = useCallback(
    (
      updater:
        | Partial<LiveCoreSettings>
        | ((prev: LiveCoreSettings) => LiveCoreSettings)
    ) => {
      settingsStore.updateSettings(updater);
    },
    [settingsStore]
  );

  const handleUpdateCustomColor = useCallback(
    (key: keyof CoreThemeColors, value: string) => {
      settingsStore.updateCustomColor(key, value);
    },
    [settingsStore]
  );

  const handleSaveCustomPreset = useCallback(
    (name: string) => {
      settingsStore.saveCustomThemePreset(name);
    },
    [settingsStore]
  );

  const handleApplyCustomPreset = useCallback(
    (preset: CustomThemePreset) => {
      settingsStore.applyCustomThemePreset(preset);
    },
    [settingsStore]
  );

  const handleDeleteCustomPreset = useCallback(
    (id: string) => {
      settingsStore.deleteCustomThemePreset(id);
    },
    [settingsStore]
  );

  const handleResetDefaults = useCallback(() => {
    settingsStore.resetToDefaults();
  }, [settingsStore]);

  const handleCycleHudMode = useCallback(() => {
    const order: HudPresentationMode[] = ['minimal', 'telemetry', 'zen'];
    settingsStore.updateSettings((prev) => {
      const idx = order.indexOf(prev.hudMode);
      return {
        ...prev,
        hudMode: order[(idx + 1) % order.length],
      };
    });
  }, [settingsStore]);

  const handleDockOperation = useCallback(
    (state: SaraCoreState, voiceLevel?: number) => {
      triggerDiagnosticState(state, voiceLevel);
      const mapAction: Record<SaraCoreState, string> = {
        idle: 'standby',
        listening: 'listen',
        thinking: 'think',
        speaking: 'speak',
        executing: 'execute',
        learning: 'learn',
        researching: 'research',
        completed: 'completed',
        warning: 'completed',
        error: 'standby',
      };
      if (state !== 'idle') {
        setDeckExpanded(true);
      }
      setExternalActionNonce({
        action: mapAction[state],
        nonce: Date.now(),
      });
    },
    [triggerDiagnosticState]
  );

  // Keyboard shortcuts: Escape closes settings drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen]);

  return (
    <div ref={rootRef} className="sara-live-core-root select-none">
      {/* Native Application Titlebar & SARA Command Deck */}
      <JarvisCommandDeck
        activeTab={activeDeckTab}
        deckExpanded={deckExpanded && settings.hudMode !== 'zen'}
        onChangeTab={setActiveDeckTab}
        onToggleDeckExpanded={() => setDeckExpanded((v) => !v)}
        onSetCoreState={triggerDiagnosticState}
        onPulseWave={pulseWaveManually}
        onSetQualityForPowerReroute={(quality) =>
          settingsStore.updateSettings({ quality })
        }
        onOpenVisualSettings={() => setSettingsOpen(true)}
        onOpenSaraSettings={() => setSaraSettingsOpen(true)}
        onSwitchToExistingShell={onSwitchToExistingShell}
        onSwitchSurface={onSwitchSurface}
        externalActionNonce={externalActionNonce}
      />

      {/* Dynamic Atmospheric Nebula & Volumetric Lighting */}
      <CoreLighting
        backgroundIntensity={settings.backgroundIntensity}
        glowIntensity={settings.glowIntensity}
        brightness={settings.brightness}
        activeState={activeState}
      />

      {/* Central 3D WebGL Energy Core, Particles, Synaptic Web & 3D Rings */}
      <EnergyCore
        canvasHostRef={canvasHostRef}
        enabled={settings.enabled}
        renderStats={renderStats}
        activeState={activeState}
        onEnableCore={() => settingsStore.updateSettings({ enabled: true })}
        onPulseWave={pulseWaveManually}
      />

      {/* Synchronized Precision Vector Holographic Reticle Rings */}
      {settings.enabled && (
        <>
          <HolographicRings
            coreSize={settings.coreSize}
            ringSpeed={settings.ringSpeed}
            glowIntensity={settings.glowIntensity}
            activeState={activeState}
            reducedMotion={renderStats.reducedMotionActive}
          />
          <EnergyWaves
            activeState={activeState}
            voiceLevel={telemetry.voiceActivityLevel}
            glowIntensity={settings.glowIntensity}
            coreSize={settings.coreSize}
            reducedMotion={renderStats.reducedMotionActive}
          />
        </>
      )}

      {/* Optional Minimal Holographic Desktop Information */}
      <SystemInformation
        indicators={settings.indicators}
        hudMode={settings.hudMode}
        telemetry={telemetry}
        activeState={activeState}
        clickThroughDesktopMode={settings.multiMonitor.clickThroughDesktopMode}
        deckExpanded={deckExpanded && settings.hudMode !== 'zen'}
      />

      {/* Transparent Floating J.A.R.V.I.S. Chat & Command Panel */}
      {settings.hudMode !== 'zen' && (
        <TransparentJarvisChat
          isOpen={chatPanelOpen}
          onToggleOpen={() => setChatPanelOpen((v) => !v)}
          onSetCoreState={triggerDiagnosticState}
          onPulseWave={pulseWaveManually}
          onSwitchSurface={onSwitchSurface}
        />
      )}

      {/* Compact Micro-Buttons Dock for SARA Operations & Core Controls */}
      <FloatingIndicators
        activeState={activeState}
        hudMode={settings.hudMode}
        renderStats={renderStats}
        quality={settings.quality}
        clickThroughDesktopMode={settings.multiMonitor.clickThroughDesktopMode}
        micStreamActive={micStreamActive}
        autoColorCycle={settings.autoColorCycle}
        onSelectOperation={handleDockOperation}
        onToggleMicReactivity={toggleMicrophoneReactivity}
        onCycleHudMode={handleCycleHudMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onPulseWave={pulseWaveManually}
      />

      {/* Exclusive SARA Live Core Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        settings={settings}
        activeState={activeState}
        telemetry={telemetry}
        renderStats={renderStats}
        micStreamActive={micStreamActive}
        micError={micError}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onUpdateCustomColor={handleUpdateCustomColor}
        onSaveCustomPreset={handleSaveCustomPreset}
        onApplyCustomPreset={handleApplyCustomPreset}
        onDeleteCustomPreset={handleDeleteCustomPreset}
        onResetDefaults={handleResetDefaults}
        onTriggerDiagnosticState={triggerDiagnosticState}
        onToggleMicReactivity={toggleMicrophoneReactivity}
        onSwitchToExistingShell={onSwitchToExistingShell}
      />

      {/* Full SARA Global Settings Modal (Models, Voice, Permissions, Character & UI Switcher) */}
      <SaraGlobalSettingsPanel
        isOpen={saraSettingsOpen}
        onClose={() => setSaraSettingsOpen(false)}
        settings={saraLocalSettings}
        onChange={handleSaraLocalSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
      />
    </div>
  );
};

export const LiveCoreApp: React.FC<LiveCoreAppProps> = (props) => (
  <LiveCoreErrorBoundary>
    <LiveCoreWorkspace {...props} />
  </LiveCoreErrorBoundary>
);

export default LiveCoreApp;
