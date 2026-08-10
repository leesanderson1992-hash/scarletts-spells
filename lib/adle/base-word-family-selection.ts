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
  /** Historical v1 authorities retain this value for replay/audit only. New
   * selection never treats authentic_target/transfer as learner identity. */
  memberRole: "base" | "authentic_target" | "transfer" | "optional_transfer_check";
  /** Exact reviewed diagnostic relationships carried by family-authority v2.
   * V1 authorities are normalised to their one historical micro-skill. */
  applicableMicroSkillKeys?: readonly string[];
  /** V1 compatibility gate only. V2 family truth derives authenticity from
   * learner evidence and sets this true for every applicable member. */
  authenticSelectionEligible?: boolean;
  /** Assignment-read-model dependency gate. Release-loader callers set this
   * from the exact immutable Teaching Dictionary closure; omitted pure facts
   * retain their historical test/domain behaviour. */
  lessonContentEligible?: boolean;
  assignmentEligible: boolean;
  complexityLevel: number | null;
  rowStatus: DictionaryRowStatus;
  reviewStatus: DictionaryReviewStatus;
}

export type BaseWordLessonSlotProvenance = "authentic_target" | "transfer";
export type BaseWordLessonAssignmentRole =
  | "primary_authentic_target"
  | "queued_family_practice"
  | "generated_family_practice";
export type BaseWordLessonLearnerProvenance =
  | "verified_misspelling"
  | "generated_family_practice";

export interface BaseWordLessonSlot {
  canonicalWordId: string;
  provenance: BaseWordLessonSlotProvenance;
  assignmentRole: BaseWordLessonAssignmentRole;
  learnerProvenance: BaseWordLessonLearnerProvenance;
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
  | "two_distinct_authentic_families_required"
  | "authentic_target_missing_reviewed_family_member"
  | "authentic_target_family_unavailable"
  | "selected_family_missing_transfer_word"
  | "insufficient_eligible_family_transfer_words"
  | "authentic_target_complexity_outlier";

export interface BaseWordFamilySelectionFacts {
  /** Immutable family authority semantics. Omitted test/domain facts exercise
   * the current base-led v2 model; release-loader callers always provide it. */
  familyAuthoritySchemaVersion?: 1 | 2;
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
 * Select exactly six independent words from two distinct reviewed families.
 * The fixed 18-binding Base Word lesson has one guided section per authentic
 * family, so a same-family pair must fail before compilation. The existing
 * generic composer remains untouched.
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
  if (uniqueAuthenticItems.length < BASE_WORD_AUTHENTIC_FAMILY_LIMIT) return empty(["insufficient_verified_authentic_targets"]);
  const baseLedSemantics = facts.familyAuthoritySchemaVersion !== 1;

  const approvedFamilies = new Set(
    facts.families.filter((family) => family.microSkillKey === microSkillKey && approved(family.rowStatus, family.reviewStatus)).map((family) => family.baseFamilyKey),
  );
  const membersByFamily = new Map<string, BaseWordFamilyMemberFact[]>();
  const familiesByWord = new Map<string, string[]>();
  for (const member of facts.members.filter((member) =>
    approved(member.rowStatus, member.reviewStatus) &&
    approvedFamilies.has(member.baseFamilyKey) &&
    (!member.applicableMicroSkillKeys || member.applicableMicroSkillKeys.includes(microSkillKey)) &&
    member.lessonContentEligible !== false
  )) {
    const members = membersByFamily.get(member.baseFamilyKey) ?? [];
    members.push(member);
    membersByFamily.set(member.baseFamilyKey, members);
    const familyKeys = familiesByWord.get(member.canonicalWordId) ?? [];
    familyKeys.push(member.baseFamilyKey);
    familiesByWord.set(member.canonicalWordId, familyKeys);
  }

  const eligibleFamilies = (item: LearningItemFact): string[] =>
    [...new Set((familiesByWord.get(item.canonicalWordId) ?? []).filter((familyKey) =>
      (membersByFamily.get(familyKey) ?? []).some((member) => member.memberRole === "base" && member.assignmentEligible) &&
      (membersByFamily.get(familyKey) ?? []).some((member) =>
        member.canonicalWordId === item.canonicalWordId && member.assignmentEligible &&
        (baseLedSemantics ? member.authenticSelectionEligible !== false : member.memberRole === "authentic_target"),
      ),
    ))].sort();
  const eligibleAuthenticItems = uniqueAuthenticItems.filter((item) => eligibleFamilies(item).length > 0);
  if (eligibleAuthenticItems.length < BASE_WORD_AUTHENTIC_FAMILY_LIMIT)
    return empty(["authentic_target_missing_reviewed_family_member"]);

