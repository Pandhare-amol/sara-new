import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Mic,
  MicOff,
  Power,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { SaraCoreState } from '../types';
import { SaraAudioSession, type LiveState } from '../../../../../src/lib/saraAudio';

interface ChatMessage {
  id: string;
  role: 'boss' | 'jarvis';
  text: string;
  tag?: string;
  at: number;
}

interface PendingApproval {
  id: string;
  title: string;
  summary: string;
}

export interface TransparentJarvisChatProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onSetCoreState: (state: SaraCoreState, voiceLevel?: number) => void;
  onPulseWave: () => void;
  onSwitchSurface?: (mode: 'companion' | 'live_core' | 'ultron' | 'sara_os' | 'central_os') => void;
}

export const TransparentJarvisChat: React.FC<TransparentJarvisChatProps> = ({
  isOpen,
  onToggleOpen,
  onSetCoreState,
  onPulseWave,
  onSwitchSurface,
}) => {
  const [liveState, setLiveState] = useState<LiveState>('disconnected');
  const [micPaused, setMicPaused] = useState(false);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [liveCaption, setLiveCaption] = useState('');
  const liveSessionRef = useRef<SaraAudioSession | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [proactiveAlert, setProactiveAlert] = useState<string | null>(null);
  const [ledgerNetInr, setLedgerNetInr] = useState<number>(0);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'jarvis-welcome',
      role: 'jarvis',
      text: "J.A.R.V.I.S. online, Boss. Full-duplex voice, desktop control, executive ledger, Boardroom agents, and Smart Room bridge are standing by. Say 'activate Ultron' or 'switch to SARA' anytime.",
      tag: 'READY',
      at: Date.now(),
    },
  ]);

  const appendReply = useCallback((text: string, tag = 'J.A.R.V.I.S.') => {
    setMessages((prev) => [
      ...prev.slice(-30),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'jarvis',
        text,
        tag,
        at: Date.now(),
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, liveCaption]);

  // Real Gemini Live Voice Session (uses J.A.R.V.I.S. male voice configured on backend)
  useEffect(() => {
    const session = new SaraAudioSession({
      onStateChange: (st) => {
        setLiveState(st);
        if (st === 'disconnected') {
          setMicPaused(false);
          setLiveCaption('');
          onSetCoreState('idle', 0);
        } else if (st === 'connecting') {
          onSetCoreState('thinking', 0.32);
        } else if (st === 'listening') {
          onSetCoreState('listening', 0.48);
        } else if (st === 'speaking') {
          onSetCoreState('speaking', 0.8);
          onPulseWave();
        }
      },
      onTranscription: (role, text) => {
        if (!text.trim()) return;
        setLiveCaption(`${role === 'user' ? 'Boss' : 'J.A.R.V.I.S.'}: ${text}`);
        if (role === 'model') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.tag === 'LIVE VOICE' && Date.now() - last.at < 3500) {
              return [...prev.slice(0, -1), { ...last, text: `${last.text}${text}`, at: Date.now() }];
            }
            return [
              ...prev.slice(-30),
              { id: `${Date.now()}-jv`, role: 'jarvis', text, tag: 'LIVE VOICE', at: Date.now() },
            ];
          });
        } else {
          setMessages((prev) => [
            ...prev.slice(-30),
            { id: `${Date.now()}-bv`, role: 'boss', text, tag: 'VOICE', at: Date.now() },
          ]);
        }
      },
      onToolCall: (_name, _args, cb) => {
        cb({ result: 'Executed in J.A.R.V.I.S. Core.' });
      },
      onError: (err) => {
        appendReply(`Voice link notice: ${err}`, 'VOICE');
      },
    });
    liveSessionRef.current = session;
    return () => {
      session.disconnect();
      liveSessionRef.current = null;
    };
  }, [onSetCoreState, onPulseWave, appendReply]);

  useEffect(() => {
    liveSessionRef.current?.setSpeechMuted(speechMuted);
  }, [speechMuted]);

  const refreshExecutiveHud = useCallback(async () => {
    try {
      const res = await fetch('/api/executive/status');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.pendingApprovals)) {
        setApprovals(data.pendingApprovals.slice(0, 3));
      }
      if (typeof data.ledger?.netCashFlowInr === 'number') {
        setLedgerNetInr(data.ledger.netCashFlowInr);
      }
      if (Array.isArray(data.proactiveAlerts) && data.proactiveAlerts[0]) {
        setProactiveAlert(data.proactiveAlerts[0].spokenLine);
      }
    } catch {
      // Resilient background sync
    }
  }, []);

  useEffect(() => {
    void refreshExecutiveHud();
    const timer = window.setInterval(() => void refreshExecutiveHud(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshExecutiveHud]);

  const toggleLiveVoice = async () => {
    const session = liveSessionRef.current;
    if (!session) return;
    if (liveState !== 'disconnected') {
      session.disconnect();
      return;
    }
    try {
      await session.connect(true);
    } catch (err) {
      appendReply(err instanceof Error ? err.message : 'Unable to connect J.A.R.V.I.S. voice.', 'VOICE');
    }
  };

  const handleResolveApproval = async (id: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/executive/approvals/${encodeURIComponent(id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        appendReply(approved ? 'Approved and dispatched, Boss.' : 'Item rejected and archived, Boss.', 'APPROVAL');
        void refreshExecutiveHud();
      }
    } catch {
      // Ignore
    }
  };

  const sendCommand = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    if (!overrideText) setInput('');

    setMessages((prev) => [
      ...prev.slice(-30),
      { id: `${Date.now()}-u`, role: 'boss', text, at: Date.now() },
    ]);

    if (
      liveState !== 'disconnected' &&
      liveSessionRef.current &&
      !/^(task:|mission:|cmd:|ps:|shell:|log |boardroom|lock down|activate ultron|switch to)/i.test(text)
    ) {
      liveSessionRef.current.sendText(text);
      return;
    }

    setBusy(true);
    onSetCoreState('thinking', 0.35);
    try {
      const res = await fetch('/api/jarvis/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendReply(data.error || 'Directive failed.', 'ERROR');
        onSetCoreState('idle');
        return;
      }
      onPulseWave();
      appendReply(data.reply || 'Done, Boss.', String(data.intent || 'JARVIS').toUpperCase());
      if (data.surfaceMode && data.surfaceMode !== 'live_core' && onSwitchSurface) {
        onSwitchSurface(data.surfaceMode);
        return;
      }
      onSetCoreState('completed', 0.45);
      window.setTimeout(() => onSetCoreState('idle'), 1100);
      void refreshExecutiveHud();
    } catch (err) {
      appendReply(err instanceof Error ? err.message : 'Unable to reach J.A.R.V.I.S. runtime.', 'ERROR');
      onSetCoreState('idle');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        className="pointer-events-auto fixed top-28 right-5 z-25 flex items-center gap-2 rounded-full border border-cyan-400/40 bg-[#040c1a]/45 px-3.5 py-2 text-xs font-semibold text-cyan-100 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-md transition hover:bg-cyan-500/20 cursor-pointer"
      >
        <MessageSquare className="h-3.5 w-3.5 text-cyan-300" />
        <span>J.A.R.V.I.S. Chat</span>
        {approvals.length > 0 && (
          <span className="rounded-full bg-amber-500/30 px-1.5 py-0.5 font-mono text-[9px] text-amber-200">
            {approvals.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <aside className="pointer-events-auto fixed top-28 right-5 bottom-28 z-25 flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#030917]/30 shadow-[0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur-md">
      {/* Transparent Header + Full-Duplex Voice Controls */}
      <div className="flex items-center justify-between border-b border-cyan-400/20 bg-black/25 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-cyan-300" />
          <div>
            <div className="font-mono text-[10px] font-bold tracking-widest text-white uppercase">
              J.A.R.V.I.S. // LIVE CHAT
            </div>
            <div className="font-mono text-[9px] text-cyan-200/80">
              {liveState === 'disconnected'
                ? `NET ₹${ledgerNetInr.toLocaleString()}`
                : `VOICE: ${liveState.toUpperCase()}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleLiveVoice()}
            title={liveState !== 'disconnected' ? 'End Full-Duplex Voice' : 'Start Full-Duplex J.A.R.V.I.S. Voice'}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition cursor-pointer ${
              liveState !== 'disconnected'
                ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
                : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
            }`}
          >
            <Power className="h-3 w-3" />
            <span>{liveState !== 'disconnected' ? 'Live' : 'Voice'}</span>
          </button>

          {liveState !== 'disconnected' && (
            <button
              type="button"
              onClick={() => {
                const next = !micPaused;
                setMicPaused(next);
                liveSessionRef.current?.setListeningPaused(next);
              }}
              title={micPaused ? 'Resume Mic' : 'Pause Mic'}
              className="rounded-lg border border-white/15 bg-white/10 p-1 text-slate-200 hover:bg-white/20 cursor-pointer"
            >
              {micPaused ? <MicOff className="h-3 w-3 text-amber-300" /> : <Mic className="h-3 w-3" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSpeechMuted((v) => !v)}
            title={speechMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="rounded-lg border border-white/15 bg-white/10 p-1 text-slate-200 hover:bg-white/20 cursor-pointer"
          >
            {speechMuted ? <VolumeX className="h-3 w-3 text-rose-300" /> : <Volume2 className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={onToggleOpen}
            title="Minimize Transparent Chat Panel"
            className="rounded-lg p-1 text-slate-300 hover:bg-white/10 cursor-pointer"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Proactive Interrupt Alert Strip */}
      {proactiveAlert && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-400/25 bg-amber-500/15 px-3 py-1.5 text-[10px] text-amber-100">
          <span className="flex items-center gap-1.5 truncate">
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" />
            <span className="truncate">{proactiveAlert}</span>
          </span>
          <button
            type="button"
            onClick={() => setProactiveAlert(null)}
            className="text-amber-200/70 hover:text-white cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Pending One-Click Approval Queue */}
      {approvals.length > 0 && (
        <div className="space-y-1.5 border-b border-cyan-400/20 bg-cyan-950/25 px-3 py-2">
          <div className="font-mono text-[9px] font-bold tracking-wider text-cyan-200 uppercase">
            Approval Queue ({approvals.length})
          </div>
          {approvals.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px]"
            >
              <span className="truncate text-white" title={a.summary}>
                {a.title}
              </span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => void handleResolveApproval(a.id, true)}
                  className="flex items-center gap-0.5 rounded bg-emerald-500/30 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100 hover:bg-emerald-500/45 cursor-pointer"
                >
                  <Check className="h-2.5 w-2.5" /> OK
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolveApproval(a.id, false)}
                  className="rounded bg-rose-500/30 px-1.5 py-0.5 text-[9px] text-rose-100 hover:bg-rose-500/45 cursor-pointer"
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transparent Message Stream */}
      <div ref={scrollRef} className="sara-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
              m.role === 'boss'
                ? 'ml-8 border border-white/20 bg-white/12 text-white'
                : 'mr-4 border border-cyan-400/25 bg-[#041428]/45 text-cyan-50'
            }`}
          >
            <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] tracking-wider text-slate-300/80 uppercase">
              <span>{m.role === 'boss' ? 'Boss' : 'J.A.R.V.I.S.'}</span>
              {m.tag && <span className="text-cyan-300">{m.tag}</span>}
            </div>
            <div className="whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}
        {liveCaption && (
          <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/30 px-2.5 py-1.5 text-[10px] text-cyan-100">
            {liveCaption}
          </div>
        )}
      </div>

      {/* Quick Movie-Grade Action Pills */}
      <div className="flex flex-wrap gap-1 border-t border-white/10 bg-black/20 px-3 py-1.5">
        {[
          ['Briefing', 'Morning executive briefing'],
          ['Log ₹1,200', 'Log ₹1,200 for server hosting'],
          ['Boardroom', 'Boardroom: evaluate AttendEasy growth & pricing'],
          ['Lock Room', 'Lock down the workspace'],
          ['Ultron UI', 'activate ultron'],
        ].map(([label, cmd]) => (
          <button
            key={label}
            type="button"
            onClick={() => void sendCommand(cmd)}
            className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-medium text-cyan-100 hover:bg-cyan-500/25 cursor-pointer"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Transparent Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendCommand();
        }}
        className="flex items-center gap-1.5 border-t border-cyan-400/20 bg-black/35 p-2.5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Chat or command J.A.R.V.I.S.…"
          className="h-9 flex-1 rounded-xl border border-white/20 bg-black/35 px-3 text-xs text-white placeholder-slate-300/60 outline-none focus:border-cyan-400/70"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label="Send message to J.A.R.V.I.S."
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-500/25 text-cyan-100 hover:bg-cyan-500/40 disabled:opacity-40 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </aside>
  );
};
