import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Camera, KeyRound, LockKeyhole, Loader2, Mic, ShieldAlert, ShieldCheck, Zap } from "lucide-react";

type SecurityStatus = {
  required?: boolean;
  gateActive?: boolean;
  authorized?: boolean;
  enrolled: boolean;
  authenticated: boolean;
  passphraseEnrolled?: boolean;
  recoveryCodeConfigured?: boolean;
  lockdownActive?: boolean;
  intrusionCount?: number;
};

type StartupAuthStatus = {
  mode: "vm_instant_bypass" | "startup_any_factor" | "startup_strict_3fa";
  verifiedForSession: boolean;
  enabledFactors: { face: boolean; voice: boolean; password: boolean };
  enrolled: { face: boolean; voicePhrase: string; passwordConfigured: boolean };
};

type AuthMode = "face" | "voice" | "pin" | "passphrase" | "recovery";

export function OwnerAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [startupAuth, setStartupAuth] = useState<StartupAuthStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AuthMode>("pin");
  const [secret, setSecret] = useState("");
  const [voiceInput, setVoiceInput] = useState("");
  const [faceChecked, setFaceChecked] = useState(false);
  const [error, setError] = useState("");
  const [generatedRecovery, setGeneratedRecovery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [secRes, startRes] = await Promise.all([
        fetch("/api/security/status", { cache: "no-store" }),
        fetch("/api/commander/startup-auth", { cache: "no-store" }),
      ]);
      if (secRes.ok) {
        const body = (await secRes.json()) as SecurityStatus;
        setStatus(body);
      }
      if (startRes.ok) {
        const sb = (await startRes.json()) as { startupAuth?: StartupAuthStatus };
        if (sb.startupAuth) setStartupAuth(sb.startupAuth);
      }
    } catch {
      /* backend still booting — fail open only if unreachable before load */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!loaded) {
    return <>{children}</>;
  }

  const lockdownActive = status?.lockdownActive === true;
  const startupNeedsGate =
    startupAuth &&
    startupAuth.mode !== "vm_instant_bypass" &&
    !startupAuth.verifiedForSession;

  const shieldGateRequired =
    !startupAuth?.verifiedForSession &&
    (status?.gateActive === true || status?.required === true) &&
    status?.authorized !== true;

  if (!lockdownActive && !startupNeedsGate && !shieldGateRequired && !generatedRecovery) {
    return <>{children}</>;
  }

  const handleFaceScan = async () => {
    setBusy(true);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setFaceChecked(true);
      const res = await fetch("/api/commander/startup-auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facePresent: true }),
      });
      if (res.ok) {
        await refresh();
        return;
      }
    } catch {
      setError("Camera unavailable — verify with Voice phrase, Password, or VM Instant Unlock.");
    } finally {
      setBusy(false);
    }
  };

  const handleStartupVerify = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/commander/startup-auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          facePresent: faceChecked,
          voiceTranscript: voiceInput.trim() || undefined,
          password: secret.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.reason || body.error || "Startup verification failed.");
      }
      setSecret("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleEnableVmBypass = async () => {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/commander/startup-auth/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "vm_instant_bypass" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const firstSetup = Boolean(status && !status.enrolled && !startupNeedsGate);

  const submitLegacyShield = async () => {
    if (startupNeedsGate && !lockdownActive) {
      await handleStartupVerify();
      return;
    }
    if (busy || secret.trim().length < 4) return;
    setBusy(true);
    setError("");
    try {
      let endpoint = "/api/security/authenticate";
      let payload: Record<string, unknown> = {};
      if (firstSetup) {
        if (mode === "passphrase") {
          endpoint = "/api/security/enroll-passphrase";
          payload = { passphrase: secret.trim() };
        } else {
          endpoint = "/api/security/enroll-pin";
          payload = { pin: secret.trim() };
        }
      } else if (mode === "passphrase") {
        payload = { passphrase: secret.trim() };
      } else if (mode === "recovery") {
        payload = { recoveryCode: secret.trim() };
      } else {
        payload = { pin: secret.trim() };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || (endpoint === "/api/security/authenticate" && body.ok !== true)) {
        throw new Error(body.reason || body.error || "Authentication failed.");
      }
      if (typeof body.recoveryCode === "string" && body.recoveryCode) {
        setGeneratedRecovery(body.recoveryCode);
      }
      setSecret("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  if (generatedRecovery) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050509] text-white">
        <div className="w-[min(92vw,480px)] rounded-3xl border border-emerald-400/30 bg-[#07111f]/95 p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <KeyRound className="text-emerald-300" />
          </div>
          <h2 className="text-center text-lg font-semibold">Emergency Recovery Code</h2>
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-black/50 px-4 py-3 text-center font-mono text-sm tracking-widest text-emerald-200 select-all">
            {generatedRecovery}
          </div>
          <button
            type="button"
            onClick={() => setGeneratedRecovery(null)}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white cursor-pointer"
          >
            Enter SARA / J.A.R.V.I.S. (Zero Mid-Task Prompts)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050509] text-white">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitLegacyShield();
        }}
        className="w-[min(94vw,520px)] rounded-3xl border border-cyan-400/25 bg-[#07111f]/95 p-7 shadow-[0_0_80px_rgba(0,190,255,0.14)]"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10">
          {lockdownActive ? <ShieldAlert className="text-rose-300" /> : <LockKeyhole className="text-cyan-200" />}
        </div>
        <h1 className="text-center text-xl font-semibold">
          {lockdownActive
            ? "Emergency Lockdown Active"
            : "SARA ⇄ J.A.R.V.I.S. Startup Verification"}
        </h1>
        <p className="mt-1.5 text-center text-xs text-slate-400">
          Verify once before startup (Face, Voice, or Password) — after this, SARA & J.A.R.V.I.S. control the entire OS with zero permission popups.
        </p>

        <div className="mt-5 grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => void handleFaceScan()}
            className={`rounded-xl border p-2.5 text-center transition cursor-pointer ${faceChecked ? "border-emerald-400/50 bg-emerald-500/15" : "border-white/10 bg-black/25 hover:border-cyan-400/40"}`}
          >
            <Camera className="mx-auto mb-1 text-cyan-200" size={16} />
            <div className="text-[11px] font-medium">Face</div>
            <div className="text-[9px] text-emerald-300">{faceChecked ? "Verified" : "Scan"}</div>
          </button>
          <button
            type="button"
            onClick={() => { setMode("voice"); setError(""); }}
            className={`rounded-xl border p-2.5 text-center transition cursor-pointer ${mode === "voice" ? "border-cyan-400/50 bg-cyan-400/15" : "border-white/10 bg-black/25"}`}
          >
            <Mic className="mx-auto mb-1 text-cyan-200" size={16} />
            <div className="text-[11px] font-medium">Voice</div>
            <div className="text-[9px] text-cyan-300">Phrase</div>
          </button>
          <button
            type="button"
            onClick={() => { setMode("pin"); setError(""); }}
            className={`rounded-xl border p-2.5 text-center transition cursor-pointer ${mode === "pin" || mode === "passphrase" ? "border-cyan-400/50 bg-cyan-400/15" : "border-white/10 bg-black/25"}`}
          >
            <ShieldCheck className="mx-auto mb-1 text-cyan-200" size={16} />
            <div className="text-[11px] font-medium">Password</div>
            <div className="text-[9px] text-emerald-300">PIN/Pass</div>
          </button>
          <button
            type="button"
            disabled={lockdownActive}
            onClick={() => void handleEnableVmBypass()}
            className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-2.5 text-center transition hover:bg-amber-500/20 disabled:opacity-35 cursor-pointer"
          >
            <Zap className="mx-auto mb-1 text-amber-300" size={16} />
            <div className="text-[11px] font-medium text-amber-100">VM Auto</div>
            <div className="text-[9px] text-amber-300">0-Prompt</div>
          </button>
        </div>

        {mode === "voice" ? (
          <div className="mt-4">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400">
              Voice Passphrase (default: &ldquo;{startupAuth?.enrolled?.voicePhrase || "sara command override"}&rdquo;)
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Speak or type startup voice phrase…"
              value={voiceInput}
              onChange={(e) => setVoiceInput(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
        ) : (
          <div className="mt-4">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400">
              Password / Owner PIN / Recovery Code
            </label>
            <input
              autoFocus
              type="password"
              placeholder="Enter password or PIN…"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
        )}

        <button
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 text-sm font-semibold disabled:opacity-40 cursor-pointer"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Verify Once &amp; Unlock Full Autonomous OS
        </button>

        {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      </form>
    </div>
  );
}
