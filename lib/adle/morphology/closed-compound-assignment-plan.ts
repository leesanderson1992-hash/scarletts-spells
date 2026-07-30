import type { ComposedDailyPlan, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import { closedCompoundExpectedItemCount, type ClosedCompoundLessonPayloadV1 } from "./closed-compound-word-lab";

/** Immutable 2 + 8 + 4 + 4 shape. Guided construction never claims independent mastery. */
export function buildClosedCompoundAssignmentPlan(basePlan: ComposedDailyPlan, payload: ClosedCompoundLessonPayloadV1): ComposedDailyPlan {
  let position = 0;
  const item = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "provenance">): PlanItemCandidate => ({ ...input, position: ++position, microSkillKey: payload.microSkillId, provenance: "closed_compound_v1" });
  const root = { closedCompoundActivityId: "intro-root", closedCompoundLesson: payload };
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Closed compounds", items: [
      item({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: root, expectedEvidenceKind: "read_only" }),
      item({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { closedCompoundActivityId: "intro-words", words: payload.words.lesson }, expectedEvidenceKind: "read_only" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Build and connect", items: payload.words.lesson.flatMap((word) => [
      item({ sectionKey: "guided_practice", templateKey: "MOR_COMPOUND_JIGSAW", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: null, payload: { closedCompoundActivityId: `jigsaw-${word.canonicalWordId}` }, expectedEvidenceKind: "guided_task" }),
      item({ sectionKey: "guided_practice", templateKey: "MOR_COMPOUND_MEANING_CONNECTION", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: null, payload: { closedCompoundActivityId: `meaning-${word.canonicalWordId}` }, expectedEvidenceKind: "guided_task" }),
    ]) },
    { sectionKey: "lesson_production", purpose: "Cover Check", items: payload.words.lesson.map((word) => item({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, learningItemId: null, payload: { closedCompoundActivityId: `controlled-${word.canonicalWordId}`, compoundAnswerComparison: "separator_significant" }, expectedEvidenceKind: "controlled_spelling" })) },
    { sectionKey: "lesson_dictation", purpose: "Dictation", items: payload.activities.dictation.map((sentence) => item({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: sentence.canonicalWordId, targetWord: sentence.targetWord, learningItemId: null, payload: { closedCompoundActivityId: `dictation-${sentence.canonicalWordId}`, sentence: sentence.sentence }, expectedEvidenceKind: "dictation" })) },
  ];
  if (sections.flatMap((section) => section.items).length !== closedCompoundExpectedItemCount()) throw new Error("Closed compound snapshot must contain exactly 18 items.");
  return { ...basePlan, partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] }, partTwo: { composed: true, microSkillKey: payload.microSkillId, selectionAudit: [], lessonWords: payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, provenance: "stretch", learningItemId: null, complexityLevel: null })), probePlan: null, stretchItemIntakes: [], sections, skips: [] }, budget: { ...basePlan.budget, estimatedResponses: 18, guidedWordCount: 4, introTrimmed: false, trims: [] } };
}
