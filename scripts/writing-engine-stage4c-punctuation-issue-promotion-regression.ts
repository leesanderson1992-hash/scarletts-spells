import assert from "node:assert/strict";

import type { WritingIssueRow } from "../lib/writing-practice/types";
import type { WritingIssueRepository } from "../lib/writing-engine/core/writing-issues";
import { analyzeStage4aAuthenticSubmissionPunctuation } from "../lib/writing-engine/punctuation/stage4a-authentic-submission-analysis";
import { verifyPunctuationAuthenticSubmissionHypothesis } from "../lib/writing-engine/punctuation/stage4b-authentic-submission-verification";
import {
  persistPunctuationAuthenticWritingIssuePromotion,
  promotePunctuationVerifiedOutcome,
} from "../lib/writing-engine/punctuation/stage4c-authentic-writing-issue-promotion";
import type { WritingEngineStage4aPunctuationCandidate } from "../lib/writing-engine/punctuation/stage4a-authentic-submission-analysis";

function buildHypothesis() {
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

function buildAcceptedPromotableHypothesis(): WritingEngineStage4aPunctuationCandidate {
  const hypothesis = buildHypothesis();

  return {
    ...hypothesis,
    candidateHypothesis: {
      ...hypothesis.candidateHypothesis,
      suggestedCategoryCode: "punctuation_spacing",
      suggestedMicroSkillKey: "PUNC_SPACE_BEFORE_MARK",
      suggestedTemplateKey: "punctuation-fix",
    },
  };
}

function buildVerificationResult(
  decision: "accepted" | "overridden" | "false_positive" | "not_a_learning_issue",
) {
  const hypothesis =
    decision === "accepted" ? buildAcceptedPromotableHypothesis() : buildHypothesis();

  if (decision === "overridden") {
    return verifyPunctuationAuthenticSubmissionHypothesis({
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision,
      verifiedCategoryCode: "punctuation_spacing",
      verifiedMicroSkillKey: "PUNC_SPACE_BEFORE_MARK",
      verifiedTemplateKey: "punctuation-fix",
      note: "Parent wants the spacing skill tracked explicitly.",
      nowIso: "2026-05-13T10:00:00.000Z",
    });
  }

  return verifyPunctuationAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision,
    note:
      decision === "accepted"
        ? "Parent agrees this should become durable punctuation issue truth."
        : "Auditable without durable issue promotion.",
    nowIso: "2026-05-13T10:00:00.000Z",
  });
}

function createWritingIssueRepository() {
  const inserted: Array<Omit<WritingIssueRow, "id" | "created_at" | "updated_at">> = [];

  return {
    inserted,
    repository: {
      async insert(record) {
        inserted.push(record);

        return {
          id: "issue-1",
          ...record,
          created_at: "2026-05-13T10:00:00.000Z",
          updated_at: "2026-05-13T10:00:00.000Z",
        };
      },
    } satisfies WritingIssueRepository,
  };
}

function testAcceptedOutcomesPromoteIntoDurableIssueTruth() {
  const verificationResult = buildVerificationResult("accepted");
  const result = promotePunctuationVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.action, "promoted");
  assert.equal(result.hasDurableIssueTruth, true);
  assert.equal(result.durableIssueTruth?.issueStatus, "pending_parent_review");
  assert.equal(result.durableIssueTruth?.finalClassification, null);
  assert.equal(
    result.durableIssueTruth?.microSkillKey,
    verificationResult.parentVerifiedTruth?.microSkillKey,
  );
  assert.equal(result.writingIssueRecord?.task_submission_id, "submission-1");
  assert.equal(result.writingIssueRecord?.writing_sample_id, "sample-1");
  assert.equal(result.writingIssueRecord?.observed_text, " !");
  assert.equal(result.writingIssueRecord?.suggested_replacement, "!");
  assert.equal(result.writingIssueRecord?.approved_replacement, "!");
  assert.equal(
    (result.writingIssueRecord?.metadata?.original_suggestion as { suggestedMicroSkillKey?: string })
      ?.suggestedMicroSkillKey,
    "PUNC_SPACE_BEFORE_MARK",
  );
}

