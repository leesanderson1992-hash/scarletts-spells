import { createHash } from "node:crypto";
import { normaliseWrittenSyllableBreakdown } from "./authoring";
import { WORD_METADATA_FIELDS } from "./contracts";

/** Fingerprint only the current shared source facts, never edited sheet values. */
export function overviewSourceHash(source: Record<string, unknown>): string {
  const text = (name: string) => String(source[name] ?? "");
  const array = (name: string) => Array.isArray(source[name]) ? source[name] : [];
  const facts = [
    text("source_row_hash"), text("display_word"), text("definition"),
    text("dictation_sentence"), Number(source.dictation_target_token_index ?? 0),
    text("age_band"), text("frequency_band"), text("complexity_band"),
    ...WORD_METADATA_FIELDS.map(text),
    normaliseWrittenSyllableBreakdown(text("written_syllable_breakdown")),
    source.has_schwa == null || source.has_schwa === "" ? null
      : String(source.has_schwa).toLowerCase(),
    text("raw_morpholex_segmentation"), text("raw_morpholex_pos"),
    array("morphology_parts"), array("feature_keys"), array("morphology_joins"),
    array("__morphology_transformations"), text("transformation_notes"),
    text("word_sum"), text("analysis_status"), text("morphology_review_notes"),
    text("source_category"), text("source_name"), text("source_url"),
    text("source_licence"), text("source_use_note"), text("confidence"),
  ];
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}
