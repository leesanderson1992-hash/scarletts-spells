import assert from "node:assert/strict";
import path from "node:path";
import { loadTsModule } from "./review-work-vm-loader";

type RedirectSignal = {
  url: string;
};

type ParentVerificationCall = {
  childId: string;
  parentUserId: string;
  decision: string;
  verifiedCategoryCode: string | null;
  verifiedMicroSkillKey: string | null;
  verifiedTemplateKey: string | null;
  note: string | null;
  target: {
    sourceRef: {
      sourceEntityId: string;
      taskSubmissionId: string | null;
      writingSampleId: string | null;
    };
    suggestedCategoryCode: string | null;
    suggestedMicroSkillKey: string | null;
  };
};

type HarnessState = {
  authUserId?: string | null;
  ownedSubmission?: {
    id: string;
    child_id: string;
    parent_user_id?: string;
  } | null;
  linkedWritingSample?: {
    id: string;
    child_id: string;
    parent_user_id?: string;
    task_submission_id?: string | null;
    sample_text?: string | null;
  } | null;
  manualWritingSample?: {
    id: string;
    child_id: string;
    parent_user_id?: string;
    task_submission_id?: string | null;
    review_completed_at?: string | null;
  } | null;
  misspelling?: {
    id: string;
    misspelled_word: string | null;
    corrected_word: string | null;
    suggested_word: string | null;
    error_type: string | null;
    parent_user_id?: string;
    notes: string | null;
    context_text: string | null;
    position_start: number | null;
    position_end: number | null;
  } | null;
  writingIssueSuggestions?: Array<{
    id: string;
    parent_user_id: string;
    task_submission_id?: string | null;
    writing_sample_id?: string | null;
    misspelling_instance_id: string;
    suggestion_status: string;
    suggested_replacement?: string | null;
    suggested_micro_skill_key: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  parentVerificationRows?: Array<{
    id: string;
    parent_user_id: string;
    task_submission_id?: string | null;
    source_entity_id: string;
  }>;
  providerResult?: {
    status: "available";
    options: Array<{ microSkillKey: string; displayName: string }>;
  } | {
    status: "blocked";
    reason: string;
  };
  canonicalMappingMicroSkillKey?: string | null;
};

type HarnessResult = {
  redirects: RedirectSignal[];
  recordCalls: ParentVerificationCall[];
  providerInputs: Array<{ anchorMicroSkillKey: string | null }>;
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

class FakeQueryBuilder {
  private readonly filters: Array<{ field: string; value: unknown }> = [];
  private pendingUpdate: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: Required<HarnessState>,
  ) {}

  select(_columns: string) {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  update(values: Record<string, unknown>) {
    if (this.table !== "writing_issue_suggestions") {
      throw new Error(`Unexpected update against ${this.table} in bounded regression harness.`);
    }

    this.pendingUpdate = values;
    return this;
  }

  insert() {
    throw new Error(`Unexpected insert against ${this.table} in bounded regression harness.`);
  }

  async maybeSingle() {
    return { data: this.resolveSingle() };
  }

  async single() {
    return { data: this.resolveSingle(), error: null };
  }

  private resolveSingle() {
    const rows = this.resolveRows();
    return rows[0] ?? null;
  }

  private resolveRows() {
    switch (this.table) {
      case "task_submissions":
        return this.filterRows(this.state.ownedSubmission ? [this.state.ownedSubmission] : []);
      case "writing_samples":
        return this.filterRows(
          [
            this.state.linkedWritingSample,
            this.state.manualWritingSample,
          ].filter(Boolean) as Array<Record<string, unknown>>,
        );
      case "misspelling_instances":
        return this.filterRows(this.state.misspelling ? [this.state.misspelling] : []);
      case "writing_issue_suggestions":
        return this.filterRows(this.state.writingIssueSuggestions as Array<Record<string, unknown>>);
      case "parent_verifications":
        return this.filterRows(this.state.parentVerificationRows as Array<Record<string, unknown>>);
      default:
        throw new Error(`Unexpected table lookup in bounded regression harness: ${this.table}`);
    }
  }

  private filterRows(rows: Array<Record<string, unknown>>) {
    const matchingRows = rows.filter((row) =>
      this.filters.every(({ field, value }) => {
        const rowValue = row[field];
        return rowValue === value;
      }),
    );

    if (this.pendingUpdate && this.table === "writing_issue_suggestions") {
      return matchingRows.map((row) => ({
        ...row,
        ...this.pendingUpdate,
      }));
    }

    return matchingRows;
  }
}

function createHarnessState(overrides: HarnessState = {}): Required<HarnessState> {
  return {
    authUserId: "parent-1",
    ownedSubmission: {
      id: "submission-1",
      child_id: "child-1",
      parent_user_id: "parent-1",
    },
    linkedWritingSample: {
      id: "sample-1",
      child_id: "child-1",
      parent_user_id: "parent-1",
      task_submission_id: "submission-1",
      sample_text: "I tast cake.",
    },
    manualWritingSample: null,
    misspelling: {
      id: "misspelling-1",
      misspelled_word: "tast",
      corrected_word: "taste",
      suggested_word: "taste",
      error_type: "Pattern/rule",
      parent_user_id: "parent-1",
      notes: null,
      context_text: "tast",
      position_start: 2,
      position_end: 6,
    },
    writingIssueSuggestions: [
      {
        id: "suggestion-1",
        parent_user_id: "parent-1",
        task_submission_id: "submission-1",
        writing_sample_id: "sample-1",
        misspelling_instance_id: "misspelling-1",
        suggestion_status: "pending",
        suggested_replacement: "taste",
        suggested_micro_skill_key: "D4_PG_FINAL_E_DROP",
        notes: null,
        metadata: null,
      },
    ],
    parentVerificationRows: [],
    providerResult: {
      status: "available",
      options: [
        {
          microSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
          displayName: "Long ai vs a-e contrast",
        },
      ],
    },
    canonicalMappingMicroSkillKey: null,
    ...overrides,
  };
}

function loadRecordReviewWorkVerificationAction(state: Required<HarnessState>): {
  action: (formData: FormData) => Promise<void>;
  result: HarnessResult;
} {
  const workspaceRoot = process.cwd();
  const actionSourcePath = path.join(workspaceRoot, "app/courses/review/actions.ts");

  const redirects: RedirectSignal[] = [];
  const recordCalls: ParentVerificationCall[] = [];
  const providerInputs: Array<{ anchorMicroSkillKey: string | null }> = [];

  const stubModules: Record<string, unknown> = {
    "next/cache": {
      revalidatePath() {},
    },
    "next/navigation": {
      redirect(url: string) {
        const signal = createRedirectError(url);
        redirects.push({ url });
        throw signal;
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
                  user: state.authUserId ? { id: state.authUserId } : null,
                },
              };
            },
          },
          from(table: string) {
            return new FakeQueryBuilder(table, state);
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
        return null;
      },
      async getReviewWorkOverrideMicroSkillProvider(input: {
        anchorMicroSkillKey: string | null;
      }) {
        providerInputs.push({ anchorMicroSkillKey: input.anchorMicroSkillKey });
        return state.providerResult;
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
          async findScopedPromotedByMisspelling() {
            return [];
          },
          async findByParentVerificationId() {
            return null;
          },
          async insertPending() {
            throw new Error(
              "Candidate mapping insertion should not run in override-provider behavior regression.",
            );
          },
        };
      },
    },
    "@/lib/writing-engine/review/stage7d-parent-verification": {
      buildStage7dReviewWorkVerificationTarget(input: {
        taskSubmissionId: string | null;
        writingSampleId: string | null;
        suggestedCategoryCode: string | null;
        suggestedMicroSkillKey: string | null;
      }) {
        return {
          sourceRef: {
            sourceEntityId: "misspelling-1",
            taskSubmissionId: input.taskSubmissionId,
            writingSampleId: input.writingSampleId,
          },
          suggestedCategoryCode: input.suggestedCategoryCode,
          suggestedMicroSkillKey: input.suggestedMicroSkillKey,
        };
      },
      async recordStage7dParentVerification(input: ParentVerificationCall) {
        recordCalls.push(input);
      },
      async recordStage7dParentVerificationWithoutPromotion() {
        throw new Error(
          "Candidate capture verification should not run in override-provider behavior regression.",
        );
      },
    },
    "@/lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1": {
      getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey() {
        return state.canonicalMappingMicroSkillKey;
      },
      mergeCanonicalSubmissionSpellingSlice1Metadata(input: {
        metadata: Record<string, unknown> | null;
      }) {
        return input.metadata ?? null;
      },
      resolveCanonicalSubmissionSpellingMappingSlice1() {
        return { status: "unresolved" };
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

  const module = loadTsModule<{
    recordReviewWorkVerificationAction: (formData: FormData) => Promise<void>;
  }>(actionSourcePath, { stubModules });

  return {
    action: module.recordReviewWorkVerificationAction,
    result: {
      redirects,
      recordCalls,
      providerInputs,
    },
  };
}

async function runAction(stateOverrides: HarnessState, formData: FormData) {
  const state = createHarnessState(stateOverrides);
  const { action, result } = loadRecordReviewWorkVerificationAction(state);

  try {
    await action(formData);
    assert.fail("Expected the server action to redirect.");
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
  }

  const redirect = result.redirects.at(-1);
  assert.ok(redirect, "Expected a redirect result from the server action.");

  return {
    redirect: redirect.url,
    recordCalls: result.recordCalls,
    providerInputs: result.providerInputs,
  };
}

function buildLessonOverrideFormData(
  overrides: Record<string, string | undefined> = {},
) {
  const formData = new FormData();
  formData.set("decision", overrides.decision ?? "overridden");
  formData.set("redirect_path", "/courses/review/submission-1");
  formData.set("misspelling_instance_id", "misspelling-1");
  formData.set("task_submission_id", "submission-1");

  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      formData.set(key, value);
    }
  });

  return formData;
}

