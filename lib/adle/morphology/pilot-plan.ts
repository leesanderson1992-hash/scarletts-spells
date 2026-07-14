import type { ComposedDailyPlan, DailyPlanFacts, PlanItemCandidate, PlanSection } from "../daily-assignment-composer";
import { learningItemFromStretchSelection, type LearningItemFact } from "../learning-items";
import type { IsoDate } from "../review-scheduler";
import { compileMorphologyUnPilotPayload, MORPHOLOGY_UN_MICRO_SKILL } from "./payload";

const ALL_PAYLOAD_WORDS = ["unhappy", "unfair", "unkind", "unlock", "untidy", "unnatural", "unnecessary"] as const;
const LESSON_WORDS = ["unfair", "unkind", "unlock", "untidy"] as const;

export function buildMorphologyUnPilotPlan(params: { basePlan: ComposedDailyPlan; facts: DailyPlanFacts; planDate: IsoDate }): ComposedDailyPlan {
  const { basePlan, facts, planDate } = params;
  const ids: Record<string, string> = {};
  for (const word of ALL_PAYLOAD_WORDS) {
    const matches = facts.dictionary.words.filter((candidate) => candidate.displayWord.toLocaleLowerCase("en-GB") === word);
    if (matches.length !== 1) throw new Error(`D4_MOR un- pilot requires exactly one canonical dictionary row for ${word}; found ${matches.length}`);
    ids[word] = matches[0].canonicalWordId;
  }
  const payload = compileMorphologyUnPilotPayload(ids);
  const existingByWord = new Map(facts.learningItems.filter((item) => item.microSkillKey === MORPHOLOGY_UN_MICRO_SKILL && item.rowStatus === "active").map((item) => [item.canonicalWordId, item]));
  const preexistingLearningItemIds = new Set(existingByWord.keys());
  const intakes: LearningItemFact[] = [];
  const itemFor = (word: string): LearningItemFact => {
    const existing = existingByWord.get(ids[word]);
    if (existing) return existing;
    const intake = learningItemFromStretchSelection({ childId: facts.childId, canonicalWordId: ids[word], microSkillKey: MORPHOLOGY_UN_MICRO_SKILL, stretchSourceRef: `pilot:d4-mor-un:${facts.childId}:${planDate}:${word}`, selectedOn: planDate });
    intakes.push(intake); existingByWord.set(ids[word], intake); return intake;
  };
  const lessonItems = LESSON_WORDS.map((word) => itemFor(word));
  let position = 0;
  const candidate = (input: Omit<PlanItemCandidate, "position" | "microSkillKey" | "expectedEvidenceKind" | "provenance"> & { evidence: string | null; provenance?: string }): PlanItemCandidate => ({ position: ++position, microSkillKey: MORPHOLOGY_UN_MICRO_SKILL, expectedEvidenceKind: input.evidence, provenance: input.provenance ?? "d4_mor_un_pilot", sectionKey: input.sectionKey, templateKey: input.templateKey, canonicalWordId: input.canonicalWordId, targetWord: input.targetWord, learningItemId: input.learningItemId, payload: input.payload });
  const sections: PlanSection[] = [
    { sectionKey: "lesson_intro", purpose: "Versioned morphology Word Lab root", items: [
      candidate({ sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { pilotActivityId: "intro-root", morphologyLesson: payload }, evidence: "read_only" }),
      candidate({ sectionKey: "lesson_intro", templateKey: "LESSON_WORDS_INTRO", canonicalWordId: null, targetWord: null, learningItemId: null, payload: { pilotActivityId: "intro-words", words: payload.words.lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, targetWord: word.displayWord })) }, evidence: "read_only" }),
    ] },
    { sectionKey: "guided_practice", purpose: "Morphology guided interactions", items: [
      candidate({ sectionKey: "guided_practice", templateKey: "MOR_STRIP_BUILD", canonicalWordId: ids.unhappy, targetWord: "unhappy", learningItemId: null, payload: { pilotActivityId: "guided-strip-unhappy" }, evidence: "guided_task" }),
      ...LESSON_WORDS.map((word, index) => candidate({ sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", canonicalWordId: ids[word], targetWord: word, learningItemId: lessonItems[index].learningItemId, payload: { pilotActivityId: `guided-meaning-${word}` }, evidence: "guided_task" })),
      candidate({ sectionKey: "guided_practice", templateKey: "MOR_BUILD_WORD", canonicalWordId: ids.untidy, targetWord: "untidy", learningItemId: itemFor("untidy").learningItemId, payload: { pilotActivityId: "guided-build-untidy" }, evidence: "guided_task" }),
    ] },
    { sectionKey: "lesson_production", purpose: "Look-cover-write-check production", items: LESSON_WORDS.map((word, index) => candidate({ sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING", canonicalWordId: ids[word], targetWord: word, learningItemId: lessonItems[index].learningItemId, payload: { pilotActivityId: `controlled-${word}` }, evidence: "controlled_spelling" })) },
    { sectionKey: "lesson_dictation", purpose: "Full-sentence dictation with word-level evidence", items: LESSON_WORDS.map((word, index) => candidate({ sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE", canonicalWordId: ids[word], targetWord: word, learningItemId: lessonItems[index].learningItemId, payload: { pilotActivityId: `dictation-${word}`, sentence: payload.activities.find((activity) => activity.type === "sentence_dictation")?.sentences?.[index]?.sentence }, evidence: "dictation" })) },
  ];
  return {
    ...basePlan,
    partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
    partTwo: {
      composed: true,
      microSkillKey: MORPHOLOGY_UN_MICRO_SKILL,
      selectionAudit: [],
      lessonWords: LESSON_WORDS.map((word, index) => ({ canonicalWordId: ids[word], provenance: preexistingLearningItemIds.has(ids[word]) ? "learning_item" as const : "stretch" as const, learningItemId: lessonItems[index].learningItemId, complexityLevel: null })),
      probePlan: null,
      stretchItemIntakes: intakes,
      sections,
      skips: [],
    },
    budget: { ...basePlan.budget, estimatedResponses: sections.flatMap((section) => section.items).length, guidedWordCount: 4, introTrimmed: false, trims: [] },
  };
}
