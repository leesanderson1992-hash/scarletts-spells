import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadActivatedCompoundWordReleaseV2 } from "@/lib/adle/morphology/compound-word-release-loader";
import { loadCurrentPairDeassignments } from "@/lib/adle/word-skill-relationships/pair-decision-veto";
import { canonicalPairKey } from "@/lib/adle/word-skill-relationships/pair-key";
import type { CompoundWordMicroSkillKey } from "@/lib/adle/morphology/compound-word-structure-v2";
import { loadTeachingDictionaryEvidenceAuthorityForSkill } from "./evidence-authority";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { loadLessonReviewRequests } from "./lesson-review-requests";
import { loadCurrentLessonSenses } from "./lesson-sense-projection";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { evaluateLessonCandidate } from "./lesson-candidate";
import { canonicalWordSum } from "./canonical-morphology";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { loadPendingCompoundWorkbookQueue } from "./compound-workbook-draft";
import { compoundWorkbookTitle } from "./compound-workbook";

type Db = ReturnType<typeof createServiceRoleClient>;
export async function compoundReviewSource(db: Db, skill: CompoundWordMicroSkillKey) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Compound review requires a verified dictionary environment.");
  const release = await loadActivatedCompoundWordReleaseV2({ client: db, childId: "00000000-0000-4000-8000-000000000001", environmentKey: environment, microSkillKey: skill });
  if (!release) throw new Error("This compound lesson needs a supported release before words can be published.");
  return release;
}

