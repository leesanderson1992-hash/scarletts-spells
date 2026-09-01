import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  decideControlledGraduationV1,
} from "../lib/adle/review-policy/controlled-graduation-v1";
import {
  persistControlledReceiptTargetHandoff,
  persistGovernedControlledReceipt,
  selectGovernedControlledCycles,
  type GovernedControlledAttempt,
  type GovernedControlledCycle,
} from "../lib/adle/review-policy/controlled-graduation-integration";
import {
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
} from "../lib/adle/review-policy/contracts";
import {
  hydratePersistedReviewSchedule,
  type PersistedReviewScheduleWordRow,
} from "../lib/adle/review-policy/runtime-coexistence";
import { TARGET_REVIEW_POLICY_CONFIG } from "../lib/adle/review-policy/target-regression-v1";

const ID = {
  parent: "00000000-0000-0000-0000-000000000001",
  child: "00000000-0000-0000-0000-000000000002",
  assignment: "00000000-0000-0000-0000-000000000003",
  word: "00000000-0000-0000-0000-000000000004",
  itemCover: "00000000-0000-0000-0000-000000000005",
  itemDictation: "00000000-0000-0000-0000-000000000006",
  cover: "00000000-0000-0000-0000-000000000007",
  dictation: "00000000-0000-0000-0000-000000000008",
  repair: "00000000-0000-0000-0000-000000000009",
  episode: "00000000-0000-0000-0000-000000000010",
  schedule: "00000000-0000-0000-0000-000000000011",
};

function attempt(input: {
  id: string;
  kind: string;
  correct: boolean;
  sourceRef?: string;
  itemId?: string;
}): GovernedControlledAttempt {
  return {
    id: input.id,
    child_id: ID.child,
    parent_user_id: ID.parent,
    daily_assignment_id: ID.assignment,
    assignment_item_id: input.itemId ?? (
      input.kind === "lesson_dictation" ? ID.itemDictation : ID.itemCover
    ),
    canonical_word_id: ID.word,
    attempt_kind: input.kind,
    evidence_class: "first_exposure_lesson_attempt",
    source_ref: input.sourceRef ?? "lesson:cycle:a",
    is_correct: input.correct,
    created_at: input.kind === "lesson_dictation"
      ? "2026-09-01T12:00:02Z"
      : "2026-09-01T12:00:01Z",
  };
}

function select(input: {
  sourceRef?: string;
  attempts: readonly GovernedControlledAttempt[];
}) {
  return selectGovernedControlledCycles({
    childId: ID.child,
    parentUserId: ID.parent,
    assignmentId: ID.assignment,
    sourceRef: input.sourceRef ?? "lesson:cycle:a",
    targetCanonicalWordIds: [ID.word],
    assignmentItems: [
      { id: ID.itemCover, position: 3 },
      { id: ID.itemDictation, position: 4 },
    ],
    attempts: input.attempts,
  });
}

