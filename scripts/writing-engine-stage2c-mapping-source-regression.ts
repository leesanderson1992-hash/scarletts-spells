import assert from "node:assert/strict";

import {
  getStage2WordToMiniSkillMappingSourceAudit,
  resolveStage2CatalogWordToMiniSkillBoundary,
} from "../lib/writing-engine/spelling/stage2c-mapping-source-boundary";
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

function testSourceAuditClassifiesCurrentSourcesExplicitly() {
  const audit = getStage2WordToMiniSkillMappingSourceAudit();

  assert.equal(audit.identityAnchor.classification, "canonical");
  assert.equal(audit.identityAnchor.isPresent, true);
  assert.deepEqual(audit.identityAnchor.value, {
    identityTable: "micro_skill_catalog",
    masteryDomainKey: "D4",
  });

  assert.equal(audit.catalogWordListCandidates.classification, "candidate_only");
  assert.equal(
    audit.manualDiagnosticRuntimeMicroSkillSuggestions.classification,
    "candidate_only",
  );
  assert.equal(
    audit.manualDiagnosticTeachingFamilySuggestions.classification,
    "candidate_only",
  );
  assert.equal(
    audit.canonicalWordToMiniSkillMappingTruth.classification,
    "blocked",
  );
  assert.equal(audit.canonicalWordToMiniSkillMappingTruth.isPresent, false);
}

function testSourceAuditPreservesCurrentCandidateSourceDetailsReadOnly() {
  const audit = getStage2WordToMiniSkillMappingSourceAudit();

  assert.deepEqual(
    audit.manualDiagnosticRuntimeMicroSkillSuggestions.value?.exampleMicroSkillKeys,
    [
      "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
      "D4_PG_CVC_SHORT_VOWELS_SHORT_E",
      "D4_PG_CVC_SHORT_VOWELS_SHORT_I",
      "D4_PG_CVC_SHORT_VOWELS_SHORT_O",
      "D4_PG_CVC_SHORT_VOWELS_SHORT_U",
      "D4_PG_CONSONANT_BLENDS_BLEND_OMISSION_CHECK",
      "D4_PG_LONG_AI_SPLIT_A_E",
      "D4_PG_LONG_AI_MEDIAL_AI",
      "D4_PG_LONG_AI_FINAL_AY",
      "D4_PG_LONG_AI_AI_AY_CONTRAST",
    ],
  );
  assert.deepEqual(
    audit.manualDiagnosticTeachingFamilySuggestions.value?.familyIds,
    [
      "ai-ay",
      "silent_e_words",
      "double_consonant_suffix",
      "schwa_unstressed_vowel",
      "homophones_year_2",
      "homophones_year_3_4",
      "homophone_there_their_theyre",
      "homophone_to_too_two",
      "homophone_weather_whether",
      "homophone_whose_whos",
      "tricky_common_words",
    ],
  );

  audit.manualDiagnosticRuntimeMicroSkillSuggestions.value?.exampleMicroSkillKeys.push(
    "NEW_KEY",
  );

  const rereadAudit = getStage2WordToMiniSkillMappingSourceAudit();
  assert.equal(
    rereadAudit.manualDiagnosticRuntimeMicroSkillSuggestions.value?.exampleMicroSkillKeys.includes(
      "NEW_KEY",
    ),
    false,
  );
}

function testCatalogBoundaryExposesReadOnlyCandidateWordsWithoutPromotingTruth() {
  const catalogEntry = buildCatalogEntry();
  const result = resolveStage2CatalogWordToMiniSkillBoundary(catalogEntry);

  assert.equal(result.identityAnchor.classification, "canonical");
  assert.equal(result.identityAnchor.isPresent, true);
  assert.deepEqual(result.identityAnchor.value, {
    identityTable: "micro_skill_catalog",
    masteryDomainKey: "D4",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
  });

  assert.equal(result.catalogWordListCandidates.classification, "candidate_only");
  assert.equal(result.catalogWordListCandidates.isPresent, true);
  assert.deepEqual(result.catalogWordListCandidates.value, {
    mappedMicroSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    candidateWords: ["cat", "map", "sat", "cap", "mat"],
  });

  result.catalogWordListCandidates.value?.candidateWords.push("new-word");
  assert.equal(
    resolveStage2CatalogWordToMiniSkillBoundary(catalogEntry).catalogWordListCandidates.value?.candidateWords.includes(
      "new-word",
    ),
    false,
  );
}

function testCatalogBoundaryBlocksOutOfScopeDomainsAndHandlesMissingWords() {
  const emptySpellingEntry = buildCatalogEntry({
    metadata: {},
  });
  const emptySpellingResult =
    resolveStage2CatalogWordToMiniSkillBoundary(emptySpellingEntry);

  assert.equal(emptySpellingResult.catalogWordListCandidates.classification, "candidate_only");
  assert.equal(emptySpellingResult.catalogWordListCandidates.isPresent, false);
  assert.equal(emptySpellingResult.catalogWordListCandidates.value, null);

  const nonSpellingEntry = buildCatalogEntry({
    microSkillKey: "P1_SOMETHING",
    masteryDomainKey: "P1",
  });
  const nonSpellingResult =
    resolveStage2CatalogWordToMiniSkillBoundary(nonSpellingEntry);

  assert.equal(nonSpellingResult.identityAnchor.classification, "canonical");
  assert.equal(nonSpellingResult.identityAnchor.isPresent, false);
  assert.equal(nonSpellingResult.identityAnchor.value, null);
  assert.equal(nonSpellingResult.catalogWordListCandidates.classification, "blocked");
  assert.equal(nonSpellingResult.catalogWordListCandidates.isPresent, false);
  assert.equal(nonSpellingResult.catalogWordListCandidates.value, null);
}

function main() {
  testSourceAuditClassifiesCurrentSourcesExplicitly();
  testSourceAuditPreservesCurrentCandidateSourceDetailsReadOnly();
  testCatalogBoundaryExposesReadOnlyCandidateWordsWithoutPromotingTruth();
  testCatalogBoundaryBlocksOutOfScopeDomainsAndHandlesMissingWords();
  console.log("writing-engine-stage2c-mapping-source-regression: ok");
}

main();
