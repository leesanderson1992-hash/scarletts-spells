import type { ReviewOriginalOutcome } from "./contracts";

import { addDays, type IsoDate } from "../review-scheduler";

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

export interface GovernedPerWordReviewPolicyV1 {
  schedulePolicyVersion: string;
  intervalLadderDays: readonly number[];
  catchUpOffsetsDays: readonly [number, number];
  sessionCap: number;
  preRetirementCheckGapDays: number;
  completionGraceMinutes: number;
}

export interface GovernedCompletionDateInputV1 {
  assignmentPracticeDate: IsoDate;
  completedAt: string;
  latestPersistedActivityAt: string;
  completionGraceMinutes: number;
}

function londonDate(instant: string): IsoDate {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid_review_timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** Mirrors the database-only R5 completion-date rule. The clock values are
 * parameters here solely so deterministic, disposable tests can cover date
 * boundaries; the Production RPC never accepts them. */
export function resolveGovernedReviewCompletionDateV1(
  input: GovernedCompletionDateInputV1,
): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.assignmentPracticeDate)) {
    throw new Error("invalid_assignment_practice_date");
  }
  if (!Number.isInteger(input.completionGraceMinutes) || input.completionGraceMinutes < 0) {
    throw new Error("invalid_completion_grace_policy");
  }
  const completed = new Date(input.completedAt);
  const activity = new Date(input.latestPersistedActivityAt);
  if (Number.isNaN(completed.getTime()) || Number.isNaN(activity.getTime())) {
    throw new Error("invalid_review_timestamp");
  }
  if (activity.getTime() > completed.getTime()) {
    throw new Error("review_activity_after_completion");
  }
  const actualDate = londonDate(input.completedAt);
  if (input.assignmentPracticeDate > actualDate) {
    throw new Error("future_assignment_practice_date");
  }
  if (input.assignmentPracticeDate === actualDate) return actualDate;

  const immediatelyFollowing = addDays(input.assignmentPracticeDate, 1) === actualDate;
  const withinGrace = completed.getTime() - activity.getTime() <=
    input.completionGraceMinutes * 60_000;
  if (
    immediatelyFollowing &&
    londonDate(input.latestPersistedActivityAt) === input.assignmentPracticeDate &&
    withinGrace
  ) {
    return input.assignmentPracticeDate;
  }
  return actualDate;
}

export function governedReviewWritingOccurredOnV1(writingSubmittedAt: string): IsoDate {
  return londonDate(writingSubmittedAt);
}

export interface PerWordScheduleTransitionStateV1 {
  scheduleWordId: string;
  childId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  scheduleVersion: typeof PER_WORD_REVIEW_SCHEDULE_VERSION_V1;
  schedulePolicyVersion: string;
  intervalIndex: number;
  membershipStatus: PerWordReviewMembershipStatus;
  nextDueOn: IsoDate | null;
  catchUpStage: 0 | 1 | 2;
  nextRetestDueOn: IsoDate | null;
  failedReviewOn: IsoDate | null;
  preRetirementCheckDueOn: IsoDate | null;
  last28DayReviewOn: IsoDate | null;
  reteachCycleCount: number;
  rowStatus: "active" | "superseded";
}

export type R5ScheduledOutcomeEventType =
  | "review_pass"
  | "review_fail"
  | "retest_pass"
  | "retest_fail"
  | "retirement_check_pass"
  | "retirement_check_fail";

export interface PerWordScheduleTransitionResultV1 {
  word: PerWordScheduleTransitionStateV1;
  eventType: R5ScheduledOutcomeEventType;
  originalOutcome: Exclude<ReviewOriginalOutcome, "pending">;
}

function validatePolicy(policy: GovernedPerWordReviewPolicyV1): void {
  if (
    policy.intervalLadderDays.length < 1 ||
    policy.catchUpOffsetsDays.length !== 2 ||
    policy.sessionCap < 1 ||
    policy.preRetirementCheckGapDays < 1 ||
    policy.completionGraceMinutes < 0 ||
    policy.intervalLadderDays.some((value) => !Number.isInteger(value) || value < 1) ||
    policy.catchUpOffsetsDays.some((value) => !Number.isInteger(value) || value < 1)
  ) throw new Error("unsupported_review_policy");
}

function enterCatchUpV1(
  word: PerWordScheduleTransitionStateV1,
  policy: GovernedPerWordReviewPolicyV1,
  completedOn: IsoDate,
): PerWordScheduleTransitionStateV1 {
  return {
    ...word,
    membershipStatus: "catch_up",
    nextDueOn: null,
    catchUpStage: 1,
    failedReviewOn: completedOn,
    nextRetestDueOn: addDays(completedOn, policy.catchUpOffsetsDays[0]),
  };
}

