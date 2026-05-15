import assert from "node:assert/strict";

import { resolveStage2fSimilarPractice } from "../lib/writing-engine/spelling/stage2f-similar-practice-resolver";
import type { WritingEngineStage1d1CatalogEntry } from "../lib/writing-engine/types";

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage1d1CatalogEntry>,
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_CVC_SHORT_VOWELS",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    displayName: "Short /a/ in CVC words",
    allowedTemplateKeys: ["T03"],
    metadata: {
      starter_word_bank: [{ word: " Cat " }, { word: "map" }],
      example_words: ["sat", "pan", "cat"],
    },
    ...overrides,
  };
}

function testResolvesDeterministicOrderedSimilarPracticeWords() {
  const catalogEntry = buildCatalogEntry();

  const first = resolveStage2fSimilarPractice({
    word: " cat ",
    catalogEntry,
  });
  const second = resolveStage2fSimilarPractice({
    word: " cat ",
    catalogEntry,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: "resolved",
    normalizedWord: "cat",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    similarPracticeWords: ["map", "sat", "pan"],
    source: "catalog_grouped_practice_words",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
    ],
  });
}

function testReturnsExplicitUnderPopulatedOutcome() {
  const result = resolveStage2fSimilarPractice({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      metadata: {
        starter_word_bank: [{ word: "cat" }, { word: "map" }],
      },
    }),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "cat",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "under_populated_similar_practice",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
    ],
  });
}

function testReturnsExplicitUnavailableOutcomeWhenMetadataMissing() {
  const result = resolveStage2fSimilarPractice({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      metadata: {},
    }),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "cat",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "similar_practice_unavailable",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
    ],
  });
}

function testReturnsExplicitUnsupportedAnchorOutcome() {
  const result = resolveStage2fSimilarPractice({
    word: "dog",
    catalogEntry: buildCatalogEntry(),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "dog",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "unsupported_anchor_word",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
    ],
  });
}

function testReturnsExplicitMissingWordOutcome() {
  const result = resolveStage2fSimilarPractice({
    word: " ",
    catalogEntry: buildCatalogEntry(),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: null,
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "missing_word",
    sourceRefs: [],
  });
}

function testReturnsExplicitOutOfScopeOutcome() {
  const result = resolveStage2fSimilarPractice({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      microSkillKey: "D5_OTHER",
      masteryDomainKey: "D5",
    }),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "cat",
    microSkillKey: "D5_OTHER",
    reason: "out_of_scope_boundary",
    sourceRefs: [],
  });
}

function main() {
  testResolvesDeterministicOrderedSimilarPracticeWords();
  testReturnsExplicitUnderPopulatedOutcome();
  testReturnsExplicitUnavailableOutcomeWhenMetadataMissing();
  testReturnsExplicitUnsupportedAnchorOutcome();
  testReturnsExplicitMissingWordOutcome();
  testReturnsExplicitOutOfScopeOutcome();
  console.log("writing-engine-stage2f-similar-practice-regression: ok");
}

main();
