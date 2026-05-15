import assert from "node:assert/strict";

import type { ParentVerificationRepository } from "../lib/writing-engine/core/verification";
import { analyzeStage6aAuthenticSubmissionGrammarProofreading } from "../lib/writing-engine/grammar/stage6a-authentic-submission-analysis";
import {
  persistGrammarProofreadingAuthenticSubmissionVerification,
  verifyGrammarProofreadingAuthenticSubmissionHypothesis,
} from "../lib/writing-engine/grammar/stage6b-authentic-submission-verification";

function buildGrammarHypothesis() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-6b-1",
      childId: "child-6b-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-6b-1",
      taskSubmissionId: "submission-6b-1",
      sampleText: "i went home.",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.domainModule === "grammar" &&
      candidate.rule === "standalone_lowercase_i",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a grammar/proofreading candidate hypothesis.");
  }

  return hypothesis;
}

function buildProofreadingHypothesis() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-6b-2",
      childId: "child-6b-2",
      submissionText: "",
    },
    writingSample: {
      id: "sample-6b-2",
      taskSubmissionId: "submission-6b-2",
      sampleText: "we  went home",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.domainModule === "proofreading" &&
      candidate.rule === "repeated_internal_spacing",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a grammar/proofreading candidate hypothesis.");
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
          id: "verification-6b-1",
          ...record,
          created_at: "2026-05-13T12:00:00.000Z",
          updated_at: "2026-05-13T12:00:00.000Z",
        };
      },
    } satisfies ParentVerificationRepository,
  };
}

