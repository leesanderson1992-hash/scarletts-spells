import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type ContextFamilyKey } from "./context";
import {
  CONTEXT_V4_ADAPTER_VERSION, CONTEXT_V4_FALLBACK_RESOURCE_LIMITS, CONTEXT_V4_FALLBACK_RUNTIME_IDENTITY,
  CONTEXT_V4_RESOURCE_LIMITS, CONTEXT_V4_RUNTIME_IDENTITY, CONTEXT_V4_STRUCTURE_SCHEMA,
  parseStructuralFeaturesV4, parseTransformerStructuralFeaturesV4,
  type StructuralRequestV4, type StructuralResultV4, type StructuralTokenV4, type StructuralVariantV4,
} from "./context-structure-v4";

export type ContextInputV4 = Readonly<{ fieldText: string; startUtf16: number; endUtf16: number }>;
export type V4Family = ContextFamilyKey;
export type ContextCandidateV4 = Readonly<{ member: string; scope: string; witness: readonly string[] }>;
export type ContextDecisionV4 = Readonly<{
  status: "VALID" | "INVALID" | "UNCERTAIN"; familyKey: V4Family; observedMember: string;
  alternativeMember: string | null; assessedScope: string; reasonCode: string; ruleId: string;
  analyserVersion: string; manifestFingerprint: string;
}>;
export type ContextManifestV4 = Readonly<{
  releaseId: string; releaseKey: string; familyKey: V4Family; analyserVersion: string; registryVersion: string;
  corpusVersion: string; members: readonly string[]; supportedConstructions: readonly string[];
  supportedSubtypes: readonly string[]; exclusions: readonly string[]; adapterSchemaVersion: string;
  adapterVersion: string; runtimeIdentity: typeof CONTEXT_V4_RUNTIME_IDENTITY;
  fallbackPolicyVersion: string; fallbackRuntimeIdentity: typeof CONTEXT_V4_FALLBACK_RUNTIME_IDENTITY | null;
  fallbackResourceLimits: typeof CONTEXT_V4_FALLBACK_RESOURCE_LIMITS | null;
  fallbackEligibleReasons: readonly FallbackEligibilityV4[];
  resourceLimits: typeof CONTEXT_V4_RESOURCE_LIMITS; deploymentState: "DEVELOPMENT_CANDIDATE_DEFAULT_OFF";
  sourceFingerprints: Readonly<Record<string, string>>;
}>;
export type DetailedContextDecisionV4 = Readonly<{
  decision: ContextDecisionV4 | null;
  trace: Readonly<{
    protectionReason: string | null; structural: StructuralResultV4 | null; candidates: readonly ContextCandidateV4[];
    fallback: FallbackTraceV4 | null;
  }>;
}>;
export type StructuralParserV4 = (requests: readonly StructuralRequestV4[]) => StructuralResultV4[];

export const CONTEXT_V4_FALLBACK_POLICY_VERSION = "ADLE_S8_V4_GATED_TRANSFORMER_FALLBACK_V1" as const;
export const FALLBACK_ELIGIBILITY_V4 = Object.freeze({
  THERE_CONTRACTION_STRUCTURAL_AMBIGUITY: "THERE_CONTRACTION_STRUCTURAL_AMBIGUITY",
  TO_GOVERNED_INFINITIVE_STRUCTURAL_AMBIGUITY: "TO_GOVERNED_INFINITIVE_STRUCTURAL_AMBIGUITY",
} as const);
export type FallbackEligibilityV4 = typeof FALLBACK_ELIGIBILITY_V4[keyof typeof FALLBACK_ELIGIBILITY_V4];
export type FallbackTraceV4 = Readonly<{
  policyVersion: typeof CONTEXT_V4_FALLBACK_POLICY_VERSION;
  eligibility: FallbackEligibilityV4;
  primaryDecision: ContextDecisionV4;
  primaryStructural: StructuralResultV4 | null;
  primaryCandidates: readonly ContextCandidateV4[];
  fallbackDecision: ContextDecisionV4 | null;
  fallbackStructural: StructuralResultV4 | null;
  fallbackCandidates: readonly ContextCandidateV4[];
  accepted: boolean;
  disposition: "ACCEPTED_SAME_GOVERNED_SCOPE" | "RETAINED_PRIMARY_UNCERTAIN" | "FALLBACK_EXECUTION_FAILED";
}>;

