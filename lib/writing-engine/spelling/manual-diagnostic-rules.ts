import {
  categoriseError,
  type SpellingCategory,
} from "../../spelling/categoriseError";
import {
  detectErrorPattern,
  formatErrorPatternLabel,
  selectTeachingFamilyForError,
} from "../../spelling/errorPatterns";
import type { ErrorPattern } from "../../spelling/errorPatterns";
import type { WordFamilyId } from "../../spelling/wordFamilies";

import { resolveManualDiagnosticSuggestion } from "./manual-diagnostic-catalog";
import type {
  ManualSpellingDiagnosticInput,
  ManualSpellingDiagnosticInterpretation,
  ManualSpellingDiagnosticRuleKey,
} from "./manual-diagnostic-types";

type NormalisedDiagnosticInput = {
  targetWord: string;
  childSpelling: string;
  sentenceContext: string | null;
};

function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))));
}

function isConsonant(value: string) {
  return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}

function isSimpleCvcWord(word: string) {
  return /^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/.test(word);
}

function buildInterpretation(input: {
  normalised: NormalisedDiagnosticInput;
  likelyErrorCategory: SpellingCategory | null;
  errorPattern: ErrorPattern | null;
  teachingFamilyId: WordFamilyId | null;
  confidenceScore: number;
  ruleKey: ManualSpellingDiagnosticRuleKey;
  explanation: string;
  categoryReason: string;
  confidenceReasons: string[];
  metadata?: Record<string, unknown>;
  customCatalogKey?: string | null;
  customMicroSkillKey?: string | null;
  customTemplateKey?: string | null;
  customPracticeWords?: string[];
  customPrerequisiteGapKeys?: Array<
    | "sound_to_spelling_mapping"
    | "vowel_discrimination"
    | "blend_segmentation"
    | "grapheme_choice"
    | "long_vowel_pattern_awareness"
    | "suffix_awareness"
    | "base_word_awareness"
    | "syllable_awareness"
    | "meaning_choice"
    | "proofreading_attention"
  >;
  hasDiagnosticConcern?: boolean;
}) {
  const resolvedSuggestion = resolveManualDiagnosticSuggestion({
    familyId: input.teachingFamilyId,
    targetWord: input.normalised.targetWord,
    childSpelling: input.normalised.childSpelling,
    customCatalogKey: input.customCatalogKey ?? null,
    customMicroSkillKey: input.customMicroSkillKey ?? null,
    customTemplateKey: input.customTemplateKey ?? null,
    customPracticeWords: input.customPracticeWords,
    customPrerequisiteGapKeys: input.customPrerequisiteGapKeys,
  });

  return {
    likelyErrorCategory: input.likelyErrorCategory,
    errorPattern: input.errorPattern,
    teachingFamilyId: input.teachingFamilyId,
    confidenceScore: clampConfidence(input.confidenceScore),
    explanation: input.explanation,
    ruleMetadata: {
      ruleKey: input.ruleKey,
      explanation: input.explanation,
      errorPattern: input.errorPattern,
      teachingFamilyId: input.teachingFamilyId,
      matchedCatalogKey: resolvedSuggestion.matchedCatalogKey,
      categoryReason: input.categoryReason,
      confidenceReasons: input.confidenceReasons,
      metadata: input.metadata ?? {},
    },
    resolvedSuggestion,
    hasDiagnosticConcern: input.hasDiagnosticConcern ?? true,
  } satisfies ManualSpellingDiagnosticInterpretation;
}

function detectExactMatch(
  normalised: NormalisedDiagnosticInput,
): ManualSpellingDiagnosticInterpretation | null {
  if (normalised.targetWord !== normalised.childSpelling) {
    return null;
  }

  return buildInterpretation({
    normalised,
    likelyErrorCategory: null,
    errorPattern: null,
    teachingFamilyId: null,
    confidenceScore: 1,
    ruleKey: "exact_match",
    explanation: "The child spelling exactly matches the target word, so no diagnostic concern was raised.",
    categoryReason: "Exact-match safeguard",
    confidenceReasons: ["exact_word_match"],
    metadata: {
      comparison: "exact_match",
    },
    hasDiagnosticConcern: false,
  });
}

function detectCvcShortVowelSubstitution(
  normalised: NormalisedDiagnosticInput,
): ManualSpellingDiagnosticInterpretation | null {
  if (
    !isSimpleCvcWord(normalised.targetWord) ||
    !isSimpleCvcWord(normalised.childSpelling)
  ) {
    return null;
  }

  if (
    normalised.targetWord[0] !== normalised.childSpelling[0] ||
    normalised.targetWord[2] !== normalised.childSpelling[2] ||
    normalised.targetWord[1] === normalised.childSpelling[1]
  ) {
    return null;
  }

  const microSkillByTargetVowel: Record<string, string> = {
    a: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    e: "D4_PG_CVC_SHORT_VOWELS_SHORT_E",
    i: "D4_PG_CVC_SHORT_VOWELS_SHORT_I",
    o: "D4_PG_CVC_SHORT_VOWELS_SHORT_O",
    u: "D4_PG_CVC_SHORT_VOWELS_SHORT_U",
  };
  const targetVowel = normalised.targetWord[1];
  const suggestedMicroSkillKey = microSkillByTargetVowel[targetVowel] ?? null;

  return buildInterpretation({
    normalised,
    likelyErrorCategory: "Phonic",
    errorPattern: "wrong_vowel_grapheme",
    teachingFamilyId: null,
    confidenceScore: 0.88,
    ruleKey: "cvc_short_vowel_substitution",
    explanation:
      "The spelling keeps the initial and final consonants but changes the short vowel in the middle, which points to short-vowel selection rather than a whole-word memory issue.",
    categoryReason: "CVC short-vowel substitution",
    confidenceReasons: [
      "shared_initial_and_final_consonants",
      "single_short_vowel_change",
    ],
    metadata: {
      targetVowel,
      childVowel: normalised.childSpelling[1],
    },
    customCatalogKey: suggestedMicroSkillKey,
    customMicroSkillKey: suggestedMicroSkillKey,
    customTemplateKey: "T03",
    customPracticeWords: [normalised.targetWord],
    customPrerequisiteGapKeys: [
      "sound_to_spelling_mapping",
      "vowel_discrimination",
    ],
  });
}

