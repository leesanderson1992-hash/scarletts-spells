import type { WritingEngineStage1d1CatalogEntry } from "../types";

import {
  resolveStage2CatalogWordToMiniSkillBoundary,
  type WritingEngineStage2CatalogWordToMiniSkillBoundary,
} from "./stage2c-mapping-source-boundary";

export type WritingEngineStage2PrimaryWordToMiniSkillResolved = {
  status: "resolved";
  normalizedWord: string;
  microSkillKey: string;
  sourceClassification: "candidate_only";
  sourceRefs: string[];
};

export type WritingEngineStage2PrimaryWordToMiniSkillAmbiguous = {
  status: "ambiguous";
  reason: "multiple_micro_skill_matches";
  normalizedWord: string;
  matchingMicroSkillKeys: string[];
  sourceClassification: "candidate_only";
  sourceRefs: string[];
};

export type WritingEngineStage2PrimaryWordToMiniSkillUnresolved = {
  status: "unresolved";
  reason:
    | "missing_word"
    | "out_of_scope_boundary"
    | "candidate_words_unavailable"
    | "unmapped_word";
  normalizedWord: string | null;
  sourceClassification: "canonical" | "candidate_only" | "blocked";
  sourceRefs: string[];
};

export type WritingEngineStage2PrimaryWordToMiniSkillResolution =
  | WritingEngineStage2PrimaryWordToMiniSkillResolved
  | WritingEngineStage2PrimaryWordToMiniSkillAmbiguous
  | WritingEngineStage2PrimaryWordToMiniSkillUnresolved;

function normalizeWord(word: string | null | undefined) {
  if (typeof word !== "string") {
    return null;
  }

  const normalizedWord = word.trim().toLowerCase();
  return normalizedWord.length > 0 ? normalizedWord : null;
}

function dedupeMicroSkillKeys(microSkillKeys: string[]) {
  return Array.from(
    new Set(
      microSkillKeys
        .map((microSkillKey) => microSkillKey.trim())
        .filter(Boolean),
    ),
  );
}

export function resolveStage2PrimaryWordToMiniSkillFromBoundary(input: {
  word: string | null | undefined;
  boundary: WritingEngineStage2CatalogWordToMiniSkillBoundary;
}): WritingEngineStage2PrimaryWordToMiniSkillResolution {
  const normalizedWord = normalizeWord(input.word);

  if (!normalizedWord) {
    return {
      status: "unresolved",
      reason: "missing_word",
      normalizedWord: null,
      sourceClassification: input.boundary.catalogWordListCandidates.classification,
      sourceRefs: [...input.boundary.catalogWordListCandidates.sourceRefs],
    };
  }

  if (!input.boundary.identityAnchor.isPresent) {
    return {
      status: "unresolved",
      reason: "out_of_scope_boundary",
      normalizedWord,
      sourceClassification: input.boundary.identityAnchor.classification,
      sourceRefs: [...input.boundary.identityAnchor.sourceRefs],
    };
  }

  if (
    input.boundary.catalogWordListCandidates.classification !== "candidate_only" ||
    !input.boundary.catalogWordListCandidates.isPresent ||
    !input.boundary.catalogWordListCandidates.value
  ) {
    return {
      status: "unresolved",
      reason: "candidate_words_unavailable",
      normalizedWord,
      sourceClassification: input.boundary.catalogWordListCandidates.classification,
      sourceRefs: [...input.boundary.catalogWordListCandidates.sourceRefs],
    };
  }

  if (
    !input.boundary.catalogWordListCandidates.value.candidateWords.includes(
      normalizedWord,
    )
  ) {
    return {
      status: "unresolved",
      reason: "unmapped_word",
      normalizedWord,
      sourceClassification: input.boundary.catalogWordListCandidates.classification,
      sourceRefs: [...input.boundary.catalogWordListCandidates.sourceRefs],
    };
  }

  return {
    status: "resolved",
    normalizedWord,
    microSkillKey: input.boundary.catalogWordListCandidates.value.mappedMicroSkillKey,
    sourceClassification: input.boundary.catalogWordListCandidates.classification,
    sourceRefs: [...input.boundary.catalogWordListCandidates.sourceRefs],
  };
}

