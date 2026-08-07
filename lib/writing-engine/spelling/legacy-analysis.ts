import { analyseSpellingTokens } from "@/lib/spelling/detectMisspellings";
import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import {
  formatErrorPatternLabel,
  normaliseErrorPattern,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import { stripNonSpellingSections } from "@/lib/courses/spelling-analysis-text";
import { tokenizeText } from "@/lib/spelling/tokenize";
import {
  asWordFamilyId,
  normaliseWordFamilyId,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";
import type { createClient } from "@/lib/supabase/server";
import { findResolverVisibleTokenSafeCanonicalMappings } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";
import {
  mergeHeuristicAndCanonicalMisspellings,
  type CanonicalMisspellingDetectionProvenance,
} from "@/lib/writing-engine/spelling/canonical-misspelling-intake";

export type MisspellingAnalysisExtraMetadata = {
  detectedPrimaryCategory: SpellingCategory | null;
  parentOverrideCategory: SpellingCategory | null;
  parentOverrideFamilyId: string | null;
  parentOverrideDiagnosis: ErrorPattern | null;
  parentReviewedAt: string | null;
  parentAuthoredMissedWord: boolean;
  markedCareless: boolean;
  detectedErrorPattern: ErrorPattern | null;
  selectedWordFamilyId: WordFamilyId | null;
  detectionSource: "heuristic" | "resolver_visible_canonical" | null;
  canonicalDetection: CanonicalMisspellingDetectionProvenance | null;
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
  parentAuthoredMissedWord: false,
  markedCareless: false,
  detectedErrorPattern: null,
  selectedWordFamilyId: null,
  detectionSource: null,
  canonicalDetection: null,
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
  category: SpellingCategory | null;
  familyId: string | null;
  diagnosis: ReturnType<typeof parseAnalysisRow>["extra"]["parentOverrideDiagnosis"];
};

type ExistingAnalysisRow = PriorOverrideRow & {
  id: string;
  writing_sample_id: string;
  child_id: string;
  parent_user_id: string;
  word_family_id: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
};

function clampConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

export function parseAnalysisExtraMetadata(
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
      parentAuthoredMissedWord: boolean;
      markedCareless: boolean;
      detectedErrorPattern: ErrorPattern;
      selectedWordFamilyId: WordFamilyId;
      detectionSource: "heuristic" | "resolver_visible_canonical";
      canonicalDetection: CanonicalMisspellingDetectionProvenance;
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
      parentAuthoredMissedWord: parsed.parentAuthoredMissedWord ?? false,
      markedCareless: parsed.markedCareless ?? false,
      detectedErrorPattern: normaliseErrorPattern(parsed.detectedErrorPattern),
      selectedWordFamilyId: asWordFamilyId(parsed.selectedWordFamilyId) ?? null,
      detectionSource:
        parsed.detectionSource === "heuristic" ||
        parsed.detectionSource === "resolver_visible_canonical"
          ? parsed.detectionSource
          : null,
      canonicalDetection:
        parsed.canonicalDetection &&
        parsed.canonicalDetection.detectionSource ===
          "resolver_visible_canonical"
          ? parsed.canonicalDetection
          : null,
    };
  } catch {
    return DEFAULT_ANALYSIS_EXTRA_METADATA;
  }
}

export function parseAnalysisRow(
  row: MisspellingAnalysisRow,
  fallbackCorrectedWord: string,
): ParsedMisspellingAnalysis {
  const extra = parseAnalysisExtraMetadata(row.notes);
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
  const { data: priorRows, error } = await supabase
    .from("misspelling_instances")
    .select(
      "misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes",
    )
    .eq("parent_user_id", parentUserId)
    .eq("child_id", sample.child_id)
    .eq("is_parent_overridden", true)
    .not("notes", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to read prior spelling overrides.");
  }

  const exactPairOverrides = new Map<string, PriorOverride>();

  for (const row of (priorRows ?? []) as PriorOverrideRow[]) {
    const parsed = parseAnalysisRow(
      row,
      row.corrected_word,
    );
    const category = parsed.extra.parentOverrideCategory;
    const familyId = parsed.extra.parentOverrideFamilyId;
    const diagnosis = parsed.extra.parentOverrideDiagnosis;

    if (!category && !familyId && !diagnosis) {
      continue;
    }

    const exactKey = buildOverrideKey(row.misspelled_word, row.corrected_word);
    if (!exactPairOverrides.has(exactKey)) {
      exactPairOverrides.set(exactKey, {
        category,
        familyId: normaliseWordFamilyId(familyId),
        diagnosis: diagnosis ?? null,
      });
    }
  }

  return exactPairOverrides;
}