  // Deterministic oldest valid pair: items are already in canonical learner
  // priority order; scan the first item, then the earliest later item, and
  // use lexical family-key order only to resolve genuinely ambiguous facts.
  let selectedPair: readonly [LearningItemFact, string, LearningItemFact, string] | null = null;
  for (let left = 0; left < eligibleAuthenticItems.length && !selectedPair; left += 1) {
    for (let right = left + 1; right < eligibleAuthenticItems.length && !selectedPair; right += 1) {
      for (const leftFamily of eligibleFamilies(eligibleAuthenticItems[left])) {
        const rightFamily = eligibleFamilies(eligibleAuthenticItems[right]).find((candidate) => candidate !== leftFamily);
        if (!rightFamily) continue;
        const leftMember = (membersByFamily.get(leftFamily) ?? []).find((member) => member.canonicalWordId === eligibleAuthenticItems[left].canonicalWordId)!;
        const rightMember = (membersByFamily.get(rightFamily) ?? []).find((member) => member.canonicalWordId === eligibleAuthenticItems[right].canonicalWordId)!;
        const pairWindow = widen(widen(null, leftMember.complexityLevel), rightMember.complexityLevel);
        if (pairWindow && pairWindow.max - pairWindow.min > 1) continue;
        selectedPair = [eligibleAuthenticItems[left], leftFamily, eligibleAuthenticItems[right], rightFamily];
      }
    }
  }
  if (!selectedPair) return empty(["two_distinct_authentic_families_required"]);
  const selectedAuthentic = [selectedPair[0], selectedPair[2]];
  const authenticFamilyByItem = new Map<string, string>([
    [selectedPair[0].learningItemId, selectedPair[1]],
    [selectedPair[2].learningItemId, selectedPair[3]],
  ]);
  const familyKeys = [selectedPair[1], selectedPair[3]];
  const slots: BaseWordLessonSlot[] = [];
  const selectedLearningItemIds = new Set(selectedAuthentic.map((item) => item.learningItemId));
  let complexityWindow: { min: number; max: number } | null = null;
  for (const item of selectedAuthentic) {
    const familyKey = authenticFamilyByItem.get(item.learningItemId)!;
    const member = (membersByFamily.get(familyKey) ?? []).find((candidate) => candidate.canonicalWordId === item.canonicalWordId)!;
    if (!fitsWindow(complexityWindow, member.complexityLevel)) return empty(["authentic_target_complexity_outlier"]);
    complexityWindow = widen(complexityWindow, member.complexityLevel);
    slots.push({ canonicalWordId: item.canonicalWordId, provenance: "authentic_target", assignmentRole: "primary_authentic_target", learnerProvenance: "verified_misspelling", learningItemId: item.learningItemId, baseFamilyKey: familyKey, complexityLevel: member.complexityLevel });
  }

  const selectedWordIds = new Set(slots.map((slot) => slot.canonicalWordId));
  for (const item of baseLedSemantics ? eligibleAuthenticItems : []) {
    if (slots.length >= BASE_WORD_INDEPENDENT_WORD_COUNT) break;
    if (selectedLearningItemIds.has(item.learningItemId) || selectedWordIds.has(item.canonicalWordId)) continue;
    const familyKey = eligibleFamilies(item).find((candidate) => familyKeys.includes(candidate));
    if (!familyKey) continue;
    const member = (membersByFamily.get(familyKey) ?? []).find((candidate) => candidate.canonicalWordId === item.canonicalWordId)!;
    if (!fitsWindow(complexityWindow, member.complexityLevel)) continue;
    complexityWindow = widen(complexityWindow, member.complexityLevel);
    selectedLearningItemIds.add(item.learningItemId);
    selectedWordIds.add(item.canonicalWordId);
    slots.push({ canonicalWordId: item.canonicalWordId, provenance: "transfer", assignmentRole: "queued_family_practice", learnerProvenance: "verified_misspelling", learningItemId: item.learningItemId, baseFamilyKey: familyKey, complexityLevel: member.complexityLevel });
  }

  const transferCandidatesByFamily = new Map<string, BaseWordFamilyMemberFact[]>();
  for (const familyKey of familyKeys) {
    const candidates = (membersByFamily.get(familyKey) ?? [])
      .filter((member) => member.assignmentEligible && !selectedWordIds.has(member.canonicalWordId) &&
        (baseLedSemantics || member.memberRole === "base" || member.memberRole === "transfer"))
      .sort((a, b) => (a.complexityLevel ?? Number.MAX_SAFE_INTEGER) - (b.complexityLevel ?? Number.MAX_SAFE_INTEGER) || a.canonicalWordId.localeCompare(b.canonicalWordId));
    transferCandidatesByFamily.set(familyKey, candidates);
  }

  // Fill from the joint governed pool. Primary targets already establish both
  // family sections; no unrelated filler is introduced merely because one
  // selected family has fewer suitable independent-practice members.
  while (slots.length < BASE_WORD_INDEPENDENT_WORD_COUNT) {
    const transferCount = (familyKey: string) => slots.filter((slot) => slot.provenance === "transfer" && slot.baseFamilyKey === familyKey).length;
    const candidate = [...familyKeys]
      .sort((left, right) => transferCount(left) - transferCount(right) || familyKeys.indexOf(left) - familyKeys.indexOf(right))
      .flatMap((familyKey) => (transferCandidatesByFamily.get(familyKey) ?? []).map((member) => ({ familyKey, member })))
      .find(({ member }) => !selectedWordIds.has(member.canonicalWordId) && fitsWindow(complexityWindow, member.complexityLevel));
    if (!candidate) return empty(["insufficient_eligible_family_transfer_words"]);
    complexityWindow = widen(complexityWindow, candidate.member.complexityLevel);
    selectedWordIds.add(candidate.member.canonicalWordId);
    slots.push({ canonicalWordId: candidate.member.canonicalWordId, provenance: "transfer", assignmentRole: "generated_family_practice", learnerProvenance: "generated_family_practice", learningItemId: null, baseFamilyKey: candidate.familyKey, complexityLevel: candidate.member.complexityLevel });
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

  const deferredAuthenticLearningItemIds = uniqueAuthenticItems
    .filter((item) => !selectedLearningItemIds.has(item.learningItemId))
    .map((item) => item.learningItemId);
  return { baseFamilyKeys: familyKeys, guidedFamilySections: cappedSections, slots, deferredAuthenticLearningItemIds, skipReasons: [], complexityWindow };
}
