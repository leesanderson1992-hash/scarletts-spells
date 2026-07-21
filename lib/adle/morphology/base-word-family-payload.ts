/**
 * Versioned, renderer-neutral snapshot for the two-family base-word pilot.
 * It is not consumed by the current D4_MOR_PREFIXES_UN renderer or composer.
 */

export const BASE_WORD_FAMILY_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const BASE_WORD_FAMILY_GUIDED_LIMIT = 8;
export const BASE_WORD_FAMILY_INDEPENDENT_LIMIT = 6;

export interface BaseWordFamilySnapshotTransformation {
  transformationKey: "change_final_y_to_i";
  type: "change_final_y_to_i";
  sourcePartId: string;
  sourceText: string;
  surfaceText: string;
  explanation: string;
}

export function finalYRestorationForBasePart(
  part: { id: string; sourceText: string; surfaceText: string },
  transformations: readonly BaseWordFamilySnapshotTransformation[],
): BaseWordFamilySnapshotTransformation | null {
  const transformation = transformations.find((candidate) => candidate.type === "change_final_y_to_i" && candidate.sourcePartId === part.id);
  return transformation
    && transformation.sourceText === part.sourceText
    && transformation.surfaceText === part.surfaceText
    && transformation.sourceText.length === transformation.surfaceText.length
    && transformation.sourceText.endsWith("y")
    && transformation.surfaceText.endsWith("i")
    && transformation.sourceText.slice(0, -1) === transformation.surfaceText.slice(0, -1)
    ? transformation
    : null;
}

export interface BaseWordFamilySnapshotWord {
  canonicalWordId: string;
  displayWord: string;
  wordSum: string;
  parts: unknown[];
  joins: unknown[];
  transformations: BaseWordFamilySnapshotTransformation[];
  transformationNotes: string;
  childFriendlyMeaning: string;
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

export interface BaseWordFamilyIndependentSlot {
  canonicalWordId: string;
  provenance: "authentic_target" | "transfer";
  baseFamilyKey: string;
  learningItemId: string | null;
}

export type BaseWordFamilyActivityType =
  | "strategy_intro"
  | "family_reveal"
  | "base_cleave"
  | "word_sum_builder"
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
  independentSlots: BaseWordFamilyIndependentSlot[];
  activities: BaseWordFamilyActivity[];
  reflectionPrompt: string;
  measurement: { pilotLessonNumber: number; maxPilotLessons: 5 | null; guidedWordLimit: 8; independentWordLimit: 6 };
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
  independentSlots: BaseWordFamilyIndependentSlot[];
  pilotLessonNumber: number;
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isFinalYToITransformation(value: unknown, parts: unknown[]): value is BaseWordFamilySnapshotTransformation {
  if (!isRecord(value) || value.transformationKey !== "change_final_y_to_i" || value.type !== "change_final_y_to_i" || typeof value.sourcePartId !== "string" || typeof value.sourceText !== "string" || typeof value.surfaceText !== "string" || typeof value.explanation !== "string" || !value.explanation.trim()) return false;
  const part = parts.find((candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.id === value.sourcePartId);
  return !!part
    && typeof part.sourceText === "string"
    && typeof part.surfaceText === "string"
    && part.sourceText === value.sourceText
    && part.surfaceText === value.surfaceText
    && value.sourceText.length === value.surfaceText.length
    && value.sourceText.endsWith("y")
    && value.surfaceText.endsWith("i")
    && value.sourceText.slice(0, -1) === value.surfaceText.slice(0, -1);
}

function isWord(value: unknown): value is BaseWordFamilySnapshotWord {
  if (!isRecord(value) || typeof value.canonicalWordId !== "string" || typeof value.displayWord !== "string" || typeof value.wordSum !== "string" || !Array.isArray(value.parts) || value.parts.length === 0 || !Array.isArray(value.joins) || (value.transformations !== undefined && !Array.isArray(value.transformations)) || typeof value.transformationNotes !== "string" || typeof value.childFriendlyMeaning !== "string" || !value.childFriendlyMeaning.trim() || typeof value.dictationSentence !== "string" || !Number.isInteger(value.dictationTargetTokenIndex) || Number(value.dictationTargetTokenIndex) < 0 || typeof value.audioText !== "string") return false;
  if (!value.parts.every((part) => isRecord(part) && typeof part.id === "string" && typeof part.kind === "string" && typeof part.sourceText === "string" && typeof part.surfaceText === "string") || !value.joins.every((join) => isRecord(join) && typeof join.afterPartId === "string" && typeof join.beforePartId === "string" && ["none", "space", "hyphen"].includes(String(join.joinType)))) return false;
  const transformations = Array.isArray(value.transformations) ? value.transformations : [];
  if (!transformations.every((transformation) => isFinalYToITransformation(transformation, value.parts as unknown[])) || transformations.length > 1) return false;
  const tokens = value.dictationSentence.trim().split(/\s+/).map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, "")).filter(Boolean);
  return tokens[Number(value.dictationTargetTokenIndex)] === value.displayWord.toLocaleLowerCase("en-GB");
}

