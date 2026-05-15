import assert from "node:assert/strict";

import type { ParentVerificationRepository } from "../lib/writing-engine/core/verification";
import { analyzeStage5aAuthenticSubmissionSentenceBoundaries } from "../lib/writing-engine/sentence-boundaries/stage5a-authentic-submission-analysis";
import {
  persistSentenceBoundaryAuthenticSubmissionVerification,
  verifySentenceBoundaryAuthenticSubmissionHypothesis,
} from "../lib/writing-engine/sentence-boundaries/stage5b-authentic-submission-verification";

function buildSentenceBoundaryHypothesis() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-5b-1",
      childId: "child-5b-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-5b-1",
      taskSubmissionId: "submission-5b-1",
      sampleText: "hello world",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.rule === "sentence_start_not_capitalized",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a sentence-boundary candidate hypothesis.");
  }

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
          id: "verification-5b-1",
          ...record,
          created_at: "2026-05-13T12:00:00.000Z",
          updated_at: "2026-05-13T12:00:00.000Z",
        };
      },
    } satisfies ParentVerificationRepository,
  };
}

function testAcceptedOutcomesPreserveSuggestionAndProvenance() {
  const hypothesis = buildSentenceBoundaryHypothesis();
  const result = verifySentenceBoundaryAuthenticSubmissionHypothesis({
    childId: "child-5b-1",
    parentUserId: "parent-5b-1",
    hypothesis,
    decision: "accepted",
    note: "Parent agrees this is a sentence-boundary learning signal.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.originalSuggestion, hypothesis.candidateHypothesis);
  assert.equal(result.parentDecision, "accepted");
  assert.equal(result.parentVerifiedTruth?.categoryCode, null);
  assert.equal(result.parentVerifiedTruth?.microSkillKey, null);
  assert.equal(result.parentVerifiedTruth?.templateKey, null);
  assert.equal(result.verificationRecord.sourceRef.sourceType, "authentic_writing");
  assert.equal(result.verificationRecord.sourceRef.taskSubmissionId, "submission-5b-1");
  assert.equal(result.verificationRecord.sourceRef.writingSampleId, "sample-5b-1");
  assert.deepEqual(result.verificationRecord.metadata.sourceSpan, {
    positionStart: hypothesis.positionStart,
    positionEnd: hypothesis.positionEnd,
  });
  assert.equal(result.verificationRecord.metadata.targetText, "H");
  assert.equal(result.verificationRecord.metadata.childAttemptText, "h");
  assert.equal(
    result.verificationRecord.metadata.sentence_boundary_rule,
    "sentence_start_not_capitalized",
  );
}

function testAcceptedWithOverrideFieldsIsInvalid() {
  const hypothesis = buildSentenceBoundaryHypothesis();

  assert.throws(
    () =>
      verifySentenceBoundaryAuthenticSubmissionHypothesis({
        childId: "child-5b-1",
        parentUserId: "parent-5b-1",
        hypothesis,
        decision: "accepted",
        verifiedTemplateKey: "sentence-boundary-template",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /accepted sentence-boundary authentic-writing verification cannot include verified override fields/i,
  );
}

function testOverriddenRequiresMeaningfulEducationalChange() {
  const hypothesis = buildSentenceBoundaryHypothesis();

  assert.throws(
    () =>
      verifySentenceBoundaryAuthenticSubmissionHypothesis({
        childId: "child-5b-1",
        parentUserId: "parent-5b-1",
        hypothesis,
        decision: "overridden",
        note: "Parent adds context only.",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testOverriddenOutcomesPreserveOriginalSuggestionAndVerifiedTruth() {
  const hypothesis = buildSentenceBoundaryHypothesis();
  const result = verifySentenceBoundaryAuthenticSubmissionHypothesis({
    childId: "child-5b-1",
    parentUserId: "parent-5b-1",
    hypothesis,
    decision: "overridden",
    verifiedCategoryCode: "sentence_start_capitalization",
    verifiedMicroSkillKey: "SENTENCE_BOUNDARY_START_CAP",
    verifiedTemplateKey: "sentence-boundary-template",
    note: "Parent wants explicit sentence-start capitalization tracking.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentDecision, "overridden");
  assert.equal(result.verificationRecord.suggestion.suggestedCategoryCode, null);
  assert.equal(result.verificationRecord.suggestion.suggestedMicroSkillKey, null);
  assert.equal(
    result.parentVerifiedTruth?.categoryCode,
    "sentence_start_capitalization",
  );
  assert.equal(
    result.parentVerifiedTruth?.microSkillKey,
    "SENTENCE_BOUNDARY_START_CAP",
  );
  assert.equal(
    result.parentVerifiedTruth?.templateKey,
    "sentence-boundary-template",
  );
  assert.equal(result.verifiedOutcome.categoryCode, "sentence_start_capitalization");
  assert.equal(
    result.verifiedOutcome.microSkillKey,
    "SENTENCE_BOUNDARY_START_CAP",
  );
  assert.equal(result.verifiedOutcome.templateKey, "sentence-boundary-template");
}

function testFalsePositiveRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildSentenceBoundaryHypothesis();

  assert.throws(
    () =>
      verifySentenceBoundaryAuthenticSubmissionHypothesis({
        childId: "child-5b-1",
        parentUserId: "parent-5b-1",
        hypothesis,
        decision: "false_positive",
        verifiedMicroSkillKey: "SENTENCE_BOUNDARY_START_CAP",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /false_positive sentence-boundary authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifySentenceBoundaryAuthenticSubmissionHypothesis({
    childId: "child-5b-1",
    parentUserId: "parent-5b-1",
    hypothesis,
    decision: "false_positive",
    note: "This lower-case start is intentional in the quoted fragment.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

function testNotALearningIssueRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildSentenceBoundaryHypothesis();

  assert.throws(
    () =>
      verifySentenceBoundaryAuthenticSubmissionHypothesis({
        childId: "child-5b-1",
        parentUserId: "parent-5b-1",
        hypothesis,
        decision: "not_a_learning_issue",
        verifiedCategoryCode: "sentence_boundary",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /not_a_learning_issue sentence-boundary authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifySentenceBoundaryAuthenticSubmissionHypothesis({
    childId: "child-5b-1",
    parentUserId: "parent-5b-1",
    hypothesis,
    decision: "not_a_learning_issue",
    note: "No follow-up sentence-boundary lesson is needed here.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

async function testPersistenceUsesOnlyParentVerificationRepository() {
  const hypothesis = buildSentenceBoundaryHypothesis();
  const { inserted, repository } = createParentVerificationRepository();

  const result = await persistSentenceBoundaryAuthenticSubmissionVerification({
    verificationInput: {
      childId: "child-5b-1",
      parentUserId: "parent-5b-1",
      hypothesis,
      decision: "accepted",
      nowIso: "2026-05-13T12:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);

  const [record] = inserted;
  assert.equal(record.domain_module, "sentence_boundaries");
  assert.equal(record.source_type, "authentic_writing");
  assert.equal(record.task_submission_id, "submission-5b-1");
  assert.equal(record.writing_sample_id, "sample-5b-1");
  assert.equal(record.suggested_category_code, null);
  assert.equal(record.suggested_micro_skill_key, null);
  assert.equal(record.suggested_template_key, null);
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
  console.log("writing-engine-stage5b-sentence-boundary-verification-regression: ok");
}

void main();
