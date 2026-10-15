import { dictationVariantBlockers, selectDictationVariant, type DictationVariant } from "@/lib/teaching-dictionary-manager/authoring";
import type { IngDictionaryWordV1 } from "./contracts";

/** Pools belong to the frozen word authority; the chosen text travels with the snapshot. */
export function applyIngDictationVariants(words: readonly IngDictionaryWordV1[], pools: Record<string, DictationVariant[]> | undefined, seed: string, authorityFingerprint: string): IngDictionaryWordV1[] {
  return words.map(word => {
    const variants = pools?.[word.canonicalWordId];
    if (!variants) return word;
    if (dictationVariantBlockers(word.word, variants).length) throw new Error("ing_dictation_variants_invalid");
    const selected = selectDictationVariant(variants, `${seed}:${word.canonicalWordId}`)!;
    return { ...word, dictationSentence: selected.sentence, audioText: selected.audioText,
      dictationVariant: { id: selected.id, targetTokenIndex: selected.targetTokenIndex, authorityFingerprint } };
  });
}