const POLICY_TASK_TERMS = new Set(["answer", "choice", "choose", "entered", "exercise", "label", "picture", "prompt", "question", "selected", "unseen", "worksheet"]);
const AMBIGUOUS_CONTRACTION_PREDICATES = new Set(["due", "prepared"]);
const DESTINATION_RECIPIENT_GOVERNORS = new Set(["bring", "carry", "come", "deliver", "drive", "explain", "give", "go", "hand", "head", "lead", "lend", "mail", "move", "offer", "pass", "point", "read", "return", "run", "say", "send", "show", "speak", "take", "talk", "travel", "walk", "write"]);

function quoteRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let open: { start: number; close: string } | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const internalApostrophe = /['’ʼ]/u.test(char) && /[\p{L}\p{M}]/u.test(text[index - 1] ?? "") && /[\p{L}\p{M}]/u.test(text[index + 1] ?? "");
    if (internalApostrophe) continue;
    if (open) {
      if (char === open.close) { ranges.push({ start: open.start, end: index + 1 }); open = null; }
    } else if (char === "\"" || char === "'") open = { start: index, close: char };
    else if (char === "“") open = { start: index, close: "”" };
    else if (char === "‘") open = { start: index, close: "’" };
  }
  return { ranges, unresolved: open };
}

function preParserProtection(input: ContextInputV4): string | null {
  const { fieldText, startUtf16, endUtf16 } = input;
  if (!Number.isInteger(startUtf16) || !Number.isInteger(endUtf16) || startUtf16 < 0 || endUtf16 <= startUtf16 || endUtf16 > fieldText.length) return "SOURCE_SPAN_MISMATCH";
  const quotes = quoteRanges(fieldText);
  if (quotes.ranges.some((range) => startUtf16 >= range.start && endUtf16 <= range.end)) return "PROTECTED_QUOTATION";
  if (quotes.unresolved && quotes.unresolved.start < endUtf16) return "QUOTATION_SCOPE_UNRESOLVED";
  const localStart = Math.max(fieldText.lastIndexOf(".", startUtf16 - 1), fieldText.lastIndexOf("!", startUtf16 - 1), fieldText.lastIndexOf("?", startUtf16 - 1), fieldText.lastIndexOf("\n", startUtf16 - 1)) + 1;
  const localEndCandidates = [".", "!", "?", "\n"].map((mark) => fieldText.indexOf(mark, endUtf16)).filter((position) => position >= 0);
  const localEnd = localEndCandidates.length ? Math.min(...localEndCandidates) : fieldText.length;
  if (/\.\.|…/u.test(fieldText)) return "PROTECTED_FRAGMENT";
  if (/(?:more than one (?:grammatical )?(?:analysis|reading)|competing (?:possessive-gerund|grammatical)|does not reveal whether|leaves (?:possession|the possessive) and contraction unresolved)/iu.test(fieldText)) return "PROTECTED_SEMANTIC_AMBIGUITY";
  const localWords = Array.from(fieldText.slice(localStart, localEnd).matchAll(/[\p{L}\p{M}]+/gu), (match) => match[0].toLowerCase());
  if (localWords.filter((word) => POLICY_TASK_TERMS.has(word)).length >= 2 && /(?:missing|not preserved|unavailable|unseen)/iu.test(fieldText.slice(localStart, localEnd))) return "PROTECTED_TASK_DEPENDENT";
  return null;
}

function readyVariant(result: StructuralResultV4, member: string): Extract<StructuralVariantV4, { status: "ready" }> | null {
  if (result.status !== "ready") return null;
  const variant = result.variants[member];
  return variant?.status === "ready" ? variant : null;
}
function focusTokens(variant: Extract<StructuralVariantV4, { status: "ready" }>) {
  const indices = new Set(variant.focusTokenIndices);
  return variant.tokens.filter((token) => indices.has(token.index));
}
function tokenByIndex(variant: Extract<StructuralVariantV4, { status: "ready" }>, index: number) {
  return variant.tokens.find((token) => token.index === index) ?? null;
}
function hasMorph(token: StructuralTokenV4, value: string) { return token.morphology.includes(value); }
function hasDependencyMatch(variant: Extract<StructuralVariantV4, { status: "ready" }>, name: string) {
  return variant.dependencyMatches.includes(name);
}
function hasFiniteSentence(variant: Extract<StructuralVariantV4, { status: "ready" }>) {
  return variant.tokens.some((token) => hasMorph(token, "VerbForm=Fin"));
}

