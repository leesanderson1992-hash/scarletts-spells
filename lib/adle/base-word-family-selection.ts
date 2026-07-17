/**
 * Pure selection for the ADLE base-word family lesson. It is intentionally
 * fact-fed: this module neither loads data nor writes assignments, evidence,
 * schedules, rewards, or learning items.
 */

import type { DictionaryReviewStatus, DictionaryRowStatus } from "./dictionary-eligibility";
import { compareOldestItemFirst, selectableLearningItems, type LearningItemFact } from "./learning-items";

export const BASE_WORD_LESSON_SIZE = 5;

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
  complexityLevel: number | null;
}

export type BaseWordFamilySelectionSkipReason =
  | "insufficient_verified_authentic_targets"
  | "no_shared_reviewed_base_family"
  | "authentic_target_missing_reviewed_family_member"
  | "insufficient_eligible_family_transfer_words"
  | "authentic_target_complexity_outlier";

export interface BaseWordFamilySelectionFacts {
  learningItems: readonly LearningItemFact[];
  families: readonly BaseWordFamilyFact[];
  members: readonly BaseWordFamilyMemberFact[];
}

export interface BaseWordFamilySelectionResult {
  baseFamilyKey: string | null;
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

/**
 * Select an exact five-word base-family lesson from two or more distinct,
 * verified authentic word targets. The current generic composer remains
 * untouched until a later stage explicitly wires this result into it.
 */
export function selectBaseWordFamilyLesson(
  childId: string,
  microSkillKey: string,
  facts: BaseWordFamilySelectionFacts,
): BaseWordFamilySelectionResult {
  const skipReasons: BaseWordFamilySelectionSkipReason[] = [];
  const authenticItems = selectableLearningItems(facts.learningItems)
    .filter((item) => item.childId === childId && item.microSkillKey === microSkillKey && item.sourceKind === "verified_misspelling")
    .sort(compareOldestItemFirst);
  const seenAuthenticWordIds = new Set<string>();
  const uniqueAuthenticItems = authenticItems.filter((item) => {
    if (seenAuthenticWordIds.has(item.canonicalWordId)) return false;
    seenAuthenticWordIds.add(item.canonicalWordId);
    return true;
  });

  if (uniqueAuthenticItems.length < 2) {
    return { baseFamilyKey: null, slots: [], deferredAuthenticLearningItemIds: [], skipReasons: ["insufficient_verified_authentic_targets"], complexityWindow: null };
  }

  const approvedFamilies = facts.families.filter(
    (family) => family.microSkillKey === microSkillKey && approved(family.rowStatus, family.reviewStatus),
  );
  const approvedMembers = facts.members.filter((member) => approved(member.rowStatus, member.reviewStatus));
  const membersByFamily = new Map<string, BaseWordFamilyMemberFact[]>();
  for (const member of approvedMembers) {
    const members = membersByFamily.get(member.baseFamilyKey) ?? [];
    members.push(member);
    membersByFamily.set(member.baseFamilyKey, members);
  }

  const candidateFamilies = approvedFamilies
    .filter((family) => {
      const ids = new Set((membersByFamily.get(family.baseFamilyKey) ?? []).map((member) => member.canonicalWordId));
      return uniqueAuthenticItems.filter((item) => ids.has(item.canonicalWordId)).length >= 2;
    })
    .sort((a, b) => a.baseFamilyKey.localeCompare(b.baseFamilyKey));
  if (candidateFamilies.length === 0) {
    return { baseFamilyKey: null, slots: [], deferredAuthenticLearningItemIds: [], skipReasons: ["no_shared_reviewed_base_family"], complexityWindow: null };
  }

  const family = candidateFamilies[0];
  const members = membersByFamily.get(family.baseFamilyKey) ?? [];
  const memberByWordId = new Map(members.map((member) => [member.canonicalWordId, member]));
  const targetItems = uniqueAuthenticItems.filter(
    (item) => memberByWordId.get(item.canonicalWordId)?.assignmentEligible === true,
  );
  if (targetItems.length < 2) {
    return { baseFamilyKey: family.baseFamilyKey, slots: [], deferredAuthenticLearningItemIds: [], skipReasons: ["authentic_target_missing_reviewed_family_member"], complexityWindow: null };
  }

  const slots: BaseWordLessonSlot[] = [];
  const deferredAuthenticLearningItemIds: string[] = [];
  let complexityWindow: { min: number; max: number } | null = null;
  for (const item of targetItems) {
    if (slots.length >= BASE_WORD_LESSON_SIZE) {
      deferredAuthenticLearningItemIds.push(item.learningItemId);
      continue;
    }
    const member = memberByWordId.get(item.canonicalWordId)!;
    if (!fitsWindow(complexityWindow, member.complexityLevel)) {
      deferredAuthenticLearningItemIds.push(item.learningItemId);
      continue;
    }
    complexityWindow = widen(complexityWindow, member.complexityLevel);
    slots.push({ canonicalWordId: item.canonicalWordId, provenance: "authentic_target", learningItemId: item.learningItemId, complexityLevel: member.complexityLevel });
  }
  if (slots.filter((slot) => slot.provenance === "authentic_target").length < 2) {
    return { baseFamilyKey: family.baseFamilyKey, slots: [], deferredAuthenticLearningItemIds, skipReasons: ["authentic_target_complexity_outlier"], complexityWindow: null };
  }

  const selectedWordIds = new Set(slots.map((slot) => slot.canonicalWordId));
  const transferCandidates = members
    .filter((member) => member.memberRole === "transfer" && member.assignmentEligible && !selectedWordIds.has(member.canonicalWordId))
    .sort((a, b) => (a.complexityLevel ?? Number.MAX_SAFE_INTEGER) - (b.complexityLevel ?? Number.MAX_SAFE_INTEGER) || a.canonicalWordId.localeCompare(b.canonicalWordId));
  for (const member of transferCandidates) {
    if (slots.length >= BASE_WORD_LESSON_SIZE) break;
    if (!fitsWindow(complexityWindow, member.complexityLevel)) continue;
    complexityWindow = widen(complexityWindow, member.complexityLevel);
    selectedWordIds.add(member.canonicalWordId);
    slots.push({ canonicalWordId: member.canonicalWordId, provenance: "transfer", learningItemId: null, complexityLevel: member.complexityLevel });
  }

  if (slots.length !== BASE_WORD_LESSON_SIZE) {
    skipReasons.push("insufficient_eligible_family_transfer_words");
    return { baseFamilyKey: family.baseFamilyKey, slots: [], deferredAuthenticLearningItemIds, skipReasons, complexityWindow };
  }
  return { baseFamilyKey: family.baseFamilyKey, slots, deferredAuthenticLearningItemIds, skipReasons, complexityWindow };
}
