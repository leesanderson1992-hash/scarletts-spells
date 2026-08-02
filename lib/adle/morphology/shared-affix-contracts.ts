import type {
  LessonRecipeReference,
  VersionedLessonRouteReference,
} from "../composable-lesson/contracts";
import type { MorphologyEffect, MorphologyWordSnapshot } from "./payload";

export const SHARED_AFFIX_COMPILER_VERSION = 1 as const;
export const SHARED_AFFIX_PROFILE_VERSION = 1 as const;
export const SHARED_AFFIX_FINGERPRINT_VERSION = 1 as const;

export type SharedAffixPosition = "before" | "after";
export type SharedAffixWordRole = "authentic_target" | "transfer";

export const SHARED_AFFIX_SUPPORTED_TRANSFORMATION_TYPES = [
  "legacy_prefix_projection",
  "change_final_y_to_i",
  "drop_final_e",
  "remove_letter",
  "replace_final",
  "base_spelling_change",
] as const;

export const SHARED_AFFIX_POLICY_VARIANTS = {
  split: [
    "first_words",
    "distinct_forms_then_fill",
    "guided_budget_after_form_builds",
    "one_per_form_else_direct_and_changed",
  ],
  build: [
    "different_form_from_first_or_first",
    "one_per_represented_form",
    "every_lesson_word",
    "one_per_represented_form_prefer_non_split",
  ],
  meaning: ["none", "sort_all_words"],
  choiceOrder: ["declared", "stable_suffix_rotation"],
} as const;

export interface SharedAffixChoiceV1 {
  text: string;
  label: string;
  outcome: string | null;
  meaning: string | null;
  status: "target" | "valid_alternative" | "unsupported";
}

export interface SharedAffixMeaningGroupV1 {
  id: string;
  label: string;
  description: string;
}

export type SharedAffixTransformationV1 =
  | { type: "legacy_prefix_projection" }
  | {
      type:
        Exclude<(typeof SHARED_AFFIX_SUPPORTED_TRANSFORMATION_TYPES)[number], "legacy_prefix_projection">;
      [key: string]: unknown;
    };

export type SharedAffixMorphologyReviewV1 =
  | {
      kind: "legacy_prefix_projection";
      parts: MorphologyWordSnapshot["parts"];
      joins: MorphologyWordSnapshot["joins"];
      transformations: readonly [{ type: "legacy_prefix_projection" }];
      notes: string;
      provenance: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "reviewed_true_morphology";
      parts: MorphologyWordSnapshot["parts"];
      joins: MorphologyWordSnapshot["joins"];
      transformations: readonly SharedAffixTransformationV1[];
      notes: string;
      provenance: Readonly<Record<string, unknown>>;
    };

export interface SharedAffixWordInputV1 {
  canonicalWordId: string;
  displayWord: string;
  audioText: string;
  semanticBaseText: string;
  semanticBaseKind: "base" | "root";
  teachingSurfaceText: string;
  baseMeaning: string;
  derivedMeaning: string;
  meaningGroupId: MorphologyEffect;
  affixForm: string;
  affixLabel: string;
  affixMeaning: string;
  parts: MorphologyWordSnapshot["parts"];
  joins: MorphologyWordSnapshot["joins"];
  splitPoints: readonly number[];
  dictation: {
    sentence: string;
    targetTokenIndex: number;
  };
  morphology: SharedAffixMorphologyReviewV1;
}

export type SharedAffixSplitPolicyV1 =
  | { kind: "first_words"; count: number }
  | { kind: "distinct_forms_then_fill"; count: number }
  | { kind: "guided_budget_after_form_builds"; guidedSlotCount: number }
  | { kind: "one_per_form_else_direct_and_changed"; count: 2 };

export type SharedAffixBuildPolicyV1 =
  | { kind: "different_form_from_first_or_first"; count: 1 }
  | { kind: "one_per_represented_form"; formOrder: readonly string[] }
  | { kind: "every_lesson_word" }
  | { kind: "one_per_represented_form_prefer_non_split" };

export type SharedAffixMeaningPolicyV1 =
  | { kind: "none" }
  | { kind: "sort_all_words" };

export type SharedAffixChoiceOrderPolicyV1 =
  | { kind: "declared" }
  | { kind: "stable_suffix_rotation" };

export interface SharedAffixLessonPolicyV1 {
  lessonWordCount: 4;
  authenticTargetCount: { min: 1; max: 4 };
  transferCount: { min: 0; max: 3 };
  requiredFormCoverage: { kind: "minimum_distinct"; count: number };
  requiredMeaningCoverage: { kind: "minimum_distinct"; count: number };
  split: SharedAffixSplitPolicyV1;
  primaryBuild: { kind: "different_form_from_first_or_first" } | { kind: "first_guided_build" };
  build: SharedAffixBuildPolicyV1;
  meaning: SharedAffixMeaningPolicyV1;
  choiceOrder: SharedAffixChoiceOrderPolicyV1;
  legacyGuidedShape: "omit" | "explicit";
  schedule: { kind: "authentic_targets" } | { kind: "all_lesson_words" };
  reward: { kind: "all_lesson_words" };
  expectedAssignmentItemCount: 16 | 18;
}

export type SharedAffixIntroductionV1 =
  | {
      kind: "prefix_v2";
      title: string;
      paragraphs: string[];
      profileTitle?: string;
      profileParagraphs?: string[];
      profileExamples?: Array<{
        prefix: string;
        prefixMeaning?: string;
        base: string;
        word: string;
        meaning: string;
      }>;
    }
  | {
      kind: "affix_v3";
      title: string;
      paragraphs: string[];
      spellingRules: string[];
      examples: Array<{ affix: string; base: string; word: string; meaning: string }>;
      meaningStatement?: string;
    };

