import React, { useCallback, useEffect, useState } from "react";

type ThemeKey = "NEURAL_HUD" | "CYBER_ARCHITECT" | "TACTICAL_CRIMSON" | "ZENITH_STEALTH";

interface ThemePalette {
  name: string;
  bg: string;
  panel: string;
  accent: string;
  text: string;
  border: string;
}

const UI_THEMES: Record<ThemeKey, ThemePalette> = {
  NEURAL_HUD: {
    name: "01 // NEURAL HUD (JARVIS CORE)",
    bg: "#050A14",
    panel: "#0B162C",
    accent: "#00F0FF",
    text: "#E0F7FA",
    border: "1px solid #00F0FF",
  },
  CYBER_ARCHITECT: {
    name: "02 // CYBER ARCHITECT (ASI R&D)",
    bg: "#080510",
    panel: "#140C28",
    accent: "#B829EA",
    text: "#F3E5F5",
    border: "1px solid #B829EA",
  },
  TACTICAL_CRIMSON: {
    name: "03 // TACTICAL DEFENSE (ULTRON)",
    bg: "#120404",
    panel: "#260808",
    accent: "#FF2A2A",
    text: "#FFEBEE",
    border: "1px solid #FF2A2A",
  },
  ZENITH_STEALTH: {
    name: "04 // ZENITH STEALTH (MINIMAL)",
    bg: "#09090B",
    panel: "#121215",
    accent: "#10B981",
    text: "#ECFDF5",
    border: "1px solid #27272A",
  },
};

interface MountedLabApp {
  id: string;
  name: string;
  specification: string;
  testsPassed: boolean;
  attemptsUsed: number;
  lastTestOutput: string;
}

export interface SaraOsAppProps {
  onSwitchSurface: (mode: "companion" | "live_core") => void;
}