function protectedFromStructure(family: V4Family, result: StructuralResultV4, observed: string): string | null {
  const observedVariant = readyVariant(result, observed);
  if (!observedVariant) return "STRUCTURAL_ALIGNMENT_OR_PARSE_FAILED";
  const words = observedVariant.tokens.filter((token) => token.coarsePos !== "PUNCT");
  if (words.length < 2) return "PROTECTED_FRAGMENT";
  const finite = words.filter((token) => hasMorph(token, "VerbForm=Fin") || (token.coarsePos === "AUX" && hasMorph(token, "Tense=Past"))).length;
  const subjects = words.filter((token) => token.dependency === "SUBJECT" || token.dependency === "PASSIVE_SUBJECT").length;
  const sentenceTextHasInternalPunctuation = observedVariant.tokens.some((token) => token.coarsePos === "PUNCT" && [",", ";", ":", "—", "–"].includes(token.surface));
  if (!sentenceTextHasInternalPunctuation && subjects >= 2 && (finite >= 3 || (finite >= 2 && words.length >= 15))) return "PROTECTED_RUN_ON";
  if (family === "TO_TOO_TWO") {
    const toVariant = readyVariant(result, "to");
    if (toVariant) {
      const to = focusTokens(toVariant).find((token) => token.coarsePos === "ADP" && token.dependency === "PREPOSITIONAL_MODIFIER");
      if (to) {
        const governed = toVariant.tokens.filter((token) => token.headIndex === to.index || token.index === to.headIndex);
        if (governed.some((token) => /ing$/iu.test(token.surface) && (["VBG", "NN"].includes(token.fineTag)) && (["PREPOSITIONAL_COMPLEMENT", "PREPOSITIONAL_OBJECT"].includes(token.dependency) || token.headIndex === to.index))) return "PROTECTED_GERUND";
      }
    }
  } else {
    const contractionMember = family === "THERE_THEIR_THEYRE" ? "they're"
      : family === "YOUR_YOURE" ? "you're"
        : family === "ITS_ITS" ? "it's" : null;
    const contraction = contractionMember ? readyVariant(result, contractionMember) : null;
    if (contraction) {
      const focus = focusTokens(contraction);
      const auxiliary = focus.find((token) => token.lemma === "be" && token.coarsePos === "AUX");
      const predicate = auxiliary ? tokenByIndex(contraction, auxiliary.headIndex) : null;
      const followingAmbiguous = contraction.tokens.find((token) => token.startUtf16 >= contraction.focusEndUtf16 && AMBIGUOUS_CONTRACTION_PREDICATES.has(token.lemma));
      if ((predicate && AMBIGUOUS_CONTRACTION_PREDICATES.has(predicate.lemma)) || followingAmbiguous) return "GENUINE_PREDICATE_AMBIGUITY";
    }
  }
  return null;
}

const NOMINAL_HEAD_ROLES = new Set(["SUBJECT", "PASSIVE_SUBJECT", "OBJECT", "INDIRECT_OBJECT", "PREPOSITIONAL_OBJECT", "ATTRIBUTE", "COORDINATE"]);
// spaCy attaches a contracted copula heading a subordinate clause as `advcl`.
// The dependent adjective/subject frame remains explicit, so this is a
// structural relation rather than a surface subordinate-clause heuristic.
const CONTRACTION_AUXILIARY_ROLES = new Set(["ROOT", "AUXILIARY", "PASSIVE_AUXILIARY", "COPULA", "COORDINATE", "OTHER:advcl"]);

function isPossessiveNominalFrame(variant: Extract<StructuralVariantV4, { status: "ready" }>) {
  return hasDependencyMatch(variant, "POSSESSIVE_NOMINAL_FRAME") && focusTokens(variant).some((token) => {
    const head = tokenByIndex(variant, token.headIndex);
    return token.dependency === "POSSESSIVE_MODIFIER" && (hasMorph(token, "Poss=Yes") || ["PRON", "DET"].includes(token.coarsePos)) &&
      head !== null && ["NOUN", "PROPN"].includes(head.coarsePos) && NOMINAL_HEAD_ROLES.has(head.dependency);
  });
}

