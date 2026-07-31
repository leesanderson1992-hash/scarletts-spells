/**
 * Runtime-neutral contracts for describing future composable ADLE lessons.
 *
 * Production compilers and readers do not import this module. It describes
 * immutable snapshots without changing or reinterpreting existing payloads.
 */

export type LessonRouteReference = {
  routeKey: string;
  routeVersion: string;
};

export type LessonRecipeReference = {
  recipeKey: string;
  recipeVersion: string;
};

/**
 * Assignment-level identity for the immutable lesson contract selected by an
 * existing writer. These keys describe persisted behaviour; they do not
 * activate a route or select curriculum content.
 */
export type LessonRouteId =
  | "generic_composer"
  | "base_word_lab"
  | "dynamic_prefix_word_lab"
  | "fixed_un_prefix_word_lab"
  | "dynamic_affix_word_lab"
  | "closed_compound_word_lab";

export type LessonPayloadKind =
  | "composed_daily_plan"
  | "morphology_guided_v1"
  | "dynamic_prefix_lesson_v2"
  | "dynamic_affix_lesson_v3"
  | "closed_compound_lesson_v1"
  | "base_word_family_snapshot_v1";

export type VersionedLessonRouteReference = {
  routeId: LessonRouteId;
  routeVersion: string;
};

export type VersionedLessonPayloadReference = {
  kind: LessonPayloadKind;
  version: number;
};

export type PersistedLessonRouteMetadataV1 = {
  metadataSchemaVersion: 1;
  route: VersionedLessonRouteReference;
  recipe: LessonRecipeReference;
  payload: VersionedLessonPayloadReference;
};

export type LessonRuntimeAdapterKey =
  | "generic_composer_v1"
  | "morphology_guided_v1"
  | "dynamic_prefix_v2"
  | "dynamic_affix_v3"
  | "closed_compound_v1"
  | "base_word_family_v1";

export type LessonRendererKey =
  | "generic_session"
  | "morphology_guided"
  | "closed_compound_guided"
  | "base_word_family_guided";

export type LessonRouteResolutionSource =
  | "persisted_metadata"
  | "legacy_detection";

export const LESSON_ROUTE_RESOLUTION_BLOCKER_CODES = [
  "malformed_metadata",
  "unsupported_metadata_schema_version",
  "unknown_route",
  "unsupported_route_version",
  "recipe_mismatch",
  "payload_kind_mismatch",
  "payload_version_mismatch",
  "duplicate_metadata_source",
  "root_item_missing",
  "root_item_duplicate",
  "persisted_payload_missing",
  "persisted_payload_malformed",
  "assignment_binding_mismatch",
  "route_unavailable",
  "multiple_legacy_routes",
  "explicit_legacy_disagreement",
  "unsupported_legacy_payload",
] as const;

export type LessonRouteResolutionBlockerCode =
  (typeof LESSON_ROUTE_RESOLUTION_BLOCKER_CODES)[number];

export type AssignmentWordRole =
  | "authentic_target"
  | "transfer"
  | "guided_example"
  | "review";

export type AnswerVisibilityMode =
  | "teaching"
  | "guided"
  | "recall_neutral"
  | "post_submit";

export type LessonEvidenceMode =
  | "none"
  | "guided_completion"
  | "independent_word"
  | "independent_sentence"
  | "reflection"
  | "diagnostic";

export type CompletionBinding =
  | "viewed"
  | "interaction_complete"
  | "attempt_submitted"
  | "sentence_submitted"
  | "reflection_submitted";

export type ScheduleRole = "none" | "taught_word" | "review_word";
export type RewardRole = "none" | "lesson_completion";

export type LessonCondition =
  | { kind: "always" }
  | { kind: "meaning_group_count_at_least"; count: number }
  | { kind: "surface_form_count_at_least"; count: number }
  | { kind: "word_role_present"; role: AssignmentWordRole }
  | { kind: "activity_fact_present"; factKey: string };

type ActivityBase<Kind extends string, Version extends number = 1> = {
  activityId: string;
  kind: Kind;
  contractVersion: Version;
  condition: LessonCondition;
  assignmentBindings: readonly string[];
  answerVisibility: AnswerVisibilityMode;
  evidenceMode: LessonEvidenceMode;
  completionBinding: CompletionBinding;
};

export type LessonActivitySnapshot =
  | (ActivityBase<"introduction"> & { screenCount: number })
  | (ActivityBase<"discovery"> & { focus: "form" | "meaning" | "strategy" })
  | (ActivityBase<"guided_prompt"> & { promptKey: string })
  | (ActivityBase<"family_reveal"> & { familySectionKey: string })
  | (ActivityBase<"cleaver"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"word_build"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"compound_jigsaw"> & {
      canonicalWordIds: readonly string[];
      join: "none" | "space" | "hyphen";
    })
  | (ActivityBase<"meaning_match"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"meaning_sort"> & { meaningGroupKeys: readonly string[] })
  | (ActivityBase<"cover_check"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"dictation"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"reflection"> & { promptKey: string })
  | (ActivityBase<"review_quick_sort"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"must_use_writing"> & { canonicalWordIds: readonly string[] })
  | (ActivityBase<"diagnostic_probe"> & { probeKey: string });

export type LessonActivityKind = LessonActivitySnapshot["kind"];

export interface LessonWordSnapshot {
  snapshotSchemaVersion: 1;
  canonicalWordId: string;
  displayWord: string;
  microSkillKey: string;
  role: AssignmentWordRole;
  assignmentSelected: boolean;
  contentVersion: string;
  factFingerprint: string;
}

export interface CompiledLessonSnapshot {
  snapshotSchemaVersion: 1;
  validatorVersion: string;
  compilerVersion: string;
  contentVersion: string;
  route: LessonRouteReference;
  recipe: LessonRecipeReference;
  words: readonly LessonWordSnapshot[];
  activities: readonly LessonActivitySnapshot[];
  scheduleRoles: Readonly<Record<string, ScheduleRole>>;
  rewardRole: RewardRole;
  provenance: {
    sourceKind: "repository" | "teaching_dictionary";
    sourceVersion: string;
    sourceFingerprint: string;
  };
}

/** Explicit aliases for the original runtime-neutral snapshot vocabulary.
 * Their structure and meaning remain frozen at schema version 1; route-
 * specific production snapshots use separately versioned contracts. */
export type ActivitySnapshotV1 = LessonActivitySnapshot;
export type LessonWordSnapshotV1 = LessonWordSnapshot;
export type CompiledLessonSnapshotV1 = CompiledLessonSnapshot;

export function isLessonActivityKind(value: string): value is LessonActivityKind {
  return LESSON_ACTIVITY_KINDS.includes(value as LessonActivityKind);
}

export const LESSON_ACTIVITY_KINDS = [
  "introduction",
  "discovery",
  "guided_prompt",
  "family_reveal",
  "cleaver",
  "word_build",
  "compound_jigsaw",
  "meaning_match",
  "meaning_sort",
  "cover_check",
  "dictation",
  "reflection",
  "review_quick_sort",
  "must_use_writing",
  "diagnostic_probe",
] as const satisfies readonly LessonActivityKind[];
