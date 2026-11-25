import type { BaseWordFamilySnapshotWord } from "@/lib/adle/morphology/base-word-family-payload";
import { deterministicOrderedBuildOrder } from "@/components/adle/activities/shared/ordered-build-engine";

type Part = { id: string; sourceText: string; surfaceText: string; gloss?: string; kind?: string };
export function parts(word: BaseWordFamilySnapshotWord): Part[] { return word.parts.filter((part): part is Part => !!part && typeof part === "object" && typeof (part as Part).id === "string" && typeof (part as Part).sourceText === "string" && typeof (part as Part).surfaceText === "string"); }

export function baseWordDefinitionBuild(words: BaseWordFamilySnapshotWord[], index: number) {
  const word = words[index];
  const allParts = [...new Map(words.flatMap(parts).map((part) => [part.surfaceText, part])).values()];
  const expectedParts = parts(word);
  const distractors = allParts.filter((part) => !expectedParts.some((expected) => expected.surfaceText === part.surfaceText)).slice(0, 3);
  const toTile = (id: string, part: Part) => ({ id, text: part.surfaceText, role: part.kind === "prefix" ? "prefix" as const : part.kind === "suffix" ? "suffix" as const : "base" as const, gloss: part.gloss });
  const expectedIds = expectedParts.map((part) => `${word.canonicalWordId}:required:${part.id}`);
  const sourceTiles = [...expectedParts.map((part) => toTile(`${word.canonicalWordId}:required:${part.id}`, part)), ...distractors.map((part) => toTile(`${word.canonicalWordId}:distractor:${encodeURIComponent(part.surfaceText)}`, part))];
  const tiles = deterministicOrderedBuildOrder(sourceTiles, `${word.canonicalWordId}:definition-word-builder`);
  if (expectedIds.every((id, expectedIndex) => tiles[expectedIndex]?.id === id)) {
    const first = tiles.shift();
    if (first) tiles.push(first);
  }
  const governedJoins: Array<"none" | "space" | "hyphen"> = word.joins.flatMap((join) => {
    if (!join || typeof join !== "object" || Array.isArray(join)) return [];
    const joinType = (join as { joinType?: unknown }).joinType;
    return joinType === "none" || joinType === "space" || joinType === "hyphen" ? [joinType] : [];
  });
  return {
    targetId: word.canonicalWordId,
    stepLabel: `Build ${index + 1} of ${words.length}`,
    definition: word.childFriendlyMeaning,
    tiles,
    expectedIds,
    joins: governedJoins.length ? governedJoins : undefined,
    label: `Build ${word.displayWord} from word parts`,
    wordSum: word.wordSum,
    resultingMeaning: word.childFriendlyMeaning,
    continueLabel: index + 1 < words.length ? "Build the next word" : "Practise six words",
  };
}

