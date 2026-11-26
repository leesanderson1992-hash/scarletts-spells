import { hasUsefulSpellingConnection } from "@/lib/adle/spelling-family-connection";
import "server-only";

import { loadLessonReviewRequests } from "./lesson-review-requests";

import { loadEnabledBaseWordReleaseAuthorities } from "@/lib/adle/loaders/curriculum-release-authority";
import { projectPublishedBaseWordRelease } from "@/lib/adle/loaders/published-base-family-words";
import { canonicalBaseWordFamilyMembership } from "@/lib/adle/base-word-canonical-analysis";
import { canonicalBaseWordWorkflowEnabled } from "@/lib/adle/base-word-canonical-workflow";
import { baseWordFamilyMemberAppliesToMicroSkill } from "@/lib/adle/curriculum-release-activation";
import { baseWordMemberSelectable, reviewedBaseWordRegularity } from "@/lib/adle/base-word-regularity";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { evaluateLessonCandidate } from "./lesson-candidate";
import { IDENTIFY_BASE_SKILL } from "./bulk-review-scope";
import { ingReviewEnvironment } from "./ing-staging-scope";
import { loadBaseWordSelectionPool } from "@/lib/adle/loaders/base-word-family-pilot-loader";
import { loadBaseWordFamilyAnchors, chooseBaseWordFamilyAnchor } from "@/lib/adle/loaders/base-word-family-anchors";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

