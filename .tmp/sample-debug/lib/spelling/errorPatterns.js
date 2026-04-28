"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_PATTERN_OPTIONS = void 0;
exports.normaliseErrorPattern = normaliseErrorPattern;
exports.formatErrorPatternLabel = formatErrorPatternLabel;
exports.detectErrorPattern = detectErrorPattern;
exports.selectTeachingFamilyForError = selectTeachingFamilyForError;
const trickyWords_1 = require("./trickyWords");
const wordFamilies_1 = require("./wordFamilies");
const LEGACY_ERROR_PATTERN_MAP = {
    "missing-double-consonant": "missing_double_letter",
    "missing-final-e": "missing_final_e",
    "ck-pattern-error": "ck_pattern_error",
    "y-to-i-suffix-error": "y_to_i_suffix_error",
    "omitted-unstressed-vowel": "omitted_unstressed_vowel",
    "wrong-suffix": "wrong_suffix_spelling",
    "wrong-prefix": "wrong_prefix_spelling",
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
];
const COMMON_PREFIXES = ["un", "re", "dis", "mis", "pre"];
const FINAL_VOWEL_PATTERNS = ["ay", "ai", "ey", "ea", "ie", "y", "e"];
const HOMOPHONE_GROUPS = [
    ["to", "too", "two"],
    ["their", "there", "they're", "theyre"],
    ["hear", "here"],
    ["be", "bee"],
    ["see", "sea"],
    ["weather", "whether"],
    ["whose", "who's", "whos"],
];
const PHONIC_FAMILY_SWAPS = [
    { familyId: "ai-ay", left: "ai", right: "ay" },
    { familyId: "ee-ea", left: "ee", right: "ea" },
    { familyId: "igh-ie-y", left: "igh", right: "ie" },
    { familyId: "oa-ow-oe", left: "oa", right: "ow" },
    { familyId: "ow-ou", left: "ow", right: "ou" },
    { familyId: "ar-or", left: "ar", right: "or" },
    { familyId: "er-ir-ur", left: "er", right: "ir" },
    { familyId: "er-ir-ur", left: "ir", right: "ur" },
    { familyId: "er-ir-ur", left: "ur", right: "er" },
];
function isConsonant(value) {
    return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}
