export const LESSON_REFLECTION_MAX_RESPONSE_LENGTH = 2000;

export interface NormalizedLessonReflectionMistake {
  /** Stable route-owned identity; never inferred from display copy. */
  id: string;
  attempt: string;
  correctSpelling: string;
  /** Optional whole-sentence comparison retained by routes that already show it. */
  sentenceComparison?: {
    attempt: string;
    correct: string;
  };
}

/** Presentation-only sentence feedback. It must never be used to derive spelling evidence. */
export interface NormalizedLessonReflectionSentenceComparison {
  id: string;
  attempt: string;
  correct: string;
}

export function lessonReflectionSentenceComparison(
  comparison: NormalizedLessonReflectionSentenceComparison,
): NormalizedLessonReflectionSentenceComparison | null {
  return comparison.attempt.trim() === comparison.correct.trim() ? null : comparison;
}

export interface LessonReflectionContextRecap {
  heading: string;
  introduction?: string;
  items: readonly { id: string; text: string }[];
  overflowText?: string;
}

export type LessonReflectionPromptSubject =
  | { kind: "prefix"; values: readonly string[] }
  | { kind: "suffix"; values: readonly string[] }
  | { kind: "base_word"; values: readonly string[] }
  | { kind: "compound" };

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function formatGovernedLessonValues(values: readonly string[]): string {
  const governed = uniqueNonEmpty(values);
  if (governed.length === 0) return "the lesson pattern";
  if (governed.length === 1) return governed[0];
  if (governed.length === 2) return `${governed[0]} and ${governed[1]}`;
  return `${governed.slice(0, -1).join(", ")}, and ${governed.at(-1)}`;
}

export function lessonReflectionPrompt(subject: LessonReflectionPromptSubject): string {
  if (subject.kind === "compound") {
    return "What did you learn about spelling compound words?";
  }
  const values = uniqueNonEmpty(subject.values);
  const governed = formatGovernedLessonValues(values);
  if (subject.kind === "base_word") {
    return `What did you learn about spelling with the base ${values.length === 1 ? "word" : "words"} ${governed}?`;
  }
  return `What did you learn about spelling with the ${subject.kind}${values.length === 1 ? "" : "es"} ${governed}?`;
}

export function governedAffixForms(
  values: readonly string[],
  position: "before" | "after",
): string[] {
  return uniqueNonEmpty(uniqueNonEmpty(values).map((value) => {
    const bare = value.replace(/^-|-$/g, "");
    return position === "before" ? `${bare}-` : `-${bare}`;
  }));
}
