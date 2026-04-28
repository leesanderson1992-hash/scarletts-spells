import { TRICKY_WORD_SET } from "./trickyWords";
import { levenshteinDistance } from "./suggestCorrection";
import type { ErrorPattern } from "./errorPatterns";

export type SpellingCategory =
  | "Phonic"
  | "Pattern/rule"
  | "Morphology"
  | "Homophone"
  | "Irregular/tricky memory word"
  | "Careless performance error";

function hasPhonicSwap(misspelling: string, correction: string) {
  const swaps: Array<[string, string]> = [
    ["f", "ph"],
    ["k", "ck"],
    ["ai", "ay"],
    ["ee", "ea"],
    ["oa", "ow"],
    ["ow", "ou"],
    ["ie", "igh"],
    ["er", "ir"],
    ["ir", "ur"],
  ];

  return swaps.some(([left, right]) => {
    return (
      misspelling.includes(left) &&
      correction.includes(right)
    ) || (
      misspelling.includes(right) &&
      correction.includes(left)
    );
  });
}

function isSingleTransposition(misspelling: string, correction: string) {
  if (misspelling.length !== correction.length || misspelling.length < 2) {
    return false;
  }

  for (let index = 0; index < misspelling.length - 1; index += 1) {
    const swapped =
      misspelling.slice(0, index) +
      misspelling[index + 1] +
      misspelling[index] +
      misspelling.slice(index + 2);

    if (swapped === correction) {
      return true;
    }
  }

  return false;
}

export function getTeachingModeForDiagnosis(
  errorPattern: ErrorPattern | null,
  correction: string,
): SpellingCategory | null {
  switch (errorPattern) {
    case "wrong_vowel_grapheme":
    case "wrong_final_vowel_pattern":
    case "omitted_unstressed_vowel":
      return "Phonic";
    case "consonant_le_el_al_ending_error":
    case "ck_pattern_error":
    case "y_to_i_suffix_error":
    case "missing_double_letter":
    case "missing_final_e":
    case "wrong_drop_keep_e_before_suffix":
    case "extra_consonant_letter":
    case "extra_double_letter":
    case "wrong_consonant_doubling_before_suffix":
    case "wrong_consonant_pattern":
    case "wrong_suffix_spelling":
      return "Pattern/rule";
    case "wrong_prefix_spelling":
    case "root_family_preservation_error":
      return "Morphology";
    case "homophone_confusion":
      return "Homophone";
    case "tricky_whole_word_error":
      return TRICKY_WORD_SET.has(correction)
        ? "Irregular/tricky memory word"
        : "Irregular/tricky memory word";
    default:
      return null;
  }
}

export function categoriseError(
  misspelling: string,
  correction: string,
  errorPattern: ErrorPattern | null = null,
): SpellingCategory {
  const diagnosisCategory = getTeachingModeForDiagnosis(errorPattern, correction);
  if (diagnosisCategory) {
    return diagnosisCategory;
  }

  if (errorPattern === "homophone_confusion") {
    return "Homophone";
  }

  // Irregular memory words are prioritised because they often break sound-based rules.
  if (TRICKY_WORD_SET.has(correction)) {
    return "Irregular/tricky memory word";
  }

  if (isSingleTransposition(misspelling, correction)) {
    return "Careless performance error";
  }

  // Morphology covers visible prefix/suffix/root structure.
  if (
    /^(un|re|dis|mis|pre)/.test(correction) ||
    /(tion|ness|ment|ly|ful|less|able|ible)$/.test(correction)
  ) {
    return "Morphology";
  }

  // Pattern / rule catches doubled consonants, silent e and split-digraph conventions.
  if (
    /([bcdfghjklmnpqrstvwxyz])\1/.test(correction) ||
    /[aeiou][^aeiou]e$/.test(correction) ||
    correction.endsWith("ck") ||
    correction.endsWith("dge") ||
    /[bcdfghjklmnpqrstvwxyz](le|el|al)$/.test(correction)
  ) {
    return "Pattern/rule";
  }

  // Phonic is used when the error looks like a plausible sound-based substitution.
  if (hasPhonicSwap(misspelling, correction)) {
    return "Phonic";
  }

  if (
    isSingleTransposition(misspelling, correction) &&
    levenshteinDistance(misspelling, correction) === 1
  ) {
    return "Careless performance error";
  }

  return "Irregular/tricky memory word";
}

export function getSecondaryCategory(
  misspelling: string,
  correction: string,
  primaryCategory: SpellingCategory,
  errorPattern: ErrorPattern | null = null,
): SpellingCategory | null {
  const diagnosisCategory = getTeachingModeForDiagnosis(errorPattern, correction);
  if (diagnosisCategory && diagnosisCategory !== primaryCategory) {
    return diagnosisCategory;
  }

  if (primaryCategory !== "Phonic" && hasPhonicSwap(misspelling, correction)) {
    return "Phonic";
  }

  if (
    primaryCategory !== "Pattern/rule" &&
    (/([bcdfghjklmnpqrstvwxyz])\1/.test(correction) ||
      /[aeiou][^aeiou]e$/.test(correction) ||
      correction.endsWith("ck") ||
      correction.endsWith("dge") ||
      /(le|el|al)$/.test(correction))
  ) {
    return "Pattern/rule";
  }

  if (
    primaryCategory !== "Morphology" &&
    /(ed|ing|er|est|ly|tion|s|es|ies)$/.test(correction)
  ) {
    return "Morphology";
  }

  if (primaryCategory !== "Homophone" && errorPattern === "homophone_confusion") {
    return "Homophone";
  }

  if (
    primaryCategory !== "Irregular/tricky memory word" &&
    TRICKY_WORD_SET.has(correction)
  ) {
    return "Irregular/tricky memory word";
  }

  if (
    primaryCategory !== "Careless performance error" &&
    isSingleTransposition(misspelling, correction)
  ) {
    return "Careless performance error";
  }

  return null;
}
