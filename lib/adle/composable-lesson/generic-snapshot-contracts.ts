import type {
  AssignmentHeaderDraft,
  AssignmentPersistencePlan,
} from "../assignment-persistence";
import type {
  ComposedDailyPlan,
  DailyPlanFacts,
} from "../daily-assignment-composer";

export const GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION =
  "adle_generic_snapshot_compiler_v2" as const;
export const GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION =
  "adle_generic_snapshot_validator_v2" as const;
export const GENERIC_ACTIVITY_REQUIREMENTS_VERSION =
  "adle_generic_activity_requirements_v2" as const;
export const GENERIC_SNAPSHOT_FINGERPRINT_VERSION = 1 as const;

export type GenericSnapshotPartV2 = "review" | "lesson";

export type GenericSnapshotSectionKeyV2 =
  | "review_quick_sort"
  | "review_production"
  | "review_reflection"
  | "lesson_intro"
  | "guided_practice"
  | "lesson_production"
  | "lesson_dictation"
  | "lesson_probe";

export const GENERIC_SNAPSHOT_SECTION_KEYS_V2 = [
  "review_quick_sort",
  "review_production",
  "review_reflection",
  "lesson_intro",
  "guided_practice",
  "lesson_production",
  "lesson_dictation",
  "lesson_probe",
] as const satisfies readonly GenericSnapshotSectionKeyV2[];

export type GenericSnapshotWordRoleV2 =
  | "authentic_target"
  | "transfer"
  | "review"
  | "probe"
  | "teaching_example";

export const GENERIC_SNAPSHOT_WORD_ROLES_V2 = [
  "authentic_target",
  "transfer",
  "review",
  "probe",
  "teaching_example",
] as const satisfies readonly GenericSnapshotWordRoleV2[];

export type GenericSnapshotSelectionProvenanceV2 =
  | "learning_item"
  | "probe_miss"
  | "stretch"
  | "review_schedule"
  | "diagnostic_probe"
  | "teaching_content";

export type GenericSnapshotActivityKindV2 =
  | "introduction"
  | "guided_prompt"
  | "controlled_spelling"
  | "hide_write"
  | "dictation"
  | "reflection"
  | "review_quick_sort"
  | "must_use_writing"
  | "diagnostic_probe";

export type GenericSnapshotRendererKindV2 =
  | "intro"
  | "guided_prompt"
  | "dictation"
  | "reflection"
  | "quick_sort"
  | "must_use_writing";

export type GenericSnapshotAttemptKindV2 =
  | "guided_practice"
  | "review_production"
  | "reflection_retry"
  | "lesson_production"
  | "lesson_dictation"
  | "lesson_probe";

export type GenericSnapshotEvidenceClassV2 =
  | "guided_practice_attempt"
  | "scheduled_review_attempt"
  | "reflection_attempt"
  | "first_exposure_lesson_attempt"
  | "diagnostic_probe_attempt";

export type GenericSnapshotAttemptCaptureV2 =
  | "none"
  | "optional"
  | "submitted_on_part_finish";

export type GenericSnapshotScheduleRoleV2 =
  | "none"
  | "review_outcome"
  | "lesson_final_if_no_dictation"
  | "lesson_final"
  | "diagnostic_probe";

export type GenericSnapshotRewardRoleV2 = "none" | "lesson_taught_word";

export type GenericSnapshotContentKindV2 =
  | "composer_policy"
  | "schedule_policy"
  | "banding"
  | "family_method"
  | "activity_template"
  | "teaching_content";

export interface GenericSnapshotContentVersionV2 {
  contentRefId: string;
  kind: GenericSnapshotContentKindV2;
  key: string;
  version: string;
  sourceRowHash: string | null;
}

export interface LessonWordSnapshotV2 {
  contractVersion: 2;
  wordSnapshotId: string;
  order: number;
  canonicalWordId: string;
  displayWord: string;
  familyKey: string | null;
  microSkillKey: string | null;
  learningItemId: string | null;
  role: GenericSnapshotWordRoleV2;
  selectionProvenance: GenericSnapshotSelectionProvenanceV2;
  source: {
    kind:
      | "learning_item"
      | "probe_miss"
      | "stretch_intake"
      | "review_schedule"
      | "diagnostic_probe"
      | "teaching_content";
    referenceId: string | null;
  };
  contentVersionRefs: readonly string[];
  factFingerprint: string;
}

export interface GenericSnapshotItemBindingV2 {
  sourceEntityId: string;
  position: number;
  inputSource: "assignment_items.prompt_data";
}

export type GenericSnapshotConditionV2 =
  | { kind: "always" }
  | {
      kind: "on_misspelling";
      productionItemSourceEntityId: string;
    };

