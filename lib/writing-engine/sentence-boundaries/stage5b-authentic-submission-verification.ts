import {
  createInMemoryParentVerificationRecord,
  createVerifiedOutcomeFromParentVerification,
  recordParentVerification,
} from "../core/verification";
import type {
  ParentVerificationRecord,
  RecordParentVerificationCommand,
} from "../types";

import type {
  WritingEngineStage5bAuthenticSubmissionVerificationBuildResult,
  WritingEngineStage5bAuthenticSubmissionVerificationInput,
  WritingEngineStage5bAuthenticSubmissionVerificationPersistenceInput,
  WritingEngineStage5bAuthenticSubmissionVerificationResult,
} from "./stage5b-authentic-submission-verification-types";

function hasMeaningfulOverrideField(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
) {
  const suggestion = input.hypothesis.candidateHypothesis;

  return (
    (((input.verifiedCategoryCode ?? null) !== null &&
      input.verifiedCategoryCode !== suggestion.suggestedCategoryCode) ||
      ((input.verifiedMicroSkillKey ?? null) !== null &&
        input.verifiedMicroSkillKey !== suggestion.suggestedMicroSkillKey) ||
      ((input.verifiedTemplateKey ?? null) !== null &&
        input.verifiedTemplateKey !== suggestion.suggestedTemplateKey))
  );
}

function hasAnyVerifiedOverrideField(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
) {
  return (
    (input.verifiedCategoryCode ?? null) !== null ||
    (input.verifiedMicroSkillKey ?? null) !== null ||
    (input.verifiedTemplateKey ?? null) !== null
  );
}

function assertValidVerificationSemantics(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
) {
  const hasAnyOverrideField = hasAnyVerifiedOverrideField(input);
  const hasMeaningfulOverride = hasMeaningfulOverrideField(input);

  switch (input.decision) {
    case "accepted":
      if (hasAnyOverrideField) {
        throw new Error(
          "Accepted sentence-boundary authentic-writing verification cannot include verified override fields.",
        );
      }
      return;
    case "overridden":
      if (!hasMeaningfulOverride) {
        throw new Error(
          "Overridden sentence-boundary authentic-writing verification must include at least one meaningful verified override field.",
        );
      }
      return;
    case "false_positive":
    case "not_a_learning_issue":
      if (hasAnyOverrideField) {
        throw new Error(
          `${input.decision} sentence-boundary authentic-writing verification cannot include verified override fields.`,
        );
      }
      return;
  }
}

function buildVerificationMetadata(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
) {
  return {
    source_type: input.hypothesis.sourceType,
    sentence_boundary_rule: input.hypothesis.rule,
    observed_text: input.hypothesis.observedText,
    target_text: input.hypothesis.targetText,
    context_text: input.hypothesis.contextText,
    ...input.hypothesis.sourceRef.metadata,
    ...input.metadata,
  };
}

function buildVerificationCommand(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
): RecordParentVerificationCommand {
  return {
    childId: input.childId,
    parentUserId: input.parentUserId,
    domainModule: input.hypothesis.candidateHypothesis.domainModule,
    sourceRef: input.hypothesis.sourceRef,
    suggestion: input.hypothesis.candidateHypothesis,
    decision: input.decision,
    verifiedCategoryCode: input.verifiedCategoryCode ?? null,
    verifiedMicroSkillKey: input.verifiedMicroSkillKey ?? null,
    verifiedTemplateKey: input.verifiedTemplateKey ?? null,
    note: input.note ?? null,
    metadata: buildVerificationMetadata(input),
  };
}

function buildParentVerifiedTruth(
  verification: ParentVerificationRecord,
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
) {
  if (
    verification.decision === "false_positive" ||
    verification.decision === "not_a_learning_issue"
  ) {
    return null;
  }

  const suggestion = input.hypothesis.candidateHypothesis;

  return {
    categoryCode:
      verification.verifiedCategoryCode ?? suggestion.suggestedCategoryCode,
    microSkillKey:
      verification.verifiedMicroSkillKey ?? suggestion.suggestedMicroSkillKey,
    templateKey:
      verification.verifiedTemplateKey ?? suggestion.suggestedTemplateKey,
  };
}

function buildVerificationResult(input: {
  verificationInput: WritingEngineStage5bAuthenticSubmissionVerificationInput;
  verificationRecord: ParentVerificationRecord;
}): WritingEngineStage5bAuthenticSubmissionVerificationResult {
  const verifiedOutcome =
    createVerifiedOutcomeFromParentVerification(input.verificationRecord);

  return {
    sourceType: "authentic_writing",
    hypothesis: input.verificationInput.hypothesis,
    originalSuggestion: input.verificationInput.hypothesis.candidateHypothesis,
    parentDecision: input.verificationInput.decision,
    parentVerifiedTruth: buildParentVerifiedTruth(
      input.verificationRecord,
      input.verificationInput,
    ),
    verificationRecord: input.verificationRecord,
    verifiedOutcome,
    hasMasteryUpdatingIntent: verifiedOutcome.shouldUpdateMastery,
  };
}

export function buildSentenceBoundaryAuthenticSubmissionVerification(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
): WritingEngineStage5bAuthenticSubmissionVerificationBuildResult {
  assertValidVerificationSemantics(input);

  const command = buildVerificationCommand(input);
  const verificationRecord = createInMemoryParentVerificationRecord({
    command,
    verificationId: input.verificationId,
    nowIso: input.nowIso,
  });

  return {
    command,
    result: buildVerificationResult({
      verificationInput: input,
      verificationRecord,
    }),
  };
}

export function verifySentenceBoundaryAuthenticSubmissionHypothesis(
  input: WritingEngineStage5bAuthenticSubmissionVerificationInput,
): WritingEngineStage5bAuthenticSubmissionVerificationResult {
  return buildSentenceBoundaryAuthenticSubmissionVerification(input).result;
}

export async function persistSentenceBoundaryAuthenticSubmissionVerification(
  input: WritingEngineStage5bAuthenticSubmissionVerificationPersistenceInput,
): Promise<WritingEngineStage5bAuthenticSubmissionVerificationResult> {
  const built = buildSentenceBoundaryAuthenticSubmissionVerification(
    input.verificationInput,
  );
  const verificationRecord = await recordParentVerification({
    command: built.command,
    repository: input.repository,
    nowIso: input.nowIso ?? input.verificationInput.nowIso,
  });

  return buildVerificationResult({
    verificationInput: input.verificationInput,
    verificationRecord,
  });
}
