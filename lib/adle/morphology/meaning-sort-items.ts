import type { MorphologyLessonPayloadV1 } from "./payload";

export interface MorphologyMeaningSortItemV1 {
  id: string;
  text: string;
  destination: string;
}

/**
 * Prefix Form Sort presents the reviewed base, not the already-prefixed answer.
 * Meaning Sort keeps the historical derived-word/effect projection unchanged.
 */
export function morphologyMeaningSortItems(
  payload: MorphologyLessonPayloadV1,
  kind: "meaning" | "prefix_form",
): MorphologyMeaningSortItemV1[] {
  return payload.words.lesson.map((word) => {
    if (kind !== "prefix_form") {
      return { id: word.displayWord, text: word.displayWord, destination: word.effect };
    }
    const baseWord = word.baseWord?.trim();
    const prefixText = word.prefixText?.trim();
    if (!baseWord || !prefixText) {
      throw new Error("Prefix Form Sort requires a reviewed base word and prefix form.");
    }
    return { id: word.displayWord, text: baseWord, destination: prefixText };
  });
}
