import { YOUR_TO_V2_SOURCE_PINS } from "./context-your-to-source-pins-v2";
import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type DeterministicContextDecision } from "./context";
import { ADJECTIVES_V2, COPULAS_V2, PLURAL_NOUNS_V2, complementV2, contextClauseV2, nounPhraseV2, subjectV2, type ContextInputV2 } from "./context-your-to-syntax-v2";

export const TO_V2_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000007",
  releaseKey: "s8-v2-to-too-two", familyKey: "TO_TOO_TWO" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_TO_DETERMINISTIC_V2",
  registryVersion: "WHOLE_WRITING_CONTEXT_TO_REGISTRY_V2",
  corpusVersion: "WHOLE_WRITING_CONTEXT_CORPUS_V1",
  members: ["to", "too", "two"], supportedConstructions: ["preposition", "infinitive", "additive", "degree", "numeral"],
  supportedScope: [
    "subject plus finite motion verb, destination preposition and complete destination noun phrase",
    "subject plus finite want/need, infinitive and enumerated verb phrase",
    "complete subject plus finite want/need and determiner-led object plus terminal additive",
    "subject plus finite copula, degree modifier and complete adjective predicate",
    "subject plus finite possession, numeral and explicit plural count noun phrase",
  ],
  exclusions: ["fragment", "unresolved_lexical_category", "quoted_or_reported_intent", "unsupported_clause_structure", "ambiguous_adjective_or_infinitive_fast"],
  sourceFingerprints: YOUR_TO_V2_SOURCE_PINS.to,
  syntaxDependency: "context-your-to-syntax-v2.ts",
});
export const TO_V2_MANIFEST_FINGERPRINT = fingerprint(TO_V2_MANIFEST);
export type ToV2Decision = Omit<DeterministicContextDecision, "analyserVersion"> & { analyserVersion: string };
const motion = new Set(["walk", "walks", "walked", "go", "goes", "went", "travel", "travels", "travelled"]);
const desire = new Set(["want", "wants", "wanted", "need", "needs", "needed"]);
const possession = new Set(["have", "has", "had"]);
const destinations = new Set(["garden", "harbour", "house", "library", "museum", "park", "school", "station"]);
const infinitiveVerbs = new Set(["eat", "find", "finish", "help", "learn", "make", "play", "read", "run", "see", "walk", "write"]);

function objectWithComplement(words: string[], heads?: Set<string>, determiner: "required" | "excluded" = "required"): boolean {
  return words.some((_, i) => nounPhraseV2(words.slice(0, i + 1), determiner, heads) && complementV2(words.slice(i + 1)));
}

export function analyseToContextV2(input: ContextInputV2): ToV2Decision | null {
  const observedMember = normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16));
  if (!TO_V2_MANIFEST.members.includes(observedMember)) return null;
  const make = (status: ToV2Decision["status"], reasonCode: string, assessedScope = "bounded_family_context", alternativeMember: string | null = null): ToV2Decision => ({
    status, reasonCode, assessedScope, alternativeMember, observedMember,
    familyKey: TO_V2_MANIFEST.familyKey, analyserVersion: TO_V2_MANIFEST.analyserVersion,
    ruleId: `${TO_V2_MANIFEST.analyserVersion}:${reasonCode}`, manifestFingerprint: TO_V2_MANIFEST_FINGERPRINT,
  });
  const clause = contextClauseV2(input);
  if (clause.reason !== null) return make("UNCERTAIN", clause.reason);
  const { tokens, focus } = clause;
  const preceding = tokens.slice(0, focus); const following = tokens.slice(focus + 1).map((t) => t.word);
  const verb = preceding.at(-1)?.word ?? "";
  const subject = subjectV2(preceding.slice(0, -1));
  const fits: Array<{ member: string; scope: string }> = [];
  if (subject && motion.has(verb) && objectWithComplement(following, destinations)) fits.push({ member: "to", scope: "preposition" });
  if (subject && desire.has(verb) && infinitiveVerbs.has(following[0]) &&
    (complementV2(following.slice(1)) || objectWithComplement(following.slice(1)))) fits.push({ member: "to", scope: "infinitive" });
  if (subject && COPULAS_V2.has(verb) && ADJECTIVES_V2.has(following[0]) && complementV2(following.slice(1))) fits.push({ member: "too", scope: "degree" });
  if (subject && possession.has(verb) && objectWithComplement(following, PLURAL_NOUNS_V2, "excluded")) fits.push({ member: "two", scope: "numeral" });
  if (following.length === 0) {
    for (let i = 1; i < preceding.length - 1; i += 1) {
      if (desire.has(preceding[i].word) && subjectV2(preceding.slice(0, i)) && nounPhraseV2(preceding.slice(i + 1).map((t) => t.word), "required")) fits.push({ member: "too", scope: "additive" });
    }
  }
  if (fits.length !== 1) return make("UNCERTAIN", fits.length ? "COMPETING_CONSTRUCTIONS" : "UNSUPPORTED_CLAUSE_STRUCTURE");
  const selected = fits[0];
  // Copular "to fast" can be a scheduled infinitive, not an intensifier error.
  // With "two fast", both to and too remain possible. Do not infer intent from
  // the corpus's adjective slot or discard this case from its recall denominator.
  if (selected.scope === "degree" && following[0] === "fast" && observedMember !== "too") return make("UNCERTAIN", "AMBIGUOUS_ADJECTIVE_OR_INFINITIVE", "degree");
  return make(observedMember === selected.member ? "VALID" : "INVALID", observedMember === selected.member ? "SUPPORTED_FAMILY_USE" : "UNIQUE_FAMILY_SUBSTITUTION", selected.scope, observedMember === selected.member ? null : selected.member);
}
