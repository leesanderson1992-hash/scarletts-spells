import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadTsModule } from "./review-work-vm-loader";

type RedirectSignal = {
  url: string;
};

type ParentVerificationCall = {
  childId: string;
  parentUserId: string;
  decision: string;
  verifiedMicroSkillKey: string | null;
  note: string | null;
  target: {
    sourceRef: {
      sourceEntityId: string;
      taskSubmissionId: string | null;
      writingSampleId: string | null;
    };
    suggestedMicroSkillKey: string | null;
  };
};

type CandidateMappingInsert = {
  parentUserId: string;
  childId: string;
  parentVerificationId: string;
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  sourceSuggestionId: string | null;
  sourceMisspellingInstanceId: string | null;
  sourceProvenance:
    | "lesson_submission_existing_output"
    | "lesson_submission_parent_added_missed_word";
  reviewedEventSourceEntityId: string;
  originalChildSpelling: string | null;
  originalCorrectSpelling: string | null;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  metadata?: Record<string, unknown>;
};

type HarnessState = {
  authUserId?: string | null;
  submission?: {
    id: string;
    task_id: string;
    course_id: string;
    child_id: string;
    submission_text: string;
    submitted_at: string;
    parent_user_id?: string;
  } | null;
  linkedWritingSample?: {
    id: string;
    child_id: string;
    parent_user_id?: string;
    task_submission_id?: string | null;
    sample_text?: string | null;
  } | null;
  misspelling?: {
    id: string;
    writing_sample_id?: string;
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
    source_entity_id: string;
    decision: string;
    suggested_micro_skill_key?: string | null;
    verified_micro_skill_key?: string | null;
  }>;
  catalogEntry?: {
    microSkillKey: string;
    masteryDomainKey: string;
    isAssignable: boolean;
    isActive: boolean;
  } | null;
  canonicalMappingMicroSkillKey?: string | null;
  existingCandidateMapping?: Record<string, unknown> | null;
};

type HarnessResult = {
  redirects: RedirectSignal[];
  verificationCalls: ParentVerificationCall[];
  candidateInserts: CandidateMappingInsert[];
  suggestionUpdateCalls: Array<Record<string, unknown>>;
};

type AddMissedWordInsert = {
  writing_sample_id: string;
  child_id: string;
  parent_user_id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string;
  error_type: string;
  secondary_error_type: string | null;
  confidence_score: number;
  is_false_positive: boolean;
  is_parent_overridden: boolean;
  word_family_id: string | null;
  context_text: string;
  position_start: number | null;
  position_end: number | null;
  notes: string;
};

type AddMissedWordHarnessResult = {
  redirects: RedirectSignal[];
  insertedMisspelledWords: AddMissedWordInsert[];
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
    private readonly result: HarnessResult,
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
    this.pendingUpdate = values;
    return this;
  }

  insert() {
    throw new Error(`Unexpected insert against ${this.table} in candidate capture harness.`);
  }

  async maybeSingle() {
    return { data: this.resolveSingle() };
  }

  async single() {
    return { data: this.resolveSingle(), error: null };
  }

  then(resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) {
    try {
      if (this.pendingUpdate) {
        this.applyPendingUpdate();
      }

      return Promise.resolve(resolve({ error: null }));
    } catch (error) {
      if (reject) {
        return Promise.resolve(reject(error));
      }

      return Promise.reject(error);
    }
  }

  private applyPendingUpdate() {
    if (this.table !== "writing_issue_suggestions" || !this.pendingUpdate) {
      return;
    }

    this.result.suggestionUpdateCalls.push(this.pendingUpdate);
    this.state.writingIssueSuggestions = this.state.writingIssueSuggestions.map((row) =>
      this.matches(row)
        ? {
            ...row,
            ...this.pendingUpdate,
          }
        : row,
    );
  }

  private resolveSingle() {
    const rows = this.resolveRows();
    const first = rows[0] ?? null;

    if (first && this.pendingUpdate && this.table === "writing_issue_suggestions") {
      return {
        ...first,
        ...this.pendingUpdate,
      };
    }

    return first;
  }

  private resolveRows() {
    switch (this.table) {
      case "task_submissions":
        return this.filterRows(this.state.submission ? [this.state.submission] : []);
      case "writing_samples":
        return this.filterRows(
          this.state.linkedWritingSample ? [this.state.linkedWritingSample] : [],
        );
      case "misspelling_instances":
        return this.filterRows(this.state.misspelling ? [this.state.misspelling] : []);
      case "writing_issue_suggestions":
        return this.filterRows(this.state.writingIssueSuggestions);
      case "parent_verifications":
        return this.filterRows(this.state.parentVerificationRows);
      default:
        throw new Error(`Unexpected table lookup in candidate capture harness: ${this.table}`);
    }
  }

  private filterRows(rows: Array<Record<string, unknown>>) {
    return rows.filter((row) => this.matches(row));
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every(({ field, value }) => row[field] === value);
  }
}

