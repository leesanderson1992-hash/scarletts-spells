import assert from "node:assert/strict";

import type { WritingIssueRow } from "../lib/writing-practice/types";
import type { WritingIssueRepository } from "../lib/writing-engine/core/writing-issues";
import {
  analyzeStage6aAuthenticSubmissionGrammarProofreading,
  type WritingEngineStage6aGrammarProofreadingCandidate,
} from "../lib/writing-engine/grammar/stage6a-authentic-submission-analysis";
import { verifyGrammarProofreadingAuthenticSubmissionHypothesis } from "../lib/writing-engine/grammar/stage6b-authentic-submission-verification";
import {
  persistGrammarProofreadingAuthenticWritingIssuePromotion,
  promoteGrammarProofreadingVerifiedOutcome,
} from "../lib/writing-engine/grammar/stage6c-authentic-writing-issue-promotion";

function buildHypothesis() {
  const result = analyzeStage6aAuthenticSubmissionGrammarProofreading({
    taskSubmission: {
      id: "submission-1",
      childId: "child-1",
      submissionText: "",
    },
    writingSample: {
      id: "sample-1",
      taskSubmissionId: "submission-1",
      sampleText: "i like  apples",
    },
  });

  const hypothesis = result.results.find(
    (candidate) =>
      candidate.status === "candidate" &&
      candidate.rule === "standalone_lowercase_i",
  );

  assert.ok(hypothesis);
  if (!hypothesis || hypothesis.status !== "candidate") {
    throw new Error("Expected a grammar/proofreading candidate hypothesis.");
  }

  return hypothesis;
}

function buildAcceptedPromotableHypothesis(): WritingEngineStage6aGrammarProofreadingCandidate {
  const hypothesis = buildHypothesis();

  return {
    ...hypothesis,
    candidateHypothesis: {
      ...hypothesis.candidateHypothesis,
      suggestedCategoryCode: "grammar_capitalization",
      suggestedMicroSkillKey: "GRAMMAR_CAPITALIZE_PRONOUN_I",
      suggestedTemplateKey: "grammar-capitalization-fix",
    },
  };
}

function buildVerificationResult(
  decision: "accepted" | "overridden" | "false_positive" | "not_a_learning_issue",
) {
  const hypothesis =
    decision === "accepted" ? buildAcceptedPromotableHypothesis() : buildHypothesis();

  if (decision === "overridden") {
    return verifyGrammarProofreadingAuthenticSubmissionHypothesis({
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision,
      verifiedCategoryCode: "grammar_capitalization",
      verifiedMicroSkillKey: "GRAMMAR_CAPITALIZE_PRONOUN_I",
      verifiedTemplateKey: "grammar-capitalization-fix",
      note: "Parent wants the pronoun-capitalization skill tracked explicitly.",
      nowIso: "2026-05-13T10:00:00.000Z",
    });
  }

  return verifyGrammarProofreadingAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision,
    note:
      decision === "accepted"
        ? "Parent agrees this should become durable grammar/proofreading issue truth."
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
  const result = promoteGrammarProofreadingVerifiedOutcome({
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
  assert.equal(result.writingIssueRecord?.observed_text, "i");
  assert.equal(result.writingIssueRecord?.suggested_replacement, "I");
  assert.equal(result.writingIssueRecord?.approved_replacement, "I");
  assert.equal(
    (result.writingIssueRecord?.metadata?.original_suggestion as { suggestedMicroSkillKey?: string })
      ?.suggestedMicroSkillKey,
    "GRAMMAR_CAPITALIZE_PRONOUN_I",
  );
}

function testOverriddenOutcomesPreserveVerifiedEducationalTruth() {
  const verificationResult = buildVerificationResult("overridden");
  const result = promoteGrammarProofreadingVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-13T10:00:00.000Z",
  });

  assert.equal(result.action, "promoted");
  assert.equal(
    result.durableIssueTruth?.microSkillKey,
    "GRAMMAR_CAPITALIZE_PRONOUN_I",
  );
  assert.equal(
    (result.writingIssueRecord?.metadata?.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "GRAMMAR_CAPITALIZE_PRONOUN_I",
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
    await persistGrammarProofreadingAuthenticWritingIssuePromotion({
      promotionInput: { verificationResult: falsePositive },
      repository: falsePositiveRepo.repository,
    });
  const notALearningIssueResult =
    await persistGrammarProofreadingAuthenticWritingIssuePromotion({
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

  const result = await persistGrammarProofreadingAuthenticWritingIssuePromotion({
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
  assert.equal(record.micro_skill_key, "GRAMMAR_CAPITALIZE_PRONOUN_I");
  assert.equal(
    (record.metadata.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "GRAMMAR_CAPITALIZE_PRONOUN_I",
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
      promoteGrammarProofreadingVerifiedOutcome({
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
      promoteGrammarProofreadingVerifiedOutcome({
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
  console.log("writing-engine-stage6c-grammar-proofreading-issue-promotion-regression: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
