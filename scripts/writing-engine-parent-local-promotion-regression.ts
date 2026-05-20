import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadTsModule } from "./review-work-vm-loader";

type RedirectSignal = {
  url: string;
};

type CandidateMappingRow = {
  id: string;
  parent_user_id: string;
  child_id: string;
  parent_verification_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  source_provenance:
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";
  reviewed_event_source_entity_id: string;
  original_child_spelling: string | null;
  original_correct_spelling: string | null;
  misspelling_normalized: string;
  correct_spelling_normalized: string;
  micro_skill_key: string;
  candidate_status: "pending_parent_promotion" | "parent_local_promoted";
  promotion_scope: "parent_local";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type HarnessState = {
  authUserId: string;
  submission: {
    id: string;
    child_id: string;
    parent_user_id: string;
  };
  candidateMappings: CandidateMappingRow[];
  canonicalMicroSkillKey: string | null;
  canonicalResolution: Record<string, unknown>;
  catalogEntry: {
    microSkillKey: string;
    masteryDomainKey: string;
    isAssignable: boolean;
    isActive: boolean;
  } | null;
};

function createRedirectError(url: string) {
  return { __redirect: true, url };
}

function isRedirectError(error: unknown): error is RedirectSignal & { __redirect: true } {
  return (
    typeof error === "object" &&
    error !== null &&
    "__redirect" in error &&
    (error as { __redirect?: unknown }).__redirect === true
  );
}

function buildDefaultMapping(
  overrides: Partial<CandidateMappingRow> = {},
): CandidateMappingRow {
  return {
    id: "candidate-1",
    parent_user_id: "parent-1",
    child_id: "child-1",
    parent_verification_id: "verification-1",
    task_submission_id: "submission-1",
    writing_sample_id: "sample-1",
    source_suggestion_id: "suggestion-1",
    source_misspelling_instance_id: "misspelling-1",
    source_provenance: "lesson_submission_existing_output",
    reviewed_event_source_entity_id: "source::natral::natural",
    original_child_spelling: "natral",
    original_correct_spelling: "natural",
    misspelling_normalized: "natral",
    correct_spelling_normalized: "natural",
    micro_skill_key: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
    candidate_status: "pending_parent_promotion",
    promotion_scope: "parent_local",
    metadata: {},
    created_at: "2026-05-19T09:00:00.000Z",
    updated_at: "2026-05-19T09:00:00.000Z",
    ...overrides,
  };
}

function createHarness(overrides: Partial<HarnessState> = {}) {
  const state: HarnessState = {
    authUserId: "parent-1",
    submission: {
      id: "submission-1",
      child_id: "child-1",
      parent_user_id: "parent-1",
    },
    candidateMappings: [buildDefaultMapping()],
    canonicalMicroSkillKey: null,
    canonicalResolution: { status: "unresolved" },
    catalogEntry: {
      microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
      masteryDomainKey: "D4",
      isAssignable: true,
      isActive: true,
    },
    ...overrides,
  };

  const workspaceRoot = process.cwd();
  const actionSourcePath = path.join(workspaceRoot, "app/courses/review/actions.ts");
  const canonicalBackfillSourcePath = path.join(
    workspaceRoot,
    "app/courses/review/actions/canonical-spelling-backfill-actions.ts",
  );

  class FakeQueryBuilder {
    private filters: Array<{ field: string; value: unknown }> = [];

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(field: string, value: unknown) {
      this.filters.push({ field, value });
      return this;
    }

    async maybeSingle() {
      if (this.table !== "task_submissions") {
        throw new Error(`Unexpected table lookup: ${this.table}`);
      }

      const matches = this.filters.every(({ field, value }) => {
        return (state.submission as Record<string, unknown>)[field] === value;
      });

      return {
        data: matches ? state.submission : null,
      };
    }
  }

  const stubModules = {
    "next/cache": {
      revalidatePath() {},
    },
    "next/navigation": {
      redirect(url: string) {
        throw createRedirectError(url);
      },
    },
    "@/lib/spelling/categoriseError": {
      categoriseError() {
        return "Pattern/rule";
      },
      getSecondaryCategory() {
        return null;
      },
    },
    "@/lib/lessons/review": {
      extractReviewableLessonFields() {
        return [];
      },
    },
    "@/lib/spelling/errorPatterns": {
      detectErrorPattern() {
        return null;
      },
      selectTeachingFamilyForError() {
        return null;
      },
    },
    "@/lib/spelling/wordFamilies": {
      findWordFamilyForWord() {
        return null;
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        return {
          auth: {
            async getUser() {
              return {
                data: {
                  user: {
                    id: state.authUserId,
                  },
                },
              };
            },
          },
          from(table: string) {
            return new FakeQueryBuilder(table);
          },
        };
      },
    },
    "@/lib/rewards/course-coins": {
      async maybeAwardTaskSubmissionApprovalCoins() {},
    },
    "@/lib/writing-engine/persistence/learning-items": {
      async getCanonicalSubmissionSpellingCatalogEntries() {
        return [];
      },
      async getReviewWorkCandidateCaptureMicroSkillCatalogEntry() {
        return state.catalogEntry;
      },
      async getReviewWorkOverrideMicroSkillProvider() {
        return {
          status: "blocked",
          reason: "missing_anchor",
        };
      },
    },
    "@/lib/writing-engine/persistence/review-work-canonical-submission-spelling": {
      async getCanonicalSubmissionSpellingCatalogEntries() {
        return [];
      },
    },
    "@/lib/writing-engine/persistence/spelling-candidate-mappings": {
      createSupabaseSpellingCandidateMappingRepository() {
        return {
          async findScopedPromotedByMisspelling(input: {
            parentUserId: string;
            childId: string;
            misspellingNormalized: string;
          }) {
            return state.candidateMappings.filter(
              (mapping) =>
                mapping.parent_user_id === input.parentUserId &&
                mapping.child_id === input.childId &&
                mapping.misspelling_normalized === input.misspellingNormalized &&
                mapping.candidate_status === "parent_local_promoted" &&
                mapping.promotion_scope === "parent_local",
            );
          },
          async findByIdForParentChild(input: {
            id: string;
            parentUserId: string;
            childId: string;
          }) {
            return (
              state.candidateMappings.find(
                (mapping) =>
                  mapping.id === input.id &&
                  mapping.parent_user_id === input.parentUserId &&
                  mapping.child_id === input.childId,
              ) ?? null
            );
          },
          async findConflictingScopedPromotedMappings(input: {
            parentUserId: string;
            childId: string;
            misspellingNormalized: string;
            correctSpellingNormalized: string;
            microSkillKey: string;
            excludeId?: string | null;
          }) {
            return state.candidateMappings.filter(
              (mapping) =>
                mapping.parent_user_id === input.parentUserId &&
                mapping.child_id === input.childId &&
                mapping.candidate_status === "parent_local_promoted" &&
                mapping.promotion_scope === "parent_local" &&
                mapping.misspelling_normalized === input.misspellingNormalized &&
                mapping.id !== input.excludeId &&
                (mapping.correct_spelling_normalized !== input.correctSpellingNormalized ||
                  mapping.micro_skill_key !== input.microSkillKey),
            );
          },
          async promoteParentLocalPending(input: {
            id: string;
            parentUserId: string;
            childId: string;
            actionSource: string;
            nowIso: string;
          }) {
            const mapping = state.candidateMappings.find(
              (candidate) =>
                candidate.id === input.id &&
                candidate.parent_user_id === input.parentUserId &&
                candidate.child_id === input.childId,
            );

            if (!mapping) {
              throw new Error("Missing mapping.");
            }

            if (mapping.candidate_status === "parent_local_promoted") {
              return { status: "already_promoted", record: mapping };
            }

            mapping.candidate_status = "parent_local_promoted";
            mapping.metadata.latest_parent_local_promotion = {
              promotedAt: input.nowIso,
              promotedByParentUserId: input.parentUserId,
              actionSource: input.actionSource,
            };

            return { status: "updated", record: mapping };
          },
          async revertParentLocalPromoted(input: {
            id: string;
            parentUserId: string;
            childId: string;
            actionSource: string;
            nowIso: string;
          }) {
            const mapping = state.candidateMappings.find(
              (candidate) =>
                candidate.id === input.id &&
                candidate.parent_user_id === input.parentUserId &&
                candidate.child_id === input.childId,
            );

            if (!mapping) {
              throw new Error("Missing mapping.");
            }

            if (mapping.candidate_status === "pending_parent_promotion") {
              return { status: "already_pending", record: mapping };
            }

            mapping.candidate_status = "pending_parent_promotion";
            mapping.metadata.latest_parent_local_reversal = {
              revertedAt: input.nowIso,
              revertedByParentUserId: input.parentUserId,
              actionSource: input.actionSource,
            };

            return { status: "updated", record: mapping };
          },
        };
      },
    },
    "@/lib/writing-engine/review/stage7d-parent-verification": {
      buildStage7dReviewWorkVerificationTarget() {
        return null;
      },
      async recordStage7dParentVerification() {},
      async recordStage7dParentVerificationWithoutPromotion() {},
    },
    "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1": {
      getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey() {
        return state.canonicalMicroSkillKey;
      },
      mergeCanonicalSubmissionSpellingSlice1Metadata(input: {
        metadata: Record<string, unknown> | null;
      }) {
        return input.metadata ?? null;
      },
      resolveCanonicalSubmissionSpellingMappingSlice1() {
        return state.canonicalResolution;
      },
    },
    "@/lib/writing-engine/spelling/legacy-analysis": {
      stringifyAnalysisExtraMetadata() {
        return "{}";
      },
    },
    "@/lib/writing-practice/positive-evidence": {
      async confirmPositiveEvidenceSuggestions() {},
    },
    "@/lib/writing-practice/types": {
      doesFinalClassificationCreateLearningItem() {
        return false;
      },
      isWritingIssueFinalClassification() {
        return false;
      },
    },
    "../review-utils": {
      buildFalsePositiveSuppressionSet() {
        return new Set<string>();
      },
      getUnresolvedMisspellingCount() {
        return 0;
      },
      hasActionableReturnedIssues() {
        return false;
      },
      isParentAuthoredMisspellingRow() {
        return false;
      },
      isSuppressedFalsePositivePair() {
        return false;
      },
      normaliseWordForLookup(value: string) {
        return value.trim().toLowerCase();
      },
    },
    "./review-utils": {
      normaliseWordForLookup(value: string) {
        return value.trim().toLowerCase();
      },
    },
  };

  const actionModule = loadTsModule<{
    promoteParentLocalCandidateMapping: (formData: FormData) => Promise<void>;
    revertParentLocalCandidateMapping: (formData: FormData) => Promise<void>;
  }>(actionSourcePath, { stubModules });
  const canonicalModule = loadTsModule<{
    resolveScopedMicroSkillForSubmissionSuggestion: (input: {
      supabase: unknown;
      parentUserId: string;
      childId: string;
      observedText: string | null;
      suggestedReplacement: string | null;
    }) => Promise<{ microSkillKey: string | null; source: string }>;
  }>(canonicalBackfillSourcePath, { stubModules });

  return {
    state,
    promoteAction: actionModule.promoteParentLocalCandidateMapping,
    revertAction: actionModule.revertParentLocalCandidateMapping,
    resolveScoped: canonicalModule.resolveScopedMicroSkillForSubmissionSuggestion,
  };
}

async function invokeRedirectingAction(
  action: (formData: FormData) => Promise<void>,
  formData: FormData,
) {
  try {
    await action(formData);
    throw new Error("Expected redirect.");
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }

    return error.url;
  }
}