function createHarnessState(overrides: HarnessState = {}): Required<HarnessState> {
  return {
    authUserId: "parent-1",
    submission: {
      id: "submission-1",
      task_id: "task-1",
      course_id: "course-1",
      child_id: "child-1",
      submission_text: "I natral wrote this.",
      submitted_at: "2026-05-18T10:00:00.000Z",
      parent_user_id: "parent-1",
    },
    linkedWritingSample: {
      id: "sample-1",
      child_id: "child-1",
      parent_user_id: "parent-1",
      task_submission_id: "submission-1",
      sample_text: "I natral wrote this.",
    },
    misspelling: {
      id: "misspelling-1",
      writing_sample_id: "sample-1",
      misspelled_word: "natral",
      corrected_word: "natural",
      suggested_word: "natural",
      error_type: "Pattern/rule",
      parent_user_id: "parent-1",
      notes: null,
      context_text: "natral",
      position_start: 2,
      position_end: 8,
    },
    writingIssueSuggestions: [
      {
        id: "suggestion-1",
        parent_user_id: "parent-1",
        task_submission_id: "submission-1",
        writing_sample_id: "sample-1",
        misspelling_instance_id: "misspelling-1",
        suggestion_status: "pending",
        suggested_replacement: "natural",
        suggested_micro_skill_key: "unknown",
        notes: null,
        metadata: null,
      },
    ],
    parentVerificationRows: [],
    catalogEntry: {
      microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
      masteryDomainKey: "D4",
      isAssignable: true,
      isActive: true,
    },
    canonicalMappingMicroSkillKey: null,
    existingCandidateMapping: null,
    ...overrides,
  };
}

