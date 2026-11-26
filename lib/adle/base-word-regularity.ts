import { hasUsefulSpellingConnection, hasReviewedBaseExtension, hasReviewedFamilyVariation } from "./spelling-family-connection";
import type { BaseWordFamilyAuthorityMember, BaseWordFamilyAuthorityProjection } from "./curriculum-release-activation";

export type BaseWordRegularityDecision = NonNullable<BaseWordFamilyAuthorityMember["lessonRegularity"]>;

const GOVERNED_NON_IRREGULAR_TRANSFORMS = new Set([
  "spelling_change", "y_to_i", "drop_final_e", "double_final_consonant",
  "insert_t_at_suffix_boundary", "join", "change_final_y_to_i",
  "change_final_ie_to_y", "change_final_f_to_v", "change_final_fe_to_v",
  "remove_letter", "replace_final", "base_spelling_change",
]);

/** A governed spelling transformation does not itself mean irregular inflection. */
export function reviewedBaseWordRegularity(input: {
  relationshipKind?: string | null;
  transformations: readonly unknown[];
  reviewed: boolean;
  parts?: readonly unknown[];
}): BaseWordRegularityDecision {
  if (!input.reviewed) return { status: "needs_review", source: "canonical_morphology", reason: "morphology_not_reviewed" };
  const kinds = input.transformations.map((value) => value && typeof value === "object"
    ? String("kind" in value ? value.kind : "type" in value ? value.type : "unknown") : "unknown");
  if (input.relationshipKind === "derived" && input.parts && hasReviewedBaseExtension(input.parts, input.transformations))
    return { status: "regular", source: "canonical_morphology", reason: "reviewed_base_spelling_extension" };
  if (input.relationshipKind === "irregular_inflection" && input.parts &&
    hasUsefulSpellingConnection(input.parts, input.transformations) && !kinds.includes("irregular_form") &&
    (kinds.every(kind => GOVERNED_NON_IRREGULAR_TRANSFORMS.has(kind)) || hasReviewedBaseExtension(input.parts, input.transformations)))
    return { status: "regular", source: "approved_lexical_relationship", reason: "reviewed_spelling_connection" };
  if (["derived", "regular_inflection"].includes(input.relationshipKind ?? "") && input.parts
    && hasReviewedFamilyVariation(input.parts, input.transformations)
    && kinds.every(kind => kind === "other_reviewed_change" || GOVERNED_NON_IRREGULAR_TRANSFORMS.has(kind)))
    return { status: "regular", source: "canonical_morphology", reason: "reviewed_family_spelling_variation" };
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
      const existing = member.lessonRegularity;
      const lessonRegularity = existing?.status === "irregular" && hasUsefulSpellingConnection(member.morphologyParts, member.morphologyTransformations)
        ? reviewedBaseWordRegularity({ relationshipKind: "irregular_inflection", transformations: member.morphologyTransformations,
          parts: member.morphologyParts, reviewed: true }) : existing ?? reviewedBaseWordRegularity({
        relationshipKind: base ? "free_base" : null,
        transformations: member.morphologyTransformations,
        parts: member.morphologyParts, reviewed: true,
      });
      return { ...member, lessonRegularity };
    }),
  })) } as T;
}
