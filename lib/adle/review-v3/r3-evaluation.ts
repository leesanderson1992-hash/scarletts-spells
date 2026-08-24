import type {
  ReviewSnapshotJsonValue,
  ReviewTargetSnapshotV3,
} from "./contracts";
import {
  REVIEW_EXACT_MATCHER_VERSION,
  findExactReviewTargetMatches,
  normalizeReviewSpellingText,
  tokenizeReviewWriting,
} from "./target-word-matcher";

export const REVIEW_MISSPELLING_ATTRIBUTION_VERSION =
  "resolver_visible_token_safe_unique_target_v1" as const;

export interface GovernedReviewMisspellingMapping {
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  dialectCode: string;
  normalizationVersion: string;
  authorityReference: string;
}

export interface ReviewWritingEvaluation {
  encounterId: string;
  targetOrder: number;
  disposition: "correct_in_writing" | "attributable_misspelling" | "unaccounted_for";
  observedText: string | null;
  attributionAlgorithmVersion: string;
  attributionProvenance: Readonly<Record<string, ReviewSnapshotJsonValue>>;
}

function resolverLookupToken(value: string): string | null {
  const normalized = normalizeReviewSpellingText(value).trim();
  return /^[a-z]+$/.test(normalized) ? normalized : null;
}

export function evaluateSubmittedReviewWriting(input: {
  writing: string;
  targets: readonly ReviewTargetSnapshotV3[];
  governedMappings: readonly GovernedReviewMisspellingMapping[];
}): ReviewWritingEvaluation[] {
  const exactMatches = findExactReviewTargetMatches(input.writing, input.targets);
  const exactByEncounter = new Map(exactMatches.map((match) => [match.encounterId, match]));
  const absentTargets = input.targets.filter((target) => !exactByEncounter.has(target.encounterId));
  const absentByNormalizedAnswer = new Map<string, ReviewTargetSnapshotV3[]>();

  for (const target of absentTargets) {
    const normalizedAnswer = resolverLookupToken(target.canonicalSpelling);
    if (!normalizedAnswer) continue;
    const targets = absentByNormalizedAnswer.get(normalizedAnswer) ?? [];
    targets.push(target);
    absentByNormalizedAnswer.set(normalizedAnswer, targets);
  }

  const tokens = tokenizeReviewWriting(input.writing);
  const attributableByEncounter = new Map<string, {
    token: string;
    tokenIndex: number;
    mappings: GovernedReviewMisspellingMapping[];
  }>();

  for (const token of tokens) {
    if (!/^[a-z]+$/.test(token.normalized)) continue;
    const mappings = input.governedMappings.filter((mapping) =>
      mapping.misspellingNormalized === token.normalized,
    );
    const candidates = new Map<string, {
      target: ReviewTargetSnapshotV3;
      mappings: GovernedReviewMisspellingMapping[];
    }>();
    for (const mapping of mappings) {
      for (const target of absentByNormalizedAnswer.get(mapping.correctSpellingNormalized) ?? []) {
        const candidate = candidates.get(target.encounterId) ?? { target, mappings: [] };
        candidate.mappings.push(mapping);
        candidates.set(target.encounterId, candidate);
      }
    }
    if (candidates.size !== 1) continue;
    const [{ target, mappings: targetMappings }] = [...candidates.values()];
    if (!attributableByEncounter.has(target.encounterId)) {
      attributableByEncounter.set(target.encounterId, {
        token: token.surface,
        tokenIndex: token.index,
        mappings: targetMappings,
      });
    }
  }

  return [...input.targets]
    .sort((left, right) => left.order - right.order)
    .map((target): ReviewWritingEvaluation => {
      const exact = exactByEncounter.get(target.encounterId);
      if (exact) {
        return {
          encounterId: target.encounterId,
          targetOrder: target.order,
          disposition: "correct_in_writing" as const,
          observedText: exact.matchedText,
          attributionAlgorithmVersion: REVIEW_EXACT_MATCHER_VERSION,
          attributionProvenance: {
            matcherVersion: REVIEW_EXACT_MATCHER_VERSION,
            tokenStart: exact.tokenStart,
            tokenEndExclusive: exact.tokenEndExclusive,
          },
        };
      }
      const attributable = attributableByEncounter.get(target.encounterId);
      if (attributable) {
        return {
          encounterId: target.encounterId,
          targetOrder: target.order,
          disposition: "attributable_misspelling" as const,
          observedText: attributable.token,
          attributionAlgorithmVersion: REVIEW_MISSPELLING_ATTRIBUTION_VERSION,
          attributionProvenance: {
            tokenIndex: attributable.tokenIndex,
            mappingIds: attributable.mappings.map((mapping) => mapping.mappingId),
            authorityReferences: attributable.mappings.map((mapping) => mapping.authorityReference),
            normalizationVersion: attributable.mappings[0]?.normalizationVersion ?? "spelling_normalize_v1",
          },
        };
      }
      return {
        encounterId: target.encounterId,
        targetOrder: target.order,
        disposition: "unaccounted_for" as const,
        observedText: null,
        attributionAlgorithmVersion: REVIEW_MISSPELLING_ATTRIBUTION_VERSION,
        attributionProvenance: {
          classification: "conservative_unresolved_no_unique_governed_mapping",
        },
      };
    });
}
