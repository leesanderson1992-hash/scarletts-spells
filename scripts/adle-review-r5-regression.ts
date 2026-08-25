import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { authenticUseProviderFromFacts } from "../lib/adle/authentic-use";
import type { AuthenticUseEventFact } from "../lib/adle/evidence-pricing";
import { addDays } from "../lib/adle/review-scheduler";
import {
  governedReviewWritingOccurredOnV1,
  isPromptedReviewWritingAuthenticUseEligibleV1,
  PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
  resolveGovernedReviewCompletionDateV1,
  selectDuePerWordReviewsV1,
  transitionPerWordScheduleV1,
  type GovernedPerWordReviewPolicyV1,
  type PerWordScheduleTransitionStateV1,
} from "../lib/adle/review-v3/per-word-scheduler";
import {
  applyScopedStarterCutoverV1,
  auditStarterInventoryV1,
  type StarterInventoryCandidateV1,
} from "../lib/adle/review-v3/starter-inventory-cutover";

const policy: GovernedPerWordReviewPolicyV1 = {
  schedulePolicyVersion: "review_policy_v1_2026-07-04",
  intervalLadderDays: [1, 3, 7, 14, 28, 56],
  catchUpOffsetsDays: [1, 3],
  sessionCap: 10,
  preRetirementCheckGapDays: 112,
  completionGraceMinutes: 120,
};

function word(index: number, overrides: Partial<PerWordScheduleTransitionStateV1> = {}): PerWordScheduleTransitionStateV1 {
  return {
    scheduleWordId: `schedule-${String(index).padStart(2, "0")}`,
    childId: "child-a",
    canonicalWordId: `word-${String(index).padStart(2, "0")}`,
    sourceBundleId: `bundle-${index % 4}`,
    scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
    schedulePolicyVersion: policy.schedulePolicyVersion,
    intervalIndex: 1,
    membershipStatus: "scheduled",
    nextDueOn: "2026-08-25",
    catchUpStage: 0,
    nextRetestDueOn: null,
    failedReviewOn: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: null,
    reteachCycleCount: 0,
    rowStatus: "active",
    ...overrides,
  };
}

function resolveScheduled(
  candidate: PerWordScheduleTransitionStateV1,
  outcome: "success" | "failure",
  completedOn = "2026-08-25",
) {
  return transitionPerWordScheduleV1({
    policy,
    word: candidate,
    dueKind: "scheduled_review",
    frozenDueOn: candidate.nextDueOn!,
    completedOn,
    originalOutcome: outcome,
  });
}

// Completion-date governance: same day, continuity grace, genuine resumes,
// and Europe/London DST boundaries.
assert.equal(resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-08-24",
  latestPersistedActivityAt: "2026-08-24T17:30:00.000Z",
  completedAt: "2026-08-24T18:00:00.000Z",
  completionGraceMinutes: 120,
}), "2026-08-24");
assert.equal(resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-08-24",
  latestPersistedActivityAt: "2026-08-24T22:50:00.000Z",
  completedAt: "2026-08-24T23:30:00.000Z", // 00:30 BST Tuesday
  completionGraceMinutes: 120,
}), "2026-08-24");
assert.equal(resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-08-24",
  latestPersistedActivityAt: "2026-08-24T20:00:00.000Z",
  completedAt: "2026-08-25T00:30:01.000Z",
  completionGraceMinutes: 120,
}), "2026-08-25");
assert.equal(resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-08-24",
  latestPersistedActivityAt: "2026-08-24T18:00:00.000Z",
  completedAt: "2026-08-26T09:00:00.000Z",
  completionGraceMinutes: 120,
}), "2026-08-26");
assert.equal(resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-10-24",
  latestPersistedActivityAt: "2026-10-24T22:30:00.000Z",
  completedAt: "2026-10-24T23:30:00.000Z",
  completionGraceMinutes: 120,
}), "2026-10-24", "DST fallback must use Europe/London calendar dates");
assert.equal(governedReviewWritingOccurredOnV1("2026-08-24T23:30:00.000Z"), "2026-08-25");
assert.throws(() => resolveGovernedReviewCompletionDateV1({
  assignmentPracticeDate: "2026-08-27",
  latestPersistedActivityAt: "2026-08-26T08:00:00.000Z",
  completedAt: "2026-08-26T09:00:00.000Z",
  completionGraceMinutes: 120,
}), /future_assignment_practice_date/);

function scenario(dispositions: readonly ("writing" | "audio" | "failure")[]) {
  const transitions = dispositions.map((disposition, index) => resolveScheduled(
    word(index + 1), disposition === "failure" ? "failure" : "success",
  ));
  const authenticUses = dispositions.filter((value) => value === "writing").length;
  return {
    transitions,
    successes: transitions.filter((entry) => entry.originalOutcome === "success").length,
    failures: transitions.filter((entry) => entry.originalOutcome === "failure").length,
    authenticUses,
  };
}

