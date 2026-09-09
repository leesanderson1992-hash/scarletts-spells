import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type DeterministicContextDecision } from "./context";

/** Unpublished family release. Persisted V1 selections remain on V1. */
export const ITS_V2_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000008",
  releaseKey: "s8-v2-its-its",
  familyKey: "ITS_ITS" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_ITS_DETERMINISTIC_V2",
  registryVersion: "WHOLE_WRITING_CONTEXT_ITS_REGISTRY_V2",
  corpusVersion: "WHOLE_WRITING_CONTEXT_CORPUS_V1",
  members: ["its", "it's"],
  supportedConstructions: ["possessive", "it_is_contraction", "it_has_contraction"],
  supportedScope: [
    "subject noun phrase + kept + possessive determiner + object noun phrase + complete place complement",
    "clause-initial it-is contraction + adjective predicate + complete place complement",
    "clause-initial it-has contraction + been + adjective predicate + complete since-time complement",
  ],
  exclusions: [
    "fragment",
    "quoted_or_reported_intent",
    "unfinished_gerund_context",
    "run_on",
    "task_dependent",
    "unsupported_clause_structure",
  ],
});

export const ITS_V2_MANIFEST_FINGERPRINT = fingerprint(ITS_V2_MANIFEST);

export type ItsV2Decision = Omit<DeterministicContextDecision, "analyserVersion"> & {
  analyserVersion: string;
};

type Token = { word: string; start: number; end: number };

const nouns = new Set([
  "answer", "bag", "bicycle", "bicycles", "blanket", "book", "boat", "coat",
  "dog", "entrance", "fox", "friend", "garden", "hamster", "helmet", "helmets",
  "house", "lantern", "machine", "morning", "museum", "notebook", "pencil",
  "pencils", "project", "rucksack", "sandwich", "sandwiches", "school", "shell",
  "shells", "tail", "teacher", "team", "ticket", "tickets", "toy", "window",
]);
const adjectives = new Set([
  "awake", "brilliant", "careful", "cold", "curious", "delighted", "enormous",
  "excited", "fast", "fragile", "friendly", "happy", "heavy", "kind", "nervous",
  "open", "patient", "ready", "right", "silent", "small", "tired", "useful", "wet", "wrong",
]);
const determiners = new Set(["a", "an", "the", "this", "that", "my", "our", "your", "his", "her", "their", "its"]);

