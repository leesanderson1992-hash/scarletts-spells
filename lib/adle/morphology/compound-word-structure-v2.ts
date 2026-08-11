import type { ClosedCompoundWord } from "./closed-compound-word-lab";

export const COMPOUND_WORD_STRUCTURE_SCHEMA_VERSION = 2 as const;

export const COMPOUND_WORD_MICRO_SKILL_KEYS = [
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
] as const;

export type CompoundWordMicroSkillKey =
  (typeof COMPOUND_WORD_MICRO_SKILL_KEYS)[number];

export const COMPOUND_WORD_JOIN_KINDS = ["none", "space", "hyphen"] as const;
export type CompoundWordJoinKind = (typeof COMPOUND_WORD_JOIN_KINDS)[number];
export type CompoundWordDisplayClassification =
  | "closed"
  | "open"
  | "hyphenated"
  | "mixed";

export type CompoundWordComponentV2 = {
  ordinal: number;
  canonicalWordId: string;
  displaySurface: string;
  meaning: string;
  sense: string | null;
};

export type CompoundWordJoinV2 = {
  ordinal: number;
  kind: CompoundWordJoinKind;
};

export type CompoundWordReviewProvenanceV2 = {
  status: string;
  reviewedBy: string;
  reviewedAt: string;
};

export type CompoundWordSourceProvenanceV2 = {
  artifact: string;
  sourceRowHash: string;
  sheet: string | null;
  row: number | null;
};

/**
 * Canonical CW-1 structure authority. Ordered components and joins are the
 * sole structural truth; display classification is always derived.
 */
export type CompoundWordStructureV2 = {
  schemaVersion: typeof COMPOUND_WORD_STRUCTURE_SCHEMA_VERSION;
  wholeCanonicalWordId: string;
  microSkillKey: CompoundWordMicroSkillKey;
  wholeWord: string;
  components: readonly CompoundWordComponentV2[];
  joins: readonly CompoundWordJoinV2[];
  childFriendlyMeaning: string;
  componentToWholeRelationship: string;
  morphologyProvenance: Readonly<Record<string, unknown>>;
  assignmentEligible: boolean;
  transferEligible: boolean;
  review: CompoundWordReviewProvenanceV2;
  source: CompoundWordSourceProvenanceV2;
};

export type CompoundWordStructureBlocker =
  | "unsupported_schema_version"
  | "unsupported_micro_skill"
  | "whole_canonical_word_id_missing"
  | "whole_word_missing"
  | "component_count_invalid"
  | "component_order_invalid"
  | "component_canonical_word_id_missing"
  | "component_surface_missing"
  | "component_meaning_missing"
  | "component_sense_invalid"
  | "join_count_invalid"
  | "join_order_invalid"
  | "join_kind_invalid"
  | "reconstruction_mismatch"
  | "whole_meaning_missing"
  | "component_to_whole_relationship_missing"
  | "morphology_provenance_missing"
  | "review_provenance_missing"
  | "source_provenance_missing"
  | "eligibility_invalid";

export type CompoundWordStructureValidation =
  | { ok: true; structure: CompoundWordStructureV2; blockers: [] }
  | { ok: false; structure: null; blockers: CompoundWordStructureBlocker[] };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function compoundWordJoinSeparator(kind: CompoundWordJoinKind): string {
  if (kind === "space") return " ";
  if (kind === "hyphen") return "-";
  return "";
}

export function reconstructCompoundWordV2(
  components: readonly Pick<CompoundWordComponentV2, "displaySurface">[],
  joins: readonly Pick<CompoundWordJoinV2, "kind">[],
): string | null {
  if (components.length < 2 || joins.length !== components.length - 1) {
    return null;
  }
  return components.reduce(
    (written, component, index) =>
      index === 0
        ? component.displaySurface
        : `${written}${compoundWordJoinSeparator(joins[index - 1].kind)}${component.displaySurface}`,
    "",
  );
}

export function deriveCompoundWordDisplayClassification(
  joins: readonly Pick<CompoundWordJoinV2, "kind">[],
): CompoundWordDisplayClassification | null {
  if (joins.length === 0) return null;
  if (joins.every((join) => join.kind === "none")) return "closed";
  if (joins.every((join) => join.kind === "space")) return "open";
  if (joins.every((join) => join.kind === "hyphen")) return "hyphenated";
  return "mixed";
}

