import React, { useEffect, useRef } from 'react';
import { Power, RefreshCw, ShieldAlert } from 'lucide-react';
import { SaraCoreState, WebGLRenderStats } from '../types';

interface EnergyCoreProps {
  canvasHostRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  renderStats: WebGLRenderStats;
  activeState: SaraCoreState;
  onEnableCore: () => void;
  onPulseWave: () => void;
}

const Canvas2DFallback: React.FC<{ activeState: SaraCoreState }> = ({
  activeState,
}) => {
  const fallbackRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = fallbackRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 0.02;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.16;

      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, baseR * 2.2);
      grad.addColorStop(0, 'rgba(181, 248, 255, 0.92)');
      grad.addColorStop(0.35, 'rgba(0, 168, 255, 0.55)');
      grad.addColorStop(0.7, 'rgba(0, 81, 255, 0.15)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * (2.1 + Math.sin(t * 2) * 0.08), 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (0.4 + i * 0.25) * (i % 2 === 0 ? 1 : -1));
        ctx.strokeStyle = 'rgba(77, 247, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, baseR * (1.35 + i * 0.28), baseR * (0.65 + i * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [activeState]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={fallbackRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/30 bg-slate-950/75 px-3.5 py-1 text-[11px] tracking-wider text-amber-200/90 backdrop-blur-md">
        2D Canvas Fallback Mode (Hardware WebGL Context Unavailable)
      </div>
    </div>
  );
};

export const EnergyCore: React.FC<EnergyCoreProps> = ({
  canvasHostRef,
  enabled,
  renderStats,
  activeState,
  onEnableCore,
  onPulseWave,
}) => {
  if (!enabled) {
    return (
      <div className="fixed inset-0 z-10 flex flex-col items-center justify-center bg-[#03050a]/95 p-6 text-center">
        <div className="sara-glass-panel max-w-md rounded-2xl p-8">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border"
            style={{
              borderColor: 'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.4)',
              backgroundColor: 'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.1)',
            }}
          >
            <Power className="h-6 w-6" style={{ color: 'var(--sara-accent, #4df7ff)' }} />
          </div>
          <h2 className="text-lg font-semibold tracking-wider text-white uppercase">
            SARA Live Core Standby
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            WebGL rendering engine is currently disabled and all GPU geometries,
            shaders, and particle buffers have been cleanly released.
          </p>
          <button
            type="button"
            onClick={onEnableCore}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-xs font-semibold tracking-widest uppercase transition hover:brightness-125"
            style={{
              borderColor: 'var(--sara-accent, #4df7ff)',
              backgroundColor: 'rgba(var(--sara-primary-rgb, 0, 168, 255), 0.2)',
              color: 'var(--sara-highlight, #b5f8ff)',
            }}
          >
            <Power className="h-3.5 w-3.5" />
            Initialize Live Core
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-0 select-none">
      {renderStats.health === 'unsupported' ? (
        <Canvas2DFallback activeState={activeState} />
      ) : (
        <div
          ref={canvasHostRef}
          onClick={onPulseWave}
          className="h-full w-full cursor-pointer"
          title="Click core to emit harmonic energy wave"
        />
      )}

      {(renderStats.health === 'context-lost' ||
        renderStats.health === 'recovering') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
          <div className="sara-glass-panel flex max-w-sm flex-col items-center rounded-2xl p-6 text-center">
            {renderStats.health === 'recovering' ? (
              <RefreshCw className="mb-3 h-8 w-8 animate-spin text-cyan-300" />
            ) : (
              <ShieldAlert className="mb-3 h-8 w-8 text-amber-400" />
            )}
            <h3 className="text-sm font-semibold tracking-widest text-white uppercase">
              {renderStats.health === 'recovering'
                ? 'Restoring WebGL Pipeline...'
                : 'WebGL Context Interrupted'}
            </h3>
            <p className="mt-1.5 text-xs text-slate-400">
              GPU driver reset detected. SARA Live Core is preserving state and
              awaiting automatic hardware context restoration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
