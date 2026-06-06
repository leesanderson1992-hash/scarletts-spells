import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadTsModule } from "./review-work-vm-loader";

type ResolverVisibleResolution =
  | {
      status: "resolved";
      source: "resolver_visible_canonical_exact_pair";
      mappingId: string;
      misspellingNormalized: string;
      correctSpellingNormalized: string;
      microSkillKey: string;
      dialectCode: string;
      normalizationVersion: string;
    }
  | {
      status: "unresolved";
      reason:
        | "missing_pair"
        | "no_visible_mapping"
        | "missing_visibility_enable_event"
        | "inactive_or_non_assignable_micro_skill";
    }
  | {
      status: "blocked";
      reason:
        | "conflicting_visible_micro_skills"
        | "conflicting_visible_corrections";
      mappingIds: string[];
    };

type CandidateMapping = {
  correct_spelling_normalized: string;
  micro_skill_key: string;
};

type HarnessState = {
  resolverVisibleResolution: ResolverVisibleResolution;
  catalogMicroSkillKey: string | null;
  catalogResolution: Record<string, unknown>;
  parentLocalMappings: CandidateMapping[];
  resolverVisibleCalls: Array<{
    misspellingNormalized: string | null;
    correctSpellingNormalized: string | null;
  }>;
};

function buildResolvedResolverVisible(
  microSkillKey = "D4_RESOLVER_VISIBLE",
): ResolverVisibleResolution {
  return {
    status: "resolved",
    source: "resolver_visible_canonical_exact_pair",
    mappingId: "mapping-1",
    misspellingNormalized: "natral",
    correctSpellingNormalized: "natural",
    microSkillKey,
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
  };
}

function loadHarness(overrides: Partial<HarnessState> = {}) {
  const state: HarnessState = {
    resolverVisibleResolution: {
      status: "unresolved",
      reason: "no_visible_mapping",
    },
    catalogMicroSkillKey: null,
    catalogResolution: {
      status: "unresolved",
      reason: "unmapped_word",
      sourceRefs: ["micro_skill_catalog.metadata.starter_word_bank"],
      normalizedSuggestedReplacement: "natural",
    },
    parentLocalMappings: [],
    resolverVisibleCalls: [],
    ...overrides,
  };
  const modulePath = path.join(
    process.cwd(),
    "app/courses/review/resolver-visible-priority.ts",
  );
  const module = loadTsModule<{
    resolveScopedMicroSkillForSubmissionSuggestion: (input: {
      supabase: unknown;
      parentUserId: string;
      childId: string;
      observedText: string | null;
      suggestedReplacement: string | null;
    }) => Promise<{
      microSkillKey: string | null;
      source: string;
      blocked: boolean;
      resolverVisibleResolution: ResolverVisibleResolution | null;
    }>;
    mergeScopedSubmissionMicroSkillResolutionMetadata: (input: {
      metadata: Record<string, unknown> | null;
      resolution: {
        canonicalResolution: Record<string, unknown>;
        microSkillKey: string | null;
        source: string;
        blocked: boolean;
        resolverVisibleResolution: ResolverVisibleResolution | null;
      };
    }) => Record<string, unknown>;
  }>(modulePath, {
    stubModules: {
      "server-only": {},
      "@/lib/supabase/server": {
        createClient() {},
      },
      "@/lib/writing-engine/persistence/spelling-canonical-mappings": {
        async findResolverVisibleExactPairMapping(input: {
          misspellingNormalized: string | null;
          correctSpellingNormalized: string | null;
        }) {
          state.resolverVisibleCalls.push(input);
          return state.resolverVisibleResolution;
        },
      },
      "@/lib/writing-engine/persistence/spelling-candidate-mappings": {
        createSupabaseSpellingCandidateMappingRepository() {
          return {
            async findScopedPromotedByMisspelling() {
              return state.parentLocalMappings;
            },
          };
        },
      },
      "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1": {
        getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey() {
          return state.catalogMicroSkillKey;
        },
        mergeCanonicalSubmissionSpellingSlice1Metadata(input: {
          metadata: Record<string, unknown> | null;
          resolution: Record<string, unknown>;
        }) {
          return {
            ...(input.metadata ?? {}),
            canonical_submission_spelling_mapping: input.resolution,
          };
        },
        resolveCanonicalSubmissionSpellingMappingSlice1() {
          return state.catalogResolution;
        },
      },
      "./canonical-submission-spelling": {
        async resolveCanonicalMicroSkillForSubmissionSuggestion() {
          return {
            canonicalResolution: state.catalogResolution,
            microSkillKey: state.catalogMicroSkillKey,
          };
        },
      },
      "./review-utils": {
        normaliseWordForLookup(value: string) {
          return value.trim().toLowerCase();
        },
      },
    },
  });

  return { state, module };
}

