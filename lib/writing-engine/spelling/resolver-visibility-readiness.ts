export type ResolverVisibilityReadinessState =
  | "eligible_for_visibility_review"
  | "blocked"
  | "needs_manual_authority_review";

export type ResolverVisibilityReadinessReason =
  | "mapping_missing"
  | "mapping_not_active"
  | "mapping_not_hidden"
  | "missing_normalized_pair"
  | "normalized_pair_matches"
  | "missing_dialect"
  | "missing_micro_skill"
  | "micro_skill_not_active_assignable_d4"
  | "missing_authority_lineage"
  | "missing_created_event"
  | "missing_adoption_event"
  | "exact_pair_duplicate_different_micro_skill"
  | "same_misspelling_conflicting_correction"
  | "disabled_deprecated_or_superseded_mapping_exists";

export type ResolverVisibilityReadinessSource =
  | "seed_import_4f_adoption"
  | "pcrm_adoption"
  | "catalog_canonical_review"
  | "unknown";

export type ResolverVisibilityReadinessMappingInput = {
  id: string;
  misspellingNormalized: string | null;
  correctSpellingNormalized: string | null;
  microSkillKey: string | null;
  mappingStatus: string | null;
  resolverVisibilityStatus: string | null;
  dialectCode: string | null;
  sourceSeedImportRowId?: string | null;
  sourceRecommendationId?: string | null;
  sourceCaseId?: string | null;
  sourceDecisionId?: string | null;
};

export type ResolverVisibilityReadinessMicroSkillInput = {
  microSkillKey: string;
  masteryDomainKey: string | null;
  isActive: boolean | null;
  isAssignable: boolean | null;
};

export type ResolverVisibilityReadinessEventInput = {
  eventType: string;
  newStatus?: string | null;
  sourceSeedImportRowId?: string | null;
  sourceRecommendationId?: string | null;
  sourceCaseId?: string | null;
  sourceDecisionId?: string | null;
};

export type ResolverVisibilityReadinessSeedImportInput = {
  id: string;
  rowStatus: string | null;
  canonicalMappingId: string | null;
};

export type ResolverVisibilityReadinessRecommendationInput = {
  id: string;
  recommendationStatus: string | null;
  canonicalMappingId: string | null;
};

export type ResolverVisibilityReadinessPeerMappingInput = {
  id: string;
  misspellingNormalized: string | null;
  correctSpellingNormalized: string | null;
  microSkillKey: string | null;
  mappingStatus: string | null;
  resolverVisibilityStatus?: string | null;
  dialectCode: string | null;
};

export type ResolverVisibilityReadinessEventSummaryInput = {
  hasCreatedEvent: boolean;
  hasSeedImportAdoptedEvent: boolean;
  hasPcrmAdoptedEvent: boolean;
};

export type ResolverVisibilityReadinessConflictSummaryInput = {
  hasActiveExactPairDifferentMicroSkill: boolean;
  hasActiveSameMisspellingConflictingCorrection: boolean;
  hasInactiveExactPairHistoricalMapping: boolean;
};

export type ResolverVisibilityReadinessInput = {
  mapping: ResolverVisibilityReadinessMappingInput | null;
  microSkill?: ResolverVisibilityReadinessMicroSkillInput | null;
  events?: ResolverVisibilityReadinessEventInput[];
  eventSummary?: ResolverVisibilityReadinessEventSummaryInput | null;
  seedImportRow?: ResolverVisibilityReadinessSeedImportInput | null;
  recommendation?: ResolverVisibilityReadinessRecommendationInput | null;
  peerMappings?: ResolverVisibilityReadinessPeerMappingInput[];
  conflictSummary?: ResolverVisibilityReadinessConflictSummaryInput | null;
};

export type ResolverVisibilityReadinessClassification = {
  state: ResolverVisibilityReadinessState;
  source: ResolverVisibilityReadinessSource;
  reasons: ResolverVisibilityReadinessReason[];
  blockingReasons: ResolverVisibilityReadinessReason[];
  manualReviewReasons: ResolverVisibilityReadinessReason[];
};

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function hasCreatedEvent(
  events: ResolverVisibilityReadinessEventInput[],
  eventSummary: ResolverVisibilityReadinessEventSummaryInput | null | undefined,
) {
  if (eventSummary) {
    return eventSummary.hasCreatedEvent;
  }

  return events.some(
    (event) => event.eventType === "created" && event.newStatus === "active",
  );
}

function hasEventType(
  events: ResolverVisibilityReadinessEventInput[],
  eventType: string,
  eventSummary?: ResolverVisibilityReadinessEventSummaryInput | null,
) {
  if (eventSummary && eventType === "seed_import_adopted") {
    return eventSummary.hasSeedImportAdoptedEvent;
  }

  if (eventSummary && eventType === "pcrm_adopted") {
    return eventSummary.hasPcrmAdoptedEvent;
  }

  return events.some((event) => event.eventType === eventType);
}

