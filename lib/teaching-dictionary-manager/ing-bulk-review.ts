import { targetOccurrences } from "./authoring";
import { normaliseWord } from "./contracts";
import { csvRecords, MAX_DICTIONARY_CSV_BYTES } from "./csv";
import { generateIngWordFromOverview } from "./ing-overview-recipe";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { senseSetErrors, type DictionarySenseSet } from "./senses";

export const REGULAR_ING_SKILL = "D4_INF_ING_ENDINGS_REGULAR";
export const ING_REVIEW_COLUMNS = ["word", "meaning", "base", "ipa", "syllables", "stress", "sentence"] as const;

export type IngInput = Record<typeof ING_REVIEW_COLUMNS[number], string>;
export type IngFamily = { key: string; meaning: string; revision: number };
type Analysis = MultiSenseCsvBundle["analyses"][number];
export type IngExisting = {
  id: string; display: string; revision: string; senses: DictionarySenseSet | null;
  analyses: (Analysis & { id: string })[]; links: { id: string; senseId: string; familyKey: string;
    componentPartId: string; relationshipKind: string }[]; source: string | null; approved: boolean;
};
export type IngReviewRow = {
  number: number; input: IngInput; requestId: string; existing: IngExisting | null; families: IngFamily[];
  senseId?: string; familyKey?: string; error?: string;
  outcome?: { status: "saved" | "approved" | "already approved" | "needs attention"; wordId?: string; message?: string };
};

export function parseIngReviewSheet(text: string) {
  if (Buffer.byteLength(text, "utf8") > MAX_DICTIONARY_CSV_BYTES) throw new Error("Choose a CSV smaller than 4 MB.");
  const [columns, ...rows] = csvRecords(text);
  const names = columns?.map(value => value.trim().toLowerCase()) ?? [];
  if (!names.includes("word") || new Set(names).size !== names.length || names.some(name => !ING_REVIEW_COLUMNS.some(key => key === name)))
    throw new Error("Use the regular -ing template. Keep the word column and its heading.");
  if (!rows.length || rows.length > 100) throw new Error("Include 1 to 100 words per upload.");
  const entries = rows.map((cells, index) => {
    if (cells.length !== names.length) throw new Error(`CSV row ${index + 2} has a different number of cells from the heading.`);
    const input = Object.fromEntries(ING_REVIEW_COLUMNS.map(key => [key, cells[names.indexOf(key)]?.trim() ?? ""])) as IngInput;
    if (Object.values(input).some(value => value.length > 2000)) throw new Error(`Shorten the text on CSV row ${index + 2}.`);
    return { number: index + 2, input };
  });
  const seen = new Set<string>();
  for (const { input } of entries) {
    const key = normaliseWord(input.word);
    if (key && seen.has(key)) throw new Error(`The word “${input.word}” appears twice. Use one row per spelling for this lesson.`);
    if (key) seen.add(key);
  }
  return entries;
}

export function ingReviewBase(input: IngInput) {
  return normaliseWord(input.base || input.word.slice(0, -3));
}

function sameMeaning(a: string, b: string) {
  return a.trim().toLocaleLowerCase("en-GB").replace(/[.!?]$/u, "") ===
    b.trim().toLocaleLowerCase("en-GB").replace(/[.!?]$/u, "");
}

