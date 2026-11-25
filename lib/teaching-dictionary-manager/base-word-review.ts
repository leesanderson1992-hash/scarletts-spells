import "server-only";

import { loadLessonReviewRequests } from "./lesson-review-requests";

import { loadEnabledBaseWordReleaseAuthorities } from "@/lib/adle/loaders/curriculum-release-authority";
import { projectPublishedBaseWordRelease } from "@/lib/adle/loaders/published-base-family-words";
import { canonicalBaseWordAnalysis } from "@/lib/adle/base-word-canonical-analysis";
import { canonicalBaseWordWorkflowEnabled } from "@/lib/adle/base-word-canonical-workflow";
import { baseWordFamilyMemberAppliesToMicroSkill } from "@/lib/adle/curriculum-release-activation";
import { baseWordMemberSelectable } from "@/lib/adle/base-word-regularity";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { evaluateLessonCandidate } from "./lesson-candidate";
import { IDENTIFY_BASE_SKILL } from "./bulk-review-scope";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadBaseWordSelectionPool } from "@/lib/adle/loaders/base-word-family-pilot-loader";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type Db = ReturnType<typeof createServiceRoleClient>;

export async function loadIdentifyBaseReview(db: Db, includeBundles = false, skill: string = IDENTIFY_BASE_SKILL) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("Bulk review is unavailable.");
  const generationSupported = skill === IDENTIFY_BASE_SKILL;
  const canonicalEnabled = canonicalBaseWordWorkflowEnabled(environment);
  const [[release], requests] = await Promise.all([
    loadEnabledBaseWordReleaseAuthorities({
      client: db, environmentKey: environment, microSkillKeys: [skill], includePaused: !generationSupported,
    }),
    loadLessonReviewRequests(db, skill),
  ]);
  const requestRows = [...requests.values()].map(({ word_id: id, word, sense_id }) => ({
    id, word, choices: [], base: "",
    note: !release ? "This lesson needs a supported release before the word can become Active."
      : "Confirm the word parts and that the teaching family is available for this lesson.",
    bundle: includeBundles ? {
      wordId: id, displayWord: word, sourceSenseReviewedAt: "",
      senseSet: { senses: [{ id: sense_id ?? "review", definition: "", partOfSpeech: "", pronunciationId: null }], pronunciations: [] },
      analyses: [],
    } satisfies MultiSenseCsvBundle : undefined,
  }));
  if (!release) {
    const bundles = includeBundles ? await readBundles(db, requestRows.map(row => row.id)) : [];
    return { current: [], rows: requestRows.map(row => ({ ...row, bundle: bundles.find(bundle => bundle.wordId === row.id) ?? row.bundle })) };
  }
  const active = canonicalEnabled
    ? await projectPublishedBaseWordRelease(db, release) : release;
  const pool = generationSupported ? await loadBaseWordSelectionPool(db, active) : null;
  const paired = new Set(pool?.eligibleFamilyPairs.flat());
  const familyPool = new Map(pool?.familyCounts.map(family => [family.baseFamilyKey, family.eligibleWordIds]));

  const words = new Map(release.dictionaryWords.map(word => [word.canonicalWordId, word]));
  const currentRows = active.family.families.flatMap(family => family.members.flatMap(member => {
    const word = active.dictionaryWords.find(row => row.canonicalWordId === member.canonicalWordId);
    return word && paired.has(family.baseFamilyKey) && familyPool.get(family.baseFamilyKey)?.has(member.canonicalWordId) ? [{
        canonicalWordId: word.canonicalWordId, word: word.displayWord, base: words.get(family.baseWordId)?.displayWord ?? "",
        meaning: member.childFriendlyMeaning, dictationSentence: word.dictationSentence,
      }] : [];
  }));
  const current = [...new Map(currentRows.map(word => [word.canonicalWordId, word])).values()];
  const inPool = new Set(current.map(word => word.canonicalWordId));
  const legacy = release.family.families.flatMap(family => family.members.flatMap(member => {
    const word = words.get(member.canonicalWordId);
    return word && baseWordFamilyMemberAppliesToMicroSkill(release.family, member, skill)
      ? [{ family, member, word }] : [];
  }));
  const ids = [...new Set(legacy.filter(({ word }) => !inPool.has(word.canonicalWordId)).map(({ word }) => word.canonicalWordId))];
  const extra = requestRows.filter(row => !inPool.has(row.id) && !ids.includes(row.id));
  const bundles = await readBundles(db, [...new Set([...ids, ...extra.map(row => row.id), ...legacy.map(({ family }) => family.baseWordId)])]);
  const byWord = new Map(bundles.map(bundle => [bundle.wordId, bundle]));
  const rows = ids.map(id => {
    const records = legacy.filter(({ word }) => word.canonicalWordId === id);
    const [{ word, member, family }] = records;
    const bundle = byWord.get(id);
    const eligible = records.filter(({ member }) => baseWordMemberSelectable(release.family, member));
    const missingFacts = new Set<string>();
    const choices = bundle?.senseSet.senses.filter(sense => {
      const analysis = bundle.analyses.find(item => item.senseId === sense.id);
      if (!analysis?.familyKey) return false;
      const check = evaluateLessonCandidate({
        wordId: id, displayWord: word.displayWord, skillKey: IDENTIFY_BASE_SKILL, senseId: sense.id, senseSet: bundle.senseSet,
        morphology: { parts: analysis.parts, joins: analysis.joins, wordSum: analysis.wordSum,
          analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
        familyLinks: [{ family_key: analysis.familyKey, sense_id: sense.id,
          component_part_id: analysis.componentPartId, relationship_kind: analysis.relationshipKind }],
      });
      if (check.status !== "ready") {
        check.issues.forEach(issue => missingFacts.add(issue.message));
        return false;
      }
      return eligible.some(({ family }) => {
        const basePart = analysis.parts.find(part => part.id === analysis.componentPartId && part.kind === "base");
        if (!basePart || !canonicalBaseWordAnalysis({ displayWord: bundle.displayWord, parts: analysis.parts,
          joins: analysis.joins, transformations: analysis.transformations, wordSum: analysis.wordSum,
          componentPartId: analysis.componentPartId, baseSource: basePart.sourceText,
          relationshipKind: analysis.relationshipKind })) return false;
        if (family.baseWordId === id) return analysis.relationshipKind === "free_base";
        const baseBundle = byWord.get(family.baseWordId);
        // Use the actual published anchor, including its chosen meaning.
        const activeAnchor = active.family.families.find(item => item.baseFamilyKey === family.baseFamilyKey)
          ?.members.find(item => item.canonicalWordId === family.baseWordId);
        return Boolean(activeAnchor && baseBundle?.analyses.some(base => base.familyKey === analysis.familyKey &&
          base.relationshipKind === "free_base" && base.parts.find(part => part.id === base.componentPartId)?.sourceText === basePart.sourceText &&
          base.senseId === activeAnchor.dictionarySenseId) &&
          ["derived", "regular_inflection"].includes(analysis.relationshipKind));
      });
    }).map(sense => ({ id: sense.id, definition: sense.definition })) ?? [];
    const base = words.get(family.baseWordId)?.displayWord ?? "";
    const note = !generationSupported ? "This historical lesson needs a supported release before any word can become Active." : !canonicalEnabled ? "Canonical Base Word publishing has not been enabled for this environment." : !eligible.length ? "The teaching release excludes this form. Review the family’s regularity before it can be published."
      : choices.length ? "Reviewed facts are ready. Choose the teaching meaning and publish."
        : missingFacts.size ? [...missingFacts].join(" ")
        : !bundle ? "Review the meaning, pronunciation, dictation and word parts, then confirm the teaching family."
          : !inPool.has(family.baseWordId) && family.baseWordId !== id
            ? `Review the base “${base}” in the Teaching Dictionary and approve its meaning, pronunciation, dictation and family. The base does not need a separate lesson assignment.`
            : "Check the reviewed meaning, dictation, word parts and link to the released teaching family.";
    return { id, word: word.displayWord, choices: generationSupported && canonicalEnabled ? choices : [], note, base, bundle: includeBundles ? bundle ?? {
      wordId: id, displayWord: word.displayWord, sourceSenseReviewedAt: "",
      senseSet: { senses: [{ id: "review", definition: member.childFriendlyMeaning, partOfSpeech: "", pronunciationId: null,
        dictationSentence: word.dictationSentence, dictationTargetTokenIndex: word.dictationTargetTokenIndex }], pronunciations: [] },
      analyses: [],
    } satisfies MultiSenseCsvBundle : undefined };
  });
  return { current, rows: [...rows, ...extra.map(row => ({ ...row, bundle: byWord.get(row.id) ?? row.bundle }))].sort((a, b) => a.word.localeCompare(b.word, "en-GB")) };
}

async function readBundles(db: Db, ids: string[]) {
  const result: MultiSenseCsvBundle[] = [];
  for (let offset = 0; offset < ids.length; offset += 75)
    result.push(...await loadReviewedMeaningBundles(db, ids.slice(offset, offset + 75)));
  return result;
}
