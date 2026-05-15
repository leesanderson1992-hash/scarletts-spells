import type { WritingEngineStage1d1CatalogEntry } from "../types";
import {
  resolveStage2SpellingCatalogContent,
  type WritingEngineStage2WordComplexityBand,
} from "./stage2a-content-resolver";

export type WritingEngineStage2eWordComplexityResolved = {
  status: "resolved";
  normalizedWord: string;
  microSkillKey: string;
  complexityBand: WritingEngineStage2WordComplexityBand;
  source: "starter_word_bank_difficulty";
  sourceRefs: string[];
};

export type WritingEngineStage2eWordComplexityUnresolved = {
  status: "unresolved";
  normalizedWord: string | null;
  microSkillKey: string;
  reason:
    | "missing_word"
    | "out_of_scope_boundary"
    | "complexity_metadata_unavailable"
    | "unknown_word_complexity";
  sourceRefs: string[];
};

export type WritingEngineStage2eWordComplexityResolution =
  | WritingEngineStage2eWordComplexityResolved
  | WritingEngineStage2eWordComplexityUnresolved;

function normalizeWord(word: string | null | undefined) {
  if (typeof word !== "string") {
    return null;
  }

  const normalizedWord = word.trim().toLowerCase();
  return normalizedWord.length > 0 ? normalizedWord : null;
}

export function resolveStage2eWordComplexity(input: {
  word: string | null | undefined;
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "masteryDomainKey" | "allowedTemplateKeys" | "metadata" | "displayName"
  >;
}): WritingEngineStage2eWordComplexityResolution {
  const normalizedWord = normalizeWord(input.word);

  if (!normalizedWord) {
    return {
      status: "unresolved",
      normalizedWord: null,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "missing_word",
      sourceRefs: [],
    };
  }

  if (input.catalogEntry.masteryDomainKey !== "D4") {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "out_of_scope_boundary",
      sourceRefs: [],
    };
  }

  const complexityMetadataResolution = resolveStage2SpellingCatalogContent(
    input.catalogEntry,
  ).wordComplexityMetadataCandidates;

  if (
    complexityMetadataResolution.availability !== "confirmed_canonical" ||
    !complexityMetadataResolution.isPresent ||
    !complexityMetadataResolution.value
  ) {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "complexity_metadata_unavailable",
      sourceRefs: [...complexityMetadataResolution.sourceRefs],
    };
  }

  const match =
    complexityMetadataResolution.value.words.find(
      (candidate) => candidate.normalizedWord === normalizedWord,
    ) ?? null;

  if (!match) {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "unknown_word_complexity",
      sourceRefs: [...complexityMetadataResolution.sourceRefs],
    };
  }

  return {
    status: "resolved",
    normalizedWord,
    microSkillKey: input.catalogEntry.microSkillKey,
    complexityBand: match.complexityBand,
    source: match.source,
    sourceRefs: [...complexityMetadataResolution.sourceRefs],
  };
}