export function planIngReview(row: IngReviewRow): { group: string; message: string; senseId?: string; bundle?: MultiSenseCsvBundle } {
  const { input, existing } = row;
  const base = ingReviewBase(input);
  const word = normaliseWord(input.word);
  const block = (group: string, message: string, senseId?: string) => ({ group, message, senseId });
  if (row.error) return block("Check spelling or dictionary entry", row.error);
  if (!/^[a-z]+$/u.test(base) || word !== `${base}ing`)
    return block("Spelling rule", "Regular -ing adds ing to the base spelling without changing it.");
  if (existing && (!existing.approved || !existing.senses?.senses.length))
    return block("Review dictionary facts", "This spelling already exists. Review its meanings in the dictionary before importing it here.");
  const options = existing?.senses?.senses ?? [];
  const matches = options.filter(sense => input.meaning ? sameMeaning(sense.definition, input.meaning) : options.length === 1);
  const current = row.senseId ? options.find(sense => sense.id === row.senseId) : matches.length === 1 ? matches[0] : undefined;
  if (options.length && !current)
    return block("Choose a meaning", "Select the existing meaning this row should update.");
  const senseId = current?.id ?? `${word}-verb`;
  if (current && current.partOfSpeech !== "verb") return block("Spelling rule", "This lesson teaches the verb meaning. Choose the matching verb meaning.", senseId);
  const definition = input.meaning || current?.definition || "";
  const pronunciation = existing?.senses?.pronunciations.find(item => item.id === current?.pronunciationId);
  const ipa = input.ipa || pronunciation?.ipa || "";
  const count = input.syllables ? (/^[1-9]\d?$/u.test(input.syllables) ? Number(input.syllables) : NaN) : pronunciation?.spokenSyllableCount ?? null;
  const stress = input.stress || pronunciation?.stressPattern || "";
  const pronunciationChanged = ipa !== pronunciation?.ipa || count !== pronunciation?.spokenSyllableCount || stress !== pronunciation?.stressPattern;
  const pronunciationId = pronunciationChanged ? `bulk-ing:${row.requestId}` : pronunciation!.id;
  const sentence = input.sentence || current?.dictationSentence || "";
  const positions = targetOccurrences(sentence, word);
  if (!definition || !ipa || !count || !stress)
    return block("Add meaning or pronunciation", "Fill in the meaning, IPA, spoken syllables and stress for this word.", senseId);
  if (positions.length !== 1)
    return block("Fix dictation sentences", "Enter a sentence containing this spelling exactly once.", senseId);
  const sense = { id: senseId, definition, partOfSpeech: "verb", pronunciationId, dictationSentence: sentence,
    dictationTargetTokenIndex: positions[0] };
  const senses: DictionarySenseSet = {
    pronunciations: [...(existing?.senses?.pronunciations ?? []), ...(pronunciationChanged ? [{
      id: pronunciationId, ipa, spokenSyllableCount: count, stressPattern: stress,
    }] : [])],
    senses: current ? options.map(item => item.id === senseId ? sense : item) : [sense],
  };
  const issues = senseSetErrors(senses);
  if (issues.length) return block("Add meaning or pronunciation", issues[0], senseId);

  const analysis = existing?.analyses.find(item => item.senseId === senseId);
  const basePart = analysis?.parts.find(part => part.kind === "base" && normaliseWord(part.sourceText) === base);
  const reviewedLink = existing?.links.find(link => link.senseId === senseId && link.componentPartId === basePart?.id &&
    link.relationshipKind === "regular_inflection" && row.families.some(family => family.key === link.familyKey));
  const family = row.families.find(item => item.key === (row.familyKey ?? reviewedLink?.familyKey));
  if (!family) return block("Confirm base families", row.families.length ? `Choose the reviewed meaning of “${base}”.`
    : `There is no reviewed verb family for “${base}”. Review its base family in the dictionary first.`, senseId);
  if (existing?.links.some(link => link.senseId === senseId && link.familyKey !== family.key))
    return block("Review dictionary facts", "This meaning already has a different family link. Resolve the family on the word page first.", senseId);
  if (analysis && (!basePart || basePart.gloss !== family.meaning))
    return block("Review dictionary facts", "The reviewed word parts and family meaning disagree. Review the word parts first.", senseId);
  const selected: Analysis = analysis ? { ...analysis, familyKey: family.key,
    componentPartId: basePart!.id, relationshipKind: "regular_inflection", requestedSkillKeys: [REGULAR_ING_SKILL] }
    : {
      senseId, parts: [
        { id: "base", kind: "base", sourceText: base, surfaceText: base, gloss: family.meaning, displayRange: { start: 0, end: base.length } },
        { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "Shows the action is happening.", displayRange: { start: base.length, end: word.length } },
      ], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }], transformations: [],
      wordSum: `${base} + ing → ${word}`, familyKey: family.key, componentPartId: "base",
      relationshipKind: "regular_inflection", requestedSkillKeys: [REGULAR_ING_SKILL],
    };
  const analyses = senses.senses.flatMap(item => item.id === senseId ? [selected] :
    (existing?.analyses ?? []).filter(candidate => candidate.senseId === item.id));
  if (analyses.length !== senses.senses.length)
    return block("Review dictionary facts", "Another meaning is missing reviewed word parts. Review it in the dictionary first.", senseId);
  const preview = generateIngWordFromOverview({ wordId: existing?.id ?? row.requestId, displayWord: word,
    skillKey: REGULAR_ING_SKILL, senseId, senseSet: senses,
    morphology: { ...selected, analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
    familyLinks: [{ sense_id: senseId, family_key: family.key, component_part_id: selected.componentPartId,
      relationship_kind: selected.relationshipKind }],
    provenance: { sourceName: existing ? existing.source : "Admin reviewed Teaching Dictionary CSV", sourceUrl: null },
  });
  if (preview.status !== "ready") return block("Review dictionary facts",
    preview.issues[0]?.message ?? "This meaning does not meet the regular -ing lesson requirements.", senseId);
  return { group: "Ready to apply", message: `${base} + ing · ${family.meaning}`, senseId,
    bundle: { wordId: existing?.id ?? "", displayWord: existing?.display ?? word,
      sourceSenseReviewedAt: existing?.revision ?? "", senseSet: senses, analyses } };
}
