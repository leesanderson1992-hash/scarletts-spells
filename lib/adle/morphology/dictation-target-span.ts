import { tokeniseSentence } from "./payload";

export const DICTATION_TARGET_SPAN_SCHEMA_VERSION = 2 as const;

/** Shared, route-neutral target contract. End is exclusive. */
export type DictationTargetSpanV2 = {
  schemaVersion: typeof DICTATION_TARGET_SPAN_SCHEMA_VERSION;
  startTokenIndex: number;
  endTokenIndexExclusive: number;
  exactAnswer: string;
};

export function extractAuthoredTargetSpan(
  sentence: string,
  span: Pick<DictationTargetSpanV2, "startTokenIndex" | "endTokenIndexExclusive">,
): string {
  if (
    !Number.isInteger(span.startTokenIndex) ||
    !Number.isInteger(span.endTokenIndexExclusive) ||
    span.startTokenIndex < 0 ||
    span.endTokenIndexExclusive <= span.startTokenIndex
  ) {
    return "";
  }
  return tokeniseSentence(sentence)
    .slice(span.startTokenIndex, span.endTokenIndexExclusive)
    .join(" ");
}

export function validateDictationTargetSpanV2(
  sentence: string,
  value: unknown,
): value is DictationTargetSpanV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const span = value as Partial<DictationTargetSpanV2>;
  if (
    span.schemaVersion !== DICTATION_TARGET_SPAN_SCHEMA_VERSION ||
    !Number.isInteger(span.startTokenIndex) ||
    !Number.isInteger(span.endTokenIndexExclusive) ||
    Number(span.startTokenIndex) < 0 ||
    Number(span.endTokenIndexExclusive) <= Number(span.startTokenIndex) ||
    typeof span.exactAnswer !== "string" ||
    !span.exactAnswer.trim()
  ) {
    return false;
  }
  return extractAuthoredTargetSpan(sentence, {
    startTokenIndex: Number(span.startTokenIndex),
    endTokenIndexExclusive: Number(span.endTokenIndexExclusive),
  }) === span.exactAnswer.toLocaleLowerCase("en-GB");
}

/** Compatibility adapter for every existing single-token dictation payload. */
export function dictationTargetSpanFromToken(
  sentence: string,
  targetTokenIndex: number,
): DictationTargetSpanV2 | null {
  const exactAnswer = extractAuthoredTargetSpan(sentence, {
    startTokenIndex: targetTokenIndex,
    endTokenIndexExclusive: targetTokenIndex + 1,
  });
  if (!exactAnswer) return null;
  return {
    schemaVersion: DICTATION_TARGET_SPAN_SCHEMA_VERSION,
    startTokenIndex: targetTokenIndex,
    endTokenIndexExclusive: targetTokenIndex + 1,
    exactAnswer,
  };
}
