import { randomUUID } from "node:crypto";

export type CouncilRole = "chief" | "research" | "planning" | "coding" | "computer" | "security" | "testing" | "verification" | "recovery" | "optimization";
export interface CouncilMember { role: CouncilRole; responsibility: string; required: boolean; }
export interface CouncilPlan { id: string; goal: string; members: CouncilMember[]; checkpoints: string[]; approvalRequired: boolean; createdAt: string; }

export function createCouncilPlan(goal: string): CouncilPlan {
  const text = goal.trim(); if (!text) throw new Error("A council goal is required.");
  const members: CouncilMember[] = [{ role: "chief", responsibility: "Coordinate the plan and keep the task aligned with the user's goal.", required: true }, { role: "verification", responsibility: "Define evidence required before reporting success.", required: true }];
  const add = (role: CouncilRole, responsibility: string) => members.push({ role, responsibility, required: false });
  if (/research|learn|compare|documentation|latest|find/i.test(text)) add("research", "Gather relevant, source-aware evidence and identify uncertainty.");
  if (/code|program|debug|build|website|script|project/i.test(text)) { add("planning", "Break the work into bounded dependencies and checkpoints."); add("coding", "Prepare or modify code only through the existing approved workflow."); add("testing", "Run relevant tests and report actual results."); }
  if (/open|click|browser|file|folder|computer|windows|application|screen/i.test(text)) add("computer", "Use the existing desktop/browser tools with fresh state checks.");
  if (/delete|send|publish|install|password|account|security|payment|buy/i.test(text)) { add("security", "Review permissions, risk, and confirmation requirements before action."); }
  if (members.length > 3) add("recovery", "Prepare bounded recovery options without repeating unsafe failures.");
  if (/fast|optimi[sz]|performance|improve/i.test(text)) add("optimization", "Measure latency and resource use before proposing improvements.");
  return { id: randomUUID(), goal: text.slice(0, 2_000), members, checkpoints: ["goal_understood", "permissions_checked", "actions_verified", "result_reported"], approvalRequired: members.some((member) => member.role === "security"), createdAt: new Date().toISOString() };
}
