import { TRICKY_WORD_SET } from "./trickyWords";
import {
  findHomophoneSetFamilyForWords,
  findWordFamilyForWord,
  type WordFamilyId,
} from "./wordFamilies";

export type ErrorPattern =
  | "wrong_vowel_grapheme"
  | "wrong_final_vowel_pattern"
  | "omitted_unstressed_vowel"
  | "missing_final_e"
  | "wrong_drop_keep_e_before_suffix"
  | "missing_double_letter"
  | "extra_consonant_letter"
  | "extra_double_letter"
  | "wrong_consonant_doubling_before_suffix"
  | "ck_pattern_error"
  | "y_to_i_suffix_error"
  | "wrong_suffix_spelling"
  | "wrong_prefix_spelling"
  | "root_family_preservation_error"
  | "consonant_le_el_al_ending_error"
  | "wrong_consonant_pattern"
  | "homophone_confusion"
  | "tricky_whole_word_error";

const LEGACY_ERROR_PATTERN_MAP: Record<string, ErrorPattern> = {
  "missing-double-consonant": "missing_double_letter",
  "missing-final-e": "missing_final_e",
  "ck-pattern-error": "ck_pattern_error",
  "y-to-i-suffix-error": "y_to_i_suffix_error",
  "omitted-unstressed-vowel": "omitted_unstressed_vowel",
  "wrong-drop-keep-e-before-suffix": "wrong_drop_keep_e_before_suffix",
  "extra-consonant-letter": "extra_consonant_letter",
  "extra-double-letter": "extra_double_letter",
  "wrong-consonant-doubling-before-suffix":
    "wrong_consonant_doubling_before_suffix",
  "wrong-suffix": "wrong_suffix_spelling",
  "wrong-prefix": "wrong_prefix_spelling",
  "root-family-preservation-error": "root_family_preservation_error",
  "consonant-le-el-al-ending-error": "consonant_le_el_al_ending_error",
  "homophone-confusion": "homophone_confusion",
  "tricky-whole-word-memory-error": "tricky_whole_word_error",
};

const COMMON_SUFFIXES = [
  "ing",
  "ed",
  "ly",
  "tion",
  "s",
  "es",
  "ies",
  "er",
  "est",
  "ness",
] as const;

const COMMON_PREFIXES = ["un", "re", "dis", "mis", "pre"] as const;
const FINAL_VOWEL_PATTERNS = ["ay", "ai", "ey", "ea", "ie", "y", "e"] as const;

const HOMOPHONE_GROUPS = [
  ["to", "too", "two"],
  ["their", "there", "they're", "theyre"],
  ["hear", "here"],
  ["be", "bee"],
  ["see", "sea"],
  ["weather", "whether"],
  ["whose", "who's", "whos"],
] as const;

const PHONIC_FAMILY_SWAPS: Array<{
  familyId: WordFamilyId;
  left: string;
  right: string;
}> = [
  { familyId: "ai-ay", left: "ai", right: "ay" },
  { familyId: "ee-ea", left: "ee", right: "ea" },
  { familyId: "igh-ie-y", left: "igh", right: "ie" },
  { familyId: "oa-ow-oe", left: "oa", right: "ow" },
  { familyId: "ow-ou", left: "ow", right: "ou" },
  { familyId: "ar-or", left: "ar", right: "or" },
  { familyId: "er-ir-ur", left: "er", right: "ir" },
  { familyId: "er-ir-ur", left: "ir", right: "ur" },
  { familyId: "er-ir-ur", left: "ur", right: "er" },
] as const;

function isConsonant(value: string) {
  return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}

function getVowelGroups(word: string) {
  return word.match(/[aeiouy]+/g) ?? [];
}

