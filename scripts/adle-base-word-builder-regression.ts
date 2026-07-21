import { readFileSync } from "node:fs";

const source = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  source.includes('<WordBuilder key={guidedWords[state.buildIndex]?.canonicalWordId}'),
  "each guided word must remount the builder so placed and completed state cannot leak into the next word",
);
assert(source.includes('const expectedIds = expectedParts.map((part) => `${word.canonicalWordId}:required:${part.id}`);'), "required builder tiles must use stable reviewed-part IDs");
assert(source.includes('while (tiles[0]?.id === expectedIds[0] || expectedIds.every((id, index) => tiles[index]?.id === id))'), "tile bank must avoid placing the answer first or in answer order");

console.log("adle-base-word-builder-regression: ok");
