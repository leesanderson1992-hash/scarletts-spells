import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

const lesson = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");
const shutter = readFileSync("components/adle/activities/shared/cover-shutter.tsx", "utf8");
const reveal = readFileSync("components/adle/activities/shared/diff-reveal.tsx", "utf8");

assert(lesson.includes("splitPoints={[]}"), "base-word recall explicitly uses the no-split path");
assert(shutter.includes("splitPoints.length === 0") && shutter.includes("displayWord"), "no-split recall renders a single target word");
assert(reveal.includes("The correct sentence") && reveal.includes("alignSentenceTokens"), "dictation feedback visibly supplies the correct sentence using token alignment");
assert(!reveal.includes("attemptedTokens[index]"), "sentence feedback does not compare raw character positions");

console.log("adle-base-word-stage3-feedback-regression: ok");
