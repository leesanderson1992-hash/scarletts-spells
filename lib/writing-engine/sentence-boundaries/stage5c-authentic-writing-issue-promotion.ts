import type { WritingIssueRow } from "../../writing-practice/types";

import type { WritingEngineStage5bAuthenticSubmissionVerificationResult } from "./stage5b-authentic-submission-verification-types";
import type {
  WritingEngineStage5cAuthenticWritingIssuePromotionBuildResult,
  WritingEngineStage5cAuthenticWritingIssuePromotionInput,
  WritingEngineStage5cAuthenticWritingIssuePromotionPersistenceInput,
  WritingEngineStage5cAuthenticWritingIssuePromotionResult,
  WritingEngineStage5cDurableIssueTruth,
} from "./stage5c-authentic-writing-issue-types";

function isPromotableDecision(
  result: WritingEngineStage5bAuthenticSubmissionVerificationResult,
): result is WritingEngineStage5bAuthenticSubmissionVerificationResult & {
  parentDecision: "accepted" | "overridden";
  parentVerifiedTruth: NonNullable<
    WritingEngineStage5bAuthenticSubmissionVerificationResult["parentVerifiedTruth"]
  >;
} {
  return (
    (result.parentDecision === "accepted" ||
      result.parentDecision === "overridden") &&
    result.parentVerifiedTruth !== null
  );
}

function requirePromotableLineage(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
) {
  const hypothesis = input.verificationResult.hypothesis;
  const sourceRef = hypothesis.sourceRef;
  const metadata = sourceRef.metadata ?? {};
  const targetText =
    typeof metadata.targetText === "string" ? metadata.targetText : null;
  const childAttemptText =
    typeof metadata.childAttemptText === "string"
      ? metadata.childAttemptText
      : null;
  const sourceSpan = (() => {
    if (
      !metadata.sourceSpan ||
      typeof metadata.sourceSpan !== "object" ||
      Array.isArray(metadata.sourceSpan)
    ) {
      return null;
    }

    const candidate = metadata.sourceSpan as {
      positionStart?: unknown;
      positionEnd?: unknown;
    };

    return candidate;
  })();
  const positionStart =
    sourceSpan && typeof sourceSpan.positionStart === "number"
      ? sourceSpan.positionStart
      : null;
  const positionEnd =
    sourceSpan && typeof sourceSpan.positionEnd === "number"
      ? sourceSpan.positionEnd
      : null;

  if (!sourceRef.taskSubmissionId) {
    throw new Error(
      "Sentence-boundary authentic-writing issue promotion requires a task submission id.",
    );
  }

  if (!childAttemptText) {
    throw new Error(
      "Sentence-boundary authentic-writing issue promotion requires preserved child attempt text.",
    );
  }

  if (!targetText) {
    throw new Error(
      "Sentence-boundary authentic-writing issue promotion requires preserved target text.",
    );
  }

  if (positionStart === null || positionEnd === null) {
    throw new Error(
      "Sentence-boundary authentic-writing issue promotion requires preserved source-span lineage.",
    );
  }

  if (!input.verificationResult.parentVerifiedTruth?.microSkillKey) {
    throw new Error(
      "Sentence-boundary authentic-writing issue promotion requires a verified micro-skill key.",
    );
  }

  return {
    targetText,
    childAttemptText,
    positionStart,
    positionEnd,
  };
}

function buildIssueMetadata(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
) {
  const verification = input.verificationResult.verificationRecord;
  const hypothesis = input.verificationResult.hypothesis;

  return {
    source_type: input.verificationResult.sourceType,
    parent_verification_id: verification.id,
    verification_decision: input.verificationResult.parentDecision,
    original_suggestion: {
      suggestedCategoryCode:
        input.verificationResult.originalSuggestion.suggestedCategoryCode,
      suggestedMicroSkillKey:
        input.verificationResult.originalSuggestion.suggestedMicroSkillKey,
      suggestedTemplateKey:
        input.verificationResult.originalSuggestion.suggestedTemplateKey,
      confidence: input.verificationResult.originalSuggestion.confidence,
      notes: input.verificationResult.originalSuggestion.notes,
    },
    parent_verified_truth: input.verificationResult.parentVerifiedTruth,
    source_ref: hypothesis.sourceRef,
    hypothesis_metadata: hypothesis.sourceRef.metadata ?? {},
    verification_metadata: verification.metadata ?? {},
  };
}

function buildDurableIssueTruth(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
): WritingEngineStage5cDurableIssueTruth {
  if (!isPromotableDecision(input.verificationResult)) {
    throw new Error(
      "Only accepted and overridden sentence-boundary authentic-writing outcomes may create durable issue truth.",
    );
  }

  const lineage = requirePromotableLineage(input);

  return {
    issueStatus: "pending_parent_review",
    finalClassification: null,
    microSkillKey: input.verificationResult.parentVerifiedTruth.microSkillKey!,
    approvedReplacement: lineage.targetText,
    originalSuggestion: input.verificationResult.originalSuggestion,
    parentDecision: input.verificationResult.parentDecision,
    parentVerifiedTruth: input.verificationResult.parentVerifiedTruth,
  };
}

