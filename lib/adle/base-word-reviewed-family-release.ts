import type {
  BaseWordFamilyAuthorityFamily,
  BaseWordFamilyAuthorityMemberV2,
  BaseWordFamilyAuthorityProjectionV2,
} from "./curriculum-release-activation";

export interface ReviewedFamilyDefinition {
  id: string;
  familyKey: string;
  baseWordId: string;
  baseMeaning: string;
  etymologyRoute: Record<string, unknown>;
  sourceFingerprint: string;
}

export interface ReviewedLegacyFamily {
  id: string;
  familyKey: string;
  baseWordId: string;
  baseMeaning: string;
  etymologyRoute: Record<string, unknown>;
  sourceFingerprint: string;
}

export interface ReviewedFamilyMember {
  id: string;
  definitionId: string | null;
  legacyFamilyId: string | null;
  canonicalWordId: string;
  baseWordId: string;
  microSkillKey: string;
  wordSum: string;
  morphologyParts: unknown[];
  morphologyJoins: unknown[];
  morphologyTransformations: unknown[];
  transformationNotes: string;
  childFriendlyMeaning: string;
  complexityLevel: number | null;
  sourceFingerprint: string;
  reviewedAt: string;
  withdrawn: boolean;
  skillReleaseWithdrawn: boolean;
}

/** Builds a new, still inactive v2 family projection from a frozen authority
 * and exact reviewed manager decisions. Publication rechecks every review ID
 * in PostgreSQL. A review never mutates an already activated authority. */
export function buildReviewedBaseFamilyProjection(input: {
  parent: BaseWordFamilyAuthorityProjectionV2;
  microSkillKey: string;
  definitions: readonly ReviewedFamilyDefinition[];
  legacyFamilies: readonly ReviewedLegacyFamily[];
  reviews: readonly ReviewedFamilyMember[];
}): BaseWordFamilyAuthorityProjectionV2 {
  const { parent, microSkillKey } = input;
  const families = new Map<string, BaseWordFamilyAuthorityFamily>();
  for (const family of parent.families) {
    const members = family.members.filter((member) => "applicableMicroSkillKeys" in member &&
      member.applicableMicroSkillKeys.includes(microSkillKey));
    if (members.length) families.set(family.familyId, { ...family, members: members.map((member) => ({
      ...member, applicableMicroSkillKeys: [microSkillKey],
    })) });
  }
  const definitions = new Map(input.definitions.map((definition) => [definition.id, definition]));
  const legacyFamilies = new Map(input.legacyFamilies.map((family) => [family.id, family]));
  const effective = new Map<string, ReviewedFamilyMember>();
  for (const review of [...input.reviews].filter((entry) => entry.microSkillKey === microSkillKey)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt) || a.id.localeCompare(b.id))) {
    effective.set(`${review.legacyFamilyId ?? review.definitionId}:${review.canonicalWordId}`, review);
  }
  const sourceAuthorities = [...parent.sourceAuthorities];
  for (const review of effective.values()) {
    const definition = review.definitionId ? definitions.get(review.definitionId) : null;
    const legacyFamily = review.legacyFamilyId ? legacyFamilies.get(review.legacyFamilyId) : null;
    const familyId = review.legacyFamilyId ?? definition?.id;
    if (!familyId) throw new Error("Reviewed family has no source identity");
    let family = families.get(familyId);
    if (review.withdrawn || review.skillReleaseWithdrawn) {
      if (family) family.members = family.members.filter((member) => member.canonicalWordId !== review.canonicalWordId);
      continue;
    }
    if (!family) {
      const source = definition ?? legacyFamily;
      if (!source) throw new Error("Reviewed family is absent from its source registry");
      family = { familyId: source.id, baseFamilyKey: source.familyKey,
        baseWordId: source.baseWordId, baseMeaning: source.baseMeaning,
        etymologyRoute: source.etymologyRoute, sourceFingerprint: source.sourceFingerprint,
        members: [] };
      families.set(familyId, family);
      const sourceKey = definition ? `manager-family:${definition.id}` : `manager-legacy-family:${legacyFamily!.id}`;
      sourceAuthorities.push({ authorityKey: sourceKey,
        sourceKind: "approved_repository_artifact", sourceId: sourceKey,
        sourceFingerprint: source.sourceFingerprint });
    }
    if (family.baseWordId !== review.baseWordId) throw new Error("Reviewed family base identity changed");
    const member: BaseWordFamilyAuthorityMemberV2 = {
      memberId: review.id, canonicalWordId: review.canonicalWordId,
      structuralRole: review.canonicalWordId === family.baseWordId ? "base" : "family_member",
      authenticTargetEligible: review.canonicalWordId !== family.baseWordId,
      applicableMicroSkillKeys: [microSkillKey], assignmentEligible: true,
      complexityLevel: review.complexityLevel, wordSum: review.wordSum,
      morphologyParts: review.morphologyParts, morphologyJoins: review.morphologyJoins,
      morphologyTransformations: review.morphologyTransformations,
      transformationNotes: review.transformationNotes,
      childFriendlyMeaning: review.childFriendlyMeaning,
      morphologySource: { sourceKind: "approved_manager_review", sourceId: review.id,
        sourceFingerprint: review.sourceFingerprint, sourceAuthorityKey: `manager-review:${review.id}` },
    };
    family.members = [...family.members.filter((existing) => existing.canonicalWordId !== review.canonicalWordId), member];
    sourceAuthorities.push({ authorityKey: `manager-review:${review.id}`,
      sourceKind: "approved_repository_artifact", sourceId: `manager-review:${review.id}`,
      sourceFingerprint: review.sourceFingerprint });
  }
  for (const family of families.values()) {
    if (family.members.length < 2 && parent.families.some((existing) => existing.familyId === family.familyId))
      throw new Error(`Existing Base Word family ${family.baseFamilyKey} would lose its reviewed minimum`);
  }
  const result = [...families.values()].filter((family) => family.members.length >= 2)
    .map((family) => ({ ...family, members: [...family.members].sort((a, b) =>
      a.canonicalWordId.localeCompare(b.canonicalWordId) || a.memberId.localeCompare(b.memberId)) }))
    .sort((a, b) => a.baseFamilyKey.localeCompare(b.baseFamilyKey) || a.familyId.localeCompare(b.familyId));
  if (result.length < 2) throw new Error("Base Word release needs at least two reviewed families");
  for (const family of result) if (family.members.filter((member) =>
    "structuralRole" in member && member.structuralRole === "base").length !== 1)
    throw new Error(`Base Word family ${family.baseFamilyKey} needs one reviewed base`);
  return { schemaVersion: 2, skillClusterKey: "D4_MOR_BASE_WORDS",
    sourceAuthorities: [...new Map(sourceAuthorities.map((entry) => [entry.authorityKey, entry])).values()]
      .sort((a, b) => a.authorityKey.localeCompare(b.authorityKey)), families: result };
}