function detectConsonantBlendOmission(
  normalised: NormalisedDiagnosticInput,
): ManualSpellingDiagnosticInterpretation | null {
  if (normalised.targetWord.length !== normalised.childSpelling.length + 1) {
    return null;
  }

  for (let index = 1; index < normalised.targetWord.length - 1; index += 1) {
    const current = normalised.targetWord[index];
    const previous = normalised.targetWord[index - 1];

    if (
      !isConsonant(current) ||
      !isConsonant(previous) ||
      current === previous
    ) {
      continue;
    }

    const collapsed =
      normalised.targetWord.slice(0, index) +
      normalised.targetWord.slice(index + 1);

    if (collapsed === normalised.childSpelling) {
      return buildInterpretation({
        normalised,
        likelyErrorCategory: "Phonic",
        errorPattern: null,
        teachingFamilyId: null,
        confidenceScore: 0.83,
        ruleKey: "consonant_blend_omission",
        explanation:
          "The child spelling omits one consonant from a blend while preserving the rest of the word, which suggests a missed sound-to-spelling step in the blend.",
        categoryReason: "Consonant blend omission",
        confidenceReasons: [
          "single_consonant_removed",
          "adjacent_consonant_blend_in_target",
        ],
        metadata: {
          omittedConsonant: current,
          omissionIndex: index,
        },
        customCatalogKey: "D4_PG_CONSONANT_BLENDS_BLEND_OMISSION_CHECK",
        customMicroSkillKey: "D4_PG_CONSONANT_BLENDS_BLEND_OMISSION_CHECK",
        customTemplateKey: "T05",
        customPracticeWords: ["black", "frog", "train", "milk"],
        customPrerequisiteGapKeys: [
          "sound_to_spelling_mapping",
          "blend_segmentation",
        ],
      });
    }
  }

  return null;
}

function detectPatternDrivenIssue(
  normalised: NormalisedDiagnosticInput,
): ManualSpellingDiagnosticInterpretation {
  const errorPattern = detectErrorPattern(
    normalised.childSpelling,
    normalised.targetWord,
  );
  const likelyErrorCategory = categoriseError(
    normalised.childSpelling,
    normalised.targetWord,
    errorPattern,
  );
  const teachingFamilyId = selectTeachingFamilyForError(
    normalised.childSpelling,
    normalised.targetWord,
    errorPattern,
  );
  const hasSentenceContext = Boolean(normalised.sentenceContext);
  const confidenceReasons = ["deterministic_pattern_detection"];

  let confidenceScore = errorPattern ? 0.79 : 0.61;

  if (errorPattern === "homophone_confusion" && hasSentenceContext) {
    confidenceScore += 0.05;
    confidenceReasons.push("sentence_context_available_for_homophone");
  }

  if (teachingFamilyId) {
    confidenceScore += 0.04;
    confidenceReasons.push("teaching_family_selected");
  }

  return buildInterpretation({
    normalised,
    likelyErrorCategory,
    errorPattern,
    teachingFamilyId,
    confidenceScore,
    ruleKey: errorPattern ? "detected_error_pattern" : "category_fallback",
    explanation: errorPattern
      ? `The diagnostic matched the deterministic rule "${formatErrorPatternLabel(errorPattern)}" for this spelling pair.`
      : "No narrow pattern rule matched, so the diagnostic used the deterministic category fallback for this spelling pair.",
    categoryReason: errorPattern
      ? `Detected spelling pattern: ${formatErrorPatternLabel(errorPattern)}`
      : "Fallback category classification",
    confidenceReasons,
    metadata: {
      usedSentenceContext: hasSentenceContext,
    },
  });
}

export function interpretManualSpellingDiagnostic(
  input: ManualSpellingDiagnosticInput,
): ManualSpellingDiagnosticInterpretation {
  const normalised = {
    targetWord: input.targetWord.trim().toLowerCase(),
    childSpelling: input.childSpelling.trim().toLowerCase(),
    sentenceContext: input.sentenceContext?.trim() || null,
  } satisfies NormalisedDiagnosticInput;

  return (
    detectExactMatch(normalised) ??
    detectCvcShortVowelSubstitution(normalised) ??
    detectConsonantBlendOmission(normalised) ??
    detectPatternDrivenIssue(normalised)
  );
}
