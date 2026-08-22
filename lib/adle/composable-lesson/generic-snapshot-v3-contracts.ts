import type {
  AssignmentHeaderDraft,
  AssignmentPersistencePlan,
} from "../assignment-persistence";
import type {
  ComposedDailyPlan,
  DailyPlanFacts,
} from "../daily-assignment-composer";
import type {
  GenericSnapshotConditionV2,
  GenericSnapshotContentVersionV2,
  GenericSnapshotEvidenceBindingV2,
  GenericSnapshotPartV2,
  GenericSnapshotRewardRoleV2,
  GenericSnapshotScheduleRoleV2,
  GenericSnapshotSectionKeyV2,
  GenericSnapshotSelectionProvenanceV2,
  GenericSnapshotWordRoleV2,
} from "./generic-snapshot-contracts";

export const GENERIC_LESSON_SNAPSHOT_SCHEMA_VERSION_V3 = 3 as const;
export const GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3 =
  "adle_generic_canonical_snapshot_compiler_v3" as const;
export const GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3 =
  "adle_generic_canonical_snapshot_validator_v3" as const;
export const GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3 =
  "adle_generic_canonical_contracts_v1" as const;
export const GENERIC_SNAPSHOT_FINGERPRINT_VERSION_V3 = 1 as const;

/** Additive v3 vocabulary. Snapshot v2's section-key union remains immutable. */
export type GenericSnapshotSectionKeyV3 =
  | GenericSnapshotSectionKeyV2
  | "lesson_reflection";

export type GenericSnapshotJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GenericSnapshotJsonValue[]
  | { readonly [key: string]: GenericSnapshotJsonValue };

export interface LessonWordSnapshotV3 {
  contractVersion: 3;
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

export interface CanonicalActivitySnapshotV3 {
  contractVersion: 3;
  activityId: string;
  label: string;
  order: number;
  part: GenericSnapshotPartV2;
  sectionKey: GenericSnapshotSectionKeyV3;
  canonical: {
    concept: string;
    mode: string;
    contractVersion: number;
  };
  payload: Readonly<Record<string, GenericSnapshotJsonValue>>;
  itemBinding: {
    sourceEntityId: string;
    position: number;
    inputSource: "assignment_items.prompt_data";
  };
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

/**
 * Forward-authoring envelope consumed only by the guarded v3 compiler. It is
 * explicit canonical input, never a historical template-key interpretation.
 */
export interface GenericCanonicalActivityAuthoringV3 {
  schemaVersion: 3;
  label: string;
  canonical: {
    concept: string;
    mode: string;
    contractVersion: 1;
  };
  payload: Readonly<Record<string, GenericSnapshotJsonValue>>;
  canonicalWordIds: readonly string[];
  condition?: GenericSnapshotConditionV2;
}

export const GENERIC_CANONICAL_ACTIVITY_AUTHORING_FIELD_V3 =
  "canonicalActivityV3" as const;

export interface GenericSnapshotSegmentV3 {
  segmentId: "review" | "lesson";
  wordSnapshotIds: readonly string[];
  activityIds: readonly string[];
}

export interface CompiledLessonSnapshotV3 {
  snapshotSchemaVersion: 3;
  compilerVersion: typeof GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3;
  validatorVersion: typeof GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3;
  canonicalContractRegistryVersion: typeof GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3;
  route: { routeId: "generic_composer"; routeVersion: "v1" };
  recipe: { recipeKey: "generic_first_exposure"; recipeVersion: "v1" };
  payload: { kind: "composed_daily_plan"; version: 1 };
  runtime: {
    adapterKey: "generic_composer_v1";
    rendererKey: "canonical_activity_host_v1";
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
  words: readonly LessonWordSnapshotV3[];
  activities: readonly CanonicalActivitySnapshotV3[];
  segments: readonly GenericSnapshotSegmentV3[];
  contentVersions: readonly GenericSnapshotContentVersionV2[];
  provenance: {
    sourceKind: "compiled_generic_canonical_assignment";
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: 1;
    sourceFingerprint: string;
  };
}

export const GENERIC_SNAPSHOT_V3_BLOCKER_CODES = [
  "malformed_snapshot_v3",
  "unsupported_snapshot_schema_version",
  "compiler_version_mismatch",
  "validator_version_mismatch",
  "canonical_contract_registry_version_mismatch",
  "snapshot_route_mismatch",
  "snapshot_recipe_mismatch",
  "snapshot_payload_mismatch",
  "snapshot_runtime_mismatch",
  "snapshot_assignment_source_mismatch",
  "snapshot_without_explicit_generic_route",
  "snapshot_item_count_mismatch",
  "duplicate_activity_id",
  "duplicate_word_snapshot_id",
  "duplicate_item_binding",
  "missing_item_binding",
  "unbound_assignment_item",
  "item_position_mismatch",
  "item_section_mismatch",
  "word_identity_mismatch",
  "invalid_word_role",
  "malformed_content_provenance",
  "malformed_fingerprint",
  "fingerprint_mismatch",
  "unsupported_canonical_contract",
  "canonical_contract_version_mismatch",
  "missing_authored_content",
  "malformed_canonical_payload",
] as const;

export type GenericSnapshotV3BlockerCode =
  (typeof GENERIC_SNAPSHOT_V3_BLOCKER_CODES)[number];

export interface GenericSnapshotV3Blocker {
  code: GenericSnapshotV3BlockerCode;
  activityId?: string;
  contractKey?: string;
  position?: number;
  detail?: string;
}

export type GenericSnapshotV3ValidationResult =
  | { ok: true; snapshot: CompiledLessonSnapshotV3 }
  | { ok: false; blockers: readonly GenericSnapshotV3Blocker[] };

export interface GenericSnapshotCompileInputV3 {
  facts: DailyPlanFacts;
  plan: ComposedDailyPlan;
  persistence: AssignmentPersistencePlan & {
    action: "insert";
    header: AssignmentHeaderDraft;
  };
}

export type GenericSnapshotCompileResultV3 = GenericSnapshotV3ValidationResult;
