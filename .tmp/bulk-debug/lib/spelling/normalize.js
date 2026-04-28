"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWord = normalizeWord;
exports.isNormalisedWord = isNormalisedWord;
const NON_LETTER_EDGE_PATTERN = /^[^a-z]+|[^a-z]+$/g;
const INNER_NON_LETTER_PATTERN = /[^a-z]/g;
function normalizeWord(input) {
    return input
        .normalize("NFKD")
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(NON_LETTER_EDGE_PATTERN, "")
        .replace(INNER_NON_LETTER_PATTERN, "");
}
function isNormalisedWord(value) {
    return /^[a-z]+$/.test(value);
}
