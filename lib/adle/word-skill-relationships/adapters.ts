import "server-only";

import type {
  CanonicalRelationshipRole,
  RawWordSkillRelationshipFact,
  ReleaseState,
} from "./contracts";

const APPROVED_REVIEW_STATES = new Set([
  "approved_for_guided_review",
  "approved_for_first_exposure",
  "approved",
  "human_approved",
]);

function reviewState(value: string | null | undefined): RawWordSkillRelationshipFact["reviewState"] {
  if (!value) return "unknown";
  if (APPROVED_REVIEW_STATES.has(value)) return "approved";
  if (value === "rejected" || value === "superseded") return "rejected";
  return "unreviewed";
}

function activeState(value: string | null | undefined): RawWordSkillRelationshipFact["sourceState"] {
  if (value === "active" || value === "applied") return "active";
  if (value === "draft" || value === "inactive" || value === "deactivated" || value === "superseded" || value === "rejected") return "inactive";
  return "unknown";
}

export interface ResolverMappingAdapterRow {
  id: string;
  canonicalWordId: string | null;
  microSkillKey: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  mappingStatus: string;
  resolverVisibilityStatus: string;
  normalizationVersion: string;
  visibilityEnableEventIds: readonly string[];
}

export function adaptResolverMappings(rows: readonly ResolverMappingAdapterRow[]): RawWordSkillRelationshipFact[] {
  return rows.map((row) => {
    const auditedVisible = row.mappingStatus === "active" && row.resolverVisibilityStatus === "visible" && row.visibilityEnableEventIds.length > 0;
    return {
      sourceAuthority: "approved_resolver_mapping",
      provenanceId: row.id || null,
      sourceAuthorityVersion: row.normalizationVersion && row.visibilityEnableEventIds.length > 0
        ? `resolver:${row.normalizationVersion}:${[...row.visibilityEnableEventIds].sort().join("+")}`
        : row.normalizationVersion ? `resolver:${row.normalizationVersion}:visibility-unestablished` : null,
      canonicalWordId: row.canonicalWordId,
      microSkillKey: row.microSkillKey || null,
      relationshipRole: "demonstrates",
      sourceState: activeState(row.mappingStatus),
      exactPairApproval: auditedVisible ? "approved" : "unapproved",
      reviewState: auditedVisible ? "approved" : "unreviewed",
      releaseState: "not_applicable",
      provenanceMetadata: {
        misspellingNormalized: row.misspellingNormalized,
        correctSpellingNormalized: row.correctSpellingNormalized,
        resolverVisibilityStatus: row.resolverVisibilityStatus,
      },
    };
  });
}

export interface GenericSupportAdapterRow {
  id: string;
  canonicalWordId: string;
  microSkillKey: string;
  supportRole: string;
  rowStatus: string;
  reviewStatus: string;
  importBatchId: string;
  importBatchStatus: string;
  sourceRowHash: string;
  sourceCommit: string | null;
  sourceFolderSha256: string | null;
}

export function adaptGenericSupport(rows: readonly GenericSupportAdapterRow[]): RawWordSkillRelationshipFact[] {
  return rows.map((row) => {
    const role: CanonicalRelationshipRole = row.supportRole === "contrast" ? "contrast_only"
      : row.supportRole === "support_example" || row.supportRole === "review_example" ? "demonstrates"
        : "non_positive";
    const approved = APPROVED_REVIEW_STATES.has(row.reviewStatus);
    return {
      sourceAuthority: "approved_generic_support",
      provenanceId: row.id || null,
      sourceAuthorityVersion: row.importBatchId && row.sourceRowHash && (row.sourceCommit || row.sourceFolderSha256)
        ? `teaching-dictionary:${row.importBatchId}:${row.sourceRowHash}:${row.sourceCommit ?? row.sourceFolderSha256 ?? "source-unversioned"}`
        : null,
      canonicalWordId: row.canonicalWordId || null,
      microSkillKey: row.microSkillKey || null,
      relationshipRole: role,
      sourceState: row.importBatchStatus === "applied" ? activeState(row.rowStatus) : "inactive",
      exactPairApproval: approved ? "approved" : "unapproved",
      reviewState: reviewState(row.reviewStatus),
      releaseState: "not_applicable",
      provenanceMetadata: { supportRole: row.supportRole, importBatchStatus: row.importBatchStatus },
    };
  });
}

export interface SpecialistMembershipAdapterRow {
  sourceKind: "profile_membership" | "route_content";
  provenanceId: string;
  canonicalWordId: string;
  microSkillKey: string;
  rowStatus: string;
  reviewStatus: string;
  exactPairApproved: boolean;
  releaseState: ReleaseState;
  authorityVersion: string | null;
  memberRole: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export function adaptSpecialistMemberships(rows: readonly SpecialistMembershipAdapterRow[]): RawWordSkillRelationshipFact[] {
  return rows.map((row) => ({
    sourceAuthority: row.sourceKind === "profile_membership" ? "released_specialist_membership" : "released_route_content",
    provenanceId: row.provenanceId || null,
    sourceAuthorityVersion: row.authorityVersion,
    canonicalWordId: row.canonicalWordId || null,
    microSkillKey: row.microSkillKey || null,
    relationshipRole: row.memberRole === "contrast" ? "contrast_only" : "demonstrates",
    sourceState: activeState(row.rowStatus),
    exactPairApproval: row.exactPairApproved ? "approved" : "unapproved",
    reviewState: reviewState(row.reviewStatus),
    releaseState: row.releaseState,
    provenanceMetadata: { memberRole: row.memberRole, ...(row.metadata ?? {}) },
  }));
}

export interface ExplicitReviewedAssociationAdapterRow {
  associationId: string;
  canonicalWordId: string | null;
  microSkillKey: string;
  relationshipRole: CanonicalRelationshipRole;
  rowStatus: string;
  reviewStatus: string;
  authorityVersion: string | null;
  exactPairApproved: boolean;
  releaseState?: ReleaseState;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export function adaptExplicitReviewedAssociations(rows: readonly ExplicitReviewedAssociationAdapterRow[]): RawWordSkillRelationshipFact[] {
  return rows.map((row) => ({
    sourceAuthority: "explicit_reviewed_association",
    provenanceId: row.associationId || null,
    sourceAuthorityVersion: row.authorityVersion,
    canonicalWordId: row.canonicalWordId,
    microSkillKey: row.microSkillKey || null,
    relationshipRole: row.relationshipRole,
    sourceState: activeState(row.rowStatus),
    exactPairApproval: row.exactPairApproved ? "approved" : "unapproved",
    reviewState: reviewState(row.reviewStatus),
    releaseState: row.releaseState ?? "not_applicable",
    provenanceMetadata: row.metadata ?? {},
  }));
}
