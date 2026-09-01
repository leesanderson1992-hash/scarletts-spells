import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { IsoDate } from "../review-scheduler";
import {
  decideControlledGraduationV1,
  type ControlledGraduationV1Decision,
} from "./controlled-graduation-v1";
import {
  CONTROLLED_GRADUATION_POLICY_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type TargetReviewPolicyConfig,
} from "./contracts";
import type { HydratedReviewSchedule } from "./runtime-coexistence";
import { loadReviewScheduleForExecution } from "./runtime-repository";
import {
  persistTargetReviewTransition,
  type TargetTransitionPersistenceResult,
} from "./target-transition-persistence";

export type GovernedControlledAssignmentItem = {
  id: string;
  position: number;
};

export type GovernedControlledAttempt = {
  id: string;
  child_id: string;
  parent_user_id: string;
  daily_assignment_id: string;
  assignment_item_id: string;
  canonical_word_id: string | null;
  attempt_kind: string;
  evidence_class: string;
  source_ref: string;
  is_correct: boolean | null;
  created_at: string;
};

export type GovernedControlledCycle = {
  canonicalWordId: string;
  sourceRef: string;
  coverWrite: GovernedControlledAttempt;
  sentenceDictation: GovernedControlledAttempt;
  decision: ControlledGraduationV1Decision;
  decidedAt: string;
};

export type ControlledCycleSelection = {
  cycles: readonly GovernedControlledCycle[];
  blockers: readonly {
    canonicalWordId: string;
    reason: "CONTROLLED_PAIR_INCOMPLETE" | "CONTROLLED_PAIR_AMBIGUOUS";
  }[];
};

export type ControlledReceiptPersistenceResult = {
  disposition: "PERSISTED" | "IDEMPOTENT_REPLAY";
  receiptId: string;
  decision: "PASS" | "NOT_PASSED";
};

export type ControlledGraduationIntegrationWordResult = {
  canonicalWordId: string;
  receipt: ControlledReceiptPersistenceResult;
  targetTransition:
    | TargetTransitionPersistenceResult
    | { disposition: "NOT_PASSED_NO_TRANSITION" }
    | { disposition: "IDEMPOTENT_REPLAY"; transitionEventId: string; appliedStateRevision: number }
    | { disposition: "TARGET_ROUTE_NOT_ELIGIBLE" };
};

export async function persistControlledReceiptTargetHandoff(input: {
  client: Pick<SupabaseClient, "rpc">;
  schedule: HydratedReviewSchedule | null;
  policyConfig: TargetReviewPolicyConfig | null;
  receipt: ControlledReceiptPersistenceResult;
  childId: string;
  canonicalWordId: string;
  completedOn: IsoDate;
  decidedAt: string;
}): Promise<ControlledGraduationIntegrationWordResult["targetTransition"]> {
  if (input.receipt.decision === "NOT_PASSED") {
    return { disposition: "NOT_PASSED_NO_TRANSITION" };
  }
  if (
    !input.schedule
    || input.schedule.kind !== "TARGET_REGRESSION_V1"
    || input.schedule.state.route.membership !== "CONTROLLED_REACQUISITION"
    || !input.policyConfig
  ) return { disposition: "TARGET_ROUTE_NOT_ELIGIBLE" };
  return persistTargetReviewTransition({
    client: input.client,
    schedule: input.schedule,
    source: {
      kind: "CONTROLLED_PASS_APPLIED",
      receipt: {
        id: input.receipt.receiptId,
        child_id: input.childId,
        canonical_word_id: input.canonicalWordId,
        controlled_policy_version: CONTROLLED_GRADUATION_POLICY_VERSION,
        decision: "PASS",
        completed_on: input.completedOn,
        decided_at: input.decidedAt,
      },
    },
    policyConfig: input.policyConfig,
  });
}

function postgresUtcJsonTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("controlled_completion_timestamp_invalid");
  const iso = parsed.toISOString();
  return iso.endsWith(".000Z")
    ? `${iso.slice(0, -5)}+00:00`
    : `${iso.slice(0, -1)}+00:00`;
}

