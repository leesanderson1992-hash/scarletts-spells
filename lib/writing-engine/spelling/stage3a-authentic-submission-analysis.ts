import { detectMisspellings } from "../../spelling/detectMisspellings";
import type { SpellingCategory } from "../../spelling/categoriseError";
import type { ErrorPattern } from "../../spelling/errorPatterns";
import type { WordFamilyId } from "../../spelling/wordFamilies";

import type {
  WritingEngineCandidateHypothesis,
  WritingEngineSourceMetadata,
  WritingEngineSourceRef,
  WritingEngineStage1d1CatalogEntry,
  WritingEngineStage3TaskSubmission,
  WritingEngineStage3WritingSample,
} from "../types";
import {
  buildAuthenticWritingSourceRef as buildSharedAuthenticWritingSourceRef,
  normalizeAuthenticWritingSubmissionSource,
  type WritingEngineAuthenticSubmissionNormalization,
  type WritingEngineAuthenticSubmissionSourceTextOrigin,
} from "../analysis/authentic-submission";
import {
  resolveWritingEngineSpellingErrorCategory,
  type WritingEngineSpellingErrorCategoryResolution,
} from "./stage2b-error-category-vocabulary";
import {
  resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries,
  type WritingEngineStage2PrimaryWordToMiniSkillResolution,
} from "./stage2c-primary-mapping-resolver";
import {
  resolveStage2dLessonTemplateKey,
  type WritingEngineStage2dLessonTemplateResolution,
} from "./stage2d-lesson-template-registry";
import {
  resolveStage2eWordComplexity,
  type WritingEngineStage2eWordComplexityResolution,
} from "./stage2e-word-complexity-resolver";
import {
  resolveStage2fSimilarPractice,
  type WritingEngineStage2fSimilarPracticeResolution,
} from "./stage2f-similar-practice-resolver";

export type WritingEngineStage3aSourceTextOrigin =
  WritingEngineAuthenticSubmissionSourceTextOrigin;

export type WritingEngineStage3aAuthenticSubmissionInput = {
  taskSubmission: WritingEngineStage3TaskSubmission;
  writingSample?: WritingEngineStage3WritingSample | null;
  catalogEntries: WritingEngineStage1d1CatalogEntry[];
};

export type WritingEngineStage3aAuthenticSubmissionNormalization =
  WritingEngineAuthenticSubmissionNormalization;

export type WritingEngineStage3aAuthenticSubmissionHypothesis = {
  sourceType: "authentic_writing";
  sourceRef: WritingEngineSourceRef;
  observedText: string;
  suggestedReplacement: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  detectedCategoryLabel: SpellingCategory;
  secondaryCategoryLabel: SpellingCategory | null;
  errorPattern: ErrorPattern | null;
  wordFamilyId: WordFamilyId | null;
  categoryResolution: WritingEngineSpellingErrorCategoryResolution;
  microSkillResolution: WritingEngineStage2PrimaryWordToMiniSkillResolution;
  templateResolution: WritingEngineStage2dLessonTemplateResolution | null;
  complexityResolution: WritingEngineStage2eWordComplexityResolution | null;
  similarPracticeResolution: WritingEngineStage2fSimilarPracticeResolution | null;
  candidateHypothesis: WritingEngineCandidateHypothesis;
};

export type WritingEngineStage3aAuthenticSubmissionAnalysisResult = {
  sourceType: "authentic_writing";
  normalization: WritingEngineStage3aAuthenticSubmissionNormalization;
  hypotheses: WritingEngineStage3aAuthenticSubmissionHypothesis[];
};

