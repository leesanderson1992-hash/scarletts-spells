import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type DeterministicContextDecision } from "./context";

/** Unpublished family release. V1 dispatch and persisted selections remain unchanged. */
export const THERE_V2_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000005",
  releaseKey: "s8-v2-there-their-theyre",
  familyKey: "THERE_THEIR_THEYRE" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_THERE_DETERMINISTIC_V2",
  registryVersion: "WHOLE_WRITING_CONTEXT_THERE_REGISTRY_V2",
  corpusVersion: "WHOLE_WRITING_CONTEXT_CORPUS_V1",
  members: ["there", "their", "they're"],
  supportedConstructions: ["existential", "locative", "possessive", "they_are_contraction"],
  supportedScope: [
    "clause-initial existential be + determiner noun phrase with optional place complement",
    "subject + placement verb + object noun phrase + over/down/up + terminal locative",
    "clause-initial possessive noun phrase + finite copular predicate",
    "clause-initial they-are + adjective predicate; substitution requires a complete prepositional complement",
  ],
  exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent", "unsupported_clause_structure"],
});
export const THERE_V2_MANIFEST_FINGERPRINT = fingerprint(THERE_V2_MANIFEST);

export type ThereV2Decision = Omit<DeterministicContextDecision, "analyserVersion"> & {
  analyserVersion: string;
};

// Bounded lexical classes supplement structural checks; a neighbouring word
// alone never establishes an INVALID result. Unlisted vocabulary abstains.
const nouns = new Set([
  "answer", "bag", "ball", "bicycle", "blanket", "book", "cat", "coat", "dog",
  "family", "friend", "garden", "gate", "hamster", "helmet", "home", "house",
  "idea", "journey", "lantern", "name", "notebook", "park", "pencil", "project",
  "rucksack", "sandwich", "school", "shell", "shelf", "station", "table", "tail",
  "teacher", "team", "ticket", "toy", "visit", "water", "way", "work",
  "answers", "bags", "balls", "bicycles", "blankets", "books", "cats", "coats",
  "dogs", "families", "friends", "gardens", "gates", "hamsters", "helmets",
  "houses", "ideas", "lanterns", "names", "notebooks", "parks", "pencils",
  "projects", "rucksacks", "sandwiches", "schools", "shells", "shelves",
  "stations", "tables", "teachers", "teams", "tickets", "toys", "visits", "ways",
]);
const adjectives = new Set([
  "awake", "big", "brilliant", "careful", "cold", "curious", "delighted", "enormous",
  "excited", "fast", "fine", "fragile", "friendly", "fun", "good", "happy", "heavy",
  "kind", "late", "nervous", "patient", "ready", "right", "sad", "silent", "small",
  "tired", "useful", "wet", "wrong",
]);
const determiners = new Set(["a", "an", "the", "some", "my", "our", "your", "his", "her", "its", "their", "this", "that", "these", "those"]);
const prepositions = new Set(["about", "after", "before", "beside", "by", "for", "in", "near", "on", "under", "with"]);
const finiteCopulas = new Set(["is", "are", "was", "were", "looked", "looks", "seemed", "seems"]);

