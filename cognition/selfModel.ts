export interface SelfModelSnapshot {
  state: "ready" | "degraded" | "blocked";
  capabilityCount: number;
  healthyComponents: number;
  unhealthyComponents: string[];
  activeLimits: string[];
  uncertaintySignals: string[];
  recentFailures: number;
  safetyEvents: number;
  lastUpdatedAt: string;
}

/** Functional self-monitoring: operational introspection, not consciousness. */
export class SelfModel {
  private failures = 0;
  private uncertaintySignals: string[] = [];
  private updatedAt = new Date(0).toISOString();

  recordFailure(reason: string): void { this.failures += 1; this.addUncertainty(reason); }
  recordUncertainty(reason: string): void { this.addUncertainty(reason); }
  resetTransientSignals(): void { this.failures = 0; this.uncertaintySignals = []; this.touch(); }
  snapshot(input: { capabilityCount: number; health: Array<{ name: string; healthy: boolean }>; safetyEvents: number; limits?: string[] }): SelfModelSnapshot {
    const unhealthyComponents = input.health.filter((item) => !item.healthy).map((item) => item.name);
    const activeLimits = [...(input.limits || [])];
    if (unhealthyComponents.length) activeLimits.push("One or more services are unhealthy; capability may be reduced.");
    const state = unhealthyComponents.length > 1 ? "blocked" : unhealthyComponents.length ? "degraded" : "ready";
    this.touch();
    return { state, capabilityCount: input.capabilityCount, healthyComponents: input.health.length - unhealthyComponents.length, unhealthyComponents, activeLimits, uncertaintySignals: [...this.uncertaintySignals], recentFailures: this.failures, safetyEvents: input.safetyEvents, lastUpdatedAt: this.updatedAt };
  }
  private addUncertainty(reason: string): void { const clean = reason.trim().slice(0, 240); if (clean && !this.uncertaintySignals.includes(clean)) this.uncertaintySignals = [...this.uncertaintySignals, clean].slice(-20); this.touch(); }
  private touch(): void { this.updatedAt = new Date().toISOString(); }
}
