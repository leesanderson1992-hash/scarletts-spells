import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectBaseWordFamilyLesson } from "../base-word-family-selection";
import {
  BASE_WORD_RECIPE_MICRO_SKILLS,
  inspectBaseWordRouteContent,
  inspectBaseWordRouteSelection,
  observeBaseWordRouteActivation,
  type BaseWordDictionaryWordFact,
  type BaseWordDictationFact,
  type BaseWordFamilyDetailFact,
  type BaseWordFamilyMemberDetailFact,
  type BaseWordReleaseAuthorityFact,
  type BaseWordTeachingContentFact,
} from "../curriculum-readiness/base-word-route-facts";
import type { CurriculumReadinessFacts, RouteActivationFact, RouteContentFact, RouteSelectionFact } from "../curriculum-readiness/resolver";
import { loadCurriculumReadinessFacts } from "./curriculum-readiness-live";
import { loadBaseWordFamilyLessonReadModel } from "./base-word-family-lesson-read-model";
import { isBaseWordFamilyPilotEnabledForChild } from "../morphology/base-word-family-pilot-access";
import { compileBaseWordFamilyLessonSnapshot } from "../morphology/base-word-family-payload";
import {
  loadEnabledBaseWordReleaseAuthorities,
  type ActivatedBaseWordReleaseAuthority,
} from "./curriculum-release-authority";

const BASE_SKILLS = new Set<string>(BASE_WORD_RECIPE_MICRO_SKILLS);

function environmentEnabled(): boolean {
  return process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED === "enabled"
    && process.env.ADLE_BASE_WORD_FAMILY_PILOT_EMERGENCY_DISABLED !== "true";
}

export interface BaseWordCurriculumReadinessLoad {
  facts: CurriculumReadinessFacts;
  routeContent: readonly RouteContentFact[];
  routeSelections: readonly RouteSelectionFact[];
  routeActivation: readonly RouteActivationFact[];
}

interface ProjectedBaseWordAuthority {
  releaseAuthority: BaseWordReleaseAuthorityFact;
  words: BaseWordDictionaryWordFact[];
  teachingContent: BaseWordTeachingContentFact[];
  families: BaseWordFamilyDetailFact[];
  members: BaseWordFamilyMemberDetailFact[];
  dictation: BaseWordDictationFact[];
}

function projectAuthority(authority: ActivatedBaseWordReleaseAuthority): ProjectedBaseWordAuthority {
  return {
    releaseAuthority: {
      activationRevisionId: authority.activationRevisionId,
      releaseManifestId: authority.releaseManifestId,
      dependencyFingerprint: authority.dependencyFingerprint,
      familyAuthorityId: authority.familyAuthorityId,
      teachingContentAuthorityId: authority.teachingContentAuthorityId,
      dictionaryClosureAuthorityId: authority.dictionaryClosureAuthorityId,
    },
    words: authority.dictionaryWords.map((word) => ({
      canonicalWordId: word.canonicalWordId,
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
    })),
    teachingContent: [{
      id: authority.teachingContentAuthorityId,
      microSkillKey: authority.microSkillKey,
      contentVersion: authority.teachingContent.contentVersion,
      rowStatus: "active",
      versionStatus: "active",
      isActive: true,
      finalReadinessReviewStatus: "signed_off",
      childFriendlyExplanation: authority.teachingContent.childFriendlyExplanation,
      ruleExplanation: authority.teachingContent.ruleExplanation,
    }],
    families: authority.family.families.map((family) => ({
      familyId: family.familyId,
      baseFamilyKey: family.baseFamilyKey,
      microSkillKey: authority.microSkillKey,
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
      baseMeaning: family.baseMeaning,
      etymologyRoute: family.etymologyRoute,
    })),
    members: authority.family.families.flatMap((family) => family.members.map((member) => ({
      memberId: member.memberId,
      familyId: family.familyId,
      baseFamilyKey: family.baseFamilyKey,
      microSkillKey: authority.microSkillKey,
      canonicalWordId: member.canonicalWordId,
      memberRole: member.memberRole,
      assignmentEligible: member.assignmentEligible,
      complexityLevel: member.complexityLevel,
      rowStatus: "active" as const,
      reviewStatus: "approved_for_first_exposure" as const,
      wordSum: member.wordSum,
      morphologyParts: member.morphologyParts,
      morphologyJoins: member.morphologyJoins,
      morphologyTransformations: member.morphologyTransformations,
      childFriendlyMeaning: member.childFriendlyMeaning,
    }))),
    dictation: authority.dictionaryWords.map((word) => ({
      id: `${authority.dictionaryClosureAuthorityId}:${word.canonicalWordId}`,
      canonicalWordId: word.canonicalWordId,
      rowStatus: "active",
      reviewStatus: "approved_for_first_exposure",
      dictationSentence: word.dictationSentence,
      dictationTargetTokenIndex: word.dictationTargetTokenIndex,
      audioText: word.audioText,
    })),
  };
}

/**
 * Select-only bridge between approved Teaching Dictionary rows and the central
 * resolver. It observes the existing Base Word pilot gates but never enables
 * them or makes an assignment decision.
 */
