import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { buildStage2aMicroSkillRecommendationReadModel } from "../lib/writing-engine/persistence/stage2a-micro-skill-recommendation";
import {
  recommendStage2aMicroSkillForSpellingPair,
  type WritingEngineStage2aRecommendationInput,
} from "../lib/writing-engine/spelling/stage2a-micro-skill-recommendation";
import type { WritingEngineStage1d1CatalogEntry } from "../lib/writing-engine/types";
import { loadTsModule } from "./review-work-vm-loader";

function catalogEntry(
  microSkillKey: string,
  displayName: string,
  metadata: Record<string, unknown> = {},
  options: Partial<WritingEngineStage1d1CatalogEntry> = {},
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey,
    masteryDomainKey: options.masteryDomainKey ?? "D4",
    skillFamilyKey: options.skillFamilyKey ?? "spelling-patterns",
    skillClusterKey: options.skillClusterKey ?? "spelling-patterns.core",
    practiceRoute: options.practiceRoute ?? "word_practice",
    isAssignable: options.isAssignable ?? true,
    isActive: options.isActive ?? true,
    displayName,
    allowedTemplateKeys: options.allowedTemplateKeys ?? [],
    metadata: {
      recommendation_features: metadata.recommendation_features ?? [],
      ...metadata,
    },
  };
}

const finalE = catalogEntry("d4.final_e_missing", "Missing final e", {
  recommendation_features: ["missing_final_e", "final e", "magic e"],
});
const consonantDoubling = catalogEntry(
  "d4.final_consonant_doubling",
  "Final consonant doubling",
  {
    recommendation_features: ["final_consonant_doubling", "double consonant"],
  },
);
const businessPattern = catalogEntry("d4.business_irregular", "Business spelling pattern", {
  recommendation_features: ["schwa", "unstressed vowel"],
});
const naturalPattern = catalogEntry("d4.natural_schwa", "Natural schwa spelling", {
  recommendation_features: ["schwa", "unstressed vowel"],
});
const vowelChoice = catalogEntry("d4.vowel_choice", "Vowel substitution", {
  recommendation_features: ["vowel_substitution", "vowel choice"],
});
const baseCatalog = [finalE, consonantDoubling, businessPattern, naturalPattern, vowelChoice];

function recommend(input: Partial<WritingEngineStage2aRecommendationInput>) {
  return recommendStage2aMicroSkillForSpellingPair({
    misspelling: input.misspelling ?? "hav",
    correction: input.correction ?? "have",
    catalogEntries: input.catalogEntries ?? baseCatalog,
    canonicalMappings: input.canonicalMappings,
    parentLocalPromotedMappings: input.parentLocalPromotedMappings,
    historicalReviewedEvidence: input.historicalReviewedEvidence,
    auditFrequencySignals: input.auditFrequencySignals,
    wordMapMetadataSignals: input.wordMapMetadataSignals,
    contextText: input.contextText,
    parentUserId: input.parentUserId,
    childId: input.childId,
    taskSubmissionId: input.taskSubmissionId,
    writingSampleId: input.writingSampleId,
  });
}

type FakeFilter = {
  column: string;
  value: unknown;
  operator: "eq" | "in";
};

function filterRows(rows: Array<Record<string, unknown>>, filters: FakeFilter[]) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const rowValue = row[filter.column];

      if (filter.operator === "in" && Array.isArray(filter.value)) {
        return filter.value.includes(rowValue);
      }

      return rowValue === filter.value;
    }),
  );
}

