import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { CutoverPreviewRecord } from "./cutover-preview";

export const C2B6_CUTOVER_REDUCER_VERSION = "POLICY_CUTOVER_NO_LEARNER_EVENT_V1" as const;
export const C2B6_CUTOVER_REASON = "POLICY_CUTOVER_APPROVED_CLEAN_SCHEDULED" as const;

export function buildApprovedCutoverCandidate(input: {
  record: CutoverPreviewRecord;
  reviewedPreviewFingerprint: string;
  approvalReference: string;
}) {
  if (input.record.eligibility !== "ELIGIBLE" || !input.record.proposed) {
    throw new Error("adle_c2b6_cutover_candidate_not_eligible");
  }
  const fromState = {
    stateShapeVersion: input.record.current.stateShapeVersion,
    schedulePolicyVersion: input.record.current.policyVersion,
    membershipStatus: input.record.current.membership,
    wordIntervalIndex: input.record.current.intervalIndex,
    wordNextDueOn: input.record.current.dueOn,
    stateRevision: input.record.current.stateRevision,
  };
  const idempotencyKey = `policy-cutover:${input.reviewedPreviewFingerprint}:${input.record.scheduleWordId}`;
  const envelope = {
    scheduleWordId: input.record.scheduleWordId,
    reviewedPreviewFingerprint: input.reviewedPreviewFingerprint,
    approvalReference: input.approvalReference,
    idempotencyKey,
    expectedStateRevision: input.record.current.stateRevision,
    fromState,
    toState: input.record.proposed.persistedState,
    transitionReason: C2B6_CUTOVER_REASON,
    reducerVersion: C2B6_CUTOVER_REDUCER_VERSION,
  };
  return {
    scheduleWordId: input.record.scheduleWordId,
    expectedRevision: input.record.current.stateRevision,
    expectedPolicyVersion: input.record.current.policyVersion,
    expectedStateShapeVersion: input.record.current.stateShapeVersion,
    expectedMembershipStatus: input.record.current.membership,
    expectedIntervalIndex: input.record.current.intervalIndex,
    expectedDueOn: input.record.current.dueOn,
    expectedLast28DayReviewOn: input.record.current.last28DayReviewOn,
    expectedLastReviewCompletedOn: input.record.current.wordLastReviewCompletedOn,
    expectedLastReviewCompletedAt: input.record.current.wordLastReviewCompletedAt,
    toState: input.record.proposed.persistedState,
    idempotencyKey,
    sourceFingerprint: fingerprintSnapshotValue(envelope),
  };
}

export async function applyApprovedScheduleCutoverC2B6(input: {
  client: Pick<SupabaseClient, "rpc">;
  approvedChildId: string;
  reviewedPreviewFingerprint: string;
  approvalReference: string;
  records: readonly CutoverPreviewRecord[];
}): Promise<{ status: "applied" | "already_applied"; appliedCount: number; replayedCount: number }> {
  const candidates = input.records.map((record) => buildApprovedCutoverCandidate({
    record,
    reviewedPreviewFingerprint: input.reviewedPreviewFingerprint,
    approvalReference: input.approvalReference,
  }));
  const result = await input.client.rpc("apply_adle_review_policy_cutover_c2b6", {
    p_approved_child_id: input.approvedChildId,
    p_reviewed_preview_fingerprint: input.reviewedPreviewFingerprint,
    p_approval_reference: input.approvalReference,
    p_candidates: candidates,
  });
  if (result.error) throw new Error(`applyApprovedScheduleCutoverC2B6:${result.error.message}`);
  const value = result.data as Record<string, unknown> | null;
  if (!value || (value.status !== "applied" && value.status !== "already_applied")
    || !Number.isInteger(value.appliedCount) || !Number.isInteger(value.replayedCount)) {
    throw new Error("applyApprovedScheduleCutoverC2B6:result_malformed");
  }
  return value as { status: "applied" | "already_applied"; appliedCount: number; replayedCount: number };
}
