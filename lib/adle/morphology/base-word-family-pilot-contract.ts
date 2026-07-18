import type { BaseWordFamilyLessonSnapshotV1 } from "./base-word-family-payload";
import { validateBaseWordFamilyLessonSnapshot } from "./base-word-family-payload";

export const BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT = 13;
export const BASE_WORD_FAMILY_PILOT_MAX_LESSONS = 5;

export function canGenerateBaseWordFamilyPilot(completedLessonCount: number): boolean {
  return Number.isInteger(completedLessonCount) && completedLessonCount >= 0 && completedLessonCount < BASE_WORD_FAMILY_PILOT_MAX_LESSONS;
}

export interface BaseWordFamilyPilotAssignmentItem {
  id: string;
  sectionKey: string;
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  promptData: Record<string, unknown>;
}

export interface BaseWordFamilyPilotBindingSpec {
  binding: string;
  sectionKey: "lesson_intro" | "guided_practice" | "lesson_production" | "lesson_dictation";
  templateKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
}

/** Exact 13-item persisted shape. The renderer must fail closed on any drift. */
export function baseWordFamilyPilotBindingSpecs(payload: BaseWordFamilyLessonSnapshotV1): BaseWordFamilyPilotBindingSpec[] {
  return [
    { binding: "strategy-intro", sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null },
    { binding: "family-matrices", sectionKey: "guided_practice", templateKey: "MOR_BASE_FAMILY_MATRIX", canonicalWordId: null, targetWord: null },
    { binding: "word-sums", sectionKey: "guided_practice", templateKey: "MOR_BASE_WORD_SUM", canonicalWordId: null, targetWord: null },
    ...payload.independentWords.map((word) => ({ binding: `controlled-${word.canonicalWordId}`, sectionKey: "lesson_production" as const, templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })),
    ...payload.independentWords.map((word) => ({ binding: `dictation-${word.canonicalWordId}`, sectionKey: "lesson_dictation" as const, templateKey: "DICTATION_NO_IMAGE", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })),
  ];
}

export function resolveBaseWordFamilyPilotRuntime(
  gateEnabled: boolean,
  items: readonly BaseWordFamilyPilotAssignmentItem[],
): BaseWordFamilyLessonSnapshotV1 | null {
  if (!gateEnabled || items.length !== BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT) return null;
  const root = items.find((item) => item.promptData.pilotActivityId === "strategy-intro");
  const payload = validateBaseWordFamilyLessonSnapshot(root?.promptData.baseWordFamilyLesson);
  if (!payload) return null;
  const specs = baseWordFamilyPilotBindingSpecs(payload);
  if (specs.length !== BASE_WORD_FAMILY_ASSIGNMENT_ITEM_COUNT) return null;
  const expected = new Map(specs.map((spec) => [spec.binding, spec]));
  const observed = new Set<string>();
  for (const item of items) {
    const binding = item.promptData.pilotActivityId;
    if (typeof binding !== "string" || observed.has(binding)) return null;
    observed.add(binding);
    const spec = expected.get(binding);
    if (!spec || item.sectionKey !== spec.sectionKey || item.templateKey !== spec.templateKey || item.canonicalWordId !== spec.canonicalWordId || item.targetWord !== spec.targetWord) return null;
  }
  return observed.size === expected.size ? payload : null;
}
