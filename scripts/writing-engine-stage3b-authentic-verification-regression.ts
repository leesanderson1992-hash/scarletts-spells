import assert from "node:assert/strict";

import type { ParentVerificationRepository } from "../lib/writing-engine/core/verification";
import { analyzeStage3aAuthenticSubmissionSpelling } from "../lib/writing-engine/spelling/stage3a-authentic-submission-analysis";
import {
  persistAuthenticSubmissionVerification,
  verifyAuthenticSubmissionHypothesis,
} from "../lib/writing-engine/spelling/stage3b-authentic-submission-verification";
import type { WritingEngineStage1d1CatalogEntry } from "../lib/writing-engine/types";

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage1d1CatalogEntry>,
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey: "D4_PG_FINAL_E_DROP",
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_SUFFIXES",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    displayName: "Drop final e before suffixes",
    allowedTemplateKeys: ["T03"],
    metadata: {
      starter_word_bank: [
        { word: "taste", difficulty: "easy" },
        { word: "make", difficulty: "easy" },
        { word: "bake", difficulty: "medium" },
      ],
      example_words: ["taste", "tasting"],
      teaching_point: "Keep the base word clear before adding the suffix.",
    },
    ...overrides,
  };
}

function buildAuthenticWritingHypothesis() {
  const result = analyzeStage3aAuthenticSubmissionSpelling({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "I tast cake.",
    },
    catalogEntries: [buildCatalogEntry()],
  });

  const hypothesis = result.hypotheses.find(
    (candidate) => candidate.suggestedReplacement === "taste",
  );

  assert.ok(hypothesis);
  return hypothesis;
}

function createParentVerificationRepository() {
  const inserted: Array<Record<string, unknown>> = [];

  return {
    inserted,
    repository: {
      async insert(record) {
        inserted.push(record);

        return {
          id: "verification-1",
          ...record,
          created_at: "2026-05-12T10:00:00.000Z",
          updated_at: "2026-05-12T10:00:00.000Z",
        };
      },
    } satisfies ParentVerificationRepository,
  };
}

function testAcceptedOutcomesPreserveSuggestionAndProvenance() {
  const hypothesis = buildAuthenticWritingHypothesis();
  const result = verifyAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "accepted",
    note: "Parent agrees this is the right educational signal.",
    nowIso: "2026-05-12T10:00:00.000Z",
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.originalSuggestion, hypothesis.candidateHypothesis);
  assert.equal(result.parentDecision, "accepted");
  assert.equal(
    result.parentVerifiedTruth?.categoryCode,
    hypothesis.candidateHypothesis.suggestedCategoryCode,
  );
  assert.equal(
    result.parentVerifiedTruth?.microSkillKey,
    hypothesis.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.equal(
    result.parentVerifiedTruth?.templateKey,
    hypothesis.candidateHypothesis.suggestedTemplateKey,
  );
  assert.equal(result.verificationRecord.sourceRef.sourceType, "authentic_writing");
  assert.equal(result.verificationRecord.sourceRef.taskSubmissionId, "submission-1");
  assert.equal(result.verificationRecord.sourceRef.writingSampleId, "sample-1");
  assert.deepEqual(result.verificationRecord.metadata.sourceSpan, {
    positionStart: hypothesis.positionStart,
    positionEnd: hypothesis.positionEnd,
  });
  assert.equal(result.verificationRecord.metadata.targetText, "taste");
  assert.equal(result.verificationRecord.metadata.childAttemptText, "tast");
}

function testAcceptedWithOverrideFieldsIsInvalid() {
  const hypothesis = buildAuthenticWritingHypothesis();

  assert.throws(
    () =>
      verifyAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "accepted",
        verifiedTemplateKey: "T08",
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    /accepted authentic-writing verification cannot include verified override fields/i,
  );
}

function testOverriddenRequiresMeaningfulEducationalChange() {
  const hypothesis = buildAuthenticWritingHypothesis();

  assert.throws(
    () =>
      verifyAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "overridden",
        note: "Parent adds context but does not change the educational truth.",
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testOverriddenOutcomesPreserveOriginalSuggestionAndVerifiedTruth() {
  const hypothesis = buildAuthenticWritingHypothesis();
  const result = verifyAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "overridden",
    verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
    verifiedTemplateKey: "T08",
    note: "Parent wants a broader contrast lesson first.",
    nowIso: "2026-05-12T10:00:00.000Z",
  });

  assert.equal(result.parentDecision, "overridden");
  assert.equal(
    result.verificationRecord.suggestion.suggestedMicroSkillKey,
    hypothesis.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.equal(
    result.parentVerifiedTruth?.categoryCode,
    hypothesis.candidateHypothesis.suggestedCategoryCode,
  );
  assert.equal(
    result.parentVerifiedTruth?.microSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(result.parentVerifiedTruth?.templateKey, "T08");
  assert.equal(result.verifiedOutcome.microSkillKey, "D4_PG_LONG_AI_A_E_CONTRAST");
  assert.equal(result.verifiedOutcome.templateKey, "T08");
}

function testFalsePositiveRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildAuthenticWritingHypothesis();

  assert.throws(
    () =>
      verifyAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "false_positive",
        verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    /false_positive authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "false_positive",
    note: "The child wrote a valid variant in context.",
    nowIso: "2026-05-12T10:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

function testNotALearningIssueRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildAuthenticWritingHypothesis();

  assert.throws(
    () =>
      verifyAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "not_a_learning_issue",
        verifiedCategoryCode: "Pattern/rule",
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    /not_a_learning_issue authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "not_a_learning_issue",
    note: "No follow-up lesson should be created from this signal.",
    nowIso: "2026-05-12T10:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

async function testPersistenceUsesOnlyParentVerificationRepository() {
  const hypothesis = buildAuthenticWritingHypothesis();
  const { inserted, repository } = createParentVerificationRepository();

  const result = await persistAuthenticSubmissionVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision: "accepted",
      nowIso: "2026-05-12T10:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);

  const [record] = inserted;
  assert.equal(record.domain_module, "spelling");
  assert.equal(record.source_type, "authentic_writing");
  assert.equal(record.task_submission_id, "submission-1");
  assert.equal(record.writing_sample_id, "sample-1");
  assert.equal(record.suggested_category_code, hypothesis.candidateHypothesis.suggestedCategoryCode);
  assert.equal(
    record.suggested_micro_skill_key,
    hypothesis.candidateHypothesis.suggestedMicroSkillKey,
  );
  assert.ok(result.verificationRecord.sourceRef.metadata);
  assert.ok(hypothesis.sourceRef.metadata);
  assert.equal(
    result.verificationRecord.sourceRef.metadata.targetText,
    hypothesis.sourceRef.metadata.targetText,
  );
  assert.equal(
    result.verificationRecord.sourceRef.metadata.childAttemptText,
    hypothesis.sourceRef.metadata.childAttemptText,
  );
}

async function main() {
  testAcceptedOutcomesPreserveSuggestionAndProvenance();
  testAcceptedWithOverrideFieldsIsInvalid();
  testOverriddenRequiresMeaningfulEducationalChange();
  testOverriddenOutcomesPreserveOriginalSuggestionAndVerifiedTruth();
  testFalsePositiveRejectsOverrideFieldsAndAvoidsMasteryIntent();
  testNotALearningIssueRejectsOverrideFieldsAndAvoidsMasteryIntent();
  await testPersistenceUsesOnlyParentVerificationRepository();
  console.log("writing-engine-stage3b-authentic-verification-regression: ok");
}

void main();
