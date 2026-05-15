import { generatePracticeSet } from "../../spelling/generatePracticeSet";
import type { WordFamilyId } from "../../spelling/wordFamilies";

import type {
  ManualSpellingDiagnosticPrerequisiteGapKey,
  ManualSpellingDiagnosticResolvedSuggestion,
} from "./manual-diagnostic-types";

type CatalogResolutionInput = {
  familyId: WordFamilyId | null;
  targetWord: string;
  childSpelling: string;
  customCatalogKey?: string | null;
  customMicroSkillKey?: string | null;
  customTemplateKey?: string | null;
  customPracticeWords?: string[];
  customPrerequisiteGapKeys?: ManualSpellingDiagnosticPrerequisiteGapKey[];
};

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function buildFamilyPracticeWords(
  familyId: WordFamilyId | null,
  targetWord: string,
  childSpelling: string,
) {
  if (!familyId) {
    return [targetWord];
  }

  return generatePracticeSet(
    familyId,
    [targetWord, childSpelling],
    targetWord,
  ).words;
}

function buildFallbackSuggestion(input: CatalogResolutionInput) {
  return {
    suggestedMicroSkillKey: null,
    recommendedLessonTemplateKey: null,
    possiblePrerequisiteGapKeys: [] as ManualSpellingDiagnosticPrerequisiteGapKey[],
    similarPracticeWords: dedupeWords(
      input.customPracticeWords ??
        buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
    ),
    matchedCatalogKey: input.customCatalogKey ?? null,
  } satisfies ManualSpellingDiagnosticResolvedSuggestion;
}

function resolveLongAiSuggestion(
  input: CatalogResolutionInput,
): ManualSpellingDiagnosticResolvedSuggestion {
  if (input.targetWord.endsWith("ay")) {
    return {
      suggestedMicroSkillKey: "D4_PG_LONG_AI_FINAL_AY",
      recommendedLessonTemplateKey: "T03",
      possiblePrerequisiteGapKeys: ["grapheme_choice", "vowel_discrimination"],
      similarPracticeWords: buildFamilyPracticeWords(
        input.familyId,
        input.targetWord,
        input.childSpelling,
      ),
      matchedCatalogKey: "D4_PG_LONG_AI_FINAL_AY",
    };
  }

  if (input.targetWord.includes("ai")) {
    return {
      suggestedMicroSkillKey: "D4_PG_LONG_AI_MEDIAL_AI",
      recommendedLessonTemplateKey: "T03",
      possiblePrerequisiteGapKeys: ["grapheme_choice", "vowel_discrimination"],
      similarPracticeWords: buildFamilyPracticeWords(
        input.familyId,
        input.targetWord,
        input.childSpelling,
      ),
      matchedCatalogKey: "D4_PG_LONG_AI_MEDIAL_AI",
    };
  }

  return {
    suggestedMicroSkillKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
    recommendedLessonTemplateKey: "T08",
    possiblePrerequisiteGapKeys: ["grapheme_choice", "vowel_discrimination"],
    similarPracticeWords: buildFamilyPracticeWords(
      input.familyId,
      input.targetWord,
      input.childSpelling,
    ),
    matchedCatalogKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
  };
}

export function resolveManualDiagnosticSuggestion(
  input: CatalogResolutionInput,
): ManualSpellingDiagnosticResolvedSuggestion {
  if (input.customMicroSkillKey || input.customTemplateKey) {
    return {
      suggestedMicroSkillKey: input.customMicroSkillKey ?? null,
      recommendedLessonTemplateKey: input.customTemplateKey ?? null,
      possiblePrerequisiteGapKeys: input.customPrerequisiteGapKeys ?? [],
      similarPracticeWords: dedupeWords(
        input.customPracticeWords ?? [input.targetWord],
      ),
      matchedCatalogKey:
        input.customCatalogKey ?? input.customMicroSkillKey ?? null,
    };
  }

  switch (input.familyId) {
    case "ai-ay":
      return resolveLongAiSuggestion(input);
    case "silent_e_words":
      if (/a[^aeiou]?e$/.test(input.targetWord)) {
        return {
          suggestedMicroSkillKey: "D4_PG_LONG_AI_SPLIT_A_E",
          recommendedLessonTemplateKey: "T03",
          possiblePrerequisiteGapKeys: [
            "sound_to_spelling_mapping",
            "long_vowel_pattern_awareness",
          ],
          similarPracticeWords: buildFamilyPracticeWords(
            input.familyId,
            input.targetWord,
            input.childSpelling,
          ),
          matchedCatalogKey: "D4_PG_LONG_AI_SPLIT_A_E",
        };
      }

      return {
        suggestedMicroSkillKey: null,
        recommendedLessonTemplateKey: "T03",
        possiblePrerequisiteGapKeys: [
          "sound_to_spelling_mapping",
          "long_vowel_pattern_awareness",
        ],
        similarPracticeWords: buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
        matchedCatalogKey: "silent_e_words",
      };
    case "double_consonant_suffix":
      return {
        suggestedMicroSkillKey: null,
        recommendedLessonTemplateKey: "T05",
        possiblePrerequisiteGapKeys: [
          "vowel_discrimination",
          "suffix_awareness",
        ],
        similarPracticeWords: buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
        matchedCatalogKey: "double_consonant_suffix",
      };
    case "schwa_unstressed_vowel":
      return {
        suggestedMicroSkillKey: null,
        recommendedLessonTemplateKey: "T05",
        possiblePrerequisiteGapKeys: [
          "sound_to_spelling_mapping",
          "syllable_awareness",
        ],
        similarPracticeWords: buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
        matchedCatalogKey: "schwa_unstressed_vowel",
      };
    case "homophones_year_2":
    case "homophones_year_3_4":
    case "homophone_there_their_theyre":
    case "homophone_to_too_two":
    case "homophone_weather_whether":
    case "homophone_whose_whos":
      return {
        suggestedMicroSkillKey: null,
        recommendedLessonTemplateKey: "T08",
        possiblePrerequisiteGapKeys: ["meaning_choice", "proofreading_attention"],
        similarPracticeWords: buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
        matchedCatalogKey: input.familyId,
      };
    case "tricky_common_words":
      return {
        suggestedMicroSkillKey: null,
        recommendedLessonTemplateKey: "T03",
        possiblePrerequisiteGapKeys: ["proofreading_attention"],
        similarPracticeWords: buildFamilyPracticeWords(
          input.familyId,
          input.targetWord,
          input.childSpelling,
        ),
        matchedCatalogKey: "tricky_common_words",
      };
    default:
      return buildFallbackSuggestion(input);
  }
}
