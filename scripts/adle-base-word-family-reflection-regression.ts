import { readFileSync } from "node:fs";

import { lessonReflectionSentenceComparison } from "../lib/adle/lesson-reflection";
import { isAttemptCorrect } from "../lib/adle/session-correctness";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const lesson = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const action = readFileSync("app/learn/week/adle/actions.ts", "utf8");

assert(lesson.includes("extractAuthoredTargetToken") && lesson.includes("isAttemptCorrect"), "reflection outcomes use the authoritative target-token and correctness helpers");
assert(lesson.includes("baseWordLessonReflectionModel") && lesson.includes("<LessonReflection"), "Base Word normalizes target-token misses and sentence feedback into the canonical LessonReflection");
assert(lesson.includes("correctSpelling: word.displayWord") && lesson.includes("attempt,"), "Base Word exposes attempted-versus-correct spelling without changing correctness");
assert(lesson.includes("lessonReflectionSentenceComparison") && lesson.includes("sentenceComparisons={reflectionModel.sentenceComparisons}"), "Base Word shows whole-sentence capitalization/punctuation feedback independently of spelling correctness");
assert(!lesson.includes("function Reflection("), "the route-local Base Word Reflection presentation is removed");
assert(action.includes("extractAuthoredTargetToken(rawSentence, word.dictationTargetTokenIndex)"), "completion and reflection share authored target-token semantics");

const governed = { displayWord: "replayed", dictationSentence: "We replayed the song after lunch.", dictationTargetTokenIndex: 1 };
for (const [id, attempted] of [
  ["capital", `${governed.dictationSentence.charAt(0).toLowerCase()}${governed.dictationSentence.slice(1)}`],
  ["punctuation", governed.dictationSentence.replace(/[.!?]+$/u, "")],
] as const) {
  const targetAttempt = attempted.split(/\s+/u)[governed.dictationTargetTokenIndex] ?? "";
  assert(isAttemptCorrect(targetAttempt, governed.displayWord), `${id}: Base Word target evidence remains correct`);
  assert(lessonReflectionSentenceComparison({ id, attempt: attempted, correct: governed.dictationSentence }), `${id}: Base Word Reflection retains sentence feedback`);
}

console.log("adle-base-word-family-reflection-regression: ok");
