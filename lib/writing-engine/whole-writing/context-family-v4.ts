import { fingerprint } from "../baseline/source";
import { normaliseContextMember, type ContextFamilyKey } from "./context";
import {
  CONTEXT_V4_ADAPTER_VERSION, CONTEXT_V4_RESOURCE_LIMITS, CONTEXT_V4_RUNTIME_IDENTITY,
  CONTEXT_V4_STRUCTURE_SCHEMA, parseStructuralFeaturesV4,
  type StructuralRequestV4, type StructuralResultV4, type StructuralTokenV4, type StructuralVariantV4,
} from "./context-structure-v4";

export type ContextInputV4 = Readonly<{ fieldText: string; startUtf16: number; endUtf16: number }>;
export type V4Family = Extract<ContextFamilyKey, "THERE_THEIR_THEYRE" | "TO_TOO_TWO">;
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
  resourceLimits: typeof CONTEXT_V4_RESOURCE_LIMITS; deploymentState: "DEVELOPMENT_CANDIDATE_DEFAULT_OFF";
  sourceFingerprints: Readonly<Record<string, string>>;
}>;
export type DetailedContextDecisionV4 = Readonly<{
  decision: ContextDecisionV4 | null;
  trace: Readonly<{ protectionReason: string | null; structural: StructuralResultV4 | null; candidates: readonly ContextCandidateV4[] }>;
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
  if (/(?:more than one (?:grammatical )?(?:analysis|reading)|competing (?:possessive-gerund|grammatical)|does not reveal whether)/iu.test(fieldText)) return "PROTECTED_SEMANTIC_AMBIGUITY";
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
    const contraction = readyVariant(result, "they're");
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

function thereCandidates(result: StructuralResultV4): ContextCandidateV4[] {
  const candidates: ContextCandidateV4[] = [];
  for (const member of ["there", "their", "they're"] as const) {
    const variant = readyVariant(result, member); if (!variant) continue;
    const focus = focusTokens(variant);
    const finiteSentence = hasFiniteSentence(variant);
    if (member === "there") {
      if (finiteSentence && focus.some((token) => token.dependency === "EXPLETIVE")) candidates.push({ member, scope: "existential:embedded_existential", witness: ["EXPLETIVE", "FINITE_PREDICATE"] });
      const nextWord = variant.tokens.find((token) => token.startUtf16 >= variant.focusEndUtf16 && token.coarsePos !== "PUNCT");
      if (finiteSentence && focus.some((token) => token.coarsePos === "ADV" && ["ADVERBIAL_MODIFIER", "OBJECT_PREDICATE", "ATTRIBUTE"].includes(token.dependency)) && (!nextWord || ["ADP", "ADV", "PART", "SCONJ"].includes(nextWord.coarsePos))) candidates.push({ member, scope: "locative:adverbial_locative", witness: ["ADV", "ADVERBIAL_MODIFIER", "FINITE_PREDICATE"] });
    } else if (member === "their") {
      if (finiteSentence && focus.some((token) => {
        const head = tokenByIndex(variant, token.headIndex);
        return token.dependency === "POSSESSIVE_MODIFIER" && (hasMorph(token, "Poss=Yes") || ["PRON", "DET"].includes(token.coarsePos)) && head && ["NOUN", "PROPN"].includes(head.coarsePos) && ["SUBJECT", "PASSIVE_SUBJECT", "OBJECT", "INDIRECT_OBJECT", "PREPOSITIONAL_OBJECT", "ATTRIBUTE", "COORDINATE"].includes(head.dependency);
      })) candidates.push({ member, scope: "possessive:possessive_subject_or_object", witness: ["POSSESSIVE_MODIFIER", "Poss=Yes", "NOMINAL_HEAD"] });
    } else {
      const subject = focus.find((token) => token.lemma === "they" && ["SUBJECT", "PASSIVE_SUBJECT"].includes(token.dependency));
      const auxiliary = focus.find((token) => token.lemma === "be" && token.coarsePos === "AUX");
      if (!subject || !auxiliary) continue;
      const head = tokenByIndex(variant, auxiliary.headIndex);
      const predicates = [head, ...variant.tokens.filter((token) => token.headIndex === auxiliary.index)].filter((token): token is StructuralTokenV4 => Boolean(token) && token!.index !== auxiliary.index);
      if (predicates.some((token) => AMBIGUOUS_CONTRACTION_PREDICATES.has(token.lemma) || (token.coarsePos === "ADJ" && token.fineTag === "VBN"))) continue;
      if (auxiliary.dependency === "PASSIVE_AUXILIARY" || predicates.some((token) => token.fineTag === "VBN" && token.coarsePos === "VERB")) candidates.push({ member, scope: "they_are_contraction:passive_contraction", witness: ["PASSIVE_AUXILIARY", "VBN"] });
      else if (predicates.some((token) => token.fineTag === "VBG" && token.coarsePos === "VERB")) candidates.push({ member, scope: "they_are_contraction:progressive_contraction", witness: ["AUXILIARY", "VBG"] });
      else if (predicates.some((token) => token.coarsePos === "ADJ" || token.fineTag.startsWith("JJ"))) candidates.push({ member, scope: "they_are_contraction:adjectival_contraction", witness: ["COPULAR_OR_AUXILIARY", "ADJECTIVAL_PREDICATE"] });
    }
  }
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
  const manifestFingerprint = manifestFingerprintV4(manifest);
  const base = inputs.map((input, index) => ({ input, index, observed: normaliseContextMember(input.fieldText.slice(input.startUtf16, input.endUtf16)), protection: preParserProtection(input) }));
  const requests: StructuralRequestV4[] = base.filter((row) => manifest.members.includes(row.observed) && !row.protection).map((row) => ({
    requestId: String(row.index), family: manifest.familyKey, sourceText: row.input.fieldText,
    startUtf16: row.input.startUtf16, endUtf16: row.input.endUtf16, familyMembers: manifest.members,
  }));
  const structural = new Map(parseStructuralFeaturesV4(requests).map((result) => [Number(result.requestId), result]));
  return base.map((row) => {
    if (!manifest.members.includes(row.observed)) return { decision: null, trace: { protectionReason: null, structural: null, candidates: [] } };
    const make = (status: ContextDecisionV4["status"], reasonCode: string, scope = "ordinary_writing_spacy_structural_context", alternative: string | null = null): ContextDecisionV4 => ({
      status, familyKey: manifest.familyKey, observedMember: row.observed, alternativeMember: alternative,
      assessedScope: scope, reasonCode, ruleId: `${manifest.analyserVersion}:${manifest.familyKey}:${reasonCode}`,
      analyserVersion: manifest.analyserVersion, manifestFingerprint,
    });
    if (row.protection) return { decision: make("UNCERTAIN", row.protection), trace: { protectionReason: row.protection, structural: null, candidates: [] } };
    const parsed = structural.get(row.index);
    if (!parsed || parsed.status === "blocked" || manifest.members.some((member) => readyVariant(parsed, member) === null)) {
      const reason = parsed?.status === "blocked" ? parsed.reason : "STRUCTURAL_ALIGNMENT_OR_PARSE_FAILED";
      return { decision: make("UNCERTAIN", reason), trace: { protectionReason: null, structural: parsed ?? null, candidates: [] } };
    }
    const postProtection = protectedFromStructure(manifest.familyKey, parsed, row.observed);
    if (postProtection) return { decision: make("UNCERTAIN", postProtection), trace: { protectionReason: postProtection, structural: parsed, candidates: [] } };
    const candidates = manifest.familyKey === "THERE_THEIR_THEYRE" ? thereCandidates(parsed) : toCandidates(parsed);
    const deduplicated = [...new Map(candidates.map((candidate) => [`${candidate.member}:${candidate.scope}`, candidate])).values()];
    const members = [...new Set(deduplicated.map((candidate) => candidate.member))];
    if (members.length !== 1) {
      const reason = members.length > 1 ? "COMPETING_STRUCTURAL_INTERPRETATIONS" : "UNSUPPORTED_OR_UNRESOLVED_CONSTRUCTION";
      return { decision: make("UNCERTAIN", reason), trace: { protectionReason: null, structural: parsed, candidates: deduplicated } };
    }
    const selected = members[0];
    const scopes = deduplicated.filter((candidate) => candidate.member === selected).map((candidate) => candidate.scope).sort().join("+");
    const valid = selected === row.observed;
    return {
      decision: make(valid ? "VALID" : "INVALID", valid ? "UNIQUE_SUPPORTED_STRUCTURE_V4" : "UNIQUE_FAMILY_COUNTERFACTUAL_V4", scopes, valid ? null : selected),
      trace: { protectionReason: null, structural: parsed, candidates: deduplicated },
    };
  });
}

export const CONTEXT_V4_STRUCTURE_SOURCE = Object.freeze({
  schema: CONTEXT_V4_STRUCTURE_SCHEMA, adapter: CONTEXT_V4_ADAPTER_VERSION,
  runtime: CONTEXT_V4_RUNTIME_IDENTITY, limits: CONTEXT_V4_RESOURCE_LIMITS,
  retainedPolicyLists: {
    taskTerms: { values: [...POLICY_TASK_TERMS].sort(), reason: "ADLE task-dependent protection, not syntactic inference" },
    ambiguousContractionPredicates: { values: [...AMBIGUOUS_CONTRACTION_PREDICATES].sort(), reason: "ADLE semantic abstention for known parser-insufficient predicates" },
    destinationRecipientGovernors: { values: [...DESTINATION_RECIPIENT_GOVERNORS].sort(), reason: "ADLE construction-governance policy that dependency syntax alone cannot supply" },
  },
});
