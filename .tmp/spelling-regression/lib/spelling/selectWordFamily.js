"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectWordFamily = selectWordFamily;
const errorPatterns_1 = require("./errorPatterns");
const wordFamilies_1 = require("./wordFamilies");
const CATEGORY_FALLBACKS = {
    Phonic: "ai-ay",
    "Pattern/rule": "silent_e_words",
    Morphology: "suffixes",
    Homophone: "homophones_year_2",
    "Irregular/tricky memory word": "tricky_common_words",
    "Careless performance error": "tricky_common_words",
};
function selectWordFamily(items) {
    if (items.length === 0) {
        return null;
    }
    const scores = new Map();
    for (const item of items) {
        const teachingFamilyId = item.wordFamilyId ??
            (0, errorPatterns_1.selectTeachingFamilyForError)(item.misspelling, item.correction, item.errorPattern);
        if (teachingFamilyId) {
            scores.set(teachingFamilyId, (scores.get(teachingFamilyId) ?? 0) + 3);
            continue;
        }
        const correctedWordFamilyId = (0, wordFamilies_1.findWordFamilyForWord)(item.correction)?.id;
        if (correctedWordFamilyId) {
            scores.set(correctedWordFamilyId, (scores.get(correctedWordFamilyId) ?? 0) + 1);
            continue;
        }
        const fallbackFamilyId = CATEGORY_FALLBACKS[item.category];
        scores.set(fallbackFamilyId, (scores.get(fallbackFamilyId) ?? 0) + 1);
    }
    const bestFamilyId = Array.from(scores.entries()).sort((left, right) => {
        return right[1] - left[1];
    })[0]?.[0];
    return bestFamilyId ? (0, wordFamilies_1.getWordFamilyById)(bestFamilyId) ?? null : null;
}
