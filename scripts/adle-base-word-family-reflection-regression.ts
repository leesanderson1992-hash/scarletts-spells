import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const lesson = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const action = readFileSync("app/learn/week/adle/actions.ts", "utf8");

assert(lesson.includes("extractAuthoredTargetToken") && lesson.includes("isAttemptCorrect"), "reflection outcomes use the authoritative target-token and correctness helpers");
assert(lesson.includes("baseWordLessonReflectionMistakes") && lesson.includes("<LessonReflection"), "Base Word normalizes target-token misses into the canonical LessonReflection");
assert(lesson.includes("correctSpelling: word.displayWord") && lesson.includes("attempt,"), "Base Word exposes attempted-versus-correct spelling without changing correctness");
assert(!lesson.includes("function Reflection("), "the route-local Base Word Reflection presentation is removed");
assert(action.includes("extractAuthoredTargetToken(rawSentence, word.dictationTargetTokenIndex)"), "completion and reflection share authored target-token semantics");

console.log("adle-base-word-family-reflection-regression: ok");
