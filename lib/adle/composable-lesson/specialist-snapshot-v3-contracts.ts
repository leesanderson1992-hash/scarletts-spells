import type { AssignmentHeaderDraft, AssignmentItemDraft } from "../assignment-persistence";
import type { ActivatedCompoundWordReleaseV2 } from "../morphology/compound-word-release-loader";
import type { DynamicAffixCompilerDecision } from "../morphology/dynamic-affix-compiler-rollout";
import type { DynamicAffixSelection } from "../morphology/affix-word-lab";
import type { ResolvedDynamicAffixLessonV3 } from "../morphology/dynamic-affix-runtime";
import type { ResolvedCompoundWordFirstImpressionV2 } from "../morphology/resolved-compound-word-lesson-v2";
import type { CompiledLessonSnapshotV3 } from "./generic-snapshot-v3-contracts";

export const SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION =
  "adle_specialist_snapshot_compiler_v3" as const;
export const SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION =
  "adle_specialist_snapshot_validator_v3" as const;
export const SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION =
  "adle_specialist_canonical_contracts_v1" as const;

export type SpecialistSnapshotItemBindingV3 = {
  sourceEntityId: string;
  position: number;
  inputSource: "assignment_items.prompt_data";
};

export type SpecialistCanonicalActivitySnapshotV3 = {
  contractVersion: 3;
  activityId: string;
  label: string;
  order: number;
  sectionKey: "lesson_intro" | "guided_practice" | "lesson_production" | "lesson_dictation" | "lesson_reflection";
  canonical: { concept: string; mode: string; contractVersion: 1 };
  payload: Record<string, unknown>;
  itemBindings: readonly SpecialistSnapshotItemBindingV3[];
  wordSnapshotIds: readonly string[];
  ownership: "assignment_items" | "route_owned";
};

export type SpecialistSnapshotAuthorityV3 = {
  authorityType:
    | "release_manifest"
    | "activation_revision"
    | "dependency_set"
    | "compound_structure"
    | "teaching_content"
    | "teaching_dictionary_closure"
    | "affix_profile_content"
    | "affix_member_content"
    | "teaching_dictionary_word"
    | "dictation_content"
    | "shared_affix_source"
    | "shared_affix_lesson"
    | "public_payload"
    | "recipe_content";
  authorityId: string;
  version: string;
  sourceHash: string;
};

/**
 * Additive Snapshot-v3 specialist branch. The established generic v3 type and
 * validator remain untouched and continue to require `generic_composer`.
 */
export type CompiledCompoundWordSpecialistSnapshotV3 = {
  snapshotSchemaVersion: 3;
  compilerVersion: typeof SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION;
  validatorVersion: typeof SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION;
  canonicalContractRegistryVersion: typeof SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION;
  route: { routeId: "compound_word_lab"; routeVersion: "v2" };
  recipe: { recipeKey: "compound_word_lab"; recipeVersion: "v2" };
  payload: {
    kind: "compound_word_lesson_v2";
    version: 2;
    resolvedLesson: ResolvedCompoundWordFirstImpressionV2;
  };
  runtime: { adapterKey: "compound_word_v2"; rendererKey: "compound_word_guided" };
  assignment: { generationSource: "adle_composer_v1"; itemCount: 18 };
  taxonomy: { microSkillKey: string };
  words: readonly {
    wordSnapshotId: string;
    order: number;
    canonicalWordId: string;
    displayWord: string;
    learningItemId: string | null;
    lineageKind: "learner_target" | "generated_transfer";
  }[];
  activities: readonly SpecialistCanonicalActivitySnapshotV3[];
  segments: readonly [{ segmentId: "lesson"; wordSnapshotIds: readonly string[]; activityIds: readonly string[] }];
  contentVersions: readonly SpecialistSnapshotAuthorityV3[];
  provenance: {
    sourceKind: "compiled_specialist_assignment";
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: 1;
    sourceFingerprint: string;
  };
};

