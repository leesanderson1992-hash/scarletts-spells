import type {
  ComposedDailyPlan,
  PlanItemCandidate,
  PlanSection,
} from "../daily-assignment-composer";
import type {
  PersistedLessonRouteMetadataV1,
  PersistedLessonRouteMetadataV2,
} from "../composable-lesson/contracts";
import {
  COMPOUND_WORD_LAB_ROUTE_ID,
  COMPOUND_WORD_LAB_ROUTE_VERSION,
  COMPOUND_WORD_LESSON_ITEM_COUNT,
  COMPOUND_WORD_LESSON_PAYLOAD_KIND,
  COMPOUND_WORD_LESSON_RECIPE_KEY,
  COMPOUND_WORD_LESSON_RECIPE_VERSION,
  type CompoundWordLessonPayloadV2,
} from "./compound-word-lesson-v2";

/** Historical schema-v1 contract retained for deterministic CW-2 fixtures and
 * payload replay. New assignments receive immutable release-bound v2 metadata. */
export const COMPOUND_WORD_LAB_V2_ROUTE_METADATA = {
  metadataSchemaVersion: 1,
  route: {
    routeId: COMPOUND_WORD_LAB_ROUTE_ID,
    routeVersion: COMPOUND_WORD_LAB_ROUTE_VERSION,
  },
  recipe: {
    recipeKey: COMPOUND_WORD_LESSON_RECIPE_KEY,
    recipeVersion: COMPOUND_WORD_LESSON_RECIPE_VERSION,
  },
  payload: {
    kind: COMPOUND_WORD_LESSON_PAYLOAD_KIND,
    version: 2,
  },
} as const satisfies PersistedLessonRouteMetadataV1;

/** Pure 2 + 8 + 4 + 4 projection onto the existing ADLE assignment shape. */
export function buildCompoundWordAssignmentPlanV2(
  basePlan: ComposedDailyPlan,
  payload: CompoundWordLessonPayloadV2,
  routeMetadata: PersistedLessonRouteMetadataV1 | PersistedLessonRouteMetadataV2 = COMPOUND_WORD_LAB_V2_ROUTE_METADATA,
): ComposedDailyPlan {
  let position = 0;
  const item = (
    input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance">,
  ): PlanItemCandidate => ({
    ...input,
    position: ++position,
    microSkillKey: payload.microSkillKey,
    provenance: "compound_word_v2",
  });
  const root = {
    compoundWordActivityId: "intro-root",
    compoundWordLesson: payload,
  };
  const learningItemId = (word: CompoundWordLessonPayloadV2["words"]["lesson"][number]) =>
    word.lineage.kind === "learner_target" ? word.lineage.learningItemId : null;
  const id = (kind: string, canonicalWordId: string) => `${kind}-${canonicalWordId}`;
  const sections: PlanSection[] = [
    {
      sectionKey: "lesson_intro",
      purpose: "Compound Word Lab v2",
      items: [
        item({
          sectionKey: "lesson_intro",
          templateKey: "MICRO_READ_ONLY_INTRO",
          canonicalWordId: null,
          targetWord: null,
          learningItemId: null,
          payload: root,
          expectedEvidenceKind: "read_only",
        }),
        item({
          sectionKey: "lesson_intro",
          templateKey: "LESSON_WORDS_INTRO",
          canonicalWordId: null,
          targetWord: null,
          learningItemId: null,
          payload: {
            compoundWordActivityId: "intro-words",
            words: payload.words.lesson,
          },
          expectedEvidenceKind: "read_only",
        }),
      ],
    },
    {
      sectionKey: "guided_practice",
      purpose: "Build and connect",
      items: payload.words.lesson.flatMap((word) => [
        item({
          sectionKey: "guided_practice",
          templateKey: "MOR_COMPOUND_JIGSAW",
          canonicalWordId: word.structure.wholeCanonicalWordId,
          targetWord: word.structure.wholeWord,
          learningItemId: learningItemId(word),
          payload: {
            compoundWordActivityId: id("jigsaw", word.structure.wholeCanonicalWordId),
            configuration: word.tasks.jigsaw,
          },
          expectedEvidenceKind: "guided_task",
        }),
        item({
          sectionKey: "guided_practice",
          templateKey: "MOR_COMPOUND_MEANING_CONNECTION",
          canonicalWordId: word.structure.wholeCanonicalWordId,
          targetWord: word.structure.wholeWord,
          learningItemId: learningItemId(word),
          payload: {
            compoundWordActivityId: id("meaning", word.structure.wholeCanonicalWordId),
            configuration: word.tasks.meaning,
          },
          expectedEvidenceKind: "guided_task",
        }),
      ]),
    },
    {
      sectionKey: "lesson_production",
      purpose: "Cover Check",
      items: payload.words.lesson.map((word) => item({
        sectionKey: "lesson_production",
        templateKey: "CONTROLLED_SPELLING",
        canonicalWordId: word.structure.wholeCanonicalWordId,
        targetWord: word.structure.wholeWord,
        learningItemId: learningItemId(word),
        payload: {
          compoundWordActivityId: id("controlled", word.structure.wholeCanonicalWordId),
          answerPolicy: word.tasks.recall.answerPolicy,
          split: word.tasks.split,
        },
        expectedEvidenceKind: "controlled_spelling",
      })),
    },
    {
      sectionKey: "lesson_dictation",
      purpose: "Dictation",
      items: payload.words.lesson.map((word) => item({
        sectionKey: "lesson_dictation",
        templateKey: "DICTATION_NO_IMAGE",
        canonicalWordId: word.structure.wholeCanonicalWordId,
        targetWord: word.structure.wholeWord,
        learningItemId: learningItemId(word),
        payload: {
          compoundWordActivityId: id("dictation", word.structure.wholeCanonicalWordId),
          sentence: word.dictation.sentence,
          targetSpan: word.dictation.targetSpan,
          answerPolicy: word.tasks.dictation.answerPolicy,
        },
        expectedEvidenceKind: "dictation",
      })),
    },
  ];
  const count = sections.flatMap((section) => section.items).length;
  if (count !== COMPOUND_WORD_LESSON_ITEM_COUNT) {
    throw new Error(`Compound Word v2 snapshot must contain exactly ${COMPOUND_WORD_LESSON_ITEM_COUNT} items.`);
  }
  return {
    ...basePlan,
    lessonRouteMetadata: routeMetadata,
    partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
    partTwo: {
      composed: true,
      microSkillKey: payload.microSkillKey,
      selectionAudit: [],
      lessonWords: payload.words.lesson.map((word) => ({
        canonicalWordId: word.structure.wholeCanonicalWordId,
        provenance: word.lineage.kind === "learner_target" ? "learning_item" : "stretch",
        learningItemId: learningItemId(word),
        complexityLevel: null,
      })),
      probePlan: null,
      stretchItemIntakes: [],
      sections,
      skips: [],
    },
    budget: {
      ...basePlan.budget,
      estimatedResponses: COMPOUND_WORD_LESSON_ITEM_COUNT,
      guidedWordCount: payload.words.lesson.length,
      introTrimmed: false,
      trims: [],
    },
  };
}
