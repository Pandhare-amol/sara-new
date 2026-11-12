import React, { useEffect, useRef, useState } from 'react';
import { Box, Hand, Layers, Sparkles } from 'lucide-react';
import { api } from '../lib/appApi';

interface BlueprintNode {
  id: string;
  name: string;
  category: string;
  position: [number, number, number];
  explodeVector: [number, number, number];
  dimensionsMm: [number, number, number];
  wireframeColor: string;
  estimatedCostInr: number;
  role: string;
}

interface BlueprintData {
  id: string;
  title: string;
  components: BlueprintNode[];
  pinoutTable: Array<{
    fromModule: string;
    fromPin: string;
    toModule: string;
    toPin: string;
    signalOrVoltage: string;
    wireColor: string;
  }>;
  firmwareCode: string;
  totalEstimatedBomInr: number;
  safetyNotes: string[];
}

export const Stark3dBlueprintCanvas: React.FC = () => {
  const [prompt, setPrompt] = useState('Design an ESP32 smart door lock with relay, OLED, and 5V buck converter');
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [explodeFactor, setExplodeFactor] = useState(0.35);
  const [yawDeg, setYawDeg] = useState(28);
  const [pitchDeg, setPitchDeg] = useState(-18);
  const [gestureCamActive, setGestureCamActive] = useState(false);
  const [lastGestureLabel, setLastGestureLabel] = useState('Mouse Drag or Enable Mid-Air Hand Cam');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const generateBlueprint = async (customPrompt?: string) => {
    const out = await api.avengersAction('jarvis/blueprint-3d', {
      prompt: customPrompt ?? prompt,
    });
    if (out.blueprint) setBlueprint(out.blueprint);
  };

  useEffect(() => {
    void generateBlueprint();
    return () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight Webcam Mid-Air Motion Centroid Tracker (<20 MB RAM on i5!)
  useEffect(() => {
    if (!gestureCamActive) {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      return;
    }

    let animTimer: number | null = null;
    const offscreen = document.createElement('canvas');
    offscreen.width = 96;
    offscreen.height = 72;
    const offCtx = offscreen.getContext('2d');
    let prevFrame: Uint8ClampedArray | null = null;

    void navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then(async (stream) => {
        camStreamRef.current = stream;
        if (camVideoRef.current) {
          camVideoRef.current.srcObject = stream;
          await camVideoRef.current.play();
        }
        animTimer = window.setInterval(() => {
          const v = camVideoRef.current;
          if (!v || !offCtx || v.videoWidth === 0) return;
          offCtx.drawImage(v, 0, 0, offscreen.width, offscreen.height);
          const data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data;
          if (prevFrame) {
            let sumX = 0;
            let sumY = 0;
            let changed = 0;
            for (let i = 0; i < data.length; i += 4) {
              const diff =
                Math.abs(data[i] - prevFrame[i]) +
                Math.abs(data[i + 1] - prevFrame[i + 1]) +
                Math.abs(data[i + 2] - prevFrame[i + 2]);
              if (diff > 75) {
                const pxIdx = i / 4;
                sumX += pxIdx % offscreen.width;
                sumY += Math.floor(pxIdx / offscreen.width);
                changed += 1;
              }
            }
            if (changed > 35) {
              const xNorm = 1 - sumX / changed / offscreen.width; // mirror natural hand motion
              const yNorm = sumY / changed / offscreen.height;
              setYawDeg(Math.round((xNorm - 0.5) * 160));
              setPitchDeg(Math.round((yNorm - 0.5) * 90));
              setLastGestureLabel(`Hand Orbit (${xNorm.toFixed(2)}, ${yNorm.toFixed(2)})`);
            }
          }
          prevFrame = new Uint8ClampedArray(data);
        }, 110);
      })
      .catch(() => {
        setGestureCamActive(false);
        setLastGestureLabel('Camera unavailable — use Gesture Preset buttons or Mouse Orbit');
      });

    return () => {
      if (animTimer !== null) window.clearInterval(animTimer);
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [gestureCamActive]);

  // Render 3D Perspective Wireframe Boxes + Inter-Module Signal Bus
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blueprint) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Stark Lab Holo Grid Background
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const project = (x: number, y: number, z: number): [number, number] => {
      const rx = x * cosY - z * sinY;
      const rz = x * sinY + z * cosY;
      const ry = y * cosP - rz * sinP;
      const rz2 = y * sinP + rz * cosP + 6.2;
      const scale = 260 / Math.max(1.8, rz2);
      return [w / 2 + rx * scale, h / 2 - ry * scale];
    };

    const centers: Array<[number, number]> = [];

    for (const comp of blueprint.components) {
      const cx = comp.position[0] + comp.explodeVector[0] * explodeFactor;
      const cy = comp.position[1] + comp.explodeVector[1] * explodeFactor;
      const cz = comp.position[2] + comp.explodeVector[2] * explodeFactor;

      const hx = Math.max(0.28, comp.dimensionsMm[0] / 120);
      const hy = Math.max(0.2, comp.dimensionsMm[1] / 120);
      const hz = Math.max(0.14, comp.dimensionsMm[2] / 120);

      const verts: Array<[number, number, number]> = [
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ];
      const pts = verts.map(([vx, vy, vz]) => project(vx, vy, vz));
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];

      ctx.strokeStyle = comp.wireframeColor;
      ctx.lineWidth = 1.8;
      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
      }

      const center2d = project(cx, cy, cz);
      centers.push(center2d);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(comp.name, center2d[0] - 42, center2d[1] - 18);
      ctx.fillStyle = comp.wireframeColor;
      ctx.font = '10px monospace';
      ctx.fillText(`₹${comp.estimatedCostInr}`, center2d[0] - 16, center2d[1] + 26);
    }

    // Draw dashed bus links from primary MCU (#0) to peripheral modules
    if (centers.length > 1) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
      ctx.lineWidth = 1.2;
      for (let i = 1; i < centers.length; i++) {
        ctx.beginPath();
        ctx.moveTo(centers[0][0], centers[0][1]);
        ctx.lineTo(centers[i][0], centers[i][1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [blueprint, explodeFactor, yawDeg, pitchDeg]);

  const triggerSimulatedGesture = async (
    gesture: 'pinch_click' | 'fist_grab' | 'swipe_left' | 'swipe_right' | 'open_palm_pause',
  ) => {
    const res = await api.avengersAction('jarvis/gesture', { gesture, xNorm: 0.52, yNorm: 0.48 });
    setLastGestureLabel(`${gesture} -> ${res.event?.mappedCommand}`);
    if (gesture === 'fist_grab') setExplodeFactor((v) => (v > 0.5 ? 0.1 : 0.95));
    if (gesture === 'swipe_left') setYawDeg((d) => d - 35);
    if (gesture === 'swipe_right') setYawDeg((d) => d + 35);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-4">
      <video ref={camVideoRef} playsInline muted className="hidden" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-cyan-400" />
          <span className="font-mono text-xs font-bold tracking-wider text-cyan-200 uppercase">
            Stark Mark-II 3D Explodable Wireframe &amp; Bare-Hand Gesture Lab
          </span>
        </div>
        <button
          type="button"
          onClick={() => setGestureCamActive((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono text-[10px] font-bold uppercase cursor-pointer ${
            gestureCamActive
              ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
              : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
          }`}
        >
          <Hand className="h-3.5 w-3.5" />
          <span>{gestureCamActive ? 'Mid-Air Hand Cam ON' : 'Enable Bare-Hand Cam'}</span>
        </button>
      </div>

      {/* Prompt Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe circuit, robot, IoT device, or system schematic…"
          className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white outline-none"
        />
        <button
          type="button"
          onClick={() => void generateBlueprint()}
          className="flex items-center gap-1 rounded-xl border border-cyan-400/50 bg-cyan-500/25 px-4 py-2 font-mono text-xs font-bold text-cyan-100 hover:bg-cyan-500/40 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Synthesize 3D</span>
        </button>
      </div>

      {/* Interactive 3D Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-cyan-400/25 bg-[#020814]">
        <canvas
          ref={canvasRef}
          width={680}
          height={270}
          onMouseDown={(e) => {
            dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
          }}
          onMouseMove={(e) => {
            if (!dragRef.current.dragging) return;
            const dx = e.clientX - dragRef.current.lastX;
            const dy = e.clientY - dragRef.current.lastY;
            dragRef.current.lastX = e.clientX;
            dragRef.current.lastY = e.clientY;
            setYawDeg((y) => y + dx * 0.6);
            setPitchDeg((p) => Math.max(-75, Math.min(75, p + dy * 0.5)));
          }}
          onMouseUp={() => {
            dragRef.current.dragging = false;
          }}
          onMouseLeave={() => {
            dragRef.current.dragging = false;
          }}
          className="h-60 w-full cursor-grab active:cursor-grabbing"
        />
        <div className="absolute bottom-2 left-3 font-mono text-[10px] text-cyan-300/80">
          {lastGestureLabel}
        </div>
        {blueprint && (
          <div className="absolute right-3 top-2 rounded-lg border border-amber-400/40 bg-black/70 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-300">
            Total BOM: ₹{blueprint.totalEstimatedBomInr}
          </div>
        )}
      </div>

      {/* Explode Slider + Mid-Air Gesture Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] text-cyan-200">
          <Layers className="h-3.5 w-3.5 text-amber-300" />
          <span>Explode View ({Math.round(explodeFactor * 100)}%)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={explodeFactor}
            onChange={(e) => setExplodeFactor(Number(e.target.value))}
            className="accent-cyan-400"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['fist_grab', 'Grab/Explode'],
              ['swipe_left', 'Swipe ◀'],
              ['swipe_right', 'Swipe ▶'],
              ['pinch_click', 'Pinch Click'],
              ['open_palm_pause', 'Palm Hold'],
            ] as const
          ).map(([g, label]) => (
            <button
              key={g}
              type="button"
              onClick={() => void triggerSimulatedGesture(g)}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-mono text-[10px] text-slate-200 hover:bg-cyan-500/20 cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pinout + Firmware Preview */}
      {blueprint && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <div className="max-h-36 overflow-auto rounded-xl border border-white/10 bg-black/50 p-2 font-mono text-[10px]">
            <div className="mb-1 font-bold text-amber-300">WIRING PINOUT MATRIX</div>
            {blueprint.pinoutTable.map((row, idx) => (
              <div key={idx} className="border-b border-white/5 py-0.5 text-slate-300">
                {row.fromModule} [{row.fromPin}] → {row.toModule} [{row.toPin}] ({row.signalOrVoltage})
              </div>
            ))}
          </div>
          <pre className="max-h-36 overflow-auto rounded-xl border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-emerald-200">
            {blueprint.firmwareCode}
          </pre>
        </div>
      )}
    </div>
  );
};
export default Stark3dBlueprintCanvas;
