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
  WritingEngineStage6bAuthenticSubmissionVerificationBuildResult,
  WritingEngineStage6bAuthenticSubmissionVerificationInput,
  WritingEngineStage6bAuthenticSubmissionVerificationPersistenceInput,
  WritingEngineStage6bAuthenticSubmissionVerificationResult,
} from "./stage6b-authentic-submission-verification-types";

function hasMeaningfulOverrideField(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
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
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
) {
  return (
    (input.verifiedCategoryCode ?? null) !== null ||
    (input.verifiedMicroSkillKey ?? null) !== null ||
    (input.verifiedTemplateKey ?? null) !== null
  );
}

function assertValidVerificationSemantics(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
) {
  const hasAnyOverrideField = hasAnyVerifiedOverrideField(input);
  const hasMeaningfulOverride = hasMeaningfulOverrideField(input);

  switch (input.decision) {
    case "accepted":
      if (hasAnyOverrideField) {
        throw new Error(
          "Accepted grammar/proofreading authentic-writing verification cannot include verified override fields.",
        );
      }
      return;
    case "overridden":
      if (!hasMeaningfulOverride) {
        throw new Error(
          "Overridden grammar/proofreading authentic-writing verification must include at least one meaningful verified override field.",
        );
      }
      return;
    case "false_positive":
    case "not_a_learning_issue":
      if (hasAnyOverrideField) {
        throw new Error(
          `${input.decision} grammar/proofreading authentic-writing verification cannot include verified override fields.`,
        );
      }
      return;
  }
}

function buildVerificationMetadata(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
) {
  return {
    source_type: input.hypothesis.sourceType,
    stage6a_domain_module: input.hypothesis.domainModule,
    stage6a_rule: input.hypothesis.rule,
    observed_text: input.hypothesis.observedText,
    target_text: input.hypothesis.targetText,
    context_text: input.hypothesis.contextText,
    ...input.hypothesis.sourceRef.metadata,
    ...input.metadata,
  };
}

function buildVerificationCommand(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
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
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
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
  verificationInput: WritingEngineStage6bAuthenticSubmissionVerificationInput;
  verificationRecord: ParentVerificationRecord;
}): WritingEngineStage6bAuthenticSubmissionVerificationResult {
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

export function buildGrammarProofreadingAuthenticSubmissionVerification(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
): WritingEngineStage6bAuthenticSubmissionVerificationBuildResult {
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

export function verifyGrammarProofreadingAuthenticSubmissionHypothesis(
  input: WritingEngineStage6bAuthenticSubmissionVerificationInput,
): WritingEngineStage6bAuthenticSubmissionVerificationResult {
  return buildGrammarProofreadingAuthenticSubmissionVerification(input).result;
}

export async function persistGrammarProofreadingAuthenticSubmissionVerification(
  input: WritingEngineStage6bAuthenticSubmissionVerificationPersistenceInput,
): Promise<WritingEngineStage6bAuthenticSubmissionVerificationResult> {
  const built = buildGrammarProofreadingAuthenticSubmissionVerification(
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