function classifyAuthorityLineage(
  input: ResolverVisibilityReadinessInput,
): {
  source: ResolverVisibilityReadinessSource;
  missingLineage: boolean;
  missingAdoptionEvent: boolean;
} {
  const mapping = input.mapping;
  const events = input.events ?? [];
  const eventSummary = input.eventSummary;

  if (!mapping) {
    return {
      source: "unknown",
      missingLineage: true,
      missingAdoptionEvent: true,
    };
  }

  const seedImportRowId = clean(mapping.sourceSeedImportRowId);
  if (seedImportRowId) {
    const seedRow = input.seedImportRow;
    const hasAdoptedSeedRow =
      seedRow?.id === seedImportRowId &&
      seedRow.rowStatus === "adopted_hidden_canonical" &&
      seedRow.canonicalMappingId === mapping.id;

    return {
      source: "seed_import_4f_adoption",
      missingLineage: !hasAdoptedSeedRow,
      missingAdoptionEvent: !hasEventType(
        events,
        "seed_import_adopted",
        eventSummary,
      ),
    };
  }

  const recommendationId = clean(mapping.sourceRecommendationId);
  if (recommendationId) {
    const recommendation = input.recommendation;
    const hasAcceptedRecommendation =
      recommendation?.id === recommendationId &&
      recommendation.recommendationStatus === "accepted" &&
      recommendation.canonicalMappingId === mapping.id;

    return {
      source: "pcrm_adoption",
      missingLineage: !hasAcceptedRecommendation,
      missingAdoptionEvent: !hasEventType(events, "pcrm_adopted", eventSummary),
    };
  }

  if (clean(mapping.sourceCaseId) && clean(mapping.sourceDecisionId)) {
    return {
      source: "catalog_canonical_review",
      missingLineage: false,
      missingAdoptionEvent: false,
    };
  }

  return {
    source: "unknown",
    missingLineage: true,
    missingAdoptionEvent: true,
  };
}

export function classifyResolverVisibilityReadiness(
  input: ResolverVisibilityReadinessInput,
): ResolverVisibilityReadinessClassification {
  const blockingReasons: ResolverVisibilityReadinessReason[] = [];
  const manualReviewReasons: ResolverVisibilityReadinessReason[] = [];
  const mapping = input.mapping;

  if (!mapping) {
    blockingReasons.push("mapping_missing");

    return {
      state: "blocked",
      source: "unknown",
      reasons: blockingReasons,
      blockingReasons,
      manualReviewReasons,
    };
  }

  const misspelling = clean(mapping.misspellingNormalized);
  const correction = clean(mapping.correctSpellingNormalized);
  const dialectCode = clean(mapping.dialectCode);
  const microSkillKey = clean(mapping.microSkillKey);
  const events = input.events ?? [];

  if (mapping.mappingStatus !== "active") {
    blockingReasons.push("mapping_not_active");
  }

  if (mapping.resolverVisibilityStatus !== "hidden") {
    blockingReasons.push("mapping_not_hidden");
  }

  if (!misspelling || !correction) {
    blockingReasons.push("missing_normalized_pair");
  } else if (misspelling === correction) {
    blockingReasons.push("normalized_pair_matches");
  }

  if (!dialectCode) {
    blockingReasons.push("missing_dialect");
  }

  if (!microSkillKey || !input.microSkill) {
    blockingReasons.push("missing_micro_skill");
  } else if (
    input.microSkill.microSkillKey !== microSkillKey ||
    input.microSkill.masteryDomainKey !== "D4" ||
    input.microSkill.isActive !== true ||
    input.microSkill.isAssignable !== true
  ) {
    blockingReasons.push("micro_skill_not_active_assignable_d4");
  }

  const lineage = classifyAuthorityLineage(input);

  if (lineage.missingLineage) {
    blockingReasons.push("missing_authority_lineage");
  }

  if (!hasCreatedEvent(events, input.eventSummary)) {
    blockingReasons.push("missing_created_event");
  }

  if (lineage.missingAdoptionEvent) {
    blockingReasons.push("missing_adoption_event");
  }

  const peerMappings = input.peerMappings ?? [];
  const exactPairDifferentSkill =
    input.conflictSummary?.hasActiveExactPairDifferentMicroSkill ??
    peerMappings.some(
      (peer) =>
        peer.id !== mapping.id &&
        peer.mappingStatus === "active" &&
        clean(peer.dialectCode) === dialectCode &&
        clean(peer.misspellingNormalized) === misspelling &&
        clean(peer.correctSpellingNormalized) === correction &&
        clean(peer.microSkillKey) !== microSkillKey,
    );

  if (exactPairDifferentSkill) {
    blockingReasons.push("exact_pair_duplicate_different_micro_skill");
  }

  const sameMisspellingDifferentCorrection =
    input.conflictSummary?.hasActiveSameMisspellingConflictingCorrection ??
    peerMappings.some(
      (peer) =>
        peer.id !== mapping.id &&
        peer.mappingStatus === "active" &&
        clean(peer.dialectCode) === dialectCode &&
        clean(peer.misspellingNormalized) === misspelling &&
        clean(peer.correctSpellingNormalized) !== correction,
    );

  if (sameMisspellingDifferentCorrection) {
    manualReviewReasons.push("same_misspelling_conflicting_correction");
  }

  const inactiveExactPair =
    input.conflictSummary?.hasInactiveExactPairHistoricalMapping ??
    peerMappings.some(
      (peer) =>
        peer.id !== mapping.id &&
        peer.mappingStatus !== "active" &&
        clean(peer.dialectCode) === dialectCode &&
        clean(peer.misspellingNormalized) === misspelling &&
        clean(peer.correctSpellingNormalized) === correction,
    );

  if (inactiveExactPair) {
    blockingReasons.push("disabled_deprecated_or_superseded_mapping_exists");
  }

  const reasons = [...blockingReasons, ...manualReviewReasons];
  const state =
    blockingReasons.length > 0
      ? "blocked"
      : manualReviewReasons.length > 0
        ? "needs_manual_authority_review"
        : "eligible_for_visibility_review";

  return {
    state,
    source: lineage.source,
    reasons,
    blockingReasons,
    manualReviewReasons,
  };
}