function exactCycleSourceRef(
  cycleRoot: string,
  attempt: GovernedControlledAttempt,
  positionByItemId: ReadonlyMap<string, number>,
): boolean {
  const position = positionByItemId.get(attempt.assignment_item_id);
  return position !== undefined
    && (attempt.source_ref === cycleRoot || attempt.source_ref === `${cycleRoot}:${position}`);
}

/**
 * Selects voters only from the exact completion envelope and governed source
 * root. No wildcard, suffix stripping, spelling/date matching, or cross-cycle
 * pairing participates. Repair is not a recognised voter kind.
 */
export function selectGovernedControlledCycles(input: {
  childId: string;
  parentUserId: string;
  assignmentId: string;
  sourceRef: string;
  targetCanonicalWordIds: readonly string[];
  assignmentItems: readonly GovernedControlledAssignmentItem[];
  attempts: readonly GovernedControlledAttempt[];
}): ControlledCycleSelection {
  const positions = new Map(input.assignmentItems.map((item) => [item.id, item.position]));
  if (positions.size !== input.assignmentItems.length || !input.sourceRef.trim()) {
    throw new Error("controlled_completion_envelope_malformed");
  }
  const targetIds = [...new Set(input.targetCanonicalWordIds)].sort();
  const cycles: GovernedControlledCycle[] = [];
  const blockers: ControlledCycleSelection["blockers"][number][] = [];
  for (const canonicalWordId of targetIds) {
    const governed = input.attempts.filter((attempt) =>
      attempt.child_id === input.childId
      && attempt.parent_user_id === input.parentUserId
      && attempt.daily_assignment_id === input.assignmentId
      && attempt.canonical_word_id === canonicalWordId
      && attempt.evidence_class === "first_exposure_lesson_attempt"
      && positions.has(attempt.assignment_item_id)
      && exactCycleSourceRef(input.sourceRef, attempt, positions),
    );
    const cover = governed.filter((attempt) => attempt.attempt_kind === "lesson_production");
    const dictation = governed.filter((attempt) => attempt.attempt_kind === "lesson_dictation");
    if (cover.length !== 1 || dictation.length !== 1) {
      blockers.push({
        canonicalWordId,
        reason: cover.length > 1 || dictation.length > 1
          ? "CONTROLLED_PAIR_AMBIGUOUS"
          : "CONTROLLED_PAIR_INCOMPLETE",
      });
      continue;
    }
    if (cover[0].is_correct === null || dictation[0].is_correct === null) {
      blockers.push({ canonicalWordId, reason: "CONTROLLED_PAIR_INCOMPLETE" });
      continue;
    }
    const decision = decideControlledGraduationV1({
      coverWrite: { eventId: cover[0].id, outcome: cover[0].is_correct ? "pass" : "fail" },
      sentenceDictation: {
        eventId: dictation[0].id,
        outcome: dictation[0].is_correct ? "pass" : "fail",
      },
    });
    const coverAt = new Date(cover[0].created_at).getTime();
    const dictationAt = new Date(dictation[0].created_at).getTime();
    if (Number.isNaN(coverAt) || Number.isNaN(dictationAt)) {
      throw new Error("controlled_completion_timestamp_invalid");
    }
    const decidedAt = new Date(Math.max(coverAt, dictationAt)).toISOString();
    cycles.push({
      canonicalWordId,
      sourceRef: input.sourceRef,
      coverWrite: cover[0],
      sentenceDictation: dictation[0],
      decision,
      decidedAt,
    });
  }
  return { cycles, blockers };
}

