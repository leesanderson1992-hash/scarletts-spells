import { createClient } from "@/lib/supabase/server";
import { createSupabaseSpellingCandidateMappingRepository } from "@/lib/writing-engine/persistence/spelling-candidate-mappings";
import { mergeCanonicalSubmissionSpellingSlice1Metadata } from "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1";

import {
  hasCanonicalMicroSkillKey,
  resolveCanonicalMicroSkillForSubmissionSuggestion,
} from "./canonical-submission-spelling";
import { normaliseWordForLookup } from "./review-utils";

export type MisspellingSuggestionLookupRow = {
  id: string;
  suggestion_status: string;
  suggested_micro_skill_key: string | null;
  suggested_replacement?: string | null;
  notes?: string | null;
  metadata: Record<string, unknown> | null;
};

type ScopedSubmissionSuggestionMicroSkillResolution = {
  canonicalResolution: Awaited<
    ReturnType<typeof resolveCanonicalMicroSkillForSubmissionSuggestion>
  >["canonicalResolution"];
  microSkillKey: string | null;
  source: "catalog_canonical" | "parent_local_promoted" | "unresolved";
};

async function resolveParentLocalPromotedMicroSkillForSubmissionSuggestion(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  observedText: string | null;
  suggestedReplacement: string | null;
}) {
  const misspellingNormalized =
    typeof input.observedText === "string"
      ? normaliseWordForLookup(input.observedText)
      : null;
  const correctSpellingNormalized =
    typeof input.suggestedReplacement === "string"
      ? normaliseWordForLookup(input.suggestedReplacement)
      : null;

  if (!misspellingNormalized || !correctSpellingNormalized) {
    return null;
  }

  const candidateMappingRepository =
    createSupabaseSpellingCandidateMappingRepository(input.supabase);
  const promotedMappings = await candidateMappingRepository.findScopedPromotedByMisspelling({
    parentUserId: input.parentUserId,
    childId: input.childId,
    misspellingNormalized,
  });
  const exactMatches = promotedMappings.filter(
    (mapping) => mapping.correct_spelling_normalized === correctSpellingNormalized,
  );

  if (exactMatches.length === 0) {
    return null;
  }

  const distinctMatches = Array.from(
    new Set(exactMatches.map((mapping) => mapping.micro_skill_key)),
  );

  if (distinctMatches.length !== 1) {
    return null;
  }

  return distinctMatches[0] ?? null;
}

export async function resolveScopedMicroSkillForSubmissionSuggestion(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  observedText: string | null;
  suggestedReplacement: string | null;
}): Promise<ScopedSubmissionSuggestionMicroSkillResolution> {
  const { canonicalResolution, microSkillKey: canonicalMicroSkillKey } =
    await resolveCanonicalMicroSkillForSubmissionSuggestion({
      supabase: input.supabase,
      suggestedReplacement: input.suggestedReplacement,
    });

  if (canonicalMicroSkillKey) {
    return {
      canonicalResolution,
      microSkillKey: canonicalMicroSkillKey,
      source: "catalog_canonical",
    };
  }

  const parentLocalPromotedMicroSkillKey =
    await resolveParentLocalPromotedMicroSkillForSubmissionSuggestion({
      supabase: input.supabase,
      parentUserId: input.parentUserId,
      childId: input.childId,
      observedText: input.observedText,
      suggestedReplacement: input.suggestedReplacement,
    });

  if (parentLocalPromotedMicroSkillKey) {
    return {
      canonicalResolution,
      microSkillKey: parentLocalPromotedMicroSkillKey,
      source: "parent_local_promoted",
    };
  }

  return {
    canonicalResolution,
    microSkillKey: null,
    source: "unresolved",
  };
}

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

  const { canonicalResolution, microSkillKey } =
    await resolveScopedMicroSkillForSubmissionSuggestion({
      supabase: input.supabase,
      parentUserId: input.parentUserId,
      childId: input.childId,
      observedText: input.observedText,
      suggestedReplacement: input.suggestedReplacement,
    });

  if (!microSkillKey) {
    return input.suggestion;
  }

  const metadata = mergeCanonicalSubmissionSpellingSlice1Metadata({
    metadata: input.suggestion.metadata,
    resolution: canonicalResolution,
  });
  const { data: updatedSuggestion } = await input.supabase
    .from("writing_issue_suggestions")
    .update({
      suggested_micro_skill_key: microSkillKey,
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
    suggested_micro_skill_key: microSkillKey,
    metadata,
  };
}
