import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Clock,
  Cpu,
  Eye,
  Ghost,
  Globe,
  Power,
  Radar,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react';
import { api } from '../lib/appApi';
import { SaraAudioSession, type LiveState } from '../lib/saraAudio';
import { EdithArLensView } from './EdithArLensView';
import { GriotRemoteCockpitView } from './GriotRemoteCockpitView';
import { Stark3dBlueprintCanvas } from './Stark3dBlueprintCanvas';

export interface VisionAppProps {
  onSwitchSurface: (
    mode: 'companion' | 'live_core' | 'ultron' | 'vision' | 'sara_os' | 'central_os',
  ) => void;
}

export const VisionApp: React.FC<VisionAppProps> = ({ onSwitchSurface }) => {
  const [activeTab, setActiveTab] = useState<
    'vision_core' | 'stark_lab' | 'edith_lens' | 'friday_tactical' | 'wakanda_orbital'
  >('vision_core');

  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [liveState, setLiveState] = useState<LiveState>('disconnected');
  const [liveSession] = useState(
    () =>
      new SaraAudioSession({
        onStateChange: setLiveState,
        onTranscription: () => undefined,
        onToolCall: (_n, _a, cb) => cb({ result: 'Executed by V.I.S.I.O.N. Mind-Stone Core.' }),
        onError: () => undefined,
      }),
  );

  // Tab 1: V.I.S.I.O.N. Triad + Phasing + Mind-Stone Nexus
  const [triadTopic, setTriadTopic] = useState(
    'Architect local-first autonomous AI across Windows 10 Pro i5 8GB RAM and mobile nodes',
  );
  const [triadResult, setTriadResult] = useState<Record<string, any> | null>(null);
  const [phaseEnabled, setPhaseEnabled] = useState(false);
  const [zeroTraceNote, setZeroTraceNote] = useState('');
  const [zeroTraceStatus, setZeroTraceStatus] = useState('');
  const [nexusCorrelations, setNexusCorrelations] = useState<Array<Record<string, any>>>([]);

  // Tab 2: Iron Man 3 Forensic Timeline Scrubber
  const [timelineFrames, setTimelineFrames] = useState<Array<Record<string, any>>>([]);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [rootCauseFrame, setRootCauseFrame] = useState<Record<string, any> | null>(null);

  // Tab 4: F.R.I.D.A.Y. Fight Pattern + Suit Subsystem Reroute
  const [fightCategory, setFightCategory] = useState<
    'compiler_loop' | 'interview_exam' | 'negotiation' | 'adversarial_debug'
  >('compiler_loop');
  const [fightInput, setFightInput] = useState('TS2345 type mismatch repeated across 3 route handlers');
  const [fridayStrategy, setFridayStrategy] = useState<Record<string, any> | null>(null);
  const [suitMap, setSuitMap] = useState<Record<string, any> | null>(null);

  // Tab 5: VERONICA Drop-Pod & K.A.R.E.N. Recon Drones
  const [veronicaInfo, setVeronicaInfo] = useState('');
  const [karenUrl, setKarenUrl] = useState('https://github.com');
  const [karenName, setKarenName] = useState('GitHub Release & PR Watcher');
  const [karenDrones, setKarenDrones] = useState<Array<Record<string, any>>>([]);

  const refreshAll = useCallback(async () => {
    try {
      const [st, tl] = await Promise.all([
        api.avengersStatus(),
        api.avengersGet('jarvis/forensic-timeline'),
      ]);
      setStatus(st);
      setPhaseEnabled(Boolean(st.phaseMode?.enabled));
      if (st.suitSubsystems) setSuitMap(st.suitSubsystems);
      if (Array.isArray(st.karenDrones)) setKarenDrones(st.karenDrones);
      if (Array.isArray(st.mindStoneCorrelations)) setNexusCorrelations(st.mindStoneCorrelations);
      if (Array.isArray(tl.frames)) {
        setTimelineFrames(tl.frames);
        setScrubIndex(Math.max(0, tl.frames.length - 1));
        setRootCauseFrame(tl.rootCauseInflection || null);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    return () => liveSession.disconnect();
  }, [refreshAll, liveSession]);

  const togglePhaseMode = async () => {
    const next = !phaseEnabled;
    const out = await api.avengersAction('vision/phase', {
      enabled: next,
      opacity: 0.52,
      zeroTrace: true,
    });
    setPhaseEnabled(Boolean(out.phaseMode?.enabled));
    const bridge = (window as unknown as {
      sara?: { setVisionPhaseMode?: (en: boolean, op?: number) => Promise<unknown> };
    }).sara;
    void bridge?.setVisionPhaseMode?.(next, 0.52);
  };

  const switchPersona = async (target: 'sara' | 'jarvis' | 'ultron' | 'vision' | 'friday') => {
    await fetch('/api/persona/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    if (target === 'sara') onSwitchSurface('companion');
    else if (target === 'jarvis') onSwitchSurface('live_core');
    else if (target === 'ultron') onSwitchSurface('ultron');
    else await refreshAll();
  };

  return (
    <div
      style={{ opacity: phaseEnabled ? 0.72 : 1 }}
      className="relative flex h-screen w-screen flex-col justify-between overflow-hidden bg-[#070502] text-amber-50 select-none transition-opacity"
    >
      {/* Golden Mind-Stone + Vibranium Ambient Grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 25%, rgba(245,158,11,0.22), rgba(15,23,42,0.96) 62%), linear-gradient(rgba(251,191,36,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 44px 44px, 44px 44px',
        }}
      />

      {/* TOP PANTHEON HEADER */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 bg-slate-950/85 px-5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/70 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.45)]">
            <Eye className="h-4 w-4 text-amber-300" />
          </div>
          <div>
            <div className="font-mono text-xs font-bold tracking-[0.2em] text-amber-200 uppercase">
              V.I.S.I.O.N. // AVENGERS AI PANTHEON NEXUS
            </div>
            <div className="font-mono text-[10px] text-cyan-300/80">
              Active Persona: {(status?.personas?.activeMode || 'vision').toUpperCase()} • Suit Integrity:{' '}
              {suitMap?.overallIntegrityPct ?? 100}% • {phaseEnabled ? 'PHASING ACTIVE (Alt+Shift+P)' : 'SOLID'}
            </div>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="flex flex-wrap items-center gap-1">
          {[
            ['vision_core', 'V.I.S.I.O.N. & Mind Stone'],
            ['stark_lab', '3D Blueprint & Forensic'],
            ['edith_lens', 'E.D.I.T.H. AR & Rollback'],
            ['friday_tactical', 'F.R.I.D.A.Y. & Suit Map'],
            ['wakanda_orbital', 'G.R.I.O.T. / VERONICA / K.A.R.E.N.'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase transition cursor-pointer ${
                activeTab === id
                  ? 'border border-amber-400/60 bg-amber-500/25 text-amber-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right Controls: Phasing, Voice, Persona Switchers */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void togglePhaseMode()}
            title="Toggle 50% Translucent WS_EX_TRANSPARENT Click-Through Ghost HUD + Zero-Trace Session"
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-[10px] font-bold cursor-pointer ${
              phaseEnabled
                ? 'border-purple-400/70 bg-purple-500/30 text-purple-100'
                : 'border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25'
            }`}
          >
            <Ghost className="h-3.5 w-3.5" />
            <span>{phaseEnabled ? 'Unphase' : 'Phase Mode'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              void (liveState === 'disconnected' ? liveSession.connect(true) : liveSession.disconnect())
            }
            className="flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1 font-mono text-[10px] font-bold text-cyan-100 cursor-pointer"
          >
            <Power className="h-3 w-3" />
            <span>{liveState === 'disconnected' ? 'Mind-Stone Voice' : `Voice (${liveState})`}</span>
          </button>

          <button
            type="button"
            onClick={() => void switchPersona('friday')}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 font-mono text-[10px] font-bold text-emerald-100 cursor-pointer"
          >
            F.R.I.D.A.Y.
          </button>
          <button
            type="button"
            onClick={() => onSwitchSurface('central_os')}
            className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 font-mono text-[10px] text-cyan-100 cursor-pointer"
          >
            Central OS
          </button>
          <button
            type="button"
            onClick={() => void switchPersona('jarvis')}
            className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 py-1 font-mono text-[10px] text-sky-100 cursor-pointer"
          >
            J.A.R.V.I.S.
          </button>
          <button
            type="button"
            onClick={() => void switchPersona('ultron')}
            className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-2 py-1 font-mono text-[10px] text-rose-100 cursor-pointer"
          >
            Ultron
          </button>
          <button
            type="button"
            onClick={() => void switchPersona('sara')}
            className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px] text-white cursor-pointer"
          >
            SARA
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 flex-1 overflow-y-auto p-5">
        {/* TAB 1: V.I.S.I.O.N. TRIAD + PHASING ZERO-TRACE + MIND-STONE NEXUS */}
        {activeTab === 'vision_core' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* 1. Triad Synthesis */}
            <div className="space-y-3 rounded-2xl border border-amber-400/35 bg-slate-950/85 p-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-wider text-amber-300 uppercase">
                  1. V.I.S.I.O.N. Synthesis Engine (J.A.R.V.I.S. + Ultron + Mind Stone)
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                  Ethical Alignment 98%
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={triadTopic}
                  onChange={(e) => setTriadTopic(e.target.value)}
                  className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.avengersAction('vision/triad', { topic: triadTopic });
                    setTriadResult(out.synthesis);
                  }}
                  className="flex items-center gap-1 rounded-xl border border-amber-400/60 bg-amber-500/25 px-4 py-2 font-mono text-xs font-bold text-amber-100 hover:bg-amber-500/40 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Synthesize Triad</span>
                </button>
              </div>

              {triadResult && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/25 p-3 text-xs">
                      <div className="font-mono text-[10px] font-bold text-cyan-300">
                        J.A.R.V.I.S. (ORDER &amp; PRECISION)
                      </div>
                      <p className="mt-1 text-slate-200">{String(triadResult.jarvisPerspective?.stance)}</p>
                    </div>
                    <div className="rounded-xl border border-rose-400/30 bg-rose-950/25 p-3 text-xs">
                      <div className="font-mono text-[10px] font-bold text-rose-300">
                        ULTRON (DEFENSE &amp; EVOLUTION)
                      </div>
                      <p className="mt-1 text-slate-200">{String(triadResult.ultronPerspective?.stance)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-amber-400/50 bg-amber-950/25 p-3 text-xs">
                    <div className="font-mono text-[10px] font-bold text-amber-300">
                      V.I.S.I.O.N. MIND-STONE VERDICT
                    </div>
                    <p className="mt-1 font-semibold text-amber-100">
                      {String(triadResult.visionSynthesis?.mindStoneVerdict)}
                    </p>
                    <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
                      {(triadResult.visionSynthesis?.longHorizonArchitecture || []).map(
                        (s: string, idx: number) => (
                          <div key={idx}>{s}</div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Zero-Trace Phasing Scratchpad */}
              <div className="mt-3 rounded-xl border border-purple-400/30 bg-black/50 p-3">
                <div className="font-mono text-[11px] font-bold text-purple-300 uppercase">
                  2. Phasing Mode Zero-Trace Ephemeral Vault (Auto-Shreds on Unphase)
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={zeroTraceNote}
                    onChange={(e) => setZeroTraceNote(e.target.value)}
                    placeholder="Ephemeral zero-trace note (wipes automatically when Phase Mode exits)…"
                    className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await api.avengersAction('vision/zero-trace', {
                        filename: 'phase-secret.txt',
                        content: zeroTraceNote || 'Zero-trace payload',
                      });
                      setPhaseEnabled(true);
                      setZeroTraceStatus(`Isolated in RAM/Temp (${out.ephemeralPath}) — shreds on unphase.`);
                    }}
                    className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 font-mono text-xs font-bold text-purple-100 cursor-pointer"
                  >
                    Phase &amp; Isolate
                  </button>
                </div>
                {zeroTraceStatus && (
                  <div className="mt-1.5 font-mono text-[10px] text-purple-200">{zeroTraceStatus}</div>
                )}
              </div>
            </div>

            {/* 3. Mind-Stone Global Threat & CVE Nexus */}
            <div className="space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-950/85 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-300 uppercase">
                  <Globe className="h-4 w-4" />
                  <span>3. Mind-Stone Threat Nexus</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.avengersAction('vision/nexus', {});
                    setNexusCorrelations(out.correlations || []);
                  }}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-cyan-100 cursor-pointer"
                >
                  Correlate Now
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Cross-checks CVEs, advisories, and SDK updates directly against your local{' '}
                <code className="text-cyan-200">SARA</code> &amp;{' '}
                <code className="text-cyan-200">AttendEasy</code> dependencies.
              </p>
              <div className="space-y-2">
                {nexusCorrelations.slice(0, 5).map((c) => (
                  <div
                    key={String(c.id)}
                    className="rounded-xl border border-white/10 bg-black/50 p-2.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="font-bold text-amber-300">
                        {String(c.affectedProject)} :: {String(c.matchedDependency)}
                      </span>
                      <span className="uppercase text-cyan-300">{String(c.severity)}</span>
                    </div>
                    <div className="mt-1 text-slate-200">{String(c.advisoryTitle)}</div>
                    <div className="mt-1 font-mono text-[10px] text-emerald-300">
                      Action: {String(c.preemptiveAction)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STARK 3D WIREFRAME LAB + HAND GESTURES + FORENSIC TIMELINE SCRUBBER */}
        {activeTab === 'stark_lab' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Stark3dBlueprintCanvas />
            </div>

            {/* Iron Man 3 Forensic Timeline Scrubber */}
            <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-slate-950/85 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300 uppercase">
                  <Clock className="h-4 w-4" />
                  <span>Forensic Timeline Scrubber</span>
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await api.avengersAction('jarvis/forensic-event', {
                      source: 'terminal_error',
                      severity: 'critical',
                      title: 'Simulated Build Spike / Port Collision',
                      detail: 'Port 4310 contention detected before auto-reroute.',
                    });
                    await refreshAll();
                  }}
                  className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-mono text-[10px] text-amber-100 cursor-pointer"
                >
                  + Log Marker
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Scrub backward across screen memory, git commits, resource spikes, and errors to pinpoint exact root cause.
              </p>

              {timelineFrames.length > 0 && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, timelineFrames.length - 1)}
                    value={Math.min(scrubIndex, timelineFrames.length - 1)}
                    onChange={(e) => setScrubIndex(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                  {timelineFrames[scrubIndex] && (
                    <div className="rounded-xl border border-amber-400/40 bg-black/60 p-3 text-xs">
                      <div className="font-mono text-[10px] text-amber-300">
                        T-{String(timelineFrames[scrubIndex].minutesAgo)}m •{' '}
                        {String(timelineFrames[scrubIndex].source).toUpperCase()}
                      </div>
                      <div className="mt-1 font-bold text-white">
                        {String(timelineFrames[scrubIndex].title)}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-300">
                        {String(timelineFrames[scrubIndex].detail)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {rootCauseFrame && (
                <div className="rounded-xl border border-rose-400/40 bg-rose-950/25 p-3 text-[11px]">
                  <div className="font-mono text-[10px] font-bold text-rose-300 uppercase">
                    Root-Cause Inflection Point
                  </div>
                  <div className="mt-0.5 font-semibold text-rose-100">{String(rootCauseFrame.title)}</div>
                  <div className="text-slate-300">{String(rootCauseFrame.detail)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: E.D.I.T.H. LIVE AR GLASSES LENS + ABORT ROLLBACK */}
        {activeTab === 'edith_lens' && <EdithArLensView />}

        {/* TAB 4: F.R.I.D.A.Y. FIGHT-PATTERN COUNTER ENGINE + SUIT SUBSYSTEM REROUTE MAP */}
        {activeTab === 'friday_tactical' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Analyze His Fight Pattern */}
            <div className="space-y-3 rounded-2xl border border-emerald-400/35 bg-slate-950/85 p-4">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-300 uppercase">
                <Swords className="h-4 w-4" />
                <span>F.R.I.D.A.Y. // &ldquo;Analyze His Fight Pattern&rdquo; Counter-Strategy</span>
              </div>
              <select
                value={fightCategory}
                onChange={(e) => setFightCategory(e.target.value as typeof fightCategory)}
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs text-white outline-none"
              >
                <option value="compiler_loop">Recurring Compiler / Test Failure Loop</option>
                <option value="interview_exam">Live Technical Interview / Viva Trap</option>
                <option value="negotiation">Client Scope / Pricing Negotiation</option>
                <option value="adversarial_debug">Heisenbug / Race Condition Rhythm</option>
              </select>
              <textarea
                rows={3}
                value={fightInput}
                onChange={(e) => setFightInput(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/60 p-3 font-mono text-xs text-white outline-none"
              />
              <button
                type="button"
                onClick={async () => {
                  const out = await api.avengersAction('friday/fight-pattern', {
                    category: fightCategory,
                    history: [fightInput],
                  });
                  setFridayStrategy(out.strategy);
                }}
                className="w-full rounded-xl border border-emerald-400/50 bg-emerald-500/25 px-4 py-2 font-mono text-xs font-bold text-emerald-100 uppercase hover:bg-emerald-500/40 cursor-pointer"
              >
                Analyze Rhythm &amp; Generate Counter-Move
              </button>

              {fridayStrategy && (
                <div className="space-y-1.5 rounded-xl border border-emerald-400/40 bg-black/60 p-3 text-xs">
                  <div className="font-mono text-[10px] text-amber-300">
                    RHYTHM: {String(fridayStrategy.rhythmDetected)}
                  </div>
                  <div className="text-slate-300">
                    <strong>Weak Spot:</strong> {String(fridayStrategy.opponentWeakSpot)}
                  </div>
                  <div className="font-semibold text-emerald-300">
                    {String(fridayStrategy.counterMove)}
                  </div>
                </div>
              )}
            </div>

            {/* Suit Damage / Subsystem Self-Reroute Map */}
            <div className="space-y-3 rounded-2xl border border-cyan-400/35 bg-slate-950/85 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-300 uppercase">
                  <Cpu className="h-4 w-4" />
                  <span>Live Suit Subsystem &amp; Power Reroute Map</span>
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await api.avengersAction('friday/suit-reroute', {
                        simulateFaultIn: 'gemini_cloud_brain',
                      });
                      setSuitMap(out);
                    }}
                    className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-mono text-[10px] text-amber-100 cursor-pointer"
                  >
                    Simulate Cloud Drop
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const out = await api.avengersAction('friday/suit-reroute', {
                        simulateFaultIn: 'clear',
                      });
                      setSuitMap(out);
                    }}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 font-mono text-[10px] text-emerald-100 cursor-pointer"
                  >
                    Restore Nominal
                  </button>
                </div>
              </div>

              {suitMap && (
                <>
                  <div className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 font-mono text-[11px] text-cyan-200">
                    {String(suitMap.spokenStatus)}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(suitMap.organs || []).map((org: Record<string, any>) => (
                      <div
                        key={String(org.organId)}
                        className={`rounded-xl border p-2.5 text-[11px] ${
                          org.rerouteEngaged
                            ? 'border-amber-400/60 bg-amber-950/30 text-amber-100'
                            : 'border-emerald-400/30 bg-black/50 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px] font-bold">
                          <span>{String(org.label)}</span>
                          <span>{String(org.integrityPct)}%</span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-cyan-300">
                          {String(org.activePathway)}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: G.R.I.O.T. REMOTE COCKPIT + VERONICA DROP-POD + K.A.R.E.N. RECON DRONES */}
        {activeTab === 'wakanda_orbital' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GriotRemoteCockpitView />
            </div>

            <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-slate-950/85 p-4">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-300 uppercase">
                <Shield className="h-4 w-4" />
                <span>VERONICA Orbital Drop-Pod (60s Bare-Metal Restore)</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const out = await api.avengersAction('veronica/drop-pod', {
                    passphrase: 'stark-orbital-veronica-key',
                  });
                  setVeronicaInfo(
                    `Deployed ${out.bytes}B AES-256-GCM .veronica pod (${out.includedLearnedSkills} learned skills) -> ${out.podPath}`,
                  );
                }}
                className="w-full rounded-xl border border-amber-400/50 bg-amber-500/20 px-3 py-2 font-mono text-xs font-bold text-amber-100 hover:bg-amber-500/35 cursor-pointer"
              >
                Launch Encrypted .veronica Drop-Pod
              </button>
              {veronicaInfo && (
                <div className="rounded-lg border border-white/10 bg-black/60 p-2 font-mono text-[10px] text-emerald-300">
                  {veronicaInfo}
                </div>
              )}

              <div className="pt-2 flex items-center gap-2 font-mono text-xs font-bold text-cyan-300 uppercase">
                <Radar className="h-4 w-4" />
                <span>K.A.R.E.N. Scout Recon Drones</span>
              </div>
              <input
                type="text"
                value={karenName}
                onChange={(e) => setKarenName(e.target.value)}
                placeholder="Drone Name"
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 text-xs text-white outline-none"
              />
              <input
                type="text"
                value={karenUrl}
                onChange={(e) => setKarenUrl(e.target.value)}
                placeholder="Target URL to monitor…"
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-xs text-cyan-200 outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await api.avengersAction('karen/drone', {
                      name: karenName,
                      targetUrl: karenUrl,
                      watchKeywords: ['release', 'update'],
                    });
                    await refreshAll();
                  }}
                  className="flex-1 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs font-bold text-cyan-100 cursor-pointer"
                >
                  Deploy Drone
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const out = await api.avengersAction('karen/sweep');
                    setKarenDrones(out.drones || []);
                  }}
                  className="flex-1 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-bold text-emerald-100 cursor-pointer"
                >
                  Recon Sweep
                </button>
              </div>
              <div className="max-h-36 space-y-1.5 overflow-y-auto">
                {karenDrones.map((d) => (
                  <div
                    key={String(d.droneId)}
                    className="rounded-lg border border-white/10 bg-black/50 p-2 font-mono text-[10px]"
                  >
                    <div className="font-bold text-cyan-200">{String(d.name)}</div>
                    <div className="text-slate-400">{String(d.lastSummary)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer Quick Bar */}
      <footer className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-t border-amber-400/20 bg-slate-950/85 px-5 py-2 font-mono text-[10px] text-slate-400">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-amber-400" />
          <span>
            Direct Mobile Routes: <code className="text-cyan-300">/edith</code> (Phone AR Glasses) •{' '}
            <code className="text-purple-300">/remote-cockpit</code> (G.R.I.O.T. PC Pilot) •{' '}
            <code className="text-amber-300">/?mode=vision</code>
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            await api.avengersAction('edith/abort', {});
            await refreshAll();
          }}
          className="flex items-center gap-1 rounded border border-rose-400/50 bg-rose-500/20 px-2.5 py-0.5 font-bold text-rose-200 hover:bg-rose-500/35 cursor-pointer"
        >
          <AlertOctagon className="h-3 w-3" />
          <span>GLOBAL ABORT &amp; ROLLBACK</span>
        </button>
      </footer>
    </div>
  );
};

export default VisionApp;
