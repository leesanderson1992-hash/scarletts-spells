import { createClient } from "@/lib/supabase/server";

import { hasCanonicalMicroSkillKey } from "../canonical-submission-spelling";
import {
  mergeScopedSubmissionMicroSkillResolutionMetadata,
  resolveScopedMicroSkillForSubmissionSuggestion,
} from "../resolver-visible-priority";

export { hasCanonicalMicroSkillKey } from "../canonical-submission-spelling";

export type MisspellingSuggestionLookupRow = {
  id: string;
  suggestion_status: string;
  suggested_micro_skill_key: string | null;
  suggested_replacement?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown> | null;
};

export type ExistingParentVerificationLookupRow = {
  id: string;
  decision:
    | "accepted"
    | "overridden"
    | "false_positive"
    | "not_a_learning_issue";
  suggested_micro_skill_key: string | null;
  verified_micro_skill_key: string | null;
};

export function normaliseExistingParentVerificationLookupRow(
  value: unknown,
): ExistingParentVerificationLookupRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ExistingParentVerificationLookupRow>;

  if (typeof candidate.id !== "string") {
    return null;
  }

  if (
    candidate.decision !== "accepted" &&
    candidate.decision !== "overridden" &&
    candidate.decision !== "false_positive" &&
    candidate.decision !== "not_a_learning_issue"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    decision: candidate.decision,
    suggested_micro_skill_key:
      typeof candidate.suggested_micro_skill_key === "string"
        ? candidate.suggested_micro_skill_key
        : null,
    verified_micro_skill_key:
      typeof candidate.verified_micro_skill_key === "string"
        ? candidate.verified_micro_skill_key
        : null,
  };
}

export { resolveScopedMicroSkillForSubmissionSuggestion };

export async function backfillPendingSubmissionSuggestionCanonicalMicroSkill(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  taskSubmissionId: string;
  misspellingInstanceId: string;
  suggestion: MisspellingSuggestionLookupRow;
  observedText: string | null;
  suggestedReplacement: string | null;
}) {
  if (
    input.suggestion.suggestion_status !== "pending" ||
    hasCanonicalMicroSkillKey(input.suggestion.suggested_micro_skill_key)
  ) {
    return input.suggestion;
  }

  const { data: existingVerification } = await input.supabase
    .from("parent_verifications")
    .select("id")
    .eq("parent_user_id", input.parentUserId)
    .eq("task_submission_id", input.taskSubmissionId)
    .eq("source_entity_id", input.misspellingInstanceId)
    .limit(1)
    .maybeSingle();

  if (existingVerification) {
    return input.suggestion;
  }

  const resolution = await resolveScopedMicroSkillForSubmissionSuggestion({
    supabase: input.supabase,
    parentUserId: input.parentUserId,
    childId: input.childId,
    observedText: input.observedText,
    suggestedReplacement: input.suggestedReplacement,
  });

  if (!resolution.microSkillKey && !resolution.blocked) {
    return input.suggestion;
  }

  const metadata = mergeScopedSubmissionMicroSkillResolutionMetadata({
    metadata: input.suggestion.metadata,
    resolution,
  });
  const { data: updatedSuggestion } = await input.supabase
    .from("writing_issue_suggestions")
    .update({
      suggested_micro_skill_key: resolution.microSkillKey,
      metadata,
    })
    .eq("id", input.suggestion.id)
    .eq("parent_user_id", input.parentUserId)
    .eq("task_submission_id", input.taskSubmissionId)
    .eq("suggestion_status", "pending")
    .select(
      "id, suggestion_status, suggested_micro_skill_key, suggested_replacement, notes, metadata",
    )
    .maybeSingle();

  return (updatedSuggestion as MisspellingSuggestionLookupRow | null) ?? {
    ...input.suggestion,
    suggested_micro_skill_key: resolution.microSkillKey,
    metadata,
  };
}
