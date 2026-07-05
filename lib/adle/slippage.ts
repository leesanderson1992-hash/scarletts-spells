/**
 * ADLE Slice 4 (4F): slippage — detection of misspellings of
 * secure/review_retired/mastered words met outside their own scheduled
 * reviews, the §3.1 deduction table (priced in evidence-pricing.ts), the
 * two-slip limit, review re-entry, and the slippage_reentry learning-item
 * intake (the enum value Slice 3 reserved).
 *
 * Boundary rules (proposal §3.1, verbatim): a scheduled review failure is
 * never a slip — it is priced by catch-up/ejection and never appears here.
 * Deductions apply only to secure/review_retired/mastered words; the state
 * is evaluated AS OF the slip date by pricing only the facts dated before
 * it. Non-eligible words' misspellings stay learning-item intake
 * (verified_misspelling), exactly as today.
 *
 * Re-entry (owner-approved 2026-07-05, Slice 4 plan open question 4):
 * slips 1..slipLimit on a word with no active schedule row re-enter review
 * as a NEW single-word bundle at the ladder position whose gap is
 * slippageReentryGapDays (7) — forward-only holds because nothing existing
 * is demoted. A self-corrected slip of a retired/mastered word schedules the
 * same single check with no deduction and no flag ("interval check only").
 * Slip slipLimit+1 rejoins the next lesson via learningItemFromSlippage.
 */

import {
  addDays,
  type IsoDate,
  type ReviewBundleFact,
  type ReviewPolicy,
  type ScheduleWordFact,
} from "./review-scheduler";
import type { EvidencePolicy } from "./evidence-policy";
import {
  priceWordEvidence,
  type SlippageEventFact,
  type WordPricingFacts,
} from "./evidence-pricing";
import { computeWordEvidenceState, isSlipEligibleState } from "./word-evidence-state";
import { learningItemFromSlippage, type LearningItemFact } from "./learning-items";

/** A verified misspelling of a known word in real writing, derived from
 * finalised, learning-relevant writing-engine truth by the loader/guarded
 * script (never from raw analyser output — Review Work guardrail). The
 * loader excludes not_an_issue / false-positive outcomes before this model
 * ever sees a candidate. */
export interface WritingSlipCandidate {
  childId: string;
  /** The misspelling as written. */
  observedText: string;
  /** The corrected/target word, normalised — the canonical match key. */
  targetNormalised: string;
  occurredOn: IsoDate;
  /** Self-corrected in the same piece (writing_issue_correction_attempts
   * corrected_independently): no deduction, interval check only. */
  selfCorrected: boolean;
  sourceRef: string;
}

export interface SlippageDetectionResult {
  /** New slip facts to persist (append-only). */
  slips: SlippageEventFact[];
  /** Candidates whose target has no canonical match: surfaced, never
   * guessed (fail closed). */
  unmatched: WritingSlipCandidate[];
  /** Candidates for words not secure/review_retired/mastered at the slip
   * date — not slips; they remain ordinary learning-item intake territory. */
  notSlipEligible: WritingSlipCandidate[];
}

/** State as of a date: price only the facts dated strictly before it. */
export function wordStateAsOf(
  policy: EvidencePolicy,
  facts: WordPricingFacts,
  asOf: IsoDate,
) {
  const before: WordPricingFacts = {
    ...facts,
    outcomeEvents: facts.outcomeEvents.filter((event) => event.occurredOn < asOf),
    taughtHistory: facts.taughtHistory.filter((event) => event.occurredOn < asOf),
    authenticUseEvents: facts.authenticUseEvents.filter((event) => event.occurredOn < asOf),
    slippageEvents: facts.slippageEvents.filter((event) => event.occurredOn < asOf),
  };
  const pricing = priceWordEvidence(policy, before);
  return computeWordEvidenceState(policy, pricing, {
    outcomeEvents: before.outcomeEvents,
    taughtHistory: before.taughtHistory,
    slippageEvents: before.slippageEvents,
  });
}

/** Detect real-writing slips. `pricingFactsByWordId` supplies each matched
 * word's complete fact streams so eligibility is evaluated as of the slip
 * date; a word with no facts is never slip-eligible (fail closed). */
