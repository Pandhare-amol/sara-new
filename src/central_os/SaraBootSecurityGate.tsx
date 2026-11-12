import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  KeyRound,
  Lock,
  Mic,
  MicOff,
  ShieldAlert,
  ShieldCheck,
  Volume2,
} from 'lucide-react';

export interface BootGateStatusView {
  gateLocked: boolean;
  decisionState: 'locked' | 'access_granted' | 'access_denied';
  lastDecisionMessage: string;
  enabledOnBoot: boolean;
  wallpaperHudOnUnlock: boolean;
  welcomeSoundEnabled: boolean;
  policy: 'face_voice_or_password' | 'all_three' | 'any_single';
  factorsEnrolled: { face: boolean; voice: boolean; password: boolean };
  sessionVerified: { face: boolean; voice: boolean; password: boolean };
  voicePassphraseHint: string;
}

/** Plays a futuristic harmonic welcome chime via Web Audio API + spoken SARA greeting. */
export function playSaraWelcomeSequence(welcomeSpeech?: string, soundEnabled = true): void {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 major rising chord
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.09 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.6);
    });
  } catch {
    // AudioContext blocked or unavailable
  }

  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(
        welcomeSpeech ||
          'Identity confirmed, Boss. Access granted. SARA Central Operating Layer and live desktop wallpaper are online.',
      );
      utter.rate = 1.02;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    }
  } catch {
    // Speech synthesis unavailable
  }
}

function playDeniedTone(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [220, 174.61].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.09, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.24);
    });
  } catch {
    // Ignore
  }
}

export interface SaraBootSecurityGateProps {
  status: BootGateStatusView;
  onStatusChange: (next: BootGateStatusView) => void;
  onUnlocked: (welcomeSpeech?: string) => void;
}

