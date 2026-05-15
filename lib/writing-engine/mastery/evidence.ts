import type {
  MasteryEvidenceCommand,
  VerifiedOutcome,
  WritingEngineEvidenceType,
  WritingEngineEvidenceSourceContext,
} from "../types";

function getEvidenceTypeForOutcome(
  outcome: VerifiedOutcome,
): WritingEngineEvidenceType {
  switch (outcome.verification.sourceRef.sourceType) {
    case "authentic_writing":
    case "task_submission":
    case "writing_sample":
    case "writing_issue":
    case "writing_issue_suggestion":
      return "authentic_writing_issue";
    default:
      return "parent_verified_diagnostic";
  }
}

function getEvidenceSourceContextForOutcome(
  outcome: VerifiedOutcome,
): WritingEngineEvidenceSourceContext {
  switch (outcome.verification.sourceRef.sourceType) {
    case "manual_diagnostic":
    case "parent_verified_diagnostic":
      return "parent_verified_manual_diagnostic";
    default:
      return "verified_outcome";
  }
}

export function buildMasteryEvidenceCommand(
  outcome: VerifiedOutcome,
): MasteryEvidenceCommand | null {
  if (!outcome.shouldUpdateMastery || !outcome.microSkillKey) {
    return null;
  }

  return {
    childId: outcome.verification.childId,
    parentUserId: outcome.verification.parentUserId,
    microSkillKey: outcome.microSkillKey,
    evidenceType: getEvidenceTypeForOutcome(outcome),
    sourceContext: getEvidenceSourceContextForOutcome(outcome),
    sourceRef: outcome.verification.sourceRef,
    wasParentVerified: true,
    verificationDecision: outcome.verification.decision,
    competencySignal: null,
    metadata: {
      parent_verification_id: outcome.verification.id,
      verification_decision: outcome.verification.decision,
      original_suggested_category_code:
        outcome.verification.suggestion.suggestedCategoryCode,
      original_suggested_micro_skill_key:
        outcome.verification.suggestion.suggestedMicroSkillKey,
      original_suggested_template_key:
        outcome.verification.suggestion.suggestedTemplateKey,
      verified_category_code: outcome.categoryCode,
      verified_micro_skill_key: outcome.microSkillKey,
      verified_template_key: outcome.templateKey,
      target_word:
        outcome.verification.metadata.target_word ??
        outcome.verification.sourceRef.metadata?.targetWord ??
        null,
      child_spelling:
        outcome.verification.metadata.child_spelling ??
        outcome.verification.sourceRef.metadata?.childSpelling ??
        null,
      sentence_context:
        outcome.verification.metadata.sentence_context ??
        outcome.verification.sourceRef.metadata?.sentenceContext ??
        null,
      rule_metadata:
        outcome.verification.metadata.rule_metadata ??
        outcome.verification.sourceRef.metadata?.ruleMetadata ??
        null,
      classifier_version:
        outcome.verification.metadata.classifier_version ??
        outcome.verification.sourceRef.metadata?.classifierVersion ??
        null,
      spelling_diagnostic_attempt_id:
        outcome.verification.metadata.spelling_diagnostic_attempt_id ??
        outcome.verification.sourceRef.metadata?.spellingDiagnosticAttemptId ??
        null,
      source_type: outcome.verification.sourceRef.sourceType,
      source_entity_id: outcome.verification.sourceRef.sourceEntityId,
      original_suggestion: {
        categoryCode: outcome.verification.suggestion.suggestedCategoryCode,
        microSkillKey: outcome.verification.suggestion.suggestedMicroSkillKey,
        templateKey: outcome.verification.suggestion.suggestedTemplateKey,
      },
      verified_truth: {
        categoryCode: outcome.categoryCode,
        microSkillKey: outcome.microSkillKey,
        templateKey: outcome.templateKey,
      },
      ...outcome.metadata,
    },
  };
}
