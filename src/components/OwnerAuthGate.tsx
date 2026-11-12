import { useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyRound, LockKeyhole, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

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

type AuthMode = "pin" | "passphrase" | "recovery";

export function OwnerAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AuthMode>("pin");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [generatedRecovery, setGeneratedRecovery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/security/status", { cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as SecurityStatus;
        setStatus(body);
        if (!body.enrolled) setMode("pin");
        else if (body.passphraseEnrolled && !body.enrolled) setMode("passphrase");
      }
    } catch {
      /* backend still booting — fail open only if unreachable before load */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (!loaded) {
    return <>{children}</>;
  }

  const gateRequired = status?.gateActive === true || status?.required === true;
  const isUnlocked = status?.authorized === true || (status?.authenticated === true && !status?.lockdownActive);
  if (!status || !gateRequired || (isUnlocked && !generatedRecovery)) {
    return <>{children}</>;
  }

  const firstSetup = !status.enrolled;

  const submit = async () => {
    if (busy || secret.trim().length < 6) return;
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
        <div className="w-[min(92vw,480px)] rounded-3xl border border-emerald-400/30 bg-[#07111f]/95 p-8 shadow-[0_0_80px_rgba(16,185,129,0.16)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
            <KeyRound className="text-emerald-300" />
          </div>
          <h2 className="text-center text-lg font-semibold">Emergency Recovery Code</h2>
          <p className="mt-2 text-center text-xs text-slate-300">
            Save this one-time code safely offline. It lets you unlock SARA Security Shield if you forget your PIN or passphrase.
          </p>
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-black/50 px-4 py-3 text-center font-mono text-sm tracking-widest text-emerald-200 select-all">
            {generatedRecovery}
          </div>
          <button
            type="button"
            onClick={() => setGeneratedRecovery(null)}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-semibold text-white"
          >
            I Saved This Code — Enter JARVIS
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
          void submit();
        }}
        className="w-[min(92vw,480px)] rounded-3xl border border-cyan-400/20 bg-[#07111f]/90 p-8 shadow-[0_0_80px_rgba(0,190,255,0.12)]"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10">
          {status.lockdownActive ? <ShieldAlert className="text-rose-300" /> : <LockKeyhole className="text-cyan-200" />}
        </div>
        <h1 className="text-center text-xl font-semibold">
          {status.lockdownActive
            ? "SARA Security Shield — Lockdown"
            : firstSetup
              ? "Enroll SARA Security Shield"
              : "SARA Security Shield Active"}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          {firstSetup
            ? "Protect JARVIS autonomous PC control with your local owner PIN or passphrase."
            : "Authenticate as the enrolled owner to unlock full autonomous JARVIS control."}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => { setMode("pin"); setSecret(""); setError(""); }}
            className={`rounded-xl border p-3 text-center transition ${mode === "pin" ? "border-cyan-400/40 bg-cyan-400/15" : "border-white/10 bg-black/20 opacity-75"}`}
          >
            <ShieldCheck className="mx-auto mb-1 text-cyan-200" size={18} />
            <div className="text-xs text-white">Owner PIN</div>
            <div className="mt-1 text-[10px] text-emerald-300">6+ Digits</div>
          </button>
          <button
            type="button"
            onClick={() => { setMode("passphrase"); setSecret(""); setError(""); }}
            className={`rounded-xl border p-3 text-center transition ${mode === "passphrase" ? "border-cyan-400/40 bg-cyan-400/15" : "border-white/10 bg-black/20 opacity-75"}`}
          >
            <KeyRound className="mx-auto mb-1 text-cyan-200" size={18} />
            <div className="text-xs text-white">Passphrase</div>
            <div className="mt-1 text-[10px] text-emerald-300">{status.passphraseEnrolled || firstSetup ? "Ready" : "Optional"}</div>
          </button>
          <button
            type="button"
            disabled={firstSetup}
            onClick={() => { setMode("recovery"); setSecret(""); setError(""); }}
            className={`rounded-xl border p-3 text-center transition ${mode === "recovery" ? "border-cyan-400/40 bg-cyan-400/15" : "border-white/10 bg-black/20 opacity-75"} disabled:opacity-40`}
          >
            <LockKeyhole className="mx-auto mb-1 text-amber-200" size={18} />
            <div className="text-xs text-white">Recovery</div>
            <div className="mt-1 text-[10px] text-amber-300">{status.recoveryCodeConfigured ? "Configured" : "Backup"}</div>
          </button>
        </div>

        <label className="mt-6 block text-xs uppercase tracking-wider text-slate-400">
          {mode === "pin" ? "Owner PIN (6+ digits)" : mode === "passphrase" ? "Owner Passphrase" : "Emergency Recovery Code"}
        </label>
        <input
          autoFocus
          type="password"
          inputMode={mode === "pin" ? "numeric" : "text"}
          placeholder={mode === "pin" ? "••••••" : mode === "passphrase" ? "Enter passphrase…" : "XXXXXX-XXXXXX-XXXXXX"}
          value={secret}
          onChange={(event) => setSecret(mode === "pin" ? event.target.value.replace(/\D/g, "") : event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white focus:border-cyan-400/50 focus:outline-none"
        />

        <button
          disabled={busy || secret.trim().length < 6}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {firstSetup ? `Enroll ${mode === "passphrase" ? "Passphrase" : "PIN"}` : "Unlock JARVIS"}
        </button>

        {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
        <p className="mt-5 text-center text-[10px] text-slate-500">
          SARA Security Shield protects SARA independently with local DPAPI/scrypt encryption while keeping Windows 10 Pro OS sign-in, Explorer, and Defender untouched.
        </p>
      </form>
    </div>
  );
}
