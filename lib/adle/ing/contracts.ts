import type { LearningItemFact } from "../learning-items";

export const ING_ROUTE_ID = "ing_endings_word_lab" as const;
export const ING_ROUTE_KEY = "ing_endings_word_lab:v1" as const;
export const ING_MICRO_SKILLS = [
  "D4_INF_ING_ENDINGS_REGULAR",
  "D4_INF_ING_ENDINGS_DROP_E",
  "D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT",
  "D4_INF_ING_ENDINGS_IE_TO_Y",
] as const;
export type IngMicroSkill = typeof ING_MICRO_SKILLS[number];
export type IngRule = "regular" | "drop_e" | "double_final_consonant" | "ie_to_y";
export type IngDoublingPattern = "short_cvc" | "stressed_final_syllable";
export const ING_RULE_FOR_SKILL: Record<IngMicroSkill, IngRule> = {
  D4_INF_ING_ENDINGS_REGULAR: "regular",
  D4_INF_ING_ENDINGS_DROP_E: "drop_e",
  D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT: "double_final_consonant",
  D4_INF_ING_ENDINGS_IE_TO_Y: "ie_to_y",
};

/** A governed derived word. The base is retained as a spelling fact, not a lesson word. */
export interface IngDictionaryWordV1 {
  canonicalWordId: string;
  microSkillKey: IngMicroSkill;
  base: string;
  word: string;
  /** Required for doubling words so the lesson can teach the right pattern. */
  doublingPattern?: IngDoublingPattern;
  meaning: string;
  dictationSentence: string;
  audioText: string;
  rowStatus: "active" | "draft";
  reviewStatus: "approved_for_first_exposure" | "in_review";
  reviewerRef: string | null;
  approvalRef: string | null;
  sourceRefs: readonly string[];
}
export interface IngLessonWordV1 extends IngDictionaryWordV1 {
  learningItemId: string | null;
}
export interface IngLessonV1 {
  schemaVersion: 1;
  routeKey: typeof ING_ROUTE_KEY;
  assignmentKey: string;
  authority: "reviewed_content" | "dev_fixture";
  microSkillKey: IngMicroSkill;
  rule: IngRule;
  words: readonly IngLessonWordV1[];
  queuedTargets: readonly { canonicalWordId: string; learningItemId: string }[];
  deferredLearningItemIds: readonly string[];
  teaching: import("../../../components/adle/first-impression/teaching-pages").TeachingPagesConfig;
  reflectionPrompt: string;
}

export function ingStem(base: string, rule: IngRule): string {
  switch (rule) {
    case "regular": return base;
    case "drop_e": return base.slice(0, -1);
    case "double_final_consonant": return base + base.at(-1);
    case "ie_to_y": return `${base.slice(0, -2)}y`;
  }
}
export function ingWordBlockers(value: IngDictionaryWordV1, fixture = false): string[] {
  const errors: string[] = [];
  const rule = ING_RULE_FOR_SKILL[value.microSkillKey];
  if (!rule || !/^[a-z]+$/.test(value.base) || !/^[a-z]+$/.test(value.word)) return ["word_shape_invalid"];
  if (value.word !== `${ingStem(value.base, rule)}ing`) errors.push("transformation_invalid");
  if (rule === "drop_e" && (!value.base.endsWith("e") || value.base.endsWith("ie"))) errors.push("drop_e_condition_invalid");
  if (rule === "ie_to_y" && !value.base.endsWith("ie")) errors.push("ie_condition_invalid");
  if (rule === "double_final_consonant") {
    const cvcEnding = /[aeiou][b-df-hj-np-tv-z]$/.test(value.base);
    if (!value.doublingPattern || !cvcEnding) errors.push("doubling_condition_invalid");
    if (value.doublingPattern === "short_cvc" && (value.base.length > 4 || (value.base.match(/[aeiou]/g) ?? []).length !== 1)) errors.push("short_cvc_condition_invalid");
    if (value.doublingPattern === "stressed_final_syllable" && value.base.length <= 4) errors.push("stressed_final_syllable_condition_invalid");
  } else if (value.doublingPattern !== undefined) errors.push("unexpected_doubling_pattern");
  const tokens = value.dictationSentence?.toLocaleLowerCase("en-GB").match(/[a-z]+(?:'[a-z]+)*/g) ?? [];
  if (!value.meaning?.trim() || !value.dictationSentence?.trim() || !value.audioText?.trim() || tokens.filter(token => token === value.word).length !== 1) errors.push("content_missing");
  if (!Array.isArray(value.sourceRefs) || !value.sourceRefs.length || value.sourceRefs.some(ref => typeof ref !== "string" || !ref.trim())) errors.push("provenance_missing");
  if (!fixture && (value.rowStatus !== "active" || value.reviewStatus !== "approved_for_first_exposure" || !value.reviewerRef || !value.approvalRef || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.canonicalWordId))) errors.push("not_approved");
  return errors;
}

export interface IngSelection {
  ok: true;
  words: IngLessonWordV1[];
  queuedTargets: { canonicalWordId: string; learningItemId: string }[];
  deferredLearningItemIds: string[];
}
export type IngSelectionResult = IngSelection | { ok: false; blockers: string[] };
export type IngLearningItem = Pick<LearningItemFact, "learningItemId" | "childId" | "canonicalWordId" | "microSkillKey" | "itemStatus" | "rowStatus" | "sourceKind" | "intakeOn">;