async function resolveWithGate(
  stateOverrides: Partial<HarnessState>,
  gate: "enabled" | "disabled" = "enabled",
) {
  const previousGate =
    process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS;
  process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS =
    gate === "enabled" ? "enabled" : "";

  try {
    const harness = loadHarness(stateOverrides);
    const result =
      await harness.module.resolveScopedMicroSkillForSubmissionSuggestion({
        supabase: {},
        parentUserId: "parent-1",
        childId: "child-1",
        observedText: " Natral ",
        suggestedReplacement: " Natural ",
      });

    return { ...harness, result };
  } finally {
    if (previousGate === undefined) {
      delete process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS;
    } else {
      process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS =
        previousGate;
    }
  }
}

async function testGatePreservesCurrentBehaviorWhenDisabled() {
  const { state, result } = await resolveWithGate(
    {
      resolverVisibleResolution: buildResolvedResolverVisible(),
      catalogMicroSkillKey: "D4_CATALOG",
    },
    "disabled",
  );

  assert.equal(result.microSkillKey, "D4_CATALOG");
  assert.equal(result.source, "catalog_canonical");
  assert.equal(state.resolverVisibleCalls.length, 0);
}

async function testVisibleExactPairWinsOverCatalogAndParentLocal() {
  const { state, result } = await resolveWithGate({
    resolverVisibleResolution: buildResolvedResolverVisible(),
    catalogMicroSkillKey: "D4_CATALOG",
    parentLocalMappings: [
      {
        correct_spelling_normalized: "natural",
        micro_skill_key: "D4_PARENT_LOCAL",
      },
    ],
  });

  assert.equal(result.microSkillKey, "D4_RESOLVER_VISIBLE");
  assert.equal(result.source, "resolver_visible_canonical_exact_pair");
  assert.equal(result.blocked, false);
  assert.equal(
    JSON.stringify(state.resolverVisibleCalls),
    JSON.stringify([
      {
        misspellingNormalized: "natral",
        correctSpellingNormalized: "natural",
      },
    ]),
  );
}

async function testNoVisibleMappingFallsThroughToCatalog() {
  const { result } = await resolveWithGate({
    resolverVisibleResolution: {
      status: "unresolved",
      reason: "no_visible_mapping",
    },
    catalogMicroSkillKey: "D4_CATALOG",
  });

  assert.equal(result.microSkillKey, "D4_CATALOG");
  assert.equal(result.source, "catalog_canonical");
}

async function testNoCatalogFallsThroughToSameScopeParentLocal() {
  const { result } = await resolveWithGate({
    resolverVisibleResolution: {
      status: "unresolved",
      reason: "no_visible_mapping",
    },
    catalogMicroSkillKey: null,
    parentLocalMappings: [
      {
        correct_spelling_normalized: "natural",
        micro_skill_key: "D4_PARENT_LOCAL",
      },
    ],
  });

  assert.equal(result.microSkillKey, "D4_PARENT_LOCAL");
  assert.equal(result.source, "parent_local_promoted");
}

async function testParentLocalIsNotGlobalTruth() {
  const { result } = await resolveWithGate({
    resolverVisibleResolution: {
      status: "unresolved",
      reason: "no_visible_mapping",
    },
    catalogMicroSkillKey: null,
    parentLocalMappings: [
      {
        correct_spelling_normalized: "elsewhere",
        micro_skill_key: "D4_OTHER_CHILD_SCOPE",
      },
    ],
  });

  assert.equal(result.microSkillKey, null);
  assert.equal(result.source, "unresolved");
}

async function testBlockedResolverVisibleDoesNotFallThrough() {
  const { module, result } = await resolveWithGate({
    resolverVisibleResolution: {
      status: "blocked",
      reason: "conflicting_visible_micro_skills",
      mappingIds: ["mapping-a", "mapping-b"],
    },
    catalogMicroSkillKey: "D4_CATALOG",
    parentLocalMappings: [
      {
        correct_spelling_normalized: "natural",
        micro_skill_key: "D4_PARENT_LOCAL",
      },
    ],
  });

  assert.equal(result.microSkillKey, null);
  assert.equal(result.source, "unresolved");
  assert.equal(result.blocked, true);

  const metadata = module.mergeScopedSubmissionMicroSkillResolutionMetadata({
    metadata: null,
    resolution: {
      canonicalResolution: { status: "resolved" },
      microSkillKey: result.microSkillKey,
      source: result.source,
      blocked: result.blocked,
      resolverVisibleResolution: result.resolverVisibleResolution,
    },
  });

  assert.equal(
    JSON.stringify(metadata.resolver_runtime_micro_skill_resolution),
    JSON.stringify({
      source: "unresolved",
      status: "unresolved",
      blocked: true,
      micro_skill_key: null,
      resolver_visible_resolution: {
        status: "blocked",
        reason: "conflicting_visible_micro_skills",
        mappingIds: ["mapping-a", "mapping-b"],
      },
    }),
  );
}

