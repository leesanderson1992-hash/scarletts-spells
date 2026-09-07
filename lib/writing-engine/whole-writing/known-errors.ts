import { fingerprint } from "../baseline/source";
import type { Token } from "../../spelling/tokenize";
import {
  mergeHeuristicAndCanonicalMisspellings,
  type ResolverVisibleCanonicalMisspellingMapping,
} from "../spelling/canonical-misspelling-intake";

export const WHOLE_WRITING_KNOWN_ERROR_VERSION =
  "WHOLE_WRITING_KNOWN_ERROR_V1" as const;

export type KnownErrorOccurrence = {
  id: string;
  observedText: string;
  provenance: "learner_response" | "unknown" | "excluded";
};

export type WholeWritingKnownErrorFinding = {
  findingKey: string;
  occurrenceId: string;
  observedNormalized: string;
  intendedNormalized: string;
  mappingIds: string[];
  microSkillKeys: string[];
  authorityReferences: string[];
  dialect: string;
  normalizationVersion: string;
  category: string;
  secondaryCategory: string | null;
  errorPattern: string | null;
};

export type WholeWritingKnownErrorCheck = {
  occurrenceId: string;
  disposition: "FINDING" | "NO_MAPPING" | "ABSTAINED" | "INELIGIBLE_AUTHORSHIP";
  findingKey: string | null;
};

function tokenForOccurrence(occurrence: KnownErrorOccurrence): Token {
  const normalized = occurrence.observedText
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’ʼ]/g, "'");
  return {
    raw: occurrence.observedText,
    normalized,
    index: 0,
    start: 0,
    end: occurrence.observedText.length,
    isCapitalised: /^[A-Z]/.test(occurrence.observedText),
  };
}

function sortedUnique(values: readonly string[]) {
  return Array.from(new Set(values)).sort();
}

export function knownErrorMappingAuthorityFingerprint(
  mappings: readonly ResolverVisibleCanonicalMisspellingMapping[],
) {
  return fingerprint(
    [...mappings]
      .map((mapping) => ({ ...mapping }))
      .sort((left, right) =>
        [left.misspellingNormalized, left.correctSpellingNormalized, left.mappingId]
          .join(":")
          .localeCompare(
            [right.misspellingNormalized, right.correctSpellingNormalized, right.mappingId].join(":"),
          ),
      ),
  );
}

/**
 * Detects only governed token-safe canonical mappings. Correctness remains a
 * parent decision and conflicting canonical corrections abstain.
 */
export function buildWholeWritingKnownErrorFindings(input: {
  occurrences: readonly KnownErrorOccurrence[];
  mappings: readonly ResolverVisibleCanonicalMisspellingMapping[];
}) {
  const findings: WholeWritingKnownErrorFinding[] = [];
  const checks: WholeWritingKnownErrorCheck[] = [];
  const mappingsByObservedForm = new Map<string, ResolverVisibleCanonicalMisspellingMapping[]>();
  for (const mapping of input.mappings) {
    mappingsByObservedForm.set(mapping.misspellingNormalized, [
      ...(mappingsByObservedForm.get(mapping.misspellingNormalized) ?? []),
      mapping,
    ]);
  }
  let ineligibleOccurrenceCount = 0;
  let abstainedOccurrenceCount = 0;

  for (const occurrence of input.occurrences) {
    if (occurrence.provenance !== "learner_response") {
      ineligibleOccurrenceCount += 1;
      checks.push({ occurrenceId: occurrence.id, disposition: "INELIGIBLE_AUTHORSHIP", findingKey: null });
      continue;
    }
    const token = tokenForOccurrence(occurrence);
    const relevantMappings = mappingsByObservedForm.get(token.normalized) ?? [];
    if (relevantMappings.length === 0) {
      checks.push({ occurrenceId: occurrence.id, disposition: "NO_MAPPING", findingKey: null });
      continue;
    }
    const [detection] = mergeHeuristicAndCanonicalMisspellings({
      tokens: [token],
      heuristicMisspellings: [],
      canonicalMappings: relevantMappings,
    });
    if (!detection?.canonicalProvenance) {
      abstainedOccurrenceCount += 1;
      checks.push({ occurrenceId: occurrence.id, disposition: "ABSTAINED", findingKey: null });
      continue;
    }
    const provenance = detection.canonicalProvenance;
    const mappingIds = sortedUnique(provenance.canonicalMappingIds);
    const microSkillKeys = sortedUnique(provenance.microSkillKeys);
    const authorityReferences = sortedUnique(provenance.authorityReferences);
    const findingKey = fingerprint({
      version: WHOLE_WRITING_KNOWN_ERROR_VERSION,
      occurrenceId: occurrence.id,
      observedNormalized: detection.misspelling,
      intendedNormalized: detection.correction,
      mappingIds,
      microSkillKeys,
      authorityReferences,
      dialect: provenance.dialectCode,
      normalizationVersion: provenance.normalizationVersion,
    });
    findings.push({
      findingKey,
      occurrenceId: occurrence.id,
      observedNormalized: detection.misspelling,
      intendedNormalized: detection.correction,
      mappingIds,
      microSkillKeys,
      authorityReferences,
      dialect: provenance.dialectCode,
      normalizationVersion: provenance.normalizationVersion,
      category: detection.category,
      secondaryCategory: detection.secondaryCategory,
      errorPattern: detection.errorPattern,
    });
    checks.push({ occurrenceId: occurrence.id, disposition: "FINDING", findingKey });
  }

  return {
    version: WHOLE_WRITING_KNOWN_ERROR_VERSION,
    mappingAuthorityFingerprint: knownErrorMappingAuthorityFingerprint(input.mappings),
    eligibleOccurrenceCount:
      input.occurrences.length - ineligibleOccurrenceCount,
    ineligibleOccurrenceCount,
    abstainedOccurrenceCount,
    checks,
    findings,
  };
}
