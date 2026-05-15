import { analyseSpellingSample } from "@/lib/spelling/detectMisspellings";
import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import {
  formatErrorPatternLabel,
  normaliseErrorPattern,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import { stripNonSpellingSections } from "@/lib/courses/spelling-analysis-text";
import {
  asWordFamilyId,
  normaliseWordFamilyId,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";
import type { createClient } from "@/lib/supabase/server";

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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type WritingSampleForAnalysis = {
  id: string;
  child_id: string;
  sample_text: string;
};

type PriorOverrideRow = MisspellingAnalysisRow & {
  misspelled_word: string;
  corrected_word: string;
};

type PriorOverride = {
  familyId: string | null;
  diagnosis: ReturnType<typeof parseAnalysisRow>["extra"]["parentOverrideDiagnosis"];
};

function clampConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
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

function buildOverrideKey(misspelledWord: string, correctedWord: string) {
  return `${misspelledWord.trim().toLowerCase()}::${correctedWord.trim().toLowerCase()}`;
}

async function getPriorOverrides(
  supabase: SupabaseServerClient,
  sample: WritingSampleForAnalysis,
  parentUserId: string,
) {
  const { data: priorRows } = await supabase
    .from("misspelling_instances")
    .select(
      "misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes",
    )
    .eq("parent_user_id", parentUserId)
    .eq("child_id", sample.child_id)
    .eq("is_parent_overridden", true)
    .not("notes", "is", null)
    .order("created_at", { ascending: false });

  const exactPairOverrides = new Map<string, PriorOverride>();

  for (const row of (priorRows ?? []) as PriorOverrideRow[]) {
    const parsed = parseAnalysisRow(
      row,
      row.corrected_word,
    );
    const familyId = parsed.extra.parentOverrideFamilyId;
    const diagnosis = parsed.extra.parentOverrideDiagnosis;

    if (!familyId && !diagnosis) {
      continue;
    }

    const exactKey = buildOverrideKey(row.misspelled_word, row.corrected_word);
    if (!exactPairOverrides.has(exactKey)) {
      exactPairOverrides.set(exactKey, {
        familyId: normaliseWordFamilyId(familyId),
        diagnosis: diagnosis ?? null,
      });
    }
  }

  return exactPairOverrides;
}

export async function buildMisspellingRows(
  sample: WritingSampleForAnalysis,
  parentUserId: string,
  priorOverrides: Map<string, PriorOverride>,
) {
  const analysisText = stripNonSpellingSections(sample.sample_text);
  const analysis = analyseSpellingSample(analysisText);

  return analysis.misspellings.map((item) => ({
    is_parent_overridden: priorOverrides.has(
      buildOverrideKey(item.misspelling, item.correction),
    ),
    writing_sample_id: sample.id,
    child_id: sample.child_id,
    parent_user_id: parentUserId,
    misspelled_word: item.misspelling,
    corrected_word: item.correction,
    suggested_word: item.correction,
    error_type: item.category,
    secondary_error_type: item.secondaryCategory,
    confidence_score: clampConfidence(item.confidence),
    is_false_positive: false,
    word_family_id: null,
    context_text: item.token.raw,
    position_start: item.token.start,
    position_end: item.token.end,
    notes: stringifyAnalysisExtraMetadata({
      detectedPrimaryCategory: item.category,
      parentOverrideCategory: null,
      parentOverrideFamilyId:
        normaliseWordFamilyId(
          priorOverrides.get(
            buildOverrideKey(item.misspelling, item.correction),
          )?.familyId,
        ) ?? null,
      parentOverrideDiagnosis:
        priorOverrides.get(
          buildOverrideKey(item.misspelling, item.correction),
        )?.diagnosis ?? null,
      parentReviewedAt: null,
      markedCareless: false,
      detectedErrorPattern: item.errorPattern,
      selectedWordFamilyId: asWordFamilyId(item.wordFamilyId),
    }),
  }));
}

export async function replaceAnalysisForSample(
  supabase: SupabaseServerClient,
  sample: WritingSampleForAnalysis,
  parentUserId: string,
) {
  const priorOverrides = await getPriorOverrides(
    supabase,
    sample,
    parentUserId,
  );

  const { error: deleteError } = await supabase
    .from("misspelling_instances")
    .delete()
    .eq("writing_sample_id", sample.id)
    .eq("parent_user_id", parentUserId);

  if (deleteError) {
    return { error: deleteError };
  }

  const rows = await buildMisspellingRows(
    sample,
    parentUserId,
    priorOverrides,
  );

  if (rows.length === 0) {
    return { error: null };
  }

  const { error: insertError } = await supabase
    .from("misspelling_instances")
    .insert(rows);

  return { error: insertError };
}
