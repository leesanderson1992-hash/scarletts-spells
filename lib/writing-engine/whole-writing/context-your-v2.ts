import { YOUR_TO_V2_SOURCE_PINS } from "./context-your-to-source-pins-v2";
import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type DeterministicContextDecision } from "./context";
import { ADJECTIVES_V2, COPULAS_V2, adjectivePredicateV2, contextClauseV2, nounPhraseV2, type ContextInputV2 } from "./context-your-to-syntax-v2";

export const YOUR_V2_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000006",
  releaseKey: "s8-v2-your-youre", familyKey: "YOUR_YOURE" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_YOUR_DETERMINISTIC_V2",
  registryVersion: "WHOLE_WRITING_CONTEXT_YOUR_REGISTRY_V2",
  corpusVersion: "WHOLE_WRITING_CONTEXT_CORPUS_V1",
  members: ["your", "you're"], supportedConstructions: ["possessive", "you_are_contraction"],
  supportedScope: [
    "clause-initial possessive noun phrase plus finite copula and complete adjective predicate",
    "clause-initial you-are plus adjective, enough and a complete enumerated infinitive phrase",
  ],
  exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent", "unsupported_clause_structure"],
  sourceFingerprints: YOUR_TO_V2_SOURCE_PINS.your,
  syntaxDependency: "context-your-to-syntax-v2.ts",
});
export const YOUR_V2_MANIFEST_FINGERPRINT = fingerprint(YOUR_V2_MANIFEST);
export type YourV2Decision = Omit<DeterministicContextDecision, "analyserVersion"> & { analyserVersion: string };
const intransitive = new Set(["help", "read", "write", "eat", "play", "walk", "run", "learn"]);
const transitive = new Set(["explain", "finish", "make", "find", "read", "write", "take", "see"]);

export function analyseYourContextV2(input: ContextInputV2): YourV2Decision | null {
  const observedMember = normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16));
  if (!YOUR_V2_MANIFEST.members.includes(observedMember)) return null;
  const make = (status: YourV2Decision["status"], reasonCode: string, assessedScope = "bounded_family_context", alternativeMember: string | null = null): YourV2Decision => ({
    status, reasonCode, assessedScope, alternativeMember, observedMember,
    familyKey: YOUR_V2_MANIFEST.familyKey, analyserVersion: YOUR_V2_MANIFEST.analyserVersion,
    ruleId: `${YOUR_V2_MANIFEST.analyserVersion}:${reasonCode}`, manifestFingerprint: YOUR_V2_MANIFEST_FINGERPRINT,
  });
  const clause = contextClauseV2(input);
  if (clause.reason !== null) return make("UNCERTAIN", clause.reason);
  if (clause.focus !== 0) return make("UNCERTAIN", "UNSUPPORTED_CLAUSE_STRUCTURE");
  const words = clause.tokens.slice(1).map((t) => t.word);
  const fits: Array<{ member: string; scope: string }> = [];
  for (let i = 1; i < words.length; i += 1) {
    if (COPULAS_V2.has(words[i]) && nounPhraseV2(words.slice(0, i), "excluded") && adjectivePredicateV2(words.slice(i + 1))) fits.push({ member: "your", scope: "possessive" });
  }
  if (ADJECTIVES_V2.has(words[0]) && words[1] === "enough" && words[2] === "to" &&
    ((words.length === 4 && intransitive.has(words[3])) ||
      (transitive.has(words[3]) && nounPhraseV2(words.slice(4), "required")))) {
    fits.push({ member: "you're", scope: "you_are_contraction" });
  }
  if (fits.length !== 1) return make("UNCERTAIN", fits.length ? "COMPETING_CONSTRUCTIONS" : "UNSUPPORTED_CLAUSE_STRUCTURE");
  const selected = fits[0];
  return make(observedMember === selected.member ? "VALID" : "INVALID", observedMember === selected.member ? "SUPPORTED_FAMILY_USE" : "UNIQUE_FAMILY_SUBSTITUTION", selected.scope, observedMember === selected.member ? null : selected.member);
}
