import type {
  WritingEngineSourceMetadata,
  WritingEngineStage1d1CatalogEntry,
} from "../types";
import {
  getWritingEngineSpellingErrorCategoryVocabulary,
  type WritingEngineSpellingErrorCategoryDefinition,
} from "./stage2b-error-category-vocabulary";

export const WRITING_ENGINE_STAGE2_CONTENT_AVAILABILITIES = [
  "confirmed_canonical",
  "candidate_only",
  "unavailable_not_yet_canonical",
] as const;

export type WritingEngineStage2ContentAvailability =
  (typeof WRITING_ENGINE_STAGE2_CONTENT_AVAILABILITIES)[number];

export type WritingEngineStage2ContentResolution<T> = {
  availability: WritingEngineStage2ContentAvailability;
  isPresent: boolean;
  sourceRefs: string[];
  note: string;
  value: T | null;
};

export type WritingEngineStage2TemplateRegistryCandidates = {
  allowedTemplateKeys: string[];
  dictationTemplateKey: string | null;
  dictationTemplateKeys: string[];
};

export type WritingEngineStage2GroupedMetadata = {
  teachingPoint: string | null;
  practiceWords: string[];
};

export type WritingEngineStage2ContrastMetadata = {
  teachingPoint: string | null;
  candidateWords: string[];
};

export type WritingEngineStage2DictationMetadata = {
  teachingPoint: string | null;
  supportText: string | null;
  dictationTemplateKey: string | null;
  dictationTemplateKeys: string[];
};

export type WritingEngineStage2SimilarPracticeCandidates = {
  candidateWords: string[];
};

export type WritingEngineStage2WordComplexityBand =
  | "basic"
  | "extended"
  | "complex_transfer";

export type WritingEngineStage2WordComplexityMetadataCandidate = {
  normalizedWord: string;
  complexityBand: WritingEngineStage2WordComplexityBand;
  source: "starter_word_bank_difficulty";
};

export type WritingEngineStage2WordComplexityMetadataCandidates = {
  words: WritingEngineStage2WordComplexityMetadataCandidate[];
};

export type WritingEngineStage2SpellingContentSourceAudit = {
  errorCategoryVocabulary: WritingEngineStage2ContentResolution<WritingEngineSpellingErrorCategoryDefinition[]>;
  wordToMiniSkillMappingData: WritingEngineStage2ContentResolution<null>;
  templateRegistryCandidates: WritingEngineStage2ContentResolution<null>;
  wordComplexityMetadataCandidates: WritingEngineStage2ContentResolution<null>;
  similarPracticeWordCandidates: WritingEngineStage2ContentResolution<null>;
  groupedMetadata: WritingEngineStage2ContentResolution<null>;
  contrastMetadata: WritingEngineStage2ContentResolution<null>;
  dictationMetadata: WritingEngineStage2ContentResolution<null>;
};

export type WritingEngineStage2SpellingCatalogContent = {
  templateRegistryCandidates: WritingEngineStage2ContentResolution<WritingEngineStage2TemplateRegistryCandidates>;
  groupedMetadata: WritingEngineStage2ContentResolution<WritingEngineStage2GroupedMetadata>;
  contrastMetadata: WritingEngineStage2ContentResolution<WritingEngineStage2ContrastMetadata>;
  dictationMetadata: WritingEngineStage2ContentResolution<WritingEngineStage2DictationMetadata>;
  similarPracticeWordCandidates: WritingEngineStage2ContentResolution<WritingEngineStage2SimilarPracticeCandidates>;
  wordComplexityMetadataCandidates: WritingEngineStage2ContentResolution<WritingEngineStage2WordComplexityMetadataCandidates>;
};

const CANONICAL_TEMPLATE_SOURCE_REFS = [
  "micro_skill_catalog.allowed_template_keys",
  "micro_skill_catalog.metadata.dictation_template_key",
  "micro_skill_catalog.metadata.dictation_template_keys",
] as const;

