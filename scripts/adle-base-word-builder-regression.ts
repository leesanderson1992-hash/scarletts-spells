import { readFileSync } from "node:fs";

const source = readFileSync("components/adle/morphology/base-word-family-guided-lesson.tsx", "utf8");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  source.includes('<DefinitionWordBuilder key={definitionBuild.targetId}'),
  "each guided word must remount the builder so placed and completed state cannot leak into the next word",
);
assert(source.includes('const expectedIds = expectedParts.map((part) => `${word.canonicalWordId}:required:${part.id}`);'), "required builder tiles must use stable reviewed-part IDs");
assert(source.includes('deterministicOrderedBuildOrder(sourceTiles, `${word.canonicalWordId}:definition-word-builder`)'), "tile bank order must be deterministic for each governed word");
assert(source.includes('if (expectedIds.every((id, expectedIndex) => tiles[expectedIndex]?.id === id))'), "tile bank must avoid presenting the complete answer order");
assert(!source.includes("function WordBuilder"), "Base Word must not retain a route-local builder state machine");

console.log("adle-base-word-builder-regression: ok");
