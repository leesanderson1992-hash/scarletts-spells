import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { intakeApprovedExactSubmissionCorrections } from "../loaders/canonical-intake-live";
import { normalizeExactCandidateMappingIds } from "./exact-id-handoff";

export const R8D_LEARNING_CLASSIFICATIONS = new Set([
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
] as const);

export type R8DReconciliationClass =
  | "not_consumed_downstream"
  | "content_blocked"
  | "intake_without_teaching"
  | "teaching_without_schedule"
  | "schedule_without_review_history"
  | "protected_review_history"
  | "shared_active_target"
  | "historical_reactivation";

export interface R8DReconciliationResult {
  ok: true;
  replayed: boolean;
  writingIssueId: string;
  sourceCandidateMappingId: string;
  replacementCandidateMappingId: string | null;
  replacementCandidateMappingIds: string[];
  newFinalClassification: string;
  reconciliationClass: R8DReconciliationClass;
  authoritativeSourceCountAfter: number;
  targetAction: string;
  scheduleAction: string;
  protectedHistoryCounts: Record<string, number>;
  nextAuthorityVersion: number;
  replacementRequiresCanonicalIntake: boolean;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`R8D reconciliation response requires ${key}`);
  }
  return value;
}

function integerField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`R8D reconciliation response requires a valid ${key}`);
  }
  return value as number;
}

const RECONCILIATION_CLASSES = new Set<R8DReconciliationClass>([
  "not_consumed_downstream",
  "content_blocked",
  "intake_without_teaching",
  "teaching_without_schedule",
  "schedule_without_review_history",
  "protected_review_history",
  "shared_active_target",
  "historical_reactivation",
]);

export function parseR8DReconciliationResult(
  value: unknown,
): R8DReconciliationResult {
  const row = object(value);
  if (!row || row.ok !== true || typeof row.replayed !== "boolean") {
    throw new Error("R8D reconciliation returned no governed result");
  }
  const reconciliationClass = stringField(row, "reconciliationClass");
  if (!RECONCILIATION_CLASSES.has(reconciliationClass as R8DReconciliationClass)) {
    throw new Error("R8D reconciliation returned an unknown class");
  }
  const replacementCandidateMappingId =
    row.replacementCandidateMappingId === null
      ? null
      : stringField(row, "replacementCandidateMappingId");
  if (!Array.isArray(row.replacementCandidateMappingIds)) {
    throw new Error("R8D reconciliation returned no exact replacement source set");
  }
  const replacementCandidateMappingIds =
    row.replacementCandidateMappingIds.length === 0
      ? []
      : normalizeExactCandidateMappingIds(
          row.replacementCandidateMappingIds.map((candidateId) => {
            if (typeof candidateId !== "string") {
              throw new Error("R8D replacement source set is malformed");
            }
            return candidateId;
          }),
        );
  const protectedHistoryCounts = object(row.protectedHistoryCounts);
  if (!protectedHistoryCounts) {
    throw new Error("R8D reconciliation returned no protected-history receipt");
  }
  const normalizedProtectedCounts: Record<string, number> = {};
  for (const [key, count] of Object.entries(protectedHistoryCounts)) {
    if (!Number.isSafeInteger(count) || (count as number) < 0) {
      throw new Error("R8D protected-history receipt is malformed");
    }
    normalizedProtectedCounts[key] = count as number;
  }
  if (typeof row.replacementRequiresCanonicalIntake !== "boolean") {
    throw new Error("R8D reconciliation returned no replacement intake decision");
  }
  if (
    row.replacementRequiresCanonicalIntake &&
    (!replacementCandidateMappingId || replacementCandidateMappingIds.length === 0)
  ) {
    throw new Error("R8D replacement authority has no exact governed source set");
  }
  if (
    !row.replacementRequiresCanonicalIntake &&
    (replacementCandidateMappingId !== null || replacementCandidateMappingIds.length > 0)
  ) {
    throw new Error("R8D non-learning result unexpectedly carries replacement authority");
  }

  return {
    ok: true,
    replayed: row.replayed,
    writingIssueId: stringField(row, "writingIssueId"),
    sourceCandidateMappingId: stringField(row, "sourceCandidateMappingId"),
    replacementCandidateMappingId,
    replacementCandidateMappingIds,
    newFinalClassification: stringField(row, "newFinalClassification"),
    reconciliationClass:
      reconciliationClass as R8DReconciliationClass,
    authoritativeSourceCountAfter: integerField(
      row,
      "authoritativeSourceCountAfter",
    ),
    targetAction: stringField(row, "targetAction"),
    scheduleAction: stringField(row, "scheduleAction"),
    protectedHistoryCounts: normalizedProtectedCounts,
    nextAuthorityVersion: integerField(row, "nextAuthorityVersion"),
    replacementRequiresCanonicalIntake:
      row.replacementRequiresCanonicalIntake,
  };
}

export async function reconcileParentSpellingDecisionR8D(params: {
  parentClient: SupabaseClient;
  serviceClient: SupabaseClient;
  writingIssueId: string;
  sourceCandidateMappingId: string;
  parentUserId: string;
  childId: string;
  expectedAuthorityVersion: number;
  newFinalClassification: string;
  newCorrectSpellingNormalized?: string | null;
  newMicroSkillKey?: string | null;
  replacementCanonicalMappingId?: string | null;
  approvalSubmissionId: string;
  reason: string;
  idempotencyKey: string;
}) {
  const { data, error } = await params.parentClient.rpc(
    "adle_reconcile_parent_spelling_decision_r8d",
    {
      p_writing_issue_id: params.writingIssueId,
      p_source_candidate_mapping_id: params.sourceCandidateMappingId,
      p_parent_user_id: params.parentUserId,
      p_child_id: params.childId,
      p_expected_authority_version: params.expectedAuthorityVersion,
      p_new_final_classification: params.newFinalClassification,
      p_new_correct_spelling_normalized:
        params.newCorrectSpellingNormalized ?? null,
      p_new_micro_skill_key: params.newMicroSkillKey ?? null,
      p_replacement_canonical_mapping_id:
        params.replacementCanonicalMappingId ?? null,
      p_approval_submission_id: params.approvalSubmissionId,
      p_reason: params.reason,
      p_idempotency_key: params.idempotencyKey,
    },
  );
  if (error) {
    throw new Error(`R8D reconciliation failed: ${error.message}`);
  }
  const reconciliation = parseR8DReconciliationResult(data);
  const canonicalIntake = reconciliation.replacementRequiresCanonicalIntake
    ? await intakeApprovedExactSubmissionCorrections({
        serviceClient: params.serviceClient,
        parentUserId: params.parentUserId,
        childId: params.childId,
        submissionId: params.approvalSubmissionId,
        candidateMappingIds:
          reconciliation.replacementCandidateMappingIds,
      })
    : null;

  return { reconciliation, canonicalIntake };
}
