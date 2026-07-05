/**
 * ADLE Slice 4 (4C): pure evidence pricing — a deterministic pricer over the
 * per-child fact streams Slices 2/3 record (review outcome ledger,
 * taught/probed history) plus the Slice 4 fact streams (authentic use,
 * slippage). Applies the v1 weight table, the one recency rule (the memory
 * gap, not the screen), and every cap; returns priced entries as values —
 * nothing here persists, and re-running over the same facts under the same
 * policy version is byte-identical.
 *
 * Documented v1 pins (regression-covered):
 * - correctness derivation: taught/probed history has no correctness column;
 *   correctness is derived by comparing attempt_text to the canonical word's
 *   normalised_word (normaliseAttempt); null attempts earn nothing
 * - homophone validity: taught/probed production for homophone-family words
 *   prices 0 (plain dictation carries no homophone-choice evidence); review
 *   production prices normally because the Slice 3 composer guarantees
 *   DICTATION_SENTENCE_CONTEXT for homophone-family review words
 * - cold cap: a >= coldGapDays success inside the 28-day cold window prices
 *   as recent (the cold premium is capped, not the production)
 * - session cap: one dictation/controlled production credit per word per
 *   day (a review session is one calendar day in the current model)
 * - scheduled review failures price zero here — the catch-up/ejection
 *   ladder is their price (proposal §3.1 boundary); the pricer has no
 *   negative path other than slippage deductions
 */

import type { IsoDate, ReviewOutcomeEventType } from "./review-scheduler";
import {
  normaliseAttempt,
  slipDeduction,
  type EvidencePolicy,
  type SlipContextKind,
} from "./evidence-policy";

export type AuthenticUseKind = "authentic_correct_use" | "self_correction_in_writing";

/** Row shape of adle_authentic_use_events. */
export interface AuthenticUseEventFact {
  childId: string;
  canonicalWordId: string;
  occurredOn: IsoDate;
  useKind: AuthenticUseKind;
  parentVerified: boolean;
  pieceRef: string;
  sourceRef: string;
  rowStatus: string;
}

/** Row shape of adle_slippage_events. */
export interface SlippageEventFact {
  childId: string;
  canonicalWordId: string;
  occurredOn: IsoDate;
  contextKind: SlipContextKind;
  selfCorrected: boolean;
  attemptText: string | null;
  sourceRef: string;
  slipOrdinal: number;
  rowStatus: string;
}

/** Review-ledger row with the Slice 3 attempt_text column. */
export interface OutcomeEventFact {
  childId: string;
  canonicalWordId: string;
  bundleId: string | null;
  eventType: ReviewOutcomeEventType;
  occurredOn: IsoDate;
  intervalIndex: number | null;
  schedulePolicyVersion: string;
  attemptText: string | null;
}

/** Taught/probed history row with the Slice 3 attempt_text column. */
export interface TaughtHistoryFact {
  childId: string;
  canonicalWordId: string;
  eventKind: "taught" | "probed";
  occurredOn: IsoDate;
  sourceRef: string;
  rowStatus: string;
  attemptText: string | null;
}

export interface WordPricingFacts {
  childId: string;
  canonicalWordId: string;
  /** Canonical truth for the correctness-derivation pin. */
  normalisedWord: string;
  /** The word's primary micro-skill family (homophone validity). */
  skillFamilyKey: string | null;
  outcomeEvents: readonly OutcomeEventFact[];
  taughtHistory: readonly TaughtHistoryFact[];
  authenticUseEvents: readonly AuthenticUseEventFact[];
  slippageEvents: readonly SlippageEventFact[];
}

export type PricedEntryKind =
  | "lesson_production"
  | "review_production"
  | "probe_production"
  | "authentic_use"
  | "self_correction"
  | "slippage_deduction";

export type RecencyClass = "cold" | "recent" | null;

export type CapApplied =
  | "session_cap"
  | "interval_window_cap"
  | "cold_cap_downgraded"
  | "per_piece_cap"
  | "homophone_dictation_invalid"
  | "self_corrected_no_deduction"
  | null;

export interface PricedEvidenceEntry {
  kind: PricedEntryKind;
  occurredOn: IsoDate;
  weight: number;
  recency: RecencyClass;
  capApplied: CapApplied;
  /** Review interval window this production credits (bundle:interval). */
  windowKey: string | null;
  /** Counts toward production edges (proposal §3.2: dictation or authentic
   * writing production; controlled lesson spelling never counts). */
  isProduction: boolean;
  parentVerified: boolean;
  sourceRef: string | null;
  evidencePolicyVersion: string;
  note: string;
}

export interface WordEvidencePricing {
  childId: string;
  canonicalWordId: string;
  entries: PricedEvidenceEntry[];
  score: number;
  /** Positive production entries (the state edges' inputs). */
  productions: PricedEvidenceEntry[];
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`diffDays: invalid ISO date (${from}, ${to})`);
  }
  return Math.round((b - a) / 86_400_000);
}

