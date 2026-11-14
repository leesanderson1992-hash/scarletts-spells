import assert from "node:assert/strict";
import { evaluateLessonCandidate, IDENTIFY_BASE_SKILL } from "../lib/teaching-dictionary-manager/lesson-candidate";

const input = {
  wordId: "kind", displayWord: "kind", skillKey: IDENTIFY_BASE_SKILL, senseId: "kind-adjective",
  senseSet: {
    senses: [{ id: "kind-adjective", definition: "Caring and helpful.", partOfSpeech: "adjective",
      pronunciationId: "standard", dictationSentence: "Be kind today.", dictationTargetTokenIndex: 1 }],
    pronunciations: [{ id: "standard", ipa: "/kaɪnd/", spokenSyllableCount: 1, stressPattern: "primary" }],
  },
  morphology: { analysisStatus: "approved", reviewStatus: "approved_for_first_exposure", wordSum: "kind → kind",
    parts: [{ id: "base", kind: "base", sourceText: "kind", surfaceText: "kind", gloss: "Caring and helpful.",
      displayRange: { start: 0, end: 4 } }], joins: [] },
  familyLinks: [{ sense_id: "kind-adjective", family_key: "kind", component_part_id: "base", relationship_kind: "free_base" }],
};
assert.equal(evaluateLessonCandidate(input).status, "ready");
assert.equal(evaluateLessonCandidate({ ...input, familyLinks: [] }).issues[0]?.code, "FAMILY_LINK");
assert.equal(evaluateLessonCandidate({ ...input, morphology: null }).issues[0]?.code, "REVIEWED_PARTS");
const sense = { ...input.senseSet.senses[0], dictationSentence: undefined };
assert.equal(evaluateLessonCandidate({ ...input, senseSet: { ...input.senseSet, senses: [sense] } }).issues[0]?.code, "DICTATION");
console.log("Identify the Base requires current parts, family and dictation.");
