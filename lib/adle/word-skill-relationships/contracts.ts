export const CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION =
  "ADLE_PROFICIENCY_MODEL_V1" as const;

export const RELATIONSHIP_SOURCE_AUTHORITIES = [
  "approved_resolver_mapping",
  "released_specialist_membership",
  "released_route_content",
  "approved_generic_support",
  "explicit_reviewed_association",
] as const;

export type RelationshipSourceAuthority =
  (typeof RELATIONSHIP_SOURCE_AUTHORITIES)[number];

export type CanonicalRelationshipRole =
  | "demonstrates"
  | "contrast_only"
  | "diagnostic_only"
  | "negative_only"
  | "non_positive";

export type RelationshipDisposition =
  | "ADMITTED"
  | "EXCLUDED"
  | "BLOCKED"
  | "AMBIGUOUS";

export type RelationshipDecisionReason =
  | "ADMITTED_EXACT_PAIR"
  | "CONTRAST_ONLY"
  | "DIAGNOSTIC_ONLY"
  | "NEGATIVE_ONLY"
  | "NON_POSITIVE_ROLE"
  | "SOURCE_INACTIVE"
  | "SOURCE_STATE_UNKNOWN"
  | "EXACT_PAIR_NOT_APPROVED"
  | "REVIEW_NOT_APPROVED"
  | "REVIEW_STATE_UNKNOWN"
  | "SPECIALIST_CONTENT_UNRELEASED"
  | "RELEASE_STATE_UNKNOWN"
  | "CANONICAL_WORD_ID_MISSING"
  | "CANONICAL_WORD_ID_UNKNOWN"
  | "CANONICAL_WORD_ID_UNSTABLE"
  | "MICRO_SKILL_KEY_MISSING"
  | "MICRO_SKILL_KEY_UNKNOWN"
  | "MICRO_SKILL_INACTIVE"
  | "MICRO_SKILL_IDENTITY_UNSTABLE"
  | "PROVENANCE_ID_MISSING"
  | "SOURCE_AUTHORITY_VERSION_MISSING"
  | "CONFLICTING_PROVENANCE_METADATA"
  | "IRRECONCILABLE_ACTIVE_ROLES";

export type AuthorityState = "active" | "inactive" | "unknown";
export type ReviewState = "approved" | "unreviewed" | "rejected" | "unknown" | "not_applicable";
export type ReleaseState = "released" | "unreleased" | "unknown" | "not_applicable";
export type ExactPairApprovalState = "approved" | "unapproved" | "ambiguous" | "unknown";

export interface CanonicalWordIdentityFact {
  canonicalWordId: string;
  normalisedWord: string;
  state: AuthorityState;
  identityStable: boolean;
}

export interface MicroSkillIdentityFact {
  microSkillKey: string;
  state: AuthorityState;
  identityStable: boolean;
}

export interface RawWordSkillRelationshipFact {
  sourceAuthority: RelationshipSourceAuthority;
  provenanceId: string | null;
  sourceAuthorityVersion: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  relationshipRole: CanonicalRelationshipRole;
  sourceState: AuthorityState;
  exactPairApproval: ExactPairApprovalState;
  reviewState: ReviewState;
  releaseState: ReleaseState;
  /** Stable, non-secret source fields needed to distinguish or audit facts. */
  provenanceMetadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CanonicalWordSkillRelationshipProvenance {
  sourceAuthority: RelationshipSourceAuthority;
  provenanceId: string;
  sourceAuthorityVersion: string;
  relationshipRole: CanonicalRelationshipRole;
  exactPairApproval: ExactPairApprovalState;
  reviewState: ReviewState;
  releaseState: ReleaseState;
  occurrenceCount: number;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CanonicalWordSkillRelationship {
  canonicalWordId: string;
  microSkillKey: string;
  relationshipRole: "demonstrates";
  positiveEvidenceEligible: true;
  sourceProvenance: CanonicalWordSkillRelationshipProvenance[];
  authorityInterpretationVersion: typeof CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION;
  authorityFingerprint: string;
}

export interface RelationshipDecision {
  disposition: RelationshipDisposition;
  reason: RelationshipDecisionReason;
  sourceAuthority: RelationshipSourceAuthority;
  provenanceId: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  relationshipRole: CanonicalRelationshipRole;
  sourceAuthorityVersion: string | null;
}

export interface RelationshipSourceCount {
  sourceRows: number;
  admittedProvenance: number;
  admittedOccurrences: number;
  excluded: number;
  blocked: number;
  ambiguous: number;
}

export interface CanonicalWordSkillReconciliation {
  authorityInterpretationVersion: typeof CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION;
  sourceFingerprint: string;
  sourceCounts: Record<RelationshipSourceAuthority, RelationshipSourceCount>;
  sourceRowCount: number;
  admittedProvenanceCount: number;
  admittedProvenanceOccurrenceCount: number;
  deduplicatedExactPairCount: number;
  multiProvenancePairCount: number;
  specialistOnlyPairCount: number;
  resolverOnlyPairCount: number;
  genericSupportPairCount: number;
  explicitReviewedPairCount: number;
  contrastOnlyExclusionCount: number;
  inactiveSkillExclusionCount: number;
  unknownOrUnstableIdentityCount: number;
  unreviewedOrUnreleasedExclusionCount: number;
  ambiguousRelationshipCount: number;
  blockedFactCount: number;
  noSchemaSufficient: boolean;
}

export interface CanonicalWordSkillRelationshipReadResult {
  relationships: CanonicalWordSkillRelationship[];
  decisions: RelationshipDecision[];
  reconciliation: CanonicalWordSkillReconciliation;
}
