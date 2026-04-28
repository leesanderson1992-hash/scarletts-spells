"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_NAME_SET = exports.SAFE_WORD_SET = exports.SUGGESTION_WORD_SET = exports.KNOWN_WORD_SET = exports.SUGGESTION_WORDS = exports.KNOWN_WORDS = void 0;
exports.isKnownWordLike = isKnownWordLike;
exports.isSafeWord = isSafeWord;
exports.isKnownName = isKnownName;
const baseValidWords_1 = require("./lexicon/baseValidWords");
const knownNames_1 = require("./lexicon/knownNames");
const safeWords_1 = require("./lexicon/safeWords");
const trickyWords_1 = require("./trickyWords");
const wordFamilies_1 = require("./wordFamilies");
exports.KNOWN_WORDS = Array.from(new Set([
    ...baseValidWords_1.BASE_VALID_WORDS.map((word) => word.toLowerCase()),
    ...safeWords_1.SAFE_WORDS.map((word) => word.toLowerCase()),
    ...knownNames_1.KNOWN_NAMES.map((word) => word.toLowerCase()),
    ...trickyWords_1.TRICKY_WORDS,
    ...wordFamilies_1.WORD_FAMILIES.flatMap((family) => family.practiceWords),
].sort()));
exports.SUGGESTION_WORDS = Array.from(new Set([
    ...baseValidWords_1.BASE_VALID_WORDS.map((word) => word.toLowerCase()),
    ...trickyWords_1.TRICKY_WORDS,
    ...wordFamilies_1.WORD_FAMILIES.flatMap((family) => family.practiceWords),
].sort()));
exports.KNOWN_WORD_SET = new Set(exports.KNOWN_WORDS);
exports.SUGGESTION_WORD_SET = new Set(exports.SUGGESTION_WORDS);
exports.SAFE_WORD_SET = new Set(safeWords_1.SAFE_WORDS);
exports.KNOWN_NAME_SET = new Set(knownNames_1.KNOWN_NAMES);
function isConsonant(value) {
    return /^[bcdfghjklmnpqrstvwxyz]$/.test(value);
}
function hasConsonantBeforeTrailingY(word) {
    return word.length >= 3 && word.endsWith("ys") && isConsonant(word[word.length - 3]);
}
function hasDoubledFinalConsonant(word) {
    if (word.length < 2) {
        return false;
    }
    const last = word.at(-1) ?? "";
    const secondLast = word.at(-2) ?? "";
    return last === secondLast && isConsonant(last);
}
function buildPossibleBaseForms(word) {
    const bases = new Set();
    // Accept common plurals and third-person singular forms such as makes, plays and boxes.
    if (word.endsWith("ies") && word.length > 3) {
        bases.add(`${word.slice(0, -3)}y`);
    }
    if (word.endsWith("es") && word.length > 2) {
        bases.add(word.slice(0, -2));
    }
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 1) {
        if (!hasConsonantBeforeTrailingY(word)) {
            bases.add(word.slice(0, -1));
        }
    }
    // Accept regular past tense forms such as jumped, baked and stopped.
    if (word.endsWith("ied") && word.length > 3) {
        bases.add(`${word.slice(0, -3)}y`);
    }
    if (word.endsWith("ed") && word.length > 2) {
        const stem = word.slice(0, -2);
        bases.add(stem);
        bases.add(`${stem}e`);
        if (hasDoubledFinalConsonant(stem)) {
            bases.add(stem.slice(0, -1));
        }
    }
    // Accept regular -ing forms such as making, jumping and stopping.
    if (word.endsWith("ing") && word.length > 3) {
        const stem = word.slice(0, -3);
        bases.add(stem);
        bases.add(`${stem}e`);
        if (hasDoubledFinalConsonant(stem)) {
            bases.add(stem.slice(0, -1));
        }
    }
    return Array.from(bases).filter((base) => base.length > 1);
}
function isKnownWordLike(word) {
    if (exports.KNOWN_WORD_SET.has(word)) {
        return true;
    }
    return buildPossibleBaseForms(word).some((base) => exports.KNOWN_WORD_SET.has(base));
}
function isSafeWord(word) {
    return exports.SAFE_WORD_SET.has(word);
}
function isKnownName(word) {
    return exports.KNOWN_NAME_SET.has(word);
}