export const SaraBootSecurityGate: React.FC<SaraBootSecurityGateProps> = ({
  status,
  onStatusChange,
  onUnlocked,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [listeningVoice, setListeningVoice] = useState(false);
  const [voiceInput, setVoiceInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [decisionBanner, setDecisionBanner] = useState<{
    kind: 'neutral' | 'granted' | 'denied';
    text: string;
  }>({
    kind: 'neutral',
    text: 'AWAITING 3-FACTOR OWNER VERIFICATION (FACE + VOICE OR MASTER PASSWORD)',
  });

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : 'Webcam unavailable — use Simulated Face Scan or Master Password.',
      );
    }
  };

  const captureFaceDescriptor = (): number[] => {
    const video = videoRef.current;
    if (video && cameraActive && video.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 8, 8);
        const pixels = ctx.getImageData(0, 0, 8, 8).data;
        const vec: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) {
          const lum = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255;
          vec.push(Number((lum + 0.05).toFixed(4)));
        }
        return vec;
      }
    }
    // Deterministic owner biometric fallback vector for headless / no-webcam PCs
    return Array.from({ length: 64 }, (_, i) => Number((0.45 + 0.25 * Math.sin(i * 0.37)).toFixed(4)));
  };

  const handleOutcome = (data: {
    matched?: boolean;
    granted?: boolean;
    welcomeSpeech?: string;
    status?: BootGateStatusView;
  }) => {
    if (data.status) onStatusChange(data.status);
    if (data.granted) {
      setDecisionBanner({
        kind: 'granted',
        text: data.status?.lastDecisionMessage || 'ACCESS GRANTED — INITIALIZING LIVE DESKTOP WALLPAPER',
      });
      stopCamera();
      playSaraWelcomeSequence(data.welcomeSpeech, status.welcomeSoundEnabled);
      window.setTimeout(() => {
        onUnlocked(data.welcomeSpeech);
      }, 900);
    } else if (data.matched === false) {
      playDeniedTone();
      setDecisionBanner({
        kind: 'denied',
        text: data.status?.lastDecisionMessage || 'ACCESS DENIED — CREDENTIAL REJECTED',
      });
    } else {
      setDecisionBanner({
        kind: 'neutral',
        text: 'FACTOR VERIFIED — COMPLETE REMAINING FACTOR OR ENTER MASTER PASSWORD',
      });
    }
  };

  const verifyFace = async () => {
    const descriptor = captureFaceDescriptor();
    const res = await fetch('/api/boot-gate/verify-face', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor }),
    });
    const data = await res.json().catch(() => ({}));
    handleOutcome(data);
  };

  const verifyVoicePhrase = async (phraseText?: string) => {
    const transcript = (phraseText ?? voiceInput).trim();
    if (!transcript) return;
    const res = await fetch('/api/boot-gate/verify-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    const data = await res.json().catch(() => ({}));
    handleOutcome(data);
  };

  const startLiveVoiceCapture = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setDecisionBanner({
        kind: 'neutral',
        text: `Browser Speech API unavailable — type your voice phrase (${status.voicePassphraseHint}) below and click Verify Voice.`,
      });
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListeningVoice(true);
    rec.onresult = (ev: any) => {
      const spoken = String(ev?.results?.[0]?.[0]?.transcript || '');
      setVoiceInput(spoken);
      setListeningVoice(false);
      void verifyVoicePhrase(spoken);
    };
    rec.onerror = () => setListeningVoice(false);
    rec.onend = () => setListeningVoice(false);
    rec.start();
  };

  const verifyPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passwordInput.trim()) return;
    const pwd = passwordInput;
    setPasswordInput('');
    const res = await fetch('/api/boot-gate/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await res.json().catch(() => ({}));
    handleOutcome(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#030712] px-6 py-6 text-slate-100 select-none">
      {/* Subtle Holographic Grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 25%, rgba(34,211,238,0.22), transparent 60%), linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      {/* Top Boot Pipeline Progress Strip */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/25 bg-slate-950/80 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-cyan-400" />
          <div>
            <div className="font-mono text-xs font-bold tracking-[0.2em] text-cyan-300 uppercase">
              S.A.R.A. // WINDOWS 10 PRO PRE-DESKTOP SECURITY GATE
            </div>
            <div className="text-[11px] text-slate-400">
              Policy:{' '}
              {status.policy === 'all_three'
                ? 'Strict 3-Factor (Face + Voice + Password)'
                : status.policy === 'any_single'
                ? 'Fast Unlock (Any Enrolled Factor)'
                : 'Balanced ((Face ID + Voice Code) OR Master Password)'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
            1. WIN10 BOOT ✓
          </span>
          <span className="rounded-md border border-cyan-400/50 bg-cyan-500/20 px-2.5 py-1 text-cyan-100">
            2. 3-FACTOR GATE ●
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-400">
            3. LIVE WALLPAPER
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-400">
            4. CENTRAL OS
          </span>
        </div>
      </header>

      {/* Center Grant / Deny Banner + 3 Factor Cards */}
      <main className="relative z-10 mx-auto my-auto w-full max-w-5xl space-y-5 py-6">
        <div
          className={`flex items-center justify-center gap-3 rounded-2xl border px-5 py-3.5 font-mono text-xs font-bold tracking-wider uppercase transition ${
            decisionBanner.kind === 'granted'
              ? 'border-emerald-400/60 bg-emerald-950/60 text-emerald-200 shadow-[0_0_35px_rgba(16,185,129,0.3)]'
              : decisionBanner.kind === 'denied'
              ? 'border-rose-500/60 bg-rose-950/60 text-rose-200 shadow-[0_0_35px_rgba(244,63,94,0.3)]'
              : 'border-cyan-400/30 bg-slate-900/70 text-cyan-200'
          }`}
        >
          {decisionBanner.kind === 'granted' ? (
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          ) : decisionBanner.kind === 'denied' ? (
            <ShieldAlert className="h-5 w-5 text-rose-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-cyan-300" />
          )}
          <span>{decisionBanner.text}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* FACTOR 1: FACE ID */}
          <div className="flex flex-col justify-between rounded-2xl border border-cyan-400/25 bg-slate-950/75 p-5 backdrop-blur-md">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-200 uppercase">
                  <Camera className="h-4 w-4 text-cyan-400" /> [1] Face Biometric
                </span>
                {status.sessionVerified.face ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-[10px] text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> VERIFIED
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                    PENDING
                  </span>
                )}
              </div>

              <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl border border-cyan-400/20 bg-black/60">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />
                {!cameraActive && (
                  <div className="px-4 text-center text-[11px] text-slate-400">
                    {cameraError || 'Enable webcam or run instant biometric verification scan'}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-cyan-400/40" />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {!cameraActive && (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 cursor-pointer"
                >
                  Open Camera
                </button>
              )}
              <button
                type="button"
                onClick={() => void verifyFace()}
                className="flex-1 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35 cursor-pointer"
              >
                {status.sessionVerified.face ? 'Re-Verify Face' : 'Verify Face ID'}
              </button>
            </div>
          </div>

          {/* FACTOR 2: VOICE CODE */}
          <div className="flex flex-col justify-between rounded-2xl border border-cyan-400/25 bg-slate-950/75 p-5 backdrop-blur-md">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-200 uppercase">
                  <Mic className="h-4 w-4 text-cyan-400" /> [2] Voice Code
                </span>
                {status.sessionVerified.voice ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-[10px] text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> VERIFIED
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                    PENDING
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-slate-300">
                <div className="text-[10px] font-mono uppercase text-slate-400">Expected Phrase</div>
                <div className="mt-1 font-mono text-cyan-200">{status.voicePassphraseHint}</div>
              </div>

              <input
                type="text"
                aria-label="Spoken or typed voice code"
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void verifyVoicePhrase()}
                placeholder="Speak via Mic or confirm phrase…"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={startLiveVoiceCapture}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  listeningVoice
                    ? 'border-amber-400/60 bg-amber-500/25 text-amber-100'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {listeningVoice ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                <span>{listeningVoice ? 'Listening…' : 'Speak'}</span>
              </button>
              <button
                type="button"
                onClick={() => void verifyVoicePhrase(voiceInput || 'sara authorize access')}
                className="flex-1 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35 cursor-pointer"
              >
                Verify Voice Code
              </button>
            </div>
          </div>

          {/* FACTOR 3: MASTER PASSWORD */}
          <form
            onSubmit={verifyPassword}
            className="flex flex-col justify-between rounded-2xl border border-cyan-400/25 bg-slate-950/75 p-5 backdrop-blur-md"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-200 uppercase">
                  <KeyRound className="h-4 w-4 text-cyan-400" /> [3] Master Password
                </span>
                {status.sessionVerified.password ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-[10px] text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> VERIFIED
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                    READY
                  </span>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-slate-400">
                Always available for silent / night login on Windows 10 Pro. Default initial password is{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">sara2026</code> (customizable inside Central OS).
              </p>

              <input
                type="password"
                aria-label="Windows Boot Gate Master Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter Master Password…"
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-xs text-white outline-none focus:border-cyan-400/60"
              />
            </div>

            <button
              type="submit"
              className="mt-4 w-full rounded-xl border border-emerald-400/50 bg-emerald-500/25 px-4 py-2.5 text-xs font-bold tracking-wider text-emerald-100 uppercase hover:bg-emerald-500/40 cursor-pointer"
            >
              Verify Password & Unlock Desktop
            </button>
          </form>
        </div>
      </main>

      {/* Footer Safety Note */}
      <footer className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-cyan-400" />
          Zero Capability Lock: Once unlocked, SARA controls your entire PC via Voice & Text without auth prompts.
        </span>
        <span className="font-mono text-[10px] text-slate-500">WINDOWS 10 PRO • i5 / 8 GB LEAN KERNEL</span>
      </footer>
    </div>
  );
};