const CANONICAL_GROUPED_SOURCE_REFS = [
  "micro_skill_catalog.metadata.starter_word_bank",
  "micro_skill_catalog.metadata.example_words",
  "micro_skill_catalog.metadata.teaching_point",
] as const;

const CANONICAL_CONTRAST_SOURCE_REFS = [
  "micro_skill_catalog.metadata.contrast_word_bank",
  "micro_skill_catalog.metadata.starter_word_bank",
  "micro_skill_catalog.metadata.example_words",
  "micro_skill_catalog.metadata.teaching_point",
] as const;

const CANONICAL_DICTATION_SOURCE_REFS = [
  "micro_skill_catalog.allowed_template_keys",
  "micro_skill_catalog.metadata.dictation_template_key",
  "micro_skill_catalog.metadata.dictation_template_keys",
  "micro_skill_catalog.metadata.dictation_support_text",
  "micro_skill_catalog.metadata.teaching_point",
] as const;

const CANONICAL_SIMILAR_PRACTICE_SOURCE_REFS = [
  "micro_skill_catalog.metadata.starter_word_bank",
  "micro_skill_catalog.metadata.example_words",
] as const;

const CANONICAL_COMPLEXITY_SOURCE_REFS = [
  "micro_skill_catalog.metadata.starter_word_bank[].word",
  "micro_skill_catalog.metadata.starter_word_bank[].difficulty",
] as const;

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function readOptionalStringMetadata(
  metadata: WritingEngineSourceMetadata,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalStringArrayMetadata(
  metadata: WritingEngineSourceMetadata,
  key: string,
) {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, values) => values.indexOf(entry) === index);
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

function normalizeComplexityBand(
  difficulty: string | null | undefined,
): WritingEngineStage2WordComplexityBand | null {
  switch (difficulty?.trim().toLowerCase()) {
    case "easy":
      return "basic";
    case "medium":
      return "extended";
    case "hard":
      return "complex_transfer";
    default:
      return null;
  }
}

function readStarterWordBankComplexityMetadata(
  metadata: WritingEngineSourceMetadata,
) {
  const starterWordBank = metadata.starter_word_bank;

  if (!Array.isArray(starterWordBank)) {
    return [] as WritingEngineStage2WordComplexityMetadataCandidate[];
  }

  const candidates = starterWordBank.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const word = "word" in entry && typeof entry.word === "string"
      ? entry.word.trim().toLowerCase()
      : null;
    const difficulty =
      "difficulty" in entry && typeof entry.difficulty === "string"
        ? entry.difficulty
        : null;
    const complexityBand = normalizeComplexityBand(difficulty);

    if (!word || !complexityBand) {
      return [];
    }

    return [
      {
        normalizedWord: word,
        complexityBand,
        source: "starter_word_bank_difficulty" as const,
      },
    ];
  });

  return candidates.filter(
    (candidate, index, values) =>
      values.findIndex((value) => value.normalizedWord === candidate.normalizedWord) ===
      index,
  );
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

function createResolution<T>(input: {
  availability: WritingEngineStage2ContentAvailability;
  isPresent: boolean;
  sourceRefs: readonly string[];
  note: string;
  value: T | null;
}): WritingEngineStage2ContentResolution<T> {
  return {
    availability: input.availability,
    isPresent: input.isPresent,
    sourceRefs: [...input.sourceRefs],
    note: input.note,
    value: input.value,
  };
}