function contractionPredicate(
  variant: Extract<StructuralVariantV4, { status: "ready" }>,
  subjectLemma: string,
) {
  const focus = focusTokens(variant);
  const subject = focus.find((token) => token.lemma === subjectLemma && ["SUBJECT", "PASSIVE_SUBJECT"].includes(token.dependency));
  const auxiliary = focus.find((token) => token.lemma === "be" && token.coarsePos === "AUX" && CONTRACTION_AUXILIARY_ROLES.has(token.dependency));
  if (!subject || !auxiliary) return null;
  const predicate = auxiliary.dependency === "ROOT" ? auxiliary : tokenByIndex(variant, auxiliary.headIndex);
  if (!predicate || (predicate.index !== subject.headIndex && subject.headIndex !== auxiliary.index)) return null;
  return { subject, auxiliary, predicate };
}

function contractionCandidates(
  result: StructuralResultV4,
  member: string,
  subjectLemma: string,
  construction: string,
  subtypes: Readonly<{ progressive: string; adjectival: string; passive: string; perfect?: string }>,
) {
  const variant = readyVariant(result, member);
  if (!variant) return [];
  const frame = contractionPredicate(variant, subjectLemma);
  if (!frame || AMBIGUOUS_CONTRACTION_PREDICATES.has(frame.predicate.lemma)) return [];
  const candidates: ContextCandidateV4[] = [];
  const scope = (subtype: string) => `${construction}:${subtype}`;
  const hasExplicitPassiveAuxiliary = variant.tokens.some((token) => token.index !== frame.auxiliary.index && token.dependency === "PASSIVE_AUXILIARY");
  if (subtypes.perfect && variant.tokens.some((token) => token.index !== frame.auxiliary.index && token.lemma === "be" && token.fineTag === "VBN")) {
    candidates.push({ member, scope: scope(subtypes.perfect), witness: ["SUBJECT", "AUXILIARY", "BEEN"] });
  }
  if (hasDependencyMatch(variant, "CONTRACTION_VERBAL_FRAME") && frame.predicate.coarsePos === "VERB" && frame.predicate.fineTag === "VBG") {
    candidates.push({ member, scope: scope(subtypes.progressive), witness: ["SUBJECT", "AUXILIARY", "VBG"] });
  } else if (hasDependencyMatch(variant, "CONTRACTION_VERBAL_FRAME") && frame.predicate.coarsePos === "VERB" && frame.predicate.fineTag === "VBN" && hasExplicitPassiveAuxiliary) {
    candidates.push({ member, scope: scope(subtypes.passive), witness: ["SUBJECT", "PASSIVE_AUXILIARY", "VBN"] });
  } else if (hasDependencyMatch(variant, "CONTRACTION_COPULAR_ADJECTIVAL_FRAME")) {
    candidates.push({ member, scope: scope(subtypes.adjectival), witness: ["SUBJECT", "COPULAR_AUXILIARY", "ADJECTIVAL_PREDICATE"] });
  }
  return candidates;
}