function advanceNormalIntervalV1(
  word: PerWordScheduleTransitionStateV1,
  policy: GovernedPerWordReviewPolicyV1,
  completedOn: IsoDate,
  allowCleanRetirement: boolean,
  hasQualifyingIndependentAuthenticUse: boolean,
): PerWordScheduleTransitionStateV1 {
  const completedIntervalDays = policy.intervalLadderDays[word.intervalIndex];
  const stamped = completedIntervalDays === 28
    ? { ...word, last28DayReviewOn: completedOn }
    : word;
  const finalIndex = policy.intervalLadderDays.length - 1;
  if (word.intervalIndex < finalIndex) {
    const intervalIndex = word.intervalIndex + 1;
    return {
      ...stamped,
      intervalIndex,
      membershipStatus: "scheduled",
      nextDueOn: addDays(completedOn, policy.intervalLadderDays[intervalIndex]),
      catchUpStage: 0,
      nextRetestDueOn: null,
      failedReviewOn: null,
    };
  }
  if (allowCleanRetirement && hasQualifyingIndependentAuthenticUse) {
    return {
      ...stamped,
      membershipStatus: "retired",
      nextDueOn: null,
      catchUpStage: 0,
      nextRetestDueOn: null,
      failedReviewOn: null,
    };
  }
  return {
    ...stamped,
    membershipStatus: "awaiting_pre_retirement_check",
    nextDueOn: null,
    catchUpStage: 0,
    nextRetestDueOn: null,
    failedReviewOn: null,
    preRetirementCheckDueOn: addDays(completedOn, policy.preRetirementCheckGapDays),
  };
}

/** Resolves one frozen encounter. Only `originalOutcome` is accepted; repair
 * and Memory Cue facts are deliberately not inputs to scheduling. */
export function transitionPerWordScheduleV1(input: {
  policy: GovernedPerWordReviewPolicyV1;
  word: PerWordScheduleTransitionStateV1;
  dueKind: PerWordReviewDueKindV1;
  frozenDueOn: IsoDate;
  completedOn: IsoDate;
  originalOutcome: Exclude<ReviewOriginalOutcome, "pending">;
  hasQualifyingIndependentAuthenticUse?: boolean;
}): PerWordScheduleTransitionResultV1 {
  const { policy, word } = input;
  validatePolicy(policy);
  if (
    word.rowStatus !== "active" ||
    word.scheduleVersion !== PER_WORD_REVIEW_SCHEDULE_VERSION_V1 ||
    word.schedulePolicyVersion !== policy.schedulePolicyVersion ||
    word.intervalIndex < 0 ||
    word.intervalIndex >= policy.intervalLadderDays.length ||
    input.frozenDueOn > input.completedOn
  ) throw new Error("review_schedule_authority_conflict");

  if (input.dueKind === "scheduled_review") {
    if (word.membershipStatus !== "scheduled" || word.nextDueOn !== input.frozenDueOn) {
      throw new Error("review_schedule_authority_conflict");
    }
    if (input.originalOutcome === "failure") {
      return { word: enterCatchUpV1(word, policy, input.completedOn), eventType: "review_fail", originalOutcome: "failure" };
    }
    return {
      word: advanceNormalIntervalV1(
        word, policy, input.completedOn, true,
        input.hasQualifyingIndependentAuthenticUse === true,
      ),
      eventType: "review_pass",
      originalOutcome: "success",
    };
  }

  if (input.dueKind === "catch_up_retest") {
    if (
      word.membershipStatus !== "catch_up" ||
      word.nextRetestDueOn !== input.frozenDueOn ||
      word.failedReviewOn === null ||
      ![1, 2].includes(word.catchUpStage)
    ) throw new Error("review_schedule_authority_conflict");
    if (input.originalOutcome === "success") {
      if (word.preRetirementCheckDueOn !== null) {
        return {
          word: {
            ...word,
            membershipStatus: "retired",
            nextDueOn: null,
            catchUpStage: 0,
            nextRetestDueOn: null,
            failedReviewOn: null,
          },
          eventType: "retest_pass",
          originalOutcome: "success",
        };
      }
      return {
        word: advanceNormalIntervalV1(word, policy, input.completedOn, false, false),
        eventType: "retest_pass",
        originalOutcome: "success",
      };
    }
    if (word.catchUpStage === 1) {
      return {
        word: {
          ...word,
          catchUpStage: 2,
          nextRetestDueOn: addDays(word.failedReviewOn, policy.catchUpOffsetsDays[1]),
        },
        eventType: "retest_fail",
        originalOutcome: "failure",
      };
    }
    return {
      word: {
        ...word,
        membershipStatus: word.reteachCycleCount >= 1
          ? "paused_parent_review"
          : "ejected_pending_reteach",
        nextDueOn: null,
        catchUpStage: 0,
        nextRetestDueOn: null,
      },
      eventType: "retest_fail",
      originalOutcome: "failure",
    };
  }

  if (
    word.membershipStatus !== "awaiting_pre_retirement_check" ||
    word.preRetirementCheckDueOn !== input.frozenDueOn
  ) throw new Error("review_schedule_authority_conflict");
  if (input.originalOutcome === "success") {
    return {
      word: { ...word, membershipStatus: "retired", preRetirementCheckDueOn: input.frozenDueOn },
      eventType: "retirement_check_pass",
      originalOutcome: "success",
    };
  }
  return {
    word: enterCatchUpV1(word, policy, input.completedOn),
    eventType: "retirement_check_fail",
    originalOutcome: "failure",
  };
}

export function isPromptedReviewWritingAuthenticUseEligibleV1(input: {
  writingDisposition: "correct_in_writing" | "attributable_misspelling" | "unaccounted_for";
  originalOutcome: ReviewOriginalOutcome;
  originalOutcomeSource: "writing" | "audio_retrieval_check" | null;
}): boolean {
  return input.writingDisposition === "correct_in_writing" &&
    input.originalOutcome === "success" &&
    input.originalOutcomeSource === "writing";
}
