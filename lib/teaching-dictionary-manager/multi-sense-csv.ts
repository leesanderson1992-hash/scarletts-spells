import { csvRecords, flatMorphology, FLAT_IMPORT_PART_LIMIT, MAX_DICTIONARY_CSV_BYTES } from "./csv";
import { targetOccurrences } from "./authoring";
import { senseSetErrors, type DictionarySenseSet } from "./senses";

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

const RELATIONSHIPS = new Set(["free_base", "regular_inflection", "irregular_inflection",
  "derived", "contraction", "historical_relative"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseMultiSenseCsv(text: string): MultiSenseCsvBundle[] {
  if (Buffer.byteLength(text, "utf8") > MAX_DICTIONARY_CSV_BYTES) throw new Error("CSV_TOO_LARGE");
  const [headers, ...rows] = csvRecords(text);
  if (!headers || rows.length > 10000) throw new Error("CSV_ROW_LIMIT");
  const names = headers.map(name => name.trim());
  if (new Set(names).size !== names.length || MULTI_SENSE_CSV_COLUMNS.some(name => !names.includes(name)))
    throw new Error("MULTI_SENSE_CSV_COLUMNS_INVALID");
  const bundles = new Map<string, MultiSenseCsvBundle>();
  const pronunciationByWord = new Map<string, Map<string, string>>();
  for (const [index, cells] of rows.entries()) {
    const number = index + 2;
    if (cells.length !== names.length) throw new Error(`Row ${number}: Column count does not match header.`);
    const raw = Object.fromEntries(names.map((name, column) => {
      const input = cells[column]?.trim() ?? "";
      return [name, /^'[=+@\-\t\r]/u.test(input) ? input.slice(1) : input];
    }));
    const wordId = raw.canonical_word_id;
    const word = raw.display_word;
    const senseId = raw.sense_id;
    if (!UUID.test(wordId) || !word || !senseId || senseId.length > 200)
      throw new Error(`Row ${number}: Select an existing dictionary word and a stable meaning ID.`);
    if (raw.source_sense_reviewed_at && Number.isNaN(Date.parse(raw.source_sense_reviewed_at)))
      throw new Error(`Row ${number}: Source meaning revision is invalid; download a fresh sheet.`);
    const existing = bundles.get(wordId);
    if (existing && (existing.displayWord !== word || existing.sourceSenseReviewedAt !== raw.source_sense_reviewed_at))
      throw new Error(`Row ${number}: Shared word identity or source revision differs between meanings.`);
    const bundle = existing ?? { wordId, displayWord: word,
      sourceSenseReviewedAt: raw.source_sense_reviewed_at,
      senseSet: { pronunciations: [], senses: [] }, analyses: [] };
    if (bundle.senseSet.senses.some(sense => sense.id === senseId))
      throw new Error(`Row ${number}: Duplicate meaning ID.`);
    const root = raw.part_of_speech === "root";
    const pronunciationId = raw.pronunciation_id || null;
    if (!root && !pronunciationId) throw new Error(`Row ${number}: Select a pronunciation for this meaning.`);
    if (pronunciationId) {
      const count = raw.spoken_syllable_count;
      if (!/^[1-9][0-9]*$/u.test(count)) throw new Error(`Row ${number}: Spoken syllable count is invalid.`);
      const pronunciation = { id: pronunciationId, ipa: raw.ipa,
        spokenSyllableCount: Number(count), stressPattern: raw.stress_pattern };
      const byId = pronunciationByWord.get(wordId) ?? new Map<string, string>();
      const snapshot = JSON.stringify(pronunciation);
      if (byId.has(pronunciationId) && byId.get(pronunciationId) !== snapshot)
        throw new Error(`Row ${number}: Shared pronunciation facts disagree between meanings.`);
      if (!byId.has(pronunciationId)) bundle.senseSet.pronunciations.push(pronunciation);
      byId.set(pronunciationId, snapshot);
      pronunciationByWord.set(wordId, byId);
    } else if (raw.ipa || raw.spoken_syllable_count || raw.stress_pattern) {
      throw new Error(`Row ${number}: A bound root without a pronunciation cannot have spoken fields.`);
    }
    const target = raw.dictation_target_token_index;
    if (root && raw.dictation_sentence)
      throw new Error(`Row ${number}: A bound root cannot have a standalone dictation sentence.`);
    if (raw.dictation_sentence && !/^(0|[1-9][0-9]*)$/u.test(target))
      throw new Error(`Row ${number}: Give the dictated word's zero-based position.`);
    if (raw.dictation_sentence && !targetOccurrences(raw.dictation_sentence, word).includes(Number(target)))
      throw new Error(`Row ${number}: The selected target position does not contain this spelling.`);
    bundle.senseSet.senses.push({ id: senseId, definition: raw.definition,
      partOfSpeech: raw.part_of_speech, pronunciationId,
      ...(raw.dictation_sentence ? { dictationSentence: raw.dictation_sentence,
        dictationTargetTokenIndex: Number(target) } : {}) });
    let morphology: ReturnType<typeof flatMorphology>;
    try { morphology = flatMorphology(raw, names, word); }
    catch (error) { throw new Error(`Row ${number}: ${error instanceof Error ? error.message : "Invalid word parts."}`); }
    if (!morphology) throw new Error(`Row ${number}: Add reviewed word parts.`);
    const family = raw.family_key;
    const component = raw.component_part_id;
    const relationship = raw.relationship_kind;
    if ([family, component, relationship].some(Boolean) &&
      (!family || !component || !RELATIONSHIPS.has(relationship)
        || !morphology.parts.some(part => part.id === component && ["base", "root"].includes(part.kind))))
      throw new Error(`Row ${number}: Select a matching base or root part, family and relationship.`);
    const requested = raw.requested_micro_skills.split(/[;,]/u).map(key => key.trim()).filter(Boolean);
    if (new Set(requested).size !== requested.length)
      throw new Error(`Row ${number}: Duplicate requested micro-skill.`);
    bundle.analyses.push({ senseId, ...morphology, familyKey: family,
      componentPartId: component, relationshipKind: relationship,
      requestedSkillKeys: requested });
    bundles.set(wordId, bundle);
  }
  for (const bundle of bundles.values()) {
    const issues = senseSetErrors(bundle.senseSet);
    if (issues.length) throw new Error(`Word ${bundle.displayWord}: ${issues[0]}`);
  }
  return [...bundles.values()];
}

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

export function renderMultiSenseCsv(bundle: MultiSenseCsvBundle): string {
  return renderMultiSenseCsvBundles([bundle]);
}