function nounPhrase(words: string[], requireDeterminer = false): boolean {
  const rest = [...words];
  const hasDeterminer = Boolean(rest[0] && (determiners.has(rest[0]) || /'s$/.test(rest[0])));
  if (hasDeterminer) rest.shift();
  if (requireDeterminer && !hasDeterminer) return false;
  while (rest.length > 1 && adjectives.has(rest[0])) rest.shift();
  return rest.length === 1 && nouns.has(rest[0]);
}

function complement(words: string[]): boolean {
  return words.length === 0 || (prepositions.has(words[0]) && nounPhrase(words.slice(1)));
}

function predicate(words: string[]): boolean {
  let i = words[0] === "very" || words[0] === "quite" || words[0] === "so" ? 1 : 0;
  if (!adjectives.has(words[i])) return false;
  i += 1;
  return complement(words.slice(i));
}

function insideQuotation(text: string, focus: number): boolean {
  let closing: string | null = null;
  for (let i = 0; i < focus; i += 1) {
    const char = text[i];
    if (/[’ʼ']/.test(char) && /\p{L}/u.test(text[i - 1] ?? "") && /\p{L}/u.test(text[i + 1] ?? "")) continue;
    if (closing) { if (char === closing) closing = null; }
    else if (char === '"' || char === "'") closing = char;
    else if (char === "“") closing = "”";
    else if (char === "‘") closing = "’";
  }
  return closing !== null;
}

export function analyseThereContextV2(input: {
  fieldText: string; startUtf16: number; endUtf16: number;
}): ThereV2Decision | null {
  const observed = normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16));
  if (!THERE_V2_MANIFEST.members.includes(observed)) return null;
  const make = (status: ThereV2Decision["status"], reasonCode: string, assessedScope = "bounded_family_context", alternativeMember: string | null = null): ThereV2Decision => ({
    status, reasonCode, assessedScope, alternativeMember, observedMember: observed,
    familyKey: THERE_V2_MANIFEST.familyKey, analyserVersion: THERE_V2_MANIFEST.analyserVersion,
    ruleId: `${THERE_V2_MANIFEST.analyserVersion}:THERE_THEIR_THEYRE:${reasonCode}`,
    manifestFingerprint: THERE_V2_MANIFEST_FINGERPRINT,
  });
  if (!Number.isInteger(input.startUtf16) || !Number.isInteger(input.endUtf16) || input.startUtf16 < 0 || input.endUtf16 > input.fieldText.length) return make("UNCERTAIN", "SOURCE_SPAN_MISMATCH");
  if (insideQuotation(input.fieldText, input.startUtf16)) return make("UNCERTAIN", "QUOTED_FORM_NOT_AUTHENTIC_USE");
  const before = input.fieldText.slice(0, input.startUtf16);
  const begin = Math.max(...[".", "!", "?", "\n"].map((b) => before.lastIndexOf(b))) + 1;
  const tail = input.fieldText.slice(input.endUtf16);
  const boundary = tail.search(/[.!?\n]/);
  const end = boundary < 0 ? input.fieldText.length : input.endUtf16 + boundary;
  const clause = input.fieldText.slice(begin, end);
  const matches = [...clause.matchAll(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu)];
  const focus = matches.findIndex((m) => begin + m.index! === input.startUtf16 && begin + m.index! + m[0].length === input.endUtf16);
  if (focus < 0) return make("UNCERTAIN", "SOURCE_SPAN_MISMATCH");
  // Strip only apostrophes internal to words; remaining quotation or clause
  // punctuation cannot establish the unambiguous constructions in this release.
  const punctuation = clause.replace(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu, "").trim();
  if (punctuation) return make("UNCERTAIN", "UNSUPPORTED_PUNCTUATION_OR_QUOTATION");
  if (boundary >= 0 && tail.slice(boundary).startsWith("..")) return make("UNCERTAIN", "FRAGMENT_OR_ELLIPSIS");
  const words = matches.map((m) => normaliseContextMember(m[0]));
  const following = words.slice(focus + 1);
  const expected = new Map<string, string>();
  if (focus === 0) {
    // Only finite existential be, followed by a complete determiner-led NP.
    if (["is", "are", "was", "were"].includes(following[0])) {
      const rest = following.slice(1);
      const prep = rest.findIndex((w) => prepositions.has(w));
      if (nounPhrase(prep < 0 ? rest : rest.slice(0, prep), true) && complement(prep < 0 ? [] : rest.slice(prep))) expected.set("there", "existential");
    }
    const copula = following.findIndex((w) => finiteCopulas.has(w));
    if (copula > 0 && nounPhrase(following.slice(0, copula)) && predicate(following.slice(copula + 1))) expected.set("their", "possessive");
    // Bare 'their cold' can be a possessive noun phrase. Do not use one
    // adjacent adjective or punctuation alone to assert a substitution.
    if (predicate(following) && (observed === "they're" || following.some((w) => prepositions.has(w)))) expected.set("they're", "they_are_contraction");
  }
  if (focus === words.length - 1 && focus >= 4 && ["over", "down", "up"].includes(words[focus - 1])) {
    const subject = words[0];
    const properName = /^[A-Z][a-z]+$/.test(matches[0][0]);
    if ((properName || ["i", "we", "he", "she", "they", "you"].includes(subject)) && ["left", "put", "placed", "kept"].includes(words[1]) && nounPhrase(words.slice(2, focus - 1), true)) expected.set("there", "locative");
  }
  if (expected.size !== 1) return make("UNCERTAIN", expected.size ? "COMPETING_CONSTRUCTIONS" : "UNSUPPORTED_CONSTRUCTION");
  const [member, scope] = [...expected][0];
  return make(observed === member ? "VALID" : "INVALID", observed === member ? `SUPPORTED_${scope.toUpperCase()}` : `EXPECTED_${member === "they're" ? "THEYRE" : member.toUpperCase()}`, scope, observed === member ? null : member);
}