// A–C: scheduled outcomes, prompted authentic evidence, and independent word
// transitions do not depend on bundle or specialist route.
const a = scenario(Array(10).fill("writing"));
assert.deepEqual([a.successes, a.authenticUses, a.transitions.filter((x) => x.word.intervalIndex === 2).length], [10, 10, 10]);
const b = scenario([...Array(6).fill("writing"), ...Array(4).fill("audio")]);
assert.deepEqual([b.successes, b.authenticUses, b.transitions.filter((x) => x.word.intervalIndex === 2).length], [10, 6, 10]);
const c = scenario([...Array(5).fill("writing"), ...Array(2).fill("audio"), ...Array(3).fill("failure")]);
assert.deepEqual([
  c.successes, c.failures, c.authenticUses,
  c.transitions.filter((x) => x.word.intervalIndex === 2).length,
  c.transitions.filter((x) => x.word.membershipStatus === "catch_up").length,
], [7, 3, 5, 7, 3]);

// D: successful immediate repair and Memory Cue facts cannot be supplied to
// the scheduler, so the immutable failure remains a failure transition.
const failed = resolveScheduled(word(20, { intervalIndex: 3 }), "failure");
assert.equal(failed.originalOutcome, "failure");
assert.equal(failed.word.intervalIndex, 3);
assert.equal(failed.word.membershipStatus, "catch_up");
assert.equal(failed.word.nextRetestDueOn, "2026-08-26");

// E: a later cold catch-up success returns to the next normal interval, based
// on its actual completion date.
const recovered = transitionPerWordScheduleV1({
  policy,
  word: failed.word,
  dueKind: "catch_up_retest",
  frozenDueOn: "2026-08-26",
  completedOn: "2026-08-27",
  originalOutcome: "success",
});
assert.equal(recovered.word.intervalIndex, 4);
assert.equal(recovered.word.nextDueOn, "2026-09-24");

assert.equal(isPromptedReviewWritingAuthenticUseEligibleV1({
  writingDisposition: "correct_in_writing", originalOutcome: "success", originalOutcomeSource: "writing",
}), true);
for (const ineligible of [
  { writingDisposition: "unaccounted_for" as const, originalOutcome: "success" as const, originalOutcomeSource: "audio_retrieval_check" as const },
  { writingDisposition: "attributable_misspelling" as const, originalOutcome: "failure" as const, originalOutcomeSource: "writing" as const },
]) assert.equal(isPromptedReviewWritingAuthenticUseEligibleV1(ineligible), false);

const promptedButMalformedVerified: AuthenticUseEventFact = {
  childId: "child-a", canonicalWordId: "word-1", occurredOn: "2026-08-25",
  useKind: "authentic_correct_use", parentVerified: true, pieceRef: "prompted",
  sourceRef: "review-r5", rowStatus: "active",
  provenanceKind: "prompted_review_writing_application",
};
const independentVerified: AuthenticUseEventFact = {
  ...promptedButMalformedVerified, pieceRef: "independent", sourceRef: "writing-engine",
  provenanceKind: "independent_or_parent_verified_application",
};
assert.equal(authenticUseProviderFromFacts([promptedButMalformedVerified])
  .hasAuthenticUseSince("child-a", "word-1", "2026-08-01"), false);
assert.equal(authenticUseProviderFromFacts([promptedButMalformedVerified, independentVerified])
  .hasAuthenticUseSince("child-a", "word-1", "2026-08-01"), true);

function starter(index: number, childId = "child-a", overrides: Partial<StarterInventoryCandidateV1> = {}): StarterInventoryCandidateV1 {
  return {
    scheduleWordId: `starter-${String(index).padStart(2, "0")}`,
    childId,
    canonicalWordId: `starter-word-${String(index).padStart(2, "0")}`,
    bundleId: `legacy-bundle-${Math.floor(index / 6)}`,
    canonicalActive: true, scheduleActive: true, bundleActive: true,
    membershipStatus: "scheduled", catchUpStage: 0,
    nextRetestDueOn: null, failedReviewOn: null, preRetirementCheckDueOn: null,
    taughtHistoryCount: 1, sourceLineageCount: 1,
    bundleIntervalIndex: 0, bundleNextDueOn: addDays("2026-05-01", index),
    bundlePolicyVersion: policy.schedulePolicyVersion,
    matchingCompletedOutcomeCount: 0, mismatchedCompletedOutcomeCount: 0,
    orphanScheduledAttemptCount: 0, incompleteEncounterCount: 0,
    wordScheduleVersion: null, wordIntervalIndex: null, wordNextDueOn: null,
    wordSchedulePolicyVersion: null,
    ...overrides,
  };
}

