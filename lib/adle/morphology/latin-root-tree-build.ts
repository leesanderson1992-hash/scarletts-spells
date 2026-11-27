import type { LatinRootLessonFamily } from "./latin-root-lesson";
import type { OrderedBuildTarget } from "@/components/adle/activities/shared/ordered-build-engine";

export function latinRootTreeBuildModel(family: LatinRootLessonFamily) {
  const pieces = family.words.flatMap(word => word.parts.flatMap((part, index) => part.role === "root" ? [] : [{ ...part, id: `${word.id}:${index}` }]));
  const targets: OrderedBuildTarget[] = family.words.map(word => {
    const parts = word.parts.filter(part => part.role !== "root");
    return {
      id: word.id,
      expectedPieceIds: word.parts.flatMap((part, index) => part.role === "root" ? [] : [`${word.id}:${index}`]),
      // Identical copies from the bank are interchangeable, including after resume.
      acceptedPieceIdsBySlot: parts.map(part => pieces.filter(piece => piece.text === part.text && piece.role === part.role && piece.meaning === part.meaning).map(piece => piece.id)),
    };
  });
  return { pieces, targets };
}
