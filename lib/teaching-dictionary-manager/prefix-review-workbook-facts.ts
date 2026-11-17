import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { targetOccurrences } from "./authoring";
import { canonicalWordSum, type CanonicalPart } from "./canonical-morphology";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { prefixWorkbooks, type PrefixWorkbookSkill } from "./prefix-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;

export async function prefillPrefixReviewFacts(db: Db, bundles: MultiSenseCsvBundle[], skill: PrefixWorkbookSkill,
  publishedBases: ReadonlyMap<string, string>) {
  const singles = bundles.filter(bundle => bundle.senseSet.senses.length === 1);
  const ids = singles.filter(bundle => !bundle.sourceSenseReviewedAt || !bundle.senseSet.senses[0].dictationSentence?.trim())
    .map(bundle => bundle.wordId);
  const legacy = new Set(singles.filter(bundle => !bundle.sourceSenseReviewedAt).map(bundle => bundle.wordId));
  const sentences = new Map<string, { dictationSentence: string; dictationTargetTokenIndex: number }>();
  const pronunciations = new Map<string, { ipa: string; spokenSyllableCount: number | null; stressPattern: string }>();
  const morphology = new Map<string, { parts: unknown; partOfSpeech: string | null }>();
  for (let offset = 0; offset < ids.length; offset += 75) {
    const batch = ids.slice(offset, offset + 75);
    const legacyBatch = batch.filter(id => legacy.has(id));
    const [dictation, metadata, parts] = await Promise.all([
      db.from("canonical_teaching_dictionary_dictation_sentences")
        .select("canonical_word_id,dictation_sentence,dictation_target_token_index").in("canonical_word_id", batch)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
        .order("created_at", { ascending: false }).order("id", { ascending: false }),
      legacyBatch.length ? db.from("canonical_teaching_dictionary_word_metadata")
        .select("canonical_word_id,phoneme_hint,syllables,stress_pattern").in("canonical_word_id", legacyBatch)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
        .order("created_at", { ascending: false }).order("id", { ascending: false }) : null,
      legacyBatch.length ? db.from("canonical_teaching_dictionary_word_morphology")
        .select("canonical_word_id,morphology_parts,raw_morpholex_pos").in("canonical_word_id", legacyBatch)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure").eq("analysis_status", "approved")
        .order("created_at", { ascending: false }).order("id", { ascending: false }) : null,
    ]);
    if (dictation.error || metadata?.error || parts?.error) throw new Error("Could not load existing Dictionary facts for the prefix workbook.");
    for (const row of dictation.data ?? []) {
      if (!sentences.has(row.canonical_word_id)) sentences.set(row.canonical_word_id, {
        dictationSentence: row.dictation_sentence, dictationTargetTokenIndex: row.dictation_target_token_index,
      });
    }
    for (const row of metadata?.data ?? []) {
      if (!row.phoneme_hint?.trim() || pronunciations.has(row.canonical_word_id)) continue;
      const count = Number(row.syllables);
      pronunciations.set(row.canonical_word_id, { ipa: row.phoneme_hint.trim(),
        spokenSyllableCount: Number.isInteger(count) && count >= 1 && count <= 20 ? count : null,
        stressPattern: row.stress_pattern ?? "" });
    }
    for (const row of parts?.data ?? []) {
      if (!morphology.has(row.canonical_word_id)) morphology.set(row.canonical_word_id, {
        parts: row.morphology_parts, partOfSpeech: row.raw_morpholex_pos,
      });
    }
  }
  const hydrated = bundles.map((bundle): MultiSenseCsvBundle => {
    if (bundle.senseSet.senses.length !== 1) return bundle;
    const [sense] = bundle.senseSet.senses;
    const saved = sentences.get(bundle.wordId);
    const positions = saved ? targetOccurrences(saved.dictationSentence, bundle.displayWord) : [];
    const dictationSentence = !sense.dictationSentence?.trim() && sense.partOfSpeech !== "root" && saved
      && (positions.includes(saved.dictationTargetTokenIndex) || positions.length === 1) ? {
        dictationSentence: saved.dictationSentence,
        dictationTargetTokenIndex: positions.includes(saved.dictationTargetTokenIndex)
          ? saved.dictationTargetTokenIndex : positions[0],
      } : null;
    const pronunciation = pronunciations.get(bundle.wordId);
    const oldMorphology = morphology.get(bundle.wordId);
    const publishedBase = publishedBases.get(bundle.wordId);
    const publishedPrefix = publishedBase && bundle.displayWord.endsWith(publishedBase)
      ? bundle.displayWord.slice(0, -publishedBase.length) : "";
    const lessonParts = publishedPrefix && publishedBase ? [
      { kind: "prefix", sourceText: publishedPrefix, surfaceText: publishedPrefix },
      { kind: "base", sourceText: publishedBase, surfaceText: publishedBase },
    ] : null;
    const existingParts = prefixPartSuggestions(oldMorphology?.parts, bundle.displayWord, skill);
    const parts = publishedBase && existingParts?.[1].sourceText !== publishedBase
      ? prefixPartSuggestions(lessonParts, bundle.displayWord, skill) : existingParts;
    return { ...bundle, senseSet: {
      pronunciations: pronunciation ? [{ ...pronunciation, id: "legacy-pronunciation" }] : bundle.senseSet.pronunciations,
      senses: [{ ...sense, ...dictationSentence, pronunciationId: pronunciation ? "legacy-pronunciation" : sense.pronunciationId,
        partOfSpeech: sense.partOfSpeech || oldMorphology?.partOfSpeech || "" }],
    }, analyses: bundle.analyses.length || !parts ? bundle.analyses : [{
      senseId: sense.id, parts, joins: [{ afterPartId: parts[0].id, beforePartId: parts[1].id, joinType: "none" }],
      transformations: [], wordSum: canonicalWordSum(parts, bundle.displayWord),
      familyKey: "", componentPartId: parts[1].id, relationshipKind: "derived", requestedSkillKeys: [],
    }] };
  });
  const bases = [...new Set(hydrated.flatMap(bundle => bundle.analyses.flatMap(analysis =>
    analysis.parts.filter(part => part.kind === "base").map(part => part.sourceText))))];
  const families = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let offset = 0; offset < bases.length; offset += 50) {
    const { data, error } = await db.from("teaching_dictionary_families_with_current_meaning")
      .select("family_key,base_lemma,base_meaning,base_part_of_speech,review_status")
      .in("base_lemma", bases.slice(offset, offset + 50)).eq("base_kind", "free_base").order("revision", { ascending: false });
    if (error) throw new Error("Could not load family choices for the prefix workbook.");
    for (const row of data ?? []) {
      if (seen.has(row.family_key)) continue;
      seen.add(row.family_key);
      if (row.review_status !== "approved") continue;
      const label = `${row.base_lemma} · ${row.base_part_of_speech} · ${row.base_meaning} | ${row.family_key}`;
      families.set(row.base_lemma, [...(families.get(row.base_lemma) ?? []), label]);
    }
  }
  return { bundles: hydrated, families };
}

function prefixPartSuggestions(raw: unknown, word: string, skill: PrefixWorkbookSkill): CanonicalPart[] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [prefix, base] = raw;
  if (prefix?.kind !== "prefix" || base?.kind !== "base" || typeof base.sourceText !== "string"
    || !base.sourceText || base.sourceText !== base.surfaceText || prefix.sourceText !== prefix.surfaceText
    || !prefixWorkbooks[skill].choices.some(choice => choice.prefix === prefix.sourceText)
    || prefix.surfaceText + base.surfaceText !== word) return null;
  return [prefix, base].map((part, index) => ({
    id: index === 0 ? "prefix" : "base", kind: index === 0 ? "prefix" : "base",
    sourceText: part.sourceText, surfaceText: part.surfaceText, gloss: typeof part.gloss === "string" ? part.gloss : "",
    displayRange: index === 0 ? { start: 0, end: prefix.surfaceText.length } : { start: prefix.surfaceText.length, end: word.length },
  }));
}
