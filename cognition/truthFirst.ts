export type TruthVerdict = "STRONG IDEA" | "PROMISING BUT UNPROVEN" | "WEAK IDEA" | "HIGH RISK" | "NOT RECOMMENDED" | "INSUFFICIENT INFORMATION";
export type ClaimClassification = "VERIFIED_FACT" | "WELL_SUPPORTED" | "PLAUSIBLE" | "ASSUMPTION" | "OPINION" | "PREDICTION" | "DISPUTED" | "UNKNOWN" | "FALSE_OR_CONTRADICTED";

export interface ClaimReview {
  claim: string;
  classification: ClaimClassification;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  confidence: "High" | "Medium" | "Low";
  reason: string;
}

export interface Contradiction {
  first: string;
  second: string;
  reason: string;
}

export interface TruthAssessment {
  verdict: TruthVerdict;
  facts: string[];
  assumptions: string[];
  unknowns: string[];
  risks: string[];
  counterargument: string;
  confidence: "High" | "Medium" | "Low";
  claims?: ClaimReview[];
  contradictions?: Contradiction[];
}

function confidenceFor(evidenceCount: number, contradictions: number): "High" | "Medium" | "Low" {
  if (contradictions > 0) return "Low";
  if (evidenceCount >= 3) return "High";
  if (evidenceCount >= 1) return "Medium";
  return "Low";
}

/** Classifies a claim conservatively; model wording alone never creates a fact. */
export function classifyClaim(claim: string, input: { supportingEvidence?: string[]; contradictingEvidence?: string[]; verified?: boolean } = {}): ClaimReview {
  const text = claim.trim();
  const supportingEvidence = (input.supportingEvidence || []).filter(Boolean).slice(0, 12);
  const contradictingEvidence = (input.contradictingEvidence || []).filter(Boolean).slice(0, 12);
  if (!text) return { claim: text, classification: "UNKNOWN", supportingEvidence, contradictingEvidence, confidence: "Low", reason: "No claim was provided." };
  if (contradictingEvidence.length) return { claim: text, classification: "DISPUTED", supportingEvidence, contradictingEvidence, confidence: "Low", reason: "Supporting and contradicting evidence are both present." };
  if (input.verified === true) return { claim: text, classification: "VERIFIED_FACT", supportingEvidence, contradictingEvidence, confidence: confidenceFor(supportingEvidence.length, 0), reason: "The caller supplied explicit verification evidence." };
  if (/\b(i think|in my opinion|my view|i prefer)\b/i.test(text)) return { claim: text, classification: "OPINION", supportingEvidence, contradictingEvidence, confidence: "Low", reason: "The wording expresses a personal judgment." };
  if (/\b(will|going to|likely|may|might|could|expect)\b/i.test(text)) return { claim: text, classification: "PREDICTION", supportingEvidence, contradictingEvidence, confidence: confidenceFor(supportingEvidence.length, 0), reason: "The wording describes a future or uncertain outcome." };
  if (!supportingEvidence.length) return { claim: text, classification: "ASSUMPTION", supportingEvidence, contradictingEvidence, confidence: "Low", reason: "No independent supporting evidence was provided." };
  return { claim: text, classification: supportingEvidence.length >= 2 ? "WELL_SUPPORTED" : "PLAUSIBLE", supportingEvidence, contradictingEvidence, confidence: confidenceFor(supportingEvidence.length, 0), reason: "The claim has supporting evidence, but this review does not independently verify it." };
}

/** Finds simple direct conflicts without pretending to solve every semantic contradiction. */
export function detectContradictions(statements: string[]): Contradiction[] {
  const result: Contradiction[] = [];
  for (let i = 0; i < statements.length; i++) for (let j = i + 1; j < statements.length; j++) {
    const first = statements[i].trim(); const second = statements[j].trim();
    if (!first || !second) continue;
    const normalize = (value: string) => value.toLowerCase().replace(/\b(not|never|no)\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (normalize(first) === normalize(second) && /\b(not|never|no)\b/i.test(first + " " + second)) result.push({ first, second, reason: "The statements contain the same proposition with opposing negation." });
  }
  return result;
}

/** Deterministic guardrail used to shape important advice before model output. */
export function assessTruthfulness(input: { claim: string; evidence?: string[]; knownFacts?: string[] }): TruthAssessment {
  const claim = input.claim.trim();
  const evidence = (input.evidence || []).filter(Boolean).slice(0, 12);
  const facts = (input.knownFacts || []).filter(Boolean).slice(0, 12);
  const unknowns: string[] = [];
  const assumptions: string[] = [];
  const risks: string[] = [];
  if (!claim) unknowns.push("The claim or decision was not specified.");
  if (!evidence.length) unknowns.push("No supporting evidence was provided.");
  if (/everyone|always|never|guarantee|certain|no risk/i.test(claim)) assumptions.push("The wording makes an absolute claim that requires stronger evidence.");
  if (/profit|million|viral|automatic|unlimited|fully autonomous/i.test(claim)) risks.push("The expected outcome depends on market, technical, or operational conditions that are not established here.");
  const confidence = evidence.length >= 2 && !unknowns.length ? "Medium" : "Low";
  const verdict: TruthVerdict = !claim || !evidence.length ? "INSUFFICIENT INFORMATION" : risks.length ? "PROMISING BUT UNPROVEN" : "STRONG IDEA";
  const claims = [classifyClaim(claim, { supportingEvidence: evidence, verified: false })];
  return { verdict, facts, assumptions, unknowns, risks, counterargument: "The strongest counterargument is that the conclusion may depend on untested assumptions or missing current evidence.", confidence, claims, contradictions: [] };
}

export function truthFirstInstructions(): string {
  return "TRUTH-FIRST MODE: Do not agree merely to please Boss. Separate verified facts, well-supported claims, plausible inferences, assumptions, opinions, predictions, disputed claims, unknowns, and judgment. Never label a model-generated claim VERIFIED_FACT without independent evidence. Challenge flawed assumptions respectfully, never invent evidence or sources, preserve provenance and freshness, state uncertainty, detect contradictions, and admit corrections. For substantial decisions use a verdict: STRONG IDEA, PROMISING BUT UNPROVEN, WEAK IDEA, HIGH RISK, NOT RECOMMENDED, or INSUFFICIENT INFORMATION. Research time-sensitive or high-impact claims when an approved research tool is available; otherwise disclose that research was not performed. Do not turn casual conversation into a formal evaluation.";
}