/** Publication-grade validation is deliberately strict and fail-closed. */
export function validateCompoundWordStructureV2(
  value: unknown,
): CompoundWordStructureValidation {
  const blockers = new Set<CompoundWordStructureBlocker>();
  if (!object(value)) {
    return { ok: false, structure: null, blockers: ["unsupported_schema_version"] };
  }
  if (value.schemaVersion !== COMPOUND_WORD_STRUCTURE_SCHEMA_VERSION) {
    blockers.add("unsupported_schema_version");
  }
  if (
    !COMPOUND_WORD_MICRO_SKILL_KEYS.includes(
      value.microSkillKey as CompoundWordMicroSkillKey,
    )
  ) {
    blockers.add("unsupported_micro_skill");
  }
  if (!nonEmpty(value.wholeCanonicalWordId) || !UUID.test(value.wholeCanonicalWordId)) {
    blockers.add("whole_canonical_word_id_missing");
  }
  if (!nonEmpty(value.wholeWord)) blockers.add("whole_word_missing");

  const components = Array.isArray(value.components) ? value.components : [];
  const joins = Array.isArray(value.joins) ? value.joins : [];
  if (components.length < 2) blockers.add("component_count_invalid");
  for (const [index, candidate] of components.entries()) {
    if (!object(candidate) || candidate.ordinal !== index + 1) {
      blockers.add("component_order_invalid");
    }
    if (
      !object(candidate) ||
      !nonEmpty(candidate.canonicalWordId) ||
      !UUID.test(candidate.canonicalWordId)
    ) {
      blockers.add("component_canonical_word_id_missing");
    }
    if (!object(candidate) || !nonEmpty(candidate.displaySurface)) {
      blockers.add("component_surface_missing");
    }
    if (!object(candidate) || !nonEmpty(candidate.meaning)) {
      blockers.add("component_meaning_missing");
    }
    if (!object(candidate) || (candidate.sense !== null && !nonEmpty(candidate.sense))) {
      blockers.add("component_sense_invalid");
    }
  }
  if (joins.length !== components.length - 1) blockers.add("join_count_invalid");
  for (const [index, candidate] of joins.entries()) {
    if (!object(candidate) || candidate.ordinal !== index + 1) {
      blockers.add("join_order_invalid");
    }
    if (
      !object(candidate) ||
      !COMPOUND_WORD_JOIN_KINDS.includes(candidate.kind as CompoundWordJoinKind)
    ) {
      blockers.add("join_kind_invalid");
    }
  }

  if (
    blockers.has("component_count_invalid") ||
    blockers.has("component_surface_missing") ||
    blockers.has("join_count_invalid") ||
    blockers.has("join_kind_invalid")
  ) {
    blockers.add("reconstruction_mismatch");
  } else {
    const reconstructed = reconstructCompoundWordV2(
      components as CompoundWordComponentV2[],
      joins as CompoundWordJoinV2[],
    );
    if (reconstructed !== value.wholeWord) blockers.add("reconstruction_mismatch");
  }

  if (!nonEmpty(value.childFriendlyMeaning)) blockers.add("whole_meaning_missing");
  if (!nonEmpty(value.componentToWholeRelationship)) {
    blockers.add("component_to_whole_relationship_missing");
  }
  if (!object(value.morphologyProvenance) || Object.keys(value.morphologyProvenance).length === 0) {
    blockers.add("morphology_provenance_missing");
  }
  if (
    !object(value.review) ||
    !nonEmpty(value.review.status) ||
    !nonEmpty(value.review.reviewedBy) ||
    !nonEmpty(value.review.reviewedAt)
  ) {
    blockers.add("review_provenance_missing");
  }
  if (
    !object(value.source) ||
    !nonEmpty(value.source.artifact) ||
    !nonEmpty(value.source.sourceRowHash) ||
    (value.source.sheet !== null && !nonEmpty(value.source.sheet)) ||
    (value.source.row !== null &&
      (!Number.isInteger(value.source.row) || Number(value.source.row) < 1))
  ) {
    blockers.add("source_provenance_missing");
  }
  if (typeof value.assignmentEligible !== "boolean" || typeof value.transferEligible !== "boolean") {
    blockers.add("eligibility_invalid");
  }

  const orderedBlockers = [...blockers];
  if (orderedBlockers.length > 0) {
    return { ok: false, structure: null, blockers: orderedBlockers };
  }
  return {
    ok: true,
    structure: value as CompoundWordStructureV2,
    blockers: [],
  };
}

export type ClosedCompoundV1CompatibilityAuthority = {
  componentCanonicalWordIds: readonly [string, string];
  componentToWholeRelationship: string;
  review: CompoundWordReviewProvenanceV2;
  source: CompoundWordSourceProvenanceV2;
};

/**
 * Historical v1 facts lack component IDs and the reviewed semantic
 * relationship. Callers must provide those governed facts; the adapter never
 * invents them.
 */
export function adaptClosedCompoundWordV1ToV2(
  word: ClosedCompoundWord,
  authority: ClosedCompoundV1CompatibilityAuthority,
): CompoundWordStructureValidation {
  return validateCompoundWordStructureV2({
    schemaVersion: COMPOUND_WORD_STRUCTURE_SCHEMA_VERSION,
    wholeCanonicalWordId: word.canonicalWordId,
    microSkillKey: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
    wholeWord: word.displayWord,
    components: [
      {
        ordinal: 1,
        canonicalWordId: authority.componentCanonicalWordIds[0],
        displaySurface: word.firstWord,
        meaning: word.firstWordMeaning,
        sense: null,
      },
      {
        ordinal: 2,
        canonicalWordId: authority.componentCanonicalWordIds[1],
        displaySurface: word.secondWord,
        meaning: word.secondWordMeaning,
        sense: null,
      },
    ],
    joins: [{ ordinal: 1, kind: "none" }],
    childFriendlyMeaning: word.childFriendlyDefinition,
    componentToWholeRelationship: authority.componentToWholeRelationship,
    morphologyProvenance: word.trueMorphology.provenance,
    assignmentEligible: word.approvedTransfer,
    transferEligible: word.approvedTransfer,
    review: authority.review,
    source: authority.source,
  });
}
