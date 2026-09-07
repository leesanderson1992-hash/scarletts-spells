import { fingerprint } from "../baseline/source";

export const WHOLE_WRITING_CONTEXT_ANALYSER_VERSION =
  "WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1" as const;
export const WHOLE_WRITING_CONTEXT_REGISTRY_VERSION =
  "WHOLE_WRITING_CONTEXT_REGISTRY_V1" as const;
export const WHOLE_WRITING_CONTEXT_CORPUS_VERSION =
  "WHOLE_WRITING_CONTEXT_CORPUS_V1" as const;

export type ContextFamilyKey =
  | "THERE_THEIR_THEYRE"
  | "TO_TOO_TWO"
  | "YOUR_YOURE"
  | "ITS_ITS";

export type ContextResultStatus = "NOT_ASSESSED" | "VALID" | "INVALID" | "UNCERTAIN";

export type ContextFamilyManifest = Readonly<{
  familyKey: ContextFamilyKey;
  members: readonly string[];
  supportedConstructions: readonly string[];
  exclusions: readonly string[];
  registryVersion: typeof WHOLE_WRITING_CONTEXT_REGISTRY_VERSION;
  corpusVersion: typeof WHOLE_WRITING_CONTEXT_CORPUS_VERSION;
  fingerprint: string;
}>;

const manifestRows: Omit<ContextFamilyManifest, "fingerprint">[] = [
  {
    familyKey: "THERE_THEIR_THEYRE",
    members: ["there", "their", "they're"],
    supportedConstructions: ["existential", "locative", "possessive", "they_are_contraction"],
    exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent"],
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  },
  {
    familyKey: "TO_TOO_TWO",
    members: ["to", "too", "two"],
    supportedConstructions: ["preposition", "infinitive", "additive", "degree", "numeral"],
    exclusions: ["fragment", "unresolved_lexical_category", "quoted_or_reported_intent"],
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  },
  {
    familyKey: "YOUR_YOURE",
    members: ["your", "you're"],
    supportedConstructions: ["possessive", "you_are_contraction"],
    exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent"],
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  },
  {
    familyKey: "ITS_ITS",
    members: ["its", "it's"],
    supportedConstructions: ["possessive", "it_is_contraction", "it_has_contraction"],
    exclusions: ["fragment", "quoted_or_reported_intent"],
    registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  },
];

export const CONTEXT_FAMILY_MANIFESTS: readonly ContextFamilyManifest[] =
  manifestRows.map((row) => Object.freeze({ ...row, fingerprint: fingerprint(row) }));

const FAMILY_BY_MEMBER = new Map(
  CONTEXT_FAMILY_MANIFESTS.flatMap((manifest) =>
    manifest.members.map((member) => [member, manifest] as const),
  ),
);

export function normaliseContextMember(value: string) {
  return value.normalize("NFC").toLowerCase().replace(/[’ʼ]/g, "'");
}

export function contextFamilyForMember(value: string) {
  return FAMILY_BY_MEMBER.get(normaliseContextMember(value)) ?? null;
}

type ContextToken = { normalized: string; start: number; end: number };