function testAcceptedOutcomesPreserveSuggestionAndProvenance() {
  const hypothesis = buildGrammarHypothesis();
  const result = verifyGrammarProofreadingAuthenticSubmissionHypothesis({
    childId: "child-6b-1",
    parentUserId: "parent-6b-1",
    hypothesis,
    decision: "accepted",
    note: "Parent agrees this is a grammar learning signal.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.sourceType, "authentic_writing");
  assert.equal(result.originalSuggestion, hypothesis.candidateHypothesis);
  assert.equal(result.parentDecision, "accepted");
  assert.equal(result.parentVerifiedTruth?.categoryCode, null);
  assert.equal(result.parentVerifiedTruth?.microSkillKey, null);
  assert.equal(result.parentVerifiedTruth?.templateKey, null);
  assert.equal(result.verificationRecord.sourceRef.sourceType, "authentic_writing");
  assert.equal(result.verificationRecord.sourceRef.taskSubmissionId, "submission-6b-1");
  assert.equal(result.verificationRecord.sourceRef.writingSampleId, "sample-6b-1");
  assert.deepEqual(result.verificationRecord.metadata.sourceSpan, {
    positionStart: hypothesis.positionStart,
    positionEnd: hypothesis.positionEnd,
  });
  assert.equal(result.verificationRecord.metadata.targetText, "I");
  assert.equal(result.verificationRecord.metadata.childAttemptText, "i");
  assert.equal(
    result.verificationRecord.metadata.stage6a_domain_module,
    "grammar",
  );
  assert.equal(result.verificationRecord.metadata.stage6a_rule, "standalone_lowercase_i");
}

function testAcceptedWithOverrideFieldsIsInvalid() {
  const hypothesis = buildGrammarHypothesis();

  assert.throws(
    () =>
      verifyGrammarProofreadingAuthenticSubmissionHypothesis({
        childId: "child-6b-1",
        parentUserId: "parent-6b-1",
        hypothesis,
        decision: "accepted",
        verifiedTemplateKey: "grammar-proofreading-template",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /accepted grammar\/proofreading authentic-writing verification cannot include verified override fields/i,
  );
}

function testOverriddenRequiresMeaningfulEducationalChange() {
  const hypothesis = buildGrammarHypothesis();

  assert.throws(
    () =>
      verifyGrammarProofreadingAuthenticSubmissionHypothesis({
        childId: "child-6b-1",
        parentUserId: "parent-6b-1",
        hypothesis,
        decision: "overridden",
        note: "Parent adds context only.",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /must include at least one meaningful verified override field/i,
  );
}

function testOverriddenOutcomesPreserveOriginalSuggestionAndVerifiedTruth() {
  const hypothesis = buildGrammarHypothesis();
  const result = verifyGrammarProofreadingAuthenticSubmissionHypothesis({
    childId: "child-6b-1",
    parentUserId: "parent-6b-1",
    hypothesis,
    decision: "overridden",
    verifiedCategoryCode: "grammar_pronoun_capitalization",
    verifiedMicroSkillKey: "GRAMMAR_PRONOUN_CAPITAL_I",
    verifiedTemplateKey: "grammar-pronoun-capitalization",
    note: "Parent wants explicit pronoun capitalization tracking.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentDecision, "overridden");
  assert.equal(result.verificationRecord.suggestion.suggestedCategoryCode, null);
  assert.equal(result.verificationRecord.suggestion.suggestedMicroSkillKey, null);
  assert.equal(
    result.parentVerifiedTruth?.categoryCode,
    "grammar_pronoun_capitalization",
  );
  assert.equal(
    result.parentVerifiedTruth?.microSkillKey,
    "GRAMMAR_PRONOUN_CAPITAL_I",
  );
  assert.equal(
    result.parentVerifiedTruth?.templateKey,
    "grammar-pronoun-capitalization",
  );
  assert.equal(
    result.verifiedOutcome.categoryCode,
    "grammar_pronoun_capitalization",
  );
  assert.equal(
    result.verifiedOutcome.microSkillKey,
    "GRAMMAR_PRONOUN_CAPITAL_I",
  );
  assert.equal(
    result.verifiedOutcome.templateKey,
    "grammar-pronoun-capitalization",
  );
}

function testFalsePositiveRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildGrammarHypothesis();

  assert.throws(
    () =>
      verifyGrammarProofreadingAuthenticSubmissionHypothesis({
        childId: "child-6b-1",
        parentUserId: "parent-6b-1",
        hypothesis,
        decision: "false_positive",
        verifiedMicroSkillKey: "GRAMMAR_PRONOUN_CAPITAL_I",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /false_positive grammar\/proofreading authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyGrammarProofreadingAuthenticSubmissionHypothesis({
    childId: "child-6b-1",
    parentUserId: "parent-6b-1",
    hypothesis,
    decision: "false_positive",
    note: "This lower-case form is intentional in the quoted fragment.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

function testNotALearningIssueRejectsOverrideFieldsAndAvoidsMasteryIntent() {
  const hypothesis = buildGrammarHypothesis();

  assert.throws(
    () =>
      verifyGrammarProofreadingAuthenticSubmissionHypothesis({
        childId: "child-6b-1",
        parentUserId: "parent-6b-1",
        hypothesis,
        decision: "not_a_learning_issue",
        verifiedCategoryCode: "grammar_usage",
        nowIso: "2026-05-13T12:00:00.000Z",
      }),
    /not_a_learning_issue grammar\/proofreading authentic-writing verification cannot include verified override fields/i,
  );

  const result = verifyGrammarProofreadingAuthenticSubmissionHypothesis({
    childId: "child-6b-1",
    parentUserId: "parent-6b-1",
    hypothesis,
    decision: "not_a_learning_issue",
    note: "No follow-up grammar/proofreading lesson is needed here.",
    nowIso: "2026-05-13T12:00:00.000Z",
  });

  assert.equal(result.parentVerifiedTruth, null);
  assert.equal(result.hasMasteryUpdatingIntent, false);
  assert.equal(result.verifiedOutcome.shouldUpdateMastery, false);
}

async function testPersistenceUsesOnlyParentVerificationRepository() {
  const hypothesis = buildProofreadingHypothesis();
  const { inserted, repository } = createParentVerificationRepository();

  const result = await persistGrammarProofreadingAuthenticSubmissionVerification({
    verificationInput: {
      childId: "child-6b-2",
      parentUserId: "parent-6b-2",
      hypothesis,
      decision: "accepted",
      nowIso: "2026-05-13T12:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);

  const [record] = inserted;
  assert.equal(record.domain_module, "proofreading");
  assert.equal(record.source_type, "authentic_writing");
  assert.equal(record.task_submission_id, "submission-6b-2");
  assert.equal(record.writing_sample_id, "sample-6b-2");
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
  assert.equal(
    result.verificationRecord.metadata.stage6a_domain_module,
    "proofreading",
  );
  assert.equal(
    result.verificationRecord.metadata.stage6a_rule,
    "repeated_internal_spacing",
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
  console.log("writing-engine-stage6b-grammar-proofreading-verification-regression: ok");
}

void main();