function createStage2aFakeSupabase(input?: {
  errorsByTable?: Record<string, { message: string; code?: string }>;
}) {
  const rowsByTable: Record<string, Array<Record<string, unknown>>> = {
    micro_skill_catalog: [
      {
        micro_skill_key: finalE.microSkillKey,
        mastery_domain_key: "D4",
        skill_family_key: finalE.skillFamilyKey,
        skill_cluster_key: finalE.skillClusterKey,
        practice_route: finalE.practiceRoute,
        is_assignable: true,
        is_active: true,
        display_name: finalE.displayName,
        allowed_template_keys: [],
        metadata: finalE.metadata,
      },
    ],
    spelling_canonical_mappings: [
      {
        id: "canonical-hav-have",
        misspelling_normalized: "hav",
        correct_spelling_normalized: "have",
        micro_skill_key: finalE.microSkillKey,
        mapping_status: "active",
      },
    ],
    parent_verified_spelling_candidate_mappings: [],
    writing_issues: [],
    misspelling_instances: [],
    canonical_spelling_word_map_diagnostic_examples: [],
    canonical_spelling_word_map_words: [],
  };
  const readTables: string[] = [];

  return {
    readTables,
    from(table: string) {
      readTables.push(table);
      const filters: FakeFilter[] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value, operator: "eq" });
          return query;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, value, operator: "in" });
          return query;
        },
        order() {
          return query;
        },
        then<TResult1 = { data: unknown; error: { message: string; code?: string } | null }, TResult2 = never>(
          onfulfilled?:
            | ((
                value: {
                  data: unknown;
                  error: { message: string; code?: string } | null;
                },
              ) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const error = input?.errorsByTable?.[table] ?? null;
          const data = error ? null : filterRows(rowsByTable[table] ?? [], filters);

          return Promise.resolve({ data, error }).then(onfulfilled, onrejected);
        },
      };

      return query;
    },
  };
}

function createRecommendationCanonicalFakeSupabase() {
  const rowsByTable: Record<string, Array<Record<string, unknown>>> = {
    spelling_canonical_mappings: [
      {
        id: "canonical-business-hidden",
        misspelling_normalized: "buisness",
        correct_spelling_normalized: "business",
        micro_skill_key: businessPattern.microSkillKey,
        mapping_status: "active",
        dialect_code: "en-GB",
        normalization_version: "spelling_normalize_v1",
        resolver_visibility_status: "hidden",
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "canonical-natural-visible",
        misspelling_normalized: "natrual",
        correct_spelling_normalized: "natural",
        micro_skill_key: naturalPattern.microSkillKey,
        mapping_status: "active",
        dialect_code: "en-GB",
        normalization_version: "spelling_normalize_v1",
        resolver_visibility_status: "visible",
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "canonical-inactive",
        misspelling_normalized: "hav",
        correct_spelling_normalized: "have",
        micro_skill_key: finalE.microSkillKey,
        mapping_status: "inactive",
        dialect_code: "en-GB",
        normalization_version: "spelling_normalize_v1",
        resolver_visibility_status: "hidden",
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "canonical-non-assignable",
        misspelling_normalized: "gras",
        correct_spelling_normalized: "grass",
        micro_skill_key: "d4.non_assignable",
        mapping_status: "active",
        dialect_code: "en-GB",
        normalization_version: "spelling_normalize_v1",
        resolver_visibility_status: "hidden",
        created_at: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "canonical-non-d4",
        misspelling_normalized: "taik",
        correct_spelling_normalized: "take",
        micro_skill_key: "d3.non_spelling",
        mapping_status: "active",
        dialect_code: "en-GB",
        normalization_version: "spelling_normalize_v1",
        resolver_visibility_status: "hidden",
        created_at: "2026-06-01T00:00:00.000Z",
      },
    ],
    micro_skill_catalog: [
      {
        micro_skill_key: businessPattern.microSkillKey,
        mastery_domain_key: "D4",
        is_active: true,
        is_assignable: true,
      },
      {
        micro_skill_key: naturalPattern.microSkillKey,
        mastery_domain_key: "D4",
        is_active: true,
        is_assignable: true,
      },
      {
        micro_skill_key: finalE.microSkillKey,
        mastery_domain_key: "D4",
        is_active: true,
        is_assignable: true,
      },
      {
        micro_skill_key: "d4.non_assignable",
        mastery_domain_key: "D4",
        is_active: true,
        is_assignable: false,
      },
      {
        micro_skill_key: "d3.non_spelling",
        mastery_domain_key: "D3",
        is_active: true,
        is_assignable: true,
      },
    ],
  };

  return {
    from(table: string) {
      const filters: FakeFilter[] = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value, operator: "eq" });
          return query;
        },
        in(column: string, value: unknown[]) {
          filters.push({ column, value, operator: "in" });
          return query;
        },
        order() {
          return query;
        },
        then<TResult1 = { data: unknown; error: { message: string; code?: string } | null }, TResult2 = never>(
          onfulfilled?:
            | ((
                value: {
                  data: unknown;
                  error: { message: string; code?: string } | null;
                },
              ) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve({
            data: filterRows(rowsByTable[table] ?? [], filters),
            error: null,
          }).then(onfulfilled, onrejected);
        },
      };

      return query;
    },
  };
}

