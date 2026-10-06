import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  findResolverVisibleExactPairMapping,
  type ResolverVisibleCanonicalExactPairResolution,
} from "@/lib/writing-engine/persistence/spelling-canonical-mappings";
import { createSupabaseSpellingCandidateMappingRepository } from "@/lib/writing-engine/persistence/spelling-candidate-mappings";
import {
  mergeCanonicalSubmissionSpellingSlice1Metadata,
  type CanonicalSubmissionSpellingMappingSlice1Resolution,
} from "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1";

import { normaliseWordForLookup } from "./review-utils";
import { resolveCanonicalMicroSkillForSubmissionSuggestion } from "./canonical-submission-spelling";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ResolverVisibleRuntimeResolutionSource =
  | "resolver_visible_canonical_exact_pair"
  | "catalog_canonical"
  | "parent_local_promoted"
  | "unresolved";

export type ScopedSubmissionSuggestionMicroSkillResolution = {
  canonicalResolution: CanonicalSubmissionSpellingMappingSlice1Resolution;
  microSkillKey: string | null;
  source: ResolverVisibleRuntimeResolutionSource;
  resolverVisibleResolution: ResolverVisibleCanonicalExactPairResolution | null;
  blocked: boolean;
};

function isResolverVisibleRuntimeEnabled() {
  return (
    process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS === "enabled"
  );
}

function normalizePair(input: {
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

  return {
    misspellingNormalized,
    correctSpellingNormalized,
  };
}

function shouldFallThroughResolverVisible(
  resolution: ResolverVisibleCanonicalExactPairResolution,
) {
  return (
    resolution.status === "unresolved" &&
    (resolution.reason === "missing_pair" ||
      resolution.reason === "no_visible_mapping")
  );
}

async function resolveParentLocalPromotedMicroSkillForSubmissionSuggestion(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  observedText: string | null;
  suggestedReplacement: string | null;
}) {
  const { misspellingNormalized, correctSpellingNormalized } = normalizePair(input);

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
  supabase: SupabaseServerClient;
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

  if (isResolverVisibleRuntimeEnabled()) {
    const { misspellingNormalized, correctSpellingNormalized } = normalizePair(input);
    const resolverVisibleResolution = await findResolverVisibleExactPairMapping({
      misspellingNormalized,
      correctSpellingNormalized,
    });

    if (resolverVisibleResolution.status === "resolved") {
      return {
        canonicalResolution,
        microSkillKey: resolverVisibleResolution.microSkillKey,
        source: "resolver_visible_canonical_exact_pair",
        resolverVisibleResolution,
        blocked: false,
      };
    }

    if (!shouldFallThroughResolverVisible(resolverVisibleResolution)) {
      return {
        canonicalResolution,
        microSkillKey: null,
        source: "unresolved",
        resolverVisibleResolution,
        blocked: true,
      };
    }
  }

  if (canonicalMicroSkillKey) {
    return {
      canonicalResolution,
      microSkillKey: canonicalMicroSkillKey,
      source: "catalog_canonical",
      resolverVisibleResolution: null,
      blocked: false,
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
      resolverVisibleResolution: null,
      blocked: false,
    };
  }

  return {
    canonicalResolution,
    microSkillKey: null,
    source: "unresolved",
    resolverVisibleResolution: null,
    blocked: false,
  };
}

export function mergeScopedSubmissionMicroSkillResolutionMetadata(input: {
  metadata: Record<string, unknown> | null | undefined;
  resolution: ScopedSubmissionSuggestionMicroSkillResolution;
}) {
  const nextMetadata = mergeCanonicalSubmissionSpellingSlice1Metadata({
    metadata: input.metadata,
    resolution: input.resolution.canonicalResolution,
  });

  nextMetadata.resolver_runtime_micro_skill_resolution = {
    source: input.resolution.source,
    status: input.resolution.microSkillKey ? "resolved" : "unresolved",
    blocked: input.resolution.blocked,
    micro_skill_key: input.resolution.microSkillKey,
    resolver_visible_resolution: input.resolution.resolverVisibleResolution,
  };

  return nextMetadata;
}
