import assert from "node:assert/strict";

import type { ParentVerificationRepository } from "../lib/writing-engine/core/verification";
import { analyzeStage4aAuthenticSubmissionPunctuation } from "../lib/writing-engine/punctuation/stage4a-authentic-submission-analysis";
import {
  persistPunctuationAuthenticSubmissionVerification,
  verifyPunctuationAuthenticSubmissionHypothesis,
} from "../lib/writing-engine/punctuation/stage4b-authentic-submission-verification";

function buildPunctuationHypothesis() {
  const result = analyzeStage4aAuthenticSubmissionPunctuation({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "Hello !",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.rule === "space_before_punctuation",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a punctuation candidate hypothesis.");
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
          id: "verification-1",
          ...record,
          created_at: "2026-05-13T10:00:00.000Z",
          updated_at: "2026-05-13T10:00:00.000Z",
        };
      },
    } satisfies ParentVerificationRepository,
  };
}

function testAcceptedOutcomesPreserveSuggestionAndProvenance() {
  const hypothesis = buildPunctuationHypothesis();
  const result = verifyPunctuationAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "accepted",
    note: "Parent agrees this is a real punctuation learning signal.",
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.originalSuggestion, hypothesis.candidateHypothesis);
  assert.equal(result.parentDecision, "accepted");
  assert.equal(result.parentVerifiedTruth?.categoryCode, null);
  assert.equal(result.parentVerifiedTruth?.microSkillKey, null);
  assert.equal(result.parentVerifiedTruth?.templateKey, null);
  assert.equal(result.verificationRecord.sourceRef.sourceType, "authentic_writing");
  assert.equal(result.verificationRecord.sourceRef.taskSubmissionId, "submission-1");
  assert.equal(result.verificationRecord.sourceRef.writingSampleId, "sample-1");
  assert.deepEqual(result.verificationRecord.metadata.sourceSpan, {
    positionStart: hypothesis.positionStart,
    positionEnd: hypothesis.positionEnd,
  });
  assert.equal(result.verificationRecord.metadata.targetText, "!");
  assert.equal(result.verificationRecord.metadata.childAttemptText, " !");
  assert.equal(result.verificationRecord.metadata.punctuation_rule, "space_before_punctuation");
}

function testAcceptedWithOverrideFieldsIsInvalid() {
  const hypothesis = buildPunctuationHypothesis();

  assert.throws(
    () =>
      verifyPunctuationAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "accepted",
        verifiedTemplateKey: "punctuation-fix",
        nowIso: "2026-05-13T10:00:00.000Z",
      }),
    /accepted punctuation authentic-writing verification cannot include verified override fields/i,
  );
}

function testOverriddenRequiresMeaningfulEducationalChange() {
  const hypothesis = buildPunctuationHypothesis();

  assert.throws(
    () =>
      verifyPunctuationAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "overridden",
        note: "Parent adds context only.",
        nowIso: "2026-05-13T10:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testOverriddenOutcomesPreserveOriginalSuggestionAndVerifiedTruth() {
  const hypothesis = buildPunctuationHypothesis();
  const result = verifyPunctuationAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "overridden",
    verifiedCategoryCode: "missing_terminal_punctuation",
    verifiedMicroSkillKey: "PUNC_END_STOP",
    verifiedTemplateKey: "punctuation-fix",
    note: "Parent wants the end-stop skill tracked explicitly.",
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.parentDecision, "overridden");
  assert.equal(result.verificationRecord.suggestion.suggestedCategoryCode, null);
  assert.equal(result.verificationRecord.suggestion.suggestedMicroSkillKey, null);
  assert.equal(result.parentVerifiedTruth?.categoryCode, "missing_terminal_punctuation");
  assert.equal(result.parentVerifiedTruth?.microSkillKey, "PUNC_END_STOP");
  assert.equal(result.parentVerifiedTruth?.templateKey, "punctuation-fix");
  assert.equal(result.verifiedOutcome.categoryCode, "missing_terminal_punctuation");
  assert.equal(result.verifiedOutcome.microSkillKey, "PUNC_END_STOP");
  assert.equal(result.verifiedOutcome.templateKey, "punctuation-fix");
}

function testFalsePositiveRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildPunctuationHypothesis();

  assert.throws(
    () =>
      verifyPunctuationAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "false_positive",
        verifiedMicroSkillKey: "PUNC_END_STOP",
        nowIso: "2026-05-13T10:00:00.000Z",
      }),
    /false_positive punctuation authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyPunctuationAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "false_positive",
    note: "This spacing is intentional in the quoted material.",
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

function testNotALearningIssueRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildPunctuationHypothesis();

  assert.throws(
    () =>
      verifyPunctuationAuthenticSubmissionHypothesis({
        childId: "child-1",
        parentUserId: "parent-1",
        hypothesis,
        decision: "not_a_learning_issue",
        verifiedCategoryCode: "punctuation",
        nowIso: "2026-05-13T10:00:00.000Z",
      }),
    /not_a_learning_issue punctuation authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyPunctuationAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision: "not_a_learning_issue",
    note: "No follow-up punctuation lesson is needed here.",
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

async function testPersistenceUsesOnlyParentVerificationRepository() {
  const hypothesis = buildPunctuationHypothesis();
  const { inserted, repository } = createParentVerificationRepository();

  const result = await persistPunctuationAuthenticSubmissionVerification({
    verificationInput: {
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision: "accepted",
      nowIso: "2026-05-13T10:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);

  const [record] = inserted;
  assert.equal(record.domain_module, "punctuation");
  assert.equal(record.source_type, "authentic_writing");
  assert.equal(record.task_submission_id, "submission-1");
  assert.equal(record.writing_sample_id, "sample-1");
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
  console.log("writing-engine-stage4b-punctuation-verification-regression: ok");
}

void main();
