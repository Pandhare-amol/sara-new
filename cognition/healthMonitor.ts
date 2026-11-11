export interface HealthComponent { name: string; check: () => Promise<boolean>; recover?: () => Promise<void>; }
export interface HealthState { name: string; healthy: boolean; failures: number; lastCheckedAt: string | null; lastRecoveryAt: string | null; }

/** Bounded health polling. Recovery is attempted at most once per failure window. */
export class HealthMonitor {
  private timer: NodeJS.Timeout | undefined;
  private readonly state = new Map<string, HealthState>();
  private recovering = new Set<string>();
  constructor(private readonly components: HealthComponent[], private readonly intervalMs = 30_000, private readonly maxRecoveryAttempts = 2) {}
  start(): void { if (this.timer) return; this.timer = setInterval(() => void this.checkAll(), this.intervalMs); this.timer.unref?.(); void this.checkAll(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  snapshot(): HealthState[] { return [...this.state.values()].map((item) => ({ ...item })); }
  async checkAll(): Promise<HealthState[]> {
    for (const component of this.components) {
      const current = this.state.get(component.name) || { name: component.name, healthy: false, failures: 0, lastCheckedAt: null, lastRecoveryAt: null };
      current.lastCheckedAt = new Date().toISOString();
      try { current.healthy = await component.check(); } catch { current.healthy = false; }
      if (current.healthy) current.failures = 0;
      else if (++current.failures <= this.maxRecoveryAttempts && component.recover && !this.recovering.has(component.name)) {
        this.recovering.add(component.name);
        try { await component.recover(); current.lastRecoveryAt = new Date().toISOString(); } catch { /* next bounded cycle may retry */ }
        finally { this.recovering.delete(component.name); }
      }
      this.state.set(component.name, current);
    }
    return this.snapshot();
  }
}
