import type {
  ContextAnswerVisibility,
  ContextConfusionSetKey,
  ContextSourceClass,
  ContextSupportLevel,
  ContextTargetSelection,
  ContextVerificationState,
  ContextualUsageResult,
} from "./contracts";
import { fingerprintContextValue } from "./fingerprint";
import { fingerprintWritingSource } from "./occurrence-identity";
import { CONTEXT_REGISTRY_VERSION_V1 } from "./registry-v1";

export const CONTEXT_REGRESSION_CORPUS_VERSION_V1 =
  "ADLE_CONTEXT_REGRESSION_CORPUS_V1_2026-09-02" as const;

export interface ContextCorpusExpectedOccurrence {
  canonicalWordKey: string;
  observedSurface: string;
  occurrenceNumber: number;
  startOffset: number;
  endOffset: number;
  confusionSetKey: ContextConfusionSetKey;
  expectedResult: ContextualUsageResult;
  expectedAlternativeCanonicalWordKey: string | null;
  reasonCode: string;
}

export interface ContextCorpusCase {
  caseId: string;
  description: string;
  text: string;
  learnerId: string;
  source: {
    sourceClass: ContextSourceClass;
    sourceEntityType: string;
    sourceEntityId: string;
    sourceRevision: string;
    sourceFingerprint: string;
    sourceField: string;
  };
  provenance: {
    sourceClass: ContextSourceClass;
    targetSelection: ContextTargetSelection;
    answerVisibility: ContextAnswerVisibility;
    supportLevel: ContextSupportLevel;
    verificationState: ContextVerificationState;
  };
  tags: readonly string[];
  occurrences: readonly ContextCorpusExpectedOccurrence[];
}

interface AuthoredOccurrence {
  canonicalWordKey: string;
  observedSurface: string;
  occurrenceNumber?: number;
  confusionSetKey: ContextConfusionSetKey;
  expectedResult: ContextualUsageResult;
  expectedAlternativeCanonicalWordKey?: string | null;
  reasonCode: string;
}

interface AuthoredCase {
  caseId: string;
  description: string;
  text: string;
  tags: readonly string[];
  occurrences: readonly AuthoredOccurrence[];
  provenance?: Partial<ContextCorpusCase["provenance"]>;
}

function occurrenceOffset(text: string, surface: string, occurrenceNumber: number): number {
  let from = 0;
  let offset = -1;
  for (let occurrence = 1; occurrence <= occurrenceNumber; occurrence += 1) {
    offset = text.indexOf(surface, from);
    if (offset < 0) {
      throw new Error(`context_corpus_surface_missing:${surface}:${occurrenceNumber}`);
    }
    from = offset + surface.length;
  }
  return offset;
}

function defineCase(authored: AuthoredCase): ContextCorpusCase {
  const sourceClass = authored.provenance?.sourceClass ?? "INDEPENDENT_LEARNER_WRITING";
  const source = {
    sourceClass,
    sourceEntityType: "synthetic_context_corpus_case",
    sourceEntityId: authored.caseId,
    sourceRevision: "1",
    sourceFingerprint: fingerprintWritingSource({
      sourceClass,
      sourceEntityType: "synthetic_context_corpus_case",
      sourceEntityId: authored.caseId,
      sourceRevision: "1",
      sourceField: "writing_text",
      text: authored.text,
    }),
    sourceField: "writing_text",
  } as const;
  return {
    caseId: authored.caseId,
    description: authored.description,
    text: authored.text,
    learnerId: "synthetic-learner-context-v1",
    source,
    provenance: {
      sourceClass,
      targetSelection: authored.provenance?.targetSelection ?? "LEARNER_SELECTED",
      answerVisibility: authored.provenance?.answerVisibility ?? "NOT_SHOWN",
      supportLevel: authored.provenance?.supportLevel ?? "NONE",
      verificationState: authored.provenance?.verificationState ?? "SYSTEM_GOVERNED",
    },
    tags: authored.tags,
    occurrences: authored.occurrences.map((occurrence) => {
      const occurrenceNumber = occurrence.occurrenceNumber ?? 1;
      const startOffset = occurrenceOffset(authored.text, occurrence.observedSurface, occurrenceNumber);
      return {
        canonicalWordKey: occurrence.canonicalWordKey,
        observedSurface: occurrence.observedSurface,
        occurrenceNumber,
        startOffset,
        endOffset: startOffset + occurrence.observedSurface.length,
        confusionSetKey: occurrence.confusionSetKey,
        expectedResult: occurrence.expectedResult,
        expectedAlternativeCanonicalWordKey: occurrence.expectedAlternativeCanonicalWordKey ?? null,
        reasonCode: occurrence.reasonCode,
      };
    }),
  };
}