function insideQuotation(text: string, focus: number): boolean {
  let closing: string | null = null;
  for (let index = 0; index < focus; index += 1) {
    const char = text[index];
    if (/[’ʼ']/.test(char) && /\p{L}/u.test(text[index - 1] ?? "") && /\p{L}/u.test(text[index + 1] ?? "")) continue;
    if (closing) {
      if (char === closing) closing = null;
    } else if (char === '"' || char === "'") closing = char;
    else if (char === "“") closing = "”";
    else if (char === "‘") closing = "’";
  }
  return closing !== null;
}

function nounPhrase(words: string[], determinerRequired: boolean): boolean {
  const rest = [...words];
  const hasDeterminer = Boolean(rest[0] && determiners.has(rest[0]));
  if (hasDeterminer) rest.shift();
  if (determinerRequired && !hasDeterminer) return false;
  while (rest.length > 1 && adjectives.has(rest[0])) rest.shift();
  return rest.length === 1 && nouns.has(rest[0]);
}

function tokenise(text: string, offset: number): Token[] {
  return [...text.matchAll(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu)].map((match) => ({
    word: normaliseContextMember(match[0]),
    start: offset + match.index!,
    end: offset + match.index! + match[0].length,
  }));
}

/**
 * Bounded ITS/IT'S analyser for the exact S8 V2 release. It recognises only
 * complete enumerated clause shapes; unsupported or competing readings abstain.
 */
export function analyseItsContextV2(input: {
  fieldText: string;
  startUtf16: number;
  endUtf16: number;
}): ItsV2Decision | null {
  const observedMember = normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16));
  if (!ITS_V2_MANIFEST.members.includes(observedMember)) return null;
  const make = (
    status: ItsV2Decision["status"],
    reasonCode: string,
    assessedScope = "bounded_family_context",
    alternativeMember: string | null = null,
  ): ItsV2Decision => ({
    status,
    familyKey: ITS_V2_MANIFEST.familyKey,
    observedMember,
    alternativeMember,
    assessedScope,
    reasonCode,
    ruleId: `${ITS_V2_MANIFEST.analyserVersion}:ITS_ITS:${reasonCode}`,
    analyserVersion: ITS_V2_MANIFEST.analyserVersion,
    manifestFingerprint: ITS_V2_MANIFEST_FINGERPRINT,
  });

  if (!Number.isInteger(input.startUtf16) || !Number.isInteger(input.endUtf16) || input.startUtf16 < 0 || input.endUtf16 > input.fieldText.length || input.endUtf16 <= input.startUtf16) {
    return make("UNCERTAIN", "SOURCE_SPAN_MISMATCH");
  }
  if (insideQuotation(input.fieldText, input.startUtf16)) return make("UNCERTAIN", "QUOTED_FORM_NOT_AUTHENTIC_USE");

  const before = input.fieldText.slice(0, input.startUtf16);
  const sentenceStart = Math.max(...[".", "!", "?", "\n"].map((boundary) => before.lastIndexOf(boundary))) + 1;
  const tail = input.fieldText.slice(input.endUtf16);
  const boundaryOffset = tail.search(/[.!?\n]/);
  const sentenceEnd = boundaryOffset < 0 ? input.fieldText.length : input.endUtf16 + boundaryOffset;
  const sentence = input.fieldText.slice(sentenceStart, sentenceEnd);
  const tokens = tokenise(sentence, sentenceStart);
  const focus = tokens.findIndex((token) => token.start === input.startUtf16 && token.end === input.endUtf16);
  if (focus < 0 || tokens[focus].word !== observedMember) return make("UNCERTAIN", "SOURCE_SPAN_MISMATCH");

  const nonWords = sentence.replace(/[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu, "").trim();
  if (nonWords) return make("UNCERTAIN", "UNSUPPORTED_PUNCTUATION_OR_QUOTATION");
  if (boundaryOffset >= 0 && tail.slice(boundaryOffset).startsWith("..")) return make("UNCERTAIN", "FRAGMENT_OR_ELLIPSIS");

  const words = tokens.map((token) => token.word);
  const fits: Array<{ member: "its" | "it's"; scope: string }> = [];

  // Complete possessive: determiner-led subject + kept + its + bounded object
  // noun phrase + near + determiner-led place noun phrase.
  if (focus >= 3 && words[focus - 1] === "kept" && nounPhrase(words.slice(0, focus - 1), true)) {
    const near = words.indexOf("near", focus + 1);
    if (near > focus + 1 && nounPhrase(words.slice(focus + 1, near), false) && nounPhrase(words.slice(near + 1), true)) {
      fits.push({ member: "its", scope: "possessive" });
    }
  }

  if (focus === 0) {
    // Complete it-is adjective predicate with a bounded place complement.
    if (words.length >= 5 && adjectives.has(words[1]) && words[2] === "beside" && nounPhrase(words.slice(3), true)) {
      fits.push({ member: "it's", scope: "it_is_contraction" });
    }
    // Complete it-has predicate with an explicitly bounded time complement.
    if (words.length >= 6 && words[1] === "been" && adjectives.has(words[2]) && words[3] === "since" && words[4] === "early" && nounPhrase(words.slice(5), false)) {
      fits.push({ member: "it's", scope: "it_has_contraction" });
    }
  }

  if (fits.length !== 1) return make("UNCERTAIN", fits.length ? "COMPETING_CONSTRUCTIONS" : "UNSUPPORTED_CLAUSE_STRUCTURE");
  const selected = fits[0];
  const valid = observedMember === selected.member;
  return make(valid ? "VALID" : "INVALID", valid ? "SUPPORTED_FAMILY_USE" : "UNIQUE_FAMILY_SUBSTITUTION", selected.scope, valid ? null : selected.member);
}
