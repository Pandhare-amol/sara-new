import React, { useState } from 'react';
import {
  Activity,
  BookmarkPlus,
  Cpu,
  Eye,
  Monitor,
  Palette,
  Power,
  Radio,
  RotateCcw,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  CoreThemeColors,
  CustomThemePreset,
  HudIndicatorVisibility,
  HudPresentationMode,
  LiveCoreSettings,
  PerformanceQuality,
  SaraCoreState,
  SystemTelemetrySnapshot,
  ThemeId,
  WebGLRenderStats,
} from '../types';
import { QUALITY_PROFILES } from '../settings/LiveCoreSettings';
import { STATE_DESCRIPTORS } from '../states/CoreStateManager';
import { THEME_LIST } from '../themes/themeRegistry';

interface SettingsPanelProps {
  isOpen: boolean;
  settings: LiveCoreSettings;
  activeState: SaraCoreState;
  telemetry: SystemTelemetrySnapshot;
  renderStats: WebGLRenderStats;
  micStreamActive: boolean;
  micError: string | null;
  onClose: () => void;
  onUpdateSettings: (
    updater:
      | Partial<LiveCoreSettings>
      | ((prev: LiveCoreSettings) => LiveCoreSettings)
  ) => void;
  onUpdateCustomColor: (key: keyof CoreThemeColors, value: string) => void;
  onSaveCustomPreset: (name: string) => void;
  onApplyCustomPreset: (preset: CustomThemePreset) => void;
  onDeleteCustomPreset: (id: string) => void;
  onResetDefaults: () => void;
  onTriggerDiagnosticState: (state: SaraCoreState, voiceLevel?: number) => void;
  onToggleMicReactivity: () => void;
  onSwitchToExistingShell?: () => void;
}

type SettingsTab = 'themes' | 'motion' | 'hud' | 'intelligence' | 'desktop';

const COLOR_CHANNEL_LABELS: Array<{ key: keyof CoreThemeColors; label: string }> = [
  { key: 'primary', label: 'Core Primary' },
  { key: 'secondary', label: 'Core Secondary' },
  { key: 'accent', label: 'Energy Waves & Veins' },
  { key: 'ring', label: 'Holographic Rings' },
  { key: 'glow', label: 'Volumetric Corona' },
  { key: 'backgroundGlow', label: 'Ambient Nebula' },
  { key: 'highlight', label: 'Singularity Highlight' },
  { key: 'shadow', label: 'Deep Shadow Tint' },
];

const INDICATOR_LABELS: Array<{
  key: keyof HudIndicatorVisibility;
  label: string;
}> = [
  { key: 'dateTime', label: 'Current Time & Date' },
  { key: 'saraStatus', label: 'SARA Operational Status' },
  { key: 'aiModel', label: 'Current AI Model' },
  { key: 'cpuUsage', label: 'CPU Cores / Host Usage' },
  { key: 'ramUsage', label: 'RAM / Heap Telemetry' },
  { key: 'networkStatus', label: 'Network Connectivity' },
  { key: 'activeApp', label: 'Active Focus Surface' },
  { key: 'missionStatus', label: 'Current Mission Status' },
  { key: 'microphoneStatus', label: 'Microphone Status' },
  { key: 'voiceActivity', label: 'Voice Activity Meter' },
];

