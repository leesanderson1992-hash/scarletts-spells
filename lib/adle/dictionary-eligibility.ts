/**
 * ADLE Slice 1 (1C): dictionary eligibility ladder — pure, server-only read
 * models over the one Teaching Dictionary. Statuses are computed, never
 * stored (blueprint: "statuses on one dictionary, not two stores").
 *
 * Policy sources: adle-daily-assignment-and-evidence-blueprint-contract.md
 * (ladder, obscure-word firewall) and the approved banding v1.1 proposal
 * (effective level = active override, else computed level for the active
 * banding version).
 *
 * Obscure-word firewall, enforced at the type level: banding inputs
 * (WordBandingFact / BandingOverrideFact) carry no frequency/age band fields,
 * and ChildBandProfile gates never see a complexity level. A band change can
 * never move a Level and a Level change can never move band eligibility.
 */

export type DictionaryRowStatus = "draft" | "active" | "rejected" | "superseded";

export type DictionaryReviewStatus =
  | "draft"
  | "ai_draft"
  | "in_review"
  | "changes_requested"
  | "approved_for_guided_review"
  | "approved_for_first_exposure"
  | "rejected"
  | "superseded";

/** Support-mapping review states that count as "approved micro-skill mapping"
 * for evidence eligibility (adult-guided review is enough to analyse writing). */
export const APPROVED_SUPPORT_REVIEW_STATUSES: readonly DictionaryReviewStatus[] = [
  "approved_for_guided_review",
  "approved_for_first_exposure",
];

/** Word review states that count as "approved for assignment" — child-facing
 * assignment/diagnostic use requires full first-exposure approval. */
export const ASSIGNMENT_APPROVED_WORD_REVIEW_STATUSES: readonly DictionaryReviewStatus[] = [
  "approved_for_first_exposure",
];

export interface DictionaryWordFact {
  canonicalWordId: string;
  wordKey: string;
  /** Canonical stripped-lowercase identity — used for matching/dedup, never
   * shown to the child. */
  normalisedWord: string;
  /** True child-facing spelling with original casing/punctuation (apostrophes,
   * hyphens). All child-facing lesson payloads use this; correctness matching
   * still normalises internally, so display and identity never diverge. */
  displayWord: string;
  rowStatus: DictionaryRowStatus;
  reviewStatus: DictionaryReviewStatus;
  frequencyBand: string | null;
  ageBand: string | null;
}

export interface WordSupportFact {
  canonicalWordId: string;
  microSkillKey: string;
  supportRole: "support_example" | "contrast" | "review_example";
  rowStatus: DictionaryRowStatus;
  reviewStatus: DictionaryReviewStatus;
}

/** Structural banding facts only — no frequency/age fields exist here. */
export interface WordBandingFact {
  canonicalWordId: string;
  bandingVersion: string;
  structuralScore: number;
  complexityLevel: number;
  rowStatus: DictionaryRowStatus;
}

export interface BandingOverrideFact {
  canonicalWordId: string;
  overrideLevel: number;
  overrideReason: string;
  rowStatus: DictionaryRowStatus;
}

export interface BandingVersionFact {
  bandingVersion: string;
  isActive: boolean;
  levelCount: number;
}

export interface SkillLevelAllocationFact {
  microSkillKey: string;
  complexityLevel: number;
  allocation: number;
  bandingVersion: string;
  rowStatus: DictionaryRowStatus;
}

/** The child-appropriate band window (status 3 and 5 gates). This is the only
 * place frequency/AoA act; they never touch the Level. */
export interface ChildBandProfile {
  allowedFrequencyBands: readonly string[];
  allowedAgeBands: readonly string[];
}

/** Review eligibility is per-child taught/probed history, owned by the review
 * scheduler slice. Until a real provider is injected, use the fail-closed
 * default: nothing has been taught, nothing is review-eligible. */
export interface TaughtWordHistoryProvider {
  wasTaughtOrProbed(childId: string, canonicalWordId: string): boolean;
}

export const failClosedTaughtWordHistoryProvider: TaughtWordHistoryProvider = {
  wasTaughtOrProbed: () => false,
};

export interface WordEligibilityInputs {
  word: DictionaryWordFact;
  supports: readonly WordSupportFact[];
  banding: WordBandingFact | null;
  override: BandingOverrideFact | null;
  activeBandingVersion: BandingVersionFact;
  /** micro_skill_keys that currently have active, signed-off teaching content */
  activeTeachingSkillKeys: ReadonlySet<string>;
}

export interface WordEligibility {
  recognisable: boolean;
  evidenceEligible: boolean;
  assignmentDiagnosticEligible: boolean;
  masteryBreadthEligible: boolean;
  effectiveComplexityLevel: number | null;
}

function isActive(rowStatus: DictionaryRowStatus): boolean {
  return rowStatus === "active";
}

/**
 * Effective level = active override, else the computed level for the active
 * banding version. Fails closed to null when the word is unbanded under the
 * active version, and ignores overrides outside the version's level range.
 */
export function effectiveComplexityLevel(
  banding: WordBandingFact | null,
  override: BandingOverrideFact | null,
  activeBandingVersion: BandingVersionFact,
): number | null {
  const overrideLevel =
    override !== null &&
    isActive(override.rowStatus) &&
    Number.isInteger(override.overrideLevel) &&
    override.overrideLevel >= 1 &&
    override.overrideLevel <= activeBandingVersion.levelCount
      ? override.overrideLevel
      : null;
  if (overrideLevel !== null) {
    return overrideLevel;
  }
  if (
    banding !== null &&
    isActive(banding.rowStatus) &&
    banding.bandingVersion === activeBandingVersion.bandingVersion
  ) {
    return banding.complexityLevel;
  }
  return null;
}

