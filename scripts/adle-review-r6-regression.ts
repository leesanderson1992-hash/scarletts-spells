import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { REVIEW_CHALLENGE_TYPES, type ReviewChallengeType } from "../lib/adle/review-v3/contracts";
import {
  compileReviewSnapshotR6,
  selectInitialReviewChallengeR6,
  type ReviewR6DueWordFact,
  type ReviewR6PromptFact,
} from "../lib/adle/review-v3/r6-snapshot-compiler";
import {
  applyR6GateBAuthorityCutover,
  auditR6GateBAuthority,
  R6_ACTIVE_REVIEW_MEMBERSHIPS,
  type R6GateBWordFact,
} from "../lib/adle/review-v3/r6-gate-b-authority-cutover";

const hash = (letter: string) => letter.repeat(64);
const words: ReviewR6DueWordFact[] = Array.from({ length: 10 }, (_, index) => ({
  scheduleWordId: `schedule-${index + 1}`,
  canonicalWordId: `word-${index + 1}`,
  canonicalSpelling: `word${index + 1}`,
  sourceBundleId: `bundle-${Math.floor(index / 3)}`,
  dueKind: "scheduled_review",
  dueOn: `2026-08-${String(10 + index).padStart(2, "0")}`,
  intervalIndex: 0,
  schedulePolicyVersion: "review-policy-v1",
  wordScheduleVersion: "adle_review_per_word_schedule_v1",
  taughtOn: "2026-07-01",
  answerAuthorityReferenceId: `answer-${index + 1}`,
  answerAuthorityVersion: "v1",
  answerAuthorityFingerprint: hash("a"),
  audioAuthorityReferenceId: `audio-${index + 1}`,
  audioAuthorityVersion: "v1",
  audioAuthorityFingerprint: hash("b"),
  audioKind: "speech_text",
  speechText: `word${index + 1}`,
  assetReference: null,
  routeProvenance: [{
    routeId: `specialist:skill-${index % 3}`,
    microSkillKey: `skill-${index % 3}`,
    learningItemId: `learning-${index + 1}`,
  }],
  availableCue: null,
}));
const prompts: ReviewR6PromptFact[] = REVIEW_CHALLENGE_TYPES.map((challengeType, index) => ({
  contractVersion: 3,
  promptVersionId: `prompt-${index + 1}`,
  stablePromptKey: `prompt-key-${challengeType}`,
  challengeType,
  contentVersion: "v1",
  promptText: `Approved ${challengeType} prompt`,
  instructionText: "Approved instructions",
  configuration: {},
  reusePolicy: challengeType === "reflection"
    ? "reusable_lru_no_immediate_repeat"
    : "once_per_learner",
  authority: { releaseReference: "approved-package-r6", sourceFingerprint: hash("c") },
  lastCompletedAt: null,
}));

function compile() {
  return compileReviewSnapshotR6({
    assignmentId: "fb98f87d-f49d-52f8-8a09-16efb0de4919",
    reviewItemId: "8f2d9100-f875-59cc-9092-a44710ad20e8",
    childId: "child-r6",
    assignmentDate: "2026-08-25",
    dueWords: words,
    prompts,
  });
}

const first = compile();
const second = compile();
assert.equal(first.ok, true);
assert.equal(second.ok, true);
if (!first.ok || !second.ok) throw new Error("compiler unexpectedly blocked");
assert.deepEqual(first.snapshot, second.snapshot, "same governed inputs must compile byte-equivalent snapshots");
assert.equal(first.snapshot.targets.length, 10);
assert.equal(first.snapshot.targets[0].schedule.dueOn, "2026-08-10");
assert.equal(first.snapshot.targets[9].schedule.dueOn, "2026-08-19");
assert.equal(first.snapshot.promptCandidates.length, 5);
assert.match(first.snapshot.provenance.sourceFingerprint, /^[a-f0-9]{64}$/);

const selected: ReviewChallengeType = selectInitialReviewChallengeR6({
  childId: "child-r6",
  assignmentDate: "2026-08-25",
  scheduleWordIds: words.map((word) => word.scheduleWordId),
  promptVersionIds: prompts.map((prompt) => prompt.promptVersionId),
});
assert.equal(selected, first.snapshot.initialChallengeType);
assert.equal(selectInitialReviewChallengeR6({
  childId: "child-r6",
  assignmentDate: "2026-08-25",
  scheduleWordIds: words.map((word) => word.scheduleWordId),
  promptVersionIds: prompts.map((prompt) => prompt.promptVersionId),
}), selected);