export type CompiledDynamicAffixSpecialistSnapshotV3 = {
  snapshotSchemaVersion: 3;
  compilerVersion: typeof SPECIALIST_SNAPSHOT_V3_COMPILER_VERSION;
  validatorVersion: typeof SPECIALIST_SNAPSHOT_V3_VALIDATOR_VERSION;
  canonicalContractRegistryVersion: typeof SPECIALIST_SNAPSHOT_V3_REGISTRY_VERSION;
  route: { routeId: "dynamic_affix_word_lab"; routeVersion: "v3" };
  recipe: { recipeKey: "dynamic_affix_word_lab"; recipeVersion: "v3" };
  payload: {
    kind: "dynamic_affix_lesson_v3";
    version: 3;
    resolvedLesson: ResolvedDynamicAffixLessonV3;
  };
  runtime: { adapterKey: "dynamic_affix_v3"; rendererKey: "morphology_guided" };
  assignment: { generationSource: "adle_composer_v1"; itemCount: 16 | 18 };
  taxonomy: { microSkillKey: string };
  words: readonly {
    wordSnapshotId: string;
    order: number;
    canonicalWordId: string;
    displayWord: string;
    learningItemId: string | null;
    lineageKind: "authentic_target" | "transfer";
  }[];
  activities: readonly SpecialistCanonicalActivitySnapshotV3[];
  segments: readonly [{ segmentId: "lesson"; wordSnapshotIds: readonly string[]; activityIds: readonly string[] }];
  contentVersions: readonly SpecialistSnapshotAuthorityV3[];
  provenance: {
    sourceKind: "compiled_specialist_assignment";
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: 1;
    sourceFingerprint: string;
  };
};

export type CompiledSpecialistSnapshotV3 =
  | CompiledCompoundWordSpecialistSnapshotV3
  | CompiledDynamicAffixSpecialistSnapshotV3;

/** Route is the v3 discriminator; each branch retains its own exact validator. */
export type CompiledAdleLessonSnapshotV3 =
  | CompiledLessonSnapshotV3
  | CompiledSpecialistSnapshotV3;

export type SpecialistSnapshotV3ValidationItem = Pick<
  AssignmentItemDraft,
  "sourceEntityId" | "position" | "templateKey" | "targetWord"
> & {
  sectionKey: string;
  canonicalWordId: string | null;
  promptData: Record<string, unknown>;
};

export type CompileCompoundWordSpecialistSnapshotV3Input = {
  payload: ResolvedCompoundWordFirstImpressionV2;
  releaseAuthority: ActivatedCompoundWordReleaseV2;
  header: AssignmentHeaderDraft;
  items: readonly AssignmentItemDraft[];
};

export type CompileDynamicAffixSpecialistSnapshotV3Input = {
  payload: ResolvedDynamicAffixLessonV3;
  selection: DynamicAffixSelection;
  compilerDecision: Extract<DynamicAffixCompilerDecision, { ok: true }>;
  header: AssignmentHeaderDraft;
  items: readonly AssignmentItemDraft[];
};

export const SPECIALIST_SNAPSHOT_V3_BLOCKER_CODES = [
  "malformed_specialist_snapshot_v3",
  "specialist_version_mismatch",
  "specialist_route_mismatch",
  "specialist_payload_mismatch",
  "specialist_runtime_mismatch",
  "specialist_assignment_mismatch",
  "specialist_content_provenance_malformed",
  "specialist_unsupported_canonical_contract",
  "specialist_canonical_payload_malformed",
  "specialist_duplicate_item_binding",
  "specialist_unbound_assignment_item",
  "specialist_item_binding_mismatch",
  "specialist_resolved_lesson_mismatch",
  "specialist_fingerprint_mismatch",
] as const;

export type SpecialistSnapshotV3BlockerCode = typeof SPECIALIST_SNAPSHOT_V3_BLOCKER_CODES[number];
export type SpecialistSnapshotV3ValidationResult =
  | { ok: true; snapshot: CompiledSpecialistSnapshotV3 }
  | { ok: false; blockers: readonly { code: SpecialistSnapshotV3BlockerCode; detail?: string }[] };
