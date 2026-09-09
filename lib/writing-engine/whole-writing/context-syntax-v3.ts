import { fingerprint } from "../baseline/source";
import { normaliseContextMember } from "./context";
import { CONTEXT_V3_LEXICON, isLikelyNoun } from "./context-lexicon-v3";

export const CONTEXT_V3_SYNTAX_VERSION =
  "WHOLE_WRITING_CONTEXT_BOUNDED_SYNTAX_V3" as const;
export const CONTEXT_V3_SYNTAX_LIMITS = Object.freeze({
  maxSentenceTokens: 256,
  maxEmbeddedClauses: 4,
  maxCompetingAnalyses: 64,
});
export const CONTEXT_V3_SYNTAX_FINGERPRINT = fingerprint({
  version: CONTEXT_V3_SYNTAX_VERSION,
  limits: CONTEXT_V3_SYNTAX_LIMITS,
  sentenceBoundaries: [".", "!", "?", "\\n"],
  clausePunctuation: [",", ";", ":", "—", "–"],
  apostrophes: ["'", "’", "ʼ"],
});

export type ContextInputV3 = Readonly<{
  fieldText: string;
  startUtf16: number;
  endUtf16: number;
}>;

export type SyntaxTokenV3 = Readonly<{
  kind: "word" | "punctuation";
  surface: string;
  word: string;
  start: number;
  end: number;
}>;

export type ContextSyntaxTraceV3 = Readonly<{
  sentenceStartUtf16: number;
  sentenceEndUtf16: number;
  clauseStartUtf16: number;
  clauseEndUtf16: number;
  focusTokenIndex: number;
  boundaryReasons: readonly string[];
}>;

export type ParsedContextV3 = Readonly<{
  tokens: readonly SyntaxTokenV3[];
  words: readonly SyntaxTokenV3[];
  focus: number;
  sentenceWords: readonly SyntaxTokenV3[];
  trace: ContextSyntaxTraceV3;
}>;

export type ContextSyntaxResultV3 =
  | Readonly<{ status: "ready"; context: ParsedContextV3 }>
  | Readonly<{ status: "blocked"; reason: string }>;

function internalApostrophe(text: string, index: number) {
  return /['’ʼ]/u.test(text[index] ?? "") &&
    /[\p{L}\p{M}]/u.test(text[index - 1] ?? "") &&
    /[\p{L}\p{M}]/u.test(text[index + 1] ?? "");
}

function quoteRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let active: { start: number; close: string } | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (internalApostrophe(text, index)) continue;
    if (active) {
      if (char === active.close) {
        ranges.push({ start: active.start, end: index + 1 });
        active = null;
      }
      continue;
    }
    if (char === '"' || char === "'") active = { start: index, close: char };
    else if (char === "“") active = { start: index, close: "”" };
    else if (char === "‘") active = { start: index, close: "’" };
  }
  return { ranges, unmatchedStart: active?.start ?? null };
}

function contains(ranges: readonly { start: number; end: number }[], index: number) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function sentenceBounds(text: string, focusStart: number, focusEnd: number, quoted: readonly { start: number; end: number }[]) {
  let start = 0;
  let end = text.length;
  for (let index = 0; index < text.length; index += 1) {
    if (contains(quoted, index)) continue;
    const char = text[index];
    if (char === "\n" || char === "." || char === "!" || char === "?") {
      if (index < focusStart) start = index + 1;
      else if (index >= focusEnd) { end = index; break; }
    }
  }
  return { start, end };
}