function getVowelGroups(word) {
    return word.match(/[aeiouy]+/g) ?? [];
}
function getSharedPrefixLength(left, right) {
    let index = 0;
    while (index < left.length && index < right.length && left[index] === right[index]) {
        index += 1;
    }
    return index;
}
function getSharedSuffixLength(left, right) {
    let index = 0;
    while (index < left.length &&
        index < right.length &&
        left[left.length - 1 - index] === right[right.length - 1 - index]) {
        index += 1;
    }
    return index;
}
function getChangedSegments(misspelling, correction) {
    const prefixLength = getSharedPrefixLength(misspelling, correction);
    const suffixLength = getSharedSuffixLength(misspelling.slice(prefixLength), correction.slice(prefixLength));
    return {
        prefixLength,
        suffixLength,
        missMiddle: misspelling.slice(prefixLength, Math.max(prefixLength, misspelling.length - suffixLength)),
        correctionMiddle: correction.slice(prefixLength, Math.max(prefixLength, correction.length - suffixLength)),
    };
}
function hasMissingDoubleLetter(misspelling, correction) {
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
function hasMissingFinalE(misspelling, correction) {
    return (correction === `${misspelling}e` &&
        /[aeiou][bcdfghjklmnpqrstvwxyz]{1,2}e$/.test(correction));
}
function hasOmittedUnstressedVowel(misspelling, correction) {
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
function hasWrongSuffix(misspelling, correction) {
    for (const correctionSuffix of COMMON_SUFFIXES) {
        if (!correction.endsWith(correctionSuffix)) {
            continue;
        }
        const correctionStem = correction.slice(0, -correctionSuffix.length);
        for (const misspellingSuffix of COMMON_SUFFIXES) {
            if (misspellingSuffix === correctionSuffix ||
                !misspelling.endsWith(misspellingSuffix)) {
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
function hasWrongPrefix(misspelling, correction) {
    for (const correctionPrefix of COMMON_PREFIXES) {
        if (!correction.startsWith(correctionPrefix)) {
            continue;
        }
        const correctionTail = correction.slice(correctionPrefix.length);
        for (const misspellingPrefix of COMMON_PREFIXES) {
            if (misspellingPrefix === correctionPrefix ||
                !misspelling.startsWith(misspellingPrefix)) {
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
function isHomophoneConfusion(misspelling, correction) {
    return HOMOPHONE_GROUPS.some((group) => {
        const words = Array.from(group);
        return words.includes(misspelling) && words.includes(correction);
    });
}
function hasWrongFinalVowelPattern(misspelling, correction) {
    const correctionPattern = FINAL_VOWEL_PATTERNS.find((pattern) => correction.endsWith(pattern));
    const misspellingPattern = FINAL_VOWEL_PATTERNS.find((pattern) => misspelling.endsWith(pattern));
    if (!correctionPattern || !misspellingPattern || correctionPattern === misspellingPattern) {
        return false;
    }
    const correctionStem = correction.slice(0, -correctionPattern.length);
    const misspellingStem = misspelling.slice(0, -misspellingPattern.length);
    return correctionStem === misspellingStem;
}
function hasCkPatternError(misspelling, correction) {
    if (!correction.includes("ck")) {
        return false;
    }
    return (correction.replace("ck", "k") === misspelling ||
        correction.replace("ck", "c") === misspelling);
}
function hasWrongVowelGrapheme(misspelling, correction) {
    if (misspelling === correction) {
        return false;
    }
    if (hasWrongFinalVowelPattern(misspelling, correction)) {
        return false;
    }
    const { missMiddle, correctionMiddle } = getChangedSegments(misspelling, correction);
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
function hasWrongConsonantPattern(misspelling, correction) {
    const { missMiddle, correctionMiddle } = getChangedSegments(misspelling, correction);
    if (!missMiddle || !correctionMiddle) {
        return false;
    }
    const consonantPatternPairs = [
        ["k", "ck"],
        ["c", "ck"],
        ["j", "dge"],
        ["g", "dge"],
        ["ge", "dge"],
    ];
    return consonantPatternPairs.some(([missPattern, correctionPattern]) => {
        return ((missMiddle === missPattern && correctionMiddle === correctionPattern) ||
            (missMiddle === correctionPattern && correctionMiddle === missPattern));
    });
}
function hasYToIStyleSuffixChange(misspelling, correction) {
    const directEndings = [
        ["ys", "ies"],
        ["yed", "ied"],
        ["yer", "ier"],
        ["yest", "iest"],
    ];
    if (directEndings.some(([missEnding, correctionEnding]) => misspelling.endsWith(missEnding) &&
        correction.endsWith(correctionEnding) &&
        misspelling.slice(0, -missEnding.length) ===
            correction.slice(0, -correctionEnding.length))) {
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
        const misspellingCandidate = correctionStem.slice(0, -1) + "y" + suffix;
        return misspellingCandidate === misspelling;
    });
}
function isInternalVowelChange(misspelling, correction) {
    const { prefixLength, suffixLength, missMiddle, correctionMiddle } = getChangedSegments(misspelling, correction);
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
function looksLikeUnstressedVowelWord(correction) {
    return getVowelGroups(correction).length >= 2;
}
function getSuffixTeachingFamily(misspelling, correction) {
    if (/(ied|ies|ier|iest)$/.test(correction)) {
        return "change_y_to_i";
    }
    if (/ing$/.test(correction) && /e$/.test(misspelling)) {
        return "drop_final_e_ing";
    }
    if (/(ing|ed|er|est)$/.test(correction)) {
        const correctionStem = correction.replace(/(ing|ed|er|est)$/, "");
        if (correctionStem.length >= 2 &&
            correctionStem.at(-1) === correctionStem.at(-2) &&
            isConsonant(correctionStem.at(-1) ?? "")) {
            return "double_consonant_suffix";
        }
        return "no_double_consonant";
    }
    return null;
}
function detectPhonicFamily(misspelling, correction) {
    for (const swap of PHONIC_FAMILY_SWAPS) {
        const leftToRight = misspelling.includes(swap.left) && correction.includes(swap.right);
        const rightToLeft = misspelling.includes(swap.right) && correction.includes(swap.left);
        if (leftToRight || rightToLeft) {
            return swap.familyId;
        }
    }
    return null;
}
function normaliseErrorPattern(errorPattern) {
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
        case "omitted_unstressed_vowel":
        case "wrong_suffix_spelling":
        case "wrong_prefix_spelling":
        case "homophone_confusion":
        case "tricky_whole_word_error":
            return errorPattern;
        default:
            return null;
    }
}
function formatErrorPatternLabel(errorPattern) {
    if (!errorPattern) {
        return "Not set";
    }
    return errorPattern
        .replace(/_/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
}
exports.ERROR_PATTERN_OPTIONS = [
    "wrong_vowel_grapheme",
    "wrong_final_vowel_pattern",
    "ck_pattern_error",
    "y_to_i_suffix_error",
    "wrong_consonant_pattern",
    "missing_double_letter",
    "missing_final_e",
    "omitted_unstressed_vowel",
    "wrong_suffix_spelling",
    "wrong_prefix_spelling",
    "homophone_confusion",
    "tricky_whole_word_error",
];
function detectErrorPattern(misspelling, correction) {
    if (hasMissingDoubleLetter(misspelling, correction)) {
        return "missing_double_letter";
    }
    if (hasMissingFinalE(misspelling, correction)) {
        return "missing_final_e";
    }
    if (hasCkPatternError(misspelling, correction)) {
        return "ck_pattern_error";
    }
    if (hasYToIStyleSuffixChange(misspelling, correction)) {
        return "y_to_i_suffix_error";
    }
    if (hasWrongSuffix(misspelling, correction)) {
        return "wrong_suffix_spelling";
    }
    if (hasWrongConsonantPattern(misspelling, correction)) {
        return "wrong_consonant_pattern";
    }
    if (hasWrongPrefix(misspelling, correction)) {
        return "wrong_prefix_spelling";
    }
    if (isHomophoneConfusion(misspelling, correction)) {
        return "homophone_confusion";
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
    if (trickyWords_1.TRICKY_WORD_SET.has(correction)) {
        return "tricky_whole_word_error";
    }
    return null;
}
function selectTeachingFamilyForError(misspelling, correction, errorPattern) {
    const phonicFamily = detectPhonicFamily(misspelling, correction);
    const correctedWordFamily = (0, wordFamilies_1.findWordFamilyForWord)(correction)?.id ?? null;
    switch (errorPattern) {
        case "missing_double_letter":
            return "double_letters";
        case "missing_final_e":
            return "silent_e_words";
        case "ck_pattern_error":
            return "ck_pattern";
        case "y_to_i_suffix_error":
            return "change_y_to_i";
        case "wrong_consonant_pattern":
            return correction.includes("ck")
                ? "ck_pattern"
                : correctedWordFamily ?? "tricky_common_words";
        case "omitted_unstressed_vowel":
            return "schwa_unstressed_vowel";
        case "wrong_suffix_spelling":
            return (getSuffixTeachingFamily(misspelling, correction) ??
                correctedWordFamily ??
                "suffixes");
        case "wrong_prefix_spelling":
            return correctedWordFamily ?? "tricky_common_words";
        case "wrong_final_vowel_pattern":
            return phonicFamily ?? correctedWordFamily ?? "tricky_common_words";
        case "wrong_vowel_grapheme":
            if (isInternalVowelChange(misspelling, correction) &&
                looksLikeUnstressedVowelWord(correction)) {
                return "schwa_unstressed_vowel";
            }
            if (isInternalVowelChange(misspelling, correction)) {
                return "tricky_common_words";
            }
            return phonicFamily ?? correctedWordFamily ?? "tricky_common_words";
        case "homophone_confusion":
            return ((0, wordFamilies_1.findHomophoneSetFamilyForWords)(misspelling, correction)?.id ??
                correctedWordFamily ??
                "homophones_year_2");
        case "tricky_whole_word_error":
            return correctedWordFamily ?? "tricky_common_words";
        default:
            return phonicFamily ?? correctedWordFamily ?? null;
    }
}
