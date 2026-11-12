import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertOctagon, Camera, CameraOff, Crosshair, Layers, ShieldAlert, Zap } from 'lucide-react';
import { api } from '../lib/appApi';

interface EdithTarget {
  id: string;
  label: string;
  category: string;
  threatOrPriority: 'low' | 'medium' | 'high';
  confidence: number;
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
  telemetrySpecs: string[];
  recommendedAction: string;
}

export const EdithArLensView: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [query, setQuery] = useState('Identify hardware, screens, circuits, or errors in view');
  const [summary, setSummary] = useState('E.D.I.T.H. Tactical AR Optics standing by.');
  const [targets, setTargets] = useState<EdithTarget[]>([]);
  const [scanning, setScanning] = useState(false);

  // Multi-Target Tactical Batch + "Abort! Abort!" Rollback
  const [batchStatus, setBatchStatus] = useState<string>('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setSummary(`Camera unavailable (${err instanceof Error ? err.message : 'permission'}) — running E.D.I.T.H. Workspace Telemetry Lens.`);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const runOpticalScan = async () => {
    setScanning(true);
    try {
      let imageBase64: string | undefined;
      if (cameraActive && videoRef.current && canvasRef.current) {
        const v = videoRef.current;
        const c = canvasRef.current;
        c.width = 640;
        c.height = 360;
        const ctx = c.getContext('2d');
        if (ctx && v.videoWidth > 0) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          imageBase64 = c.toDataURL('image/jpeg', 0.72);
        }
      }
      const out = await api.avengersAction('edith/analyze', {
        imageBase64,
        mimeType: 'image/jpeg',
        query,
      });
      setSummary(String(out.summary || 'Optical scan complete.'));
      setTargets(Array.isArray(out.targets) ? out.targets : []);
    } finally {
      setScanning(false);
    }
  };

  const stageAndExecuteDemoBatch = async () => {
    const staged = await api.avengersAction('edith/batch/stage', {
      name: 'Multi-Target Tactical Diagnostics',
      operations: [
        {
          kind: 'shell_safe',
          command: 'git status --short',
          label: 'Target 1: Inspect repo working tree',
        },
      ],
    });
    const bId = staged.batch?.batchId;
    setActiveBatchId(bId || null);
    if (bId) {
      const execOut = await api.avengersAction('edith/batch/execute', { batchId: bId });
      setBatchStatus(`Locked & Executed Batch ${bId}: ${(execOut.results || []).join(' • ')}`);
    }
  };

  const triggerAbortRollback = async () => {
    const out = await api.avengersAction('edith/abort', {
      batchId: activeBatchId || undefined,
    });
    setBatchStatus(String(out.spokenConfirmation || 'ABORT! All operations rolled back.'));
    setActiveBatchId(null);
  };

  return (
    <div className="relative flex h-full min-h-[540px] w-full flex-col justify-between overflow-hidden rounded-2xl border border-cyan-400/40 bg-[#020916] text-cyan-100">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-cyan-400/30 bg-slate-950/85 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-cyan-400" />
          <span className="font-mono text-xs font-bold tracking-[0.2em] uppercase">
            E.D.I.T.H. // EVEN DEAD, I&apos;M THE HERO — AR TACTICAL LENS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void (cameraActive ? stopCamera() : startCamera())}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 font-mono text-[11px] font-bold hover:bg-cyan-500/30 cursor-pointer"
          >
            {cameraActive ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
            <span>{cameraActive ? 'Stop AR Camera' : 'Start Phone / PC Camera'}</span>
          </button>
          <button
            type="button"
            onClick={() => void triggerAbortRollback()}
            className="flex items-center gap-1.5 rounded-lg border border-rose-400/70 bg-rose-600/30 px-3 py-1 font-mono text-[11px] font-bold text-rose-100 hover:bg-rose-600/50 cursor-pointer"
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>ABORT! ABORT! (ROLLBACK)</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:bg-white/15 cursor-pointer"
            >
              Exit Lens
            </button>
          )}
        </div>
      </div>

      {/* Live AR Camera + Reticle Overlay */}
      <div className="relative flex-1 overflow-hidden bg-black/80">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-cover ${cameraActive ? 'opacity-90' : 'hidden'}`}
        />

        {!cameraActive && (
          <div
            className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.16), transparent 65%), linear-gradient(rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.07) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 36px 36px, 36px 36px',
            }}
          >
            <ShieldAlert className="mb-2 h-10 w-10 text-cyan-400/80" />
            <div className="font-mono text-xs text-cyan-200">{summary}</div>
            <div className="mt-1 font-mono text-[10px] text-slate-400">
              Open <code className="text-cyan-300">http://&lt;YOUR-PC-IP&gt;:3000/edith</code> on your phone over Wi-Fi for mobile AR glasses mode!
            </div>
          </div>
        )}

        {/* Iron Man Bounding-Box Reticles */}
        {targets.map((t) => (
          <div
            key={t.id}
            style={{
              left: `${t.xNorm * 100}%`,
              top: `${t.yNorm * 100}%`,
              width: `${t.widthNorm * 100}%`,
              height: `${t.heightNorm * 100}%`,
            }}
            className={`absolute rounded-xl border-2 p-2 backdrop-blur-[1px] transition-all ${
              t.threatOrPriority === 'high'
                ? 'border-rose-400 bg-rose-500/10 text-rose-100'
                : 'border-cyan-400 bg-cyan-500/10 text-cyan-100'
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase">
              <span>{t.label}</span>
              <span>{Math.round(t.confidence * 100)}%</span>
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-[9px] text-cyan-200/90">
              {t.telemetrySpecs.slice(0, 3).map((sp, idx) => (
                <div key={idx}>• {sp}</div>
              ))}
            </div>
            <div className="mt-1 font-mono text-[9px] text-amber-300">{t.recommendedAction}</div>
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <div className="z-20 space-y-2 border-t border-cyan-400/30 bg-slate-950/90 p-3 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="E.D.I.T.H. Optical Directive…"
            className="flex-1 rounded-xl border border-cyan-400/30 bg-black/60 px-3 py-2 text-xs text-white outline-none"
          />
          <button
            type="button"
            disabled={scanning}
            onClick={() => void runOpticalScan()}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/25 px-4 py-2 font-mono text-xs font-bold text-cyan-100 hover:bg-cyan-500/40 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{scanning ? 'Scanning…' : 'Scan & Lock Targets'}</span>
          </button>
          <button
            type="button"
            onClick={() => void stageAndExecuteDemoBatch()}
            className="flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/20 px-3 py-2 font-mono text-xs font-bold text-amber-100 hover:bg-amber-500/35 cursor-pointer"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Stage Multi-Target Batch</span>
          </button>
        </div>
        {batchStatus && (
          <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[11px] text-emerald-300">
            {batchStatus}
          </div>
        )}
      </div>
    </div>
  );
};
export default EdithArLensView;