export function resolveStage2PrimaryWordToMiniSkillFromCatalogEntry(input: {
  word: string | null | undefined;
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "masteryDomainKey" | "metadata"
  >;
}): WritingEngineStage2PrimaryWordToMiniSkillResolution {
  return resolveStage2PrimaryWordToMiniSkillFromBoundary({
    word: input.word,
    boundary: resolveStage2CatalogWordToMiniSkillBoundary(input.catalogEntry),
  });
}

export function resolveStage2PrimaryWordToMiniSkillAcrossBoundaries(input: {
  word: string | null | undefined;
  boundaries: WritingEngineStage2CatalogWordToMiniSkillBoundary[];
}): WritingEngineStage2PrimaryWordToMiniSkillResolution {
  const normalizedWord = normalizeWord(input.word);

  if (!normalizedWord) {
    return {
      status: "unresolved",
      reason: "missing_word",
      normalizedWord: null,
      sourceClassification:
        input.boundaries[0]?.catalogWordListCandidates.classification ?? "blocked",
      sourceRefs: [...(input.boundaries[0]?.catalogWordListCandidates.sourceRefs ?? [])],
    };
  }

  const inScopeBoundaries = input.boundaries.filter(
    (boundary) => boundary.identityAnchor.isPresent,
  );

  if (inScopeBoundaries.length === 0) {
    return {
      status: "unresolved",
      reason: "out_of_scope_boundary",
      normalizedWord,
      sourceClassification:
        input.boundaries[0]?.identityAnchor.classification ?? "canonical",
      sourceRefs: [...(input.boundaries[0]?.identityAnchor.sourceRefs ?? [])],
    };
  }

  const candidateBoundaries = inScopeBoundaries.filter(
    (boundary) =>
      boundary.catalogWordListCandidates.classification === "candidate_only" &&
      boundary.catalogWordListCandidates.isPresent &&
      Boolean(boundary.catalogWordListCandidates.value),
  );

  if (candidateBoundaries.length === 0) {
    return {
      status: "unresolved",
      reason: "candidate_words_unavailable",
      normalizedWord,
      sourceClassification:
        inScopeBoundaries[0]?.catalogWordListCandidates.classification ??
        "candidate_only",
      sourceRefs: [
        ...(inScopeBoundaries[0]?.catalogWordListCandidates.sourceRefs ?? []),
      ],
    };
  }

  const matchingMicroSkillKeys = dedupeMicroSkillKeys(
    candidateBoundaries.flatMap((boundary) => {
      const candidateMapping = boundary.catalogWordListCandidates.value;

      if (!candidateMapping) {
        return [];
      }

      return candidateMapping.candidateWords.includes(normalizedWord)
        ? [candidateMapping.mappedMicroSkillKey]
        : [];
    }),
  );

  if (matchingMicroSkillKeys.length === 0) {
    return {
      status: "unresolved",
      reason: "unmapped_word",
      normalizedWord,
      sourceClassification: "candidate_only",
      sourceRefs: [...candidateBoundaries[0].catalogWordListCandidates.sourceRefs],
    };
  }

  if (matchingMicroSkillKeys.length > 1) {
    return {
      status: "ambiguous",
      reason: "multiple_micro_skill_matches",
      normalizedWord,
      matchingMicroSkillKeys,
      sourceClassification: "candidate_only",
      sourceRefs: [...candidateBoundaries[0].catalogWordListCandidates.sourceRefs],
    };
  }

  return {
    status: "resolved",
    normalizedWord,
    microSkillKey: matchingMicroSkillKeys[0],
    sourceClassification: "candidate_only",
    sourceRefs: [...candidateBoundaries[0].catalogWordListCandidates.sourceRefs],
  };
}

export function resolveStage2PrimaryWordToMiniSkillAcrossCatalogEntries(input: {
  word: string | null | undefined;
  catalogEntries: Array<
    Pick<
      WritingEngineStage1d1CatalogEntry,
      "microSkillKey" | "masteryDomainKey" | "metadata"
    >
  >;
}): WritingEngineStage2PrimaryWordToMiniSkillResolution {
  return resolveStage2PrimaryWordToMiniSkillAcrossBoundaries({
    word: input.word,
    boundaries: input.catalogEntries.map((catalogEntry) =>
      resolveStage2CatalogWordToMiniSkillBoundary(catalogEntry),
    ),
  });
}
