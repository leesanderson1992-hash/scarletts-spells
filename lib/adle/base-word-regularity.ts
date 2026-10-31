import type { BaseWordFamilyAuthorityMember, BaseWordFamilyAuthorityProjection } from "./curriculum-release-activation";

export type BaseWordRegularityDecision = NonNullable<BaseWordFamilyAuthorityMember["lessonRegularity"]>;

const GOVERNED_NON_IRREGULAR_TRANSFORMS = new Set([
  "spelling_change", "y_to_i", "drop_final_e", "double_final_consonant",
  "insert_t_at_suffix_boundary", "join", "change_final_y_to_i",
  "remove_letter", "replace_final", "base_spelling_change",
]);

/** A governed spelling transformation does not itself mean irregular inflection. */
export function reviewedBaseWordRegularity(input: {
  relationshipKind?: string | null;
  transformations: readonly unknown[];
  reviewed: boolean;
}): BaseWordRegularityDecision {
  if (!input.reviewed) return { status: "needs_review", source: "canonical_morphology", reason: "morphology_not_reviewed" };
  const kinds = input.transformations.map((value) => value && typeof value === "object"
    ? String("kind" in value ? value.kind : "type" in value ? value.type : "unknown") : "unknown");
  if (kinds.some((kind) => kind !== "irregular_form" && !GOVERNED_NON_IRREGULAR_TRANSFORMS.has(kind)))
    return { status: "needs_review", source: "canonical_morphology", reason: "transformation_kind_unclassified" };
  if (kinds.includes("irregular_form") && input.relationshipKind && input.relationshipKind !== "irregular_inflection")
    return { status: "needs_review", source: "conflicting_reviewed_sources", reason: "relationship_morphology_conflict" };
  if (input.relationshipKind === "irregular_inflection" || kinds.includes("irregular_form"))
    return { status: "irregular", source: input.relationshipKind === "irregular_inflection" ? "approved_lexical_relationship" : "canonical_morphology", reason: "irregular_inflection" };
  if (!input.relationshipKind) return { status: "needs_review", source: "family_membership", reason: "relationship_kind_unclassified" };
  if (!["free_base", "regular_inflection", "derived"].includes(input.relationshipKind))
    return { status: "needs_review", source: "approved_lexical_relationship", reason: "relationship_kind_requires_review" };
  return { status: "regular", source: "approved_lexical_relationship", reason: "reviewed_regular_family_member" };
}

export function baseWordMemberSelectable(authority: BaseWordFamilyAuthorityProjection, member: BaseWordFamilyAuthorityMember): boolean {
  return member.assignmentEligible && (authority.schemaVersion !== 2 || authority.selectionPolicyVersion !== "base_word_regularity_v1"
    || member.lessonRegularity?.status === "regular");
}

/** A new release records a decision for every member. Historical projections are left untouched. */
export function regularityReviewedRelease<T extends Extract<BaseWordFamilyAuthorityProjection, { schemaVersion: 2 }>>(authority: T): T {
  return { ...authority, selectionPolicyVersion: "base_word_regularity_v1", families: authority.families.map((family) => ({
    ...family, members: family.members.map((member) => {
      const base = member.canonicalWordId === family.baseWordId;
      const lessonRegularity = member.lessonRegularity ?? reviewedBaseWordRegularity({
        relationshipKind: base ? "free_base" : null,
        transformations: member.morphologyTransformations,
        reviewed: true,
      });
      return { ...member, lessonRegularity };
    }),
  })) } as T;
}
