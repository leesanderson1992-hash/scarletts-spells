/**
 * ADLE Slice 4 (4D): word evidence states — pure recomputation per
 * (child, word) from priced evidence plus scheduler and slippage facts.
 * States per the blueprint ("Word evidence states") with the proposal §3.2
 * edge pins; `slipped` is a flag, not a state; history is never deleted and
 * no state is stored anywhere.
 *
 * Documented pins (owner-approved via the Slice 4 plan, regression-covered):
 * - a slip is resolved by a later correct production of the word (any
 *   >= unpromptedWeightThreshold-weight production dated after the slip)
 * - while a slip is unresolved the secure/mastered edges fail (fail-closed
 *   direction); `review_retired` persists (the scheduler's retirement fact
 *   cannot be recomputed away) and carries the flag; the `slipped` flag
 *   marks any word whose slip-agnostic state would be secure or better
 * - `review_retired` derives only from the scheduler's `retired` outcome
 *   event; `mastered` is evaluated independently of retirement (the two are
 *   different exits) and outranks it when its full gate passes
 */

import type { IsoDate } from "./review-scheduler";
import type { EvidencePolicy } from "./evidence-policy";
import type {
  OutcomeEventFact,
  SlippageEventFact,
  TaughtHistoryFact,
  WordEvidencePricing,
} from "./evidence-pricing";
import { diffDays } from "./evidence-pricing";

export type WordEvidenceState =
  | "unseen"
  | "active"
  | "produced"
  | "secure"
  | "review_retired"
  | "mastered";

export interface WordStateFacts {
  outcomeEvents: readonly OutcomeEventFact[];
  taughtHistory: readonly TaughtHistoryFact[];
  slippageEvents: readonly SlippageEventFact[];
}

export interface WordEvidenceStateResult {
  childId: string;
  canonicalWordId: string;
  state: WordEvidenceState;
  slipped: boolean;
  unresolvedSlips: SlippageEventFact[];
  score: number;
  explanation: string[];
}

function forWord<T extends { childId: string; canonicalWordId: string }>(
  rows: readonly T[],
  childId: string,
  canonicalWordId: string,
): T[] {
  return rows.filter((row) => row.childId === childId && row.canonicalWordId === canonicalWordId);
}

