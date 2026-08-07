import {
  categoriseError,
  getSecondaryCategory,
} from "@/lib/spelling/categoriseError";
import {
  type DetectedMisspelling,
} from "@/lib/spelling/detectMisspellings";
import {
  detectErrorPattern,
  selectTeachingFamilyForError,
} from "@/lib/spelling/errorPatterns";
import { isKnownName, isKnownWordLike } from "@/lib/spelling/lexicon";
import { isKnownWord } from "@/lib/spelling/suggestCorrection";
import type { Token } from "@/lib/spelling/tokenize";
import { findWordFamilyForWord } from "@/lib/spelling/wordFamilies";

export type ResolverVisibleCanonicalMisspellingMapping = {
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  dialectCode: string;
  normalizationVersion: string;
  authorityReference: string;
};

export type CanonicalMisspellingDetectionProvenance = {
  detectionSource: "resolver_visible_canonical";
  canonicalMappingId: string | null;
  canonicalMappingIds: string[];
  canonicalCorrection: string;
  microSkillKey: string | null;
  microSkillKeys: string[];
  dialectCode: string;
  normalizationVersion: string;
  authorityReferences: string[];
};

export type MergedMisspellingDetection = DetectedMisspelling & {
  detectionSource: "heuristic" | "resolver_visible_canonical";
  canonicalProvenance: CanonicalMisspellingDetectionProvenance | null;
};

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function occurrenceKey(token: Token) {
  return `${token.start}:${token.end}`;
}

function canUseTokenOnlyCanonicalDetection(token: Token) {
  const normalized = token.normalized;

  if (!normalized || normalized.length <= 2) {
    return false;
  }

  if (isKnownWordLike(normalized) || isKnownWord(normalized)) {
    return false;
  }

  if (token.isCapitalised && isKnownName(normalized)) {
    return false;
  }

  return true;
}

function buildCanonicalDetection(
  token: Token,
  mappings: ResolverVisibleCanonicalMisspellingMapping[],
): MergedMisspellingDetection | null {
  if (!canUseTokenOnlyCanonicalDetection(token)) {
    return null;
  }

  const correctionGroups = new Map<
    string,
    ResolverVisibleCanonicalMisspellingMapping[]
  >();

  for (const mapping of mappings) {
    const existing = correctionGroups.get(mapping.correctSpellingNormalized) ?? [];
    existing.push(mapping);
    correctionGroups.set(mapping.correctSpellingNormalized, existing);
  }

  if (correctionGroups.size !== 1) {
    return null;
  }

  const [correctionEntry] = [...correctionGroups.entries()];
  if (!correctionEntry) {
    return null;
  }

  const [correction, correctionMappings] = correctionEntry;
  const mappingIds = dedupe(correctionMappings.map((mapping) => mapping.mappingId));
  const microSkillKeys = dedupe(
    correctionMappings.map((mapping) => mapping.microSkillKey),
  );
  const authorityReferences = dedupe(
    correctionMappings.map((mapping) => mapping.authorityReference),
  );
  const dialectCodes = dedupe(
    correctionMappings.map((mapping) => mapping.dialectCode),
  );
  const normalizationVersions = dedupe(
    correctionMappings.map((mapping) => mapping.normalizationVersion),
  );

  if (dialectCodes.length !== 1 || normalizationVersions.length !== 1) {
    return null;
  }

  const errorPattern = detectErrorPattern(token.normalized, correction);
  const category = categoriseError(token.normalized, correction, errorPattern);
  const wordFamilyId =
    selectTeachingFamilyForError(token.normalized, correction, errorPattern) ??
    findWordFamilyForWord(correction)?.id ??
    null;

  return {
    token,
    misspelling: token.normalized,
    correction,
    confidence: 1,
    errorPattern,
    category,
    secondaryCategory: getSecondaryCategory(
      token.normalized,
      correction,
      category,
      errorPattern,
    ),
    wordFamilyId,
    detectionSource: "resolver_visible_canonical",
    canonicalProvenance: {
      detectionSource: "resolver_visible_canonical",
      canonicalMappingId: mappingIds.length === 1 ? mappingIds[0] ?? null : null,
      canonicalMappingIds: mappingIds,
      canonicalCorrection: correction,
      microSkillKey:
        microSkillKeys.length === 1 ? microSkillKeys[0] ?? null : null,
      microSkillKeys,
      dialectCode: dialectCodes[0]!,
      normalizationVersion: normalizationVersions[0]!,
      authorityReferences,
    },
  };
}

export function mergeHeuristicAndCanonicalMisspellings(input: {
  tokens: Token[];
  heuristicMisspellings: DetectedMisspelling[];
  canonicalMappings: ResolverVisibleCanonicalMisspellingMapping[];
}): MergedMisspellingDetection[] {
  const heuristicByOccurrence = new Map(
    input.heuristicMisspellings.map((item) => [
      occurrenceKey(item.token),
      {
        ...item,
        detectionSource: "heuristic" as const,
        canonicalProvenance: null,
      },
    ]),
  );
  const mappingsByMisspelling = new Map<
    string,
    ResolverVisibleCanonicalMisspellingMapping[]
  >();

  for (const mapping of input.canonicalMappings) {
    const existing = mappingsByMisspelling.get(mapping.misspellingNormalized) ?? [];
    existing.push(mapping);
    mappingsByMisspelling.set(mapping.misspellingNormalized, existing);
  }

  const merged: MergedMisspellingDetection[] = [];

  for (const token of input.tokens) {
    const heuristic = heuristicByOccurrence.get(occurrenceKey(token));
    const canonical = buildCanonicalDetection(
      token,
      mappingsByMisspelling.get(token.normalized) ?? [],
    );

    if (canonical) {
      merged.push(canonical);
    } else if (heuristic) {
      merged.push(heuristic);
    }
  }

  return merged;
}
