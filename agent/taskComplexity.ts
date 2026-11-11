export type TaskComplexity = "quick" | "standard" | "complex";
export interface TaskComplexityResult { level: TaskComplexity; score: number; reasons: string[]; }
const QUICK = /^(open|launch|start|focus|minimize|maximize|close|play|pause|stop|search|find|read|show|check)\b/i;
const COMPLEX = /\b(compare|research|analy[sz]e|create|generate|report|presentation|pptx|docx|spreadsheet|automate|workflow|multi[- ]step|integrate|install|update|learn|schedule|organize|summari[sz]e)\b/i;
const CONSEQUENTIAL = /\b(delete|remove|send|publish|buy|purchase|pay|install|password|security|account|overwrite)\b/i;
export function classifyTaskComplexity(goal: string): TaskComplexityResult {
  const text = goal.trim(); if (!text) return { level: "quick", score: 0, reasons: ["empty goal"] };
  let score = 0; const reasons: string[] = []; const words = text.split(/\s+/).filter(Boolean).length;
  const clauses = (text.match(/\b(and|then|after|also|while|before)\b/gi) || []).length;
  if (QUICK.test(text) && words <= 12 && clauses === 0) reasons.push("single short action");
  if (COMPLEX.test(text)) { score += 2; reasons.push("workflow or content language"); }
  if (clauses > 0) { score += Math.min(3, clauses); reasons.push("dependent clauses"); }
  if (words > 20) { score += 1; reasons.push("longer request"); }
  if (CONSEQUENTIAL.test(text)) { score += 1; reasons.push("consequential action needs checks"); }
  if (score >= 3) return { level: "complex", score, reasons };
  if (score > 0 || !QUICK.test(text)) return { level: "standard", score, reasons: reasons.length ? reasons : ["general request"] };
  return { level: "quick", score, reasons };
}