async function getExistingAnalysisRows(
  supabase: SupabaseServerClient,
  sample: WritingSampleForAnalysis,
  parentUserId: string,
) {
  const { data, error } = await supabase
    .from("misspelling_instances")
    .select(
      "id, writing_sample_id, child_id, parent_user_id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes, word_family_id, context_text, position_start, position_end",
    )
    .eq("writing_sample_id", sample.id)
    .eq("parent_user_id", parentUserId)
    .eq("child_id", sample.child_id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to read existing spelling analysis.");
  }

  return (data ?? []) as ExistingAnalysisRow[];
}

function buildOccurrenceKey(input: {
  position_start: number | null;
  position_end: number | null;
  misspelled_word: string;
  corrected_word: string;
}) {
  return [
    input.position_start ?? "null",
    input.position_end ?? "null",
    input.misspelled_word.trim().toLowerCase(),
    input.corrected_word.trim().toLowerCase(),
  ].join(":");
}

function buildPositionKey(input: {
  position_start: number | null;
  position_end: number | null;
}) {
  return `${input.position_start ?? "null"}:${input.position_end ?? "null"}`;
}

function hasDurableParentDecision(row: ExistingAnalysisRow) {
  const parsed = parseAnalysisRow(row, row.corrected_word);

  return Boolean(
    row.is_parent_overridden ||
      row.is_false_positive ||
      parsed.extra.parentReviewedAt ||
      parsed.extra.parentAuthoredMissedWord ||
      parsed.extra.markedCareless ||
      parsed.extra.parentOverrideCategory ||
      parsed.extra.parentOverrideDiagnosis ||
      parsed.extra.parentOverrideFamilyId,
  );
}

function preserveExistingRow(row: ExistingAnalysisRow) {
  return {
    id: row.id,
    writing_sample_id: row.writing_sample_id,
    child_id: row.child_id,
    parent_user_id: row.parent_user_id,
    misspelled_word: row.misspelled_word,
    corrected_word: row.corrected_word,
    suggested_word: row.suggested_word,
    error_type: row.error_type,
    secondary_error_type: row.secondary_error_type,
    confidence_score: row.confidence_score,
    is_parent_overridden: row.is_parent_overridden,
    is_false_positive: row.is_false_positive,
    word_family_id: row.word_family_id,
    context_text: row.context_text,
    position_start: row.position_start,
    position_end: row.position_end,
    notes: row.notes,
  };
}