function normalizeWord(word: string | null | undefined) {
  if (typeof word !== "string") {
    return null;
  }

  const normalized = word.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeConfidence(confidence: number) {
  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(1, Math.max(0, Number(confidence.toFixed(2))));
}

function normalizeCatalogEntries(
  catalogEntries: WritingEngineStage1d1CatalogEntry[],
) {
  return [...catalogEntries]
    .filter((entry) => entry.masteryDomainKey === "D4")
    .filter((entry) => entry.isActive)
    .filter((entry) => entry.isAssignable)
    .sort((left, right) => left.microSkillKey.localeCompare(right.microSkillKey));
}

function buildCandidateNotes(input: {
  observedText: string;
  suggestedReplacement: string;
  categoryResolution: WritingEngineSpellingErrorCategoryResolution;
  microSkillResolution: WritingEngineStage2PrimaryWordToMiniSkillResolution;
}) {
  const parts = [
    `Authentic writing spelling analysis suggested "${input.suggestedReplacement}" for "${input.observedText}".`,
  ];

  if (input.categoryResolution.status === "resolved") {
    parts.push(`Category: ${input.categoryResolution.category.label}.`);
  }

  if (input.microSkillResolution.status === "resolved") {
    parts.push(`Mini-skill: ${input.microSkillResolution.microSkillKey}.`);
  } else if (input.microSkillResolution.status === "ambiguous") {
    parts.push("Mini-skill mapping is ambiguous.");
  } else {
    parts.push("Mini-skill mapping is unresolved.");
  }

  return parts.join(" ");
}

function buildSourceMetadata(input: {
  normalization: WritingEngineStage3aAuthenticSubmissionNormalization;
  observedText: string;
  suggestedReplacement: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  detectedCategoryLabel: SpellingCategory;
  secondaryCategoryLabel: SpellingCategory | null;
  errorPattern: ErrorPattern | null;
  wordFamilyId: WordFamilyId | null;
  categoryResolution: WritingEngineSpellingErrorCategoryResolution;
  microSkillResolution: WritingEngineStage2PrimaryWordToMiniSkillResolution;
  templateResolution: WritingEngineStage2dLessonTemplateResolution | null;
  complexityResolution: WritingEngineStage2eWordComplexityResolution | null;
  similarPracticeResolution: WritingEngineStage2fSimilarPracticeResolution | null;
}) {
  return {
    taskSubmissionId: input.normalization.taskSubmissionId,
    writingSampleId: input.normalization.writingSampleId,
    sourceTextOrigin: input.normalization.sourceTextOrigin,
    sourceSpan: {
      positionStart: input.positionStart,
      positionEnd: input.positionEnd,
    },
    targetText: input.suggestedReplacement,
    childAttemptText: input.observedText,
    contextText: input.contextText,
    detectedCategoryLabel: input.detectedCategoryLabel,
    secondaryCategoryLabel: input.secondaryCategoryLabel,
    errorPattern: input.errorPattern,
    wordFamilyId: input.wordFamilyId,
    categoryResolution: input.categoryResolution,
    microSkillResolution: input.microSkillResolution,
    templateResolution: input.templateResolution,
    complexityResolution: input.complexityResolution,
    similarPracticeResolution: input.similarPracticeResolution,
  } satisfies WritingEngineSourceMetadata;
}

function buildAuthenticWritingSourceRef(input: {
  normalization: WritingEngineStage3aAuthenticSubmissionNormalization;
  observedText: string;
  suggestedReplacement: string;
  positionStart: number;
  positionEnd: number;
  metadata: WritingEngineSourceMetadata;
}) {
  return buildSharedAuthenticWritingSourceRef({
    normalization: input.normalization,
    observedText: input.observedText,
    targetText: input.suggestedReplacement,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    metadata: input.metadata,
  });
}

function buildStage3aHypothesis(input: {
  normalization: WritingEngineStage3aAuthenticSubmissionNormalization;
  catalogEntries: WritingEngineStage1d1CatalogEntry[];
  observedText: string;
  suggestedReplacement: string;
  contextText: string;
  positionStart: number;
  positionEnd: number;
  detectedCategoryLabel: SpellingCategory;
  secondaryCategoryLabel: SpellingCategory | null;
  errorPattern: ErrorPattern | null;
  wordFamilyId: WordFamilyId | null;
  confidence: number;
}) {
  const categoryResolution = resolveWritingEngineSpellingErrorCategory(
    input.detectedCategoryLabel,
  );
  const microSkillResolution = resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries({
    word: input.suggestedReplacement,
    catalogEntries: input.catalogEntries,
  });

  const resolvedCatalogEntry =
    microSkillResolution.status === "resolved"
      ? input.catalogEntries.find(
          (entry) => entry.microSkillKey === microSkillResolution.microSkillKey,
        ) ?? null
      : null;

  const templateResolution = resolvedCatalogEntry
    ? resolveStage2dLessonTemplateKey({
        catalogEntry: resolvedCatalogEntry,
        practiceRoute: resolvedCatalogEntry.practiceRoute,
        preferredTemplateKeys: resolvedCatalogEntry.allowedTemplateKeys,
      })
    : null;
  const complexityResolution = resolvedCatalogEntry
    ? resolveStage2eWordComplexity({
        word: input.suggestedReplacement,
        catalogEntry: resolvedCatalogEntry,
      })
    : null;
  const similarPracticeResolution = resolvedCatalogEntry
    ? resolveStage2fSimilarPractice({
        word: input.suggestedReplacement,
        catalogEntry: resolvedCatalogEntry,
      })
    : null;

  const metadata = buildSourceMetadata({
    normalization: input.normalization,
    observedText: input.observedText,
    suggestedReplacement: input.suggestedReplacement,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    detectedCategoryLabel: input.detectedCategoryLabel,
    secondaryCategoryLabel: input.secondaryCategoryLabel,
    errorPattern: input.errorPattern,
    wordFamilyId: input.wordFamilyId,
    categoryResolution,
    microSkillResolution,
    templateResolution,
    complexityResolution,
    similarPracticeResolution,
  });

  const sourceRef = buildAuthenticWritingSourceRef({
    normalization: input.normalization,
    observedText: input.observedText,
    suggestedReplacement: input.suggestedReplacement,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    metadata,
  });

  const candidateHypothesis = {
    domainModule: "spelling",
    suggestedCategoryCode:
      categoryResolution.status === "resolved"
        ? categoryResolution.category.code
        : null,
    suggestedMicroSkillKey:
      microSkillResolution.status === "resolved"
        ? microSkillResolution.microSkillKey
        : null,
    suggestedTemplateKey:
      templateResolution?.status === "resolved"
        ? templateResolution.templateKey
        : null,
    confidence: normalizeConfidence(input.confidence),
    notes: buildCandidateNotes({
      observedText: input.observedText,
      suggestedReplacement: input.suggestedReplacement,
      categoryResolution,
      microSkillResolution,
    }),
    sourceRef,
    metadata,
  } satisfies WritingEngineCandidateHypothesis;

  return {
    sourceType: "authentic_writing" as const,
    sourceRef,
    observedText: input.observedText,
    suggestedReplacement: input.suggestedReplacement,
    contextText: input.contextText,
    positionStart: input.positionStart,
    positionEnd: input.positionEnd,
    detectedCategoryLabel: input.detectedCategoryLabel,
    secondaryCategoryLabel: input.secondaryCategoryLabel,
    errorPattern: input.errorPattern,
    wordFamilyId: input.wordFamilyId,
    categoryResolution,
    microSkillResolution,
    templateResolution,
    complexityResolution,
    similarPracticeResolution,
    candidateHypothesis,
  } satisfies WritingEngineStage3aAuthenticSubmissionHypothesis;
}

export function analyzeStage3aAuthenticSubmissionSpelling(
  input: WritingEngineStage3aAuthenticSubmissionInput,
): WritingEngineStage3aAuthenticSubmissionAnalysisResult {
  const normalization = normalizeAuthenticWritingSubmissionSource({
    taskSubmission: input.taskSubmission,
    writingSample: input.writingSample,
  });

  if (!normalization.analysisText) {
    return {
      sourceType: "authentic_writing",
      normalization,
      hypotheses: [],
    };
  }

  const catalogEntries = normalizeCatalogEntries(input.catalogEntries);
  const misspellings = detectMisspellings(normalization.analysisText);

  const hypotheses = misspellings.map((misspelling) => {
    const observedText = normalizeWord(misspelling.misspelling) ?? misspelling.misspelling;
    const suggestedReplacement =
      normalizeWord(misspelling.correction) ?? misspelling.correction;
    const contextText = misspelling.token.raw.trim();

    return buildStage3aHypothesis({
      normalization,
      catalogEntries,
      observedText,
      suggestedReplacement,
      contextText,
      positionStart: misspelling.token.start,
      positionEnd: misspelling.token.end,
      detectedCategoryLabel: misspelling.category,
      secondaryCategoryLabel: misspelling.secondaryCategory,
      errorPattern: misspelling.errorPattern,
      wordFamilyId: misspelling.wordFamilyId,
      confidence: misspelling.confidence,
    });
  });

  return {
    sourceType: "authentic_writing",
    normalization,
    hypotheses,
  };
}