function buildManualSampleOverrideFormData(
  overrides: Record<string, string | undefined> = {},
) {
  const formData = new FormData();
  formData.set("decision", overrides.decision ?? "overridden");
  formData.set("redirect_path", "/courses/review/sample-1");
  formData.set("misspelling_instance_id", "misspelling-1");
  formData.set("writing_sample_id", "sample-1");

  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      formData.set(key, value);
    }
  });

  return formData;
}

function assertRedirectMessage(url: string, key: "saved" | "error", expected: string) {
  const [, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  assert.equal(params.get(key), expected, `Unexpected redirect URL: ${url}`);
}

async function testValidOverrideSaveSucceeds() {
  const outcome = await runAction(
    {},
    buildLessonOverrideFormData({
      verified_micro_skill_key: "D4_PG_LONG_AI_A_E_CONTRAST",
      verification_note: "Parent wants the sibling pattern first.",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Parent verification recorded as overridden.",
  );
  assert.equal(outcome.recordCalls.length, 1);
  assert.equal(
    outcome.recordCalls[0]?.verifiedMicroSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(outcome.providerInputs.length, 1);
  assert.equal(outcome.providerInputs[0]?.anchorMicroSkillKey, "D4_PG_FINAL_E_DROP");
}

async function testValidOverrideSaveSucceedsWithCanonicalFallbackAnchor() {
  const outcome = await runAction(
    {
      writingIssueSuggestions: [
        {
          id: "suggestion-1",
          parent_user_id: "parent-1",
          task_submission_id: "submission-1",
          writing_sample_id: "sample-1",
          misspelling_instance_id: "misspelling-1",
          suggestion_status: "pending",
          suggested_replacement: "red",
          suggested_micro_skill_key: "unknown",
          notes: null,
          metadata: null,
        },
      ],
      canonicalMappingMicroSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_E",
      providerResult: {
        status: "available",
        options: [
          {
            microSkillKey: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
            displayName: "Spell full CVC sound-to-spelling mapping",
          },
        ],
      },
      misspelling: {
        id: "misspelling-1",
        misspelled_word: "redd",
        corrected_word: "red",
        suggested_word: "red",
        error_type: "Pattern/rule",
        parent_user_id: "parent-1",
        notes: null,
        context_text: "redd",
        position_start: 4,
        position_end: 8,
      },
    },
    buildLessonOverrideFormData({
      verified_micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Parent verification recorded as overridden.",
  );
  assert.equal(outcome.recordCalls.length, 1);
  assert.equal(
    outcome.recordCalls[0]?.verifiedMicroSkillKey,
    "D4_PG_CVC_SHORT_VOWELS_FULL_MAPPING",
  );
  assert.equal(
    outcome.providerInputs[0]?.anchorMicroSkillKey,
    "D4_PG_CVC_SHORT_VOWELS_SHORT_E",
  );
}

async function testOutOfBoundsCatalogKeyRejected() {
  const outcome = await runAction(
    {},
    buildLessonOverrideFormData({
      verified_micro_skill_key: "D4_PG_OUTSIDE_FAMILY_OPTION",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Override micro-skill must match a canonical bounded catalog option.",
  );
  assert.equal(outcome.recordCalls.length, 0);
}

async function testNonCatalogKeyRejected() {
  const outcome = await runAction(
    {},
    buildLessonOverrideFormData({
      verified_micro_skill_key: "NOT_A_REAL_MICRO_SKILL",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Override micro-skill must match a canonical bounded catalog option.",
  );
  assert.equal(outcome.recordCalls.length, 0);
}

async function testTemplateOverrideRejected() {
  const outcome = await runAction(
    {},
    buildLessonOverrideFormData({
      verified_template_key: "T03",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Template override options are not available in this bounded slice.",
  );
  assert.equal(outcome.recordCalls.length, 0);
}

async function testManualWritingSampleOverrideRejected() {
  const outcome = await runAction(
    {
      ownedSubmission: null,
      linkedWritingSample: null,
      manualWritingSample: {
        id: "sample-1",
        child_id: "child-1",
        parent_user_id: "parent-1",
        task_submission_id: null,
        review_completed_at: null,
      },
      writingIssueSuggestions: [
        {
          id: "suggestion-1",
          parent_user_id: "parent-1",
          writing_sample_id: "sample-1",
          misspelling_instance_id: "misspelling-1",
          suggestion_status: "pending",
          suggested_replacement: "taste",
          suggested_micro_skill_key: "D4_PG_FINAL_E_DROP",
          notes: null,
          metadata: null,
        },
      ],
    },
    buildManualSampleOverrideFormData({
      verified_micro_skill_key: "D4_PG_LONG_AI_A_E_CONTRAST",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Micro-skill override options are only available for lesson submission spelling suggestions.",
  );
  assert.equal(outcome.recordCalls.length, 0);
}

async function testAcceptedCanonicalSuggestionStillAllowed() {
  const outcome = await runAction(
    {},
    buildLessonOverrideFormData({
      decision: "accepted",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Parent verification recorded as accepted.",
  );
  assert.equal(outcome.recordCalls.length, 1);
  assert.equal(outcome.recordCalls[0]?.decision, "accepted");
}

async function testAcceptedUnresolvedSuggestionStillRejected() {
  const outcome = await runAction(
    {
      writingIssueSuggestions: [
        {
          id: "suggestion-1",
          parent_user_id: "parent-1",
          task_submission_id: "submission-1",
          writing_sample_id: "sample-1",
          misspelling_instance_id: "misspelling-1",
          suggestion_status: "pending",
          suggested_replacement: "taste",
          suggested_micro_skill_key: "unknown",
          notes: null,
          metadata: null,
        },
      ],
      canonicalMappingMicroSkillKey: null,
    },
    buildLessonOverrideFormData({
      decision: "accepted",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Accepted verification is only available when existing shared suggestion truth already carries a canonical micro-skill.",
  );
  assert.equal(outcome.recordCalls.length, 0);
}

async function main() {
  await testValidOverrideSaveSucceeds();
  await testValidOverrideSaveSucceedsWithCanonicalFallbackAnchor();
  await testOutOfBoundsCatalogKeyRejected();
  await testNonCatalogKeyRejected();
  await testTemplateOverrideRejected();
  await testManualWritingSampleOverrideRejected();
  await testAcceptedCanonicalSuggestionStillAllowed();
  await testAcceptedUnresolvedSuggestionStillRejected();

  console.log("writing-engine-review-work-override-provider-behavior-regression: ok");
}

void main();