// F and starter cutover: 47 exact legacy dates are copied, no outcome is
// fabricated, oldest 10 are selected, and 37 remain due and untouched.
const starter47 = Array.from({ length: 47 }, (_, index) => starter(index));
const outsideScope = starter(48, "child-test-history");
const audit47 = auditStarterInventoryV1([...starter47, outsideScope], ["child-a"]);
assert.deepEqual(audit47.counts, { eligible_starter: 47, already_reviewed: 0, ambiguous: 0, excluded: 0 });
const cutover = applyScopedStarterCutoverV1({
  candidates: [...starter47, outsideScope], childScope: ["child-a"], approvedFingerprint: audit47.fingerprint,
});
assert.equal(cutover[47], outsideScope, "out-of-scope row must retain object identity and bytes");
for (let index = 0; index < 47; index += 1) {
  assert.equal(cutover[index].wordNextDueOn, starter47[index].bundleNextDueOn);
  assert.equal(cutover[index].wordIntervalIndex, starter47[index].bundleIntervalIndex);
}
const due47 = selectDuePerWordReviewsV1({
  policyVersion: policy.schedulePolicyVersion, sessionCap: policy.sessionCap,
  today: "2026-08-25",
  words: cutover.slice(0, 47).map((entry) => ({
    scheduleWordId: entry.scheduleWordId, canonicalWordId: entry.canonicalWordId,
    childId: entry.childId, sourceBundleId: entry.bundleId,
    scheduleVersion: PER_WORD_REVIEW_SCHEDULE_VERSION_V1,
    schedulePolicyVersion: entry.wordSchedulePolicyVersion!, intervalIndex: entry.wordIntervalIndex!,
    nextDueOn: entry.wordNextDueOn, membershipStatus: "scheduled", catchUpStage: 0,
    nextRetestDueOn: null, preRetirementCheckDueOn: null, taughtOn: "2026-06-01", rowStatus: "active",
  })),
});
assert.equal(due47.length, 10);
assert.deepEqual(due47.map((item) => item.scheduleWordId), starter47.slice(0, 10).map((item) => item.scheduleWordId));
assert.deepEqual(cutover.slice(10, 47).map((row) => row.wordNextDueOn), starter47.slice(10).map((row) => row.bundleNextDueOn));

const classified = auditStarterInventoryV1([
  starter(60, "child-a", { matchingCompletedOutcomeCount: 1 }),
  starter(61, "child-a", { orphanScheduledAttemptCount: 1 }),
  starter(62, "child-a", { incompleteEncounterCount: 1 }),
  starter(63, "child-a", { sourceLineageCount: 0, taughtHistoryCount: 0 }),
  starter(64, "child-a", { canonicalActive: false }),
], ["child-a"]);
assert.deepEqual(classified.counts, { eligible_starter: 0, already_reviewed: 1, ambiguous: 3, excluded: 1 });
assert.throws(() => applyScopedStarterCutoverV1({
  candidates: [starter(70)], childScope: ["child-a"], approvedFingerprint: "0".repeat(64),
}), /fingerprint_drift/);
assert.throws(() => applyScopedStarterCutoverV1({
  candidates: [starter(71, "child-a", { incompleteEncounterCount: 1 })],
  childScope: ["child-a"],
  approvedFingerprint: auditStarterInventoryV1([
    starter(71, "child-a", { incompleteEncounterCount: 1 }),
  ], ["child-a"]).fingerprint,
}), /ambiguous_starter_inventory/);

// G: specialist lineage is provenance only. The same state and outcome yield
// identical scheduling for Prefix/Affix/Base/Compound bundle labels.
const mixed = ["prefix", "affix", "base", "compound"].map((origin, index) =>
  resolveScheduled(word(80 + index, { sourceBundleId: origin }), "success").word);
assert.equal(new Set(mixed.map((entry) => `${entry.intervalIndex}:${entry.nextDueOn}:${entry.membershipStatus}`)).size, 1);

