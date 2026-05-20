import type {
  WritingEngineSourceMetadata,
  WritingEngineStage1d1CatalogEntry,
} from "../types";

export const CANONICAL_SUBMISSION_SPELLING_MAPPING_SLICE1_RULE_VERSION =
  "canonical_submission_spelling_mapping_slice1_v1";

type CanonicalSubmissionSpellingCatalogField =
  | "starter_word_bank"
  | "example_words"
  | "contrast_word_bank";

type CanonicalSubmissionSpellingCatalogMatch = {
  microSkillKey: string;
  masteryDomainKey: string;
  isActive: boolean;
  isAssignable: boolean;
  matchedCatalogFields: CanonicalSubmissionSpellingCatalogField[];
};

type CanonicalSubmissionSpellingResolved = {
  status: "resolved";
  normalizedSuggestedReplacement: string;
  microSkillKey: string;
  matchedCatalogFields: CanonicalSubmissionSpellingCatalogField[];
  sourceRefs: string[];
};

type CanonicalSubmissionSpellingAmbiguous = {
  status: "ambiguous";
  reason: "multiple_micro_skill_matches";
  normalizedSuggestedReplacement: string;
  matchingMicroSkillKeys: string[];
  sourceRefs: string[];
};

type CanonicalSubmissionSpellingUnresolved = {
  status: "unresolved";
  reason:
    | "missing_word"
    | "unmapped_word"
    | "out_of_scope_match"
    | "inactive_match"
    | "non_assignable_match"
    | "candidate_words_unavailable";
  normalizedSuggestedReplacement: string | null;
  sourceRefs: string[];
};

export type CanonicalSubmissionSpellingMappingSlice1Resolution =
  | CanonicalSubmissionSpellingResolved
  | CanonicalSubmissionSpellingAmbiguous
  | CanonicalSubmissionSpellingUnresolved;

const SOURCE_REFS = [
  "micro_skill_catalog.metadata.starter_word_bank",
  "micro_skill_catalog.metadata.example_words",
  "micro_skill_catalog.metadata.contrast_word_bank",
] as const;