export function detectWritingSlips(
  policy: EvidencePolicy,
  candidates: readonly WritingSlipCandidate[],
  activeWordIdByNormalisedWord: ReadonlyMap<string, string>,
  pricingFactsByWordId: ReadonlyMap<string, WordPricingFacts>,
): SlippageDetectionResult {
  const slips: SlippageEventFact[] = [];
  const unmatched: WritingSlipCandidate[] = [];
  const notSlipEligible: WritingSlipCandidate[] = [];
  const ordinalBump = new Map<string, number>();

  const sorted = [...candidates].sort((a, b) =>
    a.occurredOn !== b.occurredOn
      ? a.occurredOn < b.occurredOn
        ? -1
        : 1
      : a.sourceRef < b.sourceRef
        ? -1
        : 1,
  );
  for (const candidate of sorted) {
    const canonicalWordId = activeWordIdByNormalisedWord.get(candidate.targetNormalised);
    if (canonicalWordId === undefined) {
      unmatched.push(candidate);
      continue;
    }
    const facts = pricingFactsByWordId.get(canonicalWordId);
    if (facts === undefined) {
      notSlipEligible.push(candidate);
      continue;
    }
    // Eligibility is SLIP-AGNOSTIC (the slipped-flag semantics): a word
    // whose evidence would be secure/retired/mastered stays slip-eligible
    // while earlier slips are unresolved — otherwise slip 1 would demote
    // the word out of eligibility and the blueprint's third-slip lesson
    // re-entry could never trigger. `slipped` is true exactly when the
    // slip-agnostic state is secure-or-better with an unresolved slip.
    const stateAtSlip = wordStateAsOf(policy, facts, candidate.occurredOn);
    if (!isSlipEligibleState(stateAtSlip.state) && !stateAtSlip.slipped) {
      notSlipEligible.push(candidate);
      continue;
    }
    const wordKey = `${candidate.childId} ${canonicalWordId}`;
    const priorStored = facts.slippageEvents.filter(
      (slip) =>
        slip.rowStatus === "active" &&
        slip.childId === candidate.childId &&
        slip.canonicalWordId === canonicalWordId &&
        !slip.selfCorrected,
    ).length;
    const bump = ordinalBump.get(wordKey) ?? 0;
    const slipOrdinal = candidate.selfCorrected ? 0 : priorStored + bump + 1;
    if (!candidate.selfCorrected) {
      ordinalBump.set(wordKey, bump + 1);
    }
    slips.push({
      childId: candidate.childId,
      canonicalWordId,
      occurredOn: candidate.occurredOn,
      contextKind: "authentic_writing",
      selfCorrected: candidate.selfCorrected,
      attemptText: candidate.observedText,
      sourceRef: candidate.sourceRef,
      // Self-corrected slips carry no ordinal weight in the limit; store 1
      // for the row constraint (>= 1) but they never advance the count.
      slipOrdinal: candidate.selfCorrected ? Math.max(1, priorStored + bump) || 1 : slipOrdinal,
      rowStatus: "active",
    });
  }
  return { slips, unmatched, notSlipEligible };
}

// ---------------------------------------------------------------------------
// Response to a slip: re-entry check or lesson re-entry
// ---------------------------------------------------------------------------

export interface SlipResponseParams {
  slip: SlippageEventFact;
  /** The word's primary micro-skill (for lesson re-entry intake). Unknown
   * skill + third slip is surfaced, never guessed. */
  microSkillKey: string | null;
  /** The word's active schedule row, if it is still under review. */
  activeScheduleWord: ScheduleWordFact | null;
  /** Original taught date (for the re-entry schedule row's lineage). */
  taughtOn: IsoDate;
  /** Storage-assigned id for a re-entry bundle. */
  reentryBundleId: string;
}

export interface SlipResponse {
  /** New single-word re-entry bundle (slips 1..limit, word not under an
   * active schedule) — null when the word is already in review or the slip
   * exceeded the limit. */
  reentryBundle: ReviewBundleFact | null;
  reentryWord: ScheduleWordFact | null;
  /** Lesson re-entry item (slip limit exceeded). */
  learningItemIntake: LearningItemFact | null;
  /** Third-slip word whose skill is unknown — surfaced, never guessed. */
  unmappedReentry: boolean;
}

export function respondToSlip(
  reviewPolicy: ReviewPolicy,
  policy: EvidencePolicy,
  params: SlipResponseParams,
): SlipResponse {
  const { slip } = params;
  const overLimit = !slip.selfCorrected && slip.slipOrdinal > policy.slipLimit;

  if (overLimit) {
    if (params.microSkillKey === null) {
      return { reentryBundle: null, reentryWord: null, learningItemIntake: null, unmappedReentry: true };
    }
    return {
      reentryBundle: null,
      reentryWord: null,
      learningItemIntake: learningItemFromSlippage({
        childId: slip.childId,
        canonicalWordId: slip.canonicalWordId,
        microSkillKey: params.microSkillKey,
        slippedOn: slip.occurredOn,
        slipSourceRef: slip.sourceRef,
        attemptText: slip.attemptText,
      }),
      unmappedReentry: false,
    };
  }

  // Already in review: the slip prices and flags only — nothing to
  // reschedule (the word's own ladder continues; blueprint: absence never
  // demotes, and re-entry is only for words that left daily practice).
  if (params.activeScheduleWord !== null &&
      params.activeScheduleWord.membershipStatus !== "retired") {
    return { reentryBundle: null, reentryWord: null, learningItemIntake: null, unmappedReentry: false };
  }

  const intervalIndex = reviewPolicy.intervalLadderDays.indexOf(policy.slippageReentryGapDays);
  if (intervalIndex === -1) {
    throw new Error(
      `respondToSlip: re-entry gap ${policy.slippageReentryGapDays}d is not a ladder position of ${reviewPolicy.schedulePolicyVersion} — refuse, don't guess`,
    );
  }
  const reentryBundle: ReviewBundleFact = {
    bundleId: params.reentryBundleId,
    childId: slip.childId,
    sourceRef: `slippage:${slip.sourceRef}`,
    intervalIndex,
    nextDueOn: addDays(slip.occurredOn, policy.slippageReentryGapDays),
    schedulePolicyVersion: reviewPolicy.schedulePolicyVersion,
    bundleStatus: "active",
    rowStatus: "active",
  };
  const reentryWord: ScheduleWordFact = {
    childId: slip.childId,
    canonicalWordId: slip.canonicalWordId,
    bundleId: params.reentryBundleId,
    membershipStatus: "scheduled",
    catchUpStage: 0,
    nextRetestDueOn: null,
    failedReviewOn: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: null,
    reteachCycleCount: params.activeScheduleWord?.reteachCycleCount ?? 0,
    taughtOn: params.taughtOn,
    rowStatus: "active",
  };
  return { reentryBundle, reentryWord, learningItemIntake: null, unmappedReentry: false };
}
