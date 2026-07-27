import type { ComposedDailyPlan, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import type { DynamicAffixLessonPayloadV3, DynamicAffixSelection } from "./affix-word-lab";

/** Persists new position-aware snapshots without changing legacy prefix bindings. */
export function buildDynamicAffixAssignmentPlan(params: { basePlan: ComposedDailyPlan; selection: DynamicAffixSelection; payload: DynamicAffixLessonPayloadV3 }): ComposedDailyPlan {
  const authentic = new Map(params.selection.authenticTargets.map((item) => [item.canonicalWordId, item]));
  const { payload } = params;
  const split = payload.activities.guided.splitCanonicalWordIds.map((id) => payload.words.lesson.find((word) => word.canonicalWordId === id));
  const builds = payload.activities.guided.builds.map((build) => ({ build, word: payload.words.lesson.find((word) => word.canonicalWordId === build.canonicalWordId) }));
  if (split.some((word) => !word) || builds.some((entry) => !entry.word)) throw new Error("Dynamic Affix guided targets are not in the immutable lesson.");
  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance">): PlanItemCandidate => ({ ...input, position: ++position, microSkillKey: payload.microSkillId, provenance: "dynamic_affix_v3" });
  const root = { dynamicAffixActivityId: "intro-root", dynamicAffixLesson: payload };
  const id = (name: string, word: string) => `${name}-${word}`;
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Dynamic Affix Word Lab v3", items: [
      item({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: root, expectedEvidenceKind: "read_only" }),
      item({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { dynamicAffixActivityId: "intro-words", words: payload.words.lesson }, expectedEvidenceKind: "read_only" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Dynamic Affix guided work", items: [
      ...split.map((word) => item({ sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("guided-strip", word!.canonicalWordId) }, expectedEvidenceKind: "guided_task" })),
      ...builds.map(({ word }) => item({ sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: word!.canonicalWordId, targetWord: word!.displayWord, learningItemId: authentic.get(word!.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("guided-build", word!.canonicalWordId) }, expectedEvidenceKind: "guided_task" })),
    ] },
    { sectionKey: "lesson_production", purpose: "Controlled spelling", items: payload.words.lesson.map((word) => item({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("controlled", word.canonicalWordId), source: word.source }, expectedEvidenceKind: "controlled_spelling" })) },
    { sectionKey: "lesson_dictation", purpose: "Contextual dictation", items: payload.activities.dictation.map((sentence) => item({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, learningItemId: authentic.get(sentence.canonicalWordId)?.learningItemId ?? null, payload: { dynamicAffixActivityId: id("dictation", sentence.canonicalWordId), sentence: sentence.sentence }, expectedEvidenceKind: "dictation" })) },
  ];
  if (sections.flatMap((section) => section.items).length !== 16) throw new Error("Dynamic Affix standard snapshot must contain exactly sixteen items.");
  return { ...params.basePlan, partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] }, partTwo: { composed: true, microSkillKey: payload.microSkillId, selectionAudit: [], lessonWords: payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: authentic.has(word.canonicalWordId) ? "learning_item" : "stretch", learningItemId: authentic.get(word.canonicalWordId)?.learningItemId ?? null, complexityLevel: null })), probePlan: null, stretchItemIntakes: [], sections, skips: [] }, budget: { ...params.basePlan.budget, estimatedResponses: 16, guidedWordCount: 4, introTrimmed: false, trims: [] } };
}
