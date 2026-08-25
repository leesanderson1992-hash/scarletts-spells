import type {
  ReviewSnapshotJsonValue,
  ReviewTargetSnapshotV3,
} from "./contracts";
import {
  REVIEW_EXACT_MATCHER_VERSION,
  findExactReviewTargetMatches,
  normalizeReviewSpellingText,
  tokenizeReviewWriting,
  type ReviewWritingToken,
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
  authorityLevel?: "global_canonical" | "learner_confirmed";
  sourceReviewEncounterId?: string;
}

export interface NonAuthoritativeReviewSuggestion {
  observedNormalized: string;
  correctSpellingNormalized: string;
  resolverVersion: string;
  source: "heuristic_correction_resolver" | "canonical_mapping_recommendation";
}

export interface ReviewWritingEvaluation {
  encounterId: string;
  targetOrder: number;
  disposition: "correct_in_writing" | "attributable_misspelling" | "unaccounted_for";
  observedText: string | null;
  attributionAlgorithmVersion: string;
  attributionProvenance: Readonly<Record<string, ReviewSnapshotJsonValue>>;
}

export interface ReviewWritingConfirmationFlow {
  learnerConfirmedMappings?: readonly GovernedReviewMisspellingMapping[];
  nonAuthoritativeSuggestions?: readonly NonAuthoritativeReviewSuggestion[];
}

function resolverLookupToken(value: string): string | null {
  const normalized = normalizeReviewSpellingText(value).trim();
  return /^[a-z]+$/.test(normalized) ? normalized : null;
}

export function evaluateSubmittedReviewWriting(input: {
  writing: string;
  targets: readonly ReviewTargetSnapshotV3[];
  governedMappings: readonly GovernedReviewMisspellingMapping[];
  confirmationFlow?: ReviewWritingConfirmationFlow;
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
  const automaticMappings = [
    ...input.governedMappings.map((mapping) => ({
      ...mapping,
      authorityLevel: mapping.authorityLevel ?? "global_canonical" as const,
    })),
    ...(input.confirmationFlow?.learnerConfirmedMappings ?? []).map((mapping) => ({
      ...mapping,
      authorityLevel: "learner_confirmed" as const,
    })),
  ];
  const attributableByEncounter = new Map<string, {
    token: string;
    tokenIndex: number;
    startOffset: number;
    endOffset: number;
    mappings: GovernedReviewMisspellingMapping[];
  }>();
  const consumedTokenIndexes = new Set<number>();

  for (const token of tokens) {
    if (!/^[a-z]+$/.test(token.normalized)) continue;
    const mappings = automaticMappings.filter((mapping) =>
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
        startOffset: token.startOffset,
        endOffset: token.endOffset,
        mappings: targetMappings,
      });
      consumedTokenIndexes.add(token.index);
    }
  }

  const suggestionByEncounter = new Map<string, {
    token: ReviewWritingToken;
    suggestion: NonAuthoritativeReviewSuggestion;
  }>();
  if (input.confirmationFlow) {
    for (const token of tokens) {
      if (consumedTokenIndexes.has(token.index)) continue;
      const tokenSuggestions = (input.confirmationFlow.nonAuthoritativeSuggestions ?? [])
        .filter((suggestion) => suggestion.observedNormalized === token.normalized);
      const candidates = new Map<string, {
        target: ReviewTargetSnapshotV3;
        suggestion: NonAuthoritativeReviewSuggestion;
      }>();
      for (const suggestion of tokenSuggestions) {
        for (const target of absentByNormalizedAnswer.get(suggestion.correctSpellingNormalized) ?? []) {
          if (attributableByEncounter.has(target.encounterId)) continue;
          candidates.set(target.encounterId, { target, suggestion });
        }
      }
      if (candidates.size !== 1) continue;
      const [{ target, suggestion }] = [...candidates.values()];
      if (!suggestionByEncounter.has(target.encounterId)) {
        suggestionByEncounter.set(target.encounterId, { token, suggestion });
      }
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
            authorityLevel: "accepted_spelling",
            matchedSpanStart: exact.startOffset,
            matchedSpanEnd: exact.endOffset,
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
            authorityLevel: attributable.mappings.some((mapping) =>
              mapping.authorityLevel === "global_canonical"
            ) ? "authoritative_misspelling" : "learner_specific_authoritative_misspelling",
            sourceReviewEncounterIds: attributable.mappings.flatMap((mapping) =>
              mapping.sourceReviewEncounterId ? [mapping.sourceReviewEncounterId] : []
            ),
            confirmedSpanStart: attributable.startOffset,
            confirmedSpanEnd: attributable.endOffset,
          },
        };
      }
      const suggestion = suggestionByEncounter.get(target.encounterId);
      if (suggestion) {
        return {
          encounterId: target.encounterId,
          targetOrder: target.order,
          disposition: "unaccounted_for",
          observedText: suggestion.token.surface,
          attributionAlgorithmVersion: REVIEW_MISSPELLING_ATTRIBUTION_VERSION,
          attributionProvenance: {
            classification: "non_authoritative_suggestion_requires_learner_confirmation",
            authorityLevel: "non_authoritative_suggestion",
            r31ConfirmationState: "suggestion_confirmation_required",
            observedText: suggestion.token.surface,
            observedNormalized: suggestion.token.normalized,
            suggestedCorrectSpellingNormalized: suggestion.suggestion.correctSpellingNormalized,
            resolverVersion: suggestion.suggestion.resolverVersion,
            resolverSource: suggestion.suggestion.source,
            suggestedSpanStart: suggestion.token.startOffset,
            suggestedSpanEnd: suggestion.token.endOffset,
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
          classification: input.confirmationFlow
            ? "unknown_requires_learner_attempt_question"
            : "conservative_unresolved_no_unique_governed_mapping",
          ...(input.confirmationFlow ? {
            authorityLevel: "unknown",
            r31ConfirmationState: "attempt_question_required",
          } : {}),
        },
      };
    });
}