assert.deepEqual(compileReviewSnapshotR6({
  assignmentId: "assignment", reviewItemId: "item", childId: "child",
  assignmentDate: "2026-08-25", dueWords: words.slice(0, 1),
  prompts: prompts.slice(0, 4),
}), { ok: false, blockerCode: "review_r6_prompt_package_incomplete" });
assert.equal(compileReviewSnapshotR6({
  assignmentId: "assignment", reviewItemId: "item", childId: "child",
  assignmentDate: "2026-08-25", dueWords: [...words, words[0]], prompts,
}).ok, false, "more than ten targets must fail before assignment creation");

const auditOn = "2026-08-25";
function gateBWord(overrides: Partial<R6GateBWordFact> & Pick<R6GateBWordFact,
  "scheduleWordId" | "canonicalWordId">): R6GateBWordFact {
  const { scheduleWordId, canonicalWordId, ...stateOverrides } = overrides;
  return {
    scheduleWordId,
    childId: "child-gate-b",
    canonicalWordId,
    bundleId: `bundle-${scheduleWordId}`,
    membershipStatus: "scheduled",
    catchUpStage: 0,
    nextRetestDueOn: null,
    failedReviewOn: null,
    preRetirementCheckDueOn: null,
    last28DayReviewOn: null,
    reteachCycleCount: 0,
    taughtOn: "2026-07-01",
    rowStatus: "active",
    bundleChildId: "child-gate-b",
    bundleSourceRef: `assignment:source-${scheduleWordId}`,
    bundleIntervalIndex: 3,
    bundleNextDueOn: auditOn,
    bundlePolicyVersion: "review_policy_v1_2026-07-04",
    bundleStatus: "active",
    bundleRowStatus: "active",
    canonicalRowStatus: "active",
    taughtHistoryReferences: [`taught-${scheduleWordId}`],
    routeProvenanceReferences: [`route-${scheduleWordId}:prefix`],
    sourceAssignmentItemReferences: [`item-${scheduleWordId}`],
    outcomeReferences: [],
    wordScheduleVersion: null,
    wordIntervalIndex: null,
    wordNextDueOn: null,
    wordSchedulePolicyVersion: null,
    ...stateOverrides,
  };
}

const gateBWords: R6GateBWordFact[] = [
  // 1. Future-due normal word; the 14-day stage and 3 September date survive.
  gateBWord({ scheduleWordId: "future", canonicalWordId: "word-future",
    bundleIntervalIndex: 3, bundleNextDueOn: "2026-09-03" }),
  // 2. Overdue normal word.
  gateBWord({ scheduleWordId: "overdue", canonicalWordId: "word-overdue",
    bundleIntervalIndex: 2, bundleNextDueOn: "2026-08-20" }),
  // 3. A prior outcome is history, not a reason to omit a still-active word.
  gateBWord({ scheduleWordId: "reviewed-active", canonicalWordId: "word-reviewed-active",
    outcomeReferences: ["outcome-review-pass-1"] }),
  // 4. Catch-up stage 1.
  gateBWord({ scheduleWordId: "catch-up-1", canonicalWordId: "word-catch-up-1",
    membershipStatus: "catch_up", catchUpStage: 1,
    nextRetestDueOn: "2026-08-26", failedReviewOn: "2026-08-25" }),
  // 5. Catch-up stage 2.
  gateBWord({ scheduleWordId: "catch-up-2", canonicalWordId: "word-catch-up-2",
    membershipStatus: "catch_up", catchUpStage: 2,
    nextRetestDueOn: "2026-08-28", failedReviewOn: "2026-08-25" }),
  // 6. Awaiting the governed pre-retirement check.
  gateBWord({ scheduleWordId: "pre-retirement", canonicalWordId: "word-pre-retirement",
    membershipStatus: "awaiting_pre_retirement_check",
    preRetirementCheckDueOn: "2026-09-10", last28DayReviewOn: "2026-05-01" }),
  // 7. Mixed state includes the other genuinely live governed state: parent pause.
  gateBWord({ scheduleWordId: "paused", canonicalWordId: "word-paused",
    membershipStatus: "paused_parent_review", failedReviewOn: "2026-08-15",
    reteachCycleCount: 1 }),
  // 8. Multiple route/assignment provenance references remain protected.
  gateBWord({ scheduleWordId: "multi-route", canonicalWordId: "word-multi-route",
    bundleNextDueOn: "2026-09-05",
    routeProvenanceReferences: ["route-prefix", "route-affix"],
    sourceAssignmentItemReferences: ["item-prefix", "item-affix"] }),
  // Historical/non-scheduled states must not inflate active parity.
  gateBWord({ scheduleWordId: "retired", canonicalWordId: "word-retired",
    membershipStatus: "retired" }),
  gateBWord({ scheduleWordId: "ejected", canonicalWordId: "word-ejected",
    membershipStatus: "ejected_pending_reteach" }),
  gateBWord({ scheduleWordId: "superseded", canonicalWordId: "word-superseded",
    rowStatus: "superseded" }),
];
const beforeGateBWords = structuredClone(gateBWords);
const gateBAudit = auditR6GateBAuthority({
  words: gateBWords, childScope: ["child-gate-b"], auditOn,
});
assert.deepEqual(R6_ACTIVE_REVIEW_MEMBERSHIPS, [
  "scheduled", "catch_up", "awaiting_pre_retirement_check", "paused_parent_review",
], "the exact live-state predicate must remain explicit");
assert.deepEqual(gateBAudit.counts, {
  totalActiveScheduleRows: 8,
  canonicalWords: 8,
  legacyAuthoritative: 8,
  alreadyPerWordAuthoritative: 0,
  excluded: 3,
  overdue: 1,
  dueToday: 1,
  futureDue: 5,
  catchUpStage1: 1,
  catchUpStage2: 1,
  preRetirement: 1,
  ambiguity: 0,
});
assert.deepEqual(gateBAudit.stateCounts, {
  scheduled: 4, catch_up: 2, awaiting_pre_retirement_check: 1, paused_parent_review: 1,
});
assert.match(gateBAudit.fingerprint, /^[a-f0-9]{64}$/);
assert.match(gateBAudit.protectedStateDigest, /^[a-f0-9]{64}$/);

