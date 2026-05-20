import { createVerifiedOutcomeFromParentVerification, recordParentVerification } from "../core/verification";
import { buildAuthenticWritingSourceRef } from "../analysis/authentic-submission";
import { createSupabaseParentVerificationRepository } from "../persistence/parent-verifications";
import { createSupabaseWritingIssueRepository } from "../persistence/writing-issues";
import { buildAuthenticSubmissionVerification } from "../spelling/stage3b-authentic-submission-verification";
import { persistAuthenticWritingIssuePromotion } from "../spelling/stage3c-authentic-writing-issue-promotion";
import type { WritingEngineStage3aAuthenticSubmissionHypothesis } from "../spelling/stage3a-authentic-submission-analysis";
import type {
  ParentVerificationRecord,
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineVerificationDecision,
} from "../types";

type SupabaseServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

export type Stage7dReviewWorkVerificationTarget = {
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  suggestedReplacement: string | null;
  contextText: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  suggestedCategoryCode: string | null;
  suggestedMicroSkillKey: string | null;
  notes: string | null;
};

type BuildStage7dReviewWorkVerificationTargetInput = {
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  observedText: string;
  suggestedReplacement: string | null;
  contextText: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  suggestedCategoryCode: string | null;
  suggestedMicroSkillKey: string | null;
  notes: string | null;
};

type RecordStage7dParentVerificationInput = {
  supabase: SupabaseServerClient;
  childId: string;
  parentUserId: string;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  target: Stage7dReviewWorkVerificationTarget;
};

function buildRecordedStage7dParentVerification(input: RecordStage7dParentVerificationInput) {
  const hypothesis = buildStage7dAuthenticWritingHypothesis(input.target);
  const built = buildAuthenticSubmissionVerification({
    childId: input.childId,
    parentUserId: input.parentUserId,
    hypothesis,
    decision: input.decision,
    verifiedCategoryCode: input.verifiedCategoryCode ?? null,
    verifiedMicroSkillKey: input.verifiedMicroSkillKey ?? null,
    verifiedTemplateKey: input.verifiedTemplateKey ?? null,
    note: input.note ?? null,
  });

  return {
    hypothesis,
    built,
  };
}

async function persistStage7dParentVerificationOnly(input: RecordStage7dParentVerificationInput) {
  const { hypothesis, built } = buildRecordedStage7dParentVerification(input);
  const verificationRecord = await recordParentVerification({
    command: built.command,
    repository: createSupabaseParentVerificationRepository(input.supabase),
  });

  return {
    hypothesis,
    verificationRecord,
    verificationResult: {
      sourceType: "authentic_writing" as const,
      hypothesis,
      originalSuggestion: hypothesis.candidateHypothesis,
      parentDecision: verificationRecord.decision,
      parentVerifiedTruth: buildParentVerifiedTruth(
        verificationRecord,
        hypothesis.candidateHypothesis,
      ),
      verificationRecord,
      verifiedOutcome: createVerifiedOutcomeFromParentVerification(verificationRecord),
      hasMasteryUpdatingIntent:
        verificationRecord.decision === "accepted" ||
        verificationRecord.decision === "overridden",
    },
  };
}

function buildReviewWorkWritingSampleSourceRef(input: {
  writingSampleId: string;
  observedText: string;
  targetText: string | null;
  positionStart: number;
  positionEnd: number;
  metadata: WritingEngineSourceMetadata;
}) {
  return {
    sourceType: "writing_sample" as const,
    sourceEntityId: [
      "writing_sample",
      input.writingSampleId,
      `${input.positionStart}-${input.positionEnd}`,
      input.observedText.toLowerCase(),
      (input.targetText ?? "no_target").toLowerCase(),
    ].join("::"),
    taskSubmissionId: null,
    writingSampleId: input.writingSampleId,
    metadata: input.metadata,
  } satisfies WritingEngineSourceRef;
}

function buildSourceMetadata(
  input: BuildStage7dReviewWorkVerificationTargetInput,
) {
  const sourceTextOrigin = input.writingSampleId ? "writing_sample" : "missing";

  return {
    taskSubmissionId: input.taskSubmissionId,
    writingSampleId: input.writingSampleId,
    sourceTextOrigin,
    sourceSpan:
      input.positionStart !== null && input.positionEnd !== null
        ? {
            positionStart: input.positionStart,
            positionEnd: input.positionEnd,
          }
        : null,
    targetText: input.suggestedReplacement,
    childAttemptText: input.observedText,
    contextText: input.contextText,
    detectedCategoryLabel: input.suggestedCategoryCode,
  } satisfies WritingEngineSourceMetadata;
}

