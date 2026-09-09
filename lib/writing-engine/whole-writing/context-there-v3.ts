import { fingerprint } from "../baseline/source";
import { CONTEXT_V3_LEXICON, CONTEXT_V3_LEXICON_FINGERPRINT, CONTEXT_V3_LEXICON_VERSION } from "./context-lexicon-v3";
import { CONTEXT_V3_SOURCE_PINS } from "./context-source-pins-v3";
import { CONTEXT_V3_SYNTAX_FINGERPRINT, CONTEXT_V3_SYNTAX_VERSION, hasFinitePredicate, isCompleteNounHead, type ContextInputV3, type ParsedContextV3 } from "./context-syntax-v3";
import { analyseFamilyContextV3Detailed, publicDecisionV3, type ContextCandidateV3 } from "./context-family-v3";

const sourceFingerprints = { ...CONTEXT_V3_SOURCE_PINS.shared, ...CONTEXT_V3_SOURCE_PINS.THERE_THEIR_THEYRE };
export const THERE_V3_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000009",
  releaseKey: "s8-v3-there-their-theyre",
  familyKey: "THERE_THEIR_THEYRE" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_THERE_DETERMINISTIC_V3",
  registryVersion: "WHOLE_WRITING_CONTEXT_THERE_REGISTRY_V3",
  corpusVersion: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_CORPUS_V3_PENDING_HUMAN_HOLDOUT",
  members: ["there", "their", "they're"],
  supportedConstructions: ["existential", "locative", "possessive", "they_are_contraction"],
  supportedSubtypes: ["embedded_existential", "adverbial_locative", "possessive_subject_or_object", "progressive_contraction", "adjectival_contraction", "passive_contraction"],
  supportedScope: ["bounded matrix, coordinated, subordinate and declarative-complement clauses in ordinary learner prose"],
  exclusions: ["ambiguous_gerund", "fragment", "quoted_or_reported_intent", "run_on", "task_dependent", "unresolved_attachment", "resource_limit"],
  syntaxVersion: CONTEXT_V3_SYNTAX_VERSION,
  syntaxFingerprint: CONTEXT_V3_SYNTAX_FINGERPRINT,
  lexiconVersion: CONTEXT_V3_LEXICON_VERSION,
  lexiconFingerprint: CONTEXT_V3_LEXICON_FINGERPRINT,
  sourceFingerprints,
});
export const THERE_V3_MANIFEST_FINGERPRINT = fingerprint(THERE_V3_MANIFEST);

function evaluate(context: ParsedContextV3) {
  const { words, focus } = context;
  const before = words.slice(0, focus);
  const after = words.slice(focus + 1);
  const next = after[0]?.word ?? "";
  const previous = before.at(-1)?.word ?? "";
  const candidates: ContextCandidateV3[] = [];

  if (["is", "are", "was", "were", "has", "have"].includes(next) && after.length >= 2) {
    candidates.push({ member: "there", scope: "existential:embedded_or_matrix", witness: [next, after[1].word] });
  }
  if ((["over", "from", "near", "by", "down", "up", "around"].includes(previous) ||
      [...before].reverse().slice(0, 3).some((token) => CONTEXT_V3_LEXICON.movementVerbSet.has(token.word) || CONTEXT_V3_LEXICON.placementVerbSet.has(token.word))) &&
      !isCompleteNounHead(words, focus + 1)) {
    candidates.push({ member: "there", scope: "locative:adverbial", witness: [previous || "clause", "there"] });
  }

  const laterFinite = hasFinitePredicate(after, 1);
  if (isCompleteNounHead(words, focus + 1)) {
    candidates.push({ member: "their", scope: "possessive:noun_phrase", witness: [next] });
  } else if (CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && laterFinite) {
    candidates.push({ member: "their", scope: "possessive:gerund_with_matrix_predicate", witness: [next] });
  }

  const contractionPredicate = CONTEXT_V3_LEXICON.adjectiveSet.has(next) || CONTEXT_V3_LEXICON.presentParticipleSet.has(next) || CONTEXT_V3_LEXICON.pastParticipleSet.has(next) || next === "been";
  if (contractionPredicate && !(CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && laterFinite)) {
    const subtype = CONTEXT_V3_LEXICON.presentParticipleSet.has(next) ? "progressive" : CONTEXT_V3_LEXICON.pastParticipleSet.has(next) ? "passive" : "adjectival";
    candidates.push({ member: "they're", scope: `they_are_contraction:${subtype}`, witness: [next] });
  }

  const unresolvedGerund = CONTEXT_V3_LEXICON.presentParticipleSet.has(next) && !laterFinite && after.length === 1;
  return {
    candidates,
    blockedReason: unresolvedGerund ? "AMBIGUOUS_POSSESSIVE_GERUND_OR_CONTRACTION" : undefined,
    rejectedAlternatives: manifestAlternatives(candidates),
  };
}

function manifestAlternatives(candidates: readonly ContextCandidateV3[]) {
  const admitted = new Set(candidates.map((candidate) => candidate.member));
  return THERE_V3_MANIFEST.members.filter((member) => !admitted.has(member));
}

export function analyseThereContextV3Detailed(input: ContextInputV3) {
  return analyseFamilyContextV3Detailed(input, THERE_V3_MANIFEST, THERE_V3_MANIFEST_FINGERPRINT, evaluate);
}
export function analyseThereContextV3(input: ContextInputV3) {
  return publicDecisionV3(analyseThereContextV3Detailed(input));
}
