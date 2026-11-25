import "server-only";
import { lexicalFamilyDisplayName } from "./family-display-name";
import { isSchwaWorkbookSkill } from "./weak-vowel-workbook";
import { prefillWorkbookParts, type WorkbookPartPrefill } from "./review-workbook-part-prefill";

import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { targetOccurrences } from "./authoring";
import { auditCanonicalMorphology, canonicalWordSum, exactLegacyPartAliases, type CanonicalJoin, type CanonicalPart } from "./canonical-morphology";
import { FLAT_IMPORT_PART_LIMIT } from "./csv";
import { ABLE_IBLE_SKILL, isSuffixReviewSkill } from "./able-ible-workbook";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { isPrefixWorkbookSkill, prefixWorkbooks, type PrefixWorkbookSkill } from "./prefix-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;

export async function prefillReviewWorkbookFacts(db: Db, bundles: MultiSenseCsvBundle[], skill: string,
  publishedBases: ReadonlyMap<string, string> = new Map()) {
  const singles = bundles.filter(bundle => bundle.senseSet.senses.length === 1);
  const ids = singles.filter(bundle => !bundle.sourceSenseReviewedAt || !bundle.senseSet.senses[0].dictationSentence?.trim() || !bundle.analyses.length)
    .map(bundle => bundle.wordId);
  const legacy = new Set(singles.filter(bundle => !bundle.sourceSenseReviewedAt).map(bundle => bundle.wordId));
  const sentences = new Map<string, { dictationSentence: string; dictationTargetTokenIndex: number }>();
  const pronunciations = new Map<string, { ipa: string; spokenSyllableCount: number | null; stressPattern: string }>();
  const morphology = new Map<string, {
    parts: unknown; joins: unknown; transformations: unknown; partOfSpeech: string | null;
  }>();
  for (let offset = 0; offset < ids.length; offset += 75) {
    const batch = ids.slice(offset, offset + 75);
    const legacyBatch = batch.filter(id => legacy.has(id));
    const partBatch = batch.filter(id => !bundles.find(bundle => bundle.wordId === id)?.analyses.length);
    const [dictation, metadata, parts] = await Promise.all([
      db.from("canonical_teaching_dictionary_dictation_sentences")
        .select("canonical_word_id,dictation_sentence,dictation_target_token_index").in("canonical_word_id", batch)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
        .order("created_at", { ascending: false }).order("id", { ascending: false }),
      legacyBatch.length ? db.from("canonical_teaching_dictionary_word_metadata")
        .select("canonical_word_id,phoneme_hint,syllables,stress_pattern").in("canonical_word_id", legacyBatch)
        .eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
        .order("created_at", { ascending: false }).order("id", { ascending: false }) : null,
      partBatch.length ? db.from("canonical_teaching_dictionary_word_morphology")
        .select("canonical_word_id,morphology_parts,morphology_joins,morphology_transformations,raw_morpholex_pos").in("canonical_word_id", partBatch)
        .eq("row_status", "active")
        .order("created_at", { ascending: false }).order("id", { ascending: false }) : null,
    ]);
    if (dictation.error || metadata?.error || parts?.error) throw new Error("Could not load existing Dictionary facts for the review workbook.");
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
        parts: row.morphology_parts, joins: row.morphology_joins, transformations: row.morphology_transformations,
        partOfSpeech: row.raw_morpholex_pos,
      });
    }
  }
  const hydrated = bundles.map((bundle): MultiSenseCsvBundle => {
    if (bundle.senseSet.senses.length !== 1) return bundle;
    const [sense] = bundle.senseSet.senses;
    const oldMorphology = morphology.get(bundle.wordId);
    const partOfSpeech = sense.partOfSpeech || oldMorphology?.partOfSpeech || "";
    const saved = sentences.get(bundle.wordId);
    const positions = saved ? targetOccurrences(saved.dictationSentence, bundle.displayWord) : [];
    const dictationSentence = !sense.dictationSentence?.trim() && partOfSpeech !== "root" && saved
      && (positions.includes(saved.dictationTargetTokenIndex) || positions.length === 1) ? {
        dictationSentence: saved.dictationSentence,
        dictationTargetTokenIndex: positions.includes(saved.dictationTargetTokenIndex)
          ? saved.dictationTargetTokenIndex : positions[0],
      } : null;
    const pronunciation = pronunciations.get(bundle.wordId);
    const publishedBase = publishedBases.get(bundle.wordId);
    const publishedPrefix = publishedBase && bundle.displayWord.endsWith(publishedBase)
      ? bundle.displayWord.slice(0, -publishedBase.length) : "";
    const lessonParts = publishedPrefix && publishedBase ? [
      { kind: "prefix", sourceText: publishedPrefix, surfaceText: publishedPrefix },
      { kind: "base", sourceText: publishedBase, surfaceText: publishedBase },
    ] : null;
    const oldParts = isSuffixReviewSkill(skill) ? exactLegacyPartAliases(oldMorphology?.parts) ?? oldMorphology?.parts : oldMorphology?.parts;
    const audit = oldMorphology && auditCanonicalMorphology({ ...oldMorphology, parts: oldParts, displayWord: bundle.displayWord,
      linkedToFamily: false });
    const canonical = audit?.status === "canonical" || audit?.status === "safe_range_conversion";
    const existingPrefix = isPrefixWorkbookSkill(skill)
      ? prefixPartSuggestions(oldMorphology?.parts, bundle.displayWord, skill) : null;
    const suggestedPrefix = isPrefixWorkbookSkill(skill) && publishedBase && existingPrefix?.[1].sourceText !== publishedBase
      ? prefixPartSuggestions(lessonParts, bundle.displayWord, skill) : existingPrefix;
    const usesPublishedSplit = suggestedPrefix !== existingPrefix;
    const parts = canonical && !usesPublishedSplit
      ? audit?.convertedParts ?? oldParts as CanonicalPart[] : suggestedPrefix;
    const joins: CanonicalJoin[] = canonical && !usesPublishedSplit ? oldMorphology!.joins as CanonicalJoin[]
      : suggestedPrefix ? [{ afterPartId: suggestedPrefix[0].id, beforePartId: suggestedPrefix[1].id, joinType: "none" }] : [];
    const transformations = canonical && !usesPublishedSplit && Array.isArray(oldMorphology?.transformations)
      ? oldMorphology.transformations as MultiSenseCsvBundle["analyses"][number]["transformations"] : [];
    const recoverable = new Set(transformations.map(change => change.sourcePartId)).size === transformations.length;
    const baseParts = parts?.filter(part => part.kind === "base" || part.kind === "root") ?? [];
    const component = baseParts.length === 1 ? baseParts[0] : baseParts.find(part => part.sourceText === publishedBase);
    const oldPronunciation = bundle.senseSet.pronunciations.find(row => row.id === sense.pronunciationId);
    const fallbackPronunciation = partOfSpeech !== "root" && pronunciation ? {
      id: "legacy-pronunciation", ipa: oldPronunciation?.ipa || pronunciation.ipa,
      spokenSyllableCount: oldPronunciation?.spokenSyllableCount || pronunciation.spokenSyllableCount,
      stressPattern: oldPronunciation?.stressPattern || pronunciation.stressPattern,
    } : null;
    return { ...bundle, senseSet: {
      pronunciations: fallbackPronunciation ? [fallbackPronunciation] : bundle.senseSet.pronunciations,
      senses: [{ ...sense, ...dictationSentence, pronunciationId: fallbackPronunciation?.id ?? sense.pronunciationId,
        partOfSpeech }],
    }, analyses: bundle.analyses.length || !parts || parts.length > FLAT_IMPORT_PART_LIMIT || !recoverable ? bundle.analyses : [{
      senseId: sense.id, parts, joins, transformations, wordSum: canonicalWordSum(parts, bundle.displayWord),
      familyKey: "", componentPartId: component?.id ?? "",
      relationshipKind: isPrefixWorkbookSkill(skill) ? "derived" : "", requestedSkillKeys: [],
    }] };
  });
  const wordPartPrefills = new Map<string, WorkbookPartPrefill>();
  for (const bundle of hydrated) for (const sense of bundle.senseSet.senses) {
    const original = bundles.find(item => item.wordId === bundle.wordId)?.analyses.find(analysis => analysis.senseId === sense.id);
    const fallback = bundle.senseSet.senses.length === 1 ? morphology.get(bundle.wordId) : null;
    const source = original ?? fallback ?? bundle.analyses.find(analysis => analysis.senseId === sense.id);
    wordPartPrefills.set(`${bundle.wordId}:${sense.id}`, prefillWorkbookParts({ word: bundle.displayWord,
      definition: sense.definition, parts: source?.parts, joins: source?.joins, transformations: source?.transformations }));
  }
  const bases = [...new Set([...hydrated.flatMap(bundle => bundle.analyses.flatMap(analysis =>
    analysis.parts.filter(part => part.kind === "base" || part.kind === "root").map(part => part.sourceText))),
    ...[...wordPartPrefills.values()].flatMap(prefill => Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => index + 1)
      .filter(index => ["base", "root"].includes(prefill.fields[`part_${index}_kind`]))
      .map(index => prefill.fields[`part_${index}_underlying_form`]).filter(Boolean))])];
  const families = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let offset = 0; offset < bases.length; offset += 50) {
    const { data, error } = await db.from("teaching_dictionary_families_with_current_meaning")
      .select("family_key,base_lemma,base_meaning,base_part_of_speech,review_status,base_kind")
      .in("base_lemma", bases.slice(offset, offset + 50)).in("base_kind", (skill === ABLE_IBLE_SKILL || isSchwaWorkbookSkill(skill)) ? ["free_base", "bound_root"] : ["free_base"]).order("revision", { ascending: false });
    if (error) throw new Error("Could not load family choices for the review workbook.");
    for (const row of data ?? []) {
      if (seen.has(row.family_key)) continue;
      seen.add(row.family_key);
      if (row.review_status !== "approved") continue;
      const label = `${lexicalFamilyDisplayName(row)} | ${row.family_key}`;
      families.set(row.base_lemma, [...(families.get(row.base_lemma) ?? []), label]);
    }
  }
  // Editors may change a stored whole base into a root in the workbook. Keep
  // the reviewed root catalogue available without guessing a family assignment.
  const rootFamilyOptions: string[] = [];
  if (isSchwaWorkbookSkill(skill)) {
    const rootsSeen = new Set<string>();
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await db.from("teaching_dictionary_families_with_current_meaning")
        .select("family_key,base_lemma,base_meaning,base_part_of_speech,review_status")
        .eq("base_kind", "bound_root").order("revision", { ascending: false }).order("family_key")
        .range(offset, offset + 249);
      if (error) throw new Error("Could not load approved root families for the review workbook.");
      for (const root of data ?? []) {
        if (rootsSeen.has(root.family_key)) continue;
        rootsSeen.add(root.family_key);
        if (root.review_status === "approved") rootFamilyOptions.push(`${lexicalFamilyDisplayName({ ...root, base_kind: "bound_root" })} | ${root.family_key}`);
      }
      if ((data?.length ?? 0) < 250) break;
    }
  }
  return { bundles: hydrated, families, wordPartPrefills, rootFamilyOptions };
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