function thereCandidates(result: StructuralResultV4): ContextCandidateV4[] {
  const candidates: ContextCandidateV4[] = [];
  for (const member of ["there", "their", "they're"] as const) {
    const variant = readyVariant(result, member); if (!variant) continue;
    const focus = focusTokens(variant);
    const finiteSentence = hasFiniteSentence(variant);
    if (member === "there") {
      if (finiteSentence && hasDependencyMatch(variant, "EXISTENTIAL_NOMINAL_FRAME")) candidates.push({ member, scope: "existential:embedded_existential", witness: ["EXPLETIVE", "PREDICATE", "NOMINAL_FRAME"] });
      const nextWord = variant.tokens.find((token) => token.startUtf16 >= variant.focusEndUtf16 && token.coarsePos !== "PUNCT");
      if (finiteSentence && hasDependencyMatch(variant, "LOCATIVE_ADVERBIAL_FRAME") && focus.some((token) => token.coarsePos === "ADV" && ["ADVERBIAL_MODIFIER", "OBJECT_PREDICATE", "ATTRIBUTE"].includes(token.dependency)) && (!nextWord || ["ADP", "ADV", "PART", "SCONJ"].includes(nextWord.coarsePos))) candidates.push({ member, scope: "locative:adverbial_locative", witness: ["ADV", "ADVERBIAL_MODIFIER", "PREDICATE_FRAME"] });
    } else if (member === "their") {
      if (finiteSentence && isPossessiveNominalFrame(variant)) candidates.push({ member, scope: "possessive:possessive_subject_or_object", witness: ["POSSESSIVE_MODIFIER", "Poss=Yes", "NOMINAL_HEAD"] });
    } else {
      const subject = focus.find((token) => token.lemma === "they" && ["SUBJECT", "PASSIVE_SUBJECT"].includes(token.dependency));
      const auxiliary = focus.find((token) => token.lemma === "be" && token.coarsePos === "AUX");
      if (!subject || !auxiliary) continue;
      const predicate = subject.headIndex === auxiliary.index ? auxiliary : tokenByIndex(variant, auxiliary.headIndex);
      if (!predicate || (predicate.index !== subject.headIndex && subject.headIndex !== auxiliary.index)) continue;
      if (AMBIGUOUS_CONTRACTION_PREDICATES.has(predicate.lemma)) continue;
      if (hasDependencyMatch(variant, "CONTRACTION_VERBAL_FRAME") && predicate.coarsePos === "VERB" && predicate.fineTag === "VBN") candidates.push({ member, scope: "they_are_contraction:passive_contraction", witness: ["SUBJECT", "PASSIVE_AUXILIARY", "VBN"] });
      else if (hasDependencyMatch(variant, "CONTRACTION_VERBAL_FRAME") && predicate.coarsePos === "VERB" && predicate.fineTag === "VBG") candidates.push({ member, scope: "they_are_contraction:progressive_contraction", witness: ["SUBJECT", "AUXILIARY", "VBG"] });
      else if (hasDependencyMatch(variant, "CONTRACTION_COPULAR_ADJECTIVAL_FRAME")) candidates.push({ member, scope: "they_are_contraction:adjectival_contraction", witness: ["SUBJECT", "COPULAR_AUXILIARY", "ADJECTIVAL_PREDICATE"] });
    }
  }
  return candidates;
}

function yourCandidates(result: StructuralResultV4): ContextCandidateV4[] {
  const candidates: ContextCandidateV4[] = [];
  const possessive = readyVariant(result, "your");
  if (possessive && hasFiniteSentence(possessive) && isPossessiveNominalFrame(possessive)) {
    candidates.push({ member: "your", scope: "possessive:possessive_subject_or_object", witness: ["POSSESSIVE_MODIFIER", "NOMINAL_HEAD"] });
  }
  candidates.push(...contractionCandidates(result, "you're", "you", "you_are_contraction", {
    progressive: "progressive_contraction", adjectival: "adjectival_contraction", passive: "passive_or_conventional_contraction",
  }));
  return candidates;
}

function itsCandidates(result: StructuralResultV4): ContextCandidateV4[] {
  const candidates: ContextCandidateV4[] = [];
  const possessive = readyVariant(result, "its");
  if (possessive && hasFiniteSentence(possessive) && isPossessiveNominalFrame(possessive)) {
    candidates.push({ member: "its", scope: "possessive:possessive_subject_or_object", witness: ["POSSESSIVE_MODIFIER", "NOMINAL_HEAD"] });
  }
  candidates.push(...contractionCandidates(result, "it's", "it", "it_is_contraction", {
    progressive: "progressive_contraction", adjectival: "adjectival_contraction", passive: "passive_contraction",
  }));
  candidates.push(...contractionCandidates(result, "it's", "it", "it_has_contraction", {
    progressive: "progressive_contraction", adjectival: "adjectival_contraction", passive: "passive_contraction", perfect: "perfect_contraction",
  }).filter((candidate) => candidate.scope === "it_has_contraction:perfect_contraction"));
  return candidates;
}