export function computeWordEvidenceState(
  policy: EvidencePolicy,
  pricing: WordEvidencePricing,
  facts: WordStateFacts,
): WordEvidenceStateResult {
  const { childId, canonicalWordId } = pricing;
  const explanation: string[] = [];

  const outcomeEvents = forWord(facts.outcomeEvents, childId, canonicalWordId);
  const taughtHistory = forWord(facts.taughtHistory, childId, canonicalWordId).filter(
    (row) => row.rowStatus === "active",
  );
  const slippageEvents = forWord(facts.slippageEvents, childId, canonicalWordId).filter(
    (row) => row.rowStatus === "active",
  );

  const productions = pricing.productions;
  const productionDates = productions.map((entry) => entry.occurredOn).sort();

  // Slip resolution pin: a later correct production resolves the slip.
  const unresolvedSlips = slippageEvents.filter(
    (slip) =>
      !slip.selfCorrected &&
      !productionDates.some((date) => date > slip.occurredOn),
  );
  const hasUnresolvedSlip = unresolvedSlips.length > 0;
  if (hasUnresolvedSlip) {
    explanation.push(
      `${unresolvedSlips.length} unresolved slip(s); latest on ${unresolvedSlips[unresolvedSlips.length - 1].occurredOn}`,
    );
  }

  // Retirement is a lifecycle state, not an eternal historical flag. A later
  // error-specific route may legitimately reopen the shared canonical word.
  const latestRetiredOn = outcomeEvents
    .filter((event) => event.eventType === "retired")
    .reduce<IsoDate | null>(
      (latest, event) => (latest === null || event.occurredOn > latest ? event.occurredOn : latest),
      null,
    );
  const latestReactivatedOn = outcomeEvents
    .filter((event) => event.eventType === "reactivated_for_new_skill")
    .reduce<IsoDate | null>(
      (latest, event) => (latest === null || event.occurredOn > latest ? event.occurredOn : latest),
      null,
    );
  // A same-day reactivation is written after the historical retirement and
  // therefore wins without relying on unspecified database row ordering.
  const retired =
    latestRetiredOn !== null &&
    (latestReactivatedOn === null || latestRetiredOn > latestReactivatedOn);
  if (retired) {
    explanation.push("scheduler ledger holds a retired event (review_retired exit)");
  }

  // --- edge evaluations (slip-agnostic first, for the flag) ---

  const distinctWindows = new Set(
    productions.filter((entry) => entry.windowKey !== null).map((entry) => entry.windowKey),
  );
  const spanDays =
    productionDates.length >= 2
      ? diffDays(productionDates[0], productionDates[productionDates.length - 1])
      : 0;
  const secureEvidence =
    productions.length >= policy.secureEdge.minProductions &&
    distinctWindows.size >= policy.secureEdge.minIntervalWindows &&
    spanDays >= policy.secureEdge.minSpanDays;
  if (secureEvidence) {
    explanation.push(
      `secure evidence: ${productions.length} productions across ${distinctWindows.size} interval windows spanning ${spanDays}d`,
    );
  }

  const distinctDays = new Set(productionDates).size;
  const parentReviewedAuthentic = productions.some(
    (entry) => entry.kind === "authentic_use" && entry.parentVerified,
  );
  const masteredEvidence =
    pricing.score >= policy.masteredEdge.minScore &&
    productions.length >= policy.masteredEdge.minProductions &&
    distinctDays >= policy.masteredEdge.minDistinctDays &&
    spanDays >= policy.masteredEdge.minSpanDays &&
    (!policy.masteredEdge.requiresParentReviewedAuthentic || parentReviewedAuthentic);
  if (masteredEvidence) {
    explanation.push(
      `mastered evidence: score ${pricing.score} >= ${policy.masteredEdge.minScore}, ` +
        `${productions.length} productions on ${distinctDays} days spanning ${spanDays}d, ` +
        `parent-reviewed authentic use ${parentReviewedAuthentic ? "present" : "not required"}`,
    );
  }

  const anyEncounter =
    taughtHistory.length > 0 || outcomeEvents.length > 0 || pricing.entries.length > 0;

  // --- state (slip conditions applied; blueprint order, highest first) ---

  let state: WordEvidenceState;
  if (masteredEvidence && !hasUnresolvedSlip) {
    state = "mastered";
  } else if (retired) {
    state = "review_retired";
  } else if (secureEvidence && !hasUnresolvedSlip) {
    state = "secure";
  } else if (productions.length >= 1) {
    state = "produced";
  } else if (anyEncounter) {
    state = "active";
  } else {
    state = "unseen";
  }

  const slipAgnosticAtLeastSecure = masteredEvidence || retired || secureEvidence;
  const slipped = hasUnresolvedSlip && slipAgnosticAtLeastSecure;
  if (slipped) {
    explanation.push("slipped flag set: unresolved slip on a secure-or-better word");
  }
  explanation.push(`state: ${state} (score ${pricing.score})`);

  return {
    childId,
    canonicalWordId,
    state,
    slipped,
    unresolvedSlips,
    score: pricing.score,
    explanation,
  };
}

/** Convenience: the slip-eligibility gate for detection (proposal §3.1 —
 * deductions apply only to secure/review_retired/mastered words). */
export function isSlipEligibleState(state: WordEvidenceState): boolean {
  return state === "secure" || state === "review_retired" || state === "mastered";
}

/** The date a word first became slip-eligible is not recomputed here; the
 * detection read model evaluates state as of each candidate slip's date by
 * pricing only the facts dated before it (see lib/adle/slippage.ts). */
export type { IsoDate };
