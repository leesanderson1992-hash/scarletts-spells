import type { LearningItemFact } from "../learning-items";
import { selectableLearningItems } from "../learning-items";
import {
  COMPOUND_WORD_MICRO_SKILL_KEYS,
  validateCompoundWordStructureV2,
  type CompoundWordMicroSkillKey,
  type CompoundWordStructureV2,
} from "./compound-word-structure-v2";
import {
  compileCompoundWordTaskConfigurationV2,
  type CompoundWordTaskConfigurationV2,
} from "./compound-word-task-config";
import {
  validateDictationTargetSpanV2,
  type DictationTargetSpanV2,
} from "./dictation-target-span";

export const COMPOUND_WORD_LAB_ROUTE_ID = "compound_word_lab" as const;
export const COMPOUND_WORD_LAB_ROUTE_VERSION = "v2" as const;
export const COMPOUND_WORD_LESSON_PAYLOAD_KIND = "compound_word_lesson_v2" as const;
export const COMPOUND_WORD_LESSON_SCHEMA_VERSION = 2 as const;
export const COMPOUND_WORD_LESSON_RECIPE_KEY = "compound_word_lab" as const;
export const COMPOUND_WORD_LESSON_RECIPE_VERSION = "v2" as const;
export const COMPOUND_WORD_LESSON_ITEM_COUNT = 18 as const;
export const COMPOUND_WORD_LESSON_WORD_COUNT = 4 as const;

export type CompoundWordLessonReadingExampleV2 = {
  text: string;
  explanation?: string;
};

export type CompoundWordLessonReadingSectionV2 = {
  key: string;
  heading?: string;
  paragraphs: readonly string[];
  examples?: readonly CompoundWordLessonReadingExampleV2[];
};

export type CompoundWordLessonReadingPageV2 = {
  key: string;
  title: string;
  introduction: readonly string[];
  sections: readonly CompoundWordLessonReadingSectionV2[];
};

export type CompoundWordLessonIntroductionV2 = {
  title: string;
  childFriendlyExplanation: string;
  summary: string;
  /** Optional for compatibility with already-compiled v2 payloads. New reviewed
   * reading content can be snapshotted here without hard-coding it in the UI. */
  readingPages?: readonly CompoundWordLessonReadingPageV2[];
};

export type CompoundWordLessonReflectionV2 = {
  promptKey: string;
  promptText: string;
};

export type CompoundWordLessonRecipeV2 = {
  recipeKey: typeof COMPOUND_WORD_LESSON_RECIPE_KEY;
  recipeVersion: typeof COMPOUND_WORD_LESSON_RECIPE_VERSION;
  contentVersion: string;
  microSkillKey: CompoundWordMicroSkillKey;
  introduction: CompoundWordLessonIntroductionV2;
  reflection: CompoundWordLessonReflectionV2;
};

export type CompoundWordDictationSourceV2 = {
  canonicalWordId: string;
  sentence: string;
  audioText: string;
  targetSpan: DictationTargetSpanV2;
  review: { status: string; reviewedBy: string; reviewedAt: string };
  source: { artifact: string; sourceRowHash: string };
};

export type CompoundWordLearnerLineageV2 =
  | {
      kind: "learner_target";
      learningItemId: string;
      childId: string;
      sourceKind: LearningItemFact["sourceKind"];
      sourceRef: string;
      sourceAttemptText: string | null;
    }
  | {
      kind: "generated_transfer";
      learningItemId: null;
    };

export type CompoundWordLessonWordV2 = {
  structure: CompoundWordStructureV2;
  lineage: CompoundWordLearnerLineageV2;
  dictation: CompoundWordDictationSourceV2;
  tasks: CompoundWordTaskConfigurationV2;
};

