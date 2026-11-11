import React from 'react';
import {
  Brain,
  CheckCircle2,
  CircleDot,
  Ear,
  Eye,
  EyeOff,
  Layers,
  Mic,
  MicOff,
  Network,
  Radar,
  Sliders,
  Terminal,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  HudPresentationMode,
  SaraCoreState,
  WebGLRenderStats,
} from '../types';
import { STATE_DESCRIPTORS } from '../states/CoreStateManager';
import { ParticleEngine } from './ParticleEngine';

interface FloatingIndicatorsProps {
  activeState: SaraCoreState;
  hudMode: HudPresentationMode;
  renderStats: WebGLRenderStats;
  quality: 'low' | 'balanced' | 'high' | 'ultra';
  clickThroughDesktopMode: boolean;
  micStreamActive: boolean;
  autoColorCycle: boolean;
  onSelectOperation: (state: SaraCoreState, voiceLevel?: number) => void;
  onToggleMicReactivity: () => void;
  onCycleHudMode: () => void;
  onOpenSettings: () => void;
  onPulseWave: () => void;
}

interface OperationButtonSpec {
  state: SaraCoreState;
  label: string;
  shortHint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const OPERATION_BUTTONS: OperationButtonSpec[] = [
  {
    state: 'idle',
    label: 'Standby',
    shortHint: 'Idle Equilibrium',
    icon: CircleDot,
  },
  {
    state: 'listening',
    label: 'Listen',
    shortHint: 'Acoustic Wave Reception',
    icon: Ear,
  },
  {
    state: 'thinking',
    label: 'Think',
    shortHint: 'Neural Convection',
    icon: Brain,
  },
  {
    state: 'speaking',
    label: 'Speak',
    shortHint: 'Voice Harmonic Pulse',
    icon: Volume2,
  },
  {
    state: 'executing',
    label: 'Execute',
    shortHint: 'High-Velocity Rings',
    icon: Terminal,
  },
  {
    state: 'learning',
    label: 'Learn',
    shortHint: 'Synaptic Network Mapping',
    icon: Network,
  },
  {
    state: 'researching',
    label: 'Research',
    shortHint: 'Deep Volumetric Scan',
    icon: Radar,
  },
  {
    state: 'completed',
    label: 'Complete',
    shortHint: 'Completion Shockwave',
    icon: CheckCircle2,
  },
];

export const FloatingIndicators: React.FC<FloatingIndicatorsProps> = ({
  activeState,
  hudMode,
  renderStats,
  quality,
  clickThroughDesktopMode,
  micStreamActive,
  autoColorCycle,
  onSelectOperation,
  onToggleMicReactivity,
  onCycleHudMode,
  onOpenSettings,
  onPulseWave,
}) => {
  const stateMeta = STATE_DESCRIPTORS[activeState];

  // In Zen Wallpaper Mode, render only whisper-quiet small corner buttons that brighten on hover
  if (hudMode === 'zen') {
    return (
      <div className="pointer-events-auto fixed right-5 bottom-5 z-20 flex items-center gap-1.5 opacity-30 transition-opacity duration-300 hover:opacity-100">
        <button
          type="button"
          onClick={onPulseWave}
          className="sara-glass-panel flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 transition hover:scale-105 hover:text-white"
          title="Emit Energy Wave"
          aria-label="Emit Energy Wave"
        >
          <Zap
            className="h-3.5 w-3.5"
            style={{ color: 'var(--sara-accent, #4df7ff)' }}
          />
        </button>
        <button
          type="button"
          onClick={onCycleHudMode}
          className="sara-glass-panel flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px] font-medium tracking-wider text-slate-200 uppercase transition hover:text-white"
          title="Exit Zen Wallpaper Mode"
        >
          <Eye
            className="h-3 w-3"
            style={{ color: 'var(--sara-accent, #4df7ff)' }}
          />
          <span>HUD</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="sara-glass-panel flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 transition hover:text-white"
          title="SARA Live Core Settings"
          aria-label="SARA Live Core Settings"
        >
          <Sliders
            className="h-3.5 w-3.5"
            style={{ color: 'var(--sara-accent, #4df7ff)' }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed right-5 bottom-12 z-20 flex flex-col items-end gap-2 sm:right-7 sm:bottom-14 ${
        clickThroughDesktopMode ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      {/* Telemetry Particle & Synaptic Matrix card (shown in 'telemetry' mode) */}
      <ParticleEngine
        renderStats={renderStats}
        quality={quality}
        hudMode={hudMode}
      />

      {/* Compact Active Operation Readout */}
      <div className="sara-glass-panel flex items-center gap-2.5 rounded-xl px-3 py-1.5">
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            {autoColorCycle && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: 'var(--sara-accent, #4df7ff)',
                  boxShadow: '0 0 8px var(--sara-glow, #0095ff)',
                }}
                title="Automatic Chromatic Evolution Active"
              />
            )}
            <span className="text-[10px] font-semibold tracking-widest text-white uppercase">
              {stateMeta.label}
            </span>
          </div>
          <div className="text-[9px] text-slate-400">
            {stateMeta.description}
          </div>
        </div>
      </div>

      {/* Compact Micro-Buttons Dock for SARA Operations & Core Controls */}
      <div className="sara-glass-panel flex flex-wrap items-center justify-end gap-1 rounded-xl p-1.5">
        {/* Small Operation Buttons */}
        <div className="flex items-center gap-1">
          {OPERATION_BUTTONS.map((op) => {
            const Icon = op.icon;
            const isActive = activeState === op.state;
            return (
              <button
                key={op.state}
                type="button"
                onClick={() =>
                  onSelectOperation(
                    op.state,
                    op.state === 'speaking' && !micStreamActive
                      ? 0.68
                      : undefined
                  )
                }
                title={`${op.label} — ${op.shortHint}`}
                aria-label={`${op.label} operation`}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-150 ${
                  isActive
                    ? 'scale-105 text-white shadow-sm'
                    : 'border-transparent bg-white/[0.03] text-slate-400 hover:border-white/15 hover:bg-white/[0.08] hover:text-slate-100'
                }`}
                style={
                  isActive
                    ? {
                        borderColor:
                          'rgba(var(--sara-accent-rgb, 77, 247, 255), 0.65)',
                        backgroundColor:
                          'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.24)',
                        color: 'var(--sara-highlight, #b5f8ff)',
                        boxShadow:
                          '0 0 12px rgba(var(--sara-glow-rgb, 0, 149, 255), 0.32)',
                      }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="mx-0.5 h-4 w-px bg-white/15" />

        {/* Small Utility Operation Buttons: Wave, Mic, HUD, Settings */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPulseWave}
            title="Emit Harmonic Energy Wave"
            aria-label="Emit Harmonic Energy Wave"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-white/[0.03] text-slate-300 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
          >
            <Zap
              className="h-3.5 w-3.5"
              style={{ color: 'var(--sara-accent, #4df7ff)' }}
            />
          </button>

          <button
            type="button"
            onClick={onToggleMicReactivity}
            title={
              micStreamActive
                ? 'Disable Live Microphone Reactivity'
                : 'Enable Live Microphone Reactivity'
            }
            aria-label="Toggle Microphone Reactivity"
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition ${
              micStreamActive
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border-transparent bg-white/[0.03] text-slate-400 hover:border-white/15 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {micStreamActive ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onCycleHudMode}
            title={`HUD Mode: ${hudMode.toUpperCase()} (Click to cycle Minimal / Telemetry / Zen)`}
            aria-label="Cycle HUD Mode"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-white/[0.03] text-slate-300 transition hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
          >
            {hudMode === 'telemetry' ? (
              <Layers
                className="h-3.5 w-3.5"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
            ) : (
              <EyeOff
                className="h-3.5 w-3.5"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Open SARA Live Core Settings"
            aria-label="Open SARA Live Core Settings"
            className="flex h-7 w-7 items-center justify-center rounded-lg border transition hover:brightness-125"
            style={{
              borderColor: 'rgba(var(--sara-accent-rgb, 77, 247, 255), 0.45)',
              backgroundColor:
                'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.18)',
              color: 'var(--sara-highlight, #b5f8ff)',
            }}
          >
            <Sliders className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