function loadCanonicalMappingHelper() {
  return loadTsModule<{
    findRecommendationCanonicalExactPairMappings: (input: {
      supabase: unknown;
      misspellingNormalized: string | null | undefined;
      correctSpellingNormalized: string | null | undefined;
    }) => Promise<Array<{
      mappingId: string;
      misspellingNormalized: string;
      correctSpellingNormalized: string;
      microSkillKey: string;
      resolverVisibilityStatus: string;
    }>>;
  }>(
    path.join(
      process.cwd(),
      "lib/writing-engine/persistence/spelling-canonical-mappings.ts",
    ),
    {
      stubModules: {
        "server-only": {},
        "../../supabase/service-role": {
          createServiceRoleClient() {
            throw new Error("service-role client should not be created in this regression.");
          },
        },
      },
    },
  );
}

{
  const result = recommend({
    misspelling: "buisness",
    correction: "business",
    canonicalMappings: [{
      mappingId: "canonical-business",
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
      microSkillKey: businessPattern.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendationAuthority, "known_match");
  assert.equal(result.recommendedMicroSkillKey, businessPattern.microSkillKey);
  assert.equal(result.recommendedFamilyKey, businessPattern.skillFamilyKey);
  assert.equal(result.recommendedClusterKey, businessPattern.skillClusterKey);
  assert.equal(result.isPrefillAllowed, true);
  assert.equal(result.sourceSignals[0]?.type, "exact_active_canonical_mapping");
}

{
  const result = recommend({
    misspelling: "natrual",
    correction: "natural",
    canonicalMappings: [{
      mappingId: "canonical-natural",
      misspellingNormalized: "natrual",
      correctSpellingNormalized: "natural",
      microSkillKey: naturalPattern.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendationAuthority, "known_match");
  assert.equal(result.recommendedMicroSkillKey, naturalPattern.microSkillKey);
  assert.equal(result.confidence, "high");
}

{
  const result = recommend({
    parentUserId: "parent-1",
    childId: "child-1",
    parentLocalPromotedMappings: [{
      mappingId: "parent-local-like",
      parentUserId: "parent-1",
      childId: "child-1",
      misspellingNormalized: "lik",
      correctSpellingNormalized: "like",
      microSkillKey: finalE.microSkillKey,
      candidateStatus: "parent_local_promoted",
      promotionScope: "parent_local",
    }],
    misspelling: "lik",
    correction: "like",
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendationAuthority, "your_match");
  assert.equal(result.recommendedMicroSkillKey, finalE.microSkillKey);
  assert.equal(result.sourceSignals[0]?.type, "same_scope_parent_local_promoted_mapping");
}

{
  const result = recommend({
    misspelling: "hav",
    correction: "have",
    catalogEntries: [finalE],
  });

  assert.equal(result.recommendationStatus, "low_confidence");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.rankedMicroSkillCandidates[0]?.microSkillKey, finalE.microSkillKey);
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "gras",
    correction: "grass",
    catalogEntries: [consonantDoubling],
  });

  assert.equal(result.recommendationStatus, "low_confidence");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.rankedMicroSkillCandidates[0]?.microSkillKey, consonantDoubling.microSkillKey);
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "dierbeties",
    correction: "diabetes",
    catalogEntries: [
      catalogEntry("d4.unrelated", "Unrelated active skill", {
        recommendation_features: ["prefix_issue"],
      }),
    ],
  });

  assert.equal(result.recommendationStatus, "word_level_only_candidate");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.fallbackReason, "word_level_only");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const alternateFinalE = catalogEntry("d4.final_e_alternate", "Magic e alternate", {
    recommendation_features: ["missing_final_e", "final e"],
  });
  const result = recommend({
    misspelling: "lik",
    correction: "like",
    catalogEntries: [finalE, alternateFinalE],
    historicalReviewedEvidence: [
      {
        sourceId: "reviewed-final-e-conflict-1",
        microSkillKey: finalE.microSkillKey,
        misspellingNormalized: "lik",
        correctSpellingNormalized: "like",
        finalClassification: "concept_gap",
        reviewStatus: "finalised",
      },
      {
        sourceId: "reviewed-final-e-conflict-2",
        microSkillKey: alternateFinalE.microSkillKey,
        misspellingNormalized: "lik",
        correctSpellingNormalized: "like",
        finalClassification: "concept_gap",
        reviewStatus: "finalised",
      },
    ],
  });

  assert.equal(result.recommendationStatus, "conflict");
  assert.equal(result.recommendationAuthority, "check_manually");
  assert.equal(result.fallbackReason, "conflicting_candidates");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "zxp",
    correction: "zop",
    catalogEntries: [finalE],
  });

  assert.equal(result.recommendationStatus, "insufficient_evidence");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const inactiveSkill = catalogEntry(
    "d4.inactive.canonical",
    "Inactive canonical target",
    {},
    { isActive: false },
  );
  const result = recommend({
    misspelling: "xzy",
    correction: "xyz",
    catalogEntries: [inactiveSkill, finalE],
    canonicalMappings: [{
      mappingId: "inactive-canonical",
      misspellingNormalized: "xzy",
      correctSpellingNormalized: "xyz",
      microSkillKey: inactiveSkill.microSkillKey,
      mappingStatus: "active",
    }],
  });

  assert.notEqual(result.recommendedMicroSkillKey, inactiveSkill.microSkillKey);
  assert.equal(
    result.rankedMicroSkillCandidates.some(
      (candidate) => candidate.microSkillKey === inactiveSkill.microSkillKey,
    ),
    false,
  );
}

