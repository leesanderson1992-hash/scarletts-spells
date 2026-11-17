import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadComparativeSelectionPool } from "@/lib/adle/inflection/readiness-loader";
import { publishedDictionaryDegreeFamilies } from "@/lib/adle/inflection/published-dictionary-families";
import type { AdjectiveFamilyV1, ComparativeMicroSkill } from "@/lib/adle/inflection/contracts";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { loadLessonReviewRequests } from "./lesson-review-requests";
import { evaluateLessonCandidate } from "./lesson-candidate";

type Db = ReturnType<typeof createServiceRoleClient>;

export async function loadComparativeReview(db: Db, skill: ComparativeMicroSkill) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Comparative Bulk review is unavailable.");
  const pool = await loadComparativeSelectionPool({client: db, environmentKey: environment, microSkillKey: skill});
  if (pool.status !== "ready") throw new Error("The reviewed adjective lesson is unavailable.");
  const ids = pool.families.flatMap(family => family.words.map(word => word.canonicalWordId));
  const [bundles, requests, active, bindings] = await Promise.all([
    loadReviewedMeaningBundles(db, ids), loadLessonReviewRequests(db, skill),
    publishedDictionaryDegreeFamilies({client: db, skill, families: pool.families, environmentKey: environment}),
    db.from("teaching_dictionary_effective_lesson_sense_bindings").select("canonical_word_id,sense_id")
      .eq("environment_key", environment).eq("micro_skill_key", skill).in("canonical_word_id", ids),
  ]);
  if (bindings.error) throw new Error("Could not load the adjective meanings selected for this lesson.");
  const activeKeys = new Set(active.map(family => family.familyKey));
  const families = pool.families.map(family => {
    const senses: Record<string, string> = {};
    const blockers: string[] = [];
    let familyKey = "";
    for (const word of family.words) {
      const bundle = bundles.find(item => item.wordId === word.canonicalWordId);
      const requested = requests.get(word.canonicalWordId);
      const bound = bindings.data.filter(row => row.canonical_word_id === word.canonicalWordId);
      const senseId = requested ? requested.sense_id
        : bound.length === 1 ? bound[0].sense_id : bundle?.senseSet.senses.length === 1 ? bundle.senseSet.senses[0].id : undefined;
      const analysis = bundle?.analyses.find(item => item.senseId === senseId);
      const choice = evaluateLessonCandidate({
        wordId: word.canonicalWordId, displayWord: word.word, skillKey: skill,
        senseId: senseId ?? undefined, senseSet: bundle?.senseSet ?? null,
        morphology: analysis ? {parts: analysis.parts, joins: analysis.joins, wordSum: analysis.wordSum,
          analysisStatus: "approved", reviewStatus: "approved_for_first_exposure"} : null,
        familyLinks: analysis?.familyKey ? [{sense_id: analysis.senseId, family_key: analysis.familyKey,
          component_part_id: analysis.componentPartId, relationship_kind: analysis.relationshipKind}] : [],
      });
      if (choice.status !== "ready") blockers.push(`${word.word} — ${choice.issues[0]?.message ?? "The parts do not match this spelling rule."}`);
      const base = analysis?.parts[0];
      if (base?.sourceText !== family.words[0].word)
        blockers.push(`${word.word} — choose the ${family.words[0].word} base family.`);
      if (analysis?.familyKey) {
        if (familyKey && familyKey !== analysis.familyKey) blockers.push("All three forms must use the same base family.");
        familyKey = analysis.familyKey;
      }
      if (senseId) senses[word.canonicalWordId] = senseId;
    }
    return {family, senses, blockers: [...new Set(blockers)], active: activeKeys.has(family.familyKey)};
  });
  const orderedBundles = [...bundles].sort((a, b) => a.wordId.localeCompare(b.wordId)).map(bundle => ({
    ...bundle, analyses: [...bundle.analyses].sort((a, b) => a.senseId.localeCompare(b.senseId)),
    senseSet: {...bundle.senseSet,
      senses: [...bundle.senseSet.senses].sort((a, b) => a.id.localeCompare(b.id)),
      pronunciations: [...bundle.senseSet.pronunciations].sort((a, b) => a.id.localeCompare(b.id))},
  }));
  return {families, fingerprint: fingerprintSnapshotValue({release: pool.release.id, bundles: orderedBundles,
    requests: [...requests].sort(([a], [b]) => a.localeCompare(b)), active: [...activeKeys].sort()})};
}

export async function verifyComparativePublication(db: Db, skill: ComparativeMicroSkill, familyKeys: string[]) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Comparative Bulk review is unavailable.");
  const pool = await loadComparativeSelectionPool({client: db, environmentKey: environment, microSkillKey: skill});
  if (pool.status !== "ready") throw new Error("Could not verify the adjective lesson.");
  const published: AdjectiveFamilyV1[] = await publishedDictionaryDegreeFamilies({
    client: db, skill, families: pool.families, environmentKey: environment,
  });
  if (familyKeys.some(key => !published.some(family => family.familyKey === key)))
    throw new Error("The adjective set needs another check before it can become Active.");
}

/** Reuse the reviewed lesson's exact form analysis as an editorial suggestion. */
export async function prefillComparativeWorkbook(db: Db, skill: ComparativeMicroSkill,
  bundles: Awaited<ReturnType<typeof loadReviewedMeaningBundles>>) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Comparative Bulk review is unavailable.");
  const pool = await loadComparativeSelectionPool({client: db, environmentKey: environment, microSkillKey: skill});
  if (pool.status !== "ready") return bundles;
  return bundles.map(bundle => {
    if (bundle.sourceSenseReviewedAt || bundle.senseSet.senses.length !== 1) return bundle;
    const family = pool.families.find(row => row.words.some(word => word.canonicalWordId === bundle.wordId));
    const word = family?.words.find(row => row.canonicalWordId === bundle.wordId);
    if (!family || !word) return bundle;
    const change = family.transformations.find(row => row.result === word.word);
    const base = family.words[0].word;
    const stem = change?.stem ?? base;
    const sense = bundle.senseSet.senses[0];
    const parts: import("./canonical-morphology").CanonicalPart[] = [
      {id: "base", kind: "base", sourceText: base, surfaceText: stem, gloss: family.meaning,
        displayRange: {start: 0, end: stem.length}},
    ];
    if (change) parts.push({id: "ending", kind: "suffix", sourceText: change.ending, surfaceText: change.ending,
      gloss: word.degree === "comparative" ? "to a greater degree" : "to the greatest degree",
      displayRange: {start: stem.length, end: word.word.length}});
    return {...bundle, senseSet: {...bundle.senseSet, senses: [{...sense, partOfSpeech: "adjective",
      definition: sense.definition || (word.degree === "base" ? family.meaning
        : `The ${word.degree} form of “${base}” (${family.meaning}).`)}]},
      analyses: bundle.analyses.length ? bundle.analyses : [{
        senseId: sense.id, parts, joins: change ? [{afterPartId: "base", beforePartId: "ending", joinType: "none" as const}] : [],
        transformations: change && stem !== base ? [{type: "base_spelling_change", sourcePartId: "base",
          sourceText: base, surfaceText: stem, explanation: change.explanation}] : [],
        wordSum: `${parts.map(part => part.sourceText).join(" + ")} → ${word.word}`,
        familyKey: "", componentPartId: "base", relationshipKind: change ? "regular_inflection" : "free_base",
        requestedSkillKeys: [],
      }]};
  });
}
