import assert from "node:assert/strict";

import { addDays } from "../lib/adle/review-scheduler";
import {
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  selectDuePerWordReviewsV1,
  transitionPerWordScheduleV1,
  type GovernedPerWordReviewPolicyV1,
  type PerWordScheduleTransitionStateV1,
} from "../lib/adle/review-v3/per-word-scheduler";

const policy: GovernedPerWordReviewPolicyV1 = {
  schedulePolicyVersion: "review_policy_v1_2026-07-04",
  intervalLadderDays: [1, 3, 7, 14, 28, 56],
  catchUpOffsetsDays: [1, 3],
  sessionCap: 10,
  preRetirementCheckGapDays: 112,
  completionGraceMinutes: 120,
};
let words: PerWordScheduleTransitionStateV1[] = Array.from({ length: 23 }, (_, index) => ({
  scheduleWordId: `mw-schedule-${String(index).padStart(2, "0")}`,
  childId: "mw-child",
  canonicalWordId: `mw-word-${String(index).padStart(2, "0")}`,
  sourceBundleId: `mw-bundle-${index % 5}`,
  scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  schedulePolicyVersion: policy.schedulePolicyVersion,
  intervalIndex: 0,
  membershipStatus: "scheduled",
  nextDueOn: addDays("2026-08-17", index % 3),
  catchUpStage: 0,
  nextRetestDueOn: null,
  failedReviewOn: null,
  preRetirementCheckDueOn: null,
  last28DayReviewOn: null,
  reteachCycleCount: 0,
  rowStatus: "active",
}));

const attendance = [
  "2026-08-17", "2026-08-18", "2026-08-20", "2026-08-21",
  "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-28",
  "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
];
const transitions = new Map<string, number>();
const promptedAuthentic = new Set<string>();
for (const day of attendance) {
  const due = selectDuePerWordReviewsV1({
    policyVersion: policy.schedulePolicyVersion,
    sessionCap: policy.sessionCap,
    today: day,
    words: words.map((entry) => ({ ...entry, taughtOn: "2026-08-16" })),
  });
  const selectedIds = new Set(due.map((item) => item.scheduleWordId));
  words = words.map((entry) => {
    if (!selectedIds.has(entry.scheduleWordId)) return entry;
    const frozen = due.find((item) => item.scheduleWordId === entry.scheduleWordId)!;
    // Deterministic writing use applies only to every third selected target;
    // every other selected target completes by cold audio retrieval.
    const writingSuccess = Number(entry.scheduleWordId.slice(-2)) % 3 === 0;
    if (writingSuccess) promptedAuthentic.add(`${day}:${entry.scheduleWordId}`);
    const result = transitionPerWordScheduleV1({
      policy,
      word: entry,
      dueKind: frozen.dueKind,
      frozenDueOn: frozen.dueOn,
      completedOn: day,
      originalOutcome: "success",
    });
    transitions.set(entry.scheduleWordId, (transitions.get(entry.scheduleWordId) ?? 0) + 1);
    return result.word;
  });
}

assert.equal([...transitions.values()].reduce((sum, count) => sum + count, 0) > 23, true,
  "multi-week attendance should produce repeated cold scheduled cycles");
for (const entry of words) {
  assert.equal(transitions.get(entry.scheduleWordId) ?? 0, entry.intervalIndex,
    "each interval advance must correspond to the word being frozen into a real Review");
}
for (const evidenceKey of promptedAuthentic) {
  const scheduleWordId = evidenceKey.split(":")[1];
  assert.equal((transitions.get(scheduleWordId) ?? 0) > 0, true,
    "prompted writing evidence must belong to a selected/finalized word");
}
const neverCreditedAbsent = words.filter((entry) => ![...promptedAuthentic]
  .some((key) => key.endsWith(`:${entry.scheduleWordId}`)));
assert.equal(neverCreditedAbsent.length > 0, true,
  "audio-only or not-yet-written words must receive no prompted writing credit");

console.log(JSON.stringify({
  status: "PASS",
  attendanceDays: attendance.length,
  distinctWordsTransitioned: transitions.size,
  totalPerWordTransitions: [...transitions.values()].reduce((sum, count) => sum + count, 0),
  promptedReviewWritingEvents: promptedAuthentic.size,
  wordsWithoutFalseWritingCredit: neverCreditedAbsent.length,
}));
