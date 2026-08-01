export const WORD_LAB_RECIPE_SCHEMA_VERSION = "word_lab_recipe_definition_v1" as const;
export const WORD_LAB_SNAPSHOT_SCHEMA_VERSION = "word_lab_snapshot_v1" as const;
export const WORD_LAB_COMPILER_VERSION = "adle_word_lab_compiler_v1" as const;
export const WORD_LAB_VALIDATOR_VERSION = "adle_word_lab_validator_v1" as const;
export const WORD_LAB_RESUME_SCHEMA_VERSION = "adle_word_lab_resume_v1" as const;

export type WordLabRecipeStatus = "fixture" | "candidate" | "production" | "retired";

export type WordLabWordRole =
  | "authentic_target"
  | "transfer"
  | "practice"
  | "contrast_companion"
  | "teaching_only";

export const WORD_LAB_WORD_ROLES = [
  "authentic_target",
  "transfer",
  "practice",
  "contrast_companion",
  "teaching_only",
] as const satisfies readonly WordLabWordRole[];

export type WordLabEvidenceMode =
  | "none"
  | "guided_recognition"
  | "controlled_spelling"
  | "independent_cover_check"
  | "dictation";

export type WordLabAnswerVisibility =
  | "teaching_visible"
  | "hidden_until_submit"
  | "post_submit_only"
  | "recall_neutral";

export type WordLabDeclarativeCondition =
  | { kind: "always" }
  | { kind: "word_count_at_least"; count: number }
  | { kind: "coverage_present"; coverageKey: string }
  | { kind: "recipe_flag"; key: string; equals: boolean };

export interface WordLabWordSelector {
  roles: readonly WordLabWordRole[];
  min: number;
  max: number;
  includeAllMatching?: boolean;
}

export type WordLabCoverageKind =
  | "distinct_forms"
  | "meaning_groups"
  | "position"
  | "pronunciation"
  | "family_sections"
  | "separator_forms"
  | "unique_dictation_sentences";

export interface WordLabWordRequirementsV1 {
  lesson: { min: number; preferred: number; max: number };
  authentic: { min: number; max: number };
  transfer: { min: number; max: number };
  practice: { min: number; max: number };
  companionSets?: readonly {
    key: string;
    source: "same_meaning_set" | "same_form_set" | "same_root" | "contrast";
    min: number;
    max: number;
    teachingOnly: boolean;
    requireCompleteSet: boolean;
  }[];
  guided: WordLabWordSelector;
  coverCheck: WordLabWordSelector;
  dictation: WordLabWordSelector;
  coverage: readonly {
    key: string;
    kind: WordLabCoverageKind;
    minDistinct: number;
  }[];
  bandingPolicyVersion: string;
  taughtHistoryPolicyVersion: string;
}

export interface WordLabRecipeActivityV1 {
  activityKey: string;
  kind: string;
  contractVersion: number;
  order: number;
  condition: WordLabDeclarativeCondition;
  words: WordLabWordSelector;
  config: Readonly<Record<string, unknown>>;
  answerVisibility: WordLabAnswerVisibility;
  evidenceMode: WordLabEvidenceMode;
  requiredForCompletion: boolean;
  assignmentItemKind: string;
}

export interface WordLabRecipeDefinitionV1 {
  schemaVersion: typeof WORD_LAB_RECIPE_SCHEMA_VERSION;
  identity: {
    recipeKey: string;
    recipeVersion: number;
    status: WordLabRecipeStatus;
  };
  compatibility: {
    routeKey: string;
    routeVersion: number;
    familyKey: string;
    /** Empty means family default. */
    clusterKeys: readonly string[];
    /** Present means an exact, controlled microskill override. */
    microSkillKeys?: readonly string[];
  };
  wordRequirements: WordLabWordRequirementsV1;
  activities: readonly WordLabRecipeActivityV1[];
  flags?: Readonly<Record<string, boolean>>;
  probe: {
    placement: "none" | "separate_before_lesson" | "replaces_assessment";
    consumesLessonWordQuota: false;
  };
  completion: {
    contractVersion: number;
    requireAllMarkedActivities: true;
    requireReflection: boolean;
    independentWordSelector: WordLabWordSelector;
  };
  scheduling: {
    policyVersion: string;
    roles: Readonly<Partial<Record<WordLabWordRole, "schedule" | "evidence_only" | "none">>>;
  };
  rewards: {
    policyVersion: string;
    roles: Readonly<Partial<Record<WordLabWordRole, "eligible" | "ineligible">>>;
  };
}

export interface WordLabSelectedWordV1 {
  canonicalWordId: string;
  displayWord: string;
  roles: readonly WordLabWordRole[];
  learningItemId: string | null;
  complexityBand: string | null;
  contentRef: { sourceKey: string; sourceVersion: string };
  /** Declarative facts used to prove recipe coverage requirements. */
  coverage: Readonly<Record<string, string>>;
}