function tokens(text: string, offset = 0): ContextToken[] {
  const pattern = /[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu;
  return Array.from(text.matchAll(pattern), (match) => ({
    normalized: normaliseContextMember(match[0]),
    start: offset + match.index!,
    end: offset + match.index! + match[0].length,
  }));
}

const nouns = new Set([
  "answer", "bag", "ball", "book", "cat", "coat", "dog", "family", "friend",
  "garden", "home", "house", "idea", "name", "school", "tail", "teacher", "team",
  "toy", "water", "way", "work",
]);
const pluralNouns = new Set([
  "answers", "bags", "balls", "books", "cats", "coats", "dogs", "friends", "houses",
  "ideas", "names", "teams", "toys", "ways",
]);
const adjectives = new Set([
  "big", "cold", "fast", "fine", "friendly", "fun", "good", "happy", "heavy", "kind",
  "late", "ready", "right", "sad", "small", "tired", "very", "wet", "wrong",
]);
const baseVerbs = new Set([
  "be", "come", "do", "eat", "find", "finish", "get", "go", "have", "help", "learn",
  "make", "play", "read", "run", "say", "see", "take", "try", "walk", "write",
]);
const formsOfBe = new Set(["am", "are", "is", "was", "were", "be", "been", "being"]);
const locativeSignals = new Set(["down", "from", "here", "in", "near", "out", "over", "through", "up"]);
const possessiveNouns = new Set([...nouns, ...pluralNouns]);

export type DeterministicContextDecision = Readonly<{
  status: ContextResultStatus;
  familyKey: ContextFamilyKey;
  observedMember: string;
  alternativeMember: string | null;
  assessedScope: string;
  reasonCode: string;
  ruleId: string;
  analyserVersion: typeof WHOLE_WRITING_CONTEXT_ANALYSER_VERSION;
  manifestFingerprint: string;
}>;

function decision(
  manifest: ContextFamilyManifest,
  observedMember: string,
  status: ContextResultStatus,
  reasonCode: string,
  assessedScope: string,
  alternativeMember: string | null = null,
): DeterministicContextDecision {
  return Object.freeze({
    status,
    familyKey: manifest.familyKey,
    observedMember,
    alternativeMember,
    assessedScope,
    reasonCode,
    ruleId: `${WHOLE_WRITING_CONTEXT_ANALYSER_VERSION}:${manifest.familyKey}:${reasonCode}`,
    analyserVersion: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    manifestFingerprint: manifest.fingerprint,
  });
}

function uncertain(manifest: ContextFamilyManifest, observed: string, reason = "INSUFFICIENT_CONTEXT") {
  return decision(manifest, observed, "UNCERTAIN", reason, "bounded_family_context");
}

/**
 * Conservative rules for the four approved S8 families. A result is emitted
 * only for the exact stored occurrence. These rules deliberately abstain when
 * the supported construction does not establish one unique interpretation.
 */
export function analyseDeterministicContext(input: {
  fieldText: string;
  startUtf16: number;
  endUtf16: number;
}): DeterministicContextDecision | null {
  const observedSurface = input.fieldText.slice(input.startUtf16, input.endUtf16);
  const observed = normaliseContextMember(observedSurface);
  const manifest = contextFamilyForMember(observed);
  if (!manifest) return null;
  const beforeOccurrence = input.fieldText.slice(0, input.startUtf16);
  const previousBoundary = Math.max(
    beforeOccurrence.lastIndexOf("."),
    beforeOccurrence.lastIndexOf("!"),
    beforeOccurrence.lastIndexOf("?"),
    beforeOccurrence.lastIndexOf("\n"),
  );
  const afterOccurrence = input.fieldText.slice(input.endUtf16);
  const boundaryCandidates = [".", "!", "?", "\n"]
    .map((boundary) => afterOccurrence.indexOf(boundary))
    .filter((position) => position >= 0);
  const nextBoundary = boundaryCandidates.length
    ? input.endUtf16 + Math.min(...boundaryCandidates)
    : input.fieldText.length;
  const sentenceStart = previousBoundary + 1;
  const all = tokens(input.fieldText.slice(sentenceStart, nextBoundary), sentenceStart);
  const index = all.findIndex((token) => token.start === input.startUtf16 && token.end === input.endUtf16);
  if (index < 0 || all[index]?.normalized !== observed) {
    return uncertain(manifest, observed, "SOURCE_SPAN_MISMATCH");
  }
  const previous = all[index - 1]?.normalized ?? null;
  const next = all[index + 1]?.normalized ?? null;
  const afterNext = all[index + 2]?.normalized ?? null;
  const fourth = all[index + 3]?.normalized ?? null;
  const terminal = index === all.length - 1;
  const nextIsGerund = Boolean(next?.endsWith("ing"));
  const following = all.slice(index + 1).map((token) => token.normalized);
  const possessivePhrase = Boolean(
    next && (
      possessiveNouns.has(next) ||
      (adjectives.has(next) && afterNext && possessiveNouns.has(afterNext)) ||
      (adjectives.has(next) && afterNext && adjectives.has(afterNext) && fourth && possessiveNouns.has(fourth))
    ),
  );
  const adjectivePredicate = following.length > 0 && following.every((word) => adjectives.has(word));
  const beforeSurface = input.fieldText.slice(Math.max(0, input.startUtf16 - 1), input.startUtf16);
  const afterSurface = input.fieldText.slice(input.endUtf16, input.endUtf16 + 1);
  if (["\"", "'", "‘", "“"].includes(beforeSurface) && ["\"", "'", "’", "”"].includes(afterSurface)) {
    return uncertain(manifest, observed, "QUOTED_FORM_NOT_AUTHENTIC_USE");
  }

  if (manifest.familyKey === "THERE_THEIR_THEYRE") {
    if (observed === "there") {
      if (next && formsOfBe.has(next)) return decision(manifest, observed, "VALID", "EXISTENTIAL_THERE", "existential");
      if (terminal || (previous && locativeSignals.has(previous))) return decision(manifest, observed, "VALID", "LOCATIVE_THERE", "locative");
      if (next && possessiveNouns.has(next)) return decision(manifest, observed, "INVALID", "EXPECTED_THEIR", "possessive", "their");
    }
    if (observed === "their") {
      if (possessivePhrase) return decision(manifest, observed, "VALID", "POSSESSIVE_THEIR", "possessive");
      if (nextIsGerund && ((afterNext && formsOfBe.has(afterNext)) || (fourth && formsOfBe.has(fourth)))) return decision(manifest, observed, "VALID", "POSSESSIVE_THEIR_GERUND", "possessive_gerund");
      if (nextIsGerund && afterNext === "to") return decision(manifest, observed, "INVALID", "EXPECTED_THEYRE", "they_are_contraction", "they're");
      if (nextIsGerund && afterNext === "home" && (!fourth || new Set(["now", "soon", "today"]).has(fourth))) return decision(manifest, observed, "INVALID", "EXPECTED_THEYRE", "they_are_contraction", "they're");
      if (adjectivePredicate && !nextIsGerund) return decision(manifest, observed, "INVALID", "EXPECTED_THEYRE", "they_are_contraction", "they're");
    }
    if (observed === "they're") {
      if (next && (adjectives.has(next) || nextIsGerund || formsOfBe.has(next) || new Set(["here", "home", "there"]).has(next))) return decision(manifest, observed, "VALID", "CONTRACTION_THEY_ARE", "they_are_contraction");
      if (next && possessiveNouns.has(next) && afterNext && formsOfBe.has(afterNext)) return decision(manifest, observed, "INVALID", "EXPECTED_THEIR", "possessive", "their");
    }
    return uncertain(manifest, observed);
  }

  if (manifest.familyKey === "TO_TOO_TWO") {
    if (observed === "to") {
      if (next && baseVerbs.has(next)) return decision(manifest, observed, "VALID", "INFINITIVAL_TO", "infinitive");
      if (previous && new Set(["come", "from", "go", "going", "walk", "walked", "went"]).has(previous)) return decision(manifest, observed, "VALID", "PREPOSITIONAL_TO", "preposition");
      if (next && pluralNouns.has(next) && previous && new Set(["have", "has", "had", "saw"]).has(previous)) return decision(manifest, observed, "INVALID", "EXPECTED_TWO", "numeral", "two");
      if (next && adjectives.has(next) && previous && formsOfBe.has(previous)) return decision(manifest, observed, "INVALID", "EXPECTED_TOO", "degree", "too");
    }
    if (observed === "too") {
      if (terminal) return decision(manifest, observed, "VALID", "ADDITIVE_TOO", "additive");
      if (next && adjectives.has(next)) return decision(manifest, observed, "VALID", "DEGREE_TOO", "degree");
      if (next && baseVerbs.has(next)) return decision(manifest, observed, "INVALID", "EXPECTED_TO", "infinitive", "to");
      if (next && pluralNouns.has(next) && previous && new Set(["have", "has", "had", "saw"]).has(previous)) return decision(manifest, observed, "INVALID", "EXPECTED_TWO", "numeral", "two");
    }
    if (observed === "two") {
      if (next && (nouns.has(next) || pluralNouns.has(next))) return decision(manifest, observed, "VALID", "NUMERAL_TWO", "numeral");
      if (next && baseVerbs.has(next)) return decision(manifest, observed, "INVALID", "EXPECTED_TO", "infinitive", "to");
      if (terminal && previous === "want") return decision(manifest, observed, "INVALID", "EXPECTED_TOO", "additive", "too");
    }
    return uncertain(manifest, observed);
  }

  if (manifest.familyKey === "YOUR_YOURE") {
    if (observed === "your") {
      if (possessivePhrase) return decision(manifest, observed, "VALID", "POSSESSIVE_YOUR", "possessive");
      if (adjectivePredicate || (nextIsGerund && afterNext === "to")) return decision(manifest, observed, "INVALID", "EXPECTED_YOURE", "you_are_contraction", "you're");
    }
    if (observed === "you're") {
      if (next && (adjectives.has(next) || nextIsGerund || formsOfBe.has(next) || new Set(["here", "home", "there"]).has(next))) return decision(manifest, observed, "VALID", "CONTRACTION_YOU_ARE", "you_are_contraction");
      if (next && possessiveNouns.has(next) && afterNext && formsOfBe.has(afterNext)) return decision(manifest, observed, "INVALID", "EXPECTED_YOUR", "possessive", "your");
    }
    return uncertain(manifest, observed);
  }

  if (observed === "its") {
    if (nextIsGerund && afterNext && possessiveNouns.has(afterNext)) return decision(manifest, observed, "VALID", "POSSESSIVE_ITS", "possessive");
    if (possessivePhrase) return decision(manifest, observed, "VALID", "POSSESSIVE_ITS", "possessive");
    if (adjectivePredicate || (nextIsGerund && terminal) || (next && formsOfBe.has(next))) return decision(manifest, observed, "INVALID", "EXPECTED_ITS_CONTRACTION", "it_is_or_has_contraction", "it's");
  }
  if (observed === "it's") {
    if (next && (adjectives.has(next) || nextIsGerund || formsOfBe.has(next) || next === "a" || next === "an")) return decision(manifest, observed, "VALID", next === "been" ? "CONTRACTION_IT_HAS" : "CONTRACTION_IT_IS", "it_is_or_has_contraction");
    if (next && possessiveNouns.has(next) && afterNext && formsOfBe.has(afterNext)) return decision(manifest, observed, "INVALID", "EXPECTED_POSSESSIVE_ITS", "possessive", "its");
  }
  return uncertain(manifest, observed);
}