export async function persistGovernedControlledReceipt(input: {
  client: Pick<SupabaseClient, "rpc">;
  childId: string;
  assignmentId: string;
  completedOn: IsoDate;
  cycle: GovernedControlledCycle;
}): Promise<ControlledReceiptPersistenceResult> {
  const decision = input.cycle.decision;
  const envelope = {
    childId: input.childId,
    dailyAssignmentId: input.assignmentId,
    canonicalWordId: input.cycle.canonicalWordId,
    sourceRef: input.cycle.sourceRef,
    controlledPolicyVersion: CONTROLLED_GRADUATION_POLICY_VERSION,
    controlledCycleKind: decision.decisionKind,
    coverWriteAttemptEventId: decision.coverWrite.eventId,
    coverWriteOutcome: decision.coverWrite.outcome === "pass" ? "PASS" : "FAIL",
    sentenceDictationAttemptEventId: decision.sentenceDictation.eventId,
    sentenceDictationOutcome: decision.sentenceDictation.outcome === "pass" ? "PASS" : "FAIL",
    laterCleanAttemptEventId: null,
    laterCleanOutcome: null,
    decision: decision.decision,
    decisionReason: decision.reason,
    completedOn: input.completedOn,
    decidedAt: postgresUtcJsonTimestamp(input.cycle.decidedAt),
  };
  const response = await input.client.rpc("persist_adle_controlled_graduation_receipt_c2b2", {
    p_child_id: input.childId,
    p_daily_assignment_id: input.assignmentId,
    p_canonical_word_id: input.cycle.canonicalWordId,
    p_source_ref: input.cycle.sourceRef,
    p_controlled_cycle_kind: decision.decisionKind,
    p_cover_write_attempt_event_id: decision.coverWrite.eventId,
    p_sentence_dictation_attempt_event_id: decision.sentenceDictation.eventId,
    p_later_clean_attempt_event_id: null,
    p_decision: decision.decision,
    p_decision_reason: decision.reason,
    p_completed_on: input.completedOn,
    p_decided_at: input.cycle.decidedAt,
    p_source_fingerprint: fingerprintSnapshotValue(envelope),
  });
  if (response.error) throw new Error(`persistGovernedControlledReceipt:${response.error.message}`);
  const result = response.data as {
    status?: unknown;
    receiptId?: unknown;
    decision?: unknown;
  } | null;
  if (
    !result
    || (result.status !== "persisted" && result.status !== "already_persisted")
    || typeof result.receiptId !== "string"
    || result.decision !== decision.decision
  ) throw new Error("persistGovernedControlledReceipt:invalid_rpc_response");
  return {
    disposition: result.status === "persisted" ? "PERSISTED" : "IDEMPOTENT_REPLAY",
    receiptId: result.receiptId,
    decision: result.decision as "PASS" | "NOT_PASSED",
  };
}

export async function loadPinnedTargetScheduleWordIds(input: {
  client: SupabaseClient;
  childId: string;
  canonicalWordIds: readonly string[];
}): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(input.canonicalWordIds)];
  if (ids.length === 0) return new Map();
  const result = await input.client.from("adle_review_schedule_words")
    .select("id,canonical_word_id")
    .eq("child_id", input.childId)
    .in("canonical_word_id", ids)
    .eq("row_status", "active")
    .eq("word_schedule_policy_version", TARGET_REVIEW_POLICY_VERSION)
    .eq("word_schedule_version", TARGET_PER_WORD_STATE_SHAPE_VERSION);
  if (result.error) throw new Error(`loadPinnedTargetScheduleWordIds:${result.error.message}`);
  return new Map((result.data ?? []).map((row) => [
    row.canonical_word_id as string,
    row.id as string,
  ]));
}

/**
 * Target-only post-completion integration. With no explicitly pinned v2 word
 * it performs no receipt or scheduler write, preserving released v1 runtime.
 */
