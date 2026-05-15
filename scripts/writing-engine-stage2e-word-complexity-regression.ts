import assert from "node:assert/strict";

import { resolveStage2eWordComplexity } from "../lib/writing-engine/spelling/stage2e-word-complexity-resolver";
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
      starter_word_bank: [
        { word: " Cat ", difficulty: "easy" },
        { word: "map", difficulty: "medium" },
        { word: "sprint", difficulty: "hard" },
      ],
    },
    ...overrides,
  };
}

function testResolvesCanonicalComplexityMetadataDeterministically() {
  const catalogEntry = buildCatalogEntry();

  const first = resolveStage2eWordComplexity({
    word: "  map ",
    catalogEntry,
  });
  const second = resolveStage2eWordComplexity({
    word: "  map ",
    catalogEntry,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: "resolved",
    normalizedWord: "map",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    complexityBand: "extended",
    source: "starter_word_bank_difficulty",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank[].word",
      "micro_skill_catalog.metadata.starter_word_bank[].difficulty",
    ],
  });
}

function testReturnsExplicitUnknownWordOutcome() {
  const result = resolveStage2eWordComplexity({
    word: "unknown",
    catalogEntry: buildCatalogEntry(),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "unknown",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "unknown_word_complexity",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank[].word",
      "micro_skill_catalog.metadata.starter_word_bank[].difficulty",
    ],
  });
}

function testReturnsExplicitUnavailableOutcomeWhenMetadataMissing() {
  const result = resolveStage2eWordComplexity({
    word: "cat",
    catalogEntry: buildCatalogEntry({
      metadata: {
        starter_word_bank: [{ word: "cat" }],
      },
    }),
  });

  assert.deepEqual(result, {
    status: "unresolved",
    normalizedWord: "cat",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    reason: "complexity_metadata_unavailable",
    sourceRefs: [
      "micro_skill_catalog.metadata.starter_word_bank[].word",
      "micro_skill_catalog.metadata.starter_word_bank[].difficulty",
    ],
  });
}

function testReturnsExplicitMissingWordOutcome() {
  const result = resolveStage2eWordComplexity({
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
  const result = resolveStage2eWordComplexity({
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
  testResolvesCanonicalComplexityMetadataDeterministically();
  testReturnsExplicitUnknownWordOutcome();
  testReturnsExplicitUnavailableOutcomeWhenMetadataMissing();
  testReturnsExplicitMissingWordOutcome();
  testReturnsExplicitOutOfScopeOutcome();
  console.log("writing-engine-stage2e-word-complexity-regression: ok");
}

main();
