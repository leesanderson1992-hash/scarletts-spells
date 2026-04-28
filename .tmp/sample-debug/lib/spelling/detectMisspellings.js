"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectMisspellings = detectMisspellings;
exports.analyseSpellingSample = analyseSpellingSample;
const categoriseError_1 = require("./categoriseError");
const commonMisspellings_1 = require("./lexicon/commonMisspellings");
const errorPatterns_1 = require("./errorPatterns");
const generatePracticeSet_1 = require("./generatePracticeSet");
const normalize_1 = require("./normalize");
const scheduleReview_1 = require("./scheduleReview");
const selectWordFamily_1 = require("./selectWordFamily");
const lexicon_1 = require("./lexicon");
const suggestCorrection_1 = require("./suggestCorrection");
const tokenize_1 = require("./tokenize");
const wordFamilies_1 = require("./wordFamilies");
function shouldSkipToken(token) {
    if (!token.normalized || token.normalized.length <= 2) {
        return true;
    }
    if (!(0, normalize_1.isNormalisedWord)(token.normalized)) {
        return true;
    }
    // Skip known names. For other capitalised unknowns, only analyse them when
    // we have an explicit high-value mapping rather than a loose heuristic guess.
    if (token.isCapitalised && (0, lexicon_1.isKnownName)(token.normalized)) {
        return true;
    }
    if (token.isCapitalised &&
        !(0, suggestCorrection_1.isKnownWord)(token.normalized) &&
        !commonMisspellings_1.COMMON_MISSPELLINGS[token.normalized]) {
        return true;
    }
    return false;
}
function detectMisspellings(text) {
    const seen = new Set();
    return (0, tokenize_1.tokenizeText)(text).flatMap((token) => {
        if (shouldSkipToken(token)) {
            return [];
        }
        const normalised = (0, normalize_1.normalizeWord)(token.normalized);
        if (!normalised || (0, lexicon_1.isKnownWordLike)(normalised) || (0, suggestCorrection_1.isKnownWord)(normalised)) {
            return [];
        }
        const suggestion = (0, suggestCorrection_1.suggestCorrection)(normalised);
        if (!suggestion || suggestion.word === normalised) {
            return [];
        }
        const key = `${token.start}:${normalised}:${suggestion.word}`;
        if (seen.has(key)) {
            return [];
        }
        seen.add(key);
        const errorPattern = (0, errorPatterns_1.detectErrorPattern)(normalised, suggestion.word);
        const category = (0, categoriseError_1.categoriseError)(normalised, suggestion.word, errorPattern);
        const teachingFamilyId = (0, errorPatterns_1.selectTeachingFamilyForError)(normalised, suggestion.word, errorPattern) ??
            suggestion.wordFamilyId ??
            (0, wordFamilies_1.findWordFamilyForWord)(suggestion.word)?.id ??
            null;
        return [
            {
                token,
                misspelling: normalised,
                correction: suggestion.word,
                confidence: suggestion.confidence,
                errorPattern,
                category,
                secondaryCategory: (0, categoriseError_1.getSecondaryCategory)(normalised, suggestion.word, category, errorPattern),
                wordFamilyId: teachingFamilyId,
            },
        ];
    });
}
function analyseSpellingSample(text, startDate = new Date()) {
    const misspellings = detectMisspellings(text);
    const mainTargetFamily = (0, selectWordFamily_1.selectWordFamily)(misspellings.map((item) => ({
        misspelling: item.misspelling,
        correction: item.correction,
        category: item.category,
        errorPattern: item.errorPattern,
        wordFamilyId: item.wordFamilyId,
    })));
    return {
        misspellings,
        mainTargetFamily,
        dailyPracticeSet: (0, generatePracticeSet_1.generatePracticeSet)(mainTargetFamily?.id ?? null, misspellings.map((item) => item.correction)),
        reviewSchedule: (0, scheduleReview_1.scheduleReview)(startDate),
    };
}
