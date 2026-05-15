import assert from "node:assert/strict";

import type { WritingIssueRow } from "../lib/writing-practice/types";
import type { WritingIssueRepository } from "../lib/writing-engine/core/writing-issues";
import { analyzeStage5aAuthenticSubmissionSentenceBoundaries } from "../lib/writing-engine/sentence-boundaries/stage5a-authentic-submission-analysis";
import { verifySentenceBoundaryAuthenticSubmissionHypothesis } from "../lib/writing-engine/sentence-boundaries/stage5b-authentic-submission-verification";
import {
  persistSentenceBoundaryAuthenticWritingIssuePromotion,
  promoteSentenceBoundaryVerifiedOutcome,
} from "../lib/writing-engine/sentence-boundaries/stage5c-authentic-writing-issue-promotion";
import type { WritingEngineStage5aSentenceBoundaryCandidate } from "../lib/writing-engine/sentence-boundaries/stage5a-authentic-submission-analysis";

function buildHypothesis() {
  const result = analyzeStage5aAuthenticSubmissionSentenceBoundaries({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "hello world",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.rule === "missing_terminal_punctuation",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a sentence-boundary candidate hypothesis.");
  }

  return hypothesis;
}

function buildAcceptedPromotableHypothesis(): WritingEngineStage5aSentenceBoundaryCandidate {
  const hypothesis = buildHypothesis();

  return {
    ...hypothesis,
    candidateHypothesis: {
      ...hypothesis.candidateHypothesis,
      suggestedCategoryCode: "sentence_boundaries",
      suggestedMicroSkillKey: "SENTENCE_BOUNDARY_END_MARK",
      suggestedTemplateKey: "sentence-boundary-fix",
    },
  };
}

function buildVerificationResult(
  decision: "accepted" | "overridden" | "false_positive" | "not_a_learning_issue",
) {
  const hypothesis =
    decision === "accepted" ? buildAcceptedPromotableHypothesis() : buildHypothesis();

  if (decision === "overridden") {
    return verifySentenceBoundaryAuthenticSubmissionHypothesis({
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision,
      verifiedCategoryCode: "sentence_boundaries",
      verifiedMicroSkillKey: "SENTENCE_BOUNDARY_END_MARK",
      verifiedTemplateKey: "sentence-boundary-fix",
      note: "Parent wants the sentence boundary skill tracked explicitly.",
      nowIso: "2026-05-13T10:00:00.000Z",
    });
  }

  return verifySentenceBoundaryAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision,
    note:
      decision === "accepted"
        ? "Parent agrees this should become durable sentence-boundary issue truth."
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
  const result = promoteSentenceBoundaryVerifiedOutcome({
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
  assert.equal(result.writingIssueRecord?.observed_text, "world");
  assert.equal(result.writingIssueRecord?.suggested_replacement, "world.");
  assert.equal(result.writingIssueRecord?.approved_replacement, "world.");
  assert.equal(
    (result.writingIssueRecord?.metadata?.original_suggestion as { suggestedMicroSkillKey?: string })
      ?.suggestedMicroSkillKey,
    "SENTENCE_BOUNDARY_END_MARK",
  );
}

function testOverriddenOutcomesPreserveVerifiedEducationalTruth() {
  const verificationResult = buildVerificationResult("overridden");
  const result = promoteSentenceBoundaryVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.action, "promoted");
  assert.equal(
    result.durableIssueTruth?.microSkillKey,
    "SENTENCE_BOUNDARY_END_MARK",
  );
  assert.equal(
    (result.writingIssueRecord?.metadata?.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "SENTENCE_BOUNDARY_END_MARK",
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
    await persistSentenceBoundaryAuthenticWritingIssuePromotion({
      promotionInput: { verificationResult: falsePositive },
      repository: falsePositiveRepo.repository,
    });
  const notALearningIssueResult =
    await persistSentenceBoundaryAuthenticWritingIssuePromotion({
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

  const result = await persistSentenceBoundaryAuthenticWritingIssuePromotion({
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
  assert.equal(record.micro_skill_key, "SENTENCE_BOUNDARY_END_MARK");
  assert.equal(
    (record.metadata.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "SENTENCE_BOUNDARY_END_MARK",
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
      promoteSentenceBoundaryVerifiedOutcome({
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
      promoteSentenceBoundaryVerifiedOutcome({
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
  console.log("writing-engine-stage5c-sentence-boundary-issue-promotion-regression: ok");
}

void main();
