export interface ChronosSnapshot { fatigueScore: number; cpuPercent: number | null; memoryPercent: number | null; activeMinutes: number; overdrive: boolean; recommendation: "normal" | "reduce-background-work" | "user-review"; reasons: string[]; }

export function evaluateChronos(input: { activeMinutes: number; cpuPercent?: number | null; memoryPercent?: number | null; idleMinutes?: number }): ChronosSnapshot {
  const reasons: string[] = []; let score = 0;
  if (input.activeMinutes > 180) { score += 35; reasons.push("Long continuous session."); }
  if ((input.cpuPercent ?? 0) > 85) { score += 25; reasons.push("CPU is heavily loaded."); }
  if ((input.memoryPercent ?? 0) > 85) { score += 25; reasons.push("Memory pressure is high."); }
  if ((input.idleMinutes ?? 0) > 30) { score = Math.max(0, score - 15); reasons.push("User appears idle; background work should stay quiet."); }
  const fatigueScore = Math.max(0, Math.min(100, score));
  return { fatigueScore, cpuPercent: input.cpuPercent ?? null, memoryPercent: input.memoryPercent ?? null, activeMinutes: input.activeMinutes, overdrive: fatigueScore < 35 && (input.cpuPercent ?? 0) < 70, recommendation: fatigueScore >= 60 ? "reduce-background-work" : fatigueScore >= 35 ? "user-review" : "normal", reasons };
}
