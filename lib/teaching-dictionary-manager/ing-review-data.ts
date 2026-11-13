import "server-only";

import { ING_MICRO_SKILLS, ING_ROUTE_ID, ING_RULE_FOR_SKILL, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import { loadActiveIngRelease } from "./ing-staging-release";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { targetOccurrences } from "./authoring";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { loadRouteWordStatuses } from "./route-word-status-service";

export const ING_REVIEW_LABELS: Record<IngMicroSkill, string> = {
  D4_INF_ING_ENDINGS_REGULAR: "Regular -ing",
  D4_INF_ING_ENDINGS_DROP_E: "Final-e dropping",
  D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT: "Final consonant doubling",
  D4_INF_ING_ENDINGS_IE_TO_Y: "Change ie to y",
};

export function isIngReviewSkill(value: unknown): value is IngMicroSkill {
  return ING_MICRO_SKILLS.some(skill => skill === value);
}

export async function loadIngReviewWords(skill: IngMicroSkill) {
  const db = createServiceRoleClient();
  const [{ released }, associated] = await Promise.all([
    loadActiveIngRelease(db, skill),
    loadRouteWordStatuses({ routeId: ING_ROUTE_ID, microSkillKey: skill }),
  ]);
  const words = released.filter(word => word.microSkillKey === skill);
  const active = new Map(words.map(word => [word.canonicalWordId, word]));
  const otherPoolIds = new Set(released.filter(word => word.microSkillKey !== skill)
    .map(word => word.canonicalWordId));
  const rows = associated.words
    .filter(({ wordId, status }) => active.has(wordId)
      || (status.relationshipApproved && status.dictionaryApproved && !otherPoolIds.has(wordId)))
    .map(({ wordId, displayWord, status }) => ({
      wordId, displayWord, released: active.get(wordId), blockers: status.blockers,
    }));
  const known = new Set(rows.map(row => row.wordId));
  for (const word of words) if (!known.has(word.canonicalWordId)) rows.push({
    wordId: word.canonicalWordId, displayWord: word.word, released: word, blockers: [],
  });
  return rows.sort((a, b) => a.displayWord.localeCompare(b.displayWord, "en-GB"));
}

export async function loadIngReviewWorkbook(skill: IngMicroSkill, batch: number) {
  const rows = (await loadIngReviewWords(skill)).slice((batch - 1) * 100, batch * 100);
  if (!rows.length) return null;
  const db = createServiceRoleClient();
  const ids = rows.map(row => row.wordId);
  const bases = [...new Set(rows.flatMap(row => row.released ? [row.released.base] : []))];
  const [metadata, definitions, familyRows, dictation, memberships] = await Promise.all([
    db.from("canonical_teaching_dictionary_word_metadata")
      .select("canonical_word_id,phoneme_hint,syllables,stress_pattern")
      .in("canonical_word_id", ids).eq("row_status", "active").order("created_at", { ascending: false }),
    db.from("teaching_dictionary_definition_versions").select("canonical_word_id,definition")
      .in("canonical_word_id", ids).is("route_id", null).order("published_at", { ascending: false }),
    bases.length ? db.from("canonical_teaching_dictionary_lexical_base_families")
      .select("family_key,revision,base_lemma,base_meaning,base_part_of_speech,base_kind,review_status").in("base_lemma", bases)
      .order("revision", { ascending: false }) : { data: [], error: null },
    db.from("canonical_teaching_dictionary_dictation_sentences")
      .select("canonical_word_id,dictation_sentence").in("canonical_word_id", ids)
      .eq("row_status", "active").order("created_at", { ascending: false }),
    db.from("canonical_teaching_dictionary_lexical_base_family_members")
      .select("canonical_word_id,family_key,revision").in("canonical_word_id", ids),
  ]);
  if (metadata.error || definitions.error || familyRows.error || dictation.error || memberships.error)
    throw new Error("Could not load Teaching Dictionary facts for the workbook.");

  const currentFamilies = new Map<string, NonNullable<typeof familyRows.data>[number]>();
  for (const family of familyRows.data ?? []) if (!currentFamilies.has(family.family_key))
    currentFamilies.set(family.family_key, family);
  const families = new Map(bases.map(base => [base, [...currentFamilies.values()]
    .filter(family => family.base_lemma === base && family.base_kind === "free_base" && family.base_part_of_speech === "verb" && family.review_status === "approved")
    .map(family => `${family.base_meaning} | ${family.family_key}`)]));
  const notes = new Map<string, string>();
  const changes = {
    regular: "", drop_e: "Drop the final e before adding -ing.",
    double_final_consonant: "Double the final consonant before adding -ing.",
    ie_to_y: "Change the final ie to y before adding -ing.",
  };
  const bundles: MultiSenseCsvBundle[] = rows.map(({ wordId, displayWord, released, blockers }) => {
    const facts = metadata.data.find(row => row.canonical_word_id === wordId);
    const sentence = released?.dictationSentence ?? dictation.data.find(row => row.canonical_word_id === wordId)?.dictation_sentence ?? "";
    const definition = released?.meaning ?? definitions.data.find(row => row.canonical_word_id === wordId)?.definition ?? "";
    const target = targetOccurrences(sentence, displayWord);
    const senseId = `review:${wordId}`;
    const pronunciationId = `review-pronunciation:${wordId}`;
    const base = released?.base ?? "";
    const linkedFamilies = (memberships.data ?? []).filter(link => link.canonical_word_id === wordId)
      .flatMap(link => {
        const family = currentFamilies.get(link.family_key);
        return family && family.revision === link.revision && families.get(base)?.some(option =>
          option === `${family.base_meaning} | ${family.family_key}`) ? [family] : [];
      });
    const family = linkedFamilies.length === 1 ? linkedFamilies[0] : null;
    const stem = released?.word.slice(0, -3) ?? "";
    notes.set(wordId, [
      released ? "In the live lesson pool." : "Associated with this lesson.",
      ...(!released ? blockers : []),
    ].filter(Boolean).join(" "));
    return {
      wordId, displayWord, sourceSenseReviewedAt: "",
      senseSet: { pronunciations: [{ id: pronunciationId, ipa: facts?.phoneme_hint ?? "",
        spokenSyllableCount: Number(facts?.syllables) || null, stressPattern: facts?.stress_pattern ?? "" }],
        senses: [{ id: senseId, definition, partOfSpeech: released ? "verb" : "", pronunciationId,
          dictationSentence: sentence, dictationTargetTokenIndex: target.length === 1 ? target[0] : undefined }] },
      analyses: released ? [{ senseId, parts: [
        { id: "base", kind: "base", sourceText: base, surfaceText: stem, gloss: family?.base_meaning ?? "", displayRange: { start: 0, end: stem.length } },
        { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing", gloss: "action in progress",
          displayRange: { start: stem.length, end: released.word.length } },
      ], joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
      transformations: base === stem ? [] : [{ type: "base_spelling_change", sourcePartId: "base",
        sourceText: base, surfaceText: stem, explanation: changes[ING_RULE_FOR_SKILL[skill]] }],
      wordSum: `${base} + ing → ${released.word}`, familyKey: family ? `${family.base_meaning} | ${family.family_key}` : "", componentPartId: "base",
      relationshipKind: "regular_inflection", requestedSkillKeys: [] }] : [],
    };
  });
  return { bundles, families, notes };
}
