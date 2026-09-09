import { fingerprint } from "../baseline/source";
import { CONTEXT_V3_LEXICON, CONTEXT_V3_LEXICON_FINGERPRINT, CONTEXT_V3_LEXICON_VERSION, isLikelyNoun, isLikelyPluralNoun } from "./context-lexicon-v3";
import { CONTEXT_V3_SOURCE_PINS } from "./context-source-pins-v3";
import { CONTEXT_V3_SYNTAX_FINGERPRINT, CONTEXT_V3_SYNTAX_VERSION, type ContextInputV3, type ParsedContextV3 } from "./context-syntax-v3";
import { analyseFamilyContextV3Detailed, publicDecisionV3, type ContextCandidateV3 } from "./context-family-v3";

const sourceFingerprints = { ...CONTEXT_V3_SOURCE_PINS.shared, ...CONTEXT_V3_SOURCE_PINS.TO_TOO_TWO };
export const TO_V3_MANIFEST = Object.freeze({
  releaseId: "81000000-0000-4000-8000-000000000011",
  releaseKey: "s8-v3-to-too-two",
  familyKey: "TO_TOO_TWO" as const,
  analyserVersion: "WHOLE_WRITING_CONTEXT_TO_DETERMINISTIC_V3",
  registryVersion: "WHOLE_WRITING_CONTEXT_TO_REGISTRY_V3",
  corpusVersion: "WHOLE_WRITING_CONTEXT_ORDINARY_PROSE_CORPUS_V3_PENDING_HUMAN_HOLDOUT",
  members: ["to", "too", "two"],
  supportedConstructions: ["preposition", "infinitive", "additive", "degree", "numeral"],
  supportedSubtypes: ["destination_or_recipient_preposition", "governed_infinitive", "clause_additive", "adjective_or_manner_degree", "ordinary_count_numeral"],
  supportedScope: ["bounded verb, adjective, adverb, prepositional and noun phrases in ordinary learner prose"],
  exclusions: ["fragment", "quoted_or_reported_intent", "run_on", "task_dependent", "unresolved_lexical_category", "ambiguous_adjective_or_infinitive", "resource_limit"],
  syntaxVersion: CONTEXT_V3_SYNTAX_VERSION,
  syntaxFingerprint: CONTEXT_V3_SYNTAX_FINGERPRINT,
  lexiconVersion: CONTEXT_V3_LEXICON_VERSION,
  lexiconFingerprint: CONTEXT_V3_LEXICON_FINGERPRINT,
  sourceFingerprints,
});
export const TO_V3_MANIFEST_FINGERPRINT = fingerprint(TO_V3_MANIFEST);

function nextIsNounPhrase(words: ParsedContextV3["words"], index: number) {
  let cursor = index;
  const hasDeterminer = CONTEXT_V3_LEXICON.determinerSet.has(words[cursor]?.word ?? "");
  if (hasDeterminer) cursor += 1;
  while (CONTEXT_V3_LEXICON.adjectiveSet.has(words[cursor]?.word ?? "")) cursor += 1;
  const head = words[cursor];
  if (!head || !isLikelyNoun(head.word)) return false;
  const barePlaceOrInstitution = new Set(["bed", "church", "college", "garden", "harbour", "home", "hospital", "library", "museum", "park", "school", "station", "town", "university", "work"]);
  const properName = /^\p{Lu}/u.test(head.surface);
  return hasDeterminer || properName || barePlaceOrInstitution.has(head.word);
}

function evaluate(context: ParsedContextV3) {
  const { words, focus } = context;
  const before = words.slice(0, focus);
  const after = words.slice(focus + 1);
  const previous = before.at(-1)?.word ?? "";
  const next = after[0]?.word ?? "";
  const candidates: ContextCandidateV3[] = [];
  const directionalManner = CONTEXT_V3_LEXICON.degreeSet.has(next) &&
    [...before].reverse().slice(0, 2).some((token) => CONTEXT_V3_LEXICON.movementVerbSet.has(token.word) || CONTEXT_V3_LEXICON.presentParticipleSet.has(token.word)) &&
    after.slice(1).some((token) => ["along", "around", "down", "through", "up"].includes(token.word) || CONTEXT_V3_LEXICON.prepositionSet.has(token.word));

  if (nextIsNounPhrase(words, focus + 1) || CONTEXT_V3_LEXICON.pronounSet.has(next)) {
    candidates.push({ member: "to", scope: "preposition:destination_or_recipient", witness: [previous, next] });
  }
  if (CONTEXT_V3_LEXICON.baseVerbSet.has(next) && previous !== "from" && !directionalManner) {
    const governed = before.length > 0 && (
      CONTEXT_V3_LEXICON.finiteVerbSet.has(previous) ||
      CONTEXT_V3_LEXICON.presentParticipleSet.has(previous) ||
      CONTEXT_V3_LEXICON.pastParticipleSet.has(previous) ||
      ["able", "allowed", "about", "going", "have", "need", "needs", "needed", "ought", "ready", "supposed", "try", "tried", "want", "wants", "wanted"].includes(previous)
    );
    if (governed) candidates.push({ member: "to", scope: "infinitive:governed_verb_phrase", witness: [previous, next] });
  }

  const numeralHead = after[0]?.word ?? "";
  if (CONTEXT_V3_LEXICON.timeAndMeasureNounSet.has(numeralHead) || isLikelyPluralNoun(numeralHead)) {
    candidates.push({ member: "two", scope: "numeral:count_noun_phrase", witness: [numeralHead] });
  }

  if (after.length === 0 && before.length >= 2) {
    candidates.push({ member: "too", scope: "additive:clause_terminal", witness: [previous, "clause_end"] });
  }

  if (CONTEXT_V3_LEXICON.degreeSet.has(next) || CONTEXT_V3_LEXICON.adjectiveSet.has(next)) {
    const copular = [...before].reverse().slice(0, 3).some((token) => CONTEXT_V3_LEXICON.copulaSet.has(token.word));
    const manner = directionalManner;
    if (copular || manner) candidates.push({ member: "too", scope: manner ? "degree:manner_adverb" : "degree:adjective", witness: [previous, next] });
  }

  // Preserve the governed V2 ambiguity where a copular clause permits both a
  // degree reading and a scheduled infinitive with the verb "fast".
  if (next === "fast" && candidates.some((candidate) => candidate.scope === "degree:adjective") && !candidates.some((candidate) => candidate.scope.startsWith("infinitive"))) {
    return { candidates: [], blockedReason: "AMBIGUOUS_ADJECTIVE_OR_INFINITIVE", rejectedAlternatives: ["to", "too", "two"] };
  }
  const admitted = new Set(candidates.map((candidate) => candidate.member));
  return { candidates, rejectedAlternatives: TO_V3_MANIFEST.members.filter((member) => !admitted.has(member)) };
}

export function analyseToContextV3Detailed(input: ContextInputV3) {
  return analyseFamilyContextV3Detailed(input, TO_V3_MANIFEST, TO_V3_MANIFEST_FINGERPRINT, evaluate);
}
export function analyseToContextV3(input: ContextInputV3) {
  return publicDecisionV3(analyseToContextV3Detailed(input));
}