export async function loadCompoundBulkReview(db: Db, skill: CompoundWordMicroSkillKey, includeBundles = false) {
  const environment = ingReviewEnvironment()!;
  const [release, assigned, requests, pending] = await Promise.all([
    compoundReviewSource(db, skill), loadTeachingDictionaryEvidenceAuthorityForSkill(db, environment, skill),
    loadLessonReviewRequests(db, skill), loadPendingCompoundWorkbookQueue(db, skill),
  ]);
  const structures = release.curriculum.structures;
  const ids = [...new Set([...structures.map(row => row.wholeCanonicalWordId), ...assigned.map(row => row.canonicalWordId), ...requests.keys(), ...pending.map(row => row.wordId)])];
  const [words, bundles, senses, vetoes, memberships, analyses] = await Promise.all([
    db.from("canonical_teaching_dictionary_words").select("id,display_word").in("id", ids).eq("row_status", "active"),
    loadReviewedMeaningBundles(db, ids), loadCurrentLessonSenses(db, ids, [skill]),
    loadCurrentPairDeassignments({ client: db, environmentKey: environment, pairs: ids.map(canonicalWordId => ({ canonicalWordId, microSkillKey: skill })) }),
    db.from("teaching_dictionary_current_sense_family_memberships").select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_morphology").select("id,canonical_word_id,sense_id").in("canonical_word_id", ids),
  ]);
  if (words.error || memberships.error || analyses.error) throw new Error("Could not read assigned compound words.");
  const current = structures.flatMap(structure => {
    const dictation = release.curriculum.dictationByCanonicalId.get(structure.wholeCanonicalWordId);
    return dictation && !vetoes.has(canonicalPairKey(structure.wholeCanonicalWordId, skill)) ? [{
      canonicalWordId: structure.wholeCanonicalWordId, word: structure.wholeWord,
      base: structure.components[0].displaySurface, meaning: structure.childFriendlyMeaning, dictationSentence: dictation.sentence,
    }] : [];
  });
  const rows = words.data.flatMap(word => {
    const bundle = bundles.find(row => row.wordId === word.id);
    const bound = senses.get(`${word.id}:${skill}`);
    const senseId = requests.get(word.id)?.sense_id ?? (bound?.status === "current" ? bound.senseId : bundle?.senseSet.senses.length === 1 ? bundle.senseSet.senses[0].id : undefined);
    const analysis = bundle?.analyses.find(row => row.senseId === senseId);
    const morphologyId = analyses.data.find(row => row.canonical_word_id === word.id && row.sense_id === senseId)?.id;
    const familyLinks = memberships.data.filter(link => link.canonical_word_id === word.id && link.sense_id === senseId && link.sense_morphology_id === morphologyId);
    const choice = evaluateLessonCandidate({ wordId: word.id, displayWord: word.display_word, skillKey: skill, senseId: senseId ?? undefined,
      senseSet: bundle?.senseSet ?? null, morphology: analysis ? { parts: analysis.parts, joins: analysis.joins, wordSum: analysis.wordSum, analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" } : null,
      familyLinks,
    });
    const inPool = current.some(row => row.canonicalWordId === word.id);
    const draft = pending.find(row => row.wordId === word.id);
    if (inPool && choice.status === "ready" && !draft) return [];
    const note = draft ? draft.blockers.join(" ") || "Reviewed changes are ready to publish."
      : choice.status === "not_match" ? "Check the component words and the joins for this compound lesson."
        : choice.issues.map(issue => issue.message).join(" ") || "Review the component words, meanings and joins, then publish this compound.";
    return [{ id: word.id, word: word.display_word, href: `/admin/teaching-dictionary/${word.id}#td-canonical-parts`, note: `${inPool ? "Active in the existing lesson. " : ""}${note}` }];
  }).sort((a, b) => a.word.localeCompare(b.word, "en-GB"));
  return { current, rows, bundles: includeBundles ? rows.map(row => bundles.find(bundle => bundle.wordId === row.id) ?? {
    wordId: row.id, displayWord: row.word, sourceSenseReviewedAt: "", analyses: [],
    senseSet: { pronunciations: [], senses: [{ id: "review", definition: "", partOfSpeech: "", pronunciationId: null }] },
  } satisfies MultiSenseCsvBundle) : [], title: compoundWorkbookTitle(skill), routeId: "compound_word_lab", skill };
}

export async function prefillCompoundWorkbook(db: Db, skill: CompoundWordMicroSkillKey, bundles: MultiSenseCsvBundle[]) {
  const release = await compoundReviewSource(db, skill);
  const compoundFacts = new Map<string, { componentToWholeRelationship: string }>();
  const links = bundles.length ? await db.from("teaching_dictionary_current_sense_family_memberships")
    .select("canonical_word_id,sense_id,family_key,component_part_id,relationship_kind").in("canonical_word_id", bundles.map(bundle => bundle.wordId)) : { data: [], error: null };
  if (links.error) throw new Error("Could not read the compound component families.");
  const prepared = bundles.map(bundle => {
    const structure = release.curriculum.structures.find(row => row.wholeCanonicalWordId === bundle.wordId);
    if (!structure) return bundle;
    compoundFacts.set(bundle.wordId, { componentToWholeRelationship: structure.componentToWholeRelationship });
    if (bundle.sourceSenseReviewedAt || bundle.senseSet.senses.length !== 1) return { ...bundle, analyses: bundle.analyses.map(analysis => {
      if (analysis.familyKey) return analysis;
      // The flat workbook shows one teaching component. Keep all other
      // reviewed component links in the Dictionary; unchanged parts reuse
      // their existing morphology identity on import.
      const family = links.data.filter(link => link.canonical_word_id === bundle.wordId && link.sense_id === analysis.senseId
        && link.component_part_id === analysis.parts[0]?.id);
      return family.length === 1 ? { ...analysis, familyKey: family[0].family_key, componentPartId: family[0].component_part_id, relationshipKind: family[0].relationship_kind } : analysis;
    }) };
    let offset = 0;
    const parts = structure.components.map((component, index) => {
      if (index) offset += structure.joins[index - 1].kind === "none" ? 0 : 1;
      const start = offset; offset += component.displaySurface.length;
      return { id: `component-${index + 1}`, kind: "base" as const, sourceText: component.displaySurface, surfaceText: component.displaySurface, gloss: component.meaning, displayRange: { start, end: offset } };
    });
    const joins = structure.joins.map((join, index) => ({ afterPartId: parts[index].id, beforePartId: parts[index + 1].id, joinType: join.kind }));
    const sense = bundle.senseSet.senses[0];
    return { ...bundle, senseSet: { ...bundle.senseSet, senses: [{ ...sense, definition: sense.definition || structure.childFriendlyMeaning, partOfSpeech: sense.partOfSpeech }] },
      analyses: [{ senseId: sense.id, parts, joins, transformations: [], wordSum: canonicalWordSum(parts, bundle.displayWord), familyKey: "", componentPartId: parts[0].id, relationshipKind: "derived", requestedSkillKeys: [skill] }] } satisfies MultiSenseCsvBundle;
  });
  return { bundles: prepared, compoundFacts };
}