function normalizeSuggestedReplacement(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function dedupeStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function dedupeCatalogFields(
  values: CanonicalSubmissionSpellingCatalogField[],
) {
  return Array.from(new Set(values));
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

function readContrastWordBankWords(metadata: WritingEngineSourceMetadata) {
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

function buildCatalogWordFieldMatches(
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "metadata"
  >,
) {
  return {
    starter_word_bank: dedupeStrings(
      readStarterWordBankWords(catalogEntry.metadata).map((word) =>
        word.trim().toLowerCase(),
      ),
    ),
    example_words: dedupeStrings(
      readExampleWords(catalogEntry.metadata).map((word) => word.trim().toLowerCase()),
    ),
    contrast_word_bank: dedupeStrings(
      readContrastWordBankWords(catalogEntry.metadata).map((word) =>
        word.trim().toLowerCase(),
      ),
    ),
  } satisfies Record<CanonicalSubmissionSpellingCatalogField, string[]>;
}

function buildCatalogMatch(
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "masteryDomainKey" | "isActive" | "isAssignable" | "metadata"
  >,
  normalizedSuggestedReplacement: string,
): CanonicalSubmissionSpellingCatalogMatch | null {
  const fieldMatches = buildCatalogWordFieldMatches(catalogEntry);
  const matchedCatalogFields = (
    Object.entries(fieldMatches) as Array<
      [CanonicalSubmissionSpellingCatalogField, string[]]
    >
  )
    .filter(([, candidateWords]) =>
      candidateWords.includes(normalizedSuggestedReplacement),
    )
    .map(([field]) => field);

  if (matchedCatalogFields.length === 0) {
    return null;
  }

  return {
    microSkillKey: catalogEntry.microSkillKey,
    masteryDomainKey: catalogEntry.masteryDomainKey,
    isActive: catalogEntry.isActive,
    isAssignable: catalogEntry.isAssignable,
    matchedCatalogFields: dedupeCatalogFields(matchedCatalogFields),
  };
}

function mergeCatalogMatchesByMicroSkillKey(
  matches: CanonicalSubmissionSpellingCatalogMatch[],
) {
  const mergedMatches = new Map<string, CanonicalSubmissionSpellingCatalogMatch>();

  matches.forEach((match) => {
    const existingMatch = mergedMatches.get(match.microSkillKey);

    if (!existingMatch) {
      mergedMatches.set(match.microSkillKey, match);
      return;
    }

    mergedMatches.set(match.microSkillKey, {
      ...existingMatch,
      matchedCatalogFields: dedupeCatalogFields([
        ...existingMatch.matchedCatalogFields,
        ...match.matchedCatalogFields,
      ]),
    });
  });

  return Array.from(mergedMatches.values());
}

export function resolveCanonicalSubmissionSpellingMappingSlice1(input: {
  suggestedReplacement: string | null | undefined;
  catalogEntries: Array<
    Pick<
      WritingEngineStage1d1CatalogEntry,
      | "microSkillKey"
      | "masteryDomainKey"
      | "isActive"
      | "isAssignable"
      | "metadata"
    >
  >;
}): CanonicalSubmissionSpellingMappingSlice1Resolution {
  const normalizedSuggestedReplacement = normalizeSuggestedReplacement(
    input.suggestedReplacement,
  );

  if (!normalizedSuggestedReplacement) {
    return {
      status: "unresolved",
      reason: "missing_word",
      normalizedSuggestedReplacement: null,
      sourceRefs: [...SOURCE_REFS],
    };
  }

  const catalogMatches = mergeCatalogMatchesByMicroSkillKey(
    input.catalogEntries
      .map((catalogEntry) =>
        buildCatalogMatch(catalogEntry, normalizedSuggestedReplacement),
      )
      .filter((match): match is CanonicalSubmissionSpellingCatalogMatch => Boolean(match)),
  );

  if (catalogMatches.length === 0) {
    return {
      status: "unresolved",
      reason: "unmapped_word",
      normalizedSuggestedReplacement,
      sourceRefs: [...SOURCE_REFS],
    };
  }

  const spellingDomainMatches = catalogMatches.filter(
    (match) => match.masteryDomainKey === "D4",
  );

  if (spellingDomainMatches.length === 0) {
    return {
      status: "unresolved",
      reason: "out_of_scope_match",
      normalizedSuggestedReplacement,
      sourceRefs: [...SOURCE_REFS],
    };
  }

  const activeMatches = spellingDomainMatches.filter((match) => match.isActive);

  if (activeMatches.length === 0) {
    return {
      status: "unresolved",
      reason: "inactive_match",
      normalizedSuggestedReplacement,
      sourceRefs: [...SOURCE_REFS],
    };
  }

  const assignableMatches = activeMatches.filter((match) => match.isAssignable);

  if (assignableMatches.length === 0) {
    return {
      status: "unresolved",
      reason: "non_assignable_match",
      normalizedSuggestedReplacement,
      sourceRefs: [...SOURCE_REFS],
    };
  }

  if (assignableMatches.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_micro_skill_matches",
      normalizedSuggestedReplacement,
      matchingMicroSkillKeys: assignableMatches.map((match) => match.microSkillKey),
      sourceRefs: [...SOURCE_REFS],
    };
  }

  return {
    status: "resolved",
    normalizedSuggestedReplacement,
    microSkillKey: assignableMatches[0].microSkillKey,
    matchedCatalogFields: [...assignableMatches[0].matchedCatalogFields],
    sourceRefs: [...SOURCE_REFS],
  };
}

export function getCanonicalSubmissionSpellingSlice1ResolvedMicroSkillKey(
  resolution: CanonicalSubmissionSpellingMappingSlice1Resolution,
) {
  return resolution.status === "resolved" ? resolution.microSkillKey : null;
}

export function mergeCanonicalSubmissionSpellingSlice1Metadata(input: {
  metadata: Record<string, unknown> | null | undefined;
  resolution: CanonicalSubmissionSpellingMappingSlice1Resolution;
}) {
  const nextMetadata = { ...(input.metadata ?? {}) };

  nextMetadata.canonical_submission_spelling_mapping = {
    rule_version: CANONICAL_SUBMISSION_SPELLING_MAPPING_SLICE1_RULE_VERSION,
    source: "micro_skill_catalog_word_lists",
    source_refs: [...input.resolution.sourceRefs],
    normalized_suggested_replacement:
      input.resolution.normalizedSuggestedReplacement,
    status: input.resolution.status,
    ...(input.resolution.status === "resolved"
      ? {
          matched_micro_skill_key: input.resolution.microSkillKey,
          matched_catalog_fields: [...input.resolution.matchedCatalogFields],
        }
      : input.resolution.status === "ambiguous"
        ? {
            unresolved_reason: input.resolution.reason,
            matching_micro_skill_keys: [...input.resolution.matchingMicroSkillKeys],
          }
        : {
            unresolved_reason: input.resolution.reason,
          }),
  };

  return nextMetadata;
}