export function getStage2SpellingContentSourceAudit(): WritingEngineStage2SpellingContentSourceAudit {
  const spellingErrorCategoryVocabulary =
    getWritingEngineSpellingErrorCategoryVocabulary();

  return {
    errorCategoryVocabulary: createResolution({
      availability: "confirmed_canonical",
      isPresent: true,
      sourceRefs: [
        "lib/writing-engine/spelling/stage2b-error-category-vocabulary.ts",
        "lib/spelling/categoriseError.ts",
        "lib/writing-engine/spelling/manual-diagnostic-rules.ts",
      ],
      note:
        "The canonical Stage 2 spelling error-category vocabulary is now defined in the shared Writing Engine boundary and normalizes current runtime category inputs deterministically.",
      value: spellingErrorCategoryVocabulary,
    }),
    wordToMiniSkillMappingData: createResolution({
      availability: "candidate_only",
      isPresent: false,
      sourceRefs: [
        "lib/writing-engine/spelling/manual-diagnostic-catalog.ts",
        "lib/writing-engine/spelling/manual-diagnostic-rules.ts",
      ],
      note:
        "Current runtime mapping-like behavior exists inside the manual diagnostic path, but the docs do not yet confirm a canonical Stage 2 word-to-mini-skill mapping source.",
      value: null,
    }),
    templateRegistryCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_TEMPLATE_SOURCE_REFS,
      note:
        "Stage 1D already treats catalog-backed template keys as canonical assignment content inputs, so Stage 2A can expose the same read-only boundary.",
      value: null,
    }),
    wordComplexityMetadataCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_COMPLEXITY_SOURCE_REFS,
      note:
        "Curated starter-word-bank difficulty is now the canonical Stage 2 read-only source for bounded spelling word complexity metadata.",
      value: null,
    }),
    similarPracticeWordCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_SIMILAR_PRACTICE_SOURCE_REFS,
      note:
        "Catalog-backed starter-word and example-word lists are now the canonical Stage 2 read-only source for bounded similar-practice support words.",
      value: null,
    }),
    groupedMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_GROUPED_SOURCE_REFS,
      note:
        "Stage 1D grouped-set generation already documents these catalog metadata fields as canonical grouped content inputs.",
      value: null,
    }),
    contrastMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_CONTRAST_SOURCE_REFS,
      note:
        "Stage 1D contrast generation already documents these catalog metadata fields as canonical contrast content inputs.",
      value: null,
    }),
    dictationMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent: false,
      sourceRefs: CANONICAL_DICTATION_SOURCE_REFS,
      note:
        "Stage 1D dictation generation already documents these catalog fields as canonical dictation content inputs.",
      value: null,
    }),
  };
}

