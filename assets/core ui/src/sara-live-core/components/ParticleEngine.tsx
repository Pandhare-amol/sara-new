import React from 'react';
import { Sparkles } from 'lucide-react';
import { HudPresentationMode, PerformanceQuality, WebGLRenderStats } from '../types';

interface ParticleEngineProps {
  renderStats: WebGLRenderStats;
  quality: PerformanceQuality;
  hudMode: HudPresentationMode;
}

export const ParticleEngine: React.FC<ParticleEngineProps> = ({
  renderStats,
  quality,
  hudMode,
}) => {
  if (hudMode !== 'telemetry') return null;

  return (
    <div className="sara-glass-panel pointer-events-auto rounded-xl px-3.5 py-2.5 text-[11px]">
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 font-semibold tracking-widest text-slate-200 uppercase">
          <Sparkles
            className="h-3.5 w-3.5"
            style={{ color: 'var(--sara-accent, #4df7ff)' }}
          />
          Particle & Synaptic Matrix
        </span>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase"
          style={{
            backgroundColor: 'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.16)',
            color: 'var(--sara-highlight, #b5f8ff)',
          }}
        >
          {quality}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-slate-300">
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">SWARM:</span>
          <span className="text-white">
            {renderStats.particleCount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">SYNAPSES:</span>
          <span className="text-white">
            {renderStats.synapticLinkCount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">FRAME RATE:</span>
          <span className="text-white">{renderStats.fps} FPS</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-400">DRAW CALLS:</span>
          <span className="text-white">{renderStats.drawCalls}</span>
        </div>
      </div>
    </div>
  );
};