function loadCaptureSubmissionSpellingCandidateMapping(state: Required<HarnessState>) {
  const workspaceRoot = process.cwd();
  const actionSourcePath = path.join(workspaceRoot, "app/courses/review/actions.ts");

  const result: HarnessResult = {
    redirects: [],
    verificationCalls: [],
    candidateInserts: [],
    suggestionUpdateCalls: [],
  };

  const stubModules: Record<string, unknown> = {
    "next/cache": {
      revalidatePath() {},
    },
    "next/navigation": {
      redirect(url: string) {
        const signal = createRedirectError(url);
        result.redirects.push({ url });
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
            return new FakeQueryBuilder(table, state, result);
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
          async findScopedPromotedByMisspelling() {
            return [];
          },
          async findByParentVerificationId() {
            return state.existingCandidateMapping;
          },
          async insertPending(input: CandidateMappingInsert) {
            result.candidateInserts.push(input);
            return {
              id: "candidate-1",
              parent_verification_id: input.parentVerificationId,
            };
          },
        };
      },
    },
    "@/lib/writing-engine/review/stage7d-parent-verification": {
      buildStage7dReviewWorkVerificationTarget(input: {
        taskSubmissionId: string | null;
        writingSampleId: string | null;
        observedText: string;
        suggestedReplacement: string | null;
        suggestedCategoryCode: string | null;
        suggestedMicroSkillKey: string | null;
      }) {
        return {
          sourceRef: {
            sourceEntityId: `source::${input.observedText.toLowerCase()}::${
              (input.suggestedReplacement ?? "none").toLowerCase()
            }`,
            taskSubmissionId: input.taskSubmissionId,
            writingSampleId: input.writingSampleId,
          },
          observedText: input.observedText,
          suggestedReplacement: input.suggestedReplacement,
          suggestedCategoryCode: input.suggestedCategoryCode,
          suggestedMicroSkillKey: input.suggestedMicroSkillKey,
        };
      },
      async recordStage7dParentVerification() {},
      async recordStage7dParentVerificationWithoutPromotion(input: ParentVerificationCall) {
        result.verificationCalls.push(input);
        return {
          verificationRecord: {
            id: "verification-1",
          },
        };
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
      isParentAuthoredMisspellingRow(input: { notes?: string | null }) {
        if (!input.notes) {
          return false;
        }

        try {
          const parsed = JSON.parse(input.notes) as {
            parentAuthoredMissedWord?: boolean;
          };

          return parsed.parentAuthoredMissedWord === true;
        } catch {
          return false;
        }
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
    captureSubmissionSpellingCandidateMapping: (formData: FormData) => Promise<void>;
  }>(actionSourcePath, { stubModules });

  return {
    action: module.captureSubmissionSpellingCandidateMapping,
    result,
  };
}

async function runAction(stateOverrides: HarnessState, formData: FormData) {
  const state = createHarnessState(stateOverrides);
  const { action, result } = loadCaptureSubmissionSpellingCandidateMapping(state);

  try {
    await action(formData);
    assert.fail("Expected the candidate capture action to redirect.");
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
  }

  const redirect = result.redirects.at(-1);
  assert.ok(redirect, "Expected a redirect result from the candidate capture action.");

  return {
    redirect: redirect.url,
    verificationCalls: result.verificationCalls,
    candidateInserts: result.candidateInserts,
    suggestionUpdateCalls: result.suggestionUpdateCalls,
  };
}

class FakeAddMissedWordQueryBuilder {
  private readonly filters: Array<{ field: string; value: unknown }> = [];
  private pendingInsert: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly state: Required<HarnessState>,
    private readonly result: AddMissedWordHarnessResult,
  ) {}

  select(_columns: string) {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.resolveSingle() });
  }

  insert(value: Record<string, unknown>) {
    this.pendingInsert = value;
    return this;
  }

  then(resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) {
    try {
      if (this.pendingInsert) {
        this.applyInsert();
      }

      return Promise.resolve(resolve({ error: null }));
    } catch (error) {
      if (reject) {
        return Promise.resolve(reject(error));
      }

      return Promise.reject(error);
    }
  }

  private applyInsert() {
    if (this.table !== "misspelling_instances" || !this.pendingInsert) {
      return;
    }

    this.result.insertedMisspelledWords.push(this.pendingInsert as AddMissedWordInsert);
  }

  private resolveSingle() {
    const rows = this.resolveRows();
    return rows[0] ?? null;
  }

  private resolveRows() {
    switch (this.table) {
      case "task_submissions":
        return this.filterRows(this.state.submission ? [this.state.submission] : []);
      case "writing_samples":
        return this.filterRows(
          this.state.linkedWritingSample ? [this.state.linkedWritingSample] : [],
        );
      case "misspelling_instances":
        return this.filterRows(this.state.misspelling ? [this.state.misspelling] : []);
      default:
        throw new Error(`Unexpected table lookup in add missed word harness: ${this.table}`);
    }
  }

  private filterRows(rows: Array<Record<string, unknown>>) {
    return rows.filter((row) => this.matches(row));
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every(({ field, value }) => row[field] === value);
  }
}