function buildPromotionFormData(candidateMappingId = "candidate-1") {
  const formData = new FormData();
  formData.set("candidate_mapping_id", candidateMappingId);
  formData.set("submission_id", "submission-1");
  formData.set("redirect_path", "/courses/review/submission-1");
  return formData;
}

function assertRedirectMessage(url: string, key: "saved" | "error", expected: string) {
  const [, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  assert.equal(params.get(key), expected, `Unexpected redirect URL: ${url}`);
}

async function testScopedResolverPrefersCanonicalTruth() {
  const harness = createHarness({
    canonicalMicroSkillKey: "D4_CANONICAL",
    candidateMappings: [
      buildDefaultMapping({
        candidate_status: "parent_local_promoted",
        micro_skill_key: "D4_LOCAL",
      }),
    ],
  });

  const result = await harness.resolveScoped({
    supabase: {},
    parentUserId: "parent-1",
    childId: "child-1",
    observedText: "natral",
    suggestedReplacement: "natural",
  });

  assert.equal(result.microSkillKey, "D4_CANONICAL");
  assert.equal(result.source, "catalog_canonical");
}

async function testScopedResolverUsesPromotedLocalMappingOnlyInScope() {
  const harness = createHarness({
    candidateMappings: [
      buildDefaultMapping({
        candidate_status: "parent_local_promoted",
        micro_skill_key: "D4_LOCAL",
      }),
    ],
  });

  const inScope = await harness.resolveScoped({
    supabase: {},
    parentUserId: "parent-1",
    childId: "child-1",
    observedText: "natral",
    suggestedReplacement: "natural",
  });
  const wrongParent = await harness.resolveScoped({
    supabase: {},
    parentUserId: "parent-2",
    childId: "child-1",
    observedText: "natral",
    suggestedReplacement: "natural",
  });
  const wrongChild = await harness.resolveScoped({
    supabase: {},
    parentUserId: "parent-1",
    childId: "child-2",
    observedText: "natral",
    suggestedReplacement: "natural",
  });

  assert.equal(inScope.microSkillKey, "D4_LOCAL");
  assert.equal(inScope.source, "parent_local_promoted");
  assert.equal(wrongParent.microSkillKey, null);
  assert.equal(wrongChild.microSkillKey, null);
}

async function testScopedResolverIgnoresPendingAndConflicts() {
  const pendingHarness = createHarness({
    candidateMappings: [
      buildDefaultMapping({
        candidate_status: "pending_parent_promotion",
        micro_skill_key: "D4_PENDING",
      }),
    ],
  });
  const pendingResult = await pendingHarness.resolveScoped({
    supabase: {},
    parentUserId: "parent-1",
    childId: "child-1",
    observedText: "natral",
    suggestedReplacement: "natural",
  });
  assert.equal(pendingResult.microSkillKey, null);

  const conflictHarness = createHarness({
    candidateMappings: [
      buildDefaultMapping({
        id: "candidate-1",
        candidate_status: "parent_local_promoted",
        micro_skill_key: "D4_ONE",
      }),
      buildDefaultMapping({
        id: "candidate-2",
        candidate_status: "parent_local_promoted",
        micro_skill_key: "D4_TWO",
      }),
    ],
  });
  const conflictResult = await conflictHarness.resolveScoped({
    supabase: {},
    parentUserId: "parent-1",
    childId: "child-1",
    observedText: "natral",
    suggestedReplacement: "natural",
  });
  assert.equal(conflictResult.microSkillKey, null);
}

async function testPromoteAndRevertActionsWriteAuditMetadata() {
  const harness = createHarness();

  const promoteUrl = await invokeRedirectingAction(
    harness.promoteAction,
    buildPromotionFormData(),
  );
  assertRedirectMessage(
    promoteUrl,
    "saved",
    "Candidate mapping promoted for this child. Future matching suggestions can now reuse it in this parent/child scope.",
  );
  assert.equal(harness.state.candidateMappings[0]?.candidate_status, "parent_local_promoted");
  assert.equal(
    (
      harness.state.candidateMappings[0]?.metadata.latest_parent_local_promotion as {
        actionSource?: string;
      }
    )?.actionSource,
    "review_work_parent_local_promotion",
  );

  const revertUrl = await invokeRedirectingAction(
    harness.revertAction,
    buildPromotionFormData(),
  );
  assertRedirectMessage(
    revertUrl,
    "saved",
    "Candidate mapping returned to pending. It will no longer be reused by future suggestions until promoted again.",
  );
  assert.equal(harness.state.candidateMappings[0]?.candidate_status, "pending_parent_promotion");
  assert.equal(
    (
      harness.state.candidateMappings[0]?.metadata.latest_parent_local_reversal as {
        actionSource?: string;
      }
    )?.actionSource,
    "review_work_parent_local_reversal",
  );
}

async function testPromoteActionRejectsConflictsAndInvalidCatalogEntries() {
  const conflictHarness = createHarness({
    candidateMappings: [
      buildDefaultMapping(),
      buildDefaultMapping({
        id: "candidate-2",
        candidate_status: "parent_local_promoted",
        correct_spelling_normalized: "nature",
      }),
    ],
  });
  const conflictUrl = await invokeRedirectingAction(
    conflictHarness.promoteAction,
    buildPromotionFormData(),
  );
  assertRedirectMessage(
    conflictUrl,
    "error",
    "A different promoted mapping already exists for this misspelling in this child scope.",
  );

  const invalidCatalogHarness = createHarness({
    catalogEntry: {
      microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
      masteryDomainKey: "D4",
      isAssignable: false,
      isActive: true,
    },
  });
  const invalidCatalogUrl = await invokeRedirectingAction(
    invalidCatalogHarness.promoteAction,
    buildPromotionFormData(),
  );
  assertRedirectMessage(
    invalidCatalogUrl,
    "error",
    "Non-assignable micro-skills cannot be used for parent-local promotion.",
  );
}

function testReviewWorkSourceGuardrails() {
  const workspaceRoot = process.cwd();
  const reviewDetailPagePath = path.join(
    workspaceRoot,
    "app/courses/review/[submissionId]/page.tsx",
  );
  const pageSource = readFileSync(reviewDetailPagePath, "utf8");

  assert.match(pageSource, /Promote for this child/);
  assert.match(pageSource, /Revert to pending/);
  assert.match(
    pageSource,
    /This mapping is currently used only for this child\/parent scope\./,
  );
  assert.match(
    pageSource,
    /This will let future suggestions for this child use this mapping\./,
  );
}

async function main() {
  await testScopedResolverPrefersCanonicalTruth();
  await testScopedResolverUsesPromotedLocalMappingOnlyInScope();
  await testScopedResolverIgnoresPendingAndConflicts();
  await testPromoteAndRevertActionsWriteAuditMetadata();
  await testPromoteActionRejectsConflictsAndInvalidCatalogEntries();
  testReviewWorkSourceGuardrails();

  console.log("writing-engine-parent-local-promotion-regression: ok");
}

void main();
