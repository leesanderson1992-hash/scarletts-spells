import assert from "node:assert/strict";
import { weakVowelPreviewLesson } from "../lib/adle/weak-vowel/preview-fixture";
import { initialWeakVowelProgress } from "../lib/adle/weak-vowel/progress";
import { weakVowelAttemptEvents, weakVowelCompletionFacts } from "../lib/adle/weak-vowel/completion";
import type { CompiledWeakVowelSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-contracts";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";

const lesson = weakVowelPreviewLesson("D4_SCHWA_FINAL_AR_FINAL", 1);
const ids = lesson.words.map((word) => word.canonicalWordId);
const responses = { guided: true, words: ids.map((canonicalWordId) => ({ canonicalWordId })) };
const progress = { ...initialWeakVowelProgress(lesson), stageId: "reflection" as const,
  dinnerResponse: responses, detectiveResponse: responses,
  coverAttempts: Object.fromEntries(lesson.words.map((word) => [word.canonicalWordId, word.spelling])),
  dictationAttempts: Object.fromEntries(lesson.words.map((word) => [word.canonicalWordId, word.dictation.sentence])),
  dictationChecked: ids, reflection: "I checked the quiet vowel.", finished: true };
const first = lesson.words[0], second = lesson.words[1];
progress.coverAttempts[first.canonicalWordId] = `${first.spelling}x`;
progress.dictationAttempts[second.canonicalWordId] = second.dictation.sentence.replace(second.spelling, `${second.spelling}x`);
const snapshot = { payload: { resolvedLesson: lesson } } as CompiledWeakVowelSpecialistSnapshotV3;
const facts = weakVowelCompletionFacts(snapshot, progress);
assert.equal(facts.producedWords.length, lesson.words.length);
assert.equal(facts.producedWords.find((word) => word.canonicalWordId === first.canonicalWordId)?.correct, false);
assert.equal(facts.producedWords.find((word) => word.canonicalWordId === second.canonicalWordId)?.correct, false);
assert.equal(facts.producedWords.filter((word) => word.correct).length, lesson.words.length - 2);

const items = [
  { id: "intro", sectionKey: "lesson_intro", canonicalWordId: null, targetWord: null },
  ...lesson.words.flatMap((word) => (["dinner", "detective", "memory", "dictation"] as const).map((activity) => ({
    id: `${activity}:${word.canonicalWordId}`,
    sectionKey: activity === "memory" ? "lesson_production" : activity === "dictation" ? "lesson_dictation" : "guided_practice",
    canonicalWordId: word.canonicalWordId, targetWord: word.spelling,
  }))),
].map((item) => ({ ...item, microSkillKey: lesson.microSkillKey, templateKey: "test", promptData: {} })) as AdleSessionItem[];
const events = weakVowelAttemptEvents({ snapshot, progress, items, childId: "child", parentUserId: "parent",
  assignmentId: "assignment", planDate: "2026-10-21" });
assert.equal(events.length, 1 + lesson.words.length * 4);
assert(events.filter((event) => event.sectionKey === "guided_practice").every((event) =>
  event.evidenceClass === "guided_practice_attempt" && event.isCorrect === null));
assert.equal(events.find((event) => event.assignmentItemId === `dictation:${second.canonicalWordId}`)?.attemptText,
  progress.dictationAttempts[second.canonicalWordId], "the original whole sentence remains auditable");
assert.equal(events.find((event) => event.assignmentItemId === `dictation:${second.canonicalWordId}`)?.isCorrect, false);
assert.equal(events.find((event) => event.assignmentItemId === `memory:${first.canonicalWordId}`)?.isCorrect, false);
console.log("PASS: guided work never becomes spelling success; first hidden word and original sentence remain distinct");
