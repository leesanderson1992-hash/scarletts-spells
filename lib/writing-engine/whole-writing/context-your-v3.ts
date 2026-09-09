import { fingerprint } from "../baseline/source";
import { CONTEXT_V3_LEXICON, CONTEXT_V3_LEXICON_FINGERPRINT, CONTEXT_V3_LEXICON_VERSION } from "./context-lexicon-v3";
import { CONTEXT_V3_SOURCE_PINS } from "./context-source-pins-v3";
import { CONTEXT_V3_SYNTAX_FINGERPRINT, CONTEXT_V3_SYNTAX_VERSION, hasFinitePredicate, isCompleteNounHead, type ContextInputV3, type ParsedContextV3 } from "./context-syntax-v3";
import { analyseFamilyContextV3Detailed, publicDecisionV3, type ContextCandidateV3 } from "./context-family-v3";

const sourceFingerprints = { ...CONTEXT_V3_SOURCE_PINS.shared, ...CONTEXT_V3_SOURCE_PINS.YOUR_YOURE };
export const YOUR_V3_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000010",
  releaseKey: "s8-v3-your-youre",
  familyKey: "YOUR_YOURE" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_YOUR_DETERMINISTIC_V3",
  registryVersion: "WHOLE_WRITING_CONTEXT_YOUR_REGISTRY_V3",
  corpusVersion: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_CORPUS_V3_PENDING_HUMAN_HOLDOUT",
  members: ["your", "you're"],
  supportedConstructions: ["possessive", "you_are_contraction"],
  supportedSubtypes: ["possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_or_conventional_contraction"],
  supportedScope: ["bounded matrix, coordinated and subordinate clauses in ordinary learner prose"],
  exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent", "run_on", "task_dependent", "unresolved_attachment", "resource_limit"],
  syntaxVersion: CONTEXT_V3_SYNTAX_VERSION,
  syntaxFingerprint: CONTEXT_V3_SYNTAX_FINGERPRINT,
  lexiconVersion: CONTEXT_V3_LEXICON_VERSION,
  lexiconFingerprint: CONTEXT_V3_LEXICON_FINGERPRINT,
  sourceFingerprints,
});
export const YOUR_V3_MANIFEST_FINGERPRINT = fingerprint(YOUR_V3_MANIFEST);

function evaluate(context: ParsedContextV3) {
  const { words, focus } = context;
  const after = words.slice(focus + 1);
  const next = after[0]?.word ?? "";
  const candidates: ContextCandidateV3[] = [];
  const laterFinite = hasFinitePredicate(after, 1);

  if (isCompleteNounHead(words, focus + 1)) {
    candidates.push({ member: "your", scope: "possessive:noun_phrase", witness: [next] });
  } else if (CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && laterFinite) {
    candidates.push({ member: "your", scope: "possessive:gerund_with_matrix_predicate", witness: [next] });
  }

  let predicateIndex = 0;
  while (["already", "quite", "really", "so", "very"].includes(after[predicateIndex]?.word ?? "")) predicateIndex += 1;
  const predicate = after[predicateIndex]?.word ?? "";
  const contraction = CONTEXT_V3_LEXICON.adjectiveSet.has(predicate) || CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) || CONTEXT_V3_LEXICON.pastParticipleSet.has(predicate) || predicate === "been";
  if (contraction && !(CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) && laterFinite)) {
    const subtype = predicate === "supposed" ? "passive_or_conventional" : CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) ? "progressive" : CONTEXT_V3_LEXICON.pastParticipleSet.has(predicate) ? "passive" : "adjectival";
    candidates.push({ member: "you're", scope: `you_are_contraction:${subtype}`, witness: [predicate] });
  }

  const unresolvedGerund = CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && !laterFinite && after.length === 1;
  const admitted = new Set(candidates.map((candidate) => candidate.member));
  return {
    candidates,
    blockedReason: unresolvedGerund ? "AMBIGUOUS_POSSESSIVE_GERUND_OR_CONTRACTION" : undefined,
    rejectedAlternatives: YOUR_V3_MANIFEST.members.filter((member) => !admitted.has(member)),
  };
}

export function analyseYourContextV3Detailed(input: ContextInputV3) {
  return analyseFamilyContextV3Detailed(input, YOUR_V3_MANIFEST, YOUR_V3_MANIFEST_FINGERPRINT, evaluate);
}
export function analyseYourContextV3(input: ContextInputV3) {
  return publicDecisionV3(analyseYourContextV3Detailed(input));
}
