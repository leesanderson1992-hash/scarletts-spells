import type { IsoDate } from "../review-scheduler";
import {
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  selectDuePerWordReviewsV1,
  type PerWordReviewScheduleFactV1,
} from "../review-v3/per-word-scheduler";
import {
  CURRENT_REVIEW_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type ReviewRung,
} from "./contracts";
import type { HydratedReviewSchedule } from "./runtime-coexistence";

export type MixedReviewDueItem = {
  scheduleWordId: string;
  canonicalWordId: string;
  sourceBundleId: string | null;
  dueKind: "scheduled_review" | "catch_up_retest" | "pre_retirement_check" | "next_day_recovery";
  dueOn: IsoDate;
  intervalIndex: number;
  schedulePolicyVersion: string;
  wordScheduleVersion: string;
  taughtOn: IsoDate;
};

type TargetHydrated = Extract<HydratedReviewSchedule, { kind: "TARGET_REGRESSION_V1" }>;

/**
 * One deterministic due ordering for coexisting exact pins. The released v1
 * selector remains the authority for every v1 row. Target rows are admitted
 * only after C2B.3 hydration has proved their policy, state shape, ledger and
 * route. FR.3 admits target DAY_56 and the singular governed pre-retirement
 * check only when their persisted due date has arrived.
 */
export function selectDueMixedReviewWords(input: {
  today: IsoDate;
  sessionCap: number;
  currentWords: readonly PerWordReviewScheduleFactV1[];
  targetWords: readonly { schedule: TargetHydrated; taughtOn: IsoDate }[];
}): MixedReviewDueItem[] {
  const current = selectDuePerWordReviewsV1({
    policyVersion: CURRENT_REVIEW_POLICY_VERSION,
    sessionCap: input.currentWords.length || input.sessionCap,
    today: input.today,
    words: input.currentWords,
  }).map((word) => ({
    ...word,
    dueOn: word.dueOn as IsoDate,
    wordScheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
    taughtOn: input.currentWords.find((candidate) => candidate.scheduleWordId === word.scheduleWordId)!.taughtOn as IsoDate,
  }));
  const target = input.targetWords.flatMap(({ schedule, taughtOn }): MixedReviewDueItem[] => {
    const route = schedule.state.route;
    if (route.membership === "SCHEDULED") {
      if (route.dueOn > input.today) return [];
      return [{
        scheduleWordId: schedule.scheduleWordId,
        canonicalWordId: schedule.canonicalWordId,
        sourceBundleId: schedule.sourceBundleId,
        dueKind: "scheduled_review",
        dueOn: route.dueOn,
        intervalIndex: rungIndex(route.rung),
        schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
        wordScheduleVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
        taughtOn,
      }];
    }
    if (route.membership === "PRE_RETIREMENT_PRESERVED") {
      if (route.dueOn > input.today) return [];
      return [{
        scheduleWordId: schedule.scheduleWordId,
        canonicalWordId: schedule.canonicalWordId,
        sourceBundleId: schedule.sourceBundleId,
        dueKind: "pre_retirement_check",
        dueOn: route.dueOn,
        intervalIndex: rungIndex("DAY_56"),
        schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
        wordScheduleVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
        taughtOn,
      }];
    }
    if (route.membership !== "NEXT_DAY_RECOVERY" || route.dueOn > input.today) return [];
    return [{
      scheduleWordId: schedule.scheduleWordId,
      canonicalWordId: schedule.canonicalWordId,
      sourceBundleId: schedule.sourceBundleId,
      dueKind: "next_day_recovery",
      dueOn: route.dueOn,
      intervalIndex: rungIndex(route.failedRung),
      schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
      wordScheduleVersion: TARGET_PER_WORD_STATE_SHAPE_VERSION,
      taughtOn,
    }];
  });
  return [...current, ...target].sort((left, right) =>
    left.dueOn.localeCompare(right.dueOn)
    || left.taughtOn.localeCompare(right.taughtOn)
    || left.canonicalWordId.localeCompare(right.canonicalWordId)
    || left.scheduleWordId.localeCompare(right.scheduleWordId)
  ).slice(0, input.sessionCap);
}

function rungIndex(rung: ReviewRung): number {
  return ["DAY_1", "DAY_3", "DAY_7", "DAY_14", "DAY_28", "DAY_56"].indexOf(rung);
}
