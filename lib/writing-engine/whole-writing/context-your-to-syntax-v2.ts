import { normaliseContextMember } from "./context";

export type ContextInputV2 = { fieldText: string; startUtf16: number; endUtf16: number };
export type SyntaxTokenV2 = { word: string; surface: string; start: number; end: number };

/** Source-only parser: no occurrence reanchoring, sentence stitching or corpus input. */
export function contextClauseV2(input: ContextInputV2):
  { tokens: SyntaxTokenV2[]; focus: number; reason: null } | { reason: string } {
  const { fieldText: text, startUtf16: start, endUtf16: end } = input;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return { reason: "SOURCE_SPAN_MISMATCH" };
  // Track quoted spans over the original field, including sentence boundaries.
  // Apostrophes internal to a word (including combining marks) are not quotes.
  let close: string | null = null;
  for (let i = 0; i < start; i += 1) {
    const ch = text[i];
    const internal = /['’ʼ]/u.test(ch) && /[\p{L}\p{M}]/u.test(text[i - 1] ?? "") && /[\p{L}\p{M}]/u.test(text[i + 1] ?? "");
    if (internal) continue;
    if (close) { if (ch === close) close = null; }
    else if (ch === '"' || ch === "'") close = ch;
    else if (ch === "“") close = "”";
    else if (ch === "‘") close = "’";
  }
  if (close) return { reason: "QUOTED_FORM_NOT_AUTHENTIC_USE" };
  const begin = Math.max(...[".", "!", "?", "\n"].map((b) => text.lastIndexOf(b, start - 1))) + 1;
  const ends = [".", "!", "?", "\n"].map((b) => text.indexOf(b, end)).filter((i) => i >= 0);
  const finish = ends.length ? Math.min(...ends) : text.length;
  const clause = text.slice(begin, finish);
  // Unparsed punctuation, ellipsis, quoted fragments and coordinated clauses abstain.
  if ((finish < text.length && text.slice(finish, finish + 2) === "..") || /[^\p{L}\p{M}\s'’ʼ-]/u.test(clause)) return { reason: "UNSUPPORTED_PUNCTUATION" };
  const tokens = Array.from(clause.matchAll(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu), (m) => ({
    word: normaliseContextMember(m[0]), surface: m[0], start: begin + m.index!, end: begin + m.index! + m[0].length,
  }));
  const residual = clause.replace(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu, "");
  if (/\S/u.test(residual)) return { reason: "UNSUPPORTED_PUNCTUATION" };
  const focus = tokens.findIndex((t) => t.start === start && t.end === end);
  if (focus < 0) return { reason: "SOURCE_SPAN_MISMATCH" };
  if (tokens.length > 24) return { reason: "UNSUPPORTED_CLAUSE_LENGTH" };
  return { tokens, focus, reason: null };
}

// Enumerated lexical classes are release dependencies. Membership alone never
// licenses a substitution: family rules must consume a complete bounded clause.
export const COUNT_NOUNS_V2 = new Set([
  "answer", "badge", "bag", "ball", "bicycle", "blanket", "book", "box", "card", "cat", "chair", "choice", "coat", "copy", "cupboard", "dog", "door", "friend", "garden", "gate", "hamster", "helmet", "house", "idea", "journey", "lantern", "library", "museum", "name", "notebook", "park", "pencil", "project", "rucksack", "sandwich", "school", "shell", "station", "table", "tail", "task", "teacher", "team", "ticket", "toy", "turn", "visit", "window",
]);
export const PLURAL_NOUNS_V2 = new Set([
  "answers", "badges", "bags", "balls", "bicycles", "blankets", "books", "boxes", "cards", "cats", "chairs", "choices", "coats", "copies", "cupboards", "dogs", "doors", "friends", "gardens", "gates", "hamsters", "helmets", "houses", "ideas", "journeys", "lanterns", "libraries", "museums", "names", "notebooks", "parks", "pencils", "projects", "rucksacks", "sandwiches", "schools", "shells", "stations", "tables", "tails", "tasks", "teachers", "teams", "tickets", "toys", "turns", "visits", "windows",
]);
export const NOUNS_V2 = new Set([...COUNT_NOUNS_V2, ...PLURAL_NOUNS_V2, "harbour", "home", "light", "lunch", "tea", "water", "work"]);
export const ADJECTIVES_V2 = new Set([
  "awake", "big", "brilliant", "careful", "cold", "curious", "delighted", "enormous", "excited", "fast", "fine", "fragile", "friendly", "good", "happy", "heavy", "kind", "late", "nervous", "patient", "quiet", "ready", "right", "sad", "silent", "small", "tired", "useful", "warm", "wet", "wrong",
]);
export const COPULAS_V2 = new Set(["am", "is", "are", "was", "were", "seems", "seem", "seemed", "looks", "look", "looked"]);
const determiners = new Set(["a", "an", "the", "this", "that", "these", "those", "my", "our", "his", "her", "your", "their", "its"]);
const prepositions = new Set(["in", "on", "under", "near", "beside", "for", "with", "before", "after"]);

export function nounPhraseV2(words: string[], determiner: "required" | "optional" | "excluded" = "optional", heads = NOUNS_V2): boolean {
  let i = 0;
  const supplied = determiners.has(words[0]);
  if ((determiner === "required" && !supplied) || (determiner === "excluded" && supplied)) return false;
  if (supplied) i += 1;
  let modifiers = 0;
  while (i < words.length - 1 && ADJECTIVES_V2.has(words[i]) && modifiers < 2) { i += 1; modifiers += 1; }
  return i === words.length - 1 && heads.has(words[i]);
}

export function complementV2(words: string[]): boolean {
  return words.length === 0 || (prepositions.has(words[0]) && nounPhraseV2(words.slice(1)));
}

export function adjectivePredicateV2(words: string[]): boolean {
  const i = ["very", "quite", "so"].includes(words[0]) ? 1 : 0;
  return ADJECTIVES_V2.has(words[i]) && complementV2(words.slice(i + 1));
}

export function subjectV2(tokens: SyntaxTokenV2[]): boolean {
  if (tokens.length === 1) {
    if (["i", "you", "he", "she", "it", "we", "they"].includes(tokens[0].word)) return true;
    // A single capitalised name is admitted only before a family-specific finite verb.
    return /^\p{Lu}[\p{L}\p{M}]+$/u.test(tokens[0].surface) && !determiners.has(tokens[0].word) && !["maybe", "because", "when", "if", "without", "running"].includes(tokens[0].word);
  }
  return nounPhraseV2(tokens.map((t) => t.word), "required");
}