import { loadCurrentPairDeassignments } from '@/lib/adle/word-skill-relationships/pair-decision-veto';
import { canonicalPairKey } from '@/lib/adle/word-skill-relationships/pair-key';

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
    return { current: [], support: [], excluded: [], rows: requestRows.map(row => ({ ...row, bundle: bundles.find(bundle => bundle.wordId === row.id) ?? row.bundle })) };
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
        senseId: member.dictionarySenseId, meaning: member.childFriendlyMeaning, dictationSentence: word.dictationSentence,
      }] : [];
  }));
  const current = [...new Map(currentRows.map(word => [word.canonicalWordId, word])).values()];
  const inPool = new Set(current.map(word => word.canonicalWordId));
  const deassigned = await loadCurrentPairDeassignments({ client: db, environmentKey: environment,
    pairs: release.dictionaryWords.map(word => ({ canonicalWordId: word.canonicalWordId, microSkillKey: skill })) });
  const legacy = release.family.families.flatMap(family => family.members.flatMap(member => {
    const word = words.get(member.canonicalWordId);
    return word && member.assignmentEligible && !deassigned.has(canonicalPairKey(word.canonicalWordId, skill)) && baseWordFamilyMemberAppliesToMicroSkill(release.family, member, skill)
      ? [{ family, member, word }] : [];
  }));
  const ids = [...new Set(legacy.filter(({ word }) => !inPool.has(word.canonicalWordId)).map(({ word }) => word.canonicalWordId))];
  const extra = requestRows.filter(row => !inPool.has(row.id) && !ids.includes(row.id));
  const bundles = await readBundles(db, [...new Set([...ids, ...extra.map(row => row.id), ...legacy.map(({ family }) => family.baseWordId)])]);
  const byWord = new Map(bundles.map(bundle => [bundle.wordId, bundle]));
  const anchors = canonicalEnabled ? await loadBaseWordFamilyAnchors(db,
    legacy.map(({ family }) => family.baseWordId)) : [];
  const rows = ids.map(id => {
    const records = legacy.filter(({ word }) => word.canonicalWordId === id);
    const [{ word, member, family }] = records;
    const bundle = byWord.get(id);
    const eligible = records.filter(({ member }) => baseWordMemberSelectable(release.family, member)
      || (canonicalEnabled && member.assignmentEligible && member.lessonRegularity?.status === "irregular"
        && bundle?.analyses.some(analysis => analysis.familyKey && analysis.relationshipKind === "irregular_inflection"
          && hasUsefulSpellingConnection(analysis.parts, analysis.transformations))));
    const policyExcluded = eligible.length === 0 && records.every(({ member }) => member.lessonRegularity?.status === 'irregular');
    const missingFacts = new Set<string>();
    const choices = bundle?.senseSet.senses.filter(sense => {
      const analysis = bundle.analyses.find(item => item.senseId === sense.id);
      if (!analysis || !analysis.familyLinks?.length && !analysis.familyKey) return false;
      const check = evaluateLessonCandidate({
        wordId: id, displayWord: word.displayWord, skillKey: IDENTIFY_BASE_SKILL, senseId: sense.id, senseSet: bundle.senseSet,
        morphology: { parts: analysis.parts, joins: analysis.joins, transformations: analysis.transformations, wordSum: analysis.wordSum,
          analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
        familyLinks: (analysis.familyLinks?.length ? analysis.familyLinks : [{ familyKey: analysis.familyKey, componentPartId: analysis.componentPartId, relationshipKind: analysis.relationshipKind }]).map(link => ({ family_key: link.familyKey, sense_id: sense.id, component_part_id: link.componentPartId, relationship_kind: link.relationshipKind })),
      });
      if (check.status !== "ready") {
        check.issues.forEach(issue => missingFacts.add(issue.message));
        return false;
      }
      return eligible.some(({ family }) => {
        const links = analysis.familyLinks?.length ? analysis.familyLinks : [{ familyKey: analysis.familyKey, componentPartId: analysis.componentPartId, relationshipKind: analysis.relationshipKind }];
        const activeBase = active.family.families.find(item => item.baseFamilyKey === family.baseFamilyKey)
          ?.members.find(item => item.canonicalWordId === family.baseWordId);
        const familyAnchors = activeBase?.dictionarySenseId ? anchors.filter(anchor =>
          anchor.wordId !== family.baseWordId || anchor.sense.senseId === activeBase.dictionarySenseId) : anchors;
        const anchor = chooseBaseWordFamilyAnchor(familyAnchors, family, links.map(link => link.familyKey));
        if (!anchor) {
          missingFacts.add('Link this meaning to the same approved base meaning used by the teaching family.');
          return false;
        }
        const membership = canonicalBaseWordFamilyMembership({ displayWord: bundle.displayWord,
          parts: analysis.parts, joins: analysis.joins, transformations: analysis.transformations,
          wordSum: analysis.wordSum, anchor, links });
        if (!membership) {
          const regularity = reviewedBaseWordRegularity({ relationshipKind: analysis.relationshipKind, transformations: analysis.transformations, parts: analysis.parts, reviewed: true });
          missingFacts.add(regularity.status === 'needs_review'
            ? 'The reviewed word parts are saved. This family-specific spelling change needs a lesson regularity decision before publishing.'
            : 'Review the word sum, spelling changes and teaching base: they must match the approved family.');
          return false;
        }
        return family.baseWordId === id ? membership.relationshipKind === 'free_base'
          : ['derived', 'regular_inflection', 'irregular_inflection'].includes(membership.relationshipKind);
      });
    }).map(sense => ({ id: sense.id, definition: sense.definition })) ?? [];
    const supportOnly = choices.length > 0 && choices.every(choice => {
      const analysis = bundle?.analyses.find(item => item.senseId === choice.id);
      const part = analysis?.parts[0];
      return analysis?.parts.length === 1 && part?.kind === 'base' &&
        part.sourceText.toLowerCase() === word.displayWord.toLowerCase() && part.surfaceText === word.displayWord &&
        (analysis.familyLinks?.some(link => link.relationshipKind === 'free_base') || analysis.relationshipKind === 'free_base');
    });
    const base = words.get(family.baseWordId)?.displayWord ?? "";
    const note = !generationSupported ? "This historical lesson needs a supported release before any word can become Active." : !canonicalEnabled ? "Canonical Base Word publishing has not been enabled for this environment." : !eligible.length ? "The teaching release excludes this form. Review the family’s regularity before it can be published."
      : supportOnly ? "This base is approved dictionary support. Publish an eligible derived member in its family; the base becomes Active automatically when the two-family lesson has enough words."
      : choices.length ? "Reviewed facts are ready. Choose the teaching meaning and publish."
        : missingFacts.size ? [...missingFacts].join(" ")
        : !bundle ? "Review the meaning, pronunciation, dictation and word parts, then confirm the teaching family."
          : !inPool.has(family.baseWordId) && family.baseWordId !== id
            ? `Review the base “${base}” in the Teaching Dictionary and approve its meaning, pronunciation, dictation and family. The base does not need a separate lesson assignment.`
            : "Check the reviewed meaning, dictation, word parts and link to the released teaching family.";
    return { id, word: word.displayWord, supportOnly, policyExcluded, status: policyExcluded ? "excluded" as const : supportOnly ? "support" as const : choices.length ? "ready" as const : "needs_information" as const, choices: generationSupported && canonicalEnabled && !supportOnly ? choices : [], note, base, bundle: includeBundles ? bundle ?? {
      wordId: id, displayWord: word.displayWord, sourceSenseReviewedAt: "",
      senseSet: { senses: [{ id: "review", definition: member.childFriendlyMeaning, partOfSpeech: "", pronunciationId: null,
        dictationSentence: word.dictationSentence, dictationTargetTokenIndex: word.dictationTargetTokenIndex }], pronunciations: [] },
      analyses: [],
    } satisfies MultiSenseCsvBundle : undefined };
  });
  return { current, support: rows.filter(row => row.supportOnly), excluded: rows.filter(row => row.policyExcluded),
    rows: [...rows.filter(row => !row.supportOnly && !row.policyExcluded), ...extra.map(row => ({ ...row, status: 'needs_information' as const, bundle: byWord.get(row.id) ?? row.bundle }))]
      .sort((a, b) => a.word.localeCompare(b.word, 'en-GB')) };

}

async function readBundles(db: Db, ids: string[]) {
  const result: MultiSenseCsvBundle[] = [];
  for (let offset = 0; offset < ids.length; offset += 75)
    result.push(...await loadReviewedMeaningBundles(db, ids.slice(offset, offset + 75)));
  return result;
}
