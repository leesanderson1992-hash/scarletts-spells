export type AdleAttributedTargetOccurrence = {
  encounterId: string;
  canonicalSpelling: string;
  originalOutcomeSource: "writing" | "audio_retrieval_check";
  originalObservedSpelling: string | null;
  positionStart: number | null;
  positionEnd: number | null;
};

export type AdditionalSpellingOccurrenceDecision =
  | { status: "allowed" }
  | {
      status: "already_captured";
      encounterId: string;
      reason: "overlapping_target_occurrence" | "target_pair_without_distinct_occurrence";
    };

export type AdleWritingOccurrence = {
  start: number;
  end: number;
  context: string;
};

export function findAdleWritingOccurrences(
  text: string,
  observedSpelling: string,
): AdleWritingOccurrence[] {
  const needle = observedSpelling.trim();
  if (!needle) return [];

  const lowerText = text.toLocaleLowerCase("en-GB");
  const lowerNeedle = needle.toLocaleLowerCase("en-GB");
  const matches: AdleWritingOccurrence[] = [];
  let cursor = 0;

  while (cursor <= lowerText.length - lowerNeedle.length) {
    const start = lowerText.indexOf(lowerNeedle, cursor);
    if (start < 0) break;
    const end = start + lowerNeedle.length;
    matches.push({
      start,
      end,
      context: text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28)),
    });
    cursor = end;
  }

  return matches;
}

export function normalizeObservedSpelling(value: string) {
  return value.trim().toLocaleLowerCase("en-GB");
}

export function rangesOverlap(input: {
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
}) {
  return input.leftStart < input.rightEnd && input.rightStart < input.leftEnd;
}

export function classifyAdditionalSpellingOccurrence(input: {
  positionStart: number;
  positionEnd: number;
  observedSpelling: string;
  correctSpelling: string;
  targets: readonly AdleAttributedTargetOccurrence[];
}): AdditionalSpellingOccurrenceDecision {
  const observed = normalizeObservedSpelling(input.observedSpelling);
  const correct = normalizeObservedSpelling(input.correctSpelling);

  for (const target of input.targets) {
    if (normalizeObservedSpelling(target.canonicalSpelling) !== correct) continue;
    if (target.originalOutcomeSource === "audio_retrieval_check") continue;

    const targetObserved = target.originalObservedSpelling
      ? normalizeObservedSpelling(target.originalObservedSpelling)
      : null;
    if (targetObserved && targetObserved !== observed) continue;

    if (target.positionStart === null || target.positionEnd === null) {
      return {
        status: "already_captured",
        encounterId: target.encounterId,
        reason: "target_pair_without_distinct_occurrence",
      };
    }

    if (
      rangesOverlap({
        leftStart: input.positionStart,
        leftEnd: input.positionEnd,
        rightStart: target.positionStart,
        rightEnd: target.positionEnd,
      })
    ) {
      return {
        status: "already_captured",
        encounterId: target.encounterId,
        reason: "overlapping_target_occurrence",
      };
    }
  }

  return { status: "allowed" };
}

export function readAttributedOccurrence(input: {
  attributionProvenance: Record<string, unknown> | null;
  canonicalSpelling: string;
  encounterId: string;
  originalOutcomeSource: "writing" | "audio_retrieval_check";
}): AdleAttributedTargetOccurrence {
  const provenance = input.attributionProvenance ?? {};
  const positionStart = [
    provenance.confirmedSpanStart,
    provenance.matchedSpanStart,
    provenance.positionStart,
  ].find((value) => Number.isInteger(value));
  const positionEnd = [
    provenance.confirmedSpanEnd,
    provenance.matchedSpanEnd,
    provenance.positionEnd,
  ].find((value) => Number.isInteger(value));
  const observed = [
    provenance.observedText,
    provenance.matchedText,
    provenance.childSpelling,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  return {
    encounterId: input.encounterId,
    canonicalSpelling: input.canonicalSpelling,
    originalOutcomeSource: input.originalOutcomeSource,
    originalObservedSpelling: typeof observed === "string" ? observed : null,
    positionStart: typeof positionStart === "number" ? positionStart : null,
    positionEnd: typeof positionEnd === "number" ? positionEnd : null,
  };
}

export function buildAdleParentIssueSourceEntityId(input: {
  reviewSessionId: string;
  positionStart: number;
  positionEnd: number;
  observedSpelling: string;
  correctSpelling: string;
}) {
  return [
    "adle_review_submitted_writing_parent_identified",
    input.reviewSessionId,
    `${input.positionStart}-${input.positionEnd}`,
    normalizeObservedSpelling(input.observedSpelling),
    normalizeObservedSpelling(input.correctSpelling),
  ].join(":");
}
