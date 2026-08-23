import { lessonReflectionPrompt } from "../lesson-reflection";
import {
  validateCompoundWordLessonPayloadV2,
  type CompoundWordLessonPayloadV2,
  type CompoundWordLessonReadingPageV2,
} from "./compound-word-lesson-v2";
import type { CompoundWordJoinKind } from "./compound-word-structure-v2";
import type { DictationTargetSpanV2 } from "./dictation-target-span";

export const COMPOUND_WORD_RUNTIME_REFLECTION_PROMPT_KEY =
  "compound-word-v2-runtime-reflection" as const;

export const COMPOUND_WORD_FIRST_IMPRESSION_STAGE_SEQUENCE = [
  "teaching_pages",
  "meet_the_words",
  "compound_jigsaw",
  "meaning_match",
  "cover_check",
  "sentence_dictation",
  "lesson_reflection",
  "celebration",
] as const;

export type ResolvedCompoundTeachingPageV2 = {
  id: string;
  type: "teaching";
  eyebrow: string;
  title: string;
  paragraphs: readonly string[];
  callout?: string;
  sections?: readonly {
    heading?: string;
    paragraphs: readonly string[];
    examples?: readonly { text: string; explanation?: string }[];
  }[];
};

export type ResolvedCompoundRuntimeWordV2 = {
  canonicalWordId: string;
  displayWord: string;
  components: readonly string[];
  joins: readonly CompoundWordJoinKind[];
  componentMeanings: readonly string[];
  childFriendlyDefinition: string;
  componentToWholeRelationship: string;
  audioText: string;
  dictationSentence: string;
  dictationTargetSpan: DictationTargetSpanV2;
  splitPoints: readonly number[];
};

/**
 * The one immutable, presentation-ready authority for Compound Word Lab v2.
 * The existing learner runtime and specialist snapshot compiler both consume
 * this value; neither is permitted to reinterpret the specialist payload.
 */
export type ResolvedCompoundWordFirstImpressionV2 = {
  schemaVersion: 1;
  route: { routeId: "compound_word_lab"; routeVersion: "v2" };
  recipe: { recipeKey: "compound_word_lab"; recipeVersion: "v2" };
  runtime: { adapterKey: "compound_word_v2"; rendererKey: "compound_word_guided" };
  contentVersion: string;
  microSkillKey: string;
  sourcePayload: CompoundWordLessonPayloadV2;
  teaching: {
    pages: readonly ResolvedCompoundTeachingPageV2[];
    meetWords: {
      title: string;
      words: readonly { id: string; word: string; wordParts: readonly string[]; detail: string }[];
    };
  };
  words: readonly ResolvedCompoundRuntimeWordV2[];
  reflection: {
    promptKey: typeof COMPOUND_WORD_RUNTIME_REFLECTION_PROMPT_KEY;
    promptText: string;
    source: { kind: "compound_runtime_contract"; version: 1 };
  };
  stageSequence: typeof COMPOUND_WORD_FIRST_IMPRESSION_STAGE_SEQUENCE;
  celebration: { ownership: "route_owned" };
};

function teachingPages(
  payload: CompoundWordLessonPayloadV2,
  readingPages: readonly CompoundWordLessonReadingPageV2[] | undefined,
): readonly ResolvedCompoundTeachingPageV2[] {
  return readingPages?.map((page) => ({
    id: page.key,
    type: "teaching" as const,
    eyebrow: "Reading",
    title: page.title,
    paragraphs: page.introduction,
    sections: page.sections.map((section) => ({
      ...(section.heading ? { heading: section.heading } : {}),
      paragraphs: section.paragraphs,
      ...(section.examples ? { examples: section.examples } : {}),
    })),
  })) ?? [{
    id: "compound-introduction",
    type: "teaching" as const,
    eyebrow: "Compound words",
    title: payload.activities.introduction.title,
    paragraphs: [payload.activities.introduction.childFriendlyExplanation],
    callout: payload.activities.introduction.summary,
  }];
}

export function resolveCompoundWordFirstImpressionConfig(
  payload: CompoundWordLessonPayloadV2,
): ResolvedCompoundWordFirstImpressionV2 | null {
  if (!validateCompoundWordLessonPayloadV2(payload)) return null;
  const words = payload.words.lesson.map((word) => ({
    canonicalWordId: word.structure.wholeCanonicalWordId,
    displayWord: word.structure.wholeWord,
    components: word.tasks.split.components,
    joins: word.tasks.split.joins,
    componentMeanings: word.structure.components.map((component) => component.meaning),
    childFriendlyDefinition: word.structure.childFriendlyMeaning,
    componentToWholeRelationship: word.structure.componentToWholeRelationship,
    audioText: word.dictation.audioText,
    dictationSentence: word.dictation.sentence,
    dictationTargetSpan: word.dictation.targetSpan,
    splitPoints: word.tasks.split.splitPoints,
  }));
  return {
    schemaVersion: 1,
    route: payload.route,
    recipe: payload.recipe,
    runtime: { adapterKey: "compound_word_v2", rendererKey: "compound_word_guided" },
    contentVersion: payload.contentVersion,
    microSkillKey: payload.microSkillKey,
    sourcePayload: payload,
    teaching: {
      pages: teachingPages(payload, payload.activities.introduction.readingPages),
      meetWords: {
        title: "Today’s compound words",
        words: words.map((word) => ({
          id: word.canonicalWordId,
          word: word.displayWord,
          wordParts: word.components,
          detail: word.componentToWholeRelationship || word.childFriendlyDefinition,
        })),
      },
    },
    words,
    reflection: {
      promptKey: COMPOUND_WORD_RUNTIME_REFLECTION_PROMPT_KEY,
      promptText: lessonReflectionPrompt({ kind: "compound" }),
      source: { kind: "compound_runtime_contract", version: 1 },
    },
    stageSequence: COMPOUND_WORD_FIRST_IMPRESSION_STAGE_SEQUENCE,
    celebration: { ownership: "route_owned" },
  };
}
