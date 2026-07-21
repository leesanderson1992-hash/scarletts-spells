import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const lesson = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const action = readFileSync("app/learn/week/adle/actions.ts", "utf8");

assert(lesson.includes("extractAuthoredTargetToken") && lesson.includes("isAttemptCorrect"), "reflection outcomes use the authoritative target-token and correctness helpers");
assert(lesson.includes("Words you spelled securely") && lesson.includes("Words to look at again"), "reflection distinguishes secure words from words needing attention");
assert(!lesson.includes("attemptText}"), "reflection never renders raw attempt text");
assert(action.includes("extractAuthoredTargetToken(rawSentence, word.dictationTargetTokenIndex)"), "completion and reflection share authored target-token semantics");

console.log("adle-base-word-family-reflection-regression: ok");