/** Status 1: recognisable — an active dictionary word row; analysable in real
 * writing. */
export function isRecognisable(word: DictionaryWordFact): boolean {
  return isActive(word.rowStatus) && word.normalisedWord.trim() !== "";
}

function hasApprovedSupportMapping(
  word: DictionaryWordFact,
  supports: readonly WordSupportFact[],
): boolean {
  return supports.some(
    (support) =>
      support.canonicalWordId === word.canonicalWordId &&
      isActive(support.rowStatus) &&
      APPROVED_SUPPORT_REVIEW_STATUSES.includes(support.reviewStatus),
  );
}

/** Status 2: evidence-eligible — recognisable + at least one active, approved
 * micro-skill support mapping + canonical truth (the active canonical
 * spelling) present. */
export function isEvidenceEligible(
  word: DictionaryWordFact,
  supports: readonly WordSupportFact[],
): boolean {
  return isRecognisable(word) && hasApprovedSupportMapping(word, supports);
}

/** The obscure-word firewall gate: frequency/AoA bands act here (statuses 3
 * and 5) and nowhere else. Words missing band metadata fail closed. */
export function isWithinChildBand(
  word: Pick<DictionaryWordFact, "frequencyBand" | "ageBand">,
  childBand: ChildBandProfile,
): boolean {
  return (
    word.frequencyBand !== null &&
    word.ageBand !== null &&
    childBand.allowedFrequencyBands.includes(word.frequencyBand) &&
    childBand.allowedAgeBands.includes(word.ageBand)
  );
}

/** Status 3: assignment/diagnostic-eligible(childBand) — evidence-eligible +
 * word approved for assignment + active teaching content for a mapped skill
 * (curriculum-ready) + within the supplied child band. */
export function isAssignmentDiagnosticEligible(
  inputs: Pick<WordEligibilityInputs, "word" | "supports" | "activeTeachingSkillKeys">,
  childBand: ChildBandProfile,
): boolean {
  const { word, supports, activeTeachingSkillKeys } = inputs;
  if (!isEvidenceEligible(word, supports)) {
    return false;
  }
  if (!ASSIGNMENT_APPROVED_WORD_REVIEW_STATUSES.includes(word.reviewStatus)) {
    return false;
  }
  const hasCurriculumReadySkill = supports.some(
    (support) =>
      support.canonicalWordId === word.canonicalWordId &&
      isActive(support.rowStatus) &&
      APPROVED_SUPPORT_REVIEW_STATUSES.includes(support.reviewStatus) &&
      activeTeachingSkillKeys.has(support.microSkillKey),
  );
  if (!hasCurriculumReadySkill) {
    return false;
  }
  return isWithinChildBand(word, childBand);
}

/** Status 4: review-eligible(childId) — was actually taught or probed for
 * this child. Fail closed via the default provider until the review-scheduler
 * slice supplies a real one. */
export function isReviewEligible(
  childId: string,
  canonicalWordId: string,
  provider: TaughtWordHistoryProvider = failClosedTaughtWordHistoryProvider,
): boolean {
  return provider.wasTaughtOrProbed(childId, canonicalWordId);
}

/** Status 5: mastery-breadth-eligible(childBand) — evidence-eligible + within
 * the child's band. An obscure correct word may earn word evidence but never
 * counts toward breadth targets. */
export function isMasteryBreadthEligible(
  word: DictionaryWordFact,
  supports: readonly WordSupportFact[],
  childBand: ChildBandProfile,
): boolean {
  return isEvidenceEligible(word, supports) && isWithinChildBand(word, childBand);
}

/** Derive the full child-independent-plus-banded ladder for one word.
 * Review eligibility (status 4) is per-child history and is asked for
 * separately via isReviewEligible. */
export function deriveWordEligibility(
  inputs: WordEligibilityInputs,
  childBand: ChildBandProfile,
): WordEligibility {
  const { word, supports, banding, override, activeBandingVersion } = inputs;
  return {
    recognisable: isRecognisable(word),
    evidenceEligible: isEvidenceEligible(word, supports),
    assignmentDiagnosticEligible: isAssignmentDiagnosticEligible(inputs, childBand),
    masteryBreadthEligible: isMasteryBreadthEligible(word, supports, childBand),
    effectiveComplexityLevel: effectiveComplexityLevel(banding, override, activeBandingVersion),
  };
}

/** Typed readers for the recomputable allocation table (consumers read it,
 * never write it). */
export function readAllocation(
  rows: readonly SkillLevelAllocationFact[],
  activeBandingVersion: BandingVersionFact,
  microSkillKey: string,
  complexityLevel: number,
): number {
  const row = rows.find(
    (candidate) =>
      isActive(candidate.rowStatus) &&
      candidate.bandingVersion === activeBandingVersion.bandingVersion &&
      candidate.microSkillKey === microSkillKey &&
      candidate.complexityLevel === complexityLevel,
  );
  return row ? row.allocation : 0;
}

export function allocationsForSkill(
  rows: readonly SkillLevelAllocationFact[],
  activeBandingVersion: BandingVersionFact,
  microSkillKey: string,
): ReadonlyMap<number, number> {
  const byLevel = new Map<number, number>();
  for (const row of rows) {
    if (
      isActive(row.rowStatus) &&
      row.bandingVersion === activeBandingVersion.bandingVersion &&
      row.microSkillKey === microSkillKey
    ) {
      byLevel.set(row.complexityLevel, row.allocation);
    }
  }
  return byLevel;
}
