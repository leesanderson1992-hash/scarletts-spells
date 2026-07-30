import type {
  AnswerVisibilityMode,
  AssignmentWordRole,
  LessonActivityKind,
  LessonEvidenceMode,
} from "./contracts";

export const ACTIVITY_REQUIREMENT_REGISTRY_VERSION =
  "adle_activity_requirements_v1" as const;

export type ActivityFactOwner =
  | "canonical_word"
  | "word_micro_skill_support"
  | "micro_skill_profile"
  | "cluster_recipe"
  | "compiled_assignment_snapshot";

export type ActivityFactKey =
  | "canonical_identity"
  | "display_word"
  | "canonical_status"
  | "pronunciation"
  | "syllables"
  | "stress"
  | "schwa"
  | "phonemes"
  | "frequency_band"
  | "age_band"
  | "complexity_band"
  | "word_micro_skill_support"
  | "child_meaning"
  | "whole_word_meaning"
  | "meaning_group"
  | "teaching_decomposition"
  | "canonical_morphology"
  | "joins"
  | "transformations"
  | "base_or_root"
  | "affix_form"
  | "compound_components"
  | "dictation_sentence"
  | "dictation_target"
  | "dictation_audio"
  | "micro_skill_content"
  | "family_section"
  | "reflection_prompt"
  | "assignment_binding"
  | "prior_attempt_summary";

export interface ActivityFactRequirement {
  factKey: ActivityFactKey;
  owner: ActivityFactOwner;
  roles?: readonly AssignmentWordRole[];
}

export interface ActivityRequirementDefinition {
  kind: LessonActivityKind;
  requirementVersion: 1;
  requiredFacts: readonly ActivityFactRequirement[];
  optionalFacts: readonly ActivityFactRequirement[];
  compiledOnlyFields: readonly string[];
  contradictionRules: readonly string[];
  roleRequirements: readonly AssignmentWordRole[];
  answerVisibility: AnswerVisibilityMode;
  evidenceMode: LessonEvidenceMode;
  applicableRecipes: readonly string[];
}

const canonical = (
  factKey: ActivityFactKey,
  roles?: readonly AssignmentWordRole[],
): ActivityFactRequirement => ({ factKey, owner: "canonical_word", roles });
const support = (
  factKey: ActivityFactKey,
  roles?: readonly AssignmentWordRole[],
): ActivityFactRequirement => ({
  factKey,
  owner: "word_micro_skill_support",
  roles,
});
const profile = (factKey: ActivityFactKey): ActivityFactRequirement => ({
  factKey,
  owner: "micro_skill_profile",
});
const cluster = (factKey: ActivityFactKey): ActivityFactRequirement => ({
  factKey,
  owner: "cluster_recipe",
});
const compiled = (factKey: ActivityFactKey): ActivityFactRequirement => ({
  factKey,
  owner: "compiled_assignment_snapshot",
});

const independentRoles = [
  "authentic_target",
  "transfer",
  "review",
] as const satisfies readonly AssignmentWordRole[];
const lessonRoles = [
  "authentic_target",
  "transfer",
  "guided_example",
  "review",
] as const satisfies readonly AssignmentWordRole[];

function definition(
  kind: LessonActivityKind,
  input: Omit<ActivityRequirementDefinition, "kind" | "requirementVersion">,
): ActivityRequirementDefinition {
  return { kind, requirementVersion: 1, ...input };
}