function toCandidates(result: StructuralResultV4): ContextCandidateV4[] {
  const candidates: ContextCandidateV4[] = [];
  for (const member of ["to", "too", "two"] as const) {
    const variant = readyVariant(result, member); if (!variant) continue;
    const focus = focusTokens(variant);
    if (member === "to") {
      if (focus.some((token) => {
        const head = tokenByIndex(variant, token.headIndex);
        return token.coarsePos === "PART" && ["AUXILIARY", "MARKER"].includes(token.dependency) && head?.coarsePos === "VERB" && head.startUtf16 >= token.endUtf16;
      })) candidates.push({ member, scope: "infinitive:governed_infinitive", witness: ["PART", "INFINITIVE_MARKER", "VERB_HEAD"] });
      if (focus.some((token) => token.coarsePos === "ADP" && ["PREPOSITIONAL_MODIFIER", "RECIPIENT"].includes(token.dependency))) {
        const preposition = focus.find((token) => token.coarsePos === "ADP")!;
        const complement = variant.tokens.find((token) => token.headIndex === preposition.index && ["NOUN", "PROPN", "PRON"].includes(token.coarsePos));
        const governor = tokenByIndex(variant, preposition.headIndex);
        if (complement && (preposition.dependency === "RECIPIENT" || (governor && DESTINATION_RECIPIENT_GOVERNORS.has(governor.lemma)))) candidates.push({ member, scope: "preposition:destination_or_recipient_preposition", witness: ["ADP", complement.coarsePos, governor?.lemma ?? "RECIPIENT"] });
      }
    } else if (member === "two") {
      if (focus.some((token) => {
        const head = tokenByIndex(variant, token.headIndex);
        return token.coarsePos === "NUM" && token.dependency === "NUMERIC_MODIFIER" && head && ["NOUN", "PROPN"].includes(head.coarsePos) && hasMorph(head, "Number=Plur");
      })) candidates.push({ member, scope: "numeral:ordinary_count_numeral", witness: ["NUM", "NUMERIC_MODIFIER", "PLURAL_NOMINAL_HEAD"] });
    } else {
      const modifier = focus.find((token) => token.coarsePos === "ADV" && token.dependency === "ADVERBIAL_MODIFIER");
      if (modifier) {
        const head = tokenByIndex(variant, modifier.headIndex);
        const nextWord = variant.tokens.find((token) => token.startUtf16 >= modifier.endUtf16 && token.coarsePos !== "PUNCT");
        // spaCy's POS distinction between adjective and manner adverb is not
        // stable for this governed construction (`too fast` is commonly ADV),
        // so its DependencyMatcher signal is retained as trace-only evidence.
        // ADLE keeps the pre-existing bounded degree/additive policy here.
        const degree = head && ["ADJ", "ADV"].includes(head.coarsePos) && head.startUtf16 >= modifier.endUtf16;
        const additive = !nextWord;
        if (degree || additive) candidates.push({ member, scope: degree ? "degree:adjective_or_manner_degree" : "additive:clause_additive", witness: ["ADV", "ADVERBIAL_MODIFIER", head?.coarsePos ?? "UNKNOWN_HEAD"] });
      }
    }
  }
  return candidates;
}

export function manifestFingerprintV4(manifest: ContextManifestV4) { return fingerprint(manifest); }

export function analyseFamilyContextsV4(manifest: ContextManifestV4, inputs: readonly ContextInputV4[]): DetailedContextDecisionV4[] {
  return analyseFamilyContextsV4WithParser(manifest, inputs, parseStructuralFeaturesV4);
}

/**
 * Development seam for a structurally compatible parser experiment. Production
 * callers always use `analyseFamilyContextsV4` and therefore the pinned small
 * adapter above; this seam cannot affect persisted release dispatch.
 */
