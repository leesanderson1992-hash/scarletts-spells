export type ValidWordRegressionCase = {
  word: string;
};

export type MisspellingRegressionCase = {
  misspelling: string;
  expectedSuggestion: string;
};

export type DiagnosisRegressionCase = {
  misspelling: string;
  expectedSuggestion: string;
  expectedDiagnosis: string;
};

export const validWordsMustNotBeFlagged: ValidWordRegressionCase[] = [
  { word: "makes" },
  { word: "easy" },
  { word: "running" },
  { word: "stopped" },
  { word: "people" },
  { word: "business" },
  { word: "through" },
  { word: "favourite" },
  { word: "school" },
  { word: "money" },
  { word: "tastes" },
  { word: "smelly" },
  { word: "tests" },
  { word: "workflow" },
  { word: "intro" },
  { word: "ingredient" },
  { word: "tomato" },
  { word: "harissa" },
  { word: "appear" },
  { word: "arrive" },
  { word: "believe" },
  { word: "centre" },
  { word: "favourite" },
  { word: "thought" },
];

export const misspellingsMustBeCaught: MisspellingRegressionCase[] = [
  { misspelling: "tast", expectedSuggestion: "taste" },
  { misspelling: "sweetner", expectedSuggestion: "sweetener" },
  { misspelling: "tuday", expectedSuggestion: "today" },
  { misspelling: "todai", expectedSuggestion: "today" },
  { misspelling: "definatly", expectedSuggestion: "definitely" },
  { misspelling: "agian", expectedSuggestion: "again" },
  { misspelling: "allways", expectedSuggestion: "always" },
  { misspelling: "happyness", expectedSuggestion: "happiness" },
  { misspelling: "becuase", expectedSuggestion: "because" },
  { misspelling: "becouse", expectedSuggestion: "because" },
  { misspelling: "becos", expectedSuggestion: "because" },
  { misspelling: "caried", expectedSuggestion: "carried" },
  { misspelling: "chiken", expectedSuggestion: "chicken" },
  { misspelling: "coud", expectedSuggestion: "could" },
  { misspelling: "crazyness", expectedSuggestion: "craziness" },
  { misspelling: "crazys", expectedSuggestion: "crazies" },
  { misspelling: "difrent", expectedSuggestion: "different" },
  { misspelling: "familys", expectedSuggestion: "families" },
  { misspelling: "frend", expectedSuggestion: "friend" },
  { misspelling: "freind", expectedSuggestion: "friend" },
  { misspelling: "freinds", expectedSuggestion: "friends" },
  { misspelling: "gud", expectedSuggestion: "good" },
  { misspelling: "happest", expectedSuggestion: "happiest" },
  { misspelling: "happyer", expectedSuggestion: "happier" },
  { misspelling: "thier", expectedSuggestion: "their" },
  { misspelling: "scholl", expectedSuggestion: "school" },
  { misspelling: "peple", expectedSuggestion: "people" },
  { misspelling: "partys", expectedSuggestion: "parties" },
  { misspelling: "mony", expectedSuggestion: "money" },
  { misspelling: "remeber", expectedSuggestion: "remember" },
  { misspelling: "ingrediance", expectedSuggestion: "ingredient" },
  { misspelling: "tamato", expectedSuggestion: "tomato" },
  { misspelling: "harrisa", expectedSuggestion: "harissa" },
  { misspelling: "apear", expectedSuggestion: "appear" },
  { misspelling: "arive", expectedSuggestion: "arrive" },
  { misspelling: "beleive", expectedSuggestion: "believe" },
  { misspelling: "buisness", expectedSuggestion: "business" },
  { misspelling: "calender", expectedSuggestion: "calendar" },
  { misspelling: "favorit", expectedSuggestion: "favourite" },
  { misspelling: "ocasion", expectedSuggestion: "occasion" },
  { misspelling: "sentance", expectedSuggestion: "sentence" },
  { misspelling: "tryed", expectedSuggestion: "tried" },
  { misspelling: "untill", expectedSuggestion: "until" },
  { misspelling: "verrry", expectedSuggestion: "very" },
];

export const ambiguousCasesForReview: MisspellingRegressionCase[] = [
  { misspelling: "seperate", expectedSuggestion: "separate" },
  { misspelling: "adress", expectedSuggestion: "address" },
  { misspelling: "writting", expectedSuggestion: "writing" },
  { misspelling: "lite", expectedSuggestion: "light" },
];

export const diagnosisMustBePopulated: DiagnosisRegressionCase[] = [
  {
    misspelling: "tast",
    expectedSuggestion: "taste",
    expectedDiagnosis: "missing_final_e",
  },
  {
    misspelling: "chiken",
    expectedSuggestion: "chicken",
    expectedDiagnosis: "ck_pattern_error",
  },
  {
    misspelling: "realy",
    expectedSuggestion: "really",
    expectedDiagnosis: "missing_double_letter",
  },
  {
    misspelling: "happyness",
    expectedSuggestion: "happiness",
    expectedDiagnosis: "y_to_i_suffix_error",
  },
  {
    misspelling: "tuday",
    expectedSuggestion: "today",
    expectedDiagnosis: "wrong_vowel_grapheme",
  },
];
