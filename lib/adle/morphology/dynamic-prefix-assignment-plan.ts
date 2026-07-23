import type { ComposedDailyPlan, DailyPlanFacts, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import type { DynamicPrefixLessonPayloadV2, DynamicPrefixSelection } from "./dynamic-prefix-word-lab";

/** Builds the exact persisted shape for a reviewed Dynamic Prefix v2 snapshot. */
export function buildDynamicPrefixAssignmentPlan(params: { basePlan: ComposedDailyPlan; facts: DailyPlanFacts; selection: DynamicPrefixSelection; payload: DynamicPrefixLessonPayloadV2 }): ComposedDailyPlan {
  const { basePlan, facts, selection, payload } = params;
  const authentic = new Map(selection.authenticTargets.map((item) => [item.canonicalWordId, item]));
  const guided = payload.activities.guided ?? {
    splitCanonicalWordIds: [payload.words.lesson[0].canonicalWordId],
    builds: [payload.activities.build],
    includeMeaningSort: true,
  };
  const splitWords = guided.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id));
  const buildWords = guided.builds.map((build) => ({ build, word: payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId) }));
  if (splitWords.some((word) => !word) || buildWords.some(({ word }) => !word)) throw new Error("Dynamic Prefix guided targets are not in the immutable lesson.");
  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance"> & { provenance: string }): PlanItemCandidate => ({ ...input, position: ++position, microSkillKey: payload.microSkillId, provenance: input.provenance });
  const lessonWords = payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: authentic.has(word.canonicalWordId) ? "learning_item" as const : "stretch" as const, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, complexityLevel: null }));
  const root = { dynamicPrefixActivityId: "intro-root", dynamicPrefixLesson: payload };
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Dynamic Prefix Word Lab v2", items: [
      item({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: root, expectedEvidenceKind: "read_only", provenance: "dynamic_prefix_v2" }),
      item({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { dynamicPrefixActivityId: "intro-words", words: payload.words.lesson }, expectedEvidenceKind: "read_only", provenance: "dynamic_prefix_v2" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Dynamic Prefix guided work", items: [
      ...splitWords.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-strip-${word!.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })),
      ...(guided.includeMeaningSort ? payload.words.lesson.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-meaning-${word.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })) : []),
      ...buildWords.map(({ word }) => item({ sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `guided-build-${word!.canonicalWordId}` }, expectedEvidenceKind: "guided_task", provenance: "dynamic_prefix_v2" })),
    ] },
    { sectionKey: "lesson_production", purpose: "Controlled spelling", items: payload.words.lesson.map((word) => item({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `controlled-${word.canonicalWordId}`, source: word.source }, expectedEvidenceKind: "controlled_spelling", provenance: "dynamic_prefix_v2" })) },
    { sectionKey: "lesson_dictation", purpose: "Contextual dictation", items: payload.activities.dictation.map((sentence) => item({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, learningItemId: authentic.get(sentence.canonicalWordId)?.learningItemId ?? null, payload: { dynamicPrefixActivityId: `dictation-${sentence.canonicalWordId}`, sentence: sentence.sentence }, expectedEvidenceKind: "dictation", provenance: "dynamic_prefix_v2" })) },
  ];
  return { ...basePlan, partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] }, partTwo: { composed: true, microSkillKey: payload.microSkillId, selectionAudit: [], lessonWords, probePlan: null, stretchItemIntakes: [], sections, skips: [] }, budget: { ...basePlan.budget, estimatedResponses: sections.flatMap((section) => section.items).length, guidedWordCount: payload.words.lesson.length, introTrimmed: false, trims: [] } };
}