export async function loadBaseWordCurriculumReadinessFacts(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
}): Promise<BaseWordCurriculumReadinessLoad> {
  const [core, authorities] = await Promise.all([
    loadCurriculumReadinessFacts({ client: params.client, environmentKey: params.environmentKey, routeActivation: [] }),
    loadEnabledBaseWordReleaseAuthorities({
      client: params.client,
      environmentKey: params.environmentKey,
      microSkillKeys: BASE_WORD_RECIPE_MICRO_SKILLS,
    }),
  ]);
  const projectedBySkill = new Map(authorities.map((authority) => [authority.microSkillKey, {
    authority,
    facts: projectAuthority(authority),
  }]));
  const families = [...projectedBySkill.values()].flatMap(({ facts }) => facts.families);
  const members = [...projectedBySkill.values()].flatMap(({ facts }) => facts.members);
  const wordIdByNormalised = new Map(core.words.map((word) => [word.normalisedWord, word.canonicalWordId]));
  const targetPairs = new Map<string, { canonicalWordId: string; microSkillKey: string }>();
  const addTarget = (canonicalWordId: string, microSkillKey: string) => {
    if (BASE_SKILLS.has(microSkillKey)) targetPairs.set(`${canonicalWordId}\u0000${microSkillKey}`, { canonicalWordId, microSkillKey });
  };
  for (const mapping of core.mappings) {
    const canonicalWordId = wordIdByNormalised.get(mapping.correctSpellingNormalized);
    if (canonicalWordId) addTarget(canonicalWordId, mapping.microSkillKey);
  }
  for (const item of core.learningItems) addTarget(item.canonicalWordId, item.microSkillKey);
  const routeContent = [...targetPairs.values()]
    .map((target) => {
      const projected = projectedBySkill.get(target.microSkillKey)?.facts;
      return inspectBaseWordRouteContent({
        ...target,
        releaseAuthority: projected?.releaseAuthority ?? null,
        words: projected?.words ?? [],
        teachingContent: projected?.teachingContent ?? [],
        families: projected?.families ?? [],
        members: projected?.members ?? [],
        dictation: projected?.dictation ?? [],
      });
    })
    .sort((left, right) => `${left.canonicalWordId}\u0000${left.microSkillKey}`.localeCompare(`${right.canonicalWordId}\u0000${right.microSkillKey}`));
  const activeItems = core.learningItems.filter((item) => BASE_SKILLS.has(item.microSkillKey));
  const selectionKeys = new Map(activeItems.map((item) => [`${item.childId}\u0000${item.canonicalWordId}\u0000${item.microSkillKey}`, item]));
  const payloadByChildSkill = new Map<string, boolean | null>();
  for (const item of selectionKeys.values()) {
    const childSkillKey = `${item.childId}\u0000${item.microSkillKey}`;
    if (payloadByChildSkill.has(childSkillKey)) continue;
    const selection = selectBaseWordFamilyLesson(item.childId, item.microSkillKey, { learningItems: activeItems, families, members });
    if (selection.skipReasons.length > 0) {
      payloadByChildSkill.set(childSkillKey, null);
      continue;
    }
    const activated = projectedBySkill.get(item.microSkillKey);
    if (!activated) {
      payloadByChildSkill.set(childSkillKey, false);
      continue;
    }
    try {
      const readModel = await loadBaseWordFamilyLessonReadModel(params.client, {
        microSkillKey: item.microSkillKey,
        contentVersion: activated.authority.teachingContent.contentVersion,
        releaseAuthority: activated.authority,
        authenticTargets: selection.slots.filter((slot) => slot.provenance === "authentic_target").map((slot) => ({
          canonicalWordId: slot.canonicalWordId, learningItemId: slot.learningItemId!, sourceRef: activeItems.find((candidate) => candidate.learningItemId === slot.learningItemId)?.sourceRef ?? "",
        })),
        sections: selection.guidedFamilySections.map((section) => ({ ...section, authenticTargetWordIds: [...section.authenticTargetWordIds], guidedWordIds: [...section.guidedWordIds] })),
        independentSlots: selection.slots.map((slot) => ({ canonicalWordId: slot.canonicalWordId, provenance: slot.provenance, baseFamilyKey: slot.baseFamilyKey, learningItemId: slot.learningItemId })),
        pilotLessonNumber: 1,
      });
      if (!readModel) payloadByChildSkill.set(childSkillKey, false);
      else {
        compileBaseWordFamilyLessonSnapshot(readModel);
        payloadByChildSkill.set(childSkillKey, true);
      }
    } catch {
      // The inventory must report an exact payload blocker, not stop its full scan.
      payloadByChildSkill.set(childSkillKey, false);
    }
  }
  const routeSelections = [...selectionKeys.values()].map((item) => inspectBaseWordRouteSelection({
    childId: item.childId, canonicalWordId: item.canonicalWordId, microSkillKey: item.microSkillKey,
    learningItems: activeItems, families, members, payloadCompilable: payloadByChildSkill.get(`${item.childId}\u0000${item.microSkillKey}`) ?? null,
  })).sort((left, right) => `${left.childId}\u0000${left.canonicalWordId}\u0000${left.microSkillKey}`.localeCompare(`${right.childId}\u0000${right.canonicalWordId}\u0000${right.microSkillKey}`));
  const routeActivation = [...new Set(activeItems.map((item) => `${item.childId}\u0000${item.microSkillKey}`))]
    .map((key) => {
      const [childId, microSkillKey] = key.split("\u0000");
      return observeBaseWordRouteActivation({
        childId,
        microSkillKey,
        environmentKey: params.environmentKey,
        environmentEnabled: environmentEnabled(),
        releaseAuthorityEnabled: projectedBySkill.has(microSkillKey),
        childEnabled: isBaseWordFamilyPilotEnabledForChild(childId),
      });
    }).sort((left, right) => `${left.microSkillKey}\u0000${left.childId}`.localeCompare(`${right.microSkillKey}\u0000${right.childId}`));
  const facts: CurriculumReadinessFacts = { ...core, routeContent, routeSelections, routeActivation };
  return { facts, routeContent, routeSelections, routeActivation };
}
