/**
 * ADLE Slice 2 (2C): due-queue read model and throttle predicate — pure,
 * server-only derivations over scheduler facts for an injected `today`.
 *
 * Policy sources: blueprint review model (10-word session cap,
 * oldest-first, absence never demotes) and the 2026-07-04 amendment item 8 /
 * proposal §3.4 throttle predicate: a Part 2 lesson runs only when
 * (due review words + due catch-up retests) <= cap before the session
 * starts. Owner-approved pin (2026-07-05): due retests and due bundle
 * reviews share one oldest-first queue under the one cap; there are no
 * reserved slots.
 *
 * Session shape (bundle merging, interleaving, quick-sort step) is the
 * Slice 3 composer's; this module only exposes the ordered due queue and
 * the predicate. Words trimmed by the cap keep their state untouched — they
 * are simply still due tomorrow.
 */

import type { IsoDate, ReviewBundleFact, ReviewPolicy, ScheduleWordFact } from "./review-scheduler";

export type DueItemKind = "bundle_review" | "pre_retirement_check" | "catch_up_retest";

export interface DueReviewItem {
  childId: string;
  canonicalWordId: string;
  bundleId: string;
  kind: DueItemKind;
  dueOn: IsoDate;
  taughtOn: IsoDate;
}

function activeBundlesById(bundles: readonly ReviewBundleFact[]): Map<string, ReviewBundleFact> {
  const byId = new Map<string, ReviewBundleFact>();
  for (const bundle of bundles) {
    if (bundle.rowStatus === "active") {
      byId.set(bundle.bundleId, bundle);
    }
  }
  return byId;
}

/** Due scheduled reviews: words in active, due bundles (overdue included)
 * plus words whose pre-retirement check has come due. Both are scheduled
 * reviews for the throttle's "due review words" count. */
export function dueReviewWords(
  bundles: readonly ReviewBundleFact[],
  words: readonly ScheduleWordFact[],
  today: IsoDate,
): DueReviewItem[] {
  const byId = activeBundlesById(bundles);
  const due: DueReviewItem[] = [];
  for (const word of words) {
    if (word.rowStatus !== "active") {
      continue;
    }
    if (word.membershipStatus === "scheduled") {
      const bundle = byId.get(word.bundleId);
      if (bundle && bundle.bundleStatus === "active" && bundle.nextDueOn <= today) {
        due.push({
          childId: word.childId,
          canonicalWordId: word.canonicalWordId,
          bundleId: word.bundleId,
          kind: "bundle_review",
          dueOn: bundle.nextDueOn,
          taughtOn: word.taughtOn,
        });
      }
    } else if (
      word.membershipStatus === "awaiting_pre_retirement_check" &&
      word.preRetirementCheckDueOn !== null &&
      word.preRetirementCheckDueOn <= today
    ) {
      due.push({
        childId: word.childId,
        canonicalWordId: word.canonicalWordId,
        bundleId: word.bundleId,
        kind: "pre_retirement_check",
        dueOn: word.preRetirementCheckDueOn,
        taughtOn: word.taughtOn,
      });
    }
  }
  return due;
}

export function dueCatchUpRetests(
  words: readonly ScheduleWordFact[],
  today: IsoDate,
): DueReviewItem[] {
  const due: DueReviewItem[] = [];
  for (const word of words) {
    if (
      word.rowStatus === "active" &&
      word.membershipStatus === "catch_up" &&
      word.nextRetestDueOn !== null &&
      word.nextRetestDueOn <= today
    ) {
      due.push({
        childId: word.childId,
        canonicalWordId: word.canonicalWordId,
        bundleId: word.bundleId,
        kind: "catch_up_retest",
        dueOn: word.nextRetestDueOn,
        taughtOn: word.taughtOn,
      });
    }
  }
  return due;
}

function compareOldestFirst(a: DueReviewItem, b: DueReviewItem): number {
  if (a.dueOn !== b.dueOn) {
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.taughtOn !== b.taughtOn) {
    return a.taughtOn < b.taughtOn ? -1 : 1;
  }
  return a.canonicalWordId < b.canonicalWordId ? -1 : a.canonicalWordId > b.canonicalWordId ? 1 : 0;
}

/** Today's review session: the combined due set, oldest-first (due date,
 * then taught date, then word id — a stable, deterministic order), capped at
 * the policy's session cap. Trimmed words carry no state change. */
export function reviewSessionQueue(
  policy: ReviewPolicy,
  bundles: readonly ReviewBundleFact[],
  words: readonly ScheduleWordFact[],
  today: IsoDate,
): DueReviewItem[] {
  const combined = [...dueReviewWords(bundles, words, today), ...dueCatchUpRetests(words, today)];
  combined.sort(compareOldestFirst);
  return combined.slice(0, policy.sessionCap);
}

export interface ThrottleDecision {
  lessonAllowed: boolean;
  dueReviewWordCount: number;
  dueCatchUpRetestCount: number;
  totalDue: number;
  sessionCap: number;
}

/** Amendment item 8: computed on the UNCAPPED counts before the session
 * starts. Exactly at the cap the lesson is allowed; one over and the day is
 * review-only (correct behaviour, ~70% of days at steady state). The counts
 * are returned so the composer can emit `review_debt_blocks_lesson` with
 * evidence. */
export function throttlePredicate(
  policy: ReviewPolicy,
  bundles: readonly ReviewBundleFact[],
  words: readonly ScheduleWordFact[],
  today: IsoDate,
): ThrottleDecision {
  const dueReviewWordCount = dueReviewWords(bundles, words, today).length;
  const dueCatchUpRetestCount = dueCatchUpRetests(words, today).length;
  const totalDue = dueReviewWordCount + dueCatchUpRetestCount;
  return {
    lessonAllowed: totalDue <= policy.sessionCap,
    dueReviewWordCount,
    dueCatchUpRetestCount,
    totalDue,
    sessionCap: policy.sessionCap,
  };
}