function buildInsertRecord(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
): Omit<WritingIssueRow, "id" | "created_at" | "updated_at"> | null {
  if (!isPromotableDecision(input.verificationResult)) {
    return null;
  }

  const lineage = requirePromotableLineage(input);
  const verification = input.verificationResult.verificationRecord;
  const hypothesis = input.verificationResult.hypothesis;

  return {
    child_id: verification.childId,
    parent_user_id: verification.parentUserId,
    task_submission_id: hypothesis.sourceRef.taskSubmissionId ?? null,
    writing_sample_id: hypothesis.sourceRef.writingSampleId ?? null,
    source_suggestion_id: null,
    source_misspelling_instance_id: null,
    reactivates_writing_issue_id: null,
    issue_status: "pending_parent_review",
    final_classification: null,
    observed_text: lineage.childAttemptText,
    suggested_replacement: lineage.targetText,
    approved_replacement: lineage.targetText,
    context_text: hypothesis.contextText,
    source_field_key: null,
    position_start: lineage.positionStart,
    position_end: lineage.positionEnd,
    micro_skill_key: input.verificationResult.parentVerifiedTruth.microSkillKey!,
    theme_key: null,
    parent_review_note: verification.note,
    notes: hypothesis.candidateHypothesis.notes,
    metadata: buildIssueMetadata(input),
    parent_marked_at: input.nowIso ?? verification.verifiedAt,
    sent_back_at: null,
    child_responded_at: null,
    final_classified_at: null,
  };
}

function createInMemoryWritingIssueRecord(input: {
  promotionInput: WritingEngineStage5cAuthenticWritingIssuePromotionInput;
  insertRecord: Omit<WritingIssueRow, "id" | "created_at" | "updated_at">;
}) {
  const nowIso =
    input.promotionInput.nowIso ??
    input.promotionInput.verificationResult.verificationRecord.verifiedAt;

  return {
    id:
      input.promotionInput.issueId ??
      `in_memory_writing_issue::${input.insertRecord.task_submission_id}::${input.insertRecord.position_start}-${input.insertRecord.position_end}`,
    ...input.insertRecord,
    created_at: nowIso,
    updated_at: nowIso,
  } satisfies WritingIssueRow;
}

function buildPromotionResult(input: {
  promotionInput: WritingEngineStage5cAuthenticWritingIssuePromotionInput;
  writingIssueRecord: WritingIssueRow | null;
}): WritingEngineStage5cAuthenticWritingIssuePromotionResult {
  const promotable = isPromotableDecision(input.promotionInput.verificationResult);

  return {
    sourceType: "authentic_writing",
    verificationResult: input.promotionInput.verificationResult,
    action: promotable ? "promoted" : "auditable_rejection",
    originalSuggestion: input.promotionInput.verificationResult.originalSuggestion,
    parentDecision: input.promotionInput.verificationResult.parentDecision,
    parentVerifiedTruth:
      input.promotionInput.verificationResult.parentVerifiedTruth,
    hasDurableIssueTruth: promotable,
    durableIssueTruth: promotable
      ? buildDurableIssueTruth(input.promotionInput)
      : null,
    writingIssueRecord: input.writingIssueRecord,
  };
}

export function buildSentenceBoundaryAuthenticWritingIssuePromotion(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
): WritingEngineStage5cAuthenticWritingIssuePromotionBuildResult {
  const insertRecord = buildInsertRecord(input);

  return {
    insertRecord,
    result: buildPromotionResult({
      promotionInput: input,
      writingIssueRecord: insertRecord
        ? createInMemoryWritingIssueRecord({
            promotionInput: input,
            insertRecord,
          })
        : null,
    }),
  };
}

export function promoteSentenceBoundaryVerifiedOutcome(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionInput,
): WritingEngineStage5cAuthenticWritingIssuePromotionResult {
  return buildSentenceBoundaryAuthenticWritingIssuePromotion(input).result;
}

export async function persistSentenceBoundaryAuthenticWritingIssuePromotion(
  input: WritingEngineStage5cAuthenticWritingIssuePromotionPersistenceInput,
): Promise<WritingEngineStage5cAuthenticWritingIssuePromotionResult> {
  const built = buildSentenceBoundaryAuthenticWritingIssuePromotion(
    input.promotionInput,
  );

  if (!built.insertRecord) {
    return built.result;
  }

  const writingIssueRecord = await input.repository.insert(built.insertRecord);

  return buildPromotionResult({
    promotionInput: input.promotionInput,
    writingIssueRecord,
  });
}
