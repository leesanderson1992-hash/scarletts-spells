import type { BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";
import { baseWordFamilyPilotBindingSpecs } from "./base-word-family-pilot-contract";

export const BASE_WORD_FAMILY_ASSIGNMENT_TITLE = "ADLE Base-word Family Pilot";
export const BASE_WORD_FAMILY_ASSIGNMENT_SOURCE = "adle_base_word_family_pilot_v1";

export interface BaseWordFamilyPersistedItem {
  childId: string;
  parentUserId: string;
  position: number;
  domainModule: "spelling";
  itemType: "lesson";
  sourceType: "adle_base_word_family_pilot";
  sourceEntityId: string;
  templateKey: string;
  targetWord: string | null;
  promptData: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** Compiler only: it does not resolve authentic writing, write a record, or schedule a word. */
export function buildBaseWordFamilyPilotItems(params: {
  payload: BaseWordFamilyLessonSnapshotV1;
  parentUserId: string;
  childId: string;
  planDate: string;
}): BaseWordFamilyPersistedItem[] {
  const { payload, parentUserId, childId, planDate } = params;
  return baseWordFamilyPilotBindingSpecs(payload).map((spec, index) => ({
    childId, parentUserId, position: index + 1, domainModule: "spelling", itemType: "lesson",
    sourceType: "adle_base_word_family_pilot", sourceEntityId: `d4-mor-base-word:${childId}:${planDate}:${spec.binding}`,
    templateKey: spec.templateKey, targetWord: spec.targetWord,
    promptData: {
      pilotActivityId: spec.binding,
      ...(spec.binding === "strategy-intro" ? { baseWordFamilyLesson: payload } : {}),
    },
    metadata: {
      planDate, sectionKey: spec.sectionKey, canonicalWordId: spec.canonicalWordId,
      microSkillKey: payload.microSkillKey,
      ...(payload.independentSlots.find((slot) => slot.canonicalWordId === spec.canonicalWordId) ?? {}),
    },
  }));
}
