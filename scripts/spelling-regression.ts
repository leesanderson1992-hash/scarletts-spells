import {
  ambiguousCasesForReview,
  diagnosisMustBePopulated,
  misspellingsMustBeCaught,
  validWordsMustNotBeFlagged,
} from "../lib/spelling/spellingRegressionCases";
import { detectMisspellings } from "../lib/spelling/detectMisspellings";

type WrongSuggestion = {
  input: string;
  expected: string;
  actual: string | null;
};

function getDetection(word: string) {
  return detectMisspellings(word)[0] ?? null;
}

const falsePositives = validWordsMustNotBeFlagged.flatMap(({ word }) => {
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

const missedMisspellings = misspellingsMustBeCaught.flatMap(
  ({ misspelling, expectedSuggestion }) => {
    const detected = getDetection(misspelling);

    return !detected
      ? [
          {
            input: misspelling,
            expected: expectedSuggestion,
          },
        ]
      : [];
  },
);

const wrongSuggestions = misspellingsMustBeCaught.flatMap(
  ({ misspelling, expectedSuggestion }): WrongSuggestion[] => {
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
  },
);

const ambiguousReview = ambiguousCasesForReview.map(
  ({ misspelling, expectedSuggestion }) => {
    const detected = getDetection(misspelling);

    return {
      input: misspelling,
      expected: expectedSuggestion,
      actual: detected?.correction ?? null,
      category: detected?.category ?? null,
      confidence: detected?.confidence ?? null,
    };
  },
);

const diagnosisProblems = diagnosisMustBePopulated.flatMap(
  ({ misspelling, expectedSuggestion, expectedDiagnosis }) => {
    const detected = getDetection(misspelling);

    if (
      detected &&
      detected.correction === expectedSuggestion &&
      detected.errorPattern === expectedDiagnosis
    ) {
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
  },
);

function printSection(title: string, rows: unknown[]) {
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