export interface CompiledWordLabSnapshotV1 {
  schemaVersion: typeof WORD_LAB_SNAPSHOT_SCHEMA_VERSION;
  compilerVersion: typeof WORD_LAB_COMPILER_VERSION;
  validatorVersion: typeof WORD_LAB_VALIDATOR_VERSION;
  assignmentId: string;
  childId: string;
  assignmentDate: string;
  route: { routeKey: string; routeVersion: number; rendererKey: "common_word_lab" };
  recipe: { recipeKey: string; recipeVersion: number; definitionFingerprint: string };
  taxonomy: { familyKey: string; clusterKey: string; microSkillKey: string };
  resolvedWordRequirements: WordLabWordRequirementsV1;
  words: readonly {
    slotId: string;
    canonicalWordId: string;
    displayWord: string;
    roles: readonly WordLabWordRole[];
    learningItemId: string | null;
    complexityBand: string | null;
    contentRef: { sourceKey: string; sourceVersion: string };
    coverage: Readonly<Record<string, string>>;
    schedulingRole: "schedule" | "evidence_only" | "none";
    rewardRole: "eligible" | "ineligible";
  }[];
  activities: readonly {
    activityId: string;
    activityKey: string;
    kind: string;
    contractVersion: number;
    order: number;
    wordSlotIds: readonly string[];
    assignmentItemIds: readonly string[];
    config: Readonly<Record<string, unknown>>;
    answerVisibility: WordLabAnswerVisibility;
    evidenceMode: WordLabEvidenceMode;
    requiredForCompletion: boolean;
  }[];
  probe: WordLabRecipeDefinitionV1["probe"];
  completion: WordLabRecipeDefinitionV1["completion"];
  content: {
    dictionaryReleaseIds: readonly string[];
    profileKeys: readonly string[];
    profileVersions: readonly string[];
  };
  policies: {
    selectionPolicyVersion: string;
    bandingPolicyVersion: string;
    taughtHistoryPolicyVersion: string;
    evidencePolicyVersion: string;
    schedulingPolicyVersion: string;
    rewardPolicyVersion: string;
    resumeSchemaVersion: typeof WORD_LAB_RESUME_SCHEMA_VERSION;
  };
  provenance: { selectedLearningItemIds: readonly string[]; compiledAt: string };
  fingerprint: string;
}

export interface CompileWordLabInputV1 {
  assignmentId: string;
  childId: string;
  assignmentDate: string;
  compiledAt: string;
  taxonomy: CompiledWordLabSnapshotV1["taxonomy"];
  recipe: WordLabRecipeDefinitionV1;
  selectedWords: readonly WordLabSelectedWordV1[];
  assignmentItemIdsByActivityKey: Readonly<Record<string, readonly string[]>>;
  content: CompiledWordLabSnapshotV1["content"];
  selectionPolicyVersion: string;
  evidencePolicyVersion: string;
}

export interface WordLabResumeEnvelopeV1 {
  schemaVersion: typeof WORD_LAB_RESUME_SCHEMA_VERSION;
  assignmentId: string;
  snapshotFingerprint: string;
  currentActivityId: string;
  completedActivityIds: readonly string[];
  activityResults: readonly WordLabActivityResultV1[];
  activityState: Readonly<Record<string, unknown>>;
  reflection: string;
  muted: boolean;
}

export interface WordLabActivityResultV1 {
  activityId: string;
  contractVersion: number;
  completed: boolean;
  response: Readonly<Record<string, unknown>>;
}

export interface WordLabCompletionEnvelopeV1 {
  assignmentId: string;
  snapshotFingerprint: string;
  activityResults: readonly WordLabActivityResultV1[];
  reflection: string;
}

export const WORD_LAB_BLOCKER_CODES = [
  "malformed_recipe",
  "duplicate_recipe",
  "missing_route",
  "ambiguous_route",
  "route_not_common_word_lab",
  "route_not_available",
  "missing_recipe",
  "ambiguous_recipe",
  "recipe_status_not_allowed",
  "recipe_route_mismatch",
  "recipe_taxonomy_mismatch",
  "invalid_word_count",
  "invalid_word_role_count",
  "word_role_conflict",
  "coverage_requirement_failed",
  "activity_selector_failed",
  "duplicate_activity_id",
  "duplicate_activity_order",
  "missing_item_binding",
  "duplicate_item_binding",
  "missing_word_binding",
  "unknown_activity_plugin",
  "activity_contract_mismatch",
  "snapshot_shape_invalid",
  "snapshot_fingerprint_mismatch",
  "resume_schema_mismatch",
  "resume_assignment_mismatch",
  "resume_fingerprint_mismatch",
] as const;

export type WordLabBlockerCode = (typeof WORD_LAB_BLOCKER_CODES)[number];
export interface WordLabBlocker {
  code: WordLabBlockerCode;
  detail?: string;
}

export type WordLabCompileResult =
  | { ok: true; snapshot: CompiledWordLabSnapshotV1 }
  | { ok: false; blockers: readonly WordLabBlocker[] };

export type WordLabSnapshotValidationResult =
  | { ok: true; snapshot: CompiledWordLabSnapshotV1 }
  | { ok: false; blockers: readonly WordLabBlocker[] };

export function wordLabActivityContractKey(kind: string, contractVersion: number): string {
  return `${kind}:v${contractVersion}`;
}