export async function integrateTargetControlledGraduationForCompletedLesson(input: {
  client: SupabaseClient;
  parentUserId: string;
  childId: string;
  assignmentId: string;
  completedOn: IsoDate;
  sourceRef: string;
  assignmentItemIds: readonly string[];
  canonicalWordIds: readonly string[];
}): Promise<readonly ControlledGraduationIntegrationWordResult[]> {
  const targetScheduleIds = await loadPinnedTargetScheduleWordIds({
    client: input.client,
    childId: input.childId,
    canonicalWordIds: input.canonicalWordIds,
  });
  if (targetScheduleIds.size === 0) return [];

  const [itemsResult, attemptsResult] = await Promise.all([
    input.client.from("assignment_items")
      .select("id,position")
      .eq("daily_assignment_id", input.assignmentId)
      .in("id", [...new Set(input.assignmentItemIds)]),
    input.client.from("adle_assignment_attempt_events")
      .select("id,child_id,parent_user_id,daily_assignment_id,assignment_item_id,canonical_word_id,attempt_kind,evidence_class,source_ref,is_correct,created_at")
      .eq("daily_assignment_id", input.assignmentId)
      .in("assignment_item_id", [...new Set(input.assignmentItemIds)]),
  ]);
  if (itemsResult.error) throw new Error(`controlledCompletion:items:${itemsResult.error.message}`);
  if (attemptsResult.error) throw new Error(`controlledCompletion:attempts:${attemptsResult.error.message}`);
  const selection = selectGovernedControlledCycles({
    childId: input.childId,
    parentUserId: input.parentUserId,
    assignmentId: input.assignmentId,
    sourceRef: input.sourceRef,
    targetCanonicalWordIds: [...targetScheduleIds.keys()],
    assignmentItems: (itemsResult.data ?? []) as GovernedControlledAssignmentItem[],
    attempts: (attemptsResult.data ?? []) as GovernedControlledAttempt[],
  });
  if (selection.blockers.length > 0) {
    throw new Error(`controlled_completion_target_cycle_blocked:${selection.blockers
      .map((blocker) => `${blocker.canonicalWordId}:${blocker.reason}`).join(",")}`);
  }

  const results: ControlledGraduationIntegrationWordResult[] = [];
  for (const cycle of [...selection.cycles].sort((a, b) =>
    a.canonicalWordId.localeCompare(b.canonicalWordId))) {
    const receipt = await persistGovernedControlledReceipt({
      client: input.client,
      childId: input.childId,
      assignmentId: input.assignmentId,
      completedOn: input.completedOn,
      cycle,
    });
    if (receipt.decision === "NOT_PASSED") {
      results.push({
        canonicalWordId: cycle.canonicalWordId,
        receipt,
        targetTransition: await persistControlledReceiptTargetHandoff({
          client: input.client,
          schedule: null,
          policyConfig: null,
          receipt,
          childId: input.childId,
          canonicalWordId: cycle.canonicalWordId,
          completedOn: input.completedOn,
          decidedAt: cycle.decidedAt,
        }),
      });
      continue;
    }
    const existing = await input.client.from("adle_review_schedule_transition_events")
      .select("id,applied_state_revision")
      .eq("source_controlled_graduation_receipt_id", receipt.receiptId)
      .maybeSingle();
    if (existing.error) throw new Error(`controlledCompletion:transitionReplay:${existing.error.message}`);
    if (existing.data) {
      results.push({
        canonicalWordId: cycle.canonicalWordId,
        receipt,
        targetTransition: {
          disposition: "IDEMPOTENT_REPLAY",
          transitionEventId: existing.data.id as string,
          appliedStateRevision: existing.data.applied_state_revision as number,
        },
      });
      continue;
    }
    const scheduleWordId = targetScheduleIds.get(cycle.canonicalWordId) as string;
    const loaded = await loadReviewScheduleForExecution({
      client: input.client,
      scheduleWordId,
    });
    if (
      loaded.disposition !== "HYDRATED"
      || loaded.schedule.kind !== "TARGET_REGRESSION_V1"
      || !loaded.targetPolicyConfig
    ) throw new Error("controlled_completion_target_schedule_hydration_failed");
    const targetTransition = await persistControlledReceiptTargetHandoff({
      client: input.client,
      schedule: loaded.schedule,
      policyConfig: loaded.targetPolicyConfig,
      receipt,
      childId: input.childId,
      canonicalWordId: cycle.canonicalWordId,
      completedOn: input.completedOn,
      decidedAt: cycle.decidedAt,
    });
    results.push({ canonicalWordId: cycle.canonicalWordId, receipt, targetTransition });
  }
  return results;
}
