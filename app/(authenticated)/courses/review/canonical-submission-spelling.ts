import { createClient } from "@/lib/supabase/server";
import { getCanonicalSubmissionSpellingCatalogEntries } from "@/lib/writing-engine/persistence/review-work-canonical-submission-spelling";
import {
  getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey,
  resolveCanonicalSubmissionSpellingMappingSlice1,
} from "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1";

type SubmissionMisspellingLike = {
  id: string;
  corrected_word: string;
  suggested_word: string | null;
};

type SubmissionSuggestionLike = {
  misspelling_instance_id: string | null;
  suggested_micro_skill_key: string | null;
};

export function hasCanonicalMicroSkillKey(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toLowerCase() !== "unknown"
  );
}

export async function resolveCanonicalMicroSkillForSubmissionSuggestion(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  suggestedReplacement: string | null;
}) {
  const catalogEntries = await getCanonicalSubmissionSpellingCatalogEntries({
    supabase: input.supabase,
  });
  const canonicalResolution = resolveCanonicalSubmissionSpellingMappingSlice1({
    suggestedReplacement: input.suggestedReplacement,
    catalogEntries,
  });

  return {
    canonicalResolution,
    microSkillKey:
      getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey(canonicalResolution),
  };
}

export async function buildCanonicalSuggestedMicroSkillKeysByMisspellingId(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  misspellings: SubmissionMisspellingLike[];
  writingIssueSuggestions: SubmissionSuggestionLike[];
  sourceType: "lesson_submission" | "manual_writing_sample";
}) {
  if (input.sourceType !== "lesson_submission" || input.misspellings.length === 0) {
    return {} as Record<string, string>;
  }

  const unresolvedMisspellings = input.misspellings.filter((misspelling) => {
    const matchedSuggestion = input.writingIssueSuggestions.find(
      (suggestion) => suggestion.misspelling_instance_id === misspelling.id,
    );

    if (!matchedSuggestion) {
      return true;
    }

    return !hasCanonicalMicroSkillKey(matchedSuggestion.suggested_micro_skill_key);
  });

  if (unresolvedMisspellings.length === 0) {
    return {} as Record<string, string>;
  }

  const catalogEntries = await getCanonicalSubmissionSpellingCatalogEntries({
    supabase: input.supabase,
  });
  const suggestedMicroSkillKeysByMisspellingId: Record<string, string> = {};

  unresolvedMisspellings.forEach((misspelling) => {
    const resolution = resolveCanonicalSubmissionSpellingMappingSlice1({
      suggestedReplacement: misspelling.suggested_word ?? misspelling.corrected_word,
      catalogEntries,
    });
    const microSkillKey =
      getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey(resolution);

    if (microSkillKey) {
      suggestedMicroSkillKeysByMisspellingId[misspelling.id] = microSkillKey;
    }
  });

  return suggestedMicroSkillKeysByMisspellingId;
}
