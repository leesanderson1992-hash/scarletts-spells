import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import {
  dictationVariantBlockers,
  dictationVariants,
  selectDictationVariant,
  type DictationVariant,
} from "./authoring";
import type { WordDraftPayload } from "./contracts";

export type CandidateDictionary = {
  canonicalWordId: string;
  dictionary?: WordDraftPayload;
};
export type SelectedDictation = {
  id: string;
  source_row_hash: string;
  canonical_word_id: string;
  dictation_sentence: string;
  dictation_target_token_index: number;
  audio_text: string;
  row_status: string;
  review_status: string;
};

/** The selected variant identity is copied into the immutable snapshot's dictation authority. */
export async function loadDictationPool(
  db: SupabaseClient,
  ids: string[],
  seed: string,
  candidates: readonly CandidateDictionary[] = [],
): Promise<Map<string, SelectedDictation>> {
  const selected = new Map<string, SelectedDictation>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await db
      .from("teaching_dictionary_dictation_heads")
      .select(
        "canonical_word_id,teaching_dictionary_dictation_sets(id,variants,content_fingerprint)",
      )
      .in("canonical_word_id", ids.slice(offset, offset + 100));
    if (result.error)
      throw new Error(
        `TEACHING_DICTATION_POOL_READ_FAILED: ${result.error.message}`,
      );
    for (const head of result.data ?? []) {
      const set = Array.isArray(head.teaching_dictionary_dictation_sets)
        ? head.teaching_dictionary_dictation_sets[0]
        : head.teaching_dictionary_dictation_sets;
      if (!set) continue;
      const variants = set.variants as DictationVariant[];
      const variant = selectDictationVariant(
        variants,
        `${seed}:${head.canonical_word_id}:${set.id}`,
      );
      if (variant)
        selected.set(
          head.canonical_word_id,
          projection(
            head.canonical_word_id,
            set.id,
            set.content_fingerprint,
            variant,
          ),
        );
    }
  }
  for (const candidate of candidates) {
    if (!candidate.dictionary) continue;
    const variants = dictationVariants(candidate.dictionary);
    if (
      dictationVariantBlockers(candidate.dictionary.displayWord, variants)
        .length
    ) {
      selected.delete(candidate.canonicalWordId);
      continue;
    }
    const fingerprint = fingerprintSnapshotValue(variants);
    const variant = selectDictationVariant(
      variants,
      `${seed}:${candidate.canonicalWordId}:${fingerprint}`,
    );
    if (variant)
      selected.set(
        candidate.canonicalWordId,
        projection(
          candidate.canonicalWordId,
          `proposed:${fingerprint}`,
          fingerprint,
          variant,
        ),
      );
  }
  return selected;
}
function projection(
  wordId: string,
  setId: string,
  hash: string,
  variant: DictationVariant,
): SelectedDictation {
  return {
    id: `${setId}:${variant.id}`,
    source_row_hash: hash,
    canonical_word_id: wordId,
    dictation_sentence: variant.sentence,
    dictation_target_token_index: variant.targetTokenIndex,
    audio_text: variant.audioText,
    row_status: "active",
    review_status: "approved_for_first_exposure",
  };
}
