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
}

export interface ReviewExactTargetMatch {
  encounterId: string;
  targetOrder: number;
  tokenStart: number;
  tokenEndExclusive: number;
  matchedText: string;
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