export const ADLE_ACTIVITY_REQUIREMENT_REGISTRY = [
  definition("introduction", {
    requiredFacts: [profile("micro_skill_content")],
    optionalFacts: [canonical("display_word"), canonical("pronunciation")],
    compiledOnlyFields: ["assignmentBindings"],
    contradictionRules: [],
    roleRequirements: [],
    answerVisibility: "teaching",
    evidenceMode: "none",
    applicableRecipes: ["*"],
  }),
  definition("discovery", {
    requiredFacts: [
      canonical("canonical_identity"),
      support("word_micro_skill_support"),
      support("child_meaning"),
    ],
    optionalFacts: [canonical("pronunciation"), support("meaning_group")],
    compiledOnlyFields: ["presentationOrder"],
    contradictionRules: ["meaning_must_not_contradict_canonical_definition"],
    roleRequirements: lessonRoles,
    answerVisibility: "teaching",
    evidenceMode: "none",
    applicableRecipes: ["dynamic_prefix_word_lab:v2", "dynamic_affix_word_lab:v3"],
  }),
  definition("guided_prompt", {
    requiredFacts: [canonical("canonical_identity"), canonical("display_word")],
    optionalFacts: [canonical("pronunciation")],
    compiledOnlyFields: ["promptKey", "assignmentBindings"],
    contradictionRules: [],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: ["generic_first_exposure:v1"],
  }),
  definition("family_reveal", {
    requiredFacts: [
      support("base_or_root"),
      cluster("family_section"),
      support("child_meaning"),
    ],
    optionalFacts: [canonical("pronunciation")],
    compiledOnlyFields: ["familySectionKey"],
    contradictionRules: ["family_membership_must_be_explicit"],
    roleRequirements: lessonRoles,
    answerVisibility: "teaching",
    evidenceMode: "none",
    applicableRecipes: ["base_word_family:v1"],
  }),
  definition("cleaver", {
    requiredFacts: [
      support("teaching_decomposition"),
      canonical("canonical_morphology"),
      support("base_or_root"),
      canonical("joins"),
      canonical("transformations"),
    ],
    optionalFacts: [profile("affix_form")],
    compiledOnlyFields: ["canonicalWordIds"],
    contradictionRules: ["decomposition_must_reconstruct_display_word"],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: [
      "fixed_un_prefix:v1",
      "dynamic_prefix_word_lab:v2",
      "dynamic_affix_word_lab:v3",
      "base_word_family:v1",
    ],
  }),
  definition("word_build", {
    requiredFacts: [
      support("teaching_decomposition"),
      canonical("joins"),
      canonical("transformations"),
      support("child_meaning"),
    ],
    optionalFacts: [profile("affix_form"), support("base_or_root")],
    compiledOnlyFields: ["choiceOrder", "canonicalWordIds"],
    contradictionRules: ["build_must_reconstruct_display_word"],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: [
      "fixed_un_prefix:v1",
      "dynamic_prefix_word_lab:v2",
      "dynamic_affix_word_lab:v3",
      "base_word_family:v1",
    ],
  }),
  definition("compound_jigsaw", {
    requiredFacts: [
      canonical("canonical_identity"),
      canonical("display_word"),
      support("compound_components"),
      support("teaching_decomposition"),
      canonical("canonical_morphology"),
      canonical("joins"),
    ],
    optionalFacts: [canonical("pronunciation")],
    compiledOnlyFields: ["pieceOrder", "assignmentBindings"],
    contradictionRules: [
      "ordered_components_must_reconstruct_display_word",
      "join_must_match_compound_classification",
    ],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: ["closed_compound_word_lab:v1"],
  }),
  definition("meaning_match", {
    requiredFacts: [
      canonical("canonical_identity"),
      support("whole_word_meaning"),
      support("child_meaning"),
    ],
    optionalFacts: [support("meaning_group")],
    compiledOnlyFields: ["wordOrder", "meaningOrder"],
    contradictionRules: ["meaning_must_not_repeat_target_as_definition"],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: ["closed_compound_word_lab:v1"],
  }),
  definition("meaning_sort", {
    requiredFacts: [
      support("whole_word_meaning"),
      support("meaning_group"),
    ],
    optionalFacts: [support("child_meaning")],
    compiledOnlyFields: ["meaningGroupOrder", "wordOrder"],
    contradictionRules: ["meaning_group_must_be_profile_declared"],
    roleRequirements: lessonRoles,
    answerVisibility: "guided",
    evidenceMode: "guided_completion",
    applicableRecipes: [
      "dynamic_prefix_word_lab:v2",
      "dynamic_affix_word_lab:v3",
    ],
  }),
  definition("cover_check", {
    requiredFacts: [
      canonical("canonical_identity", independentRoles),
      canonical("display_word", independentRoles),
      canonical("pronunciation", independentRoles),
      support("word_micro_skill_support", independentRoles),
      compiled("assignment_binding"),
    ],
    optionalFacts: [support("teaching_decomposition")],
    compiledOnlyFields: ["canonicalWordIds", "answerComparator"],
    contradictionRules: ["answer_comparator_must_match_route_policy"],
    roleRequirements: independentRoles,
    answerVisibility: "recall_neutral",
    evidenceMode: "independent_word",
    applicableRecipes: ["*"],
  }),
  definition("dictation", {
    requiredFacts: [
      canonical("canonical_identity", independentRoles),
      canonical("display_word", independentRoles),
      canonical("dictation_sentence", independentRoles),
      canonical("dictation_target", independentRoles),
      canonical("dictation_audio", independentRoles),
      compiled("assignment_binding"),
    ],
    optionalFacts: [canonical("pronunciation")],
    compiledOnlyFields: ["canonicalWordIds", "sentenceOrder"],
    contradictionRules: ["dictation_target_must_resolve_complete_target"],
    roleRequirements: independentRoles,
    answerVisibility: "recall_neutral",
    evidenceMode: "independent_sentence",
    applicableRecipes: ["*"],
  }),
  definition("reflection", {
    requiredFacts: [
      profile("reflection_prompt"),
      compiled("prior_attempt_summary"),
    ],
    optionalFacts: [],
    compiledOnlyFields: ["promptKey", "missedWordIds"],
    contradictionRules: [],
    roleRequirements: [],
    answerVisibility: "post_submit",
    evidenceMode: "reflection",
    applicableRecipes: ["*"],
  }),
  definition("review_quick_sort", {
    requiredFacts: [
      canonical("canonical_identity", ["review"]),
      support("meaning_group", ["review"]),
    ],
    optionalFacts: [support("child_meaning", ["review"])],
    compiledOnlyFields: ["canonicalWordIds", "groupOrder"],
    contradictionRules: [],
    roleRequirements: ["review"],
    answerVisibility: "guided",
    evidenceMode: "none",
    applicableRecipes: ["generic_first_exposure:v1"],
  }),
  definition("must_use_writing", {
    requiredFacts: [
      canonical("canonical_identity", independentRoles),
      canonical("display_word", independentRoles),
      compiled("assignment_binding"),
    ],
    optionalFacts: [support("whole_word_meaning")],
    compiledOnlyFields: ["canonicalWordIds"],
    contradictionRules: [],
    roleRequirements: independentRoles,
    answerVisibility: "recall_neutral",
    evidenceMode: "independent_sentence",
    applicableRecipes: ["generic_first_exposure:v1"],
  }),
  definition("diagnostic_probe", {
    requiredFacts: [
      canonical("canonical_identity", independentRoles),
      canonical("display_word", independentRoles),
      compiled("assignment_binding"),
    ],
    optionalFacts: [canonical("pronunciation"), canonical("phonemes")],
    compiledOnlyFields: ["probeKey"],
    contradictionRules: [],
    roleRequirements: independentRoles,
    answerVisibility: "recall_neutral",
    evidenceMode: "diagnostic",
    applicableRecipes: ["generic_first_exposure:v1"],
  }),
] as const satisfies readonly ActivityRequirementDefinition[];

export function getActivityRequirement(
  kind: LessonActivityKind,
): ActivityRequirementDefinition | null {
  return (
    ADLE_ACTIVITY_REQUIREMENT_REGISTRY.find(
      (definition) => definition.kind === kind,
    ) ?? null
  );
}

export function validateActivityRequirementRegistry(): string[] {
  const errors: string[] = [];
  const seen = new Set<LessonActivityKind>();
  for (const definition of ADLE_ACTIVITY_REQUIREMENT_REGISTRY) {
    if (seen.has(definition.kind)) {
      errors.push(`duplicate_activity_requirement:${definition.kind}`);
    }
    seen.add(definition.kind);
    if (definition.applicableRecipes.length === 0) {
      errors.push(`activity_without_recipe:${definition.kind}`);
    }
    const facts = definition.requiredFacts.map(
      (requirement) => `${requirement.owner}:${requirement.factKey}`,
    );
    if (new Set(facts).size !== facts.length) {
      errors.push(`duplicate_activity_fact:${definition.kind}`);
    }
  }
  return errors.sort();
}
