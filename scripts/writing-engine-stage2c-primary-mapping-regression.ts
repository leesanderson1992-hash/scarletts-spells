import assert from "node:assert/strict";

import {
  resolveStage2PrimaryWordToMiniSkillFromBoundary,
  resolveStage2PrimaryWordToMiniSkillFromCatalogEntry,
} from "../lib/writing-engine/spelling/stage2c-primary-mapping-resolver";
import { resolveStage2CatalogWordToMiniSkillBoundary } from "../lib/writing-engine/spelling/stage2c-mapping-source-boundary";
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
      starter_word_bank: [{ word: "Cat" }, { word: "map" }],
      example_words: ["sat", " map "],
      contrast_word_bank: ["cap", { word: "mat" }],
    },
    ...overrides,
  };
}

function testResolverMapsKnownCandidateWordsDeterministically() {
  const catalogEntry = buildCatalogEntry();

  assert.deepEqual(
    resolveStage2PrimaryWordToMiniSkillFromCatalogEntry({
      word: "  CAT ",
      catalogEntry,
    }),
    {
      status: "resolved",
      normalizedWord: "cat",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      sourceClassification: "candidate_only",
      sourceRefs: [
        "micro_skill_catalog.metadata.starter_word_bank",
        "micro_skill_catalog.metadata.example_words",
        "micro_skill_catalog.metadata.contrast_word_bank",
      ],
    },
  );

  assert.deepEqual(
    resolveStage2PrimaryWordToMiniSkillFromCatalogEntry({
      word: "mat",
      catalogEntry,
    }),
    {
      status: "resolved",
      normalizedWord: "mat",
      microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      sourceClassification: "candidate_only",
      sourceRefs: [
        "micro_skill_catalog.metadata.starter_word_bank",
        "micro_skill_catalog.metadata.example_words",
        "micro_skill_catalog.metadata.contrast_word_bank",
      ],
    },
  );
}

function testResolverReturnsExplicitUnmappedResult() {
  const result = resolveStage2PrimaryWordToMiniSkillFromCatalogEntry({
    word: "dog",
    catalogEntry: buildCatalogEntry(),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    reason: "unmapped_word",
    normalizedWord: "dog",
    sourceClassification: "candidate_only",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
      "micro_skill_catalog.metadata.contrast_word_bank",
    ],
  });
}

function testResolverReturnsExplicitUnavailableResultWhenCandidatesDoNotExist() {
  const result = resolveStage2PrimaryWordToMiniSkillFromCatalogEntry({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      metadata: {},
    }),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    reason: "candidate_words_unavailable",
    normalizedWord: "cat",
    sourceClassification: "candidate_only",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
      "micro_skill_catalog.metadata.contrast_word_bank",
    ],
  });
}

function testResolverBlocksOutOfScopeBoundariesAndMissingWords() {
  const outOfScopeResult = resolveStage2PrimaryWordToMiniSkillFromCatalogEntry({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      microSkillKey: "P1_SOMETHING",
      masteryDomainKey: "P1",
    }),
  });

  assert.deepEqual(outOfScopeResult, {
    status: "unresolved",
    reason: "out_of_scope_boundary",
    normalizedWord: "cat",
    sourceClassification: "canonical",
    sourceRefs: [
      "micro_skill_catalog.micro_skill_key",
      "micro_skill_catalog.mastery_domain_key",
    ],
  });

  const boundary = resolveStage2CatalogWordToMiniSkillBoundary(buildCatalogEntry());
  const missingWordResult = resolveStage2PrimaryWordToMiniSkillFromBoundary({
    word: "   ",
    boundary,
  });

  assert.deepEqual(missingWordResult, {
    status: "unresolved",
    reason: "missing_word",
    normalizedWord: null,
    sourceClassification: "candidate_only",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
      "micro_skill_catalog.metadata.contrast_word_bank",
    ],
  });
}

function main() {
  testResolverMapsKnownCandidateWordsDeterministically();
  testResolverReturnsExplicitUnmappedResult();
  testResolverReturnsExplicitUnavailableResultWhenCandidatesDoNotExist();
  testResolverBlocksOutOfScopeBoundariesAndMissingWords();
  console.log("writing-engine-stage2c-primary-mapping-regression: ok");
}

main();