const ALL_STATES: SaraCoreState[] = [
  'idle',
  'listening',
  'thinking',
  'speaking',
  'executing',
  'learning',
  'researching',
  'warning',
  'error',
  'completed',
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  settings,
  activeState,
  telemetry,
  renderStats,
  micStreamActive,
  micError,
  onClose,
  onUpdateSettings,
  onUpdateCustomColor,
  onSaveCustomPreset,
  onApplyCustomPreset,
  onDeleteCustomPreset,
  onResetDefaults,
  onTriggerDiagnosticState,
  onToggleMicReactivity,
  onSwitchToExistingShell,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('themes');
  const [presetName, setPresetName] = useState('');
  const [diagnosticVoice, setDiagnosticVoice] = useState(0.72);

  if (!isOpen) return null;

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (val: number) => void
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span
          className="font-mono text-[11px] font-semibold"
          style={{ color: 'var(--sara-highlight, #b5f8ff)' }}
        >
          {value.toFixed(2)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="sara-slider w-full cursor-pointer"
      />
    </div>
  );

  return (
    <div className="pointer-events-auto fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-white/15 bg-slate-950/90 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--sara-accent, #4df7ff)' }}
            />
            <h2 className="text-sm font-bold tracking-[0.18em] text-white uppercase">
              SARA Live Core Config
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Independent 3D Holographic Desktop Engine
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 p-1.5 text-slate-400 transition hover:border-white/25 hover:text-white"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Master Enable / Disable Bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Power
            className="h-4 w-4"
            style={{
              color: settings.enabled
                ? 'var(--sara-accent, #4df7ff)'
                : '#64748b',
            }}
          />
          <div>
            <div className="text-xs font-semibold text-white">
              Live Core Renderer
            </div>
            <div className="text-[10px] text-slate-400">
              {settings.enabled
                ? `Active • ${renderStats.fps} FPS • ${renderStats.particleCount.toLocaleString()} particles`
                : 'Disabled (GPU Resources Released)'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
          }
          className={`rounded-full px-3.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition ${
            settings.enabled
              ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              : 'border border-slate-700 bg-slate-800 text-slate-400'
          }`}
        >
          {settings.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Category Tabs */}
      <div className="grid grid-cols-5 border-b border-white/10 bg-slate-900/60 text-[10px] font-semibold tracking-wider uppercase">
        {(
          [
            { id: 'themes', label: 'Themes', icon: Palette },
            { id: 'motion', label: 'Core FX', icon: Sliders },
            { id: 'hud', label: 'HUD', icon: Eye },
            { id: 'intelligence', label: 'States', icon: Activity },
            { id: 'desktop', label: 'Desktop', icon: Monitor },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 border-b-2 py-2.5 transition ${
                active
                  ? 'border-cyan-400 bg-white/[0.04] text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon
                className="h-3.5 w-3.5"
                style={{
                  color: active ? 'var(--sara-accent, #4df7ff)' : undefined,
                }}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Tab Content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
        {/* TAB 1: THEMES & CUSTOM RGB */}
        {activeTab === 'themes' && (
          <div className="space-y-5">
            {/* Automatic Chromatic Evolution Card */}
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[11px] font-semibold tracking-widest text-white uppercase">
                    Automatic Color Evolution
                  </h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Continuously morphs core, rings, particles &amp; aura across
                    all spectral palettes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      autoColorCycle: !prev.autoColorCycle,
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider uppercase transition ${
                    settings.autoColorCycle
                      ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                      : 'border border-slate-700 bg-slate-800 text-slate-400'
                  }`}
                >
                  {settings.autoColorCycle ? 'Auto On' : 'Locked'}
                </button>
              </div>

              {settings.autoColorCycle &&
                renderSlider(
                  'Color Transition Speed',
                  settings.colorCycleSpeed,
                  0.2,
                  3.0,
                  0.1,
                  'x',
                  (colorCycleSpeed) => onUpdateSettings({ colorCycleSpeed })
                )}
            </div>

            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                  Static Theme Lock (Optional)
                </h3>
                {settings.autoColorCycle && (
                  <span className="text-[10px] text-cyan-300/80">
                    Auto-Cycle Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {THEME_LIST.map((theme) => {
                  const selected =
                    !settings.autoColorCycle && settings.themeId === theme.id;
                  const colors =
                    theme.id === 'custom-rgb'
                      ? settings.customColors
                      : theme.colors;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          themeId: theme.id as ThemeId,
                          autoColorCycle: false,
                        })
                      }
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                        selected
                          ? 'border-cyan-400/70 bg-white/[0.07]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-6 w-6 rounded-full border border-white/20"
                          style={{
                            background: `radial-gradient(circle at 35% 35%, ${colors.highlight}, ${colors.primary} 65%, ${colors.secondary})`,
                            boxShadow: `0 0 12px ${colors.glow}`,
                          }}
                        />
                        <div>
                          <div className="font-semibold text-white">
                            {theme.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {theme.subtitle}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {theme.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom RGB Color Engine Editor */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[11px] font-semibold tracking-widest text-white uppercase">
                  Custom RGB Matrix Editor
                </h4>
                {(settings.autoColorCycle || settings.themeId !== 'custom-rgb') && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        themeId: 'custom-rgb',
                        autoColorCycle: false,
                      })
                    }
                    className="text-[10px] font-semibold text-cyan-300 underline"
                  >
                    Activate Custom RGB
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {COLOR_CHANNEL_LABELS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-1.5"
                  >
                    <span className="text-[10px] text-slate-300">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] text-slate-400 uppercase">
                        {settings.customColors[key]}
                      </span>
                      <input
                        type="color"
                        value={settings.customColors[key]}
                        onChange={(e) =>
                          onUpdateCustomColor(key, e.target.value)
                        }
                        className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                    </div>
                  </label>
                ))}
              </div>

              {/* Save Custom Theme Preset */}
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Custom theme preset name..."
                  className="flex-1 rounded-lg border border-white/15 bg-slate-900/90 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    onSaveCustomPreset(presetName);
                    setPresetName('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/30"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Save
                </button>
              </div>

              {settings.savedCustomThemes.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Saved Custom Presets
                  </div>
                  {settings.savedCustomThemes.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-2.5 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => onApplyCustomPreset(preset)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{ backgroundColor: preset.colors.primary }}
                        />
                        <span className="text-xs text-slate-200">
                          {preset.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPreset(preset.id)}
                        className="p-1 text-slate-500 hover:text-rose-400"
                        title="Delete preset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: REAL-TIME ANIMATION & QUALITY */}
        {activeTab === 'motion' && (
          <div className="space-y-5">
            <div className="space-y-3.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                Core Kinematics & Volumetric Controls
              </h3>
              {renderSlider(
                'Core Size',
                settings.coreSize,
                0.65,
                1.45,
                0.05,
                'x',
                (coreSize) => onUpdateSettings({ coreSize })
              )}
              {renderSlider(
                'Animation Speed',
                settings.animationSpeed,
                0.2,
                2.5,
                0.05,
                'x',
                (animationSpeed) => onUpdateSettings({ animationSpeed })
              )}
              {renderSlider(
                'Holographic Ring Speed',
                settings.ringSpeed,
                0.2,
                2.5,
                0.05,
                'x',
                (ringSpeed) => onUpdateSettings({ ringSpeed })
              )}
              {renderSlider(
                'Particle Swarm Density',
                settings.particleDensity,
                0.25,
                1.5,
                0.05,
                'x',
                (particleDensity) => onUpdateSettings({ particleDensity })
              )}
              {renderSlider(
                'Volumetric Glow Intensity',
                settings.glowIntensity,
                0.2,
                2.0,
                0.05,
                'x',
                (glowIntensity) => onUpdateSettings({ glowIntensity })
              )}
              {renderSlider(
                'Core Brightness',
                settings.brightness,
                0.4,
                1.6,
                0.05,
                'x',
                (brightness) => onUpdateSettings({ brightness })
              )}
              {renderSlider(
                'Background Nebula Intensity',
                settings.backgroundIntensity,
                0.0,
                1.5,
                0.05,
                'x',
                (backgroundIntensity) =>
                  onUpdateSettings({ backgroundIntensity })
              )}
            </div>

            {/* Quality Preset Selector */}
            <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                  GPU Rendering Quality
                </h3>
                <span className="font-mono text-[10px] text-slate-400">
                  {renderStats.rendererName.slice(0, 26)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['low', 'balanced', 'high', 'ultra'] as PerformanceQuality[]).map(
                  (q) => {
                    const prof = QUALITY_PROFILES[q];
                    const selected = settings.quality === q;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onUpdateSettings({ quality: q })}
                        className={`rounded-lg border p-2.5 text-left transition ${
                          selected
                            ? 'border-cyan-400/70 bg-cyan-500/15 text-white'
                            : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-semibold uppercase">
                          {q}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {prof.baseParticleCount.toLocaleString()} pts •{' '}
                          {prof.maxSynapticLinks} links
                        </div>
                      </button>
                    );
                  }
                )}
              </div>

              <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                <div>
                  <div className="text-xs text-slate-200">
                    Respect OS Reduced Motion
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Dampens velocity when prefers-reduced-motion is active
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.respectReducedMotion}
                  onChange={(e) =>
                    onUpdateSettings({ respectReducedMotion: e.target.checked })
                  }
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>
            </div>
          </div>
        )}

        {/* TAB 3: HUD & SYSTEM INDICATORS */}
        {activeTab === 'hud' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="mb-2.5 text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                HUD Presentation Mode
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'minimal',
                      title: 'Minimal',
                      desc: 'Clean peripheral badges',
                    },
                    {
                      id: 'telemetry',
                      title: 'Telemetry',
                      desc: 'Full WebGL & system stats',
                    },
                    {
                      id: 'zen',
                      title: 'Zen Wallpaper',
                      desc: 'Pure unobstructed 3D core',
                    },
                  ] as Array<{
                    id: HudPresentationMode;
                    title: string;
                    desc: string;
                  }>
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onUpdateSettings({ hudMode: m.id })}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      settings.hudMode === m.id
                        ? 'border-cyan-400/70 bg-cyan-500/15 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold">{m.title}</div>
                    <div className="mt-0.5 text-[9px] text-slate-400">
                      {m.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                Holographic System Indicators
              </h3>
              <p className="mb-3 text-[10px] text-slate-400">
                Displays only authentic browser/OS APIs or live SARA bridge
                telemetry—never simulated numbers.
              </p>

              <div className="space-y-2">
                {INDICATOR_LABELS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 hover:border-white/20"
                  >
                    <span className="text-xs text-slate-200">{label}</span>
                    <input
                      type="checkbox"
                      checked={settings.indicators[key]}
                      onChange={(e) =>
                        onUpdateSettings((prev) => ({
                          ...prev,
                          indicators: {
                            ...prev.indicators,
                            [key]: e.target.checked,
                          },
                        }))
                      }
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SARA INTELLIGENCE BRIDGE & DIAGNOSTIC STATES */}
        {activeTab === 'intelligence' && (
          <div className="space-y-5">
            {/* Live Bridge Status */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                  <Radio className="h-3.5 w-3.5 text-cyan-400" />
                  SARA Intelligence Bridge
                </h3>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 uppercase">
                  {telemetry.bridgeStatus}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {telemetry.bridgeSourceLabel}
              </p>
              <div className="mt-2 rounded bg-slate-900/80 px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
                Last Event: {telemetry.lastEventSummary}
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  Optional SARA WebSocket Bridge URL
                </label>
                <input
                  type="text"
                  value={settings.bridgeWebSocketUrl}
                  onChange={(e) =>
                    onUpdateSettings({ bridgeWebSocketUrl: e.target.value })
                  }
                  placeholder="e.g. ws://127.0.0.1:8765/sara-core (leave empty when offline)"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/90 px-3 py-1.5 font-mono text-[11px] text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Live Web Audio Mic Reactivity */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Bind Live Microphone Voice Level
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Pulses core energy waves from real mic RMS amplitude
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleMicReactivity}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase transition ${
                    micStreamActive
                      ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                      : 'bg-white/10 text-slate-200 hover:bg-white/15'
                  }`}
                >
                  {micStreamActive ? 'Mic Active' : 'Bind Mic'}
                </button>
              </div>
              {micError && (
                <p className="mt-1.5 text-[10px] text-rose-400">{micError}</p>
              )}
            </div>

            {/* Manual Diagnostic State Tester */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                  Diagnostic State Previewer
                </h3>
                <span className="font-mono text-[10px] text-cyan-300 uppercase">
                  {activeState}
                </span>
              </div>
              <p className="mb-3 text-[10px] text-slate-400">
                Manually test any SARA intelligence visual state when the backend
                is disconnected.
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {ALL_STATES.map((st) => {
                  const desc = STATE_DESCRIPTORS[st];
                  const isCurrent = activeState === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        onTriggerDiagnosticState(
                          st,
                          st === 'speaking' ? diagnosticVoice : undefined
                        )
                      }
                      className={`rounded-lg border px-2.5 py-2 text-left transition ${
                        isCurrent
                          ? 'border-cyan-400/80 bg-cyan-500/20 text-white'
                          : 'border-white/10 bg-slate-900/60 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold">
                          {desc.label}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">
                          {desc.code}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeState === 'speaking' && (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/70 p-3">
                  {renderSlider(
                    'Diagnostic Voice Activity Level',
                    diagnosticVoice,
                    0,
                    1,
                    0.02,
                    '',
                    (v) => {
                      setDiagnosticVoice(v);
                      onTriggerDiagnosticState('speaking', v);
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: MULTI-MONITOR & WINDOWS DESKTOP INTEGRATION */}
        {activeTab === 'desktop' && (
          <div className="space-y-5">
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-slate-300 uppercase">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                Multi-Monitor & Desktop Surface Preferences
              </h3>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                  Multi-Monitor Topology
                </label>
                <select
                  value={settings.multiMonitor.spanMode}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      multiMonitor: {
                        ...prev.multiMonitor,
                        spanMode: e.target.value as
                          | 'primary'
                          | 'span-all'
                          | 'independent',
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="primary">Primary Display Only</option>
                  <option value="independent">
                    Independent Core Per Display (Recommended)
                  </option>
                  <option value="span-all">Span Across Virtual Desktop</option>
                </select>
              </div>

              {renderSlider(
                'Background / Unfocused FPS Cap',
                settings.multiMonitor.backgroundFpsCap,
                10,
                60,
                5,
                ' FPS',
                (backgroundFpsCap) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    multiMonitor: {
                      ...prev.multiMonitor,
                      backgroundFpsCap,
                    },
                  }))
              )}

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                <div>
                  <div className="text-xs text-slate-200">
                    Pause When Occluded / Minimized
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Zero GPU usage when fullscreen apps cover desktop
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.multiMonitor.pauseWhenOccluded}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      multiMonitor: {
                        ...prev.multiMonitor,
                        pauseWhenOccluded: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
                <div>
                  <div className="text-xs text-slate-200">
                    Click-Through HUD Pass-Through
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Sets pointer-events: none on telemetry badges
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.multiMonitor.clickThroughDesktopMode}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({
                      ...prev,
                      multiMonitor: {
                        ...prev.multiMonitor,
                        clickThroughDesktopMode: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>
            </div>

            {/* Honest Windows 10 Pro Host Architecture Note */}
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.05] p-4 text-[11px] leading-relaxed text-slate-300">
              <div className="mb-1 font-semibold tracking-wider text-amber-300 uppercase">
                Windows 10 Pro Desktop Hosting Architecture
              </div>
              <p className="text-slate-400">
                In a browser tab, OS desktop icons sit beneath the browser window.
                For native Windows 10 Pro desktop presentation, pair this bundle
                with the included{' '}
                <code className="text-cyan-300">
                  desktop-host/dotnet/SaraLiveCoreHost
                </code>{' '}
                (.NET 8 + WebView2) or{' '}
                <code className="text-cyan-300">
                  desktop-host/electron/liveCoreIntegration.ts
                </code>{' '}
                using bottom-Z window placement (
                <code className="text-slate-200">HWND_BOTTOM</code> +{' '}
                <code className="text-slate-200">WS_EX_NOACTIVATE</code>) rather
                than brittle undocumented <code className="text-slate-200">WorkerW</code>{' '}
                shell injection.
              </p>
            </div>

            {onSwitchToExistingShell && (
              <button
                type="button"
                onClick={onSwitchToExistingShell}
                className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Inspect Preserved Existing Starter View
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-white/10 bg-slate-950 px-5 py-3">
        <button
          type="button"
          onClick={onResetDefaults}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Defaults
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-cyan-100 uppercase transition hover:bg-cyan-500/30"
        >
          Done
        </button>
      </div>
    </div>
  );
};
