import type { ReviewOriginalOutcome } from "./contracts";

export const PER_WORD_REVIEW_SCHEDULE_VERSION_V1 =
  "adle_review_per_word_schedule_v1" as const;

export type PerWordReviewMembershipStatus =
  | "scheduled"
  | "catch_up"
  | "ejected_pending_reteach"
  | "paused_parent_review"
  | "awaiting_pre_retirement_check"
  | "retired";

export interface PerWordReviewScheduleFactV1 {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  scheduleVersion: typeof PER_WORD_REVIEW_SCHEDULE_VERSION_V1;
  schedulePolicyVersion: string;
  intervalIndex: number;
  nextDueOn: string | null;
  membershipStatus: PerWordReviewMembershipStatus;
  catchUpStage: 0 | 1 | 2;
  nextRetestDueOn: string | null;
  preRetirementCheckDueOn: string | null;
  taughtOn: string;
  rowStatus: "active" | "superseded";
}

export type PerWordReviewDueKindV1 =
  | "scheduled_review"
  | "catch_up_retest"
  | "pre_retirement_check";

export interface PerWordReviewDueItemV1 {
  scheduleWordId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  dueKind: PerWordReviewDueKindV1;
  dueOn: string;
  intervalIndex: number;
  schedulePolicyVersion: string;
}

export function selectDuePerWordReviewsV1(input: {
  policyVersion: string;
  sessionCap: number;
  today: string;
  words: readonly PerWordReviewScheduleFactV1[];
}): PerWordReviewDueItemV1[] {
  const due: Array<PerWordReviewDueItemV1 & { taughtOn: string }> = [];
  for (const word of input.words) {
    if (
      word.rowStatus !== "active" ||
      word.scheduleVersion !== PER_WORD_REVIEW_SCHEDULE_VERSION_V1 ||
      word.schedulePolicyVersion !== input.policyVersion
    ) continue;

    const dueFact = word.membershipStatus === "scheduled" && word.nextDueOn !== null
      ? { dueKind: "scheduled_review" as const, dueOn: word.nextDueOn }
      : word.membershipStatus === "catch_up" && word.nextRetestDueOn !== null
        ? { dueKind: "catch_up_retest" as const, dueOn: word.nextRetestDueOn }
        : word.membershipStatus === "awaiting_pre_retirement_check" &&
            word.preRetirementCheckDueOn !== null
          ? {
              dueKind: "pre_retirement_check" as const,
              dueOn: word.preRetirementCheckDueOn,
            }
          : null;
    if (dueFact === null || dueFact.dueOn > input.today) continue;
    due.push({
      scheduleWordId: word.scheduleWordId,
      canonicalWordId: word.canonicalWordId,
      sourceBundleId: word.sourceBundleId,
      dueKind: dueFact.dueKind,
      dueOn: dueFact.dueOn,
      intervalIndex: word.intervalIndex,
      schedulePolicyVersion: word.schedulePolicyVersion,
      taughtOn: word.taughtOn,
    });
  }

  return due.sort((left, right) =>
    left.dueOn.localeCompare(right.dueOn) ||
    left.taughtOn.localeCompare(right.taughtOn) ||
    left.canonicalWordId.localeCompare(right.canonicalWordId) ||
    left.scheduleWordId.localeCompare(right.scheduleWordId),
  ).slice(0, input.sessionCap).map((item) => ({
    scheduleWordId: item.scheduleWordId,
    canonicalWordId: item.canonicalWordId,
    sourceBundleId: item.sourceBundleId,
    dueKind: item.dueKind,
    dueOn: item.dueOn,
    intervalIndex: item.intervalIndex,
    schedulePolicyVersion: item.schedulePolicyVersion,
  }));
}

export type PerWordScheduleEffectV1 =
  | "none_pending_original_outcome"
  | "advance_from_cold_retrieval"
  | "enter_catch_up_without_interval_advance";

/** Repair results are intentionally absent: only the immutable original cold
 * retrieval outcome is allowed to propose a schedule effect. */
export function scheduleEffectForOriginalOutcomeV1(
  outcome: ReviewOriginalOutcome,
): PerWordScheduleEffectV1 {
  if (outcome === "pending") return "none_pending_original_outcome";
  return outcome === "success"
    ? "advance_from_cold_retrieval"
    : "enter_catch_up_without_interval_advance";
}