export async function buildMisspellingRows(
  supabase: SupabaseServerClient,
  sample: WritingSampleForAnalysis,
  parentUserId: string,
  priorOverrides: Map<string, PriorOverride>,
  existingRows: ExistingAnalysisRow[],
) {
  const analysisText = stripNonSpellingSections(sample.sample_text);
  const tokens = tokenizeText(analysisText);
  const heuristicAnalysis = analyseSpellingTokens(tokens);
  const canonicalMappings =
    process.env.WRITING_ENGINE_RESOLVER_VISIBLE_CANONICAL_MAPPINGS === "enabled"
      ? await findResolverVisibleTokenSafeCanonicalMappings({
          supabase,
          observedNormalizedTokens: tokens.map((token) => token.normalized),
        })
      : [];
  const merged = mergeHeuristicAndCanonicalMisspellings({
    tokens,
    heuristicMisspellings: heuristicAnalysis.misspellings,
    canonicalMappings,
  });
  const existingByOccurrence = new Map(
    existingRows.map((row) => [buildOccurrenceKey(row), row]),
  );
  const reviewedByPosition = new Map(
    existingRows
      .filter(hasDurableParentDecision)
      .map((row) => [buildPositionKey(row), row]),
  );
  const retainedIds = new Set<string>();
  const rows = merged.map((item) => {
    const positionKey = buildPositionKey({
      position_start: item.token.start,
      position_end: item.token.end,
    });
    const reviewedAtPosition = reviewedByPosition.get(positionKey);

    if (reviewedAtPosition) {
      retainedIds.add(reviewedAtPosition.id);
      return preserveExistingRow(reviewedAtPosition);
    }

    const occurrenceKey = buildOccurrenceKey({
      position_start: item.token.start,
      position_end: item.token.end,
      misspelled_word: item.misspelling,
      corrected_word: item.correction,
    });
    const existing = existingByOccurrence.get(occurrenceKey);
    const existingParsed = existing
      ? parseAnalysisRow(existing, existing.corrected_word)
      : null;
    const override = priorOverrides.get(
      buildOverrideKey(item.misspelling, item.correction),
    );

    if (existing) {
      retainedIds.add(existing.id);
    }

    return {
      id: existing?.id,
      is_parent_overridden: Boolean(
        existing?.is_parent_overridden ||
          override?.category ||
          override?.familyId ||
          override?.diagnosis,
      ),
      writing_sample_id: sample.id,
      child_id: sample.child_id,
      parent_user_id: parentUserId,
      misspelled_word: item.misspelling,
      corrected_word: item.correction,
      suggested_word: item.correction,
      error_type:
        existingParsed?.extra.parentOverrideCategory ??
        override?.category ??
        item.category,
      secondary_error_type: item.secondaryCategory,
      confidence_score: clampConfidence(item.confidence),
      is_false_positive: existing?.is_false_positive ?? false,
      word_family_id: existing?.word_family_id ?? null,
      context_text: item.token.raw,
      position_start: item.token.start,
      position_end: item.token.end,
      notes: stringifyAnalysisExtraMetadata({
        detectedPrimaryCategory: item.category,
        parentOverrideCategory:
          existingParsed?.extra.parentOverrideCategory ??
          override?.category ??
          null,
        parentOverrideFamilyId:
          normaliseWordFamilyId(
            existingParsed?.extra.parentOverrideFamilyId ?? override?.familyId,
          ) ?? null,
        parentOverrideDiagnosis:
          existingParsed?.extra.parentOverrideDiagnosis ??
          override?.diagnosis ??
          null,
        parentReviewedAt: existingParsed?.extra.parentReviewedAt ?? null,
        parentAuthoredMissedWord:
          existingParsed?.extra.parentAuthoredMissedWord ?? false,
        markedCareless: existingParsed?.extra.markedCareless ?? false,
        detectedErrorPattern: item.errorPattern,
        selectedWordFamilyId: asWordFamilyId(item.wordFamilyId),
        detectionSource: item.detectionSource,
        canonicalDetection: item.canonicalProvenance,
      }),
    };
  });

  for (const existing of existingRows) {
    if (!retainedIds.has(existing.id) && hasDurableParentDecision(existing)) {
      retainedIds.add(existing.id);
      rows.push(preserveExistingRow(existing));
    }
  }

  return rows.sort((left, right) =>
    (left.position_start ?? Number.MAX_SAFE_INTEGER) -
    (right.position_start ?? Number.MAX_SAFE_INTEGER),
  );
}

export async function replaceAnalysisForSample(
  supabase: SupabaseServerClient,
  sample: WritingSampleForAnalysis,
  parentUserId: string,
) {
  const [priorOverrides, existingRows] = await Promise.all([
    getPriorOverrides(supabase, sample, parentUserId),
    getExistingAnalysisRows(supabase, sample, parentUserId),
  ]);

  const rows = await buildMisspellingRows(
    supabase,
    sample,
    parentUserId,
    priorOverrides,
    existingRows,
  );
  const { error } = await supabase.rpc("replace_misspelling_analysis_atomic", {
    p_child_id: sample.child_id,
    p_parent_user_id: parentUserId,
    p_rows: rows,
    p_writing_sample_id: sample.id,
  });

  return { error };
}