/** Strict, safe fallback validator. Invalid snapshots are not renderable. */
export function validateBaseWordFamilyLessonSnapshot(value: unknown): BaseWordFamilyLessonSnapshotV1 | null {
  if (!isRecord(value) || value.schemaVersion !== BASE_WORD_FAMILY_SNAPSHOT_SCHEMA_VERSION || value.experience !== "D4_MOR_BASE_WORD_FAMILY" || typeof value.microSkillKey !== "string" || typeof value.contentVersion !== "string" || !Array.isArray(value.authenticTargets) || !Array.isArray(value.familySections) || !Array.isArray(value.independentWords) || !Array.isArray(value.independentSlots) || !Array.isArray(value.activities) || typeof value.reflectionPrompt !== "string" || !isRecord(value.measurement)) return null;
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
  const slots = value.independentSlots;
  if (slots.length !== independent.length || !slots.every((slot) => isRecord(slot) && typeof slot.canonicalWordId === "string" && (slot.provenance === "authentic_target" || slot.provenance === "transfer") && typeof slot.baseFamilyKey === "string" && (slot.learningItemId === null || typeof slot.learningItemId === "string")) || slots.map((slot) => (slot as BaseWordFamilyIndependentSlot).canonicalWordId).join("|") !== independent.map((word) => word.canonicalWordId).join("|")) return null;
  if (slots.filter((slot) => (slot as BaseWordFamilyIndependentSlot).provenance === "authentic_target").length !== 2 || slots.filter((slot) => (slot as BaseWordFamilyIndependentSlot).provenance === "transfer").length !== 4 || !slots.filter((slot) => (slot as BaseWordFamilyIndependentSlot).provenance === "authentic_target").every((slot) => targetIds.includes((slot as BaseWordFamilyIndependentSlot).canonicalWordId))) return null;
  const activities = value.activities;
  const expectedActivityTypes: BaseWordFamilyActivityType[] = ["strategy_intro", ...sections.flatMap(() => ["family_reveal" as const, "base_cleave" as const]), "word_sum_builder", "controlled_spelling", "sentence_dictation", "reflection"];
  if (activities.length !== expectedActivityTypes.length || activities.some((activity, index) => !isRecord(activity) || activity.type !== expectedActivityTypes[index] || !["teaching", "guided", "recall_neutral", "post_submit"].includes(String(activity.answerVisibility)) || !Array.isArray(activity.wordIds) || !activity.wordIds.every((id) => typeof id === "string"))) return null;
  const controlled = activities[activities.length - 3] as BaseWordFamilyActivity;
  const dictation = activities[activities.length - 2] as BaseWordFamilyActivity;
  const reflection = activities[activities.length - 1] as BaseWordFamilyActivity;
  if (controlled.wordIds.join("|") !== independent.map((word) => word.canonicalWordId).join("|") || dictation.wordIds.join("|") !== independent.map((word) => word.canonicalWordId).join("|") || controlled.answerVisibility !== "recall_neutral" || dictation.answerVisibility !== "recall_neutral" || reflection.answerVisibility !== "post_submit" || value.reflectionPrompt.trim() === "") return null;
  if (value.measurement.pilotLessonNumber === undefined || ![5, null].includes(value.measurement.maxPilotLessons as 5 | null) || value.measurement.guidedWordLimit !== 8 || value.measurement.independentWordLimit !== 6) return null;
  return value as unknown as BaseWordFamilyLessonSnapshotV1;
}

/** Compile a reviewed, immutable preview/runtime snapshot without side effects. */
export function compileBaseWordFamilyLessonSnapshot(
  readModel: BaseWordFamilyLessonReadModel,
): BaseWordFamilyLessonSnapshotV1 {
  const wordsById = new Map(
    readModel.familySections.flatMap((section) => section.guidedWords).map((word) => [word.canonicalWordId, word]),
  );
  const independentWords = readModel.independentSlots.map((slot) => {
    const word = wordsById.get(slot.canonicalWordId);
    if (!word) throw new Error(`Base-word lesson independent word ${slot.canonicalWordId} is not in a reviewed family section.`);
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
    independentSlots: readModel.independentSlots,
    activities: [
      { id: "strategy-intro", type: "strategy_intro", answerVisibility: "teaching", wordIds: readModel.authenticTargets.map((target) => target.canonicalWordId) },
      ...readModel.familySections.flatMap((section) => [
        { id: `family-reveal-${section.baseFamilyKey}`, type: "family_reveal" as const, answerVisibility: "guided" as const, wordIds: section.guidedWords.map((word) => word.canonicalWordId) },
        { id: `cleave-${section.baseFamilyKey}`, type: "base_cleave" as const, answerVisibility: "guided" as const, wordIds: section.authenticTargetWordIds },
      ]),
      { id: "word-sum-builder", type: "word_sum_builder", answerVisibility: "guided", wordIds: readModel.familySections.flatMap((section) => section.guidedWords.map((word) => word.canonicalWordId)) },
      { id: "controlled-spelling", type: "controlled_spelling", answerVisibility: "recall_neutral", wordIds: readModel.independentSlots.map((slot) => slot.canonicalWordId) },
      { id: "sentence-dictation", type: "sentence_dictation", answerVisibility: "recall_neutral", wordIds: readModel.independentSlots.map((slot) => slot.canonicalWordId) },
      { id: "reflection", type: "reflection", answerVisibility: "post_submit", wordIds: readModel.independentSlots.map((slot) => slot.canonicalWordId) },
    ],
    reflectionPrompt: "How can finding a base word help you spell and understand more words?",
    measurement: { pilotLessonNumber: readModel.pilotLessonNumber, maxPilotLessons: null, guidedWordLimit: 8, independentWordLimit: 6 },
  };
  if (!validateBaseWordFamilyLessonSnapshot(payload)) {
    throw new Error("Base-word lesson read model did not compile to a safe snapshot.");
  }
  return payload;
}
