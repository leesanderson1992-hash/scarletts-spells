"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const spellingRegressionCases_1 = require("../lib/spelling/spellingRegressionCases");
const detectMisspellings_1 = require("../lib/spelling/detectMisspellings");
function getDetection(word) {
    return (0, detectMisspellings_1.detectMisspellings)(word)[0] ?? null;
}
const falsePositives = spellingRegressionCases_1.validWordsMustNotBeFlagged.flatMap(({ word }) => {
    const detected = getDetection(word);
    return detected
        ? [
            {
                input: word,
                actual: detected.correction,
                confidence: detected.confidence,
            },
        ]
        : [];
});
const missedMisspellings = spellingRegressionCases_1.misspellingsMustBeCaught.flatMap(({ misspelling, expectedSuggestion }) => {
    const detected = getDetection(misspelling);
    return !detected
        ? [
            {
                input: misspelling,
                expected: expectedSuggestion,
            },
        ]
        : [];
});
const wrongSuggestions = spellingRegressionCases_1.misspellingsMustBeCaught.flatMap(({ misspelling, expectedSuggestion }) => {
    const detected = getDetection(misspelling);
    if (!detected || detected.correction === expectedSuggestion) {
        return [];
    }
    return [
        {
            input: misspelling,
            expected: expectedSuggestion,
            actual: detected.correction,
        },
    ];
});
const ambiguousReview = spellingRegressionCases_1.ambiguousCasesForReview.map(({ misspelling, expectedSuggestion }) => {
    const detected = getDetection(misspelling);
    return {
        input: misspelling,
        expected: expectedSuggestion,
        actual: detected?.correction ?? null,
        category: detected?.category ?? null,
        confidence: detected?.confidence ?? null,
    };
});
const diagnosisProblems = spellingRegressionCases_1.diagnosisMustBePopulated.flatMap(({ misspelling, expectedSuggestion, expectedDiagnosis }) => {
    const detected = getDetection(misspelling);
    if (detected &&
        detected.correction === expectedSuggestion &&
        detected.errorPattern === expectedDiagnosis) {
        return [];
    }
    return [
        {
            input: misspelling,
            expectedSuggestion,
            expectedDiagnosis,
            actualSuggestion: detected?.correction ?? null,
            actualDiagnosis: detected?.errorPattern ?? null,
        },
    ];
});
function printSection(title, rows) {
    console.log(`\n${title}`);
    if (rows.length === 0) {
        console.log("  none");
        return;
    }
    for (const row of rows) {
        console.log(`  ${JSON.stringify(row)}`);
    }
}
console.log("Spelling regression results");
printSection("False positives", falsePositives);
printSection("Missed misspellings", missedMisspellings);
printSection("Wrong suggestions", wrongSuggestions);
printSection("Diagnosis problems", diagnosisProblems);
printSection("Ambiguous cases for review", ambiguousReview);