async function testInvalidResolverVisibleStatesDoNotFallThrough() {
  for (const reason of [
    "missing_visibility_enable_event",
    "inactive_or_non_assignable_micro_skill",
  ] as const) {
    const { result } = await resolveWithGate({
      resolverVisibleResolution: {
        status: "unresolved",
        reason,
      },
      catalogMicroSkillKey: "D4_CATALOG",
      parentLocalMappings: [
        {
          correct_spelling_normalized: "natural",
          micro_skill_key: "D4_PARENT_LOCAL",
        },
      ],
    });

    assert.equal(result.microSkillKey, null, reason);
    assert.equal(result.source, "unresolved", reason);
    assert.equal(result.blocked, true, reason);
  }
}

function testApprovedRuntimeWiringOnly() {
  const prioritySource = readFileSync(
    "app/courses/review/resolver-visible-priority.ts",
    "utf8",
  );
  const stage2cSource = readFileSync(
    "lib/writing-engine/spelling/stage2c-primary-mapping-resolver.ts",
    "utf8",
  );
  const stage3aSource = readFileSync(
    "lib/writing-engine/spelling/stage3a-authentic-submission-analysis.ts",
    "utf8",
  );
  const reviewWorkPage = readFileSync(
    "app/courses/review/[submissionId]/page.tsx",
    "utf8",
  );
  const lessonSubmissionActions = readFileSync(
    "app/courses/review/actions/lesson-submission-review-actions.ts",
    "utf8",
  );
  const adminSources = [
    readFileSync("app/admin/catalog-review/actions.ts", "utf8"),
    readFileSync("app/admin/canonical-recommendations/actions.ts", "utf8"),
  ].join("\n");

  assert.match(
    prioritySource,
    /import "server-only"[\s\S]*findResolverVisibleExactPairMapping/,
    "R3 resolver-visible runtime integration must stay in the server-only priority helper.",
  );
  assert.match(
    prioritySource,
    /WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS[\s\S]*enabled/,
    "R3 runtime resolver-visible use must be feature-gated.",
  );
  assert.match(
    prioritySource,
    /missing_pair[\s\S]*no_visible_mapping/,
    "Only missing pair/no visible mapping may fall through to lower priority behavior.",
  );
  assert.doesNotMatch(
    stage2cSource + stage3aSource,
    /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled/,
    "Stage 2C/Stage 3A pure helpers must not import resolver-visible runtime database reads.",
  );
  assert.doesNotMatch(
    reviewWorkPage,
    /findResolverVisibleExactPairMapping|resolver_visibility_status|resolver_visibility_enabled|resolver_visibility_disabled/,
    "R3 must not add Review Work UI resolver visibility controls.",
  );
  assert.match(
    lessonSubmissionActions,
    /scopedResolution\.blocked[\s\S]*\? null[\s\S]*scopedResolution\.microSkillKey \?\? suggestedMicroSkillKey/,
    "Blocked resolver-visible lookup must not fall through to engine/manual suggestion keys for new suggestions.",
  );
  assert.doesNotMatch(
    adminSources,
    /resolver_visible:\s*true|enableResolverVisibilityForCanonicalMappingAdmin|disableResolverVisibilityForCanonicalMappingAdmin/,
    "PCRM/catalog admin actions must not silently make evidence resolver-visible.",
  );
}

async function testHiddenDisabledPcrmParentNotesAndOpenCasesAreNotConsumed() {
  const helperSource = readFileSync(
    "lib/writing-engine/persistence/spelling-canonical-mappings.ts",
    "utf8",
  );
  const prioritySource = readFileSync(
    "app/courses/review/resolver-visible-priority.ts",
    "utf8",
  );
  const pcrmSource = readFileSync(
    "app/admin/canonical-recommendations/actions.ts",
    "utf8",
  );

  assert.match(
    helperSource,
    /\.eq\("mapping_status", "active"\)[\s\S]*\.eq\("resolver_visibility_status", "visible"\)/,
    "Hidden/disabled canonical mappings must be ignored by the exact-pair helper.",
  );
  assert.doesNotMatch(
    prioritySource,
    /spelling_canonical_mapping_recommendations|spelling_catalog_review_cases|parent_notes|verification_notes/,
    "R3 runtime priority must not consume PCRM evidence, open catalog-review cases, or parent notes.",
  );
  assert.match(
    pcrmSource,
    /resolver_visible:\s*false/,
    "PCRM accepted evidence must remain resolver-invisible unless separately adopted and enabled.",
  );
}

async function main() {
  await testGatePreservesCurrentBehaviorWhenDisabled();
  await testVisibleExactPairWinsOverCatalogAndParentLocal();
  await testNoVisibleMappingFallsThroughToCatalog();
  await testNoCatalogFallsThroughToSameScopeParentLocal();
  await testParentLocalIsNotGlobalTruth();
  await testBlockedResolverVisibleDoesNotFallThrough();
  await testInvalidResolverVisibleStatesDoNotFallThrough();
  testApprovedRuntimeWiringOnly();
  await testHiddenDisabledPcrmParentNotesAndOpenCasesAreNotConsumed();
  console.log("writing-engine-resolver-runtime-integration-regression: ok");
}

main();
