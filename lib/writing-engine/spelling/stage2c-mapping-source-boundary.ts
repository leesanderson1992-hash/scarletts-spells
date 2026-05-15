import type { WritingEngineSourceMetadata, WritingEngineStage1d1CatalogEntry } from "../types";

export const WRITING_ENGINE_STAGE2_MAPPING_SOURCE_CLASSIFICATIONS = [
  "canonical",
  "candidate_only",
  "blocked",
] as const;

export type WritingEngineStage2MappingSourceClassification =
  (typeof WRITING_ENGINE_STAGE2_MAPPING_SOURCE_CLASSIFICATIONS)[number];

export type WritingEngineStage2MappingSourceResolution<T> = {
  classification: WritingEngineStage2MappingSourceClassification;
  isPresent: boolean;
  sourceRefs: string[];
  note: string;
  value: T | null;
};

export type WritingEngineStage2MappingIdentityAnchor = {
  identityTable: "micro_skill_catalog";
  masteryDomainKey: "D4";
};

export type WritingEngineStage2CatalogWordListMappingCandidate = {
  mappedMicroSkillKey: string;
  candidateWords: string[];
};

export type WritingEngineStage2ManualDiagnosticMicroSkillCandidate = {
  kind: "manual_diagnostic_runtime_micro_skill_suggestions";
  exampleMicroSkillKeys: string[];
};

export type WritingEngineStage2ManualDiagnosticFamilyCandidate = {
  kind: "manual_diagnostic_teaching_family_suggestions";
  familyIds: string[];
};

export type WritingEngineStage2WordToMiniSkillMappingSourceAudit = {
  identityAnchor: WritingEngineStage2MappingSourceResolution<WritingEngineStage2MappingIdentityAnchor>;
  catalogWordListCandidates: WritingEngineStage2MappingSourceResolution<null>;
  manualDiagnosticRuntimeMicroSkillSuggestions: WritingEngineStage2MappingSourceResolution<WritingEngineStage2ManualDiagnosticMicroSkillCandidate>;
  manualDiagnosticTeachingFamilySuggestions: WritingEngineStage2MappingSourceResolution<WritingEngineStage2ManualDiagnosticFamilyCandidate>;
  canonicalWordToMiniSkillMappingTruth: WritingEngineStage2MappingSourceResolution<null>;
};

export type WritingEngineStage2CatalogWordToMiniSkillBoundary = {
  identityAnchor: WritingEngineStage2MappingSourceResolution<WritingEngineStage2MappingIdentityAnchor & {
    microSkillKey: string;
  }>;
  catalogWordListCandidates: WritingEngineStage2MappingSourceResolution<WritingEngineStage2CatalogWordListMappingCandidate>;
};

const CANONICAL_IDENTITY_SOURCE_REFS = [
  "micro_skill_catalog.micro_skill_key",
  "micro_skill_catalog.mastery_domain_key",
] as const;

const CATALOG_WORD_LIST_CANDIDATE_SOURCE_REFS = [
  "micro_skill_catalog.metadata.starter_word_bank",
  "micro_skill_catalog.metadata.example_words",
  "micro_skill_catalog.metadata.contrast_word_bank",
] as const;

const MANUAL_DIAGNOSTIC_RUNTIME_SOURCE_REFS = [
  "lib/writing-engine/spelling/manual-diagnostic-rules.ts",
  "lib/writing-engine/spelling/manual-diagnostic-catalog.ts",
] as const;

function createResolution<T>(input: {
  classification: WritingEngineStage2MappingSourceClassification;
  isPresent: boolean;
  sourceRefs: readonly string[];
  note: string;
  value: T | null;
}): WritingEngineStage2MappingSourceResolution<T> {
  return {
    classification: input.classification,
    isPresent: input.isPresent,
    sourceRefs: [...input.sourceRefs],
    note: input.note,
    value: input.value,
  };
}

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function readStarterWordBankWords(metadata: WritingEngineSourceMetadata) {
  const starterWordBank = metadata.starter_word_bank;

  if (!Array.isArray(starterWordBank)) {
    return [] as string[];
  }

  return starterWordBank.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const word = "word" in entry ? entry.word : null;
    return typeof word === "string" ? [word] : [];
  });
}

function readExampleWords(metadata: WritingEngineSourceMetadata) {
  const exampleWords = metadata.example_words;

  if (!Array.isArray(exampleWords)) {
    return [] as string[];
  }

  return exampleWords.filter((word): word is string => typeof word === "string");
}

function readContrastWords(metadata: WritingEngineSourceMetadata) {
  const contrastWordBank = metadata.contrast_word_bank;

  if (!Array.isArray(contrastWordBank)) {
    return [] as string[];
  }

  return contrastWordBank.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry];
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const word = "word" in entry ? entry.word : null;
    return typeof word === "string" ? [word] : [];
  });
}

