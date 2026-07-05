/**
 * ADLE Slice 4 (4B): evidence policy v1 constants — the blueprint's v1
 * weight table, the one recency rule's parameters, caps/validity, the
 * generalised slippage deduction rule (2026-07-04 amendment item 2 /
 * proposal §3.1), and the secure/mastered edge pins (proposal §3.2).
 * Versioned in the REVIEW_POLICY_V1 / COMPOSER_POLICY_V1 pattern; the
 * adle_evidence_policy_versions registry seed mirrors these values and the
 * regression asserts parity. Extend only with an approved amendment.
 */

export interface EvidenceWeights {
  /** Strongest; the target capability. */
  authenticCorrectUse: number;
  /** Authentic writing only; once per word per piece. */
  selfCorrectionInWriting: number;
  /** Cold = no ADLE exposure of the word for coldGapDays+. */
  dictationCold: number;
  /** Includes day-1 reviews and catch-up retests. */
  dictationRecent: number;
  /** Prompted production. */
  controlledLessonSpelling: number;
  /** Activation, not mastery. */
  guidedOrRecognition: number;
  /** Copying / tracing / read-only: exposure only. */
  exposure: number;
}

export interface SecureEdge {
  minProductions: number;
  minIntervalWindows: number;
  minSpanDays: number;
}

export interface MasteredEdge {
  minScore: number;
  minProductions: number;
  minDistinctDays: number;
  minSpanDays: number;
  requiresParentReviewedAuthentic: boolean;
}

export interface EvidencePolicy {
  evidencePolicyVersion: string;
  weights: EvidenceWeights;
  /** deduction = -(deductionMultiplier x the context's positive weight). */
  deductionMultiplier: number;
  /** The memory gap that makes a dictation cold. */
  coldGapDays: number;
  /** Cold-dictation credit at most once per word per this many days;
   * inside the window a cold-gap success prices as recent instead. */
  coldCreditCapDays: number;
  /** Productions weighted >= this count as unprompted (proposal §3.2:
   * dictation or authentic writing; controlled lesson spelling does not). */
  unpromptedWeightThreshold: number;
  secureEdge: SecureEdge;
  masteredEdge: MasteredEdge;
  /** Limit N: the (N+1)th slip rejoins the next lesson for its micro-skill
   * as a priority item (slippage_reentry intake). */
  slipLimit: number;
  /** Skill-family key whose words carry no plain-dictation evidence
   * (sentence-context production required — blueprint family validity). */
  homophoneFamilyKey: string;
  /** Where a slipped retired/mastered word re-enters review: the ladder
   * position whose gap is this many days (owner-approved 2026-07-05,
   * Slice 4 plan open question 4). */
  slippageReentryGapDays: number;
}

export const EVIDENCE_POLICY_V1: EvidencePolicy = {
  evidencePolicyVersion: "evidence_policy_v1_2026-07-04",
  weights: {
    authenticCorrectUse: 2.0,
    selfCorrectionInWriting: 1.5,
    dictationCold: 1.5,
    dictationRecent: 0.5,
    controlledLessonSpelling: 0.75,
    guidedOrRecognition: 0.25,
    exposure: 0,
  },
  deductionMultiplier: 0.5,
  coldGapDays: 3,
  coldCreditCapDays: 28,
  unpromptedWeightThreshold: 0.5,
  secureEdge: {
    minProductions: 3,
    minIntervalWindows: 2,
    minSpanDays: 7,
  },
  masteredEdge: {
    minScore: 8,
    minProductions: 5,
    minDistinctDays: 4,
    minSpanDays: 21,
    requiresParentReviewedAuthentic: true,
  },
  slipLimit: 2,
  homophoneFamilyKey: "D4_HOM",
  slippageReentryGapDays: 7,
};

export type SlipContextKind =
  | "authentic_writing"
  | "dictation_cold"
  | "dictation_recent"
  | "controlled_lesson";

/** The §3.1 deduction table, generalised: -(multiplier x positive weight).
 * Weak-evidence tasks never deduct and have no context kind here. */
export function slipDeduction(policy: EvidencePolicy, context: SlipContextKind): number {
  const positive: Record<SlipContextKind, number> = {
    authentic_writing: policy.weights.authenticCorrectUse,
    dictation_cold: policy.weights.dictationCold,
    dictation_recent: policy.weights.dictationRecent,
    controlled_lesson: policy.weights.controlledLessonSpelling,
  };
  return -(policy.deductionMultiplier * positive[context]);
}

/** Attempt normalisation for the correctness-derivation pin (Slice 4 plan
 * 4C): taught/probed history has no correctness column, so correctness is
 * derived by comparing the stored attempt text against the canonical word's
 * normalised_word. Mirrors the dictionary import's normalisation: lowercase,
 * letters only. Null/absent attempts derive nothing — fail closed. */
export function normaliseAttempt(attempt: string | null): string | null {
  if (attempt === null) {
    return null;
  }
  const normalised = attempt.toLowerCase().replace(/[^a-z]/g, "");
  return normalised === "" ? null : normalised;
}
