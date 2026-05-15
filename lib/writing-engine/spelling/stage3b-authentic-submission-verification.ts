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
  WritingEngineStage3bAuthenticSubmissionVerificationBuildResult,
  WritingEngineStage3bAuthenticSubmissionVerificationInput,
  WritingEngineStage3bAuthenticSubmissionVerificationPersistenceInput,
  WritingEngineStage3bAuthenticSubmissionVerificationResult,
} from "./stage3b-authentic-submission-verification-types";

function hasMeaningfulOverrideField(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
) {
  const suggestion = input.hypothesis.candidateHypothesis;

  return (
    (input.verifiedCategoryCode ?? null) !== null &&
      input.verifiedCategoryCode !== suggestion.suggestedCategoryCode ||
    (input.verifiedMicroSkillKey ?? null) !== null &&
      input.verifiedMicroSkillKey !== suggestion.suggestedMicroSkillKey ||
    (input.verifiedTemplateKey ?? null) !== null &&
      input.verifiedTemplateKey !== suggestion.suggestedTemplateKey
  );
}

function hasAnyVerifiedOverrideField(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
) {
  return (
    (input.verifiedCategoryCode ?? null) !== null ||
    (input.verifiedMicroSkillKey ?? null) !== null ||
    (input.verifiedTemplateKey ?? null) !== null
  );
}

function assertValidVerificationSemantics(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
) {
  const hasAnyOverrideField = hasAnyVerifiedOverrideField(input);
  const hasMeaningfulOverride = hasMeaningfulOverrideField(input);

  switch (input.decision) {
    case "accepted":
      if (hasAnyOverrideField) {
        throw new Error(
          "Accepted authentic-writing verification cannot include verified override fields.",
        );
      }
      return;
    case "overridden":
      if (!hasMeaningfulOverride) {
        throw new Error(
          "Overridden authentic-writing verification must include at least one meaningful verified override field.",
        );
      }
      return;
    case "false_positive":
    case "not_a_learning_issue":
      if (hasAnyOverrideField) {
        throw new Error(
          `${input.decision} authentic-writing verification cannot include verified override fields.`,
        );
      }
      return;
  }
}

function buildVerificationMetadata(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
) {
  return {
    source_type: input.hypothesis.sourceType,
    observed_text: input.hypothesis.observedText,
    suggested_replacement: input.hypothesis.suggestedReplacement,
    context_text: input.hypothesis.contextText,
    detected_category_label: input.hypothesis.detectedCategoryLabel,
    secondary_category_label: input.hypothesis.secondaryCategoryLabel,
    error_pattern: input.hypothesis.errorPattern,
    word_family_id: input.hypothesis.wordFamilyId,
    ...input.hypothesis.sourceRef.metadata,
    ...input.metadata,
  };
}

function buildVerificationCommand(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
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
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
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
  verificationInput: WritingEngineStage3bAuthenticSubmissionVerificationInput;
  verificationRecord: ParentVerificationRecord;
}): WritingEngineStage3bAuthenticSubmissionVerificationResult {
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

export function buildAuthenticSubmissionVerification(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
): WritingEngineStage3bAuthenticSubmissionVerificationBuildResult {
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

export function verifyAuthenticSubmissionHypothesis(
  input: WritingEngineStage3bAuthenticSubmissionVerificationInput,
): WritingEngineStage3bAuthenticSubmissionVerificationResult {
  return buildAuthenticSubmissionVerification(input).result;
}

export async function persistAuthenticSubmissionVerification(
  input: WritingEngineStage3bAuthenticSubmissionVerificationPersistenceInput,
): Promise<WritingEngineStage3bAuthenticSubmissionVerificationResult> {
  const built = buildAuthenticSubmissionVerification(input.verificationInput);
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
