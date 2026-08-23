import type { MorphologyLessonPayloadV1 } from "./payload";

export type ResolvedMorphologyTeachingPages = {
  pages: Array<{
    id: string;
    type: "teaching";
    eyebrow: "Learn";
    title: string;
    paragraphs: string[];
    callout?: string;
    model?: { first: string; second: string; result: string };
    examples: Array<{ text: string; explanation: string }>;
  }>;
  meetWords: {
    words: Array<{ id: string; word: string; wordParts: string[]; detail: string }>;
  };
};

/** Pure authority shared by the morphology runtime UI and snapshot compilers. */
export function resolveMorphologyTeachingPages(
  payload: MorphologyLessonPayloadV1,
): ResolvedMorphologyTeachingPages {
  const screens = (payload.activities.find((activity) => activity.type === "introduction")?.introScreens ?? [])
    .filter((screen) => !["words", "review-words", "ready"].includes(screen.id));
  return {
    pages: screens.map((screen) => ({
      id: screen.id,
      type: "teaching" as const,
      eyebrow: "Learn" as const,
      title: screen.title,
      paragraphs: screen.paragraphs,
      ...(screen.meaningCallout ? { callout: screen.meaningCallout } : {}),
      ...(screen.model ? { model: { first: screen.model.prefix, second: screen.model.base, result: screen.model.result } } : {}),
      examples: [
        ...(screen.wordCards ?? []).map((card) => ({ text: `${card.base} → ${card.derived}`, explanation: card.meaning })),
        ...(screen.examples ?? []).map((example) => ({ text: `${example.prefix} + ${example.base} → ${example.word}`, explanation: example.meaning })),
        ...(screen.teachingCards ?? []).map((card) => ({ text: `${card.text}: ${card.label}`, explanation: `${card.meaning}. ${card.rules.join(" ")}` })),
      ],
    })),
    meetWords: {
      words: payload.words.lesson.map((word) => ({
        id: word.canonicalWordId,
        word: word.displayWord,
        wordParts: word.parts.map((part) => part.text),
        detail: word.derivedMeaning,
      })),
    },
  };
}
