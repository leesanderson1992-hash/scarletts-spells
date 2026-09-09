import { fingerprint } from "../baseline/source";
import { CONTEXT_V3_LEXICON, CONTEXT_V3_LEXICON_FINGERPRINT, CONTEXT_V3_LEXICON_VERSION } from "./context-lexicon-v3";
import { CONTEXT_V3_SOURCE_PINS } from "./context-source-pins-v3";
import { CONTEXT_V3_SYNTAX_FINGERPRINT, CONTEXT_V3_SYNTAX_VERSION, hasFinitePredicate, isCompleteNounHead, type ContextInputV3, type ParsedContextV3 } from "./context-syntax-v3";
import { analyseFamilyContextV3Detailed, publicDecisionV3, type ContextCandidateV3 } from "./context-family-v3";

const sourceFingerprints = { ...CONTEXT_V3_SOURCE_PINS.shared, ...CONTEXT_V3_SOURCE_PINS.ITS_ITS };
export const ITS_V3_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000012",
  releaseKey: "s8-v3-its-its",
  familyKey: "ITS_ITS" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_ITS_DETERMINISTIC_V3",
  registryVersion: "WHOLE_WRITING_CONTEXT_ITS_REGISTRY_V3",
  corpusVersion: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_CORPUS_V3_PENDING_HUMAN_HOLDOUT",
  members: ["its", "it's"],
  supportedConstructions: ["possessive", "it_is_contraction", "it_has_contraction"],
  supportedSubtypes: ["possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_contraction", "perfect_contraction"],
  supportedScope: ["bounded matrix, coordinated and subordinate clauses in ordinary learner prose"],
  exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent", "run_on", "task_dependent", "unresolved_attachment", "resource_limit"],
  syntaxVersion: CONTEXT_V3_SYNTAX_VERSION,
  syntaxFingerprint: CONTEXT_V3_SYNTAX_FINGERPRINT,
  lexiconVersion: CONTEXT_V3_LEXICON_VERSION,
  lexiconFingerprint: CONTEXT_V3_LEXICON_FINGERPRINT,
  sourceFingerprints,
});
export const ITS_V3_MANIFEST_FINGERPRINT = fingerprint(ITS_V3_MANIFEST);

function evaluate(context: ParsedContextV3) {
  const { words, focus } = context;
  const after = words.slice(focus + 1);
  const next = after[0]?.word ?? "";
  const candidates: ContextCandidateV3[] = [];
  const laterFinite = hasFinitePredicate(after, 1);

  if (isCompleteNounHead(words, focus + 1)) {
    candidates.push({ member: "its", scope: "possessive:noun_phrase", witness: [next] });
  } else if (CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && laterFinite) {
    candidates.push({ member: "its", scope: "possessive:gerund_with_matrix_predicate", witness: [next] });
  }

  let predicateIndex = 0;
  while (["already", "quite", "really", "so", "very"].includes(after[predicateIndex]?.word ?? "")) predicateIndex += 1;
  const predicate = after[predicateIndex]?.word ?? "";
  const contraction = CONTEXT_V3_LEXICON.adjectiveSet.has(predicate) || CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) || CONTEXT_V3_LEXICON.pastParticipleSet.has(predicate) || predicate === "been";
  if (contraction && !(CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) && laterFinite)) {
    const perfect = predicate === "been" || (CONTEXT_V3_LEXICON.pastParticipleSet.has(predicate) && after[predicateIndex + 1]?.word !== "by");
    const subtype = perfect ? "it_has_contraction:perfect" : CONTEXT_V3_LEXICON.presentParticipleSet.has(predicate) ? "it_is_contraction:progressive" : CONTEXT_V3_LEXICON.pastParticipleSet.has(predicate) ? "it_is_contraction:passive" : "it_is_contraction:adjectival";
    candidates.push({ member: "it's", scope: subtype, witness: [predicate] });
  }

  const unresolvedGerund = CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && !laterFinite && after.length === 1;
  const admitted = new Set(candidates.map((candidate) => candidate.member));
  return {
    candidates,
    blockedReason: unresolvedGerund ? "AMBIGUOUS_POSSESSIVE_GERUND_OR_CONTRACTION" : undefined,
    rejectedAlternatives: ITS_V3_MANIFEST.members.filter((member) => !admitted.has(member)),
  };
}

export function analyseItsContextV3Detailed(input: ContextInputV3) {
  return analyseFamilyContextV3Detailed(input, ITS_V3_MANIFEST, ITS_V3_MANIFEST_FINGERPRINT, evaluate);
}
export function analyseItsContextV3(input: ContextInputV3) {
  return publicDecisionV3(analyseItsContextV3Detailed(input));
}
