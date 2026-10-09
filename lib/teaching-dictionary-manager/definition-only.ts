import { isDeepStrictEqual } from "node:util";
import { emptyMorphology, WORD_METADATA_FIELDS, type WordDraftPayload } from "./contracts";

type Row = Record<string, unknown>;

/** Only a definition may change while an existing route or evidence source
 * still refers to the current dictionary, dictation and morphology versions. */
export function matchesPublishedFactsForDefinitionOnly(input: {
  payload: WordDraftPayload;
  word: Row;
  metadata: Row | null;
  dictation: Row | null;
  morphology: Row | null;
}): boolean {
  const { payload, word, metadata, dictation, morphology } = input;
  if (payload.routeContents.length > 0) return false;
  const same = (actual: unknown, expected: string) => String(actual ?? "") === expected;
  if (word.display_word !== payload.displayWord || !same(word.age_band, payload.ageBand)
    || !same(word.frequency_band, payload.frequencyBand) || !same(word.complexity_band, payload.complexityBand)
    || !same(word.source_category, payload.provenance.sourceCategory)
    || !same(word.source_name, payload.provenance.sourceName)
    || !same(word.source_url, payload.provenance.sourceUrl)
    || !same(word.source_licence, payload.provenance.sourceLicence)
    || !same(word.source_use_note, payload.provenance.sourceUseNote)
    || !same(word.confidence, payload.provenance.confidence)) return false;
  for (const field of WORD_METADATA_FIELDS) {
    if (!same(metadata?.[field], payload.metadata[field])) return false;
  }
  if ((metadata?.has_schwa ?? null) !== payload.metadata.has_schwa) return false;
  if (!dictation || dictation.dictation_sentence !== payload.dictationSentence
    || dictation.audio_text !== payload.dictationSentence
    || dictation.dictation_target_token_index !== payload.dictationTargetTokenIndex) return false;
  const expectedMorphology = morphology ? {
    parts: morphology.morphology_parts, joins: morphology.morphology_joins,
    featureKeys: morphology.feature_keys,
    rawSegmentation: morphology.raw_morpholex_segmentation ?? "",
    rawPartOfSpeech: morphology.raw_morpholex_pos ?? "",
    transformationNotes: morphology.transformation_notes ?? "",
    wordSum: morphology.word_sum ?? "",
    analysisStatus: morphology.analysis_status,
    reviewNotes: morphology.review_notes ?? "",
  } : emptyMorphology();
  return isDeepStrictEqual(payload.canonicalMorphology, expectedMorphology);
}
