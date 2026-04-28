"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isKnownWord = isKnownWord;
exports.levenshteinDistance = levenshteinDistance;
exports.suggestCorrection = suggestCorrection;
const commonMisspellings_1 = require("./lexicon/commonMisspellings");
const lexicon_1 = require("./lexicon");
const trickyWords_1 = require("./trickyWords");
const wordFamilies_1 = require("./wordFamilies");
const PHONIC_SUBSTITUTIONS = [
    ["f", "ph"],
    ["ph", "f"],
    ["k", "ck"],
    ["ck", "k"],
    ["ai", "ay"],
    ["ay", "ai"],
    ["ee", "ea"],
    ["ea", "ee"],
    ["oa", "ow"],
    ["ow", "oa"],
    ["ow", "ou"],
    ["ou", "ow"],
    ["ie", "igh"],
    ["igh", "ie"],
    ["er", "ir"],
    ["ir", "ur"],
    ["ur", "er"],
];
function isKnownWord(word) {
    return lexicon_1.KNOWN_WORD_SET.has(word);
}
function levenshteinDistance(source, target) {
    const rows = source.length + 1;
    const cols = target.length + 1;
    const table = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let row = 0; row < rows; row += 1) {
        table[row][0] = row;
    }
    for (let col = 0; col < cols; col += 1) {
        table[0][col] = col;
    }
    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            const substitutionCost = source[row - 1] === target[col - 1] ? 0 : 1;
            table[row][col] = Math.min(table[row - 1][col] + 1, table[row][col - 1] + 1, table[row - 1][col - 1] + substitutionCost);
        }
    }
    return table[source.length][target.length];
}
function generateHeuristicVariants(word) {
    const variants = new Set([word]);
    // These swaps target common British primary spelling confusions.
    for (const [from, to] of PHONIC_SUBSTITUTIONS) {
        if (word.includes(from)) {
            variants.add(word.replace(from, to));
        }
    }
    // These small edits catch omitted silent e and doubled-consonant issues.
    if (!word.endsWith("e")) {
        variants.add(`${word}e`);
    }
    if (word.endsWith("e")) {
        variants.add(word.slice(0, -1));
    }
    variants.add(word.replace(/([bcdfghjklmnpqrstvwxyz])\1/g, "$1"));
    // Add a controlled doubled-consonant variant for cases such as adress -> address.
    for (let index = 1; index < word.length; index += 1) {
        const current = word[index];
        const previous = word[index - 1];
        if (current !== previous && /^[bcdfghjklmnpqrstvwxyz]$/.test(current)) {
            variants.add(`${word.slice(0, index)}${current}${word.slice(index)}`);
        }
    }
    for (let index = 1; index < word.length; index += 1) {
        const left = word[index - 1];
        const right = word[index];
        if (left === right) {
            continue;
        }
        variants.add(`${word.slice(0, index - 1)}${right}${left}${word.slice(index + 1)}`);
    }
    if (word.endsWith("ys")) {
        variants.add(`${word.slice(0, -2)}ies`);
    }
    if (word.endsWith("ies")) {
        variants.add(`${word.slice(0, -3)}ys`);
    }
    return variants;
}
function scoreCandidate(input, candidate) {
    const distance = levenshteinDistance(input, candidate);
    const startsSame = input[0] === candidate[0] ? 0.15 : 0;
    const trickyBonus = trickyWords_1.TRICKY_WORD_SET.has(candidate) ? 0.1 : 0;
    const endsSame = input.at(-1) === candidate.at(-1) ? 0.05 : 0;
    const lengthPenalty = Math.abs(candidate.length - input.length) * 0.08;
    const rawScore = (1 -
        distance / Math.max(input.length, candidate.length) +
        startsSame +
        endsSame +
        trickyBonus -
        lengthPenalty);
    return Math.min(1, Math.max(0, rawScore));
}
function sharesStrongShape(input, candidate) {
    if (candidate[0] !== input[0]) {
        return false;
    }
    if (input.length >= 4 && candidate.at(-1) !== input.at(-1)) {
        return false;
    }
    return true;
}
function hasAdjacentTransposition(source, target) {
    if (source.length !== target.length || source.length < 2) {
        return false;
    }
    for (let index = 0; index < source.length - 1; index += 1) {
        const swapped = source.slice(0, index) +
            source[index + 1] +
            source[index] +
            source.slice(index + 2);
        if (swapped === target) {
            return true;
        }
    }
    return false;
}
function suggestCorrection(word) {
    if (!word || (0, lexicon_1.isKnownWordLike)(word)) {
        return null;
    }
    const mappedCorrection = commonMisspellings_1.COMMON_MISSPELLINGS[word];
    if (mappedCorrection && lexicon_1.KNOWN_WORD_SET.has(mappedCorrection)) {
        return {
            word: mappedCorrection,
            confidence: 0.99,
            editDistance: levenshteinDistance(word, mappedCorrection),
            wordFamilyId: (0, wordFamilies_1.findWordFamilyForWord)(mappedCorrection)?.id ?? null,
        };
    }
    let bestCandidate = null;
    const heuristicVariants = generateHeuristicVariants(word);
    for (const candidate of lexicon_1.SUGGESTION_WORDS) {
        const lengthDifference = Math.abs(candidate.length - word.length);
        if (lengthDifference > 1) {
            continue;
        }
        const distance = levenshteinDistance(word, candidate);
        const heuristicMatch = heuristicVariants.has(candidate);
        const transpositionMatch = hasAdjacentTransposition(word, candidate);
        if (distance > 1 && !heuristicMatch) {
            continue;
        }
        if (!sharesStrongShape(word, candidate) && !heuristicMatch) {
            continue;
        }
        // Short words need strong evidence; otherwise valid simple words get "corrected" too often.
        if (word.length <= 4 && !heuristicMatch && !transpositionMatch) {
            continue;
        }
        if (word.length <= 4 && distance > 1) {
            continue;
        }
        const confidence = scoreCandidate(word, candidate);
        if (confidence < 0.78) {
            continue;
        }
        if (!bestCandidate ||
            confidence > bestCandidate.confidence ||
            (confidence === bestCandidate.confidence &&
                distance < bestCandidate.editDistance)) {
            bestCandidate = {
                word: candidate,
                confidence: Number(confidence.toFixed(2)),
                editDistance: distance,
                wordFamilyId: (0, wordFamilies_1.findWordFamilyForWord)(candidate)?.id ?? null,
            };
        }
    }
    return bestCandidate;
}