const cutover = applyR6GateBAuthorityCutover({
  words: gateBWords,
  childScope: ["child-gate-b"],
  auditOn,
  approvedFingerprint: gateBAudit.fingerprint,
  cutoverVersion: "gate-b-authority-v1",
  idempotencyKey: "owner-token-1",
});
assert.equal(cutover.replayed, false);
assert.equal(cutover.receipt.initializedAuthorityRows, 8);
assert.equal(cutover.receipt.protectedBeforeDigest, cutover.receipt.protectedAfterDigest,
  "13. every protected scheduler/provenance/history value must have exact parity");
const afterGateBAudit = auditR6GateBAuthority({
  words: cutover.words, childScope: ["child-gate-b"], auditOn,
});
assert.equal(afterGateBAudit.counts.legacyAuthoritative, 0);
assert.equal(afterGateBAudit.counts.alreadyPerWordAuthoritative, 8);
assert.equal(afterGateBAudit.protectedStateDigest, gateBAudit.protectedStateDigest);
assert.deepEqual(afterGateBAudit.activeRowIds, gateBAudit.activeRowIds,
  "12. no schedule word may be lost or duplicated");
assert.deepEqual(afterGateBAudit.canonicalWordIds, gateBAudit.canonicalWordIds);
assert.equal(afterGateBAudit.outcomeReferenceCount, gateBAudit.outcomeReferenceCount,
  "no Review outcome may be fabricated or removed");
for (const id of gateBAudit.activeRowIds) {
  const before = gateBAudit.rows.find((row) => row.scheduleWordId === id);
  const after = afterGateBAudit.rows.find((row) => row.scheduleWordId === id);
  assert.deepEqual(after?.protectedState, before?.protectedState,
    `protected scheduler state must remain exact for ${id}`);
}

// 9. Identical replay returns the existing receipt without another conversion.
const replay = applyR6GateBAuthorityCutover({
  words: cutover.words, childScope: ["child-gate-b"], auditOn,
  approvedFingerprint: gateBAudit.fingerprint,
  cutoverVersion: "gate-b-authority-v1", idempotencyKey: "owner-token-1",
  receipts: [cutover.receipt],
});
assert.equal(replay.replayed, true);
assert.deepEqual(replay.receipt, cutover.receipt);

// 10. A different fingerprint with the same token fails closed.
assert.throws(() => applyR6GateBAuthorityCutover({
  words: cutover.words, childScope: ["child-gate-b"], auditOn,
  approvedFingerprint: hash("f"),
  cutoverVersion: "gate-b-authority-v1", idempotencyKey: "owner-token-1",
  receipts: [cutover.receipt],
}), /idempotency_conflict/);

// 11. Forced failure is transaction-shaped: the caller-owned rows stay untouched.
assert.throws(() => applyR6GateBAuthorityCutover({
  words: gateBWords, childScope: ["child-gate-b"], auditOn,
  approvedFingerprint: gateBAudit.fingerprint,
  cutoverVersion: "forced-failure", idempotencyKey: "owner-token-failure",
  forceFailureAfterMutation: true,
}), /forced_transaction_failure/);
assert.deepEqual(gateBWords, beforeGateBWords, "forced failure must roll back the complete candidate mutation");

const ambiguousCatchUp = gateBWord({
  scheduleWordId: "ambiguous-catch-up", canonicalWordId: "word-ambiguous",
  membershipStatus: "catch_up", catchUpStage: 1,
  nextRetestDueOn: null, failedReviewOn: "2026-08-25",
});
const ambiguousAudit = auditR6GateBAuthority({
  words: [ambiguousCatchUp], childScope: ["child-gate-b"], auditOn,
});
assert.equal(ambiguousAudit.counts.ambiguity, 1);
assert.throws(() => applyR6GateBAuthorityCutover({
  words: [ambiguousCatchUp], childScope: ["child-gate-b"], auditOn,
  approvedFingerprint: ambiguousAudit.fingerprint,
  cutoverVersion: "ambiguous", idempotencyKey: "ambiguous-token",
}), /inventory_ambiguous/);

