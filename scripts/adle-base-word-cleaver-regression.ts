import { existsSync, readFileSync } from "node:fs";

const split = readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8");
const adapter = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(!existsSync("components/adle/activities/shared/base-word-cleaver.tsx"), "the independent BaseWordCleaver must be retired");
assert(split.includes("selectedBoundaries") && split.includes("isolatedComponentIndex"), "canonical Split must support controlled Base Word restoration and governed isolation");
assert(adapter.includes("requiredBoundaries") && adapter.includes("<SplitHandle"), "Base Word must derive adjacent governed cuts for the canonical Split engine");
assert(!adapter.includes("What word remains?") && !adapter.includes("remainingWord"), "the redundant typed base confirmation must stay retired");
assert(split.includes('event.key !== "Enter"') && split.includes('event.key !== " "'), "canonical Split must support keyboard activation for every route");

console.log("adle-base-word-cleaver-regression: canonical Split adapter ok");