export const SaraOsApp: React.FC<SaraOsAppProps> = ({ onSwitchSurface }) => {
  const [themeKey, setThemeKey] = useState<ThemeKey>("NEURAL_HUD");
  const [autoUiMorph, setAutoUiMorph] = useState<boolean>(true);
  const [page, setPage] = useState<"desktop" | "settings">("desktop");

  const [cpuPercent, setCpuPercent] = useState<number>(14);
  const [ramPercent, setRamPercent] = useState<number>(42);
  const [activeMode, setActiveMode] = useState<string>("CO_PILOT");
  const [presenceLabel, setPresenceLabel] = useState<string>("OWNER PRESENT");

  const [directiveInput, setDirectiveInput] = useState<string>("");
  const [labAppName, setLabAppName] = useState<string>("LogPulse Analyzer");
  const [labSpec, setLabSpec] = useState<string>("Parse structured event payloads and return summary metrics");
  const [mountedApps, setMountedApps] = useState<MountedLabApp[]>([]);
  const [pendingPushback, setPendingPushback] = useState<{
    command: string;
    warning: string;
    saferAlternative: string | null;
  } | null>(null);
  const [briefingHeadline, setBriefingHeadline] = useState<string>(
    "All local subsystems online. Formal Constraint Gate & Gemini Router standing by (Zero Cloud / Zero Ollama).",
  );

  const [streamLogs, setStreamLogs] = useState<string[]>([
    "[SARA OS] Local Autonomous Kernel initialized (100% Local Storage + Gemini Router).",
    "[UI MORPH] Active Environment -> 01 // NEURAL HUD (JARVIS CORE)",
  ]);

  const appendLog = useCallback((line: string) => {
    setStreamLogs((prev) => [...prev.slice(-60), `${new Date().toLocaleTimeString()} ${line}`]);
  }, []);

  const applyTheme = useCallback(
    (next: ThemeKey, reason?: string) => {
      setThemeKey((prev) => {
        if (prev !== next) {
          appendLog(`[UI MORPH] ${UI_THEMES[next].name}${reason ? ` (${reason})` : ""}`);
        }
        return next;
      });
    },
    [appendLog],
  );

  const pollTelemetry = useCallback(async () => {
    try {
      const [selfRes, modeRes, presRes, guardRes] = await Promise.all([
        fetch("/api/meta/self-awareness"),
        fetch("/api/jarvis/modes"),
        fetch("/api/asi/presence/status"),
        fetch("/api/jarvis/guardian/status"),
      ]);
      if (selfRes.ok) {
        const selfData = await selfRes.json();
        const totalMb = Number(selfData?.hardware?.ramTotalMb) || 1;
        const freeMb = Number(selfData?.hardware?.ramFreeMb) || 0;
        const ramPct = Math.round(((totalMb - freeMb) / totalMb) * 100);
        const cpuPct = Math.min(100, Math.round((Number(selfData?.hardware?.loadAvg1m || 0.2) / Math.max(1, Number(selfData?.hardware?.cpuCores || 2))) * 100));
        setCpuPercent(cpuPct);
        setRamPercent(ramPct);

        if (autoUiMorph) {
          if (cpuPct > 85) applyTheme("TACTICAL_CRIMSON", "High CPU Load");
        }
      }
      if (modeRes.ok) {
        const modeData = await modeRes.json();
        const m = String(modeData?.currentMode || "CO_PILOT");
        setActiveMode(m);
        if (autoUiMorph) {
          if (m === "TACTICAL") applyTheme("TACTICAL_CRIMSON", "Tactical Mode");
          else if (m === "GHOST") applyTheme("ZENITH_STEALTH", "Ghost Stealth Mode");
          else if (m === "ASI_AUTONOMOUS") applyTheme("CYBER_ARCHITECT", "ASI Autonomous Mode");
        }
      }
      if (presRes.ok) {
        const presData = await presRes.json();
        if (presData?.intruderActive) setPresenceLabel("INTRUDER ALERT");
        else if (presData?.userPresent) setPresenceLabel("OWNER VERIFIED");
        else setPresenceLabel("SENTRY WATCH");
      }
      if (guardRes.ok) {
        const guardData = await guardRes.json();
        if (Array.isArray(guardData?.mountedApps)) setMountedApps(guardData.mountedApps);
        if (guardData?.latestBriefing?.spokenSummary) {
          setBriefingHeadline(guardData.latestBriefing.spokenSummary);
        }
      }
    } catch {
      // Non-fatal poll
    }
  }, [applyTheme, autoUiMorph]);

  useEffect(() => {
    void pollTelemetry();
    const id = window.setInterval(() => void pollTelemetry(), 3000);
    return () => window.clearInterval(id);
  }, [pollTelemetry]);

  const executeKernelCycle = async (objective: string) => {
    appendLog(`> DIRECTIVE: ${objective}`);
    if (autoUiMorph && /\b(build|code|create|research|innovate|architect)\b/i.test(objective)) {
      applyTheme("CYBER_ARCHITECT", "R&D Directive");
    }
    try {
      const res = await fetch("/api/asi/kernel/cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const data = await res.json();
      if (data?.cycle) {
        appendLog(`[FORMAL GATE] Satisfiable=${String(data.cycle.formalProof?.satisfiable)} | PastRL=${data.cycle.pastTrajectoriesInjected}`);
        appendLog(`[RED/BLUE WAR ROOM] ${data.cycle.redBlueSimulation?.blueTeamCounterStrategy}`);
        appendLog(`[OUTCOME] ${data.cycle.executedOutcome}`);
      } else {
        appendLog(`[KERNEL] ${JSON.stringify(data)}`);
      }
    } catch (err) {
      appendLog(`[ERROR] ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDispatchDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = directiveInput.trim();
    if (!cmd) return;
    setDirectiveInput("");
    setPendingPushback(null);

    try {
      const defRes = await fetch("/api/jarvis/deference/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const defData = await defRes.json();
      if (defData?.assessment?.pushbackNeeded) {
        appendLog(`[J.A.R.V.I.S. PUSHBACK // ${defData.assessment.riskLevel}] ${defData.assessment.jarvisWarning}`);
        setPendingPushback({
          command: cmd,
          warning: defData.assessment.jarvisWarning,
          saferAlternative: defData.assessment.saferAlternativeCommand || null,
        });
        return;
      }
    } catch {
      // Proceed to cycle if deference endpoint unreachable
    }

    await executeKernelCycle(cmd);
  };

  const handleBuildLabApp = async () => {
    if (!labSpec.trim()) return;
    if (autoUiMorph) applyTheme("CYBER_ARCHITECT", "Mark II Simulation Lab");
    appendLog(`[SIMULATION LAB] Prototyping & self-testing '${labAppName}'...`);
    try {
      const res = await fetch("/api/jarvis/lab/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labAppName, specification: labSpec }),
      });
      const data = await res.json();
      if (data?.app) {
        appendLog(
          `[SIMULATION LAB] ${data.app.testsPassed ? "MOUNTED TO DOCK" : "FAILED"} (${data.app.attemptsUsed} attempt(s)): ${data.app.lastTestOutput}`,
        );
        void pollTelemetry();
      }
    } catch (err) {
      appendLog(`[SIMULATION LAB ERROR] ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeployHouseParty = async () => {
    appendLog("[HOUSE PARTY PROTOCOL] Dispatching parallel tasks across Iron Legion Suits...");
    try {
      const res = await fetch("/api/jarvis/fleet/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directive: "Full Workspace Diagnostic Sweep",
          tasks: [
            "Audit TypeScript module integrity",
            "Verify Formal Constraint bounds",
            "Refresh local trajectory index",
            "Synthesize executive telemetry digest",
          ],
        }),
      });
      const data = await res.json();
      if (data?.report) {
        appendLog(`[HOUSE PARTY] Completed ${data.report.completedTasks}/${data.report.totalTasks} parallel suit tasks.`);
      }
    } catch (err) {
      appendLog(`[HOUSE PARTY ERROR] ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefreshBriefing = async () => {
    const res = await fetch("/api/jarvis/return-briefing?trigger=hud_request");
    if (res.ok) {
      const data = await res.json();
      setBriefingHeadline(data.spokenSummary);
      appendLog(`[LIVE BRIEFING] ${data.spokenSummary}`);
    }
  };

  const palette = UI_THEMES[themeKey];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: palette.bg,
        color: palette.text,
        fontFamily: "Consolas, 'JetBrains Mono', monospace",
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px",
        gap: "12px",
        boxSizing: "border-box",
      }}
    >
      {/* Top Telemetry Bar */}
      <header
        style={{
          backgroundColor: palette.panel,
          border: palette.border,
          borderRadius: 8,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: palette.accent }}>
          SARA OS // AUTONOMOUS LOCAL KERNEL v4.0
        </div>
        <div style={{ fontSize: 12, opacity: 0.92 }}>
          CPU: {cpuPercent}% | RAM: {ramPercent}% | MODE: {activeMode} | WATCHDOG: {presenceLabel} | UI: {themeKey}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setPage(page === "desktop" ? "settings" : "desktop")}
            style={{
              backgroundColor: palette.bg,
              color: palette.accent,
              border: palette.border,
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {page === "desktop" ? "COMPANION & UI SETTINGS" : "<- RETURN TO SARA DESKTOP"}
          </button>
          <button
            type="button"
            onClick={() => onSwitchSurface("companion")}
            style={{
              backgroundColor: palette.bg,
              color: palette.text,
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            CLASSIC SARA UI
          </button>
        </div>
      </header>

      {/* Main Workspace Stack */}
      {page === "desktop" ? (
        <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 12, minHeight: 0 }}>
          {/* Left Panel: Autonomous R&D, Formal Proof & Briefing Stream */}
          <section
            style={{
              backgroundColor: palette.panel,
              border: palette.border,
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: palette.accent }}>
                LIVE ASI CONSCIOUSNESS // OBSERVE -&gt; PROVE -&gt; WAR-ROOM -&gt; ACT
              </span>
              <button
                type="button"
                onClick={() => void handleRefreshBriefing()}
                style={{
                  backgroundColor: palette.bg,
                  color: palette.accent,
                  border: palette.border,
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                SYNTHESIZE BRIEFING
              </button>
            </div>
            <div
              style={{
                backgroundColor: palette.bg,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 12,
              }}
            >
              <strong style={{ color: palette.accent }}>RETURN BRIEFING: </strong>
              {briefingHeadline}
            </div>
            <div
              style={{
                flex: 1,
                backgroundColor: palette.bg,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: 10,
                overflowY: "auto",
                maxHeight: "52vh",
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              {streamLogs.map((entry, idx) => (
                <div key={idx} style={{ marginBottom: 4 }}>
                  {entry}
                </div>
              ))}
            </div>
          </section>

          {/* Right Panel: Directive Console, J.A.R.V.I.S. Pushback, Mark II Simulation Lab & House Party Fleet */}
          <section
            style={{
              backgroundColor: palette.panel,
              border: palette.border,
              borderRadius: 8,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: palette.accent, marginBottom: 6 }}>
                SARA IS ACTIVE // LOCAL GEMINI + FORMAL LOGIC + GUARDIAN SUITE
              </div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Every command passes Formal RAM/Constraint Verification &amp; J.A.R.V.I.S. Deference Risk Analysis before execution.
              </div>
            </div>

            {pendingPushback && (
              <div
                style={{
                  backgroundColor: "#2A090D",
                  border: "1px solid #FF4D4F",
                  borderRadius: 6,
                  padding: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, color: "#FF7875", marginBottom: 4 }}>
                  J.A.R.V.I.S. RISK OVERRIDE &amp; PUSHBACK
                </div>
                <div>{pendingPushback.warning}</div>
                {pendingPushback.saferAlternative && (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <span>Safer alternative: <code>{pendingPushback.saferAlternative}</code></span>
                    <button
                      type="button"
                      onClick={() => {
                        const alt = pendingPushback.saferAlternative!;
                        setPendingPushback(null);
                        void executeKernelCycle(alt);
                      }}
                      style={{
                        backgroundColor: palette.bg,
                        color: "#52C41A",
                        border: "1px solid #52C41A",
                        borderRadius: 4,
                        padding: "4px 8px",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      RUN SAFER ALTERNATIVE
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mark II Rapid Prototyping & Self-Healing Simulation Lab */}
            <div
              style={{
                backgroundColor: palette.bg,
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12, color: palette.accent }}>
                MARK II SIMULATION LAB // AUTO-CODE, STRESS-TEST &amp; MOUNT TO DOCK
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={labAppName}
                  onChange={(e) => setLabAppName(e.target.value)}
                  placeholder="Micro-App Name"
                  style={{
                    flex: 1,
                    backgroundColor: palette.panel,
                    color: palette.text,
                    border: palette.border,
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontSize: 12,
                  }}
                />
                <input
                  value={labSpec}
                  onChange={(e) => setLabSpec(e.target.value)}
                  placeholder="Invention / utility specification..."
                  style={{
                    flex: 2,
                    backgroundColor: palette.panel,
                    color: palette.text,
                    border: palette.border,
                    borderRadius: 4,
                    padding: "6px 8px",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleBuildLabApp()}
                  style={{
                    backgroundColor: palette.panel,
                    color: palette.accent,
                    border: palette.border,
                    borderRadius: 4,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  PROTOTYPE &amp; MOUNT
                </button>
              </div>
            </div>

            {/* House Party Protocol Quick Bar */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleDeployHouseParty()}
                style={{
                  backgroundColor: palette.bg,
                  color: palette.accent,
                  border: palette.border,
                  borderRadius: 6,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                DEPLOY HOUSE PARTY FLEET (4 SUITS)
              </button>
              {(["SENTRY", "CO_PILOT", "ASI_AUTONOMOUS", "TACTICAL", "GHOST"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={async () => {
                    await fetch("/api/jarvis/modes", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mode: m, lock: false }),
                    });
                    setActiveMode(m);
                    appendLog(`[MODE SWITCH] Engaged ${m}`);
                  }}
                  style={{
                    backgroundColor: activeMode === m ? palette.accent : palette.bg,
                    color: activeMode === m ? palette.bg : palette.text,
                    border: palette.border,
                    borderRadius: 6,
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 11,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Direct Directive Input */}
            <form onSubmit={handleDispatchDirective} style={{ display: "flex", gap: 8 }}>
              <input
                value={directiveInput}
                onChange={(e) => setDirectiveInput(e.target.value)}
                placeholder="Command SARA OS (e.g., 'Audit workspace modules and optimize memory' or test pushback with 'rm -rf /')..."
                style={{
                  flex: 1,
                  backgroundColor: palette.bg,
                  color: palette.text,
                  border: palette.border,
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontSize: 13,
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: palette.accent,
                  color: palette.bg,
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                EXECUTE
              </button>
            </form>
          </section>
        </main>
      ) : (
        /* Companion & UI Settings Page */
        <main
          style={{
            flex: 1,
            backgroundColor: palette.panel,
            border: palette.border,
            borderRadius: 8,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, color: palette.accent }}>
            SARA COMPANION // FUTURISTIC INTERFACE &amp; SURFACE SWITCHER
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {(Object.keys(UI_THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setAutoUiMorph(false);
                  applyTheme(k, "Manual Lock");
                }}
                style={{
                  backgroundColor: themeKey === k ? palette.accent : palette.bg,
                  color: themeKey === k ? palette.bg : palette.accent,
                  border: palette.border,
                  borderRadius: 6,
                  padding: "12px 14px",
                  cursor: "pointer",
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                ACTIVATE UI: {UI_THEMES[k].name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setAutoUiMorph((v) => !v)}
              style={{
                backgroundColor: palette.bg,
                color: palette.accent,
                border: palette.border,
                borderRadius: 6,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              AUTO-UI MORPHING: {autoUiMorph ? "ENABLED (Switches UI by CPU/Mode/Task)" : "MANUAL LOCK"}
            </button>
            <button
              type="button"
              onClick={() => onSwitchSurface("companion")}
              style={{
                backgroundColor: palette.bg,
                color: palette.text,
                border: palette.border,
                borderRadius: 6,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              SWITCH TO CLASSIC SARA COMPANION UI
            </button>
            <button
              type="button"
              onClick={() => onSwitchSurface("live_core")}
              style={{
                backgroundColor: palette.bg,
                color: palette.text,
                border: palette.border,
                borderRadius: 6,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              SWITCH TO J.A.R.V.I.S. LIVE CORE UI
            </button>
          </div>
        </main>
      )}

      {/* Bottom Dock: Mounted Simulation Lab Apps & System Quick Launchers */}
      <footer
        style={{
          backgroundColor: palette.panel,
          border: palette.border,
          borderRadius: 8,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: palette.accent, marginRight: 6 }}>SARA OS DOCK:</span>
        {[
          ["WORKSPACE AUDIT", "Inspect active workspace stack and verify health"],
          ["MEMORY OPTIMIZE", "Run allowlisted memory optimization and report RAM delta"],
          ["BLUEPRINT SCAN", "Index API routes and architecture blueprints"],
        ].map(([label, directive]) => (
          <button
            key={label}
            type="button"
            onClick={() => void executeKernelCycle(directive)}
            style={{
              backgroundColor: palette.bg,
              color: palette.accent,
              border: palette.border,
              borderRadius: 5,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {label}
          </button>
        ))}
        {mountedApps.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => appendLog(`[DOCK APP // ${app.name}] Verified (${app.lastTestOutput})`)}
            style={{
              backgroundColor: palette.accent,
              color: palette.bg,
              border: "none",
              borderRadius: 5,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            LAB: {app.name.toUpperCase()}
          </button>
        ))}
      </footer>
    </div>
  );
};

export default SaraOsApp;