export interface GenericSnapshotEvidenceBindingV2 {
  mode:
    | "none"
    | "guided_completion"
    | "independent_word"
    | "independent_sentence"
    | "reflection"
    | "diagnostic";
  capture: GenericSnapshotAttemptCaptureV2;
  attemptKind: GenericSnapshotAttemptKindV2 | null;
  evidenceClass: GenericSnapshotEvidenceClassV2 | null;
}

export interface ActivitySnapshotV2 {
  contractVersion: 2;
  activityId: string;
  order: number;
  kind: GenericSnapshotActivityKindV2;
  part: GenericSnapshotPartV2;
  sectionKey: GenericSnapshotSectionKeyV2;
  templateKey: string;
  rendererKind: GenericSnapshotRendererKindV2;
  itemBinding: GenericSnapshotItemBindingV2;
  wordSnapshotIds: readonly string[];
  contentVersionRefs: readonly string[];
  condition: GenericSnapshotConditionV2;
  answerVisibility: "teaching" | "guided" | "recall_neutral" | "post_submit";
  evidence: GenericSnapshotEvidenceBindingV2;
  completion: {
    binding: "part_submission";
    part: GenericSnapshotPartV2;
  };
  scheduleRole: GenericSnapshotScheduleRoleV2;
  rewardRole: GenericSnapshotRewardRoleV2;
}

export interface GenericSnapshotSegmentV2 {
  segmentId: "review" | "lesson";
  wordSnapshotIds: readonly string[];
  activityIds: readonly string[];
}

export interface CompiledLessonSnapshotV2 {
  snapshotSchemaVersion: 2;
  compilerVersion: typeof GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION;
  validatorVersion: typeof GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION;
  requirementRegistryVersion: typeof GENERIC_ACTIVITY_REQUIREMENTS_VERSION;
  route: { routeId: "generic_composer"; routeVersion: "v1" };
  recipe: { recipeKey: "generic_first_exposure"; recipeVersion: "v1" };
  payload: { kind: "composed_daily_plan"; version: 1 };
  runtime: {
    adapterKey: "generic_composer_v1";
    rendererKey: "generic_session";
  };
  assignment: {
    generationSource: "adle_composer_v1";
    itemCount: number;
  };
  taxonomy: {
    lesson: { familyKey: string; microSkillKey: string } | null;
    reviewFamilyKeys: readonly string[];
    reviewMicroSkillKeys: readonly string[];
  };
  words: readonly LessonWordSnapshotV2[];
  activities: readonly ActivitySnapshotV2[];
  segments: readonly GenericSnapshotSegmentV2[];
  contentVersions: readonly GenericSnapshotContentVersionV2[];
  provenance: {
    sourceKind: "compiled_generic_assignment";
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: 1;
    sourceFingerprint: string;
  };
}

export const GENERIC_SNAPSHOT_BLOCKER_CODES = [
  "malformed_snapshot",
  "unsupported_snapshot_schema_version",
  "compiler_version_mismatch",
  "validator_version_mismatch",
  "requirement_registry_version_mismatch",
  "snapshot_without_explicit_generic_route",
  "snapshot_route_mismatch",
  "snapshot_recipe_mismatch",
  "snapshot_payload_mismatch",
  "snapshot_runtime_mismatch",
  "snapshot_assignment_source_mismatch",
  "snapshot_item_count_mismatch",
  "duplicate_activity_id",
  "duplicate_word_snapshot_id",
  "duplicate_item_binding",
  "missing_item_binding",
  "unbound_assignment_item",
  "item_position_mismatch",
  "item_section_mismatch",
  "item_template_mismatch",
  "invalid_word_role",
  "missing_word_binding",
  "duplicate_word_binding",
  "word_identity_mismatch",
  "activity_requirement_failed",
  "unsupported_template",
  "unsupported_template_shape",
  "completion_binding_mismatch",
  "evidence_binding_mismatch",
  "schedule_role_mismatch",
  "reward_role_mismatch",
  "malformed_content_provenance",
  "malformed_fingerprint",
  "fingerprint_mismatch",
] as const;

export type GenericSnapshotBlockerCode =
  (typeof GENERIC_SNAPSHOT_BLOCKER_CODES)[number];

export interface GenericSnapshotBlocker {
  code: GenericSnapshotBlockerCode;
  activityId?: string;
  templateKey?: string;
  position?: number;
}

export type GenericSnapshotValidationResult =
  | { ok: true; snapshot: CompiledLessonSnapshotV2 }
  | { ok: false; blockers: readonly GenericSnapshotBlocker[] };

export type GenericSnapshotCompileResult =
  | { ok: true; snapshot: CompiledLessonSnapshotV2 }
  | { ok: false; blockers: readonly GenericSnapshotBlocker[] };

export interface GenericSnapshotCompileInput {
  facts: DailyPlanFacts;
  plan: ComposedDailyPlan;
  persistence: AssignmentPersistencePlan & {
    action: "insert";
    header: AssignmentHeaderDraft;
  };
}
