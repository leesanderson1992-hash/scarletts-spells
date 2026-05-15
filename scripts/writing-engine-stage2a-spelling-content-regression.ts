import assert from "node:assert/strict";

import {
  getStage2SpellingContentSourceAudit,
  resolveStage2SpellingCatalogContent,
} from "../lib/writing-engine/spelling/stage2a-content-resolver";
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
    allowedTemplateKeys: ["T03", "T05"],
    metadata: {
      teaching_point:
        "In CVC words, each spoken sound should be represented in order.",
      starter_word_bank: [{ word: "cat" }, { word: "map" }],
      example_words: ["sat", "pan"],
    },
    ...overrides,
  };
}

function testSourceAuditExposesConfirmedAndBlockedStatuses() {
  const audit = getStage2SpellingContentSourceAudit();

  assert.equal(
    audit.templateRegistryCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(audit.errorCategoryVocabulary.availability, "confirmed_canonical");
  assert.equal(audit.errorCategoryVocabulary.isPresent, true);
  assert.deepEqual(
    audit.errorCategoryVocabulary.value?.map((category) => category.code),
    [
      "phonic",
      "pattern_rule",
      "morphology",
      "homophone",
      "irregular_tricky_memory_word",
      "careless_performance_error",
    ],
  );
  assert.deepEqual(audit.templateRegistryCandidates.sourceRefs, [
    "micro_skill_catalog.allowed_template_keys",
    "micro_skill_catalog.metadata.dictation_template_key",
    "micro_skill_catalog.metadata.dictation_template_keys",
  ]);

  assert.equal(audit.groupedMetadata.availability, "confirmed_canonical");
  assert.equal(audit.contrastMetadata.availability, "confirmed_canonical");
  assert.equal(audit.dictationMetadata.availability, "confirmed_canonical");

  assert.equal(
    audit.wordToMiniSkillMappingData.availability,
    "candidate_only",
  );
  assert.equal(
    audit.wordComplexityMetadataCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(
    audit.similarPracticeWordCandidates.availability,
    "confirmed_canonical",
  );
}

function testResolverExposesConfirmedCatalogContentReadOnly() {
  const catalogEntry = buildCatalogEntry();
  const result = resolveStage2SpellingCatalogContent(catalogEntry);

  assert.equal(
    result.templateRegistryCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(result.templateRegistryCandidates.isPresent, true);
  assert.deepEqual(result.templateRegistryCandidates.value, {
    allowedTemplateKeys: ["T03", "T05"],
    dictationTemplateKey: null,
    dictationTemplateKeys: [],
  });

  assert.equal(result.groupedMetadata.availability, "confirmed_canonical");
  assert.equal(result.groupedMetadata.isPresent, true);
  assert.deepEqual(result.groupedMetadata.value, {
    teachingPoint:
      "In CVC words, each spoken sound should be represented in order.",
    practiceWords: ["cat", "map", "sat", "pan"],
  });

  assert.equal(
    result.similarPracticeWordCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(result.similarPracticeWordCandidates.isPresent, true);
  assert.deepEqual(result.similarPracticeWordCandidates.value, {
    candidateWords: ["cat", "map", "sat", "pan"],
  });

  assert.equal(
    result.wordComplexityMetadataCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(result.wordComplexityMetadataCandidates.isPresent, false);
  assert.equal(result.wordComplexityMetadataCandidates.value, null);
}

function testResolverExposesContrastAndDictationMetadataWhenPresent() {
  const contrastCatalogEntry = buildCatalogEntry({
    practiceRoute: "contrast_practice",
    metadata: {
      teaching_point:
        "Listen for the vowel change and spell each word carefully.",
      contrast_word_bank: [" Cat ", "cot", "cat", "cut"],
      starter_word_bank: [{ word: "cot" }, { word: "cut" }],
      example_words: ["CUT", "cat"],
    },
  });
  const contrastResult =
    resolveStage2SpellingCatalogContent(contrastCatalogEntry);

  assert.equal(contrastResult.contrastMetadata.availability, "confirmed_canonical");
  assert.equal(contrastResult.contrastMetadata.isPresent, true);
  assert.deepEqual(contrastResult.contrastMetadata.value, {
    teachingPoint:
      "Listen for the vowel change and spell each word carefully.",
    candidateWords: ["cat", "cot", "cut"],
  });

  const dictationCatalogEntry = buildCatalogEntry({
    practiceRoute: "dictation",
    allowedTemplateKeys: ["T03", "DT01", "DT02"],
    metadata: {
      teaching_point:
        "In CVC words, each spoken sound should be represented in order.",
      dictation_template_key: "DT01",
      dictation_template_keys: ["  DT02 ", "DT01", "DT02"],
      dictation_support_text:
        "Say the word clearly, then write the whole word.",
    },
  });
  const dictationResult =
    resolveStage2SpellingCatalogContent(dictationCatalogEntry);

  assert.equal(dictationResult.dictationMetadata.availability, "confirmed_canonical");
  assert.equal(dictationResult.dictationMetadata.isPresent, true);
  assert.deepEqual(dictationResult.dictationMetadata.value, {
    teachingPoint:
      "In CVC words, each spoken sound should be represented in order.",
    supportText: "Say the word clearly, then write the whole word.",
    dictationTemplateKey: "DT01",
    dictationTemplateKeys: ["DT02", "DT01"],
  });
}

function testResolverExposesWordComplexityMetadataWhenPresent() {
  const catalogEntry = buildCatalogEntry({
    metadata: {
      starter_word_bank: [
        { word: " Cat ", difficulty: "easy" },
        { word: "map", difficulty: "medium" },
        { word: "sprint", difficulty: "hard" },
        { word: "cat", difficulty: "hard" },
        { word: "skip", difficulty: "unsupported" },
      ],
    },
  });
  const result = resolveStage2SpellingCatalogContent(catalogEntry);

  assert.equal(
    result.wordComplexityMetadataCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(result.wordComplexityMetadataCandidates.isPresent, true);
  assert.deepEqual(result.wordComplexityMetadataCandidates.value, {
    words: [
      {
        normalizedWord: "cat",
        complexityBand: "basic",
        source: "starter_word_bank_difficulty",
      },
      {
        normalizedWord: "map",
        complexityBand: "extended",
        source: "starter_word_bank_difficulty",
      },
      {
        normalizedWord: "sprint",
        complexityBand: "complex_transfer",
        source: "starter_word_bank_difficulty",
      },
    ],
  });
}

function testResolverReturnsExplicitUnavailableForUnconfirmedSources() {
  const catalogEntry = buildCatalogEntry({
    allowedTemplateKeys: [],
    metadata: {},
  });
  const result = resolveStage2SpellingCatalogContent(catalogEntry);

  assert.equal(result.wordComplexityMetadataCandidates.availability, "confirmed_canonical");
  assert.equal(result.wordComplexityMetadataCandidates.isPresent, false);
  assert.equal(result.wordComplexityMetadataCandidates.value, null);

  assert.equal(
    result.similarPracticeWordCandidates.availability,
    "confirmed_canonical",
  );
  assert.equal(result.similarPracticeWordCandidates.isPresent, false);
  assert.equal(result.similarPracticeWordCandidates.value, null);

  assert.equal(result.groupedMetadata.availability, "confirmed_canonical");
  assert.equal(result.groupedMetadata.isPresent, false);
  assert.equal(result.groupedMetadata.value, null);
}

function testResolverDoesNotMutateCatalogEntryOrShareWriteableAliases() {
  const catalogEntry = buildCatalogEntry({
    metadata: {
      teaching_point:
        "In CVC words, each spoken sound should be represented in order.",
      starter_word_bank: [{ word: " Cat " }, { word: "cat" }, { word: "map" }],
      example_words: ["SAT", " pan "],
      contrast_word_bank: ["cot", "cut"],
      dictation_template_keys: ["DT01"],
    },
  });
  const snapshot = structuredClone(catalogEntry);
  const result = resolveStage2SpellingCatalogContent(catalogEntry);

  result.groupedMetadata.value?.practiceWords.push("new-word");
  result.contrastMetadata.value?.candidateWords.push("new-contrast");
  result.templateRegistryCandidates.value?.allowedTemplateKeys.push("NEW");
  result.dictationMetadata.value?.dictationTemplateKeys.push("NEW-DT");
  result.similarPracticeWordCandidates.value?.candidateWords.push("new-similar");
  result.wordComplexityMetadataCandidates.value?.words.push({
    normalizedWord: "extra",
    complexityBand: "basic",
    source: "starter_word_bank_difficulty",
  });

  assert.deepEqual(catalogEntry, snapshot);
}

function main() {
  testSourceAuditExposesConfirmedAndBlockedStatuses();
  testResolverExposesConfirmedCatalogContentReadOnly();
  testResolverExposesContrastAndDictationMetadataWhenPresent();
  testResolverExposesWordComplexityMetadataWhenPresent();
  testResolverReturnsExplicitUnavailableForUnconfirmedSources();
  testResolverDoesNotMutateCatalogEntryOrShareWriteableAliases();
  console.log("writing-engine-stage2a-spelling-content-regression: ok");
}

main();