export type CompoundWordLessonPayloadV2 = {
  schemaVersion: typeof COMPOUND_WORD_LESSON_SCHEMA_VERSION;
  payloadKind: typeof COMPOUND_WORD_LESSON_PAYLOAD_KIND;
  route: {
    routeId: typeof COMPOUND_WORD_LAB_ROUTE_ID;
    routeVersion: typeof COMPOUND_WORD_LAB_ROUTE_VERSION;
  };
  recipe: {
    recipeKey: typeof COMPOUND_WORD_LESSON_RECIPE_KEY;
    recipeVersion: typeof COMPOUND_WORD_LESSON_RECIPE_VERSION;
  };
  contentVersion: string;
  microSkillKey: CompoundWordMicroSkillKey;
  assignmentEligible: true;
  words: { lesson: readonly CompoundWordLessonWordV2[] };
  activities: {
    introduction: CompoundWordLessonIntroductionV2;
    reflection: CompoundWordLessonReflectionV2;
  };
};

export type CompoundWordLessonCompileInputV2 = {
  recipe: CompoundWordLessonRecipeV2;
  structures: readonly CompoundWordStructureV2[];
  dictationByCanonicalId: ReadonlyMap<string, CompoundWordDictationSourceV2>;
  learningItems: readonly LearningItemFact[];
  selectionSeed?: string;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCompoundWordLessonReadingPagesV2(value: unknown): value is readonly CompoundWordLessonReadingPageV2[] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length !== 3) return false;
  const pageKeys = new Set<string>();
  for (const rawPage of value) {
    if (!rawPage || typeof rawPage !== "object" || Array.isArray(rawPage)) return false;
    const page = rawPage as Partial<CompoundWordLessonReadingPageV2>;
    if (
      !nonEmpty(page.key) ||
      pageKeys.has(page.key) ||
      !nonEmpty(page.title) ||
      !Array.isArray(page.introduction) ||
      !page.introduction.every(nonEmpty) ||
      !Array.isArray(page.sections) ||
      page.sections.length === 0
    ) return false;
    pageKeys.add(page.key);
    const sectionKeys = new Set<string>();
    for (const rawSection of page.sections) {
      if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) return false;
      const section = rawSection as Partial<CompoundWordLessonReadingSectionV2>;
      if (
        !nonEmpty(section.key) ||
        sectionKeys.has(section.key) ||
        (section.heading !== undefined && !nonEmpty(section.heading)) ||
        !Array.isArray(section.paragraphs) ||
        !section.paragraphs.every(nonEmpty) ||
        (section.examples !== undefined && (
          !Array.isArray(section.examples) ||
          !section.examples.every((example) =>
            example !== null &&
            typeof example === "object" &&
            !Array.isArray(example) &&
            nonEmpty((example as Partial<CompoundWordLessonReadingExampleV2>).text) &&
            ((example as Partial<CompoundWordLessonReadingExampleV2>).explanation === undefined ||
              nonEmpty((example as Partial<CompoundWordLessonReadingExampleV2>).explanation))
          )
        ))
      ) return false;
      sectionKeys.add(section.key);
    }
  }
  return true;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function rotate<T>(values: readonly T[], seed: string): T[] {
  if (values.length === 0) return [];
  const offset = [...seed].reduce(
    (hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0,
    0,
  ) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function prioritiseSeparatedFormCoverage(
  transferIds: readonly string[],
  structures: ReadonlyMap<string, CompoundWordStructureV2>,
  authenticIds: ReadonlySet<string>,
): string[] {
  const ordered = transferIds.filter((id) => !authenticIds.has(id));
  const authentic = [...authenticIds]
    .map((id) => structures.get(id))
    .filter((value): value is CompoundWordStructureV2 => Boolean(value));
  const hasSpace = authentic.some((structure) => structure.joins.some((join) => join.kind === "space"));
  if (hasSpace) return ordered;
  const firstOpen = ordered.findIndex((id) => structures.get(id)?.joins.some((join) => join.kind === "space"));
  if (firstOpen <= 0) return ordered;
  return [ordered[firstOpen], ...ordered.slice(0, firstOpen), ...ordered.slice(firstOpen + 1)];
}

function recipeValid(recipe: CompoundWordLessonRecipeV2): boolean {
  return recipe.recipeKey === COMPOUND_WORD_LESSON_RECIPE_KEY &&
    recipe.recipeVersion === COMPOUND_WORD_LESSON_RECIPE_VERSION &&
    COMPOUND_WORD_MICRO_SKILL_KEYS.includes(recipe.microSkillKey) &&
    nonEmpty(recipe.contentVersion) &&
    nonEmpty(recipe.introduction.title) &&
    nonEmpty(recipe.introduction.childFriendlyExplanation) &&
    nonEmpty(recipe.introduction.summary) &&
    validateCompoundWordLessonReadingPagesV2(recipe.introduction.readingPages) &&
    nonEmpty(recipe.reflection.promptKey) &&
    nonEmpty(recipe.reflection.promptText);
}

function dictationValid(
  dictation: CompoundWordDictationSourceV2,
  structure: CompoundWordStructureV2,
): boolean {
  return dictation.canonicalWordId === structure.wholeCanonicalWordId &&
    nonEmpty(dictation.sentence) &&
    dictation.audioText === dictation.sentence &&
    validateDictationTargetSpanV2(dictation.sentence, dictation.targetSpan) &&
    dictation.targetSpan.exactAnswer === structure.wholeWord &&
    nonEmpty(dictation.review.status) &&
    nonEmpty(dictation.review.reviewedBy) &&
    nonEmpty(dictation.review.reviewedAt) &&
    nonEmpty(dictation.source.artifact) &&
    nonEmpty(dictation.source.sourceRowHash);
}

export function compileCompoundWordLessonV2(
  input: CompoundWordLessonCompileInputV2,
): CompoundWordLessonPayloadV2 | null {
  if (!recipeValid(input.recipe)) return null;
  const structures = new Map<string, CompoundWordStructureV2>();
  for (const value of input.structures) {
    const validated = validateCompoundWordStructureV2(value);
    if (
      !validated.ok ||
      validated.structure.microSkillKey !== input.recipe.microSkillKey ||
      !validated.structure.assignmentEligible
    ) continue;
    structures.set(validated.structure.wholeCanonicalWordId, validated.structure);
  }

  const authentic = selectableLearningItems(input.learningItems)
    .filter((item) => item.microSkillKey === input.recipe.microSkillKey)
    .filter((item, index, all) =>
      structures.has(item.canonicalWordId) &&
      all.findIndex((candidate) => candidate.canonicalWordId === item.canonicalWordId) === index,
    )
    .slice(0, COMPOUND_WORD_LESSON_WORD_COUNT);
  const authenticById = new Map(authentic.map((item) => [item.canonicalWordId, item]));
  const seed = input.selectionSeed ?? authentic[0]?.childId ?? input.recipe.microSkillKey;
  const transferIds = rotate(
    [...structures.values()]
      .filter((structure) => structure.transferEligible)
      .sort((left, right) => left.wholeWord.localeCompare(right.wholeWord))
      .map((structure) => structure.wholeCanonicalWordId),
    seed,
  );
  const orderedTransferIds = input.recipe.microSkillKey === "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED"
    ? prioritiseSeparatedFormCoverage(transferIds, structures, new Set(authenticById.keys()))
    : transferIds.filter((id) => !authenticById.has(id));
  const ids = [
    ...authentic.map((item) => item.canonicalWordId),
    ...orderedTransferIds,
  ].slice(0, COMPOUND_WORD_LESSON_WORD_COUNT);
  if (ids.length !== COMPOUND_WORD_LESSON_WORD_COUNT) return null;

  const lesson: CompoundWordLessonWordV2[] = [];
  for (const id of ids) {
    const structure = structures.get(id);
    const dictation = input.dictationByCanonicalId.get(id);
    if (!structure || !dictation || !dictationValid(dictation, structure)) return null;
    const tasks = compileCompoundWordTaskConfigurationV2({
      structure,
      dictationSentence: dictation.sentence,
      audioText: dictation.audioText,
      dictationTargetSpan: dictation.targetSpan,
    });
    if (!tasks) return null;
    const item = authenticById.get(id);
    lesson.push({
      structure,
      lineage: item
        ? {
            kind: "learner_target",
            learningItemId: item.learningItemId,
            childId: item.childId,
            sourceKind: item.sourceKind,
            sourceRef: item.sourceRef,
            sourceAttemptText: item.sourceAttemptText,
          }
        : { kind: "generated_transfer", learningItemId: null },
      dictation,
      tasks,
    });
  }
  if (new Set(lesson.map((word) => word.dictation.sentence.trim().toLocaleLowerCase("en-GB"))).size !== lesson.length) return null;

  const payload: CompoundWordLessonPayloadV2 = {
    schemaVersion: COMPOUND_WORD_LESSON_SCHEMA_VERSION,
    payloadKind: COMPOUND_WORD_LESSON_PAYLOAD_KIND,
    route: { routeId: COMPOUND_WORD_LAB_ROUTE_ID, routeVersion: COMPOUND_WORD_LAB_ROUTE_VERSION },
    recipe: { recipeKey: COMPOUND_WORD_LESSON_RECIPE_KEY, recipeVersion: COMPOUND_WORD_LESSON_RECIPE_VERSION },
    contentVersion: input.recipe.contentVersion,
    microSkillKey: input.recipe.microSkillKey,
    assignmentEligible: true,
    words: { lesson },
    activities: {
      introduction: input.recipe.introduction,
      reflection: input.recipe.reflection,
    },
  };
  return validateCompoundWordLessonPayloadV2(payload) ? payload : null;
}

export function validateCompoundWordLessonPayloadV2(
  value: unknown,
): value is CompoundWordLessonPayloadV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<CompoundWordLessonPayloadV2>;
  if (
    payload.schemaVersion !== COMPOUND_WORD_LESSON_SCHEMA_VERSION ||
    payload.payloadKind !== COMPOUND_WORD_LESSON_PAYLOAD_KIND ||
    payload.route?.routeId !== COMPOUND_WORD_LAB_ROUTE_ID ||
    payload.route.routeVersion !== COMPOUND_WORD_LAB_ROUTE_VERSION ||
    payload.recipe?.recipeKey !== COMPOUND_WORD_LESSON_RECIPE_KEY ||
    payload.recipe.recipeVersion !== COMPOUND_WORD_LESSON_RECIPE_VERSION ||
    !COMPOUND_WORD_MICRO_SKILL_KEYS.includes(payload.microSkillKey as CompoundWordMicroSkillKey) ||
    payload.assignmentEligible !== true ||
    !nonEmpty(payload.contentVersion) ||
    !Array.isArray(payload.words?.lesson) ||
    payload.words.lesson.length !== COMPOUND_WORD_LESSON_WORD_COUNT ||
    !payload.activities ||
    !nonEmpty(payload.activities.introduction?.title) ||
    !nonEmpty(payload.activities.introduction?.childFriendlyExplanation) ||
    !nonEmpty(payload.activities.introduction?.summary) ||
    !validateCompoundWordLessonReadingPagesV2(payload.activities.introduction?.readingPages) ||
    !nonEmpty(payload.activities.reflection?.promptKey) ||
    !nonEmpty(payload.activities.reflection?.promptText)
  ) return false;

  const seen = new Set<string>();
  const sentences = new Set<string>();
  for (const word of payload.words.lesson) {
    const validated = validateCompoundWordStructureV2(word?.structure);
    if (!validated.ok || validated.structure.microSkillKey !== payload.microSkillKey) return false;
    const id = validated.structure.wholeCanonicalWordId;
    if (seen.has(id) || !validated.structure.assignmentEligible) return false;
    seen.add(id);
    if (!dictationValid(word.dictation, validated.structure)) return false;
    const sentenceKey = word.dictation.sentence.trim().toLocaleLowerCase("en-GB");
    if (sentences.has(sentenceKey)) return false;
    sentences.add(sentenceKey);
    const expectedTasks = compileCompoundWordTaskConfigurationV2({
      structure: validated.structure,
      dictationSentence: word.dictation.sentence,
      audioText: word.dictation.audioText,
      dictationTargetSpan: word.dictation.targetSpan,
    });
    if (!expectedTasks || !same(word.tasks, expectedTasks)) return false;
    if (word.lineage.kind === "learner_target") {
      if (!nonEmpty(word.lineage.learningItemId) || !nonEmpty(word.lineage.childId) || !nonEmpty(word.lineage.sourceKind) || !nonEmpty(word.lineage.sourceRef)) return false;
    } else if (word.lineage.kind !== "generated_transfer" || word.lineage.learningItemId !== null || !validated.structure.transferEligible) {
      return false;
    }
  }
  return true;
}