function loadAddMissedWordToSubmissionReview(state: Required<HarnessState>) {
  const workspaceRoot = process.cwd();
  const actionSourcePath = path.join(workspaceRoot, "app/courses/review/actions.ts");

  const result: AddMissedWordHarnessResult = {
    redirects: [],
    insertedMisspelledWords: [],
  };

  const stubModules: Record<string, unknown> = {
    "next/cache": {
      revalidatePath() {},
    },
    "next/navigation": {
      redirect(url: string) {
        const signal = createRedirectError(url);
        result.redirects.push({ url });
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
        return "tricky_whole_word_error";
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
            return new FakeAddMissedWordQueryBuilder(table, state, result);
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
          async findScopedPromotedByMisspelling() {
            return [];
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
        return null;
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
      stringifyAnalysisExtraMetadata(input: Record<string, unknown>) {
        return JSON.stringify(input);
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

  const module = loadTsModule<{
    addMissedWordToSubmissionReview: (formData: FormData) => Promise<void>;
  }>(actionSourcePath, { stubModules });

  return {
    action: module.addMissedWordToSubmissionReview,
    result,
  };
}

async function runAddMissedWordAction(
  stateOverrides: HarnessState,
  formData: FormData,
) {
  const state = createHarnessState(stateOverrides);
  const { action, result } = loadAddMissedWordToSubmissionReview(state);

  try {
    await action(formData);
    assert.fail("Expected addMissedWordToSubmissionReview to redirect.");
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
  }

  const redirect = result.redirects.at(-1);
  assert.ok(redirect, "Expected a redirect result from addMissedWordToSubmissionReview.");

  return {
    redirect: redirect.url,
    insertedMisspelledWords: result.insertedMisspelledWords,
  };
}

function buildFormData(overrides: Record<string, string | undefined> = {}) {
  const formData = new FormData();
  formData.set("submission_id", "submission-1");
  formData.set("redirect_path", "/courses/review/submission-1");
  formData.set("misspelling_instance_id", "misspelling-1");
  formData.set("micro_skill_key", "D4_PG_OPEN_AND_CLOSED_SYLLABLES");

  Object.entries(overrides).forEach(([key, value]) => {
    if (value !== undefined) {
      formData.set(key, value);
    }
  });

  return formData;
}

function buildAddMissedWordFormData(
  overrides: Record<string, string | undefined> = {},
) {
  const formData = new FormData();
  formData.set("submission_id", "submission-1");
  formData.set("redirect_path", "/courses/review/submission-1");
  formData.set("misspelled_word", "natral");
  formData.set("corrected_word", "natural");

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

async function testUnmappedLessonSubmissionRowCreatesPendingCandidateMapping() {
  const outcome = await runAction({}, buildFormData());

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Saved as verified evidence. Candidate mapping captured. Not used for future suggestions until promoted.",
  );
  assert.equal(outcome.verificationCalls.length, 1);
  assert.equal(outcome.verificationCalls[0]?.decision, "overridden");
  assert.equal(
    outcome.verificationCalls[0]?.verifiedMicroSkillKey,
    "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
  );
  assert.equal(outcome.candidateInserts.length, 1);
  assert.equal(
    JSON.stringify(outcome.candidateInserts[0]),
    JSON.stringify({
      parentUserId: "parent-1",
      childId: "child-1",
      parentVerificationId: "verification-1",
      taskSubmissionId: "submission-1",
      writingSampleId: "sample-1",
      sourceSuggestionId: "suggestion-1",
      sourceMisspellingInstanceId: "misspelling-1",
      sourceProvenance: "lesson_submission_existing_output",
      reviewedEventSourceEntityId: "source::natral::natural",
      originalChildSpelling: "natral",
      originalCorrectSpelling: "natural",
      misspellingNormalized: "natral",
      correctSpellingNormalized: "natural",
      microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
      metadata: {
        source_misspelling_instance_id: "misspelling-1",
        source_suggestion_id: "suggestion-1",
        candidate_status: "pending_parent_promotion",
        promotion_scope: "parent_local",
      },
    }),
  );
  assert.equal(outcome.suggestionUpdateCalls.length, 1);
  assert.equal(outcome.suggestionUpdateCalls[0]?.suggestion_status, "accepted");
}

async function testParentAddedMissedWordCreatesPendingCandidateMapping() {
  const outcome = await runAction(
    {
      misspelling: {
        id: "misspelling-1",
        writing_sample_id: "sample-1",
        misspelled_word: "natral",
        corrected_word: "natural",
        suggested_word: "natural",
        error_type: "Pattern/rule",
        parent_user_id: "parent-1",
        notes: JSON.stringify({ parentAuthoredMissedWord: true }),
        context_text: "natral",
        position_start: 2,
        position_end: 8,
      },
      writingIssueSuggestions: [],
    },
    buildFormData(),
  );

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Saved as verified evidence. Candidate mapping captured. Not used for future suggestions until promoted.",
  );
  assert.equal(outcome.verificationCalls.length, 1);
  assert.equal(outcome.candidateInserts.length, 1);
  assert.equal(
    outcome.candidateInserts[0]?.sourceProvenance,
    "lesson_submission_parent_added_missed_word",
  );
  assert.equal(outcome.candidateInserts[0]?.sourceSuggestionId, null);
  assert.equal(outcome.suggestionUpdateCalls.length, 0);
}

async function testFreeTextMicroSkillKeyRejected() {
  const outcome = await runAction(
    {
      catalogEntry: null,
    },
    buildFormData({
      micro_skill_key: "NOT_A_REAL_MICRO_SKILL",
    }),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Only catalog-backed micro-skills can be used for candidate capture.",
  );
  assert.equal(outcome.verificationCalls.length, 0);
  assert.equal(outcome.candidateInserts.length, 0);
}

async function testInactiveMicroSkillKeyRejected() {
  const outcome = await runAction(
    {
      catalogEntry: {
        microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
        masteryDomainKey: "D4",
        isAssignable: true,
        isActive: false,
      },
    },
    buildFormData(),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Inactive micro-skills cannot be used for candidate capture.",
  );
  assert.equal(outcome.verificationCalls.length, 0);
}

async function testNonAssignableOrOutOfScopeMicroSkillRejected() {
  const nonAssignableOutcome = await runAction(
    {
      catalogEntry: {
        microSkillKey: "D4_PG_OPEN_AND_CLOSED_SYLLABLES",
        masteryDomainKey: "D4",
        isAssignable: false,
        isActive: true,
      },
    },
    buildFormData(),
  );

  assertRedirectMessage(
    nonAssignableOutcome.redirect,
    "error",
    "Non-assignable micro-skills cannot be used for candidate capture.",
  );
  assert.equal(nonAssignableOutcome.verificationCalls.length, 0);

  const outOfScopeOutcome = await runAction(
    {
      catalogEntry: {
        microSkillKey: "D9_NOT_SPELLING",
        masteryDomainKey: "D9",
        isAssignable: true,
        isActive: true,
      },
    },
    buildFormData({
      micro_skill_key: "D9_NOT_SPELLING",
    }),
  );

  assertRedirectMessage(
    outOfScopeOutcome.redirect,
    "error",
    "That micro-skill is outside the bounded spelling scope for candidate capture.",
  );
  assert.equal(outOfScopeOutcome.verificationCalls.length, 0);
}

async function testMissingNormalizedSpellingsRejected() {
  const outcome = await runAction(
    {
      misspelling: {
        id: "misspelling-1",
        writing_sample_id: "sample-1",
        misspelled_word: "   ",
        corrected_word: "   ",
        suggested_word: "   ",
        error_type: "Pattern/rule",
        parent_user_id: "parent-1",
        notes: null,
        context_text: "   ",
        position_start: 2,
        position_end: 5,
      },
    },
    buildFormData(),
  );

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Candidate capture requires both the child spelling and the correct spelling.",
  );
  assert.equal(outcome.verificationCalls.length, 0);
}

async function testAddMissedWordPersistsParentAddedReviewInput() {
  const outcome = await runAddMissedWordAction(
    {
      misspelling: null,
      linkedWritingSample: {
        id: "sample-1",
        child_id: "child-1",
        parent_user_id: "parent-1",
        task_submission_id: "submission-1",
        sample_text: "I natral wrote this.",
      },
    },
    buildAddMissedWordFormData(),
  );

  assertRedirectMessage(
    outcome.redirect,
    "saved",
    "Missed word added to the review list below.",
  );
  assert.equal(outcome.insertedMisspelledWords.length, 1);
  assert.equal(
    JSON.stringify(outcome.insertedMisspelledWords[0]),
    JSON.stringify({
      writing_sample_id: "sample-1",
      child_id: "child-1",
      parent_user_id: "parent-1",
      misspelled_word: "natral",
      corrected_word: "natural",
      suggested_word: "natural",
      error_type: "Pattern/rule",
      secondary_error_type: null,
      confidence_score: 1,
      is_false_positive: false,
      is_parent_overridden: false,
      word_family_id: null,
      context_text: "natral",
      position_start: 2,
      position_end: 8,
      notes: JSON.stringify({
        detectedPrimaryCategory: "Pattern/rule",
        parentOverrideCategory: null,
        parentOverrideFamilyId: null,
        parentOverrideDiagnosis: null,
        parentReviewedAt: null,
        parentAuthoredMissedWord: true,
        markedCareless: false,
        detectedErrorPattern: "tricky_whole_word_error",
        selectedWordFamilyId: null,
      }),
    }),
  );
}

async function testAddMissedWordMissingInputsSurfaceVisibleError() {
  const outcome = await runAddMissedWordAction({}, buildAddMissedWordFormData({
    corrected_word: "   ",
  }));

  assertRedirectMessage(
    outcome.redirect,
    "error",
    "Add both the word the child wrote and the correct spelling.",
  );
  assert.equal(outcome.insertedMisspelledWords.length, 0);
}

function testSourceGuardrailsStayIntact() {
  const workspaceRoot = process.cwd();
  const reviewDetailPagePath = path.join(
    workspaceRoot,
    "app/courses/review/[submissionId]/page.tsx",
  );
  const reviewActionsPath = path.join(
    workspaceRoot,
    "app/courses/review/actions.ts",
  );
  const candidateMappingActionsPath = path.join(
    workspaceRoot,
    "app/courses/review/actions/candidate-mapping-actions.ts",
  );
  const lessonSubmissionReviewActionsPath = path.join(
    workspaceRoot,
    "app/courses/review/actions/lesson-submission-review-actions.ts",
  );
  const reviewUtilsPath = path.join(
    workspaceRoot,
    "app/courses/review/review-utils.ts",
  );
  const slice1MappingPath = path.join(
    workspaceRoot,
    "lib/writing-engine/spelling/canonical-submission-spelling-mapping-slice1.ts",
  );

  const pageSource = readFileSync(reviewDetailPagePath, "utf8");
  const actionsSource = readFileSync(reviewActionsPath, "utf8");
  const candidateMappingActionsSource = readFileSync(candidateMappingActionsPath, "utf8");
  const lessonSubmissionReviewActionsSource = readFileSync(
    lessonSubmissionReviewActionsPath,
    "utf8",
  );
  const reviewUtilsSource = readFileSync(reviewUtilsPath, "utf8");
  const slice1MappingSource = readFileSync(slice1MappingPath, "utf8");

  assert.match(
    pageSource,
    /!entry\.actionTarget\.allowsAccepted[\s\S]*props\.model\.sourceType === "lesson_submission"/,
  );
  assert.match(
    pageSource,
    /candidateCaptureMicroSkillProvider=\{\{\s*status: "blocked",\s*reason: "no_options_available"/,
  );
  assert.match(
    pageSource,
    /not be used for[\s\S]*future suggestions until promoted\./i,
  );
  assert.match(
    pageSource,
    /Pending candidate mapping/,
  );
  assert.match(
    pageSource,
    /Saved as verified evidence\./,
  );
  assert.match(
    pageSource,
    /Candidate mapping captured\./,
  );
  assert.match(
    pageSource,
    /This will let future suggestions for this child use this mapping\.|Not used for future suggestions until promoted\./,
  );
  assert.match(
    pageSource,
    /parent_verified_spelling_candidate_mappings/,
  );
  assert.match(
    candidateMappingActionsSource,
    /candidate_status: "pending_parent_promotion"/,
  );
  assert.match(
    candidateMappingActionsSource,
    /promotion_scope: "parent_local"/,
  );
  assert.match(
    candidateMappingActionsSource,
    /"That row already carries canonical suggestion truth\. Use the existing Review Work actions instead\."/,
  );
  assert.match(
    lessonSubmissionReviewActionsSource,
    /"Missed word added to the review list below\."/,
  );
  assert.match(
    reviewUtilsSource,
    /allowsAccepted:[\s\S]*matchedSuggestionMicroSkillKey/,
  );
  assert.doesNotMatch(
    slice1MappingSource,
    /parent_verified_spelling_candidate_mappings/,
  );
}

async function main() {
  await testUnmappedLessonSubmissionRowCreatesPendingCandidateMapping();
  await testParentAddedMissedWordCreatesPendingCandidateMapping();
  await testFreeTextMicroSkillKeyRejected();
  await testInactiveMicroSkillKeyRejected();
  await testNonAssignableOrOutOfScopeMicroSkillRejected();
  await testMissingNormalizedSpellingsRejected();
  await testAddMissedWordPersistsParentAddedReviewInput();
  await testAddMissedWordMissingInputsSurfaceVisibleError();
  testSourceGuardrailsStayIntact();

  console.log("writing-engine-parent-verified-spelling-candidate-capture-regression: ok");
}

void main();