const PRODUCTION_OUTCOME_TYPES: ReadonlySet<ReviewOutcomeEventType> = new Set([
  "review_pass",
  "review_fail",
  "retest_pass",
  "retest_fail",
  "retirement_check_pass",
  "retirement_check_fail",
]);

const PASS_OUTCOME_TYPES: ReadonlySet<ReviewOutcomeEventType> = new Set([
  "review_pass",
  "retest_pass",
  "retirement_check_pass",
]);

interface Candidate {
  kind: PricedEntryKind;
  occurredOn: IsoDate;
  correct: boolean;
  windowKey: string | null;
  sourceRef: string | null;
  pieceRef: string | null;
  useKind: AuthenticUseKind | null;
  parentVerified: boolean;
  slip: SlippageEventFact | null;
  /** Deterministic tie-break within one day. */
  order: number;
}

/** Price one (child, word)'s complete evidence history. */
export function priceWordEvidence(
  policy: EvidencePolicy,
  facts: WordPricingFacts,
): WordEvidencePricing {
  const active = <T extends { rowStatus: string }>(rows: readonly T[]): T[] =>
    rows.filter((row) => row.rowStatus === "active");

  const outcomeEvents = facts.outcomeEvents.filter(
    (event) =>
      event.childId === facts.childId && event.canonicalWordId === facts.canonicalWordId,
  );
  const taughtHistory = active(facts.taughtHistory).filter(
    (event) =>
      event.childId === facts.childId && event.canonicalWordId === facts.canonicalWordId,
  );
  const authenticUse = active(facts.authenticUseEvents).filter(
    (event) =>
      event.childId === facts.childId && event.canonicalWordId === facts.canonicalWordId,
  );
  const slippage = active(facts.slippageEvents).filter(
    (event) =>
      event.childId === facts.childId && event.canonicalWordId === facts.canonicalWordId,
  );

  // Every ADLE exposure of the word: the memory gap is measured against the
  // most recent exposure strictly before the event being priced.
  const exposureDates = [
    ...taughtHistory.map((event) => event.occurredOn),
    ...outcomeEvents
      .filter((event) => PRODUCTION_OUTCOME_TYPES.has(event.eventType))
      .map((event) => event.occurredOn),
  ].sort();

  const lastExposureBefore = (date: IsoDate): IsoDate | null => {
    let last: IsoDate | null = null;
    for (const exposure of exposureDates) {
      if (exposure < date) {
        last = exposure;
      } else {
        break;
      }
    }
    return last;
  };

  const isHomophoneFamily = facts.skillFamilyKey === policy.homophoneFamilyKey;

  const candidates: Candidate[] = [];
  let order = 0;

  for (const event of taughtHistory) {
    const attempt = normaliseAttempt(event.attemptText);
    const correct = attempt !== null && attempt === facts.normalisedWord;
    candidates.push({
      kind: event.eventKind === "taught" ? "lesson_production" : "probe_production",
      occurredOn: event.occurredOn,
      correct,
      windowKey: null,
      sourceRef: event.sourceRef,
      pieceRef: null,
      useKind: null,
      parentVerified: false,
      slip: null,
      order: order++,
    });
  }
  for (const event of outcomeEvents) {
    if (!PASS_OUTCOME_TYPES.has(event.eventType)) {
      continue; // failures are priced by catch-up/ejection, never here
    }
    candidates.push({
      kind: "review_production",
      occurredOn: event.occurredOn,
      correct: true,
      windowKey: `${event.bundleId ?? "no-bundle"}:${event.intervalIndex ?? "check"}`,
      sourceRef: null,
      pieceRef: null,
      useKind: null,
      parentVerified: false,
      slip: null,
      order: order++,
    });
  }
  for (const event of authenticUse) {
    candidates.push({
      kind: event.useKind === "authentic_correct_use" ? "authentic_use" : "self_correction",
      occurredOn: event.occurredOn,
      correct: true,
      windowKey: null,
      sourceRef: event.sourceRef,
      pieceRef: event.pieceRef,
      useKind: event.useKind,
      parentVerified: event.parentVerified,
      slip: null,
      order: order++,
    });
  }
  for (const event of slippage) {
    candidates.push({
      kind: "slippage_deduction",
      occurredOn: event.occurredOn,
      correct: false,
      windowKey: null,
      sourceRef: event.sourceRef,
      pieceRef: null,
      useKind: null,
      parentVerified: false,
      slip: event,
      order: order++,
    });
  }

  candidates.sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) {
      return a.occurredOn < b.occurredOn ? -1 : 1;
    }
    return a.order - b.order;
  });

  const entries: PricedEvidenceEntry[] = [];
  const creditedDays = new Set<IsoDate>();
  const creditedWindows = new Set<string>();
  const creditedPieces = new Set<string>();
  let lastColdCreditOn: IsoDate | null = null;

  const push = (
    candidate: Candidate,
    weight: number,
    recency: RecencyClass,
    capApplied: CapApplied,
    isProduction: boolean,
    note: string,
  ): void => {
    entries.push({
      kind: candidate.kind,
      occurredOn: candidate.occurredOn,
      weight,
      recency,
      capApplied,
      windowKey: candidate.windowKey,
      isProduction,
      parentVerified: candidate.parentVerified,
      sourceRef: candidate.sourceRef,
      evidencePolicyVersion: policy.evidencePolicyVersion,
      note,
    });
  };

  for (const candidate of candidates) {
    switch (candidate.kind) {
      case "slippage_deduction": {
        const slip = candidate.slip;
        if (slip === null) {
          throw new Error("priceWordEvidence: slippage candidate without its fact");
        }
        if (slip.selfCorrected) {
          push(candidate, 0, null, "self_corrected_no_deduction", false,
            "self-corrected in the same piece: no deduction, interval check only");
          break;
        }
        push(candidate, slipDeduction(policy, slip.contextKind), null, null, false,
          `slip ${slip.slipOrdinal} (${slip.contextKind}): -(${policy.deductionMultiplier} x positive weight)`);
        break;
      }
      case "authentic_use": {
        const pieceKey = `${candidate.pieceRef}:${candidate.useKind}`;
        if (creditedPieces.has(pieceKey)) {
          push(candidate, 0, null, "per_piece_cap", false, "already credited for this piece");
          break;
        }
        creditedPieces.add(pieceKey);
        push(candidate, policy.weights.authenticCorrectUse, null, null, true,
          candidate.parentVerified
            ? "authentic writing correct (parent-reviewed)"
            : "authentic writing correct (unverified accrual)");
        break;
      }
      case "self_correction": {
        const pieceKey = `${candidate.pieceRef}:${candidate.useKind}`;
        if (creditedPieces.has(pieceKey)) {
          push(candidate, 0, null, "per_piece_cap", false, "already credited for this piece");
          break;
        }
        creditedPieces.add(pieceKey);
        push(candidate, policy.weights.selfCorrectionInWriting, null, null, false,
          "self-correction in real writing (once per word per piece)");
        break;
      }
      case "lesson_production": {
        if (!candidate.correct) {
          push(candidate, 0, null, null, false,
            "lesson production not derivably correct: no credit (fail closed)");
          break;
        }
        if (isHomophoneFamily) {
          push(candidate, 0, null, "homophone_dictation_invalid", false,
            "plain dictation carries no homophone-choice evidence");
          break;
        }
        if (creditedDays.has(candidate.occurredOn)) {
          push(candidate, 0, null, "session_cap", false, "same-session successes do not stack");
          break;
        }
        creditedDays.add(candidate.occurredOn);
        push(candidate, policy.weights.controlledLessonSpelling, null, null, false,
          "controlled lesson spelling correct (prompted production)");
        break;
      }
      case "probe_production":
      case "review_production": {
        if (!candidate.correct) {
          push(candidate, 0, null, null, false,
            "probe production not derivably correct: no credit (fail closed)");
          break;
        }
        if (isHomophoneFamily && candidate.kind === "probe_production") {
          push(candidate, 0, null, "homophone_dictation_invalid", false,
            "plain dictation carries no homophone-choice evidence");
          break;
        }
        if (candidate.windowKey !== null && creditedWindows.has(candidate.windowKey)) {
          push(candidate, 0, null, "interval_window_cap", false,
            "review production credit is once per interval window");
          break;
        }
        if (creditedDays.has(candidate.occurredOn)) {
          push(candidate, 0, null, "session_cap", false, "same-session successes do not stack");
          break;
        }
        const lastExposure = lastExposureBefore(candidate.occurredOn);
        const gap = lastExposure === null ? Infinity : diffDays(lastExposure, candidate.occurredOn);
        const coldByGap = gap >= policy.coldGapDays;
        const coldCapOpen =
          lastColdCreditOn === null ||
          diffDays(lastColdCreditOn, candidate.occurredOn) >= policy.coldCreditCapDays;
        creditedDays.add(candidate.occurredOn);
        if (candidate.windowKey !== null) {
          creditedWindows.add(candidate.windowKey);
        }
        if (coldByGap && coldCapOpen) {
          lastColdCreditOn = candidate.occurredOn;
          push(candidate, policy.weights.dictationCold, "cold", null, true,
            `dictation correct, cold (memory gap ${gap === Infinity ? "first exposure" : `${gap}d`})`);
        } else if (coldByGap) {
          push(candidate, policy.weights.dictationRecent, "cold", "cold_cap_downgraded", true,
            "cold gap but cold credit already earned inside 28 days: priced as recent");
        } else {
          push(candidate, policy.weights.dictationRecent, "recent", null, true,
            `dictation correct, recent (memory gap ${gap}d)`);
        }
        break;
      }
    }
  }

  const score = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const productions = entries.filter((entry) => entry.isProduction && entry.weight > 0);
  return {
    childId: facts.childId,
    canonicalWordId: facts.canonicalWordId,
    entries,
    score,
    productions,
  };
}
