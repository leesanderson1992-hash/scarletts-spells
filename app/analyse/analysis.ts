import { analyseSpellingSample } from "@/lib/spelling/detectMisspellings";
import { asWordFamilyId, normaliseWordFamilyId } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";

import {
  parseAnalysisRow,
  stringifyAnalysisExtraMetadata,
  type MisspellingAnalysisRow,
} from "./types";

export type WritingSampleForAnalysis = {
  id: string;
  child_id: string;
  sample_text: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PriorOverrideRow = MisspellingAnalysisRow & {
  misspelled_word: string;
  corrected_word: string;
};

type PriorOverride = {
  familyId: string | null;
  diagnosis: ReturnType<typeof parseAnalysisRow>["extra"]["parentOverrideDiagnosis"];
};

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
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
  const analysis = analyseSpellingSample(sample.sample_text);

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
