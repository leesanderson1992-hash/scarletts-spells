import { FLAT_IMPORT_PART_LIMIT, type flatMorphology } from "./csv";
import type { DictionarySenseSet } from "./senses";

/** One complete reviewed bundle per spelling. Every sense has its own parts and family choice. */
export type MultiSenseCsvBundle = {
  wordId: string;
  displayWord: string;
  sourceSenseReviewedAt: string;
  senseSet: DictionarySenseSet;
  analyses: {
    senseId: string;
    parts: NonNullable<ReturnType<typeof flatMorphology>>["parts"];
    joins: NonNullable<ReturnType<typeof flatMorphology>>["joins"];
    transformations: NonNullable<ReturnType<typeof flatMorphology>>["transformations"];
    wordSum: string;
    familyKey: string;
    componentPartId: string;
    relationshipKind: string;
    requestedSkillKeys: string[];
  }[];
};

export const MULTI_SENSE_CSV_COLUMNS = [
  "canonical_word_id", "source_sense_reviewed_at", "display_word", "sense_id",
  "definition", "part_of_speech", "pronunciation_id", "ipa", "spoken_syllable_count",
  "stress_pattern", "dictation_sentence", "dictation_target_token_index",
  ...Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => {
    const prefix = `part_${index + 1}_`;
    return [`${prefix}id`, `${prefix}kind`, `${prefix}underlying_form`, `${prefix}visible_letters`, `${prefix}meaning`,
      ...(index ? [`${prefix}join_before`] : []), `${prefix}spelling_change_type`, `${prefix}spelling_change_explanation`];
  }).flat(),
  "family_key", "component_part_id", "relationship_kind", "requested_micro_skills",
] as const;

function cell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+@\-\t\r]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function renderMultiSenseCsvBundles(bundles: readonly MultiSenseCsvBundle[]): string {
  const rows = bundles.flatMap(bundle => bundle.senseSet.senses.map(sense => {
    const pronunciation = bundle.senseSet.pronunciations.find(row => row.id === sense.pronunciationId);
    const analysis = bundle.analyses.find(row => row.senseId === sense.id);
    if (analysis && new Set(analysis.transformations.map(change => change.sourcePartId)).size
      !== analysis.transformations.length)
      throw new Error("MULTI_SENSE_CSV_MULTIPLE_CHANGES_FOR_PART");
    const row: Record<string, unknown> = {
      canonical_word_id: bundle.wordId, source_sense_reviewed_at: bundle.sourceSenseReviewedAt,
      display_word: bundle.displayWord, sense_id: sense.id, definition: sense.definition,
      part_of_speech: sense.partOfSpeech, pronunciation_id: pronunciation?.id ?? "",
      ipa: pronunciation?.ipa ?? "", spoken_syllable_count: pronunciation?.spokenSyllableCount ?? "",
      stress_pattern: pronunciation?.stressPattern ?? "",
      dictation_sentence: sense.dictationSentence ?? "",
      dictation_target_token_index: sense.dictationTargetTokenIndex ?? "",
      family_key: analysis?.familyKey ?? "", component_part_id: analysis?.componentPartId ?? "",
      relationship_kind: analysis?.relationshipKind ?? "",
      requested_micro_skills: analysis?.requestedSkillKeys.join("; ") ?? "",
    };
    for (const [index, part] of (analysis?.parts ?? []).entries()) {
      if (index >= FLAT_IMPORT_PART_LIMIT) throw new Error("MULTI_SENSE_CSV_PART_LIMIT");
      const prefix = `part_${index + 1}_`;
      row[`${prefix}id`] = part.id;
      row[`${prefix}kind`] = part.kind;
      row[`${prefix}underlying_form`] = part.sourceText;
      row[`${prefix}visible_letters`] = part.surfaceText;
      row[`${prefix}meaning`] = part.gloss;
      if (index) row[`${prefix}join_before`] = analysis?.joins.find(join => join.beforePartId === part.id)?.joinType ?? "";
      const change = analysis?.transformations.find(item => item.sourcePartId === part.id);
      row[`${prefix}spelling_change_type`] = change?.type ?? "";
      row[`${prefix}spelling_change_explanation`] = change?.explanation ?? "";
    }
    return MULTI_SENSE_CSV_COLUMNS.map(name => cell(row[name])).join(",");
  }));
  return `\uFEFF${MULTI_SENSE_CSV_COLUMNS.map(cell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}
