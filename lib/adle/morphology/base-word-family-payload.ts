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

export interface BaseWordFamilyAuthenticTarget {
  canonicalWordId: string;
  learningItemId: string;
  sourceRef: string;
}

export type BaseWordFamilyActivityType =
  | "strategy_intro"
  | "family_matrix"
  | "word_sum_exploration"
  | "controlled_spelling"
  | "sentence_dictation"
  | "reflection";

export interface BaseWordFamilyActivity {
  id: string;
  type: BaseWordFamilyActivityType;
  answerVisibility: "teaching" | "guided" | "recall_neutral" | "post_submit";
  wordIds: string[];
}

export interface BaseWordFamilyLessonSnapshotV1 {
  schemaVersion: 1;
  experience: "D4_MOR_BASE_WORD_FAMILY";
  microSkillKey: string;
  contentVersion: string;
  authenticTargets: BaseWordFamilyAuthenticTarget[];
  familySections: BaseWordFamilySnapshotSection[];
  independentWords: BaseWordFamilySnapshotWord[];
  activities: BaseWordFamilyActivity[];
  reflectionPrompt: string;
  measurement: { pilotLessonNumber: number; maxPilotLessons: 5; guidedWordLimit: 8; independentWordLimit: 5 };
}

/**
 * The compiler input is deliberately a read model, rather than a database
 * row shape. This keeps database access server-only and lets the development
 * preview use the same reviewed-content contract without importing data.
 */
export interface BaseWordFamilyLessonReadModel {
  microSkillKey: string;
  contentVersion: string;
  authenticTargets: BaseWordFamilyAuthenticTarget[];
  familySections: BaseWordFamilySnapshotSection[];
  independentWordIds: string[];
  pilotLessonNumber: number;
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isWord(value: unknown): value is BaseWordFamilySnapshotWord {
  if (!isRecord(value) || typeof value.canonicalWordId !== "string" || typeof value.displayWord !== "string" || typeof value.wordSum !== "string" || !Array.isArray(value.parts) || value.parts.length === 0 || !Array.isArray(value.joins) || typeof value.transformationNotes !== "string" || typeof value.dictationSentence !== "string" || !Number.isInteger(value.dictationTargetTokenIndex) || Number(value.dictationTargetTokenIndex) < 0 || typeof value.audioText !== "string") return false;
  if (!value.parts.every((part) => isRecord(part) && typeof part.id === "string" && typeof part.kind === "string" && typeof part.sourceText === "string" && typeof part.surfaceText === "string") || !value.joins.every((join) => isRecord(join) && typeof join.afterPartId === "string" && typeof join.beforePartId === "string" && ["none", "space", "hyphen"].includes(String(join.joinType)))) return false;
  const tokens = value.dictationSentence.trim().split(/\s+/).map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, "")).filter(Boolean);
  return tokens[Number(value.dictationTargetTokenIndex)] === value.displayWord.toLocaleLowerCase("en-GB");
}

/** Strict, safe fallback validator. Invalid snapshots are not renderable. */
export function validateBaseWordFamilyLessonSnapshot(value: unknown): BaseWordFamilyLessonSnapshotV1 | null {
  if (!isRecord(value) || value.schemaVersion !== BASE_WORD_FAMILY_SNAPSHOT_SCHEMA_VERSION || value.experience !== "D4_MOR_BASE_WORD_FAMILY" || typeof value.microSkillKey !== "string" || typeof value.contentVersion !== "string" || !Array.isArray(value.authenticTargets) || !Array.isArray(value.familySections) || !Array.isArray(value.independentWords) || !Array.isArray(value.activities) || typeof value.reflectionPrompt !== "string" || !isRecord(value.measurement)) return null;
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
  const activities = value.activities;
  const expectedActivityTypes: BaseWordFamilyActivityType[] = ["strategy_intro", "family_matrix", "word_sum_exploration", "controlled_spelling", "sentence_dictation", "reflection"];
  if (activities.length !== expectedActivityTypes.length || activities.some((activity, index) => !isRecord(activity) || activity.type !== expectedActivityTypes[index] || !["teaching", "guided", "recall_neutral", "post_submit"].includes(String(activity.answerVisibility)) || !Array.isArray(activity.wordIds) || !activity.wordIds.every((id) => typeof id === "string"))) return null;
  if ((activities[3] as BaseWordFamilyActivity).wordIds.join("|") !== independent.map((word) => word.canonicalWordId).join("|") || (activities[4] as BaseWordFamilyActivity).wordIds.join("|") !== independent.map((word) => word.canonicalWordId).join("|") || (activities[3] as BaseWordFamilyActivity).answerVisibility !== "recall_neutral" || (activities[4] as BaseWordFamilyActivity).answerVisibility !== "recall_neutral" || (activities[5] as BaseWordFamilyActivity).answerVisibility !== "post_submit" || value.reflectionPrompt.trim() === "") return null;
  if (value.measurement.pilotLessonNumber === undefined || value.measurement.maxPilotLessons !== 5 || value.measurement.guidedWordLimit !== 8 || value.measurement.independentWordLimit !== 5) return null;
  return value as unknown as BaseWordFamilyLessonSnapshotV1;
}

/** Compile a reviewed, immutable preview/runtime snapshot without side effects. */
export function compileBaseWordFamilyLessonSnapshot(
  readModel: BaseWordFamilyLessonReadModel,
): BaseWordFamilyLessonSnapshotV1 {
  const wordsById = new Map(
    readModel.familySections.flatMap((section) => section.guidedWords).map((word) => [word.canonicalWordId, word]),
  );
  const independentWords = readModel.independentWordIds.map((id) => {
    const word = wordsById.get(id);
    if (!word) throw new Error(`Base-word lesson independent word ${id} is not in a reviewed family section.`);
    return word;
  });
  const payload: BaseWordFamilyLessonSnapshotV1 = {
    schemaVersion: 1,
    experience: "D4_MOR_BASE_WORD_FAMILY",
    microSkillKey: readModel.microSkillKey,
    contentVersion: readModel.contentVersion,
    authenticTargets: readModel.authenticTargets,
    familySections: readModel.familySections,
    independentWords,
    activities: [
      { id: "strategy-intro", type: "strategy_intro", answerVisibility: "teaching", wordIds: readModel.authenticTargets.map((target) => target.canonicalWordId) },
      { id: "family-matrices", type: "family_matrix", answerVisibility: "teaching", wordIds: readModel.familySections.flatMap((section) => section.guidedWords.map((word) => word.canonicalWordId)) },
      { id: "word-sums", type: "word_sum_exploration", answerVisibility: "guided", wordIds: readModel.familySections.flatMap((section) => section.authenticTargetWordIds) },
      { id: "controlled-spelling", type: "controlled_spelling", answerVisibility: "recall_neutral", wordIds: readModel.independentWordIds },
      { id: "sentence-dictation", type: "sentence_dictation", answerVisibility: "recall_neutral", wordIds: readModel.independentWordIds },
      { id: "reflection", type: "reflection", answerVisibility: "post_submit", wordIds: readModel.independentWordIds },
    ],
    reflectionPrompt: "How can finding a base word help you spell and understand more words?",
    measurement: { pilotLessonNumber: readModel.pilotLessonNumber, maxPilotLessons: 5, guidedWordLimit: 8, independentWordLimit: 5 },
  };
  if (!validateBaseWordFamilyLessonSnapshot(payload)) {
    throw new Error("Base-word lesson read model did not compile to a safe snapshot.");
  }
  return payload;
}
