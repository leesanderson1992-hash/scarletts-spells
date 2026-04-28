"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeachingModeForDiagnosis = getTeachingModeForDiagnosis;
exports.categoriseError = categoriseError;
exports.getSecondaryCategory = getSecondaryCategory;
const trickyWords_1 = require("./trickyWords");
const suggestCorrection_1 = require("./suggestCorrection");
function hasPhonicSwap(misspelling, correction) {
    const swaps = [
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
        return (misspelling.includes(left) &&
            correction.includes(right)) || (misspelling.includes(right) &&
            correction.includes(left));
    });
}
function isSingleTransposition(misspelling, correction) {
    if (misspelling.length !== correction.length || misspelling.length < 2) {
        return false;
    }
    for (let index = 0; index < misspelling.length - 1; index += 1) {
        const swapped = misspelling.slice(0, index) +
            misspelling[index + 1] +
            misspelling[index] +
            misspelling.slice(index + 2);
        if (swapped === correction) {
            return true;
        }
    }
    return false;
}
function getTeachingModeForDiagnosis(errorPattern, correction) {
    switch (errorPattern) {
        case "wrong_vowel_grapheme":
        case "wrong_final_vowel_pattern":
        case "omitted_unstressed_vowel":
            return "Phonic";
        case "ck_pattern_error":
        case "y_to_i_suffix_error":
        case "missing_double_letter":
        case "missing_final_e":
        case "wrong_consonant_pattern":
        case "wrong_suffix_spelling":
            return "Pattern/rule";
        case "wrong_prefix_spelling":
            return "Morphology";
        case "homophone_confusion":
            return "Homophone";
        case "tricky_whole_word_error":
            return trickyWords_1.TRICKY_WORD_SET.has(correction)
                ? "Irregular/tricky memory word"
                : "Irregular/tricky memory word";
        default:
            return null;
    }
}
function categoriseError(misspelling, correction, errorPattern = null) {
    const diagnosisCategory = getTeachingModeForDiagnosis(errorPattern, correction);
    if (diagnosisCategory) {
        return diagnosisCategory;
    }
    if (errorPattern === "homophone_confusion") {
        return "Homophone";
    }
    // Irregular memory words are prioritised because they often break sound-based rules.
    if (trickyWords_1.TRICKY_WORD_SET.has(correction)) {
        return "Irregular/tricky memory word";
    }
    if (isSingleTransposition(misspelling, correction)) {
        return "Careless performance error";
    }
    // Morphology covers suffix and inflection choices such as -ed, -ing and plurals.
    if (/(ed|ing|er|est|ly|tion|s|es|ies)$/.test(correction) &&
        !misspelling.endsWith(correction.slice(-2))) {
        return "Morphology";
    }
    // Pattern / rule catches doubled consonants, silent e and split-digraph conventions.
    if (/([bcdfghjklmnpqrstvwxyz])\1/.test(correction) ||
        /[aeiou][^aeiou]e$/.test(correction) ||
        correction.endsWith("ck") ||
        correction.endsWith("dge")) {
        return "Pattern/rule";
    }
    // Phonic is used when the error looks like a plausible sound-based substitution.
    if (hasPhonicSwap(misspelling, correction)) {
        return "Phonic";
    }
    if (isSingleTransposition(misspelling, correction) &&
        (0, suggestCorrection_1.levenshteinDistance)(misspelling, correction) === 1) {
        return "Careless performance error";
    }
    return "Irregular/tricky memory word";
}
function getSecondaryCategory(misspelling, correction, primaryCategory, errorPattern = null) {
    const diagnosisCategory = getTeachingModeForDiagnosis(errorPattern, correction);
    if (diagnosisCategory && diagnosisCategory !== primaryCategory) {
        return diagnosisCategory;
    }
    if (primaryCategory !== "Phonic" && hasPhonicSwap(misspelling, correction)) {
        return "Phonic";
    }
    if (primaryCategory !== "Pattern/rule" &&
        (/([bcdfghjklmnpqrstvwxyz])\1/.test(correction) ||
            /[aeiou][^aeiou]e$/.test(correction) ||
            correction.endsWith("ck") ||
            correction.endsWith("dge"))) {
        return "Pattern/rule";
    }
    if (primaryCategory !== "Morphology" &&
        /(ed|ing|er|est|ly|tion|s|es|ies)$/.test(correction)) {
        return "Morphology";
    }
    if (primaryCategory !== "Homophone" && errorPattern === "homophone_confusion") {
        return "Homophone";
    }
    if (primaryCategory !== "Irregular/tricky memory word" &&
        trickyWords_1.TRICKY_WORD_SET.has(correction)) {
        return "Irregular/tricky memory word";
    }
    if (primaryCategory !== "Careless performance error" &&
        isSingleTransposition(misspelling, correction)) {
        return "Careless performance error";
    }
    return null;
}