function buildStage7dAuthenticWritingHypothesis(
  target: Stage7dReviewWorkVerificationTarget,
): WritingEngineStage3aAuthenticSubmissionHypothesis {
  const candidateHypothesis = {
    domainModule: "spelling",
    suggestedCategoryCode: target.suggestedCategoryCode,
    suggestedMicroSkillKey: target.suggestedMicroSkillKey,
    suggestedTemplateKey: null,
    confidence: null,
    notes: target.notes,
    sourceRef: target.sourceRef,
    metadata: target.sourceRef.metadata ?? {},
  } satisfies WritingEngineCandidateHypothesis;

  return {
    sourceType: "authentic_writing",
    sourceRef: target.sourceRef,
    observedText: target.observedText,
    suggestedReplacement: target.suggestedReplacement ?? target.observedText,
    contextText: target.contextText ?? "",
    positionStart: target.positionStart ?? 0,
    positionEnd:
      target.positionEnd ?? (target.positionStart ?? 0) + target.observedText.length,
    detectedCategoryLabel: target.suggestedCategoryCode as never,
    secondaryCategoryLabel: null,
    errorPattern: null,
    wordFamilyId: null,
    categoryResolution: {
      status: "unresolved",
      category: null,
      reason: "stage7d_review_work_existing_shared_output",
    } as never,
    microSkillResolution: {
      status: target.suggestedMicroSkillKey ? "resolved" : "unresolved",
      microSkillKey: target.suggestedMicroSkillKey,
      candidateMicroSkillKeys: target.suggestedMicroSkillKey
        ? [target.suggestedMicroSkillKey]
        : [],
      reason: "stage7d_review_work_existing_shared_output",
    } as never,
    templateResolution: null,
    complexityResolution: null,
    similarPracticeResolution: null,
    candidateHypothesis,
  };
}

function hasPromotableSpellingLineage(target: Stage7dReviewWorkVerificationTarget) {
  return (
    typeof target.sourceRef.taskSubmissionId === "string" &&
    target.sourceRef.taskSubmissionId.length > 0 &&
    typeof target.sourceRef.writingSampleId === "string" &&
    target.sourceRef.writingSampleId.length > 0 &&
    target.positionStart !== null &&
    target.positionEnd !== null &&
    typeof target.suggestedReplacement === "string" &&
    target.suggestedReplacement.trim().length > 0
  );
}

function buildParentVerifiedTruth(
  verification: ParentVerificationRecord,
  suggestion: WritingEngineCandidateHypothesis,
) {
  if (
    verification.decision === "false_positive" ||
    verification.decision === "not_a_learning_issue"
  ) {
    return null;
  }

  return {
    categoryCode:
      verification.verifiedCategoryCode ?? suggestion.suggestedCategoryCode,
    microSkillKey:
      verification.verifiedMicroSkillKey ?? suggestion.suggestedMicroSkillKey,
    templateKey:
      verification.verifiedTemplateKey ?? suggestion.suggestedTemplateKey,
  };
}

export function buildStage7dReviewWorkVerificationTarget(
  input: BuildStage7dReviewWorkVerificationTargetInput,
): Stage7dReviewWorkVerificationTarget | null {
  if (
    input.positionStart === null ||
    input.positionEnd === null ||
    input.positionEnd <= input.positionStart
  ) {
    return null;
  }

  const metadata = buildSourceMetadata(input);
  const sourceRef =
    input.taskSubmissionId
      ? buildAuthenticWritingSourceRef({
          normalization: {
            taskSubmissionId: input.taskSubmissionId,
            writingSampleId: input.writingSampleId,
            sourceTextOrigin: input.writingSampleId ? "writing_sample" : "task_submission_text",
            analysisText: "",
          },
          observedText: input.observedText,
          targetText: input.suggestedReplacement,
          positionStart: input.positionStart,
          positionEnd: input.positionEnd,
          metadata,
        })
      : input.writingSampleId
        ? buildReviewWorkWritingSampleSourceRef({
            writingSampleId: input.writingSampleId,
            observedText: input.observedText,
            targetText: input.suggestedReplacement,
            positionStart: input.positionStart,
            positionEnd: input.positionEnd,
            metadata,
          })
        : null;

  if (!sourceRef) {
    return null;
  }

  return {
    sourceRef,
    observedText: input.observedText,
    suggestedReplacement: input.suggestedReplacement,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    suggestedCategoryCode: input.suggestedCategoryCode,
    suggestedMicroSkillKey: input.suggestedMicroSkillKey,
    notes: input.notes,
  };
}

export async function recordStage7dParentVerification(
  input: RecordStage7dParentVerificationInput,
) {
  const { verificationRecord, verificationResult } =
    await persistStage7dParentVerificationOnly(input);

  const promotionResult =
    (input.decision === "accepted" || input.decision === "overridden") &&
    hasPromotableSpellingLineage(input.target)
      ? await persistAuthenticWritingIssuePromotion({
          promotionInput: {
            verificationResult,
          },
          repository: createSupabaseWritingIssueRepository(input.supabase),
        })
      : null;

  return {
    verificationRecord,
    verificationResult,
    promotionResult,
  };
}

export async function recordStage7dParentVerificationWithoutPromotion(
  input: RecordStage7dParentVerificationInput,
) {
  const { verificationRecord, verificationResult } =
    await persistStage7dParentVerificationOnly(input);

  return {
    verificationRecord,
    verificationResult,
    promotionResult: null,
  };
}