export function resolveStage2SpellingCatalogContent(
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "displayName" | "allowedTemplateKeys" | "metadata"
  >,
): WritingEngineStage2SpellingCatalogContent {
  const allowedTemplateKeys = catalogEntry.allowedTemplateKeys
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const dictationTemplateKey = readOptionalStringMetadata(
    catalogEntry.metadata,
    "dictation_template_key",
  );
  const dictationTemplateKeys = readOptionalStringArrayMetadata(
    catalogEntry.metadata,
    "dictation_template_keys",
  );
  const teachingPoint = readOptionalStringMetadata(
    catalogEntry.metadata,
    "teaching_point",
  );
  const dictationSupportText = readOptionalStringMetadata(
    catalogEntry.metadata,
    "dictation_support_text",
  );

  const groupedPracticeWords = dedupeWords([
    ...readStarterWordBankWords(catalogEntry.metadata),
    ...readExampleWords(catalogEntry.metadata),
  ]);
  const wordComplexityMetadata = readStarterWordBankComplexityMetadata(
    catalogEntry.metadata,
  );
  const contrastCandidateWords = dedupeWords([
    ...readContrastWords(catalogEntry.metadata),
    ...readStarterWordBankWords(catalogEntry.metadata),
    ...readExampleWords(catalogEntry.metadata),
  ]);

  return {
    templateRegistryCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent:
        allowedTemplateKeys.length > 0 ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0,
      sourceRefs: CANONICAL_TEMPLATE_SOURCE_REFS,
      note:
        allowedTemplateKeys.length > 0 ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0
          ? "Catalog-backed template candidate fields are available read-only for this micro-skill."
          : "The canonical template candidate source exists, but this catalog entry does not currently expose template candidate values.",
      value:
        allowedTemplateKeys.length > 0 ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0
          ? {
              allowedTemplateKeys: [...allowedTemplateKeys],
              dictationTemplateKey,
              dictationTemplateKeys: [...dictationTemplateKeys],
            }
          : null,
    }),
    groupedMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent: Boolean(teachingPoint) || groupedPracticeWords.length > 0,
      sourceRefs: CANONICAL_GROUPED_SOURCE_REFS,
      note:
        Boolean(teachingPoint) || groupedPracticeWords.length > 0
          ? "Catalog-backed grouped metadata is available read-only for this micro-skill."
          : "The canonical grouped metadata source exists, but this catalog entry does not currently expose grouped content values.",
      value:
        Boolean(teachingPoint) || groupedPracticeWords.length > 0
          ? {
              teachingPoint,
              practiceWords: [...groupedPracticeWords],
            }
          : null,
    }),
    contrastMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent: Boolean(teachingPoint) || contrastCandidateWords.length > 0,
      sourceRefs: CANONICAL_CONTRAST_SOURCE_REFS,
      note:
        Boolean(teachingPoint) || contrastCandidateWords.length > 0
          ? "Catalog-backed contrast metadata is available read-only for this micro-skill."
          : "The canonical contrast metadata source exists, but this catalog entry does not currently expose contrast content values.",
      value:
        Boolean(teachingPoint) || contrastCandidateWords.length > 0
          ? {
              teachingPoint,
              candidateWords: [...contrastCandidateWords],
            }
          : null,
    }),
    dictationMetadata: createResolution({
      availability: "confirmed_canonical",
      isPresent:
        Boolean(teachingPoint) ||
        Boolean(dictationSupportText) ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0 ||
        allowedTemplateKeys.length > 0,
      sourceRefs: CANONICAL_DICTATION_SOURCE_REFS,
      note:
        Boolean(teachingPoint) ||
        Boolean(dictationSupportText) ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0 ||
        allowedTemplateKeys.length > 0
          ? "Catalog-backed dictation metadata is available read-only for this micro-skill."
          : "The canonical dictation metadata source exists, but this catalog entry does not currently expose dictation content values.",
      value:
        Boolean(teachingPoint) ||
        Boolean(dictationSupportText) ||
        Boolean(dictationTemplateKey) ||
        dictationTemplateKeys.length > 0 ||
        allowedTemplateKeys.length > 0
          ? {
              teachingPoint,
              supportText: dictationSupportText,
              dictationTemplateKey,
              dictationTemplateKeys: [...dictationTemplateKeys],
            }
          : null,
    }),
    similarPracticeWordCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent: groupedPracticeWords.length > 0,
      sourceRefs: CANONICAL_SIMILAR_PRACTICE_SOURCE_REFS,
      note:
        groupedPracticeWords.length > 0
          ? "Catalog-backed starter-word and example-word lists are available read-only for bounded similar-practice support words."
          : "The canonical similar-practice source exists, but this catalog entry does not currently expose supported starter-word or example-word values.",
      value:
        groupedPracticeWords.length > 0
          ? {
              candidateWords: [...groupedPracticeWords],
            }
          : null,
    }),
    wordComplexityMetadataCandidates: createResolution({
      availability: "confirmed_canonical",
      isPresent: wordComplexityMetadata.length > 0,
      sourceRefs: CANONICAL_COMPLEXITY_SOURCE_REFS,
      note:
        wordComplexityMetadata.length > 0
          ? "Catalog-backed starter-word-bank difficulty is available read-only for bounded spelling word complexity metadata."
          : "The canonical word complexity metadata source exists, but this catalog entry does not currently expose supported starter-word difficulty values.",
      value:
        wordComplexityMetadata.length > 0
          ? {
              words: [...wordComplexityMetadata],
            }
          : null,
    }),
  };
}
