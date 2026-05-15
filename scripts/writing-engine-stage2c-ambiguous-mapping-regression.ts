import assert from "node:assert/strict";

import {
  resolveStage2PrimaryWordToMiniSkillAcrossBoundaries,
  resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries,
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
      example_words: ["sat"],
    },
    ...overrides,
  };
}

function testAmbiguousMappingReturnsExplicitAmbiguousResult() {
  const longAEntry = buildCatalogEntry({
    microSkillKey: "D4_PG_LONG_AI_FINAL_AY",
    skillClusterKey: "D4_PG_LONG_AI",
    displayName: "Long /a/ final ay",
    metadata: {
      starter_word_bank: [{ word: "play" }, { word: "tray" }],
      example_words: ["day"],
    },
  });
  const longAContrastEntry = buildCatalogEntry({
    microSkillKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
    skillClusterKey: "D4_PG_LONG_AI",
    displayName: "Long /a/ ai/ay contrast",
    metadata: {
      starter_word_bank: [{ word: "play" }, { word: "rain" }],
      example_words: ["trail"],
    },
  });

  const result = resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries({
    word: " PLAY ",
    catalogEntries: [longAEntry, longAContrastEntry],
  });

  assert.deepEqual(result, {
    status: "ambiguous",
    reason: "multiple_micro_skill_matches",
    normalizedWord: "play",
    matchingMicroSkillKeys: [
      "D4_PG_LONG_AI_FINAL_AY",
      "D4_PG_LONG_AI_AI_AY_CONTRAST",
    ],
    sourceClassification: "candidate_only",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
      "micro_skill_catalog.metadata.contrast_word_bank",
    ],
  });
}

function testSameMicroSkillDuplicateMatchesStillResolveDeterministically() {
  const firstEntry = buildCatalogEntry({
    metadata: {
      starter_word_bank: [{ word: "cat" }],
    },
  });
  const duplicateEntry = buildCatalogEntry({
    metadata: {
      starter_word_bank: [{ word: "cat" }, { word: "cab" }],
    },
  });

  const result = resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries({
    word: "cat",
    catalogEntries: [firstEntry, duplicateEntry],
  });

  assert.deepEqual(result, {
    status: "resolved",
    normalizedWord: "cat",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    sourceClassification: "candidate_only",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank",
      "micro_skill_catalog.metadata.example_words",
      "micro_skill_catalog.metadata.contrast_word_bank",
    ],
  });
}

function testAcrossBoundariesDoesNotGuessForUnmappedWords() {
  const boundaries = [
    resolveStage2CatalogWordToMiniSkillBoundary(
      buildCatalogEntry({
        metadata: {
          starter_word_bank: [{ word: "cat" }],
        },
      }),
    ),
    resolveStage2CatalogWordToMiniSkillBoundary(
      buildCatalogEntry({
        microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_E",
        metadata: {
          starter_word_bank: [{ word: "bed" }],
        },
      }),
    ),
  ];

  const snapshot = structuredClone(boundaries);
  const result = resolveStage2PrimaryWordToMiniSkillAcrossBoundaries({
    word: "dog",
    boundaries,
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
  assert.deepEqual(boundaries, snapshot);
}

function testCandidateOnlyDataRemainsCandidateOnlyWhenAmbiguous() {
  const result = resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries({
    word: "play",
    catalogEntries: [
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_FINAL_AY",
        metadata: {
          starter_word_bank: [{ word: "play" }],
        },
      }),
      buildCatalogEntry({
        microSkillKey: "D4_PG_LONG_AI_AI_AY_CONTRAST",
        metadata: {
          starter_word_bank: [{ word: "play" }],
        },
      }),
    ],
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.sourceClassification, "candidate_only");
}

function main() {
  testAmbiguousMappingReturnsExplicitAmbiguousResult();
  testSameMicroSkillDuplicateMatchesStillResolveDeterministically();
  testAcrossBoundariesDoesNotGuessForUnmappedWords();
  testCandidateOnlyDataRemainsCandidateOnlyWhenAmbiguous();
  console.log("writing-engine-stage2c-ambiguous-mapping-regression: ok");
}

main();