function getSharedPrefixLength(left: string, right: string) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function getSharedSuffixLength(left: string, right: string) {
  let index = 0;
  while (
    index < left.length &&
    index < right.length &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function getChangedSegments(misspelling: string, correction: string) {
  const prefixLength = getSharedPrefixLength(misspelling, correction);
  const suffixLength = getSharedSuffixLength(
    misspelling.slice(prefixLength),
    correction.slice(prefixLength),
  );

  return {
    prefixLength,
    suffixLength,
    missMiddle: misspelling.slice(
      prefixLength,
      Math.max(prefixLength, misspelling.length - suffixLength),
    ),
    correctionMiddle: correction.slice(
      prefixLength,
      Math.max(prefixLength, correction.length - suffixLength),
    ),
  };
}

function hasMissingDoubleLetter(misspelling: string, correction: string) {
  for (let index = 1; index < correction.length; index += 1) {
    const current = correction[index];
    const previous = correction[index - 1];

    if (current === previous && isConsonant(current)) {
      const collapsed = correction.slice(0, index) + correction.slice(index + 1);
      if (collapsed === misspelling) {
        return true;
      }
    }
  }

  return false;
}

function hasMissingFinalE(misspelling: string, correction: string) {
  return (
    correction === `${misspelling}e` &&
    /[aeiou][bcdfghjklmnpqrstvwxyz]{1,2}e$/.test(correction)
  );
}

function hasOmittedUnstressedVowel(misspelling: string, correction: string) {
  if (correction.length !== misspelling.length + 1) {
    return false;
  }

  for (let index = 1; index < correction.length - 1; index += 1) {
    const removed = correction[index];
    if (!/[aeiou]/.test(removed)) {
      continue;
    }

    const collapsed = correction.slice(0, index) + correction.slice(index + 1);
    if (collapsed === misspelling) {
      return true;
    }
  }

  return false;
}

function hasWrongSuffix(misspelling: string, correction: string) {
  for (const correctionSuffix of COMMON_SUFFIXES) {
    if (!correction.endsWith(correctionSuffix)) {
      continue;
    }

    const correctionStem = correction.slice(0, -correctionSuffix.length);

    for (const misspellingSuffix of COMMON_SUFFIXES) {
      if (
        misspellingSuffix === correctionSuffix ||
        !misspelling.endsWith(misspellingSuffix)
      ) {
        continue;
      }

      const misspellingStem = misspelling.slice(0, -misspellingSuffix.length);
      if (misspellingStem === correctionStem) {
        return true;
      }
    }
  }

  return false;
}

function hasExtraDoubleLetter(misspelling: string, correction: string) {
  for (let index = 1; index < misspelling.length; index += 1) {
    const current = misspelling[index];
    const previous = misspelling[index - 1];

    if (current === previous && isConsonant(current)) {
      const collapsed = misspelling.slice(0, index) + misspelling.slice(index + 1);
      if (collapsed === correction) {
        return true;
      }
    }
  }

  return false;
}

function hasExtraConsonantLetter(misspelling: string, correction: string) {
  if (misspelling.length !== correction.length + 1) {
    return false;
  }

  for (let index = 0; index < misspelling.length; index += 1) {
    const removed = misspelling[index];
    if (!isConsonant(removed)) {
      continue;
    }

    const collapsed = misspelling.slice(0, index) + misspelling.slice(index + 1);
    if (collapsed === correction) {
      return true;
    }
  }

  return false;
}

function hasWrongPrefix(misspelling: string, correction: string) {
  for (const correctionPrefix of COMMON_PREFIXES) {
    if (!correction.startsWith(correctionPrefix)) {
      continue;
    }

    const correctionTail = correction.slice(correctionPrefix.length);

    for (const misspellingPrefix of COMMON_PREFIXES) {
      if (
        misspellingPrefix === correctionPrefix ||
        !misspelling.startsWith(misspellingPrefix)
      ) {
        continue;
      }

      const misspellingTail = misspelling.slice(misspellingPrefix.length);
      if (misspellingTail === correctionTail) {
        return true;
      }
    }
  }

  return false;
}

function isHomophoneConfusion(misspelling: string, correction: string) {
  return HOMOPHONE_GROUPS.some((group) => {
    const words = Array.from(group) as string[];
    return words.includes(misspelling) && words.includes(correction);
  });
}

function hasWrongFinalVowelPattern(misspelling: string, correction: string) {
  const correctionPattern = FINAL_VOWEL_PATTERNS.find((pattern) =>
    correction.endsWith(pattern),
  );
  const misspellingPattern = FINAL_VOWEL_PATTERNS.find((pattern) =>
    misspelling.endsWith(pattern),
  );

  if (!correctionPattern || !misspellingPattern || correctionPattern === misspellingPattern) {
    return false;
  }

  const correctionStem = correction.slice(0, -correctionPattern.length);
  const misspellingStem = misspelling.slice(0, -misspellingPattern.length);

  return correctionStem === misspellingStem;
}

function hasCkPatternError(misspelling: string, correction: string) {
  if (!correction.includes("ck")) {
    return false;
  }

  return (
    correction.replace("ck", "k") === misspelling ||
    correction.replace("ck", "c") === misspelling
  );
}

function hasWrongVowelGrapheme(misspelling: string, correction: string) {
  if (misspelling === correction) {
    return false;
  }

  if (hasWrongFinalVowelPattern(misspelling, correction)) {
    return false;
  }

  const { missMiddle, correctionMiddle } = getChangedSegments(
    misspelling,
    correction,
  );

  if (!missMiddle || !correctionMiddle) {
    return false;
  }

  const missHasVowel = /[aeiouy]/.test(missMiddle);
  const correctionHasVowel = /[aeiouy]/.test(correctionMiddle);
  const missHasConsonant = /[bcdfghjklmnpqrstvwxyz]/.test(missMiddle);
  const correctionHasConsonant = /[bcdfghjklmnpqrstvwxyz]/.test(correctionMiddle);

  if (!missHasVowel || !correctionHasVowel) {
    return false;
  }

  if (missHasConsonant !== correctionHasConsonant) {
    return false;
  }

  const missGroups = getVowelGroups(missMiddle);
  const correctionGroups = getVowelGroups(correctionMiddle);

  return missGroups.length === 1 && correctionGroups.length === 1;
}

function hasWrongConsonantPattern(misspelling: string, correction: string) {
  const { missMiddle, correctionMiddle } = getChangedSegments(
    misspelling,
    correction,
  );

  if (!missMiddle || !correctionMiddle) {
    return false;
  }

  const consonantPatternPairs: Array<[string, string]> = [
    ["k", "ck"],
    ["c", "ck"],
    ["j", "dge"],
    ["g", "dge"],
    ["ge", "dge"],
  ];

  return consonantPatternPairs.some(([missPattern, correctionPattern]) => {
    return (
      (missMiddle === missPattern && correctionMiddle === correctionPattern) ||
      (missMiddle === correctionPattern && correctionMiddle === missPattern)
    );
  });
}

function hasYToIStyleSuffixChange(misspelling: string, correction: string) {
  const directEndings: Array<[string, string]> = [
    ["ys", "ies"],
    ["yed", "ied"],
    ["yer", "ier"],
    ["yest", "iest"],
  ];

  if (
    directEndings.some(
      ([missEnding, correctionEnding]) =>
        misspelling.endsWith(missEnding) &&
        correction.endsWith(correctionEnding) &&
        misspelling.slice(0, -missEnding.length) ===
          correction.slice(0, -correctionEnding.length),
    )
  ) {
    return true;
  }

  const replacementSuffixes = ["ness", "ly", "ed", "er", "est", "es", "s"];

  return replacementSuffixes.some((suffix) => {
    if (!correction.endsWith(suffix)) {
      return false;
    }

    const correctionStem = correction.slice(0, -suffix.length);
    if (!correctionStem.endsWith("i")) {
      return false;
    }

    const misspellingCandidate =
      correctionStem.slice(0, -1) + "y" + suffix;

    return misspellingCandidate === misspelling;
  });
}

function hasWrongDropKeepEBeforeSuffix(misspelling: string, correction: string) {
  const suffixes = ["ing", "able", "ably", "er", "est", "ed"] as const;

  return suffixes.some((suffix) => {
    if (!correction.endsWith(suffix) && !misspelling.endsWith(suffix)) {
      return false;
    }

    if (correction.endsWith(suffix)) {
      const correctionStem = correction.slice(0, -suffix.length);
      const misspellingStem = misspelling.slice(0, -suffix.length);

      if (
        correctionStem.endsWith("e") &&
        `${correctionStem.slice(0, -1)}${suffix}` === misspelling
      ) {
        return true;
      }

      if (
        !correctionStem.endsWith("e") &&
        `${correctionStem}e${suffix}` === misspelling
      ) {
        return true;
      }

      if (
        misspelling.endsWith(suffix) &&
        misspellingStem.endsWith("e") !== correctionStem.endsWith("e") &&
        misspellingStem.replace(/e$/, "") === correctionStem.replace(/e$/, "")
      ) {
        return true;
      }
    }

    return false;
  });
}

function hasWrongConsonantDoublingBeforeSuffix(
  misspelling: string,
  correction: string,
) {
  const suffixes = ["ing", "ed", "er", "est"] as const;

  return suffixes.some((suffix) => {
    if (!correction.endsWith(suffix) || !misspelling.endsWith(suffix)) {
      return false;
    }

    const correctionStem = correction.slice(0, -suffix.length);
    const misspellingStem = misspelling.slice(0, -suffix.length);

    if (correctionStem === misspellingStem) {
      return false;
    }

    if (correctionStem.length < 2 || misspellingStem.length < 1) {
      return false;
    }

    const doubledLetter = correctionStem.at(-1) ?? "";
    const correctionBase = correctionStem.replace(new RegExp(`${doubledLetter}$`), "");

    if (
      isConsonant(doubledLetter) &&
      correctionStem.at(-1) === correctionStem.at(-2) &&
      misspellingStem === correctionBase + doubledLetter
    ) {
      return true;
    }

    const missLetter = misspellingStem.at(-1) ?? "";
    const missBase = misspellingStem.replace(new RegExp(`${missLetter}$`), "");

    return (
      isConsonant(missLetter) &&
      misspellingStem.at(-1) === misspellingStem.at(-2) &&
      correctionStem === missBase + missLetter
    );
  });
}

function hasRootFamilyPreservationError(misspelling: string, correction: string) {
  const prefixes = ["un", "re", "dis", "mis", "pre"] as const;
  const suffixes = ["ing", "ed", "er", "est", "ly", "ness", "tion", "s", "es"] as const;

  const sharedPrefix = prefixes.find(
    (prefix) => misspelling.startsWith(prefix) && correction.startsWith(prefix),
  );
  const sharedSuffix = suffixes.find(
    (suffix) => misspelling.endsWith(suffix) && correction.endsWith(suffix),
  );

  if (!sharedPrefix && !sharedSuffix) {
    return false;
  }

  const { missMiddle, correctionMiddle } = getChangedSegments(misspelling, correction);
  return Boolean(missMiddle && correctionMiddle && missMiddle.length <= 3 && correctionMiddle.length <= 3);
}

function hasConsonantLeElAlEndingError(misspelling: string, correction: string) {
  const endings = ["le", "el", "al"] as const;
  const correctionEnding = endings.find((ending) => correction.endsWith(ending));
  const misspellingEnding = endings.find((ending) => misspelling.endsWith(ending));

  if (!correctionEnding || !misspellingEnding || correctionEnding === misspellingEnding) {
    return false;
  }

  if (correction.length < 3 || misspelling.length < 3) {
    return false;
  }

  const correctionStem = correction.slice(0, -correctionEnding.length);
  const misspellingStem = misspelling.slice(0, -misspellingEnding.length);

  if (correctionStem === misspellingStem) {
    return true;
  }

  const correctionWithoutLastConsonant = correctionStem.slice(0, -1);
  const misspellingWithoutLastConsonant = misspellingStem.slice(0, -1);

  return (
    correctionWithoutLastConsonant.length >= 2 &&
    correctionWithoutLastConsonant === misspellingWithoutLastConsonant &&
    isConsonant(correctionStem.at(-1) ?? "") &&
    isConsonant(misspellingStem.at(-1) ?? "")
  );
}

function isInternalVowelChange(misspelling: string, correction: string) {
  const { prefixLength, suffixLength, missMiddle, correctionMiddle } =
    getChangedSegments(misspelling, correction);

  if (!missMiddle || !correctionMiddle) {
    return false;
  }

  const changedAtStart = prefixLength === 0;
  const changedAtEnd = suffixLength === 0;
  const touchesEnd = prefixLength + correctionMiddle.length >= correction.length;

  if (changedAtStart || changedAtEnd || touchesEnd) {
    return false;
  }

  return /[aeiouy]/.test(missMiddle) && /[aeiouy]/.test(correctionMiddle);
}

function looksLikeUnstressedVowelWord(correction: string) {
  return getVowelGroups(correction).length >= 2;
}

function getSuffixTeachingFamily(
  misspelling: string,
  correction: string,
): WordFamilyId | null {
  if (/(tion|sion|cian)$/.test(correction)) {
    return "tion_sion_suffixes";
  }

  if (/(ied|ies|ier|iest)$/.test(correction)) {
    return "change_y_to_i";
  }

  if (/(ing|ed|er|est|able|ably)$/.test(correction) && /e/.test(correction)) {
    return "drop_keep_final_e_suffixes";
  }

  if (/ing$/.test(correction) && /e$/.test(misspelling)) {
    return "drop_final_e_ing";
  }

  if (/(ing|ed|er|est)$/.test(correction)) {
    const correctionStem = correction.replace(/(ing|ed|er|est)$/, "");
    if (
      correctionStem.length >= 2 &&
      correctionStem.at(-1) === correctionStem.at(-2) &&
      isConsonant(correctionStem.at(-1) ?? "")
    ) {
      return "double_consonant_suffix";
    }

    return "no_double_consonant";
  }

  return null;
}

function detectPhonicFamily(
  misspelling: string,
  correction: string,
): WordFamilyId | null {
  for (const swap of PHONIC_FAMILY_SWAPS) {
    const leftToRight =
      misspelling.includes(swap.left) && correction.includes(swap.right);
    const rightToLeft =
      misspelling.includes(swap.right) && correction.includes(swap.left);

    if (leftToRight || rightToLeft) {
      return swap.familyId;
    }
  }

  return null;
}

export function normaliseErrorPattern(
  errorPattern: string | null | undefined,
): ErrorPattern | null {
  if (!errorPattern) {
    return null;
  }

  if (errorPattern in LEGACY_ERROR_PATTERN_MAP) {
    return LEGACY_ERROR_PATTERN_MAP[errorPattern];
  }

  switch (errorPattern) {
    case "wrong_vowel_grapheme":
    case "wrong_final_vowel_pattern":
    case "ck_pattern_error":
    case "y_to_i_suffix_error":
    case "wrong_consonant_pattern":
    case "missing_double_letter":
    case "missing_final_e":
    case "wrong_drop_keep_e_before_suffix":
    case "extra_consonant_letter":
    case "extra_double_letter":
    case "wrong_consonant_doubling_before_suffix":
    case "omitted_unstressed_vowel":
    case "wrong_suffix_spelling":
    case "wrong_prefix_spelling":
    case "root_family_preservation_error":
    case "consonant_le_el_al_ending_error":
    case "homophone_confusion":
    case "tricky_whole_word_error":
      return errorPattern;
    default:
      return null;
  }
}

export function formatErrorPatternLabel(errorPattern: ErrorPattern | null) {
  if (!errorPattern) {
    return "Not set";
  }

  const labelOverrides: Partial<Record<ErrorPattern, string>> = {
    wrong_drop_keep_e_before_suffix: "Wrong drop/keep e before suffix",
    missing_double_letter: "Missing double letter",
    extra_consonant_letter: "Extra consonant letter",
    extra_double_letter: "Extra double letter",
    wrong_consonant_doubling_before_suffix:
      "Wrong consonant doubling before suffix",
    wrong_suffix_spelling: "Wrong suffix spelling",
    wrong_prefix_spelling: "Wrong prefix spelling",
    root_family_preservation_error: "Root spelling not kept",
    consonant_le_el_al_ending_error: "Wrong final -le / -el / -al pattern",
    ck_pattern_error: "ck pattern error",
    y_to_i_suffix_error: "y to i suffix error",
    tricky_whole_word_error: "Tricky whole-word error",
  };

  if (labelOverrides[errorPattern]) {
    return labelOverrides[errorPattern] ?? "Not set";
  }

  return errorPattern
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export const ERROR_PATTERN_OPTIONS: ErrorPattern[] = [
  "wrong_vowel_grapheme",
  "wrong_final_vowel_pattern",
  "omitted_unstressed_vowel",
  "missing_final_e",
  "wrong_drop_keep_e_before_suffix",
  "missing_double_letter",
  "extra_consonant_letter",
  "extra_double_letter",
  "wrong_consonant_doubling_before_suffix",
  "ck_pattern_error",
  "y_to_i_suffix_error",
  "wrong_suffix_spelling",
  "wrong_prefix_spelling",
  "root_family_preservation_error",
  "consonant_le_el_al_ending_error",
  "wrong_consonant_pattern",
  "homophone_confusion",
  "tricky_whole_word_error",
];

export function detectErrorPattern(
  misspelling: string,
  correction: string,
): ErrorPattern | null {
  if (hasMissingDoubleLetter(misspelling, correction)) {
    return "missing_double_letter";
  }

  if (hasExtraDoubleLetter(misspelling, correction)) {
    return "extra_double_letter";
  }

  if (hasMissingFinalE(misspelling, correction)) {
    return "missing_final_e";
  }

  if (hasWrongDropKeepEBeforeSuffix(misspelling, correction)) {
    return "wrong_drop_keep_e_before_suffix";
  }

  if (hasCkPatternError(misspelling, correction)) {
    return "ck_pattern_error";
  }

  if (hasYToIStyleSuffixChange(misspelling, correction)) {
    return "y_to_i_suffix_error";
  }

  if (hasWrongConsonantDoublingBeforeSuffix(misspelling, correction)) {
    return "wrong_consonant_doubling_before_suffix";
  }

  if (hasWrongSuffix(misspelling, correction)) {
    return "wrong_suffix_spelling";
  }

  if (hasWrongConsonantPattern(misspelling, correction)) {
    return "wrong_consonant_pattern";
  }

  if (hasExtraConsonantLetter(misspelling, correction)) {
    return "extra_consonant_letter";
  }

  if (hasWrongPrefix(misspelling, correction)) {
    return "wrong_prefix_spelling";
  }

  if (hasRootFamilyPreservationError(misspelling, correction)) {
    return "root_family_preservation_error";
  }

  if (isHomophoneConfusion(misspelling, correction)) {
    return "homophone_confusion";
  }

  if (hasConsonantLeElAlEndingError(misspelling, correction)) {
    return "consonant_le_el_al_ending_error";
  }

  if (hasWrongFinalVowelPattern(misspelling, correction)) {
    return "wrong_final_vowel_pattern";
  }

  if (hasOmittedUnstressedVowel(misspelling, correction)) {
    return "omitted_unstressed_vowel";
  }

  if (hasWrongVowelGrapheme(misspelling, correction)) {
    return "wrong_vowel_grapheme";
  }

  if (TRICKY_WORD_SET.has(correction)) {
    return "tricky_whole_word_error";
  }

  return null;
}

export function selectTeachingFamilyForError(
  misspelling: string,
  correction: string,
  errorPattern: ErrorPattern | null,
): WordFamilyId | null {
  const phonicFamily = detectPhonicFamily(misspelling, correction);
  const correctedWordFamily = findWordFamilyForWord(correction)?.id ?? null;

  switch (errorPattern) {
    case "missing_double_letter":
      return "double_letters";
    case "missing_final_e":
      return "silent_e_words";
    case "ck_pattern_error":
      return "ck_pattern";
    case "y_to_i_suffix_error":
      return "change_y_to_i";
    case "wrong_drop_keep_e_before_suffix":
      return "drop_keep_final_e_suffixes";
    case "wrong_consonant_pattern":
      return correction.includes("ck")
        ? "ck_pattern"
        : correctedWordFamily ?? "tricky_common_words";
    case "extra_consonant_letter":
    case "extra_double_letter":
      return correctedWordFamily ?? "double_letters";
    case "wrong_consonant_doubling_before_suffix":
      return "double_consonant_suffix";
    case "omitted_unstressed_vowel":
      return "schwa_unstressed_vowel";
    case "wrong_suffix_spelling":
      return (
        getSuffixTeachingFamily(misspelling, correction) ??
        correctedWordFamily ??
        "suffixes"
      );
    case "wrong_prefix_spelling":
      return correctedWordFamily ?? "common_prefixes";
    case "root_family_preservation_error":
      return correctedWordFamily ?? "root_family_preservation";
    case "consonant_le_el_al_ending_error":
      return "final_le_patterns";
    case "wrong_final_vowel_pattern":
      return phonicFamily ?? correctedWordFamily ?? "tricky_common_words";
    case "wrong_vowel_grapheme":
      if (
        isInternalVowelChange(misspelling, correction) &&
        looksLikeUnstressedVowelWord(correction)
      ) {
        return "schwa_unstressed_vowel";
      }

      if (isInternalVowelChange(misspelling, correction)) {
        return "tricky_common_words";
      }

      return phonicFamily ?? correctedWordFamily ?? "tricky_common_words";
    case "homophone_confusion":
      return (
        findHomophoneSetFamilyForWords(misspelling, correction)?.id ??
        correctedWordFamily ??
        "homophones_year_2"
      );
    case "tricky_whole_word_error":
      return correctedWordFamily ?? "tricky_common_words";
    default:
      return phonicFamily ?? correctedWordFamily ?? null;
  }
}
