export type ThreatSeverity = "info" | "warning" | "critical";
export interface ThreatEvent { id: string; type: string; severity: ThreatSeverity; message: string; source: string; createdAt: string; acknowledged: boolean; }

/** Lightweight local anomaly monitor. It records bounded security signals; it
 * does not kill processes or change Windows security settings automatically. */
export class ThreatMonitor {
  private readonly events: ThreatEvent[] = [];
  private readonly recentTools: string[] = [];
  recordTool(tool: string, source = "tool"): ThreatEvent | null {
    this.recentTools.push(tool); if (this.recentTools.length > 50) this.recentTools.shift();
    const repeated = this.recentTools.slice(-6).filter((item) => item === tool).length >= 5;
    if (!repeated && !/runPythonScript|executePowerAction|deleteFile/i.test(tool)) return null;
    return this.add({ type: repeated ? "repeated_tool_pattern" : "sensitive_tool", severity: repeated ? "warning" : "info", message: repeated ? `Repeated tool pattern detected: ${tool}` : `Sensitive tool used: ${tool}`, source });
  }
  recordUnauthorized(source = "security"): ThreatEvent { return this.add({ type: "unauthorized_access", severity: "warning", message: "Unauthorized tool or agent access attempt was rejected.", source }); }
  snapshot(): ThreatEvent[] { return this.events.map((item) => ({ ...item })); }
  acknowledge(id: string): boolean { const event = this.events.find((item) => item.id === id); if (!event) return false; event.acknowledged = true; return true; }
  private add(input: Omit<ThreatEvent, "id" | "createdAt" | "acknowledged">): ThreatEvent { const event = { ...input, id: `${Date.now()}-${this.events.length}`, createdAt: new Date().toISOString(), acknowledged: false }; this.events.push(event); if (this.events.length > 100) this.events.shift(); return event; }
}