export const CONTEXT_REGRESSION_CASES_V1: readonly ContextCorpusCase[] = [
  defineCase({ caseId: "there-existential", description: "Existential there", text: "There is a fox outside.", tags: ["correct", "existential"], occurrences: [{ canonicalWordKey: "there_en_gb", observedSurface: "There", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "EXISTENTIAL_THERE" }] }),
  defineCase({ caseId: "there-locative", description: "Locative there", text: "Put it over there.", tags: ["correct", "locative", "same_spelling_different_function"], occurrences: [{ canonicalWordKey: "there_en_gb", observedSurface: "there", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "LOCATIVE_THERE" }] }),
  defineCase({ caseId: "their-possessive", description: "Possessive their", text: "Their dog is friendly.", tags: ["correct", "possessive"], occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "POSSESSIVE_THEIR" }] }),
  defineCase({ caseId: "theyre-straight", description: "They're contraction with a straight apostrophe", text: "They're going to the park.", tags: ["correct", "contraction", "straight_apostrophe"], occurrences: [{ canonicalWordKey: "they_re_en_gb", observedSurface: "They're", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "CONTRACTION_THEY_ARE" }, { canonicalWordKey: "to_en_gb", observedSurface: "to", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "PREPOSITIONAL_TO" }] }),
  defineCase({ caseId: "to-preposition", description: "Prepositional to", text: "We walked to school.", tags: ["correct", "preposition"], occurrences: [{ canonicalWordKey: "to_en_gb", observedSurface: "to", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "PREPOSITIONAL_TO" }] }),
  defineCase({ caseId: "to-infinitive", description: "Infinitival to", text: "I want to read.", tags: ["correct", "infinitive"], occurrences: [{ canonicalWordKey: "to_en_gb", observedSurface: "to", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "INFINITIVAL_TO" }] }),
  defineCase({ caseId: "too-additive", description: "Additive too", text: "I want one too.", tags: ["correct", "additive"], occurrences: [{ canonicalWordKey: "too_en_gb", observedSurface: "too", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "ADDITIVE_TOO" }] }),
  defineCase({ caseId: "too-degree", description: "Degree or excess too", text: "The bag is too heavy.", tags: ["correct", "degree_excess"], occurrences: [{ canonicalWordKey: "too_en_gb", observedSurface: "too", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "DEGREE_TOO" }] }),
  defineCase({ caseId: "two-numeral", description: "Numeral two", text: "I have two cats.", tags: ["correct", "numeral"], occurrences: [{ canonicalWordKey: "two_en_gb", observedSurface: "two", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "NUMERAL_TWO" }] }),
  defineCase({ caseId: "your-possessive", description: "Possessive your", text: "Your coat is wet.", tags: ["correct", "possessive"], occurrences: [{ canonicalWordKey: "your_en_gb", observedSurface: "Your", confusionSetKey: "YOUR_YOURE", expectedResult: "VALID", reasonCode: "POSSESSIVE_YOUR" }] }),
  defineCase({ caseId: "youre-curly", description: "You're contraction with a curly apostrophe", text: "You’re very kind.", tags: ["correct", "contraction", "curly_apostrophe", "unicode_normalization"], occurrences: [{ canonicalWordKey: "you_re_en_gb", observedSurface: "You’re", confusionSetKey: "YOUR_YOURE", expectedResult: "VALID", reasonCode: "CONTRACTION_YOU_ARE" }] }),
  defineCase({ caseId: "its-possessive", description: "Possessive its", text: "The dog wagged its tail.", tags: ["correct", "possessive"], occurrences: [{ canonicalWordKey: "its_en_gb", observedSurface: "its", confusionSetKey: "ITS_ITS", expectedResult: "VALID", reasonCode: "POSSESSIVE_ITS" }] }),
  defineCase({ caseId: "its-it-is", description: "It's meaning it is", text: "It's raining.", tags: ["correct", "contraction", "it_is", "straight_apostrophe"], occurrences: [{ canonicalWordKey: "it_s_en_gb", observedSurface: "It's", confusionSetKey: "ITS_ITS", expectedResult: "VALID", reasonCode: "CONTRACTION_IT_IS" }] }),
  defineCase({ caseId: "its-it-has", description: "It's meaning it has", text: "It’s been fun.", tags: ["correct", "contraction", "it_has", "curly_apostrophe"], occurrences: [{ canonicalWordKey: "it_s_en_gb", observedSurface: "It’s", confusionSetKey: "ITS_ITS", expectedResult: "VALID", reasonCode: "CONTRACTION_IT_HAS" }] }),

  defineCase({ caseId: "wrong-their-going", description: "Their incorrectly replaces they're", text: "Their going to the park.", tags: ["wrong_lexical_choice"], occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "they_re_en_gb", reasonCode: "EXPECTED_THEYRE" }, { canonicalWordKey: "to_en_gb", observedSurface: "to", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "PREPOSITIONAL_TO" }] }),
  defineCase({ caseId: "wrong-your-kind", description: "Your incorrectly replaces you're", text: "Your very kind.", tags: ["wrong_lexical_choice"], occurrences: [{ canonicalWordKey: "your_en_gb", observedSurface: "Your", confusionSetKey: "YOUR_YOURE", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "you_re_en_gb", reasonCode: "EXPECTED_YOURE" }] }),
  defineCase({ caseId: "wrong-its-tail", description: "It's incorrectly replaces possessive its", text: "The dog wagged it's tail.", tags: ["wrong_lexical_choice"], occurrences: [{ canonicalWordKey: "it_s_en_gb", observedSurface: "it's", confusionSetKey: "ITS_ITS", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "its_en_gb", reasonCode: "EXPECTED_ITS" }] }),
  defineCase({ caseId: "wrong-to-cats", description: "To incorrectly replaces numeral two", text: "I have to cats.", tags: ["wrong_lexical_choice"], occurrences: [{ canonicalWordKey: "to_en_gb", observedSurface: "to", confusionSetKey: "TO_TOO_TWO", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "two_en_gb", reasonCode: "EXPECTED_TWO" }] }),
  defineCase({ caseId: "wrong-too-go", description: "Too incorrectly replaces infinitival to", text: "I want too go.", tags: ["wrong_lexical_choice"], occurrences: [{ canonicalWordKey: "too_en_gb", observedSurface: "too", confusionSetKey: "TO_TOO_TWO", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "to_en_gb", reasonCode: "EXPECTED_TO" }] }),

  defineCase({ caseId: "their-gerund-counterexample", description: "Possessive their correctly modifies a gerund phrase", text: "Their going home was unexpected.", tags: ["critical_counterexample", "conservative_rule", "same_spelling_different_function"], occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "POSSESSIVE_THEIR_GERUND" }] }),
  defineCase({ caseId: "their-running-fragment", description: "Fragment cannot distinguish possessive gerund from malformed they're", text: "Their running.", tags: ["critical_counterexample", "ambiguous_fragment", "deterministic_classifier_disagreement"], occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "UNCERTAIN", reasonCode: "INSUFFICIENT_CONTEXT" }] }),
  defineCase({ caseId: "too-fragment", description: "Isolated too may be additive or an incomplete phrase", text: "Too.", tags: ["ambiguous_fragment", "insufficient_context"], occurrences: [{ canonicalWordKey: "too_en_gb", observedSurface: "Too", confusionSetKey: "TO_TOO_TWO", expectedResult: "UNCERTAIN", reasonCode: "INSUFFICIENT_CONTEXT" }] }),
  defineCase({ caseId: "missing-punctuation-run-on", description: "Valid uses survive a run-on and missing terminal punctuation", text: "there is a cat it is over there", tags: ["missing_punctuation", "run_on", "multiple_occurrences"], occurrences: [{ canonicalWordKey: "there_en_gb", observedSurface: "there", occurrenceNumber: 1, confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "EXISTENTIAL_THERE" }, { canonicalWordKey: "there_en_gb", observedSurface: "there", occurrenceNumber: 2, confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "LOCATIVE_THERE" }] }),
  defineCase({ caseId: "line-break-apostrophe", description: "Line break plus mixed apostrophe styles", text: "Your coat is wet\nbut you're going out", tags: ["line_break", "straight_apostrophe", "multiple_occurrences"], occurrences: [{ canonicalWordKey: "your_en_gb", observedSurface: "Your", confusionSetKey: "YOUR_YOURE", expectedResult: "VALID", reasonCode: "POSSESSIVE_YOUR" }, { canonicalWordKey: "you_re_en_gb", observedSurface: "you're", confusionSetKey: "YOUR_YOURE", expectedResult: "VALID", reasonCode: "CONTRACTION_YOU_ARE" }] }),
  defineCase({ caseId: "capitalization-unrelated-error", description: "Capitalization and unrelated spelling errors do not invalidate governed uses", text: "THERE are two brids over there", tags: ["unconventional_capitalization", "unrelated_spelling_error", "multiple_occurrences"], occurrences: [{ canonicalWordKey: "there_en_gb", observedSurface: "THERE", occurrenceNumber: 1, confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "EXISTENTIAL_THERE" }, { canonicalWordKey: "two_en_gb", observedSurface: "two", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "NUMERAL_TWO" }, { canonicalWordKey: "there_en_gb", observedSurface: "there", occurrenceNumber: 1, confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "LOCATIVE_THERE" }] }),
  defineCase({ caseId: "mixed-their-occurrences", description: "Same canonical spelling is valid once and invalid once", text: "Their dog is friendly, but their going home now.", tags: ["multiple_occurrences", "mixed_valid_invalid", "all_occurrence_foundation"], occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "VALID", reasonCode: "POSSESSIVE_THEIR" }, { canonicalWordKey: "their_en_gb", observedSurface: "their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "they_re_en_gb", reasonCode: "EXPECTED_THEYRE" }] }),
  defineCase({ caseId: "prompt-copied-misuse", description: "System-selected target is copied but contextually misused", text: "Their going home.", tags: ["copied_target", "system_selected", "wrong_lexical_choice"], provenance: { sourceClass: "GOVERNED_REVIEW_WRITING", targetSelection: "SYSTEM_SELECTED", answerVisibility: "SHOWN_DURING_WRITING", supportLevel: "DIRECT_COPY_AVAILABLE" }, occurrences: [{ canonicalWordKey: "their_en_gb", observedSurface: "Their", confusionSetKey: "THERE_THEIR_THEYRE", expectedResult: "INVALID", expectedAlternativeCanonicalWordKey: "they_re_en_gb", reasonCode: "EXPECTED_THEYRE" }] }),
  defineCase({ caseId: "modifier-apostrophe-normalization", description: "Modifier apostrophe normalizes to the governed contraction surface", text: "Itʼs been raining.", tags: ["unicode_normalization", "modifier_apostrophe", "contraction"], occurrences: [{ canonicalWordKey: "it_s_en_gb", observedSurface: "Itʼs", confusionSetKey: "ITS_ITS", expectedResult: "VALID", reasonCode: "CONTRACTION_IT_HAS" }] }),
  defineCase({ caseId: "fullwidth-normalization", description: "Fullwidth surface normalizes without changing source offsets", text: "I have ＴＷＯ cats.", tags: ["unicode_normalization", "fullwidth", "numeral"], occurrences: [{ canonicalWordKey: "two_en_gb", observedSurface: "ＴＷＯ", confusionSetKey: "TO_TOO_TWO", expectedResult: "VALID", reasonCode: "NUMERAL_TWO" }] }),
] as const;

export const CONTEXT_IDENTITY_SCENARIOS_V1 = [
  {
    scenarioId: "same-source-replay",
    caseId: "mixed-their-occurrences",
    expectation: "SAME_INPUT_PRODUCES_SAME_OCCURRENCE_ID",
  },
  {
    scenarioId: "changed-source-fingerprint",
    caseId: "their-possessive",
    changedSourceFingerprint: "f".repeat(64),
    expectation: "CHANGED_SOURCE_FINGERPRINT_PRODUCES_DIFFERENT_OCCURRENCE_ID",
  },
  {
    scenarioId: "validator-version-coexistence",
    caseId: "their-running-fragment",
    decisionVersions: ["ADLE_CONTEXT_RULES_V1", "ADLE_CONTEXT_RULES_V2"],
    expectation: "ONE_OCCURRENCE_ID_SUPPORTS_VERSIONED_DECISIONS",
  },
  {
    scenarioId: "repeated-candidate-words",
    caseId: "missing-punctuation-run-on",
    expectation: "EACH_SPAN_PRODUCES_A_DISTINCT_OCCURRENCE_ID",
  },
] as const;

export const CONTEXT_CALIBRATION_BOUNDARY_SCENARIOS_V1 = [
  { position: "BELOW_APPROVED_FAMILY_THRESHOLD", expectedAdmissible: false },
  { position: "AT_APPROVED_FAMILY_THRESHOLD", expectedAdmissible: true },
  { position: "ABOVE_APPROVED_FAMILY_THRESHOLD", expectedAdmissible: true },
  { position: "APPROVED_THRESHOLD_WITHOUT_APPROVED_POLICY", expectedAdmissible: false },
] as const;

export const CONTEXT_REGRESSION_CORPUS_V1 = {
  corpusVersion: CONTEXT_REGRESSION_CORPUS_VERSION_V1,
  registryVersion: CONTEXT_REGISTRY_VERSION_V1,
  cases: CONTEXT_REGRESSION_CASES_V1,
  identityScenarios: CONTEXT_IDENTITY_SCENARIOS_V1,
  calibrationBoundaryScenarios: CONTEXT_CALIBRATION_BOUNDARY_SCENARIOS_V1,
} as const;

export const CONTEXT_REGRESSION_CORPUS_V1_FINGERPRINT =
  "4bd36950f3f33d54b5e1c8daaa6573b7e68cce0133a27d0358745b10bcb71ab0" as const;

export function calculateContextRegressionCorpusV1Fingerprint(): string {
  return fingerprintContextValue(CONTEXT_REGRESSION_CORPUS_V1);
}
