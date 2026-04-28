"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePracticeSet = generatePracticeSet;
const wordFamilies_1 = require("./wordFamilies");
function dedupeWords(words) {
    return Array.from(new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)));
}
function fitsFamilyWell(word, familyId) {
    const family = (0, wordFamilies_1.getWordFamilyById)(familyId);
    if (!family) {
        return false;
    }
    if (familyId === "tricky-words") {
        return true;
    }
    return family.practiceWords.includes(word) || (0, wordFamilies_1.matchesWordFamily)(word, familyId);
}
function generatePracticeSet(familyId, correctedWords, focusWord) {
    const family = familyId ? (0, wordFamilies_1.getWordFamilyById)(familyId) : undefined;
    const candidates = dedupeWords(correctedWords);
    const normalisedFocusWord = focusWord ? focusWord.trim().toLowerCase() : null;
    const usableFocusWord = familyId && normalisedFocusWord && fitsFamilyWell(normalisedFocusWord, familyId)
        ? normalisedFocusWord
        : null;
    const fittedCandidateWords = familyId && family
        ? candidates.filter((word) => fitsFamilyWell(word, family.id))
        : candidates;
    const orderedWords = dedupeWords([
        ...(usableFocusWord ? [usableFocusWord] : []),
        ...(family?.practiceWords ?? []),
        ...fittedCandidateWords,
    ]);
    return {
        familyId,
        focusWord: usableFocusWord,
        words: orderedWords.slice(0, 6),
    };
}
