import assert from "node:assert/strict";

import {
  readStage2dLessonTemplateRegistryEntry,
  resolveStage2dLessonTemplateKey,
} from "../lib/writing-engine/spelling/stage2d-lesson-template-registry";
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
    allowedTemplateKeys: [" T03 ", "T05", "T03"],
    metadata: {
      dictation_template_key: " DT01 ",
      dictation_template_keys: ["DT02", " DT01 ", "DT02"],
    },
    ...overrides,
  };
}

function testRegistryEntryNormalizesCanonicalTemplateKeysReadOnly() {
  const catalogEntry = buildCatalogEntry();
  const snapshot = structuredClone(catalogEntry);

  const result = readStage2dLessonTemplateRegistryEntry(catalogEntry);

  assert.deepEqual(result, {
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    allowedTemplateKeys: ["T03", "T05"],
    dictationTemplateKey: "DT01",
    dictationTemplateKeys: ["DT02", "DT01"],
    sourceRefs: [
      "micro_skill_catalog.allowed_template_keys",
      "micro_skill_catalog.metadata.dictation_template_key",
      "micro_skill_catalog.metadata.dictation_template_keys",
    ],
  });

  result?.allowedTemplateKeys.push("NEW");
  result?.dictationTemplateKeys.push("NEW-DT");

  assert.deepEqual(catalogEntry, snapshot);
}

function testResolvesPreferredTemplateKeyDeterministically() {
  const catalogEntry = buildCatalogEntry();

  const first = resolveStage2dLessonTemplateKey({
    catalogEntry,
    practiceRoute: "word_practice",
    preferredTemplateKeys: ["T99", " T05 ", "T03"],
  });
  const second = resolveStage2dLessonTemplateKey({
    catalogEntry,
    practiceRoute: "word_practice",
    preferredTemplateKeys: ["T99", " T05 ", "T03"],
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: "resolved",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "word_practice",
    templateKey: "T05",
    sourceRefs: [
      "micro_skill_catalog.allowed_template_keys",
      "micro_skill_catalog.metadata.dictation_template_key",
      "micro_skill_catalog.metadata.dictation_template_keys",
    ],
  });
}

function testReturnsExplicitUnresolvedWhenPreferredTemplateUnavailable() {
  const result = resolveStage2dLessonTemplateKey({
    catalogEntry: buildCatalogEntry(),
    practiceRoute: "contrast_practice",
    preferredTemplateKeys: ["T99", null, " "],
  });

  assert.deepEqual(result, {
    status: "unresolved",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "contrast_practice",
    reason: "preferred_template_key_unavailable",
    sourceRefs: [
      "micro_skill_catalog.allowed_template_keys",
      "micro_skill_catalog.metadata.dictation_template_key",
      "micro_skill_catalog.metadata.dictation_template_keys",
    ],
  });
}

function testResolvesDictationTemplateDeterministically() {
  const result = resolveStage2dLessonTemplateKey({
    catalogEntry: buildCatalogEntry({
      allowedTemplateKeys: ["T03", "DT02", "DT01"],
    }),
    practiceRoute: "dictation",
    preferredTemplateKeys: ["T03"],
  });

  assert.deepEqual(result, {
    status: "resolved",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "dictation",
    templateKey: "DT01",
    sourceRefs: [
      "micro_skill_catalog.allowed_template_keys",
      "micro_skill_catalog.metadata.dictation_template_key",
      "micro_skill_catalog.metadata.dictation_template_keys",
    ],
  });
}

function testReturnsExplicitUnresolvedWhenDictationTemplateMissing() {
  const result = resolveStage2dLessonTemplateKey({
    catalogEntry: buildCatalogEntry({
      allowedTemplateKeys: ["T03", "T05"],
      metadata: {},
    }),
    practiceRoute: "dictation",
  });

  assert.deepEqual(result, {
    status: "unresolved",
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    practiceRoute: "dictation",
    reason: "dictation_template_key_unavailable",
    sourceRefs: [
      "micro_skill_catalog.allowed_template_keys",
      "micro_skill_catalog.metadata.dictation_template_key",
      "micro_skill_catalog.metadata.dictation_template_keys",
    ],
  });
}

function main() {
  testRegistryEntryNormalizesCanonicalTemplateKeysReadOnly();
  testResolvesPreferredTemplateKeyDeterministically();
  testReturnsExplicitUnresolvedWhenPreferredTemplateUnavailable();
  testResolvesDictationTemplateDeterministically();
  testReturnsExplicitUnresolvedWhenDictationTemplateMissing();
  console.log("writing-engine-stage2d-lesson-template-regression: ok");
}

main();
