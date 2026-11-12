import React, { useEffect, useState } from 'react';
import {
  Activity,
  AppWindow,
  Cpu,
  HardDrive,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  Target,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  HudIndicatorVisibility,
  HudPresentationMode,
  SaraCoreState,
  SystemTelemetrySnapshot,
} from '../types';
import { STATE_DESCRIPTORS } from '../states/CoreStateManager';

interface SystemInformationProps {
  indicators: HudIndicatorVisibility;
  hudMode: HudPresentationMode;
  telemetry: SystemTelemetrySnapshot;
  activeState: SaraCoreState;
  clickThroughDesktopMode: boolean;
  deckExpanded?: boolean;
}

export const SystemInformation: React.FC<SystemInformationProps> = ({
  indicators,
  hudMode,
  telemetry,
  activeState,
  clickThroughDesktopMode,
  deckExpanded = false,
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (hudMode === 'zen') return null;

  const stateMeta = STATE_DESCRIPTORS[activeState];
  const pointerClass = clickThroughDesktopMode
    ? 'pointer-events-none'
    : 'pointer-events-auto';

  const timeString = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateString = now.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  const isBridgeConnected =
    telemetry.bridgeStatus !== 'disconnected' &&
    telemetry.bridgeStatus !== 'error';

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-10 flex flex-col justify-between px-5 pt-12 pb-5 transition-all sm:px-7 sm:pb-7 ${
        deckExpanded ? 'lg:pl-[424px]' : ''
      }`}
    >
      {/* TOP PERIMETER BAR */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Top-Left: SARA Operational Status & Bridge State */}
        <div className={`${deckExpanded ? 'hidden lg:flex' : 'flex'} flex-col gap-2`}>
          {indicators.saraStatus && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-3 rounded-xl px-3.5 py-2`}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ backgroundColor: 'var(--sara-accent, #4df7ff)' }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--sara-accent, #4df7ff)' }}
                />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.2em] text-white uppercase">
                    SARA LIVE CORE
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase"
                    style={{
                      backgroundColor:
                        'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.18)',
                      color: 'var(--sara-highlight, #b5f8ff)',
                    }}
                  >
                    {stateMeta.code}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{stateMeta.label}</span>
                  <span>•</span>
                  <span
                    className={
                      isBridgeConnected ? 'text-emerald-300' : 'text-slate-400'
                    }
                  >
                    {isBridgeConnected
                      ? telemetry.bridgeSourceLabel
                      : 'Standalone Core (Bridge Offline)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Optional AI Model & Mission pills */}
          {(indicators.aiModel || indicators.missionStatus) && (
            <div className="flex flex-wrap items-center gap-2">
              {indicators.aiModel && (
                <div
                  className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
                >
                  <Sparkles
                    className="h-3 w-3 shrink-0"
                    style={{ color: 'var(--sara-accent, #4df7ff)' }}
                  />
                  <span className="text-slate-400 uppercase">Model:</span>
                  <span className="font-mono text-slate-200">
                    {telemetry.aiModel ?? 'Host Bridge Required'}
                  </span>
                </div>
              )}

              {indicators.missionStatus && (
                <div
                  className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
                >
                  <Target
                    className="h-3 w-3 shrink-0"
                    style={{ color: 'var(--sara-accent, #4df7ff)' }}
                  />
                  <span className="text-slate-400 uppercase">Mission:</span>
                  <span className="font-mono text-slate-200">
                    {telemetry.missionStatus ?? 'Standby'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top-Right: Chronometer (Time & Date) */}
        {indicators.dateTime && (
          <div
            className={`sara-glass-panel ${pointerClass} ml-auto rounded-xl px-4 py-2 text-right`}
          >
            <div
              className="font-mono text-lg font-semibold tracking-wider tabular-nums"
              style={{ color: 'var(--sara-highlight, #b5f8ff)' }}
            >
              {timeString}
            </div>
            <div className="font-mono text-[10px] tracking-[0.16em] text-slate-400 uppercase">
              {dateString}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM PERIMETER TELEMETRY STRIP */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Bottom-Left: Hardware, Memory, Network, Active App */}
        <div className={`${deckExpanded ? 'hidden lg:flex' : 'flex'} flex-wrap items-center gap-2`}>
          {indicators.cpuUsage && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              <Cpu
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
              <span className="text-slate-400 uppercase">CPU:</span>
              <span className="font-mono text-slate-200">
                {telemetry.cpuUsagePercent !== null
                  ? `${telemetry.cpuUsagePercent}% (${telemetry.cpuCoresLogical ?? '?'}T)`
                  : telemetry.cpuCoresLogical !== null
                  ? `${telemetry.cpuCoresLogical} Cores (Host % N/A)`
                  : 'Unavailable'}
              </span>
            </div>
          )}

          {indicators.ramUsage && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              <HardDrive
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
              <span className="text-slate-400 uppercase">MEM:</span>
              <span className="font-mono text-slate-200">
                {telemetry.ramUsagePercent !== null
                  ? telemetry.ramDetail
                    ? `${telemetry.ramUsagePercent}% • ${telemetry.ramDetail}`
                    : `${telemetry.ramUsagePercent}%`
                  : telemetry.ramDetail ?? 'Unavailable'}
              </span>
            </div>
          )}

          {indicators.networkStatus && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              {telemetry.networkOnline ? (
                <Wifi
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'var(--sara-accent, #4df7ff)' }}
                />
              ) : (
                <WifiOff className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              )}
              <span className="text-slate-400 uppercase">NET:</span>
              <span className="font-mono text-slate-200">
                {telemetry.networkDetail}
              </span>
            </div>
          )}

          {indicators.activeApp && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              <AppWindow
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
              <span className="text-slate-400 uppercase">FOCUS:</span>
              <span className="font-mono text-slate-200">
                {telemetry.activeApp ?? 'Standby'}
              </span>
            </div>
          )}

          {indicators.microphoneStatus && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              {telemetry.microphoneStatus === 'denied' ? (
                <MicOff className="h-3.5 w-3.5 shrink-0 text-rose-400" />
              ) : (
                <Mic
                  className="h-3.5 w-3.5 shrink-0"
                  style={{
                    color:
                      telemetry.microphoneStatus === 'active-mic'
                        ? '#34d399'
                        : 'var(--sara-accent, #4df7ff)',
                  }}
                />
              )}
              <span className="text-slate-400 uppercase">MIC:</span>
              <span className="font-mono text-slate-200 uppercase">
                {telemetry.microphoneStatus === 'active-mic'
                  ? 'Live Audio Bound'
                  : telemetry.microphoneStatus}
              </span>
            </div>
          )}

          {indicators.voiceActivity && (
            <div
              className={`sara-glass-panel ${pointerClass} flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]`}
            >
              <Activity
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--sara-accent, #4df7ff)' }}
              />
              <span className="text-slate-400 uppercase">VOX:</span>
              <div className="flex h-2.5 w-14 items-center gap-0.5">
                {Array.from({ length: 8 }).map((_, idx) => {
                  const threshold = (idx + 1) / 8;
                  const active = telemetry.voiceActivityLevel >= threshold;
                  return (
                    <span
                      key={idx}
                      className="h-full flex-1 rounded-xs transition-all duration-75"
                      style={{
                        backgroundColor: active
                          ? 'var(--sara-accent, #4df7ff)'
                          : 'rgba(148, 163, 184, 0.2)',
                        transform: active ? 'scaleY(1)' : 'scaleY(0.45)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Spacer on bottom-right so FloatingIndicators dock sits cleanly */}
        <div className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 xl:flex">
          <Radio className="h-3 w-3" />
          <span>{telemetry.displayResolution}</span>
          <span>@{telemetry.devicePixelRatio}x</span>
        </div>
      </div>
    </div>
  );
};