function testOverriddenOutcomesPreserveVerifiedEducationalTruth() {
  const verificationResult = buildVerificationResult("overridden");
  const result = promotePunctuationVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.action, "promoted");
  assert.equal(
    result.durableIssueTruth?.microSkillKey,
    "PUNC_SPACE_BEFORE_MARK",
  );
  assert.equal(
    (result.writingIssueRecord?.metadata?.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "PUNC_SPACE_BEFORE_MARK",
  );
  assert.equal(result.writingIssueRecord?.issue_status, "pending_parent_review");
  assert.equal(result.writingIssueRecord?.final_classification, null);
}

async function testRejectionPathsRemainAuditableWithoutIssuePromotion() {
  const falsePositive = buildVerificationResult("false_positive");
  const notALearningIssue = buildVerificationResult("not_a_learning_issue");
  const falsePositiveRepo = createWritingIssueRepository();
  const notALearningIssueRepo = createWritingIssueRepository();

  const falsePositiveResult =
    await persistPunctuationAuthenticWritingIssuePromotion({
      promotionInput: { verificationResult: falsePositive },
      repository: falsePositiveRepo.repository,
    });
  const notALearningIssueResult =
    await persistPunctuationAuthenticWritingIssuePromotion({
      promotionInput: { verificationResult: notALearningIssue },
      repository: notALearningIssueRepo.repository,
    });

  assert.equal(falsePositiveResult.action, "auditable_rejection");
  assert.equal(falsePositiveResult.hasDurableIssueTruth, false);
  assert.equal(falsePositiveResult.writingIssueRecord, null);
  assert.equal(falsePositiveRepo.inserted.length, 0);

  assert.equal(notALearningIssueResult.action, "auditable_rejection");
  assert.equal(notALearningIssueResult.hasDurableIssueTruth, false);
  assert.equal(notALearningIssueResult.writingIssueRecord, null);
  assert.equal(notALearningIssueRepo.inserted.length, 0);
}

async function testPersistenceUsesOnlyDurableIssueStorage() {
  const verificationResult = buildVerificationResult("overridden");
  const { inserted, repository } = createWritingIssueRepository();

  const result = await persistPunctuationAuthenticWritingIssuePromotion({
    promotionInput: {
      verificationResult,
      nowIso: "2026-05-13T10:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);
  const [record] = inserted;
  assert.equal(record.issue_status, "pending_parent_review");
  assert.equal(record.final_classification, null);
  assert.equal(record.task_submission_id, "submission-1");
  assert.equal(record.writing_sample_id, "sample-1");
  assert.equal(record.micro_skill_key, "PUNC_SPACE_BEFORE_MARK");
  assert.equal(
    (record.metadata.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "PUNC_SPACE_BEFORE_MARK",
  );
  assert.equal(result.writingIssueRecord?.id, "issue-1");
}

function testMissingVerifiedTruthFailsExplicitly() {
  const verificationResult = buildVerificationResult("accepted");
  const broken = {
    ...verificationResult,
    parentVerifiedTruth: {
      categoryCode: null,
      microSkillKey: null,
      templateKey: null,
    },
  };

  assert.throws(
    () =>
      promotePunctuationVerifiedOutcome({
        verificationResult: broken,
      }),
    /requires a verified micro-skill key/i,
  );
}

function testMissingLineageFailsExplicitly() {
  const verificationResult = buildVerificationResult("overridden");
  const broken = {
    ...verificationResult,
    hypothesis: {
      ...verificationResult.hypothesis,
      sourceRef: {
        ...verificationResult.hypothesis.sourceRef,
        taskSubmissionId: null,
      },
    },
  };

  assert.throws(
    () =>
      promotePunctuationVerifiedOutcome({
        verificationResult: broken,
      }),
    /requires a task submission id/i,
  );
}

async function main() {
  testAcceptedOutcomesPromoteIntoDurableIssueTruth();
  testOverriddenOutcomesPreserveVerifiedEducationalTruth();
  await testRejectionPathsRemainAuditableWithoutIssuePromotion();
  await testPersistenceUsesOnlyDurableIssueStorage();
  testMissingVerifiedTruthFailsExplicitly();
  testMissingLineageFailsExplicitly();
  console.log("writing-engine-stage4c-punctuation-issue-promotion-regression: ok");
}

void main();
