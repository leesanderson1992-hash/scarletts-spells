import {
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY,
  type GenericSnapshotTemplateDefinition,
} from "./generic-snapshot-registry";

export type GenericSnapshotRequirementKey =
  | "assignment_binding"
  | "canonical_identity"
  | "display_word"
  | "word_role_binding"
  | "micro_skill_content"
  | "template_content_version"
  | "family_method_version"
  | "ordered_quick_sort_words"
  | "quick_sort_bins"
  | "review_due_binding"
  | "sentence_context_flag"
  | "ordered_probe_words"
  | "reflection_condition"
  | "prior_attempt_summary"
  | "sentence_evidence_contract";

export interface GenericSnapshotRequirement {
  key: GenericSnapshotRequirementKey;
  availability: "compile" | "runtime";
  required: boolean;
}

export interface GenericSnapshotActivityRequirementDefinition {
  templateKey: string;
  requirementVersion: 2;
  compileSupport: GenericSnapshotTemplateDefinition["compileSupport"];
  requirements: readonly GenericSnapshotRequirement[];
}

const required = (
  key: GenericSnapshotRequirementKey,
  availability: GenericSnapshotRequirement["availability"] = "compile",
): GenericSnapshotRequirement => ({ key, availability, required: true });
const optional = (
  key: GenericSnapshotRequirementKey,
  availability: GenericSnapshotRequirement["availability"] = "compile",
): GenericSnapshotRequirement => ({ key, availability, required: false });

function requirementsFor(
  definition: GenericSnapshotTemplateDefinition,
): readonly GenericSnapshotRequirement[] {
  const common = [required("assignment_binding"), required("template_content_version")];
  switch (definition.templateKey) {
    case "MICRO_READ_ONLY_INTRO":
      return [...common, required("micro_skill_content"), required("family_method_version")];
    case "LESSON_WORDS_INTRO":
      return [...common, required("canonical_identity"), required("display_word"), required("word_role_binding")];
    case "REVIEW_QUICK_SORT":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("ordered_quick_sort_words"),
        optional("quick_sort_bins"),
      ];
    case "REVIEW_DICTATION":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("review_due_binding"),
      ];
    case "DICTATION_SENTENCE_CONTEXT":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("sentence_context_flag"),
      ];
    case "DIAGNOSTIC_DICTATION_PROBE":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("ordered_probe_words"),
      ];
    case "ERROR_REFLECTION_CUE":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("reflection_condition"),
        required("prior_attempt_summary", "runtime"),
      ];
    case "MUST_USE_FREEWRITING":
    case "REVIEW_MUST_USE_WRITING":
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        required("sentence_evidence_contract"),
      ];
    default:
      return [
        ...common,
        required("canonical_identity"),
        required("display_word"),
        required("word_role_binding"),
        ...(definition.kind === "introduction" ? [] : [required("micro_skill_content")]),
      ];
  }
}

export const GENERIC_SNAPSHOT_ACTIVITY_REQUIREMENTS =
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.map((definition) => ({
    templateKey: definition.templateKey,
    requirementVersion: 2 as const,
    compileSupport: definition.compileSupport,
    requirements: requirementsFor(definition),
  })) satisfies readonly GenericSnapshotActivityRequirementDefinition[];

const BY_TEMPLATE = new Map(
  GENERIC_SNAPSHOT_ACTIVITY_REQUIREMENTS.map((entry) => [entry.templateKey, entry]),
);

export function getGenericSnapshotActivityRequirements(
  templateKey: string,
): GenericSnapshotActivityRequirementDefinition | null {
  return BY_TEMPLATE.get(templateKey) ?? null;
}

export function validateGenericSnapshotRequirementRegistry(): string[] {
  const errors: string[] = [];
  for (const definition of GENERIC_SNAPSHOT_TEMPLATE_REGISTRY) {
    const requirement = BY_TEMPLATE.get(definition.templateKey);
    if (!requirement) errors.push(`missing_requirements:${definition.templateKey}`);
    if (requirement?.compileSupport !== definition.compileSupport) {
      errors.push(`compile_support_mismatch:${definition.templateKey}`);
    }
  }
  for (const requirement of GENERIC_SNAPSHOT_ACTIVITY_REQUIREMENTS) {
    if (!GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.some((entry) => entry.templateKey === requirement.templateKey)) {
      errors.push(`orphan_requirements:${requirement.templateKey}`);
    }
  }
  return errors.sort();
}
