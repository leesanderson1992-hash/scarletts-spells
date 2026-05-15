import assert from "node:assert/strict";

import type { WritingIssueRow } from "../lib/writing-practice/types";
import type { WritingIssueRepository } from "../lib/writing-engine/core/writing-issues";
import { analyzeStage3aAuthenticSubmissionSpelling } from "../lib/writing-engine/spelling/stage3a-authentic-submission-analysis";
import { verifyAuthenticSubmissionHypothesis } from "../lib/writing-engine/spelling/stage3b-authentic-submission-verification";
import {
  persistAuthenticWritingIssuePromotion,
  promoteAuthenticWritingVerifiedOutcome,
} from "../lib/writing-engine/spelling/stage3c-authentic-writing-issue-promotion";
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
      starter_word_bank: [{ word: "taste", difficulty: "easy" }],
      example_words: ["taste", "tasting"],
      teaching_point: "Keep the base word clear before adding the suffix.",
    },
    ...overrides,
  };
}

function buildHypothesis() {
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

function buildVerificationResult(
  decision: "accepted" | "overridden" | "false_positive" | "not_a_learning_issue",
) {
  const hypothesis = buildHypothesis();

  if (decision === "overridden") {
    return verifyAuthenticSubmissionHypothesis({
      childId: "child-1",
      parentUserId: "parent-1",
      hypothesis,
      decision,
      verifiedMicroSkillKey: "D4_PG_LONG_AI_A_E_CONTRAST",
      verifiedTemplateKey: "T08",
      note: "Parent wants a broader contrast lesson first.",
      nowIso: "2026-05-12T10:00:00.000Z",
    });
  }

  return verifyAuthenticSubmissionHypothesis({
    childId: "child-1",
    parentUserId: "parent-1",
    hypothesis,
    decision,
    note:
      decision === "accepted"
        ? "Parent agrees this should become durable issue truth."
        : "Auditable without durable issue promotion.",
    nowIso: "2026-05-12T10:00:00.000Z",
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
          created_at: "2026-05-12T10:00:00.000Z",
          updated_at: "2026-05-12T10:00:00.000Z",
        };
      },
    } satisfies WritingIssueRepository,
  };
}

function testAcceptedOutcomesPromoteIntoDurableIssueTruth() {
  const verificationResult = buildVerificationResult("accepted");
  const result = promoteAuthenticWritingVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-12T10:00:00.000Z",
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
  assert.equal(result.writingIssueRecord?.observed_text, "tast");
  assert.equal(result.writingIssueRecord?.approved_replacement, "taste");
  assert.equal(
    (result.writingIssueRecord?.metadata?.original_suggestion as { suggestedMicroSkillKey?: string })
      ?.suggestedMicroSkillKey,
    verificationResult.originalSuggestion.suggestedMicroSkillKey,
  );
}

function testOverriddenOutcomesPreserveVerifiedEducationalTruth() {
  const verificationResult = buildVerificationResult("overridden");
  const result = promoteAuthenticWritingVerifiedOutcome({
    verificationResult,
    nowIso: "2026-05-12T10:00:00.000Z",
  });

  assert.equal(result.action, "promoted");
  assert.equal(
    result.durableIssueTruth?.microSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(
    (result.writingIssueRecord?.metadata?.parent_verified_truth as { microSkillKey?: string })
      ?.microSkillKey,
    "D4_PG_LONG_AI_A_E_CONTRAST",
  );
  assert.equal(result.writingIssueRecord?.issue_status, "pending_parent_review");
  assert.equal(result.writingIssueRecord?.final_classification, null);
}

async function testRejectionPathsRemainAuditableWithoutIssuePromotion() {
  const falsePositive = buildVerificationResult("false_positive");
  const notALearningIssue = buildVerificationResult("not_a_learning_issue");
  const falsePositiveRepo = createWritingIssueRepository();
  const notALearningIssueRepo = createWritingIssueRepository();

  const falsePositiveResult = await persistAuthenticWritingIssuePromotion({
    promotionInput: { verificationResult: falsePositive },
    repository: falsePositiveRepo.repository,
  });
  const notALearningIssueResult = await persistAuthenticWritingIssuePromotion({
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
  const verificationResult = buildVerificationResult("accepted");
  const { inserted, repository } = createWritingIssueRepository();

  const result = await persistAuthenticWritingIssuePromotion({
    promotionInput: {
      verificationResult,
      nowIso: "2026-05-12T10:00:00.000Z",
    },
    repository,
  });

  assert.equal(inserted.length, 1);
  const [record] = inserted;
  assert.equal(record.issue_status, "pending_parent_review");
  assert.equal(record.final_classification, null);
  assert.equal(record.task_submission_id, "submission-1");
  assert.equal(record.writing_sample_id, "sample-1");
  assert.equal(record.micro_skill_key, "D4_PG_FINAL_E_DROP");
  assert.equal(result.writingIssueRecord?.id, "issue-1");
}

function testMissingLineageFailsExplicitly() {
  const verificationResult = buildVerificationResult("accepted");
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
      promoteAuthenticWritingVerifiedOutcome({
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
  testMissingLineageFailsExplicitly();
  console.log("writing-engine-stage3c-authentic-issue-promotion-regression: ok");
}

void main();