// H–J: disposable transaction simulator. Fault controls live in this script,
// never in the Production RPC.
interface SimStore {
  outcomes: string[];
  authenticUses: string[];
  transitionCounts: Record<string, number>;
  receipt: { key: string; result: { replayed: boolean; outcomes: number } } | null;
  completed: boolean;
}
const transactionStore: SimStore = { outcomes: [], authenticUses: [], transitionCounts: {}, receipt: null, completed: false };
function atomicFinalize(store: SimStore, key: string, failAfter?: "outcomes" | "authentic" | "schedules" | "receipt") {
  if (store.receipt !== null) {
    if (store.receipt.key !== key) throw new Error("review_finalization_conflict");
    return { ...store.receipt.result, replayed: true };
  }
  const tx = structuredClone(store);
  for (let index = 0; index < 10; index += 1) tx.outcomes.push(`encounter-${index}`);
  if (failAfter === "outcomes") throw new Error("test_only_failure");
  for (let index = 0; index < 5; index += 1) tx.authenticUses.push(`encounter-${index}`);
  if (failAfter === "authentic") throw new Error("test_only_failure");
  for (let index = 0; index < 10; index += 1) tx.transitionCounts[`schedule-${index}`] = 1;
  if (failAfter === "schedules") throw new Error("test_only_failure");
  tx.receipt = { key, result: { replayed: false, outcomes: tx.outcomes.length } };
  if (failAfter === "receipt") throw new Error("test_only_failure");
  tx.completed = true;
  Object.assign(store, tx);
  return tx.receipt.result;
}
assert.equal(atomicFinalize(transactionStore, "same").replayed, false);
assert.equal(atomicFinalize(transactionStore, "same").replayed, true);
assert.equal(transactionStore.outcomes.length, 10);
assert.equal(Object.values(transactionStore.transitionCounts).reduce((a0, b0) => a0 + b0, 0), 10);
assert.throws(() => atomicFinalize(transactionStore, "conflict"), /conflict/);
const concurrentStore: SimStore = { outcomes: [], authenticUses: [], transitionCounts: {}, receipt: null, completed: false };
// These model the two callers after the database row lock serializes them:
// the first commits, the waiter then observes the immutable receipt.
const concurrent = [
  atomicFinalize(concurrentStore, "concurrent"),
  atomicFinalize(concurrentStore, "concurrent"),
];
assert.deepEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
for (const checkpoint of ["outcomes", "authentic", "schedules", "receipt"] as const) {
  const rollbackStore: SimStore = { outcomes: [], authenticUses: [], transitionCounts: {}, receipt: null, completed: false };
  assert.throws(() => atomicFinalize(rollbackStore, "rollback", checkpoint), /test_only_failure/);
  assert.deepEqual(rollbackStore, { outcomes: [], authenticUses: [], transitionCounts: {}, receipt: null, completed: false });
}

const migration = readFileSync(resolve(
  import.meta.dirname, "../supabase/migrations/20260825130000_add_adle_review_r5_finalization.sql",
), "utf8");
assert.match(migration, /completion_grace_minutes = 120/);
const productionFinalizer = migration.match(
  /create or replace function public\.finalize_adle_review_r5\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(productionFinalizer, "R5 Production finalizer must exist");
assert.match(productionFinalizer, /v_policy\.completion_grace_minutes/,
  "active governed policy must be the runtime completion-grace authority");
assert.doesNotMatch(productionFinalizer, /\b120\b/,
  "Production finalization must not hide a second hard-coded grace rule");
assert.match(migration, /create or replace function public\.finalize_adle_review_r5\(\s*p_review_session_id uuid,\s*p_snapshot_fingerprint text,\s*p_idempotency_key text\s*\)/);
assert.doesNotMatch(migration, /p_(now|clock|completed_at|completed_on|fault|failure|outcome|schedule_override)/i);
assert.match(migration, /provenance_kind = 'prompted_review_writing_application'/);
assert.match(migration, /parent_verified = false and verified_at is null/);
assert.match(migration, /new\.parent_verified is distinct from false or new\.verified_at is not null/);
assert.match(migration, /new\.provenance_kind is distinct from old\.provenance_kind/);
assert.match(migration, /before update on public\.adle_authentic_use_events/,
  "generic updates must be unable to convert prompted Review-writing evidence");
assert.match(migration, /authentic\.provenance_kind <> 'prompted_review_writing_application'/);
assert.match(migration, /word_schedule_transition_count = word_schedule_transition_count \+ 1/);
assert.match(migration, /for update/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /ambiguous_starter_inventory/);
assert.match(migration, /p_child_ids uuid\[\]/);
assert.doesNotMatch(migration, /create trigger[\s\S]{0,160}adle_review_bundles/i,
  "R5 must not install bundle/per-word synchronization triggers");
assert.doesNotMatch(migration, /update public\.adle_review_bundles/i);
assert.doesNotMatch(migration, /update public\.assignment_items/i);
assert.doesNotMatch(migration, /update public\.daily_assignments/i);
assert.doesNotMatch(migration, /insert into public\.daily_assignments/i);
assert.doesNotMatch(migration, /assignment_generation|review_first|review-only/i);

console.log("PASS: ADLE Review R5 per-word evidence, scheduling, cutover, atomicity, and compatibility regressions");
