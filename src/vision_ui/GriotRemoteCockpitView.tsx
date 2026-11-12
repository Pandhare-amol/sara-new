import React, { useCallback, useEffect, useState } from 'react';
import { Compass, RefreshCw, Send, Smartphone, Terminal } from 'lucide-react';
import { api } from '../lib/appApi';

export const GriotRemoteCockpitView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [telemetry, setTelemetry] = useState<Record<string, any> | null>(null);
  const [typeBuffer, setTypeBuffer] = useState('');
  const [shellInput, setShellInput] = useState('git status --short');
  const [lastFeedback, setLastFeedback] = useState('G.R.I.O.T. Kimoyo Remote Link Ready.');

  const refreshCockpit = useCallback(async () => {
    try {
      const data = await api.avengersGet('griot/cockpit');
      setTelemetry(data);
    } catch {
      // Resilient poll
    }
  }, []);

  useEffect(() => {
    void refreshCockpit();
    const t = window.setInterval(() => void refreshCockpit(), 4000);
    return () => window.clearInterval(t);
  }, [refreshCockpit]);

  const handleViewportTap = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / Math.max(1, rect.width);
    const yNorm = (e.clientY - rect.top) / Math.max(1, rect.height);
    const out = await api.avengersAction('griot/input', { action: 'tap', xNorm, yNorm });
    setLastFeedback(String(out.summary || 'Tap sent'));
  };

  return (
    <div className="flex h-full min-h-[520px] w-full flex-col justify-between rounded-2xl border border-purple-400/40 bg-[#050314] p-4 text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-400/25 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-purple-400" />
          <div>
            <div className="font-mono text-xs font-bold tracking-[0.2em] text-purple-200 uppercase">
              G.R.I.O.T. // WAKANDAN REMOTE PILOTING COCKPIT
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Mobile URL: <code className="text-purple-300">http://&lt;PC-IP&gt;:3000/remote-cockpit</code> • RAM:{' '}
              {telemetry?.ramPercent ?? '--'}% ({telemetry?.ramFreeGb ?? '--'} GB free)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshCockpit()}
            className="flex items-center gap-1 rounded-lg border border-purple-400/40 bg-purple-500/15 px-2.5 py-1 font-mono text-[11px] text-purple-100 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync Frame</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-300 cursor-pointer"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Interactive Touch-to-Click Remote Viewport */}
      <div
        onClick={(e) => void handleViewportTap(e)}
        className="relative my-3 flex-1 overflow-hidden rounded-xl border border-cyan-400/35 bg-black cursor-crosshair"
      >
        {telemetry?.viewportSvgDataUrl ? (
          <img
            src={String(telemetry.viewportSvgDataUrl)}
            alt="G.R.I.O.T. Host Viewport"
            className="h-full w-full object-contain select-none"
          />
        ) : (
          <div className="flex h-56 items-center justify-center font-mono text-xs text-purple-300">
            Connecting G.R.I.O.T. Telemetry Stream…
          </div>
        )}
      </div>

      {/* Remote Hotkeys + Type + Shell */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {['Alt+Tab', 'Win+D', 'Ctrl+Shift+Esc', 'Alt+Space'].map((hk) => (
            <button
              key={hk}
              type="button"
              onClick={async () => {
                const out = await api.avengersAction('griot/input', { action: 'hotkey', text: hk });
                setLastFeedback(String(out.summary || hk));
              }}
              className="flex items-center gap-1 rounded-lg border border-purple-400/30 bg-purple-500/15 px-3 py-1 font-mono text-[11px] text-purple-100 hover:bg-purple-500/30 cursor-pointer"
            >
              <Smartphone className="h-3 w-3" />
              <span>{hk}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={typeBuffer}
              onChange={(e) => setTypeBuffer(e.target.value)}
              placeholder="Remote keystrokes to type on PC…"
              className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                const out = await api.avengersAction('griot/input', { action: 'type', text: typeBuffer });
                setLastFeedback(String(out.summary || 'Typed'));
                setTypeBuffer('');
              }}
              className="flex items-center gap-1 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs font-bold text-cyan-100 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Type</span>
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={shellInput}
              onChange={(e) => setShellInput(e.target.value)}
              placeholder="Remote host shell command…"
              className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-xs text-cyan-200 outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                const out = await api.avengersAction('griot/input', { action: 'shell', command: shellInput });
                setLastFeedback(`${out.summary} ${out.output ? '-> ' + out.output : ''}`);
              }}
              className="flex items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-bold text-emerald-100 cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Exec</span>
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[11px] text-purple-200">
          {lastFeedback}
        </div>
      </div>
    </div>
  );
};
export default GriotRemoteCockpitView;
