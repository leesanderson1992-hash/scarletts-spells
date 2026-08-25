import type { ReviewTargetSnapshotV3 } from "./contracts";

export const REVIEW_EXACT_MATCHER_VERSION =
  "governed_exact_tokens_v1_unicode_nfc" as const;

const APOSTROPHE_PATTERN = /[\u2018\u2019\u02bc]/gu;
const HYPHEN_PATTERN = /[\u2010\u2011]/gu;
const TOKEN_PATTERN = /[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*/gu;

export interface ReviewWritingToken {
  surface: string;
  normalized: string;
  index: number;
  separatorBefore: string;
  startOffset: number;
  endOffset: number;
}

export interface ReviewExactTargetMatch {
  encounterId: string;
  targetOrder: number;
  tokenStart: number;
  tokenEndExclusive: number;
  matchedText: string;
  startOffset: number;
  endOffset: number;
}

export function normalizeReviewSpellingText(value: string): string {
  return value
    .normalize("NFC")
    .replace(APOSTROPHE_PATTERN, "'")
    .replace(HYPHEN_PATTERN, "-")
    .toLowerCase();
}

export function tokenizeReviewWriting(value: string): ReviewWritingToken[] {
  const canonicalText = value
    .normalize("NFC")
    .replace(APOSTROPHE_PATTERN, "'")
    .replace(HYPHEN_PATTERN, "-");
  let priorEnd = 0;
  return Array.from(canonicalText.matchAll(TOKEN_PATTERN), (match, index) => {
    const start = match.index;
    const token = {
      surface: match[0],
      normalized: match[0].toLowerCase(),
      index,
      separatorBefore: canonicalText.slice(priorEnd, start),
      startOffset: start,
      endOffset: start + match[0].length,
    };
    priorEnd = start + match[0].length;
    return token;
  });
}

function targetTokens(target: ReviewTargetSnapshotV3): string[] {
  if (target.answerAuthority.matchingPolicy !== "governed_exact_tokens_v1") {
    return [];
  }
  return tokenizeReviewWriting(target.canonicalSpelling).map((token) => token.normalized);
}

function exactSequenceAt(
  writingTokens: readonly ReviewWritingToken[],
  expectedTokens: readonly string[],
  start: number,
): boolean {
  return expectedTokens.every((expected, offset) => {
    const actual = writingTokens[start + offset];
    return actual?.normalized === expected &&
      (offset === 0 || /^\s+$/u.test(actual.separatorBefore));
  });
}

export function findExactReviewTargetMatches(
  writing: string,
  targets: readonly ReviewTargetSnapshotV3[],
): ReviewExactTargetMatch[] {
  const writingTokens = tokenizeReviewWriting(writing);
  return targets.flatMap((target) => {
    const expectedTokens = targetTokens(target);
    if (expectedTokens.length === 0 || expectedTokens.length > writingTokens.length) return [];
    for (let start = 0; start <= writingTokens.length - expectedTokens.length; start += 1) {
      if (!exactSequenceAt(writingTokens, expectedTokens, start)) continue;
      return [{
        encounterId: target.encounterId,
        targetOrder: target.order,
        tokenStart: start,
        tokenEndExclusive: start + expectedTokens.length,
        matchedText: writingTokens
          .slice(start, start + expectedTokens.length)
          .map((token) => token.surface)
          .join(" "),
        startOffset: writingTokens[start]!.startOffset,
        endOffset: writingTokens[start + expectedTokens.length - 1]!.endOffset,
      }];
    }
    return [];
  });
}

export function exactReviewTargetIds(
  writing: string,
  targets: readonly ReviewTargetSnapshotV3[],
): ReadonlySet<string> {
  return new Set(findExactReviewTargetMatches(writing, targets).map((match) => match.encounterId));
}

export function isExactReviewAudioResponse(
  response: string,
  target: ReviewTargetSnapshotV3,
): boolean {
  const responseTokens = tokenizeReviewWriting(response).map((token) => token.normalized);
  const expectedTokens = targetTokens(target);
  return responseTokens.length === expectedTokens.length &&
    expectedTokens.length > 0 &&
    expectedTokens.every((expected, index) => responseTokens[index] === expected);
}

export interface ReviewWritingSelection {
  text: string;
  normalizedTokens: readonly string[];
  startOffset: number;
  endOffset: number;
}

export function validateReviewWritingSelection(
  writing: string,
  startOffset: number,
  endOffset: number,
): ReviewWritingSelection | null {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) ||
    startOffset < 0 || endOffset <= startOffset || endOffset > writing.length) return null;
  const text = writing.slice(startOffset, endOffset);
  const tokens = tokenizeReviewWriting(text);
  if (tokens.length === 0 || tokens[0]?.startOffset !== 0 ||
    tokens.at(-1)?.endOffset !== text.length ||
    tokens.some((token, index) => index > 0 && !/^\s+$/u.test(token.separatorBefore))) return null;
  return {
    text,
    normalizedTokens: tokens.map((token) => token.normalized),
    startOffset,
    endOffset,
  };
}
