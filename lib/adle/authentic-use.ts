/**
 * ADLE Slice 4 (4E): the real AuthenticUseProvider and the authentic-use
 * review credit (blueprint 2026-07-05 amendment item 3 — this module is its
 * implementation; the amendment is the policy source).
 *
 * The provider is fact-fed over adle_authentic_use_events, exactly like the
 * Slice 2 taught-history provider; callers opt in by injection and
 * failClosedAuthenticUseProvider remains the default everywhere else.
 *
 * The credit is a pure pre-resolution substitution: for a word in scheduled
 * review with a qualifying parent-verified authentic use inside the current
 * interval window, the word's next due review event (bundle review, catch-up
 * retest, or pre-retirement check) resolves as passed — fed to the unchanged
 * Slice 2 transitions as `passed: true` — and the pricer prices the
 * underlying authentic-use event (2.0), not review dictation. One credit per
 * interval window is enforced by consumption: each authentic-use event may
 * credit at most one review event, ever, so a fresh credit needs a fresh
 * authentic use inside the new window. Bundles still only move forward; no
 * scheduler code changes anywhere.
 *
 * Also the fail-closed bridge read model from parent-verified writing-engine
 * truth: no writing-engine record links to canonical word ids (verified
 * 2026-07-05), so bridging matches by normalised word text and routes
 * anything unmatched or ambiguous to the report, never to an event row. The
 * corpus preview scan (owner-approved 2026-07-05) reuses the same shape:
 * candidates from unreviewed pieces are emitted as report-only and become
 * events only via explicit owner confirmation in the guarded script.
 */

import {
  addDays,
  type AuthenticUseProvider,
  type IsoDate,
  type ReviewBundleFact,
  type ReviewPolicy,
  type ScheduleWordFact,
} from "./review-scheduler";
import type { DueReviewItem } from "./review-due-queue";
import type { AuthenticUseEventFact, AuthenticUseKind } from "./evidence-pricing";

export function authenticUseProviderFromFacts(
  facts: readonly AuthenticUseEventFact[],
): AuthenticUseProvider {
  const verified = facts.filter(
    (fact) => fact.rowStatus === "active" && fact.parentVerified,
  );
  return {
    hasAuthenticUseSince: (childId, canonicalWordId, sinceDate) =>
      verified.some(
        (fact) =>
          fact.childId === childId &&
          fact.canonicalWordId === canonicalWordId &&
          fact.occurredOn >= sinceDate,
      ),
  };
}

export interface AuthenticUseCredit {
  item: DueReviewItem;
  /** The consumed event's piece_ref — persisted by the completion path so
   * the once-per-interval-window cap is auditable and the event can never
   * credit twice. */
  creditedPieceRef: string;
  creditedEventOccurredOn: IsoDate;
}

export interface AuthenticUseCreditResult {
  /** Due items resolved as passed by credit — feed these to the Slice 2
   * resolve functions with passed: true; price via the credited event. */
  credits: AuthenticUseCredit[];
  /** Due items the child still reviews normally. */
  remaining: DueReviewItem[];
}

/** The date the due item's current interval window began. */
export function intervalWindowStart(
  reviewPolicy: ReviewPolicy,
  item: DueReviewItem,
  bundlesById: ReadonlyMap<string, ReviewBundleFact>,
  wordsByWordId: ReadonlyMap<string, ScheduleWordFact>,
): IsoDate | null {
  if (item.kind === "catch_up_retest") {
    return wordsByWordId.get(item.canonicalWordId)?.failedReviewOn ?? null;
  }
  if (item.kind === "pre_retirement_check") {
    const dueOn = wordsByWordId.get(item.canonicalWordId)?.preRetirementCheckDueOn;
    return dueOn ? addDays(dueOn, -reviewPolicy.preRetirementCheckGapDays) : null;
  }
  const bundle = bundlesById.get(item.bundleId);
  if (bundle === undefined) {
    return null;
  }
  const gap = reviewPolicy.intervalLadderDays[bundle.intervalIndex];
  return gap === undefined ? null : addDays(bundle.nextDueOn, -gap);
}

export interface ApplyCreditParams {
  queue: readonly DueReviewItem[];
  bundles: readonly ReviewBundleFact[];
  scheduleWords: readonly ScheduleWordFact[];
  authenticUseEvents: readonly AuthenticUseEventFact[];
  /** piece_refs already consumed by earlier credits (from completion
   * metadata) — an event credits at most one review event, ever. */
  consumedPieceRefs: ReadonlySet<string>;
  today: IsoDate;
}