async function main(): Promise<void> {
  // 1-2. All four OR combinations preserve both immutable source outcomes.
  for (const [cover, dictation, expected] of [
    ["pass", "pass", "PASS"],
    ["pass", "fail", "PASS"],
    ["fail", "pass", "PASS"],
    ["fail", "fail", "NOT_PASSED"],
  ] as const) {
    const decision = decideControlledGraduationV1({
      coverWrite: { eventId: ID.cover, outcome: cover },
      sentenceDictation: { eventId: ID.dictation, outcome: dictation },
    });
    assert.equal(decision.decision, expected);
    assert.deepEqual(decision.coverWrite, { eventId: ID.cover, outcome: cover });
    assert.deepEqual(decision.sentenceDictation, { eventId: ID.dictation, outcome: dictation });
  }

  const passing = select({
    attempts: [
      attempt({ id: ID.cover, kind: "lesson_production", correct: true }),
      attempt({ id: ID.dictation, kind: "lesson_dictation", correct: false }),
    ],
  });
  assert.equal(passing.blockers.length, 0);
  assert.equal(passing.cycles.length, 1);
  assert.equal(passing.cycles[0].decision.decision, "PASS");
  assert.equal(passing.cycles[0].decision.coverWrite.eventId, ID.cover);
  assert.equal(passing.cycles[0].decision.sentenceDictation.eventId, ID.dictation);

  // 3. A repair row cannot supply either governed voter.
  const repairOnly = select({
    attempts: [
      attempt({ id: ID.cover, kind: "lesson_production", correct: false }),
      attempt({ id: ID.repair, kind: "repair_retry", correct: true }),
    ],
  });
  assert.equal(repairOnly.cycles.length, 0);
  assert.deepEqual(repairOnly.blockers, [{
    canonicalWordId: ID.word,
    reason: "CONTROLLED_PAIR_INCOMPLETE",
  }]);

  // 4. Cross-cycle and malformed suffix attempts cannot be paired.
  for (const wrongSource of ["lesson:cycle:b", "lesson:cycle:a:garbage"] as const) {
    const rejected = select({
      attempts: [
        attempt({ id: ID.cover, kind: "lesson_production", correct: true }),
        attempt({
          id: ID.dictation,
          kind: "lesson_dictation",
          correct: true,
          sourceRef: wrongSource,
        }),
      ],
    });
    assert.equal(rejected.cycles.length, 0);
    assert.equal(rejected.blockers[0].reason, "CONTROLLED_PAIR_INCOMPLETE");
  }
  const governedSuffixes = select({
    attempts: [
      attempt({
        id: ID.cover,
        kind: "lesson_production",
        correct: true,
        sourceRef: "lesson:cycle:a:3",
      }),
      attempt({
        id: ID.dictation,
        kind: "lesson_dictation",
        correct: true,
        sourceRef: "lesson:cycle:a:4",
      }),
    ],
  });
  assert.equal(governedSuffixes.cycles.length, 1);

  type RpcArgs = Record<string, unknown>;
  const receiptByIdentity = new Map<string, { fingerprint: string; receiptId: string; decision: string }>();
  const transitionByKey = new Map<string, { fingerprint: string; transitionEventId: string; revision: number }>();
  const rpcCalls: Array<{ name: string; args: RpcArgs }> = [];
  const client = {
    async rpc(name: string, args: RpcArgs) {
      rpcCalls.push({ name, args: structuredClone(args) });
      if (name === "persist_adle_controlled_graduation_receipt_c2b2") {
        const identity = [
          args.p_child_id, args.p_daily_assignment_id, args.p_canonical_word_id,
          args.p_source_ref, args.p_controlled_cycle_kind,
        ].join("|");
        const fingerprint = String(args.p_source_fingerprint);
        const existing = receiptByIdentity.get(identity);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            return { data: null, error: { message: "adle_c2b2_controlled_idempotency_conflict" } };
          }
          return {
            data: {
              status: "already_persisted",
              receiptId: existing.receiptId,
              decision: existing.decision,
            },
            error: null,
          };
        }
        const receiptId = `00000000-0000-0000-0001-${String(receiptByIdentity.size + 1).padStart(12, "0")}`;
        receiptByIdentity.set(identity, {
          fingerprint,
          receiptId,
          decision: String(args.p_decision),
        });
        return {
          data: { status: "persisted", receiptId, decision: args.p_decision },
          error: null,
        };
      }
      assert.equal(name, "persist_adle_review_schedule_transition_c2b2");
      const key = String(args.p_idempotency_key);
      const fingerprint = String(args.p_source_fingerprint);
      const existing = transitionByKey.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return { data: null, error: { message: "adle_c2b2_transition_idempotency_conflict" } };
        }
        return {
          data: {
            status: "already_applied",
            transitionEventId: existing.transitionEventId,
            appliedStateRevision: existing.revision,
          },
          error: null,
        };
      }
      const transitionEventId = "00000000-0000-0000-0002-000000000001";
      transitionByKey.set(key, { fingerprint, transitionEventId, revision: 1 });
      return {
        data: { status: "applied", transitionEventId, appliedStateRevision: 1 },
        error: null,
      };
    },
  };

  // 5. Distinct governed roots in one assignment produce distinct receipts.
  const cycleA = passing.cycles[0];
  const cycleBSelection = select({
    sourceRef: "lesson:cycle:b",
    attempts: [
      attempt({
        id: "00000000-0000-0000-0000-000000000012",
        kind: "lesson_production",
        correct: true,
        sourceRef: "lesson:cycle:b",
      }),
      attempt({
        id: "00000000-0000-0000-0000-000000000013",
        kind: "lesson_dictation",
        correct: true,
        sourceRef: "lesson:cycle:b",
      }),
    ],
  });
  const receiptA = await persistGovernedControlledReceipt({
    client: client as never,
    childId: ID.child,
    assignmentId: ID.assignment,
    completedOn: "2026-09-01",
    cycle: cycleA,
  });
  const receiptB = await persistGovernedControlledReceipt({
    client: client as never,
    childId: ID.child,
    assignmentId: ID.assignment,
    completedOn: "2026-09-01",
    cycle: cycleBSelection.cycles[0],
  });
  assert.notEqual(receiptA.receiptId, receiptB.receiptId);
  assert.equal(receiptByIdentity.size, 2);

  // 6. Exact completion replay returns the same receipt.
  const receiptReplay = await persistGovernedControlledReceipt({
    client: client as never,
    childId: ID.child,
    assignmentId: ID.assignment,
    completedOn: "2026-09-01",
    cycle: cycleA,
  });
  assert.equal(receiptReplay.disposition, "IDEMPOTENT_REPLAY");
  assert.equal(receiptReplay.receiptId, receiptA.receiptId);

  // 7. Same receipt identity with conflicting immutable outcomes fails closed.
  const conflictingCycle: GovernedControlledCycle = {
    ...cycleA,
    decision: decideControlledGraduationV1({
      coverWrite: { eventId: ID.cover, outcome: "fail" },
      sentenceDictation: { eventId: ID.dictation, outcome: "fail" },
    }),
  };
  await assert.rejects(() => persistGovernedControlledReceipt({
    client: client as never,
    childId: ID.child,
    assignmentId: ID.assignment,
    completedOn: "2026-09-01",
    cycle: conflictingCycle,
  }), /adle_c2b2_controlled_idempotency_conflict/);

  const targetRow: PersistedReviewScheduleWordRow = {
    id: ID.schedule,
    child_id: ID.child,
    canonical_word_id: ID.word,
    bundle_id: null,
    membership_status: "controlled_reacquisition",
    taught_on: "2026-08-01",
    row_status: "active",
    word_schedule_version: TARGET_PER_WORD_STATE_SHAPE_VERSION,
    word_schedule_policy_version: TARGET_REVIEW_POLICY_VERSION,
    word_interval_index: 2,
    word_next_due_on: null,
    catch_up_stage: 0,
    next_retest_due_on: null,
    failed_review_on: null,
    pre_retirement_check_due_on: null,
    last_28_day_review_on: null,
    reteach_cycle_count: 0,
    word_schedule_transition_count: 0,
    word_last_review_completed_on: null,
    word_last_review_completed_at: null,
    consecutive_independent_failures: 3,
    failure_episode_id: ID.episode,
  };
  const hydrated = hydratePersistedReviewSchedule({ row: targetRow });
  assert.equal(hydrated.disposition, "HYDRATED");
  if (hydrated.disposition !== "HYDRATED") throw new Error("target fixture hydration failed");

  // 8 and 10. The passing receipt alone feeds C2B.1, whose result alone feeds
  // C2B.2 CAS. Controlled re-entry reaches Day 1 and retains failure lineage.
  const handoff = await persistControlledReceiptTargetHandoff({
    client: client as never,
    schedule: hydrated.schedule,
    policyConfig: TARGET_REVIEW_POLICY_CONFIG,
    receipt: receiptA,
    childId: ID.child,
    canonicalWordId: ID.word,
    completedOn: "2026-09-01",
    decidedAt: cycleA.decidedAt,
  });
  assert.equal(handoff.disposition, "PERSISTED");
  const transitionCall = rpcCalls.find((call) =>
    call.name === "persist_adle_review_schedule_transition_c2b2");
  assert.ok(transitionCall);
  assert.equal(transitionCall.args.p_transition_reason, "CONTROLLED_PASS_TO_DAY_1");
  const targetState = transitionCall.args.p_to_state as Record<string, unknown>;
  assert.equal(targetState.membershipStatus, "scheduled");
  assert.equal(targetState.wordIntervalIndex, 0);
  assert.equal(targetState.wordNextDueOn, "2026-09-02");
  assert.equal(targetState.consecutiveIndependentFailures, 3);
  assert.equal(targetState.failureEpisodeId, ID.episode);

  // 9. NOT_PASSED is a durable receipt result but cannot call scheduler CAS.
  const failedDecision = decideControlledGraduationV1({
    coverWrite: { eventId: ID.cover, outcome: "fail" },
    sentenceDictation: { eventId: ID.dictation, outcome: "fail" },
  });
  const callsBeforeFailure = rpcCalls.length;
  const noTransition = await persistControlledReceiptTargetHandoff({
    client: client as never,
    schedule: hydrated.schedule,
    policyConfig: TARGET_REVIEW_POLICY_CONFIG,
    receipt: {
      disposition: "PERSISTED",
      receiptId: "00000000-0000-0000-0003-000000000001",
      decision: failedDecision.decision,
    },
    childId: ID.child,
    canonicalWordId: ID.word,
    completedOn: "2026-09-01",
    decidedAt: cycleA.decidedAt,
  });
  assert.deepEqual(noTransition, { disposition: "NOT_PASSED_NO_TRANSITION" });
  assert.equal(rpcCalls.length, callsBeforeFailure, "NOT_PASSED must make no scheduler RPC");

  // 11-12. The only completion adjustment is exact target exclusion. C2B.6
  // admits only pinned, hydrated target rows; the v1-only path remains exact.
  const actions = readFileSync(resolve("app/learn/week/adle/actions.ts"), "utf8");
  assert.match(actions, /scheduleEligible: !pinnedTargetSchedules\.has/);
  assert.match(actions, /if \(pinnedTargetSchedules\.size === 0\) return/);
  const r6 = readFileSync(resolve("lib/adle/review-v3/r6-generation.ts"), "utf8");
  assert.match(r6, /selectDueMixedReviewWords/);
  assert.match(r6, /loadReviewScheduleForExecution/);
  assert.match(r6, /TARGET_PER_WORD_STATE_SHAPE_VERSION/);
  assert.doesNotMatch(r6, /\.eq\("is_active", true\)/);
  const migration = readFileSync(
    resolve("supabase/migrations/20260831120000_add_adle_c2b2_scheduler_persistence.sql"),
    "utf8",
  );
  assert.match(migration, /'ADLE_SPACED_REVIEW_REGRESSION_V1',\s*false,\s*false,/);

  console.log(JSON.stringify({
    status: "PASS",
    requiredControlledCases: 12,
    receiptAuthority: "persist_adle_controlled_graduation_receipt_c2b2",
    transitionAuthority: "persist_adle_review_schedule_transition_c2b2",
    targetActive: false,
    targetDefault: false,
    liveQueueTargetRows: "exactly_pinned_and_hydrated_only",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
