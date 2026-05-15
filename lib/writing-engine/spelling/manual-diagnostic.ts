import type { WritingEngineCandidateHypothesis } from "../types";

import { interpretManualSpellingDiagnostic } from "./manual-diagnostic-rules";
import type {
  ManualSpellingDiagnosticInput,
  ManualSpellingDiagnosticResult,
} from "./manual-diagnostic-types";

function buildSourceEntityId(input: {
  targetWord: string;
  childSpelling: string;
  sentenceContext: string | null;
}) {
  const contextPart = input.sentenceContext
    ? input.sentenceContext.toLowerCase().replace(/\s+/g, " ").trim()
    : "";

  return [
    "manual_diagnostic",
    input.targetWord.toLowerCase(),
    input.childSpelling.toLowerCase(),
    contextPart,
  ].join("::");
}

export function diagnoseManualSpelling(
  input: ManualSpellingDiagnosticInput,
): ManualSpellingDiagnosticResult {
  const targetWord = input.targetWord.trim().toLowerCase();
  const childSpelling = input.childSpelling.trim().toLowerCase();
  const sentenceContext = input.sentenceContext?.trim() || null;
  const interpretation = interpretManualSpellingDiagnostic({
    targetWord,
    childSpelling,
    sentenceContext,
  });
  const sourceRef = {
    sourceType: "manual_diagnostic" as const,
    sourceEntityId: buildSourceEntityId({
      targetWord,
      childSpelling,
      sentenceContext,
    }),
    metadata: {
      targetWord,
      childSpelling,
      sentenceContext,
      ruleKey: interpretation.ruleMetadata.ruleKey,
      errorPattern: interpretation.errorPattern,
      teachingFamilyId: interpretation.teachingFamilyId,
      similarPracticeWords: interpretation.resolvedSuggestion.similarPracticeWords,
      prerequisiteGapKeys:
        interpretation.resolvedSuggestion.possiblePrerequisiteGapKeys,
      hasDiagnosticConcern: interpretation.hasDiagnosticConcern,
      explanation: interpretation.explanation,
    },
  };

  const candidateHypothesis = {
    domainModule: "spelling",
    suggestedCategoryCode: interpretation.likelyErrorCategory,
    suggestedMicroSkillKey:
      interpretation.resolvedSuggestion.suggestedMicroSkillKey,
    suggestedTemplateKey:
      interpretation.resolvedSuggestion.recommendedLessonTemplateKey,
    confidence: interpretation.confidenceScore,
    notes: interpretation.explanation,
    sourceRef,
    metadata: {
      targetWord,
      childSpelling,
      sentenceContext,
      likelyErrorCategory: interpretation.likelyErrorCategory,
      possiblePrerequisiteGapKeys:
        interpretation.resolvedSuggestion.possiblePrerequisiteGapKeys,
      similarPracticeWords: interpretation.resolvedSuggestion.similarPracticeWords,
      ruleMetadata: interpretation.ruleMetadata,
      hasDiagnosticConcern: interpretation.hasDiagnosticConcern,
    },
  } satisfies WritingEngineCandidateHypothesis;

  return {
    sourceType: "manual_diagnostic",
    sourceRef,
    targetWord,
    childSpelling,
    sentenceContext,
    likelyErrorCategory: interpretation.likelyErrorCategory,
    suggestedMicroSkillKey:
      interpretation.resolvedSuggestion.suggestedMicroSkillKey,
    possiblePrerequisiteGapKeys:
      interpretation.resolvedSuggestion.possiblePrerequisiteGapKeys,
    recommendedLessonTemplateKey:
      interpretation.resolvedSuggestion.recommendedLessonTemplateKey,
    similarPracticeWords: interpretation.resolvedSuggestion.similarPracticeWords,
    confidenceScore: interpretation.confidenceScore,
    explanation: interpretation.explanation,
    ruleMetadata: interpretation.ruleMetadata,
    hasDiagnosticConcern: interpretation.hasDiagnosticConcern,
    candidateHypothesis,
  };
}
