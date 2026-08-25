export const REVIEW_GRAPHEME_SEGMENTER_VERSION = "intl_segmenter_grapheme_v1" as const;

export interface ReviewGrapheme {
  index: number;
  text: string;
  codeUnitStart: number;
  codeUnitEnd: number;
}

export interface ReviewGraphemeSpan {
  graphemeStart: number;
  graphemeEnd: number;
  selectedText: string;
}

export function segmentReviewGraphemes(value: string): ReviewGrapheme[] {
  const normalized = value.normalize("NFC");
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(normalized));
  return segments.map((segment, index) => ({
    index,
    text: segment.segment,
    codeUnitStart: segment.index,
    codeUnitEnd: segments[index + 1]?.index ?? normalized.length,
  }));
}

export function validateReviewGraphemeSpan(
  frozenSpelling: string,
  graphemeStart: number,
  graphemeEnd: number,
  selectedText?: string,
): ReviewGraphemeSpan | null {
  if (!Number.isInteger(graphemeStart) || !Number.isInteger(graphemeEnd) ||
    graphemeStart < 0 || graphemeEnd <= graphemeStart) return null;
  const graphemes = segmentReviewGraphemes(frozenSpelling);
  if (graphemeEnd > graphemes.length) return null;
  const text = graphemes.slice(graphemeStart, graphemeEnd).map((grapheme) => grapheme.text).join("");
  if (selectedText !== undefined && selectedText.normalize("NFC") !== text) return null;
  return { graphemeStart, graphemeEnd, selectedText: text };
}