{
  const frequencyOnlySkill = catalogEntry("d4.frequency_only", "Frequency-only signal", {
    recommendation_features: ["prefix_issue"],
  });
  const result = recommend({
    misspelling: "wurd",
    correction: "word",
    catalogEntries: [frequencyOnlySkill],
    auditFrequencySignals: [{
      sourceId: "slice-1-frequency",
      misspellingNormalized: "wurd",
      correctSpellingNormalized: "word",
      microSkillKey: frequencyOnlySkill.microSkillKey,
      evidenceCount: 100,
    }],
  });

  assert.equal(result.recommendationStatus, "insufficient_evidence");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.isPrefillAllowed, false);
  assert.equal(result.rankedMicroSkillCandidates[0]?.confidence, "none");
}

{
  const result = recommend({
    misspelling: "world",
    correction: "would",
    historicalReviewedEvidence: [{
      sourceId: "reviewed-not-issue",
      misspellingNormalized: "world",
      correctSpellingNormalized: "would",
      microSkillKey: vowelChoice.microSkillKey,
      finalClassification: "not_an_issue",
      reviewStatus: "finalised",
    }],
  });

  assert.equal(result.recommendationStatus, "likely_false_positive");
  assert.equal(result.recommendationAuthority, "no_match_yet");
  assert.equal(result.fallbackReason, "likely_false_positive");
  assert.equal(result.isPrefillAllowed, false);
}

{
  const result = recommend({
    misspelling: "hav",
    correction: "have",
    catalogEntries: [finalE],
    historicalReviewedEvidence: [{
      sourceId: "reviewed-final-e",
      misspellingNormalized: "hav",
      correctSpellingNormalized: "have",
      microSkillKey: finalE.microSkillKey,
      finalClassification: "concept_gap",
      reviewStatus: "finalised",
    }],
  });

  assert.equal(result.recommendationStatus, "recommended");
  assert.equal(result.recommendationAuthority, "possible_match");
  assert.equal(result.recommendedMicroSkillKey, finalE.microSkillKey);
  assert.equal(result.isPrefillAllowed, true);
}

