/**
 * Pure selection for the ADLE two-family base-word lesson pilot. It is
 * fact-fed: this module neither loads data nor writes assignments, evidence,
 * schedules, rewards, or learning items.
 */

import type { DictionaryReviewStatus, DictionaryRowStatus } from "./dictionary-eligibility";
import { compareOldestItemFirst, selectableLearningItems, type LearningItemFact } from "./learning-items";

export const BASE_WORD_INDEPENDENT_WORD_COUNT = 6;
export const BASE_WORD_GUIDED_DISPLAY_LIMIT = 8;
export const BASE_WORD_AUTHENTIC_FAMILY_LIMIT = 2;

export interface BaseWordFamilyFact {
  baseFamilyKey: string;
  microSkillKey: string;
  rowStatus: DictionaryRowStatus;
  reviewStatus: DictionaryReviewStatus;
}

export interface BaseWordFamilyMemberFact {
  baseFamilyKey: string;
  canonicalWordId: string;
  memberRole: "base" | "authentic_target" | "transfer" | "optional_transfer_check";
  assignmentEligible: boolean;
  complexityLevel: number | null;
  rowStatus: DictionaryRowStatus;
  reviewStatus: DictionaryReviewStatus;
}

export type BaseWordLessonSlotProvenance = "authentic_target" | "transfer";

export interface BaseWordLessonSlot {
  canonicalWordId: string;
  provenance: BaseWordLessonSlotProvenance;
  learningItemId: string | null;
  baseFamilyKey: string;
  complexityLevel: number | null;
}

export interface BaseWordGuidedFamilySection {
  baseFamilyKey: string;
  authenticTargetWordIds: readonly string[];
  guidedWordIds: readonly string[];
}

export type BaseWordFamilySelectionSkipReason =
  | "insufficient_verified_authentic_targets"
  | "authentic_target_missing_reviewed_family_member"
  | "authentic_target_family_unavailable"
  | "selected_family_missing_transfer_word"
  | "insufficient_eligible_family_transfer_words"
  | "authentic_target_complexity_outlier";

export interface BaseWordFamilySelectionFacts {
  learningItems: readonly LearningItemFact[];
  families: readonly BaseWordFamilyFact[];
  members: readonly BaseWordFamilyMemberFact[];
}

export interface BaseWordFamilySelectionResult {
  baseFamilyKeys: readonly string[];
  guidedFamilySections: readonly BaseWordGuidedFamilySection[];
  slots: readonly BaseWordLessonSlot[];
  deferredAuthenticLearningItemIds: readonly string[];
  skipReasons: readonly BaseWordFamilySelectionSkipReason[];
  complexityWindow: { min: number; max: number } | null;
}

function approved(rowStatus: DictionaryRowStatus, reviewStatus: DictionaryReviewStatus): boolean {
  return rowStatus === "active" && reviewStatus === "approved_for_first_exposure";
}

function fitsWindow(window: { min: number; max: number } | null, level: number | null): boolean {
  if (window === null || level === null) return true;
  return Math.max(window.max, level) - Math.min(window.min, level) <= 1;
}

function widen(window: { min: number; max: number } | null, level: number | null): { min: number; max: number } | null {
  if (level === null) return window;
  if (window === null) return { min: level, max: level };
  return { min: Math.min(window.min, level), max: Math.max(window.max, level) };
}

function empty(skipReasons: readonly BaseWordFamilySelectionSkipReason[]): BaseWordFamilySelectionResult {
  return { baseFamilyKeys: [], guidedFamilySections: [], slots: [], deferredAuthenticLearningItemIds: [], skipReasons, complexityWindow: null };
}

/**
 * Select exactly six independent words from one or two reviewed families.
 * Two verified authentic targets share the diagnostic micro-skill, not
 * necessarily a base family. The existing generic composer remains untouched.
 */