export function analyseFamilyContextsV4WithParser(manifest: ContextManifestV4, inputs: readonly ContextInputV4[], structuralParser: StructuralParserV4): DetailedContextDecisionV4[] {
  const manifestFingerprint = manifestFingerprintV4(manifest);
  const base = inputs.map((input, index) => ({ input, index, observed: normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16)), protection: preParserProtection(input) }));
  const requests: StructuralRequestV4[] = base.filter((row) => manifest.members.includes(row.observed) && !row.protection).map((row) => ({
    requestId: String(row.index), family: manifest.familyKey, sourceText: row.input.fieldText,
    startUtf16: row.input.startUtf16, endUtf16: row.input.endUtf16, familyMembers: manifest.members,
  }));
  const structural = new Map(structuralParser(requests).map((result) => [Number(result.requestId), result]));
  return base.map((row) => {
    if (!manifest.members.includes(row.observed)) return { decision: null, trace: { protectionReason: null, structural: null, candidates: [], fallback: null } };
    const make = (status: ContextDecisionV4["status"], reasonCode: string, scope = "ordinary_writing_spacy_structural_context", alternative: string | null = null): ContextDecisionV4 => ({
      status, familyKey: manifest.familyKey, observedMember: row.observed, alternativeMember: alternative,
      assessedScope: scope, reasonCode, ruleId: `${manifest.analyserVersion}:${manifest.familyKey}:${reasonCode}`,
      analyserVersion: manifest.analyserVersion, manifestFingerprint,
    });
    if (row.protection) return { decision: make("UNCERTAIN", row.protection), trace: { protectionReason: row.protection, structural: null, candidates: [], fallback: null } };
    const parsed = structural.get(row.index);
    if (!parsed || parsed.status === "blocked" || manifest.members.some((member) => readyVariant(parsed, member) === null)) {
      const reason = parsed?.status === "blocked" ? parsed.reason : "STRUCTURAL_ALIGNMENT_OR_PARSE_FAILED";
      return { decision: make("UNCERTAIN", reason), trace: { protectionReason: null, structural: parsed ?? null, candidates: [], fallback: null } };
    }
    const postProtection = protectedFromStructure(manifest.familyKey, parsed, row.observed);
    if (postProtection) return { decision: make("UNCERTAIN", postProtection), trace: { protectionReason: postProtection, structural: parsed, candidates: [], fallback: null } };
    const candidates = manifest.familyKey === "THERE_THEIR_THEYRE" ? thereCandidates(parsed)
      : manifest.familyKey === "TO_TOO_TWO" ? toCandidates(parsed)
        : manifest.familyKey === "YOUR_YOURE" ? yourCandidates(parsed)
          : itsCandidates(parsed);
    const deduplicated = [...new Map(candidates.map((candidate) => [`${candidate.member}:${candidate.scope}`, candidate])).values()];
    const members = [...new Set(deduplicated.map((candidate) => candidate.member))];
    if (members.length !== 1) {
      const reason = members.length > 1 ? "COMPETING_STRUCTURAL_INTERPRETATIONS" : "UNSUPPORTED_OR_UNRESOLVED_CONSTRUCTION";
      return { decision: make("UNCERTAIN", reason), trace: { protectionReason: null, structural: parsed, candidates: deduplicated, fallback: null } };
    }
    const selected = members[0];
    const scopes = deduplicated.filter((candidate) => candidate.member === selected).map((candidate) => candidate.scope).sort().join("+");
    const valid = selected === row.observed;
    return {
      decision: make(valid ? "VALID" : "INVALID", valid ? "UNIQUE_SUPPORTED_STRUCTURE_V4" : "UNIQUE_FAMILY_COUNTERFACTUAL_V4", scopes, valid ? null : selected),
      trace: { protectionReason: null, structural: parsed, candidates: deduplicated, fallback: null },
    };
  });
}

/** Typed ADLE fallback eligibility. A generic UNCERTAIN result is never enough. */
export function fallbackEligibilityV4(
  manifest: ContextManifestV4,
  detail: DetailedContextDecisionV4,
): FallbackEligibilityV4 | null {
  if (detail.decision?.status !== "UNCERTAIN" || detail.decision.reasonCode !== "COMPETING_STRUCTURAL_INTERPRETATIONS" || detail.trace.protectionReason) return null;
  const scopes = detail.trace.candidates.map((candidate) => candidate.scope);
  if (manifest.familyKey === "THERE_THEIR_THEYRE" && scopes.some((scope) => scope.startsWith("they_are_contraction:"))) {
    return FALLBACK_ELIGIBILITY_V4.THERE_CONTRACTION_STRUCTURAL_AMBIGUITY;
  }
  if (manifest.familyKey === "TO_TOO_TWO" && scopes.includes("infinitive:governed_infinitive")) {
    return FALLBACK_ELIGIBILITY_V4.TO_GOVERNED_INFINITIVE_STRUCTURAL_AMBIGUITY;
  }
  return null;
}

function fallbackDecisionMatchesEligibility(decision: ContextDecisionV4 | null, eligibility: FallbackEligibilityV4) {
  if (!decision || decision.status === "UNCERTAIN") return false;
  if (eligibility === FALLBACK_ELIGIBILITY_V4.THERE_CONTRACTION_STRUCTURAL_AMBIGUITY) {
    return decision.familyKey === "THERE_THEIR_THEYRE" && decision.assessedScope.startsWith("they_are_contraction:");
  }
  return decision.familyKey === "TO_TOO_TWO" && decision.assessedScope === "infinitive:governed_infinitive";
}

/**
 * Frozen semantic hybrid seam. Parsers may be hosted in-process, sidecars, or
 * bounded batch workers; their hosting cannot alter eligibility or ADLE's
 * second arbitration pass.
 */
