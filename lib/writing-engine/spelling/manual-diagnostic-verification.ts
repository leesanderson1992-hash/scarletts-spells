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
  ManualSpellingDiagnosticVerificationBuildResult,
  ManualSpellingDiagnosticResult,
  ManualSpellingDiagnosticVerificationInput,
  ManualSpellingDiagnosticVerificationPersistenceInput,
  ManualSpellingDiagnosticVerificationResult,
} from "./manual-diagnostic-types";

function hasMeaningfulOverrideField(
  input: ManualSpellingDiagnosticVerificationInput,
  diagnostic: ManualSpellingDiagnosticResult,
) {
  return (
    (input.verifiedCategoryCode ?? null) !== null &&
      input.verifiedCategoryCode !==
        diagnostic.candidateHypothesis.suggestedCategoryCode ||
    (input.verifiedMicroSkillKey ?? null) !== null &&
      input.verifiedMicroSkillKey !== diagnostic.suggestedMicroSkillKey ||
    (input.verifiedTemplateKey ?? null) !== null &&
      input.verifiedTemplateKey !== diagnostic.recommendedLessonTemplateKey
  );
}

function hasAnyVerifiedOverrideField(
  input: ManualSpellingDiagnosticVerificationInput,
) {
  return (
    (input.verifiedCategoryCode ?? null) !== null ||
    (input.verifiedMicroSkillKey ?? null) !== null ||
    (input.verifiedTemplateKey ?? null) !== null
  );
}

function assertValidVerificationSemantics(
  input: ManualSpellingDiagnosticVerificationInput,
) {
  const diagnostic = input.diagnosticResult;
  const hasAnyOverrideField = hasAnyVerifiedOverrideField(input);
  const hasMeaningfulOverride = hasMeaningfulOverrideField(input, diagnostic);

  switch (input.decision) {
    case "accepted":
      if (hasAnyOverrideField) {
        throw new Error(
          "Accepted manual diagnostic verification cannot include verified override fields.",
        );
      }
      return;
    case "overridden":
      if (!hasMeaningfulOverride) {
        throw new Error(
          "Overridden manual diagnostic verification must include at least one meaningful verified override field.",
        );
      }
      return;
    case "false_positive":
    case "not_a_learning_issue":
      if (hasAnyOverrideField) {
        throw new Error(
          `${input.decision} manual diagnostic verification cannot include verified override fields.`,
        );
      }
      return;
  }
}

function buildVerificationMetadata(
  diagnostic: ManualSpellingDiagnosticResult,
  input: ManualSpellingDiagnosticVerificationInput,
) {
  return {
    source_type: diagnostic.sourceType,
    target_word: diagnostic.targetWord,
    child_spelling: diagnostic.childSpelling,
    sentence_context: diagnostic.sentenceContext,
    likely_error_category: diagnostic.likelyErrorCategory,
    possible_prerequisite_gap_keys: diagnostic.possiblePrerequisiteGapKeys,
    similar_practice_words: diagnostic.similarPracticeWords,
    explanation: diagnostic.explanation,
    rule_metadata: diagnostic.ruleMetadata,
    has_diagnostic_concern: diagnostic.hasDiagnosticConcern,
    ...input.metadata,
  };
}

function buildVerificationCommand(
  input: ManualSpellingDiagnosticVerificationInput,
): RecordParentVerificationCommand {
  const diagnostic = input.diagnosticResult;
  const suggestion = diagnostic.candidateHypothesis;

  return {
    childId: input.childId,
    parentUserId: input.parentUserId,
    domainModule: suggestion.domainModule,
    sourceRef: diagnostic.sourceRef,
    suggestion,
    decision: input.decision,
    verifiedCategoryCode: input.verifiedCategoryCode ?? null,
    verifiedMicroSkillKey: input.verifiedMicroSkillKey ?? null,
    verifiedTemplateKey: input.verifiedTemplateKey ?? null,
    note: input.note ?? null,
    metadata: buildVerificationMetadata(diagnostic, input),
  };
}

function buildParentVerifiedTruth(
  verification: ParentVerificationRecord,
  diagnostic: ManualSpellingDiagnosticResult,
) {
  if (
    verification.decision === "false_positive" ||
    verification.decision === "not_a_learning_issue"
  ) {
    return null;
  }

  return {
    categoryCode:
      verification.verifiedCategoryCode ??
      diagnostic.candidateHypothesis.suggestedCategoryCode,
    microSkillKey:
      verification.verifiedMicroSkillKey ?? diagnostic.suggestedMicroSkillKey,
    templateKey:
      verification.verifiedTemplateKey ??
      diagnostic.recommendedLessonTemplateKey,
  };
}

function buildVerificationResult(input: {
  diagnosticResult: ManualSpellingDiagnosticResult;
  decision: ManualSpellingDiagnosticVerificationInput["decision"];
  verificationRecord: ParentVerificationRecord;
}): ManualSpellingDiagnosticVerificationResult {
  const verifiedOutcome =
    createVerifiedOutcomeFromParentVerification(input.verificationRecord);

  return {
    sourceType: "manual_diagnostic",
    diagnosticResult: input.diagnosticResult,
    originalSuggestion: input.diagnosticResult.candidateHypothesis,
    parentDecision: input.decision,
    parentVerifiedTruth: buildParentVerifiedTruth(
      input.verificationRecord,
      input.diagnosticResult,
    ),
    verificationRecord: input.verificationRecord,
    verifiedOutcome,
    hasMasteryUpdatingIntent: verifiedOutcome.shouldUpdateMastery,
  };
}

export function buildManualSpellingDiagnosticVerification(
  input: ManualSpellingDiagnosticVerificationInput,
): ManualSpellingDiagnosticVerificationBuildResult {
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
      diagnosticResult: input.diagnosticResult,
      decision: input.decision,
      verificationRecord,
    }),
  };
}

export function verifyManualSpellingDiagnostic(
  input: ManualSpellingDiagnosticVerificationInput,
): ManualSpellingDiagnosticVerificationResult {
  return buildManualSpellingDiagnosticVerification(input).result;
}

export async function persistManualSpellingDiagnosticVerification(
  input: ManualSpellingDiagnosticVerificationPersistenceInput,
): Promise<ManualSpellingDiagnosticVerificationResult> {
  const built = buildManualSpellingDiagnosticVerification(
    input.verificationInput,
  );
  const verificationRecord = await recordParentVerification({
    command: built.command,
    repository: input.repository,
    nowIso: input.nowIso ?? input.verificationInput.nowIso,
  });

  return buildVerificationResult({
    diagnosticResult: input.verificationInput.diagnosticResult,
    decision: input.verificationInput.decision,
    verificationRecord,
  });
}
