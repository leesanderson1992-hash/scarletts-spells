import type { ClosedCompoundLessonPayloadV1 } from "./closed-compound-word-lab";

export interface GeneralizedJigsawTarget {
  canonicalWordId: string;
  word: string;
  components: readonly string[];
  joins: readonly "none"[];
}

/**
 * Historical closed-compound snapshots store firstWord/secondWord rather than
 * governed component arrays. Replay normalises that data at the payload
 * boundary; the learner renderer only receives the current generalized shape.
 */
export function adaptClosedCompoundJigsawTargets(
  payload: ClosedCompoundLessonPayloadV1,
): GeneralizedJigsawTarget[] {
  return payload.words.lesson.map((word) => ({
    canonicalWordId: word.canonicalWordId,
    word: word.displayWord,
    components: [word.firstWord, word.secondWord],
    joins: ["none"],
  }));
}
