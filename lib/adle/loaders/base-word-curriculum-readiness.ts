import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- curriculum tables predate generated row types */

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectBaseWordFamilyLesson } from "../base-word-family-selection";
import {
  BASE_WORD_MICRO_SKILLS,
  inspectBaseWordRouteContent,
  inspectBaseWordRouteSelection,
  observeBaseWordRouteActivation,
  type BaseWordDictionaryWordFact,
  type BaseWordDictationFact,
  type BaseWordFamilyDetailFact,
  type BaseWordFamilyMemberDetailFact,
  type BaseWordSupportFact,
  type BaseWordTeachingContentFact,
} from "../curriculum-readiness/base-word-route-facts";
import type { CurriculumReadinessFacts, RouteActivationFact, RouteContentFact, RouteSelectionFact } from "../curriculum-readiness/resolver";
import { loadCurriculumReadinessFacts } from "./curriculum-readiness-live";
import { loadBaseWordFamilyLessonReadModel } from "./base-word-family-lesson-read-model";
import { isBaseWordFamilyPilotEnabledForChild } from "../morphology/base-word-family-pilot-access";
import { compileBaseWordFamilyLessonSnapshot } from "../morphology/base-word-family-payload";

const PAGE_SIZE = 500;
const BASE_SKILLS = new Set<string>(BASE_WORD_MICRO_SKILLS);

async function selectAll<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const output: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = client.from(table).select(columns).order("id", { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error(`base word readiness ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    output.push(...page);
    if (page.length < PAGE_SIZE) return output;
    const id = (page[page.length - 1] as { id?: unknown })?.id;
    if (typeof id !== "string" || !id) throw new Error(`base word readiness ${table}: row has no id for keyset pagination`);
    after = id;
  }
}

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

/**
 * Select-only bridge between approved Teaching Dictionary rows and the central
 * resolver. It observes the existing Base Word pilot gates but never enables
 * them or makes an assignment decision.
 */
export async function loadBaseWordCurriculumReadinessFacts(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
}): Promise<BaseWordCurriculumReadinessLoad> {
  const [familiesRaw, membersRaw, dictationRaw, contentRaw] = await Promise.all([
    selectAll<any>(params.client, "canonical_teaching_dictionary_base_word_families", "id,base_family_key,micro_skill_key,row_status,review_status,base_meaning,etymology_route"),
    selectAll<any>(params.client, "canonical_teaching_dictionary_base_word_family_members", "id,base_word_family_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,word_sum,morphology_parts,morphology_joins,morphology_transformations,child_friendly_meaning"),
    selectAll<any>(params.client, "canonical_teaching_dictionary_dictation_sentences", "id,canonical_word_id,row_status,review_status,dictation_sentence,dictation_target_token_index,audio_text"),
    selectAll<any>(params.client, "canonical_teaching_dictionary_content_versions", "id,micro_skill_key,content_version,version_status,is_active,final_readiness_review_status,child_friendly_explanation,rule_explanation"),
  ]);
  const families: BaseWordFamilyDetailFact[] = familiesRaw.map((row) => ({
    familyId: row.id, baseFamilyKey: row.base_family_key, microSkillKey: row.micro_skill_key,
    rowStatus: row.row_status, reviewStatus: row.review_status, baseMeaning: row.base_meaning,
    etymologyRoute: row.etymology_route,
  }));
  const familyKeyById = new Map(families.map((family) => [family.familyId, family.baseFamilyKey]));
  const familySkillById = new Map(families.map((family) => [family.familyId, family.microSkillKey]));
  const members: BaseWordFamilyMemberDetailFact[] = membersRaw.flatMap((row) => {
    const baseFamilyKey = familyKeyById.get(row.base_word_family_id);
    const microSkillKey = familySkillById.get(row.base_word_family_id);
    return baseFamilyKey && microSkillKey ? [{
      memberId: row.id, familyId: row.base_word_family_id, baseFamilyKey, microSkillKey,
      canonicalWordId: row.canonical_word_id, memberRole: row.member_role, assignmentEligible: row.assignment_eligible,
      // Family-member storage has no reviewed complexity field. The existing
      // selector treats null as unknown; inventing a level would distort it.
      complexityLevel: null, rowStatus: row.row_status, reviewStatus: row.review_status,
      wordSum: row.word_sum, morphologyParts: row.morphology_parts, morphologyJoins: row.morphology_joins,
      morphologyTransformations: row.morphology_transformations, childFriendlyMeaning: row.child_friendly_meaning,
    }] : [];
  });
  const dictation: BaseWordDictationFact[] = dictationRaw.map((row) => ({
    id: row.id, canonicalWordId: row.canonical_word_id, rowStatus: row.row_status, reviewStatus: row.review_status,
    dictationSentence: row.dictation_sentence, dictationTargetTokenIndex: row.dictation_target_token_index, audioText: row.audio_text,
  }));
  const teachingContent: BaseWordTeachingContentFact[] = contentRaw.map((row) => ({
    id: row.id, microSkillKey: row.micro_skill_key, contentVersion: row.content_version,
    // Content versions do not have a row_status; active version state is the approval boundary.
    rowStatus: "active", versionStatus: row.version_status, isActive: row.is_active,
    finalReadinessReviewStatus: row.final_readiness_review_status,
    childFriendlyExplanation: row.child_friendly_explanation, ruleExplanation: row.rule_explanation,
  }));
  const core = await loadCurriculumReadinessFacts({ client: params.client, environmentKey: params.environmentKey, routeActivation: [] });
  const words: BaseWordDictionaryWordFact[] = core.words.map((word) => ({ canonicalWordId: word.canonicalWordId, rowStatus: word.rowStatus, reviewStatus: word.reviewStatus }));
  const supports: BaseWordSupportFact[] = core.supports.map((support) => ({
    id: `${support.canonicalWordId}:${support.microSkillKey}:${support.supportRole}`,
    canonicalWordId: support.canonicalWordId, microSkillKey: support.microSkillKey, supportRole: support.supportRole,
    rowStatus: support.rowStatus, reviewStatus: support.reviewStatus,
  }));
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
    .map((target) => inspectBaseWordRouteContent({ ...target, words, supports, teachingContent, families, members, dictation }))
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
    const contentVersion = teachingContent.find((content) => content.microSkillKey === item.microSkillKey && content.versionStatus === "active" && content.isActive && content.finalReadinessReviewStatus === "signed_off")?.contentVersion;
    if (!contentVersion) {
      payloadByChildSkill.set(childSkillKey, false);
      continue;
    }
    try {
      const readModel = await loadBaseWordFamilyLessonReadModel(params.client, {
        microSkillKey: item.microSkillKey,
        contentVersion,
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
      return observeBaseWordRouteActivation({ childId, microSkillKey, environmentKey: params.environmentKey, environmentEnabled: environmentEnabled(), childEnabled: isBaseWordFamilyPilotEnabledForChild(childId) });
    }).sort((left, right) => `${left.microSkillKey}\u0000${left.childId}`.localeCompare(`${right.microSkillKey}\u0000${right.childId}`));
  const facts: CurriculumReadinessFacts = { ...core, routeContent, routeSelections, routeActivation };
  return { facts, routeContent, routeSelections, routeActivation };
}
