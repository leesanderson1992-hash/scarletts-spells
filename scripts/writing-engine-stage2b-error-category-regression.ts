import assert from "node:assert/strict";

import {
  getWritingEngineSpellingErrorCategoryVocabulary,
  resolveWritingEngineSpellingErrorCategory,
} from "../lib/writing-engine/spelling/stage2b-error-category-vocabulary";

function testVocabularyIsFiniteStableAndOrdered() {
  const vocabulary = getWritingEngineSpellingErrorCategoryVocabulary();

  assert.deepEqual(
    vocabulary.map((category) => ({
      code: category.code,
      label: category.label,
    })),
    [
      { code: "phonic", label: "Phonic" },
      { code: "pattern_rule", label: "Pattern/rule" },
      { code: "morphology", label: "Morphology" },
      { code: "homophone", label: "Homophone" },
      {
        code: "irregular_tricky_memory_word",
        label: "Irregular/tricky memory word",
      },
      {
        code: "careless_performance_error",
        label: "Careless performance error",
      },
    ],
  );
}

function testNormalizationResolvesCurrentRuntimeLabelsDeterministically() {
  assert.deepEqual(resolveWritingEngineSpellingErrorCategory("Phonic"), {
    status: "resolved",
    normalizedInput: "phonic",
    category: {
      code: "phonic",
      label: "Phonic",
      meaning:
        "The error mainly reflects sound-to-spelling choice, phoneme-grapheme selection, or vowel/consonant representation.",
      aliases: ["phonic"],
    },
  });

  assert.equal(
    resolveWritingEngineSpellingErrorCategory("Pattern/rule").status,
    "resolved",
  );
  assert.equal(
    resolveWritingEngineSpellingErrorCategory("pattern_rule").status,
    "resolved",
  );
  assert.equal(
    resolveWritingEngineSpellingErrorCategory("pattern rule").status,
    "resolved",
  );
  assert.equal(
    resolveWritingEngineSpellingErrorCategory("Irregular/tricky memory word").status,
    "resolved",
  );
  assert.equal(
    resolveWritingEngineSpellingErrorCategory("careless-performance-error").status,
    "resolved",
  );
}

function testUnknownAndMissingCategoriesAreSurfacedExplicitly() {
  assert.deepEqual(resolveWritingEngineSpellingErrorCategory(null), {
    status: "unresolved",
    reason: "missing_category",
    normalizedInput: null,
    matchingCodes: [],
  });

  assert.deepEqual(resolveWritingEngineSpellingErrorCategory(""), {
    status: "unresolved",
    reason: "missing_category",
    normalizedInput: null,
    matchingCodes: [],
  });

  assert.deepEqual(resolveWritingEngineSpellingErrorCategory("Grammar"), {
    status: "unresolved",
    reason: "unknown_category",
    normalizedInput: "grammar",
    matchingCodes: [],
  });
}

function testVocabularyResultsAreReadOnlyCopies() {
  const vocabulary = getWritingEngineSpellingErrorCategoryVocabulary();
  const mutableAliases = vocabulary[0].aliases as string[];
  mutableAliases.push("new-alias");

  const secondRead = getWritingEngineSpellingErrorCategoryVocabulary();
  assert.deepEqual(secondRead[0].aliases, ["phonic"]);
}

function main() {
  testVocabularyIsFiniteStableAndOrdered();
  testNormalizationResolvesCurrentRuntimeLabelsDeterministically();
  testUnknownAndMissingCategoriesAreSurfacedExplicitly();
  testVocabularyResultsAreReadOnlyCopies();
  console.log("writing-engine-stage2b-error-category-regression: ok");
}

main();