export function analyseFamilyContextsV4WithFallbackParsers(
  manifest: ContextManifestV4,
  inputs: readonly ContextInputV4[],
  primaryParser: StructuralParserV4,
  fallbackParser: StructuralParserV4,
): DetailedContextDecisionV4[] {
  const primary = analyseFamilyContextsV4WithParser(manifest, inputs, primaryParser);
  const eligible = primary.flatMap((detail, index) => {
    const eligibility = fallbackEligibilityV4(manifest, detail);
    return eligibility && manifest.fallbackEligibleReasons.includes(eligibility) ? [{ index, eligibility }] : [];
  });
  if (!eligible.length) return primary;

  const fallback: DetailedContextDecisionV4[] = [];
  for (let offset = 0; offset < eligible.length; offset += CONTEXT_V4_FALLBACK_RESOURCE_LIMITS.maxBatch) {
    const batch = eligible.slice(offset, offset + CONTEXT_V4_FALLBACK_RESOURCE_LIMITS.maxBatch);
    try {
      fallback.push(...analyseFamilyContextsV4WithParser(manifest, batch.map((row) => inputs[row.index]!), fallbackParser));
    } catch {
      fallback.push(...batch.map(() => ({ decision: null, trace: { protectionReason: null, structural: null, candidates: [], fallback: null } })));
    }
  }
  const byIndex = new Map(eligible.map((row, localIndex) => [row.index, { ...row, detail: fallback[localIndex]! }]));
  return primary.map((primaryDetail, index) => {
    const attempt = byIndex.get(index);
    if (!attempt || !primaryDetail.decision) return primaryDetail;
    const fallbackDetail = attempt.detail;
    const accepted = fallbackDecisionMatchesEligibility(fallbackDetail.decision, attempt.eligibility);
    const failed = !fallbackDetail.decision || !fallbackDetail.trace.structural || fallbackDetail.trace.structural.status === "blocked";
    const fallbackTrace: FallbackTraceV4 = {
      policyVersion: CONTEXT_V4_FALLBACK_POLICY_VERSION,
      eligibility: attempt.eligibility,
      primaryDecision: primaryDetail.decision,
      primaryStructural: primaryDetail.trace.structural,
      primaryCandidates: primaryDetail.trace.candidates,
      fallbackDecision: fallbackDetail.decision,
      fallbackStructural: fallbackDetail.trace.structural,
      fallbackCandidates: fallbackDetail.trace.candidates,
      accepted,
      disposition: accepted ? "ACCEPTED_SAME_GOVERNED_SCOPE" : failed ? "FALLBACK_EXECUTION_FAILED" : "RETAINED_PRIMARY_UNCERTAIN",
    };
    return {
      decision: accepted ? fallbackDetail.decision : primaryDetail.decision,
      trace: { ...primaryDetail.trace, fallback: fallbackTrace },
    };
  });
}

/** Default hybrid path used only by gated THERE/TO V4 development candidates. */
export function analyseFamilyContextsV4WithFallback(manifest: ContextManifestV4, inputs: readonly ContextInputV4[]) {
  return analyseFamilyContextsV4WithFallbackParsers(manifest, inputs, parseStructuralFeaturesV4, parseTransformerStructuralFeaturesV4);
}

export const CONTEXT_V4_STRUCTURE_SOURCE = Object.freeze({
  schema: CONTEXT_V4_STRUCTURE_SCHEMA, adapter: CONTEXT_V4_ADAPTER_VERSION,
  runtime: CONTEXT_V4_RUNTIME_IDENTITY, limits: CONTEXT_V4_RESOURCE_LIMITS,
  fallback: {
    policyVersion: CONTEXT_V4_FALLBACK_POLICY_VERSION,
    runtime: CONTEXT_V4_FALLBACK_RUNTIME_IDENTITY,
    limits: CONTEXT_V4_FALLBACK_RESOURCE_LIMITS,
    eligibleReasons: FALLBACK_ELIGIBILITY_V4,
  },
  retainedPolicyLists: {
    taskTerms: { values: [...POLICY_TASK_TERMS].sort(), reason: "ADLE task-dependent protection, not syntactic inference" },
    ambiguousContractionPredicates: { values: [...AMBIGUOUS_CONTRACTION_PREDICATES].sort(), reason: "ADLE semantic abstention for known parser-insufficient predicates" },
    destinationRecipientGovernors: { values: [...DESTINATION_RECIPIENT_GOVERNORS].sort(), reason: "ADLE construction-governance policy that dependency syntax alone cannot supply" },
  },
});