export interface NormalisedAffixTeachingProfileV1 {
  profileVersion: typeof SHARED_AFFIX_PROFILE_VERSION;
  profileKey: string;
  position: SharedAffixPosition;
  forms: readonly string[];
  header: { text: string; label: string; meaning: string };
  meaningGroups: readonly SharedAffixMeaningGroupV1[];
  choices: readonly SharedAffixChoiceV1[];
  introduction: SharedAffixIntroductionV1;
  reflection: { promptKey: string; promptText: string };
}

export interface AffixLessonCompilationInputV1 {
  route: VersionedLessonRouteReference;
  recipe: LessonRecipeReference;
  taxonomy: {
    familyKey: "morphology";
    clusterKey: "prefix" | "suffix";
    microSkillKey: string;
  };
  profile: NormalisedAffixTeachingProfileV1;
  /** Canonically sorted reviewed facts. Selection order is owned below. */
  words: readonly SharedAffixWordInputV1[];
  selection: {
    lessonWordIds: readonly string[];
    authenticTargetIds: readonly string[];
    transferWordIds: readonly string[];
  };
  policy: SharedAffixLessonPolicyV1;
  provenance: {
    sourceKind: "teaching_dictionary" | "reviewed_fixture";
    profileVersion: string;
    contentVersion: string;
  };
}

export interface CompiledSharedAffixWordV1 extends SharedAffixWordInputV1 {
  role: SharedAffixWordRole;
}

export interface CompiledSharedAffixBuildV1 {
  canonicalWordId: string;
  baseWord: string;
  targetMeaning: string;
  choices: SharedAffixChoiceV1[];
}

export interface SharedAffixAssignmentBindingV1 {
  activityId: string;
  sectionKey: "lesson_intro" | "guided_practice" | "lesson_production" | "lesson_dictation";
  templateKey:
    | "MICRO_READ_ONLY_INTRO"
    | "LESSON_WORDS_INTRO"
    | "MOR_STRIP_BUILD"
    | "MOR_MEANING_MATCH"
    | "MOR_BUILD_WORD"
    | "CONTROLLED_SPELLING"
    | "DICTATION_NO_IMAGE";
  canonicalWordId: string | null;
  expectedEvidenceKind: "read_only" | "guided_task" | "controlled_spelling" | "dictation";
}

export interface CompiledAffixLessonV1 {
  compilerKey: "shared_affix_compiler";
  compilerVersion: typeof SHARED_AFFIX_COMPILER_VERSION;
  taxonomy: AffixLessonCompilationInputV1["taxonomy"];
  route: VersionedLessonRouteReference;
  recipe: LessonRecipeReference;
  position: SharedAffixPosition;
  header: NormalisedAffixTeachingProfileV1["header"];
  introduction: SharedAffixIntroductionV1;
  meaningGroups: readonly SharedAffixMeaningGroupV1[];
  reflection: NormalisedAffixTeachingProfileV1["reflection"];
  words: readonly CompiledSharedAffixWordV1[];
  activities: {
    discoveryWordIds: readonly string[];
    splitCanonicalWordIds: readonly string[];
    primaryBuild: CompiledSharedAffixBuildV1;
    builds: readonly CompiledSharedAffixBuildV1[];
    includeMeaningSort: boolean;
    dictationWordIds: readonly string[];
  };
  assignmentBindings: readonly SharedAffixAssignmentBindingV1[];
  completion: {
    requiredActivityIds: readonly string[];
    independentActivityIds: readonly string[];
    scheduleWordIds: readonly string[];
    rewardWordIds: readonly string[];
  };
  provenance: {
    profileVersion: string;
    contentVersion: string;
    fingerprintAlgorithm: "sha256";
    fingerprintVersion: typeof SHARED_AFFIX_FINGERPRINT_VERSION;
    sourceFingerprint: string;
  };
  fingerprint: string;
}

export const SHARED_AFFIX_BLOCKER_CODES = [
  "missing_decomposition",
  "reconstruction_mismatch",
  "missing_affix_form",
  "selected_word_not_in_profile",
  "invalid_position",
  "missing_semantic_base",
  "missing_teaching_surface",
  "missing_transformation",
  "unsupported_transformation",
  "missing_meaning_facts",
  "insufficient_form_coverage",
  "insufficient_meaning_group_coverage",
  "wrong_lesson_count",
  "wrong_authentic_count",
  "wrong_transfer_count",
  "duplicate_word",
  "missing_reviewed_dictation",
  "missing_profile_copy",
  "invalid_choice_policy",
  "unresolved_activity_binding",
  "assignment_item_count_mismatch",
  "compatibility_adapter_mismatch",
] as const;

export type SharedAffixBlockerCode = (typeof SHARED_AFFIX_BLOCKER_CODES)[number];
export interface SharedAffixBlocker {
  code: SharedAffixBlockerCode;
  detail?: string;
}

export type SharedAffixCompileResult =
  | { ok: true; lesson: CompiledAffixLessonV1 }
  | { ok: false; blockers: readonly SharedAffixBlocker[] };

export type SharedAffixCompatibilityResult<Payload> =
  | { ok: true; payload: Payload }
  | { ok: false; blockers: readonly SharedAffixBlocker[] };
