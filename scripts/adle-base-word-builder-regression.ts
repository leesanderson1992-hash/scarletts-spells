import { readFileSync } from "node:fs";

const source = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  source.includes('<WordBuilder key={guidedWords[state.buildIndex]?.canonicalWordId}'),
  "each guided word must remount the builder so placed and completed state cannot leak into the next word",
);

console.log("adle-base-word-builder-regression: ok");
