import { validateBaseWordFamilyLessonSnapshot } from "../lib/adle/morphology/base-word-family-payload";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function word(id: string) { return { canonicalWordId: id, displayWord: id, wordSum: id, parts: [], joins: [], transformationNotes: "reviewed", dictationSentence: `Please spell ${id}.`, dictationTargetTokenIndex: 2, audioText: `Please spell ${id}.` }; }
const replayed = word("replayed"); const government = word("government"); const replay = word("replay"); const governor = word("governor"); const playing = word("playing");
const valid = {
  schemaVersion: 1, experience: "D4_MOR_BASE_WORD_FAMILY", microSkillKey: "D4_MOR_BASE_WORDS_PRESERVE_BASE", contentVersion: "two-family-pilot-v1",
  authenticTargets: [{ canonicalWordId: "replayed", learningItemId: "a", sourceRef: "a" }, { canonicalWordId: "government", learningItemId: "b", sourceRef: "b" }],
  familySections: [
    { baseFamilyKey: "PLAY", baseWord: word("play"), baseMeaning: "have fun", etymologyRoute: { relation_type: "free_base" }, authenticTargetWordIds: ["replayed"], guidedWords: [word("play"), replayed, replay, playing] },
    { baseFamilyKey: "GOVERN", baseWord: word("govern"), baseMeaning: "rule", etymologyRoute: { relation_type: "etymological_root" }, authenticTargetWordIds: ["government"], guidedWords: [word("govern"), government, governor] },
  ],
  independentWords: [replayed, government, replay, governor, playing],
  measurement: { pilotLessonNumber: 1, maxPilotLessons: 5, guidedWordLimit: 8, independentWordLimit: 5 },
};
assert(validateBaseWordFamilyLessonSnapshot(valid) !== null, "two-family snapshot with eight-or-fewer guided words and five independent words must validate");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: valid.independentWords.slice(0, 4) }) === null, "independent practice must remain exactly five words");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, independentWords: [...valid.independentWords.slice(0, 4), word("graph")] }) === null, "a third-family word cannot fill independent production");
assert(validateBaseWordFamilyLessonSnapshot({ ...valid, familySections: [{ ...valid.familySections[0], guidedWords: Array.from({ length: 9 }, (_, index) => word(`x${index}`)) }] }) === null, "guided display must cap at eight words and retain authentic targets");
console.log("adle-base-word-family-snapshot-regression: ok");
