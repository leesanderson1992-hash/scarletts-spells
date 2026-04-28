import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import {
  formatErrorPatternLabel,
  normaliseErrorPattern,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import {
  asWordFamilyId,
  normaliseWordFamilyId,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";

export type MisspellingAnalysisExtraMetadata = {
  detectedPrimaryCategory: SpellingCategory | null;
  parentOverrideCategory: SpellingCategory | null;
  parentOverrideFamilyId: string | null;
  parentOverrideDiagnosis: ErrorPattern | null;
  parentReviewedAt: string | null;
  markedCareless: boolean;
  detectedErrorPattern: ErrorPattern | null;
  selectedWordFamilyId: WordFamilyId | null;
};

export type MisspellingAnalysisRow = {
  suggested_word: string | null;
  error_type: SpellingCategory | null;
  secondary_error_type: SpellingCategory | null;
  confidence_score: number | null;
  is_parent_overridden: boolean | null;
  is_false_positive: boolean | null;
  notes: string | null;
};

export type ParsedMisspellingAnalysis = {
  suggestedWord: string;
  primaryCategory: SpellingCategory;
  effectiveCategory: SpellingCategory;
  detectedDiagnosis: ErrorPattern | null;
  effectiveDiagnosis: ErrorPattern | null;
  secondaryCategory: SpellingCategory | null;
  confidence: number;
  isParentOverridden: boolean;
  isFalsePositive: boolean;
  extra: MisspellingAnalysisExtraMetadata;
};

const DEFAULT_PRIMARY_CATEGORY: SpellingCategory = "Irregular/tricky memory word";

export const DEFAULT_ANALYSIS_EXTRA_METADATA: MisspellingAnalysisExtraMetadata = {
  detectedPrimaryCategory: null,
  parentOverrideCategory: null,
  parentOverrideFamilyId: null,
  parentOverrideDiagnosis: null,
  parentReviewedAt: null,
  markedCareless: false,
  detectedErrorPattern: null,
  selectedWordFamilyId: null,
};

function clampConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function parseExtraMetadata(
  notes: string | null,
): MisspellingAnalysisExtraMetadata {
  if (!notes) {
    return DEFAULT_ANALYSIS_EXTRA_METADATA;
  }

  try {
    const parsed = JSON.parse(notes) as Partial<{
      detectedPrimaryCategory: SpellingCategory;
      primaryCategory: SpellingCategory;
      parentOverrideCategory: SpellingCategory;
      parentOverrideFamilyId: string;
      parentOverrideDiagnosis: ErrorPattern;
      parentReviewedAt: string;
      markedCareless: boolean;
      detectedErrorPattern: ErrorPattern;
      selectedWordFamilyId: WordFamilyId;
    }>;

    return {
      detectedPrimaryCategory:
        parsed.detectedPrimaryCategory ?? parsed.primaryCategory ?? null,
      parentOverrideCategory: parsed.parentOverrideCategory ?? null,
      parentOverrideFamilyId:
        normaliseWordFamilyId(parsed.parentOverrideFamilyId) ?? null,
      parentOverrideDiagnosis: normaliseErrorPattern(
        parsed.parentOverrideDiagnosis,
      ),
      parentReviewedAt: parsed.parentReviewedAt ?? null,
      markedCareless: parsed.markedCareless ?? false,
      detectedErrorPattern: normaliseErrorPattern(parsed.detectedErrorPattern),
      selectedWordFamilyId: asWordFamilyId(parsed.selectedWordFamilyId) ?? null,
    };
  } catch {
    return DEFAULT_ANALYSIS_EXTRA_METADATA;
  }
}

export function parseAnalysisRow(
  row: MisspellingAnalysisRow,
  fallbackCorrectedWord: string,
): ParsedMisspellingAnalysis {
  const extra = parseExtraMetadata(row.notes);
  const primaryCategory =
    extra.detectedPrimaryCategory ?? row.error_type ?? DEFAULT_PRIMARY_CATEGORY;
  const effectiveCategory = extra.markedCareless
    ? "Careless performance error"
    : extra.parentOverrideCategory ?? row.error_type ?? primaryCategory;
  const effectiveDiagnosis =
    extra.parentOverrideDiagnosis ?? extra.detectedErrorPattern;

  return {
    suggestedWord: row.suggested_word ?? fallbackCorrectedWord,
    primaryCategory,
    effectiveCategory,
    detectedDiagnosis: extra.detectedErrorPattern,
    effectiveDiagnosis,
    secondaryCategory: row.secondary_error_type ?? null,
    confidence: clampConfidence(row.confidence_score),
    isParentOverridden:
      row.is_parent_overridden ??
      Boolean(
        extra.parentOverrideCategory ||
          extra.parentOverrideDiagnosis ||
          extra.parentOverrideFamilyId ||
          extra.markedCareless,
      ),
    isFalsePositive: row.is_false_positive ?? false,
    extra,
  };
}

export function stringifyAnalysisExtraMetadata(
  metadata: MisspellingAnalysisExtraMetadata,
): string {
  return JSON.stringify(metadata);
}

export function getDiagnosisSelectLabel(diagnosis: ErrorPattern | null) {
  return diagnosis ? formatErrorPatternLabel(diagnosis) : "Diagnosis still unclear";
}