function getCatalogWordCandidates(metadata: WritingEngineSourceMetadata) {
  return dedupeWords([
    ...readStarterWordBankWords(metadata),
    ...readExampleWords(metadata),
    ...readContrastWords(metadata),
  ]);
}

export function getStage2WordToMiniSkillMappingSourceAudit(): WritingEngineStage2WordToMiniSkillMappingSourceAudit {
  return {
    identityAnchor: createResolution({
      classification: "canonical",
      isPresent: true,
      sourceRefs: CANONICAL_IDENTITY_SOURCE_REFS,
      note:
        "micro_skill_catalog remains the only documented mini-skill identity anchor for Stage 2 spelling mapping work.",
      value: {
        identityTable: "micro_skill_catalog",
        masteryDomainKey: "D4",
      },
    }),
    catalogWordListCandidates: createResolution({
      classification: "candidate_only",
      isPresent: false,
      sourceRefs: CATALOG_WORD_LIST_CANDIDATE_SOURCE_REFS,
      note:
        "Catalog-backed word lists are canonical spelling content fields, but the docs do not yet confirm them as canonical word-to-mini-skill mapping truth.",
      value: null,
    }),
    manualDiagnosticRuntimeMicroSkillSuggestions: createResolution({
      classification: "candidate_only",
      isPresent: true,
      sourceRefs: MANUAL_DIAGNOSTIC_RUNTIME_SOURCE_REFS,
      note:
        "Current manual diagnostic rules emit bounded micro-skill suggestions for some spelling patterns, but those runtime suggestions are not yet confirmed as canonical Stage 2 mapping truth.",
      value: {
        kind: "manual_diagnostic_runtime_micro_skill_suggestions",
        exampleMicroSkillKeys: [
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
      },
    }),
    manualDiagnosticTeachingFamilySuggestions: createResolution({
      classification: "candidate_only",
      isPresent: true,
      sourceRefs: MANUAL_DIAGNOSTIC_RUNTIME_SOURCE_REFS,
      note:
        "Current manual diagnostic family-based suggestions can point toward catalog-backed spelling areas, but the docs do not yet confirm teaching-family routing as canonical word-to-mini-skill truth.",
      value: {
        kind: "manual_diagnostic_teaching_family_suggestions",
        familyIds: [
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
      },
    }),
    canonicalWordToMiniSkillMappingTruth: createResolution({
      classification: "blocked",
      isPresent: false,
      sourceRefs: [
        ...CATALOG_WORD_LIST_CANDIDATE_SOURCE_REFS,
        ...MANUAL_DIAGNOSTIC_RUNTIME_SOURCE_REFS,
      ],
      note:
        "Stage 2C.A confirms that no current runtime or catalog-backed source is yet documented as canonical word-to-mini-skill mapping truth beyond the micro_skill_catalog identity anchor itself.",
      value: null,
    }),
  };
}

export function resolveStage2CatalogWordToMiniSkillBoundary(
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "masteryDomainKey" | "metadata"
  >,
): WritingEngineStage2CatalogWordToMiniSkillBoundary {
  const candidateWords = getCatalogWordCandidates(catalogEntry.metadata);
  const isSpellingMicroSkill = catalogEntry.masteryDomainKey === "D4";

  return {
    identityAnchor: createResolution({
      classification: "canonical",
      isPresent: isSpellingMicroSkill,
      sourceRefs: CANONICAL_IDENTITY_SOURCE_REFS,
      note: isSpellingMicroSkill
        ? "This catalog entry uses the documented Stage 2 spelling identity anchor."
        : "This catalog entry does not belong to Stage 2 spelling (`D4`), so the Stage 2C.A spelling mapping boundary does not treat it as an in-scope spelling identity anchor.",
      value: isSpellingMicroSkill
        ? {
            identityTable: "micro_skill_catalog",
            masteryDomainKey: "D4",
            microSkillKey: catalogEntry.microSkillKey,
          }
        : null,
    }),
    catalogWordListCandidates: createResolution({
      classification: isSpellingMicroSkill ? "candidate_only" : "blocked",
      isPresent: isSpellingMicroSkill && candidateWords.length > 0,
      sourceRefs: CATALOG_WORD_LIST_CANDIDATE_SOURCE_REFS,
      note: !isSpellingMicroSkill
        ? "This catalog entry is outside the Stage 2 spelling domain, so no spelling mapping candidates are exposed from it."
        : candidateWords.length > 0
          ? "Catalog-backed word lists are exposed read-only as candidate mapping inputs for this micro-skill, but they are not yet canonical mapping truth."
          : "The catalog-backed candidate mapping source exists for this micro-skill, but this entry does not currently expose candidate words.",
      value:
        isSpellingMicroSkill && candidateWords.length > 0
          ? {
              mappedMicroSkillKey: catalogEntry.microSkillKey,
              candidateWords: [...candidateWords],
            }
          : null,
    }),
  };
}