export function applyAuthenticUseCredit(
  reviewPolicy: ReviewPolicy,
  params: ApplyCreditParams,
): AuthenticUseCreditResult {
  const bundlesById = new Map(params.bundles.map((bundle) => [bundle.bundleId, bundle]));
  const wordsByWordId = new Map(
    params.scheduleWords
      .filter((word) => word.rowStatus === "active")
      .map((word) => [word.canonicalWordId, word]),
  );
  const consumedNow = new Set<string>();
  const credits: AuthenticUseCredit[] = [];
  const remaining: DueReviewItem[] = [];

  for (const item of params.queue) {
    const windowStart = intervalWindowStart(reviewPolicy, item, bundlesById, wordsByWordId);
    if (windowStart === null) {
      remaining.push(item);
      continue;
    }
    // Qualifying: parent-verified correct authentic use inside the current
    // interval window, not yet consumed by a previous credit. Deterministic
    // pick: earliest qualifying event, then piece_ref.
    const qualifying = params.authenticUseEvents
      .filter(
        (event) =>
          event.rowStatus === "active" &&
          event.parentVerified &&
          event.useKind === ("authentic_correct_use" satisfies AuthenticUseKind) &&
          event.childId === item.childId &&
          event.canonicalWordId === item.canonicalWordId &&
          event.occurredOn >= windowStart &&
          event.occurredOn <= params.today &&
          !params.consumedPieceRefs.has(event.pieceRef) &&
          !consumedNow.has(event.pieceRef),
      )
      .sort((a, b) =>
        a.occurredOn !== b.occurredOn
          ? a.occurredOn < b.occurredOn
            ? -1
            : 1
          : a.pieceRef < b.pieceRef
            ? -1
            : 1,
      )[0];
    if (qualifying === undefined) {
      remaining.push(item);
      continue;
    }
    consumedNow.add(qualifying.pieceRef);
    credits.push({
      item,
      creditedPieceRef: qualifying.pieceRef,
      creditedEventOccurredOn: qualifying.occurredOn,
    });
  }
  return { credits, remaining };
}

// ---------------------------------------------------------------------------
// Fail-closed bridge read model (writing-engine boundary)
// ---------------------------------------------------------------------------

/** A candidate correct authentic use derived from writing-engine truth by
 * the loader/guarded script. `pieceParentReviewed` distinguishes the direct
 * bridge (Review Work-verified pieces) from corpus preview-scan candidates. */
export interface AuthenticUseCandidate {
  childId: string;
  /** The word exactly as written in the piece. */
  observedWord: string;
  occurredOn: IsoDate;
  pieceRef: string;
  sourceRef: string;
  useKind: AuthenticUseKind;
  pieceParentReviewed: boolean;
}

export interface AuthenticUseBridgeResult {
  /** Ready to persist: parent-reviewed pieces, canonical match found. */
  events: AuthenticUseEventFact[];
  /** Report-only until the owner confirms each one (corpus preview scan —
   * owner-approved 2026-07-05): canonical match found, piece not
   * parent-reviewed. */
  previewCandidates: (AuthenticUseEventFact & { requiresOwnerConfirmation: true })[];
  /** No canonical match: surfaced, never guessed. */
  unmatched: AuthenticUseCandidate[];
}

function normaliseObserved(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

export function authenticUseBridge(
  candidates: readonly AuthenticUseCandidate[],
  activeWordIdByNormalisedWord: ReadonlyMap<string, string>,
  verifiedAtIso: string,
): AuthenticUseBridgeResult {
  const events: AuthenticUseEventFact[] = [];
  const previewCandidates: (AuthenticUseEventFact & { requiresOwnerConfirmation: true })[] = [];
  const unmatched: AuthenticUseCandidate[] = [];
  const seen = new Set<string>();

  const sorted = [...candidates].sort((a, b) =>
    a.sourceRef !== b.sourceRef ? (a.sourceRef < b.sourceRef ? -1 : 1) : a.observedWord < b.observedWord ? -1 : 1,
  );
  for (const candidate of sorted) {
    const normalised = normaliseObserved(candidate.observedWord);
    const canonicalWordId =
      normalised === "" ? undefined : activeWordIdByNormalisedWord.get(normalised);
    if (canonicalWordId === undefined) {
      unmatched.push(candidate);
      continue;
    }
    const dedupeKey = `${candidate.childId} ${canonicalWordId} ${candidate.pieceRef} ${candidate.useKind}`;
    if (seen.has(dedupeKey)) {
      continue; // one credit per word per piece per kind (storage guard too)
    }
    seen.add(dedupeKey);
    const event: AuthenticUseEventFact = {
      childId: candidate.childId,
      canonicalWordId,
      occurredOn: candidate.occurredOn,
      useKind: candidate.useKind,
      // v1 intake writes parent-verified truth only; preview candidates
      // become parent-verified on explicit owner confirmation (the owner is
      // the parent gate), never automatically.
      parentVerified: true,
      pieceRef: candidate.pieceRef,
      sourceRef: candidate.sourceRef,
      rowStatus: "active",
    };
    void verifiedAtIso; // recorded by the persistence layer (verified_at)
    if (candidate.pieceParentReviewed) {
      events.push(event);
    } else {
      previewCandidates.push({ ...event, requiresOwnerConfirmation: true });
    }
  }
  return { events, previewCandidates, unmatched };
}