const migration = readFileSync(resolve(
  import.meta.dirname,
  "../supabase/migrations/20260825140000_add_adle_review_r6_unified_session.sql",
), "utf8");
for (const table of [
  "adle_today_session_orchestrations",
  "adle_specialist_stage_checkpoints",
  "adle_review_r6_authority_cutover_receipts",
  "adle_review_r6_child_rollouts",
  "adle_review_r6_approval_receipts",
]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
for (const fn of [
  "persist_adle_review_assignment_r6",
  "transition_adle_review_writing_r6",
  "finalize_adle_review_stage_r6",
  "append_adle_specialist_stage_r6",
  "adopt_adle_specialist_only_session_r6",
  "complete_adle_review_only_session_r6",
]) assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /rollout_state <> 'active'/);
assert.match(migration, /old\.compiled_lesson_snapshot is not null/);
assert.match(migration, /major_stage = 'specialist_generation'/);
assert.match(migration, /review_r6_oldest_due_selection_conflict/);
assert.match(migration, /adle_review_r6_legacy_bundle_advancement_blocked/);
assert.match(migration, /adle_review_per_word_schedule_v1/);
assert.match(migration, /p_intakes jsonb/);
assert.match(migration, /rollout_state text not null default 'inactive'/,
  "the R6 migration must default every future scope to inactive");
assert.doesNotMatch(migration, /rollout_state[^\n]*default 'active'/i,
  "the R6 migration must not default any learner scope to active");
assert.doesNotMatch(migration, /insert into public\.adle_review_prompt_versions/i,
  "the R6 migration must not invent Production prompts");
assert.match(migration, /create or replace function public\.audit_adle_review_schedule_authority_r6/,
  "Gate B must expose the exact-state audit before mutation");
assert.match(migration, /create or replace function public\.apply_adle_review_schedule_authority_cutover_r6/,
  "the fingerprint-bound authority cutover must remain behind the R6 Gate B wrapper");
assert.match(migration, /gate_b_schedule_authority_cutover/,
  "Gate B receipts must name the one-time authority transition, not the restrictive starter subset");
assert.doesNotMatch(migration, /v_result := public\.apply_adle_review_starter_cutover_r5/,
  "R6 Gate B must not delegate to the restrictive starter-only cutover");
assert.match(migration, /'scheduled', 'catch_up', 'awaiting_pre_retirement_check',\s*'paused_parent_review'/,
  "the exact live scheduler-state predicate must be pinned in SQL");
assert.match(migration, /protectedStateDigest/);
assert.match(migration, /adle_review_r6_authority_cutover_protected_state_changed/);
assert.match(migration, /v_initialized <> \(v_before#>>'\{counts,legacyAuthoritative\}'\)::integer/,
  "the transaction must convert the exact approved row count");

const todayService = readFileSync(resolve(import.meta.dirname, "../lib/adle/today-assignment-service.ts"), "utf8");
assert.ok(todayService.indexOf("ensureReviewAssignmentR6") < todayService.indexOf("const existing = statusResult"),
  "Review resolution must precede the same-day specialist header path");
const learnerPage = readFileSync(resolve(import.meta.dirname, "../app/learn/week/page.tsx"), "utf8");
assert.match(learnerPage, /form action=\{openTodayAdleSessionAction\}/,
  "Today's Lesson must enter through a POST server action");
assert.doesNotMatch(learnerPage, /href=\{buildScopedPath\("\/learn\/week\/adle"/,
  "the historical passive Today link must be removed");

console.log(JSON.stringify({
  status: "PASS",
  gateBFixtureReceipt: {
    activeStatePredicate: R6_ACTIVE_REVIEW_MEMBERSHIPS,
    counts: gateBAudit.counts,
    stateCounts: gateBAudit.stateCounts,
    outcomeReferenceCount: gateBAudit.outcomeReferenceCount,
    auditFingerprint: gateBAudit.fingerprint,
    protectedBeforeDigest: cutover.receipt.protectedBeforeDigest,
    protectedAfterDigest: cutover.receipt.protectedAfterDigest,
    initializedAuthorityRows: cutover.receipt.initializedAuthorityRows,
    replayVerified: replay.replayed,
    conflictingReplayRejected: true,
    forcedFailureRollbackVerified: true,
  },
  unifiedSession: {
    inactiveByDefault: true,
    reviewFirst: true,
    postOnlyEntry: true,
  },
}));