function tokenise(text: string, start: number, end: number): SyntaxTokenV3[] {
  const slice = text.slice(start, end);
  const pattern = /[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*|[,;:()[\]{}—–]/gu;
  return Array.from(slice.matchAll(pattern), (match) => ({
    kind: /^[\p{L}\p{M}]/u.test(match[0]) ? "word" as const : "punctuation" as const,
    surface: match[0],
    word: /^[\p{L}\p{M}]/u.test(match[0]) ? normaliseContextMember(match[0]) : match[0],
    start: start + match.index!,
    end: start + match.index! + match[0].length,
  }));
}

function finiteAnchorCount(words: readonly SyntaxTokenV3[]) {
  return words.filter((token) =>
    CONTEXT_V3_LEXICON.finiteVerbSet.has(token.word) ||
    CONTEXT_V3_LEXICON.auxiliarySet.has(token.word) ||
    token.word === "they're" || token.word === "you're" || token.word === "it's",
  ).length;
}

export function parseContextV3(input: ContextInputV3): ContextSyntaxResultV3 {
  const { fieldText: text, startUtf16: start, endUtf16: end } = input;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) {
    return { status: "blocked", reason: "SOURCE_SPAN_MISMATCH" };
  }
  const quotes = quoteRanges(text);
  if (contains(quotes.ranges, start)) return { status: "blocked", reason: "QUOTED_FORM_NOT_AUTHENTIC_USE" };
  if (quotes.unmatchedStart !== null && quotes.unmatchedStart < end) return { status: "blocked", reason: "QUOTATION_SCOPE_UNRESOLVED" };

  const sentence = sentenceBounds(text, start, end, quotes.ranges);
  const rawSentence = text.slice(sentence.start, sentence.end);
  if (/\.\.|…/u.test(rawSentence)) return { status: "blocked", reason: "FRAGMENT_OR_ELLIPSIS" };

  const tokens = tokenise(text, sentence.start, sentence.end);
  const sentenceWords = tokens.filter((token) => token.kind === "word");
  if (sentenceWords.length > CONTEXT_V3_SYNTAX_LIMITS.maxSentenceTokens) return { status: "blocked", reason: "RESOURCE_LIMIT" };
  const sourceFocus = sentenceWords.findIndex((token) => token.start === start && token.end === end);
  if (sourceFocus < 0) return { status: "blocked", reason: "SOURCE_SPAN_MISMATCH" };
  const sentenceClauseLinks = tokens.filter((token) => token.kind === "word" && (CONTEXT_V3_LEXICON.coordinatorSet.has(token.word) || CONTEXT_V3_LEXICON.subordinatorSet.has(token.word))).length;
  if (sentenceClauseLinks > CONTEXT_V3_SYNTAX_LIMITS.maxEmbeddedClauses) return { status: "blocked", reason: "RESOURCE_LIMIT" };
  const metaLanguage = new Set(["clause", "debated", "editor", "ending", "form", "label", "meaning", "note", "noun", "phrase", "structure", "unfinished", "unresolved", "word"]);
  const metaCount = sentenceWords.filter((token) => metaLanguage.has(token.word)).length;
  const reportedFrame = sentenceWords.some((token) => ["about", "copied", "debated", "whether", "without"].includes(token.word));
  if (metaCount >= 2 && reportedFrame) return { status: "blocked", reason: "REPORTED_OR_METALINGUISTIC_CONTEXT" };

  const focusTokenIndex = tokens.findIndex((token) => token.start === start && token.end === end);
  const boundaryReasons: string[] = [];
  let clauseStart = 0;
  let clauseEnd = tokens.length;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const punctuationBoundary = token.kind === "punctuation" && [",", ";", ":", "—", "–"].includes(token.word);
    const subordinateBoundary = token.kind === "word" && CONTEXT_V3_LEXICON.subordinatorSet.has(token.word);
    const coordinatedBoundary = token.kind === "word" && CONTEXT_V3_LEXICON.coordinatorSet.has(token.word) &&
      (tokens[index - 1]?.word === "," || tokens.slice(index + 1, index + 4).some((candidate) => candidate.kind === "word" && CONTEXT_V3_LEXICON.pronounSet.has(candidate.word)));
    if (!punctuationBoundary && !subordinateBoundary && !coordinatedBoundary) continue;
    if (index < focusTokenIndex) {
      clauseStart = index + 1;
      boundaryReasons.push(punctuationBoundary ? "punctuation_before" : "link_before");
    } else if (index > focusTokenIndex && index < clauseEnd) {
      clauseEnd = index;
      boundaryReasons.push(punctuationBoundary ? "punctuation_after" : "link_after");
      break;
    }
  }

  while (clauseStart < clauseEnd && (tokens[clauseStart].kind === "punctuation" || CONTEXT_V3_LEXICON.coordinatorSet.has(tokens[clauseStart].word) || CONTEXT_V3_LEXICON.subordinatorSet.has(tokens[clauseStart].word))) clauseStart += 1;
  while (clauseEnd > clauseStart && tokens[clauseEnd - 1].kind === "punctuation") clauseEnd -= 1;
  const clauseTokens = tokens.slice(clauseStart, clauseEnd);
  const words = clauseTokens.filter((token) => token.kind === "word");
  const focus = words.findIndex((token) => token.start === start && token.end === end);
  if (focus < 0) return { status: "blocked", reason: "SOURCE_SPAN_MISMATCH" };

  const epistemic = words.some((token) => CONTEXT_V3_LEXICON.epistemicSignalSet.has(token.word));
  if (epistemic && words.some((token) => ["label", "answer", "word", "picture", "arrow"].includes(token.word))) {
    return { status: "blocked", reason: "TASK_CONTEXT_REQUIRED" };
  }
  const clauseLinks = clauseTokens.filter((token) => token.kind === "word" && (CONTEXT_V3_LEXICON.coordinatorSet.has(token.word) || CONTEXT_V3_LEXICON.subordinatorSet.has(token.word))).length;
  if (finiteAnchorCount(words) > 2 && clauseLinks === 0 && !words.some((token) => CONTEXT_V3_LEXICON.reportingVerbSet.has(token.word))) {
    return { status: "blocked", reason: "RUN_ON_OR_UNMARKED_CLAUSE" };
  }
  if (words.length < 2 || words[0]?.word === "maybe") return { status: "blocked", reason: "FRAGMENT_OR_INCOMPLETE_CONSTRUCTION" };

  return {
    status: "ready",
    context: {
      tokens: clauseTokens,
      words,
      focus,
      sentenceWords,
      trace: {
        sentenceStartUtf16: sentence.start,
        sentenceEndUtf16: sentence.end,
        clauseStartUtf16: clauseTokens[0]?.start ?? start,
        clauseEndUtf16: clauseTokens.at(-1)?.end ?? end,
        focusTokenIndex: focus,
        boundaryReasons,
      },
    },
  };
}

export function hasFinitePredicate(words: readonly SyntaxTokenV3[], start = 0) {
  return words.some((token, index) => index >= start && words[index - 1]?.word !== "to" && (
    CONTEXT_V3_LEXICON.finiteVerbSet.has(token.word) || CONTEXT_V3_LEXICON.copulaSet.has(token.word) || CONTEXT_V3_LEXICON.auxiliarySet.has(token.word)
  ));
}

export function isCompleteNounHead(words: readonly SyntaxTokenV3[], index: number) {
  const token = words[index];
  if (!token) return false;
  if (isLikelyNoun(token.word)) return true;
  const next = words[index + 1];
  return Boolean(next && (CONTEXT_V3_LEXICON.finiteVerbSet.has(next.word) || CONTEXT_V3_LEXICON.copulaSet.has(next.word))) && !CONTEXT_V3_LEXICON.adjectiveSet.has(token.word);
}
