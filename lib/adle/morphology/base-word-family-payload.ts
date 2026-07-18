/**
 * Versioned, renderer-neutral snapshot for the two-family base-word pilot.
 * It is not consumed by the current D4_MOR_PREFIXES_UN renderer or composer.
 */

export const BASE_WORD_FAMILY_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const BASE_WORD_FAMILY_GUIDED_LIMIT = 8;
export const BASE_WORD_FAMILY_INDEPENDENT_LIMIT = 5;

export interface BaseWordFamilySnapshotWord {
  canonicalWordId: string;
  displayWord: string;
  wordSum: string;
  parts: unknown[];
  joins: unknown[];
  transformationNotes: string;
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  audioText: string;
}

export interface BaseWordFamilySnapshotSection {
  baseFamilyKey: string;
  baseWord: BaseWordFamilySnapshotWord;
  baseMeaning: string;
  etymologyRoute: Record<string, unknown>;
  authenticTargetWordIds: string[];
  guidedWords: BaseWordFamilySnapshotWord[];
}

export interface BaseWordFamilyLessonSnapshotV1 {
  schemaVersion: 1;
  experience: "D4_MOR_BASE_WORD_FAMILY";
  microSkillKey: string;
  contentVersion: string;
  authenticTargets: Array<{ canonicalWordId: string; learningItemId: string; sourceRef: string }>;
  familySections: BaseWordFamilySnapshotSection[];
  independentWords: BaseWordFamilySnapshotWord[];
  measurement: { pilotLessonNumber: number; maxPilotLessons: 5; guidedWordLimit: 8; independentWordLimit: 5 };
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isWord(value: unknown): value is BaseWordFamilySnapshotWord {
  return isRecord(value) && typeof value.canonicalWordId === "string" && typeof value.displayWord === "string" && typeof value.wordSum === "string" && Array.isArray(value.parts) && Array.isArray(value.joins) && typeof value.transformationNotes === "string" && typeof value.dictationSentence === "string" && Number.isInteger(value.dictationTargetTokenIndex) && Number(value.dictationTargetTokenIndex) >= 0 && typeof value.audioText === "string";
}

/** Strict, safe fallback validator. Invalid snapshots are not renderable. */
export function validateBaseWordFamilyLessonSnapshot(value: unknown): BaseWordFamilyLessonSnapshotV1 | null {
  if (!isRecord(value) || value.schemaVersion !== BASE_WORD_FAMILY_SNAPSHOT_SCHEMA_VERSION || value.experience !== "D4_MOR_BASE_WORD_FAMILY" || typeof value.microSkillKey !== "string" || typeof value.contentVersion !== "string" || !Array.isArray(value.authenticTargets) || !Array.isArray(value.familySections) || !Array.isArray(value.independentWords) || !isRecord(value.measurement)) return null;
  const targets = value.authenticTargets;
  const sections = value.familySections;
  const independent = value.independentWords;
  if (targets.length !== 2 || sections.length < 1 || sections.length > 2 || independent.length !== BASE_WORD_FAMILY_INDEPENDENT_LIMIT || !independent.every(isWord)) return null;
  if (!targets.every((target) => isRecord(target) && typeof target.canonicalWordId === "string" && typeof target.learningItemId === "string" && typeof target.sourceRef === "string")) return null;
  if (!sections.every((section) => isRecord(section) && typeof section.baseFamilyKey === "string" && isWord(section.baseWord) && typeof section.baseMeaning === "string" && isRecord(section.etymologyRoute) && Array.isArray(section.authenticTargetWordIds) && section.authenticTargetWordIds.every((id) => typeof id === "string") && Array.isArray(section.guidedWords) && section.guidedWords.every(isWord))) return null;
  const guided = sections.flatMap((section) => (section as BaseWordFamilySnapshotSection).guidedWords);
  if (guided.length > BASE_WORD_FAMILY_GUIDED_LIMIT || new Set(guided.map((word) => word.canonicalWordId)).size !== guided.length) return null;
  if (new Set(sections.map((section) => (section as BaseWordFamilySnapshotSection).baseFamilyKey)).size !== sections.length) return null;
  if (!sections.every((section) => (section as BaseWordFamilySnapshotSection).guidedWords.some((word) => word.canonicalWordId === (section as BaseWordFamilySnapshotSection).baseWord.canonicalWordId))) return null;
  const targetIds = targets.map((target) => (target as { canonicalWordId: string }).canonicalWordId);
  if (!sections.every((section) => (section as BaseWordFamilySnapshotSection).authenticTargetWordIds.every((id) => targetIds.includes(id) && (section as BaseWordFamilySnapshotSection).guidedWords.some((word) => word.canonicalWordId === id)))) return null;
  if (!targetIds.every((id) => independent.some((word) => word.canonicalWordId === id))) return null;
  if (!independent.every((word) => guided.some((guidedWord) => guidedWord.canonicalWordId === word.canonicalWordId))) return null;
  if (value.measurement.pilotLessonNumber === undefined || value.measurement.maxPilotLessons !== 5 || value.measurement.guidedWordLimit !== 8 || value.measurement.independentWordLimit !== 5) return null;
  return value as unknown as BaseWordFamilyLessonSnapshotV1;
}