export function selectBaseWordFamilyLesson(
  childId: string,
  microSkillKey: string,
  facts: BaseWordFamilySelectionFacts,
): BaseWordFamilySelectionResult {
  const authenticItems = selectableLearningItems(facts.learningItems)
    .filter((item) => item.childId === childId && item.microSkillKey === microSkillKey && item.sourceKind === "verified_misspelling")
    .sort(compareOldestItemFirst);
  const seenWords = new Set<string>();
  const uniqueAuthenticItems = authenticItems.filter((item) => {
    if (seenWords.has(item.canonicalWordId)) return false;
    seenWords.add(item.canonicalWordId);
    return true;
  });
  if (uniqueAuthenticItems.length < 2) return empty(["insufficient_verified_authentic_targets"]);

  const approvedFamilies = new Set(
    facts.families.filter((family) => family.microSkillKey === microSkillKey && approved(family.rowStatus, family.reviewStatus)).map((family) => family.baseFamilyKey),
  );
  const membersByFamily = new Map<string, BaseWordFamilyMemberFact[]>();
  const familiesByWord = new Map<string, string[]>();
  for (const member of facts.members.filter((member) => approved(member.rowStatus, member.reviewStatus) && approvedFamilies.has(member.baseFamilyKey))) {
    const members = membersByFamily.get(member.baseFamilyKey) ?? [];
    members.push(member);
    membersByFamily.set(member.baseFamilyKey, members);
    const familyKeys = familiesByWord.get(member.canonicalWordId) ?? [];
    familyKeys.push(member.baseFamilyKey);
    familiesByWord.set(member.canonicalWordId, familyKeys);
  }

  const selectedAuthentic = uniqueAuthenticItems.slice(0, BASE_WORD_AUTHENTIC_FAMILY_LIMIT);
  const authenticFamilyByItem = new Map<string, string>();
  for (const item of selectedAuthentic) {
    const familyKey = (familiesByWord.get(item.canonicalWordId) ?? []).sort()[0];
    if (!familyKey) return empty(["authentic_target_missing_reviewed_family_member"]);
    const member = (membersByFamily.get(familyKey) ?? []).find((candidate) => candidate.canonicalWordId === item.canonicalWordId);
    if (!member?.assignmentEligible) return empty(["authentic_target_family_unavailable"]);
    authenticFamilyByItem.set(item.learningItemId, familyKey);
  }

  const familyKeys = [...new Set(selectedAuthentic.map((item) => authenticFamilyByItem.get(item.learningItemId)!))];
  const slots: BaseWordLessonSlot[] = [];
  const deferredAuthenticLearningItemIds = uniqueAuthenticItems.slice(BASE_WORD_AUTHENTIC_FAMILY_LIMIT).map((item) => item.learningItemId);
  let complexityWindow: { min: number; max: number } | null = null;
  for (const item of selectedAuthentic) {
    const familyKey = authenticFamilyByItem.get(item.learningItemId)!;
    const member = (membersByFamily.get(familyKey) ?? []).find((candidate) => candidate.canonicalWordId === item.canonicalWordId)!;
    if (!fitsWindow(complexityWindow, member.complexityLevel)) return empty(["authentic_target_complexity_outlier"]);
    complexityWindow = widen(complexityWindow, member.complexityLevel);
    slots.push({ canonicalWordId: item.canonicalWordId, provenance: "authentic_target", learningItemId: item.learningItemId, baseFamilyKey: familyKey, complexityLevel: member.complexityLevel });
  }

  const selectedWordIds = new Set(slots.map((slot) => slot.canonicalWordId));
  const transferCandidatesByFamily = new Map<string, BaseWordFamilyMemberFact[]>();
  for (const familyKey of familyKeys) {
    const candidates = (membersByFamily.get(familyKey) ?? [])
      .filter((member) => (member.memberRole === "base" || member.memberRole === "transfer") && member.assignmentEligible && !selectedWordIds.has(member.canonicalWordId))
      .sort((a, b) => (a.complexityLevel ?? Number.MAX_SAFE_INTEGER) - (b.complexityLevel ?? Number.MAX_SAFE_INTEGER) || a.canonicalWordId.localeCompare(b.canonicalWordId));
    if (candidates.length === 0) return empty(["selected_family_missing_transfer_word"]);
    transferCandidatesByFamily.set(familyKey, candidates);
  }

  // First guarantee at least one independently practised relative for every
  // authentic family. The four related words are then drawn from the joint,
  // reviewed pool, which lets a rich family safely support a smaller but still
  // genuine paired family without introducing unrelated filler.
  for (const familyKey of familyKeys) {
    const candidate = (transferCandidatesByFamily.get(familyKey) ?? []).find((member) => fitsWindow(complexityWindow, member.complexityLevel));
    if (!candidate) return empty(["selected_family_missing_transfer_word"]);
    complexityWindow = widen(complexityWindow, candidate.complexityLevel);
    selectedWordIds.add(candidate.canonicalWordId);
    slots.push({ canonicalWordId: candidate.canonicalWordId, provenance: "transfer", learningItemId: null, baseFamilyKey: familyKey, complexityLevel: candidate.complexityLevel });
  }
  while (slots.length < BASE_WORD_INDEPENDENT_WORD_COUNT) {
    const transferCount = (familyKey: string) => slots.filter((slot) => slot.provenance === "transfer" && slot.baseFamilyKey === familyKey).length;
    const candidate = [...familyKeys]
      .sort((left, right) => transferCount(left) - transferCount(right) || familyKeys.indexOf(left) - familyKeys.indexOf(right))
      .flatMap((familyKey) => (transferCandidatesByFamily.get(familyKey) ?? []).map((member) => ({ familyKey, member })))
      .find(({ member }) => !selectedWordIds.has(member.canonicalWordId) && fitsWindow(complexityWindow, member.complexityLevel));
    if (!candidate) return empty(["insufficient_eligible_family_transfer_words"]);
    complexityWindow = widen(complexityWindow, candidate.member.complexityLevel);
    selectedWordIds.add(candidate.member.canonicalWordId);
    slots.push({ canonicalWordId: candidate.member.canonicalWordId, provenance: "transfer", learningItemId: null, baseFamilyKey: candidate.familyKey, complexityLevel: candidate.member.complexityLevel });
  }

  const guidedFamilySections = familyKeys.map((familyKey) => {
    const targetIds = selectedAuthentic.filter((item) => authenticFamilyByItem.get(item.learningItemId) === familyKey).map((item) => item.canonicalWordId);
    const independentIds = slots.filter((slot) => slot.baseFamilyKey === familyKey).map((slot) => slot.canonicalWordId);
    const members = (membersByFamily.get(familyKey) ?? []).slice().sort((a, b) => {
      const rank = (member: BaseWordFamilyMemberFact) => member.memberRole === "base" ? 0 : independentIds.includes(member.canonicalWordId) ? 1 : targetIds.includes(member.canonicalWordId) ? 2 : 3;
      return rank(a) - rank(b) || a.canonicalWordId.localeCompare(b.canonicalWordId);
    });
    return { baseFamilyKey: familyKey, authenticTargetWordIds: targetIds, guidedWordIds: members.map((member) => member.canonicalWordId) };
  });
  // Base words plus the six independently practised words always fit inside
  // the eight-word guided cap. Fill any spare guided slots in family order.
  const mandatoryIdsByFamily = new Map<string, Set<string>>();
  for (const familyKey of familyKeys) {
    const baseWordIds = (membersByFamily.get(familyKey) ?? [])
      .filter((member) => member.memberRole === "base")
      .map((member) => member.canonicalWordId);
    const independentWordIds = slots
      .filter((slot) => slot.baseFamilyKey === familyKey)
      .map((slot) => slot.canonicalWordId);
    mandatoryIdsByFamily.set(familyKey, new Set([...baseWordIds, ...independentWordIds]));
  }
  let remainingGuidedSlots = BASE_WORD_GUIDED_DISPLAY_LIMIT - [...mandatoryIdsByFamily.values()].reduce((total, ids) => total + ids.size, 0);
  const cappedSections = guidedFamilySections.map((section) => {
    const mandatoryIds = mandatoryIdsByFamily.get(section.baseFamilyKey)!;
    const guidedWordIds = section.guidedWordIds.filter((id) => mandatoryIds.has(id));
    for (const id of section.guidedWordIds) {
      if (mandatoryIds.has(id) || remainingGuidedSlots === 0) continue;
      guidedWordIds.push(id);
      remainingGuidedSlots -= 1;
    }
    return { ...section, guidedWordIds };
  });
  if (cappedSections.some((section) => section.authenticTargetWordIds.some((target) => !section.guidedWordIds.includes(target)))) return empty(["authentic_target_family_unavailable"]);

  return { baseFamilyKeys: familyKeys, guidedFamilySections: cappedSections, slots, deferredAuthenticLearningItemIds, skipReasons: [], complexityWindow };
}