{
  const helperSource = readFileSync(
    "lib/writing-engine/spelling/stage2a-micro-skill-recommendation.ts",
    "utf8",
  );
  const readModelSource = readFileSync(
    "lib/writing-engine/persistence/stage2a-micro-skill-recommendation.ts",
    "utf8",
  );
  const forbiddenMutationCalls = /\.(insert|update|upsert|delete|rpc)\s*\(/;

  assert.equal(forbiddenMutationCalls.test(helperSource), false);
  assert.equal(forbiddenMutationCalls.test(readModelSource), false);
}

async function runReadModelRegression() {
  {
    const supabase = createRecommendationCanonicalFakeSupabase();
    const { findRecommendationCanonicalExactPairMappings } =
      loadCanonicalMappingHelper();
    const hiddenMappings = await findRecommendationCanonicalExactPairMappings({
      supabase: supabase as never,
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
    });
    const visibleMappings = await findRecommendationCanonicalExactPairMappings({
      supabase: supabase as never,
      misspellingNormalized: "natrual",
      correctSpellingNormalized: "natural",
    });
    const inactiveMappings = await findRecommendationCanonicalExactPairMappings({
      supabase: supabase as never,
      misspellingNormalized: "hav",
      correctSpellingNormalized: "have",
    });
    const nonAssignableMappings = await findRecommendationCanonicalExactPairMappings({
      supabase: supabase as never,
      misspellingNormalized: "gras",
      correctSpellingNormalized: "grass",
    });
    const nonD4Mappings = await findRecommendationCanonicalExactPairMappings({
      supabase: supabase as never,
      misspellingNormalized: "taik",
      correctSpellingNormalized: "take",
    });

    assert.equal(JSON.stringify(hiddenMappings), JSON.stringify([{
      mappingId: "canonical-business-hidden",
      misspellingNormalized: "buisness",
      correctSpellingNormalized: "business",
      microSkillKey: businessPattern.microSkillKey,
      resolverVisibilityStatus: "hidden",
    }]));
    assert.equal(JSON.stringify(visibleMappings), JSON.stringify([{
      mappingId: "canonical-natural-visible",
      misspellingNormalized: "natrual",
      correctSpellingNormalized: "natural",
      microSkillKey: naturalPattern.microSkillKey,
      resolverVisibilityStatus: "visible",
    }]));
    assert.equal(JSON.stringify(inactiveMappings), JSON.stringify([]));
    assert.equal(JSON.stringify(nonAssignableMappings), JSON.stringify([]));
    assert.equal(JSON.stringify(nonD4Mappings), JSON.stringify([]));
  }

  {
    const supabase = createStage2aFakeSupabase({
      errorsByTable: {
        spelling_canonical_mappings: {
          code: "42501",
          message: "permission denied for table spelling_canonical_mappings",
        },
      },
    });
    const readModel = await buildStage2aMicroSkillRecommendationReadModel({
      supabase: supabase as never,
      misspelling: "hav",
      correction: "have",
      parentUserId: "parent-1",
      childId: "child-1",
      taskSubmissionId: "submission-1",
      writingSampleId: "sample-1",
    });
    const result = recommendStage2aMicroSkillForSpellingPair(readModel);

    assert.deepEqual(readModel.canonicalMappings, []);
    assert.equal(result.recommendationStatus, "low_confidence");
    assert.equal(result.recommendationAuthority, "no_match_yet");
    assert.equal(result.isPrefillAllowed, false);
    assert.equal(
      supabase.readTables.includes("spelling_canonical_mappings"),
      true,
      "Read model should attempt optional canonical mappings but fail soft when RLS denies them.",
    );
  }

  await assert.rejects(
    () =>
      buildStage2aMicroSkillRecommendationReadModel({
        supabase: createStage2aFakeSupabase({
          errorsByTable: {
            spelling_canonical_mappings: {
              code: "08006",
              message: "connection failure while reading optional source",
            },
          },
        }) as never,
        misspelling: "hav",
        correction: "have",
      }),
    /connection failure/,
    "Unexpected optional-source errors should still remain visible.",
  );
}

runReadModelRegression()
  .then(() => {
    console.log("writing-engine-stage2a-micro-skill-recommendation-regression: ok");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
