/**
 * Runtime-neutral vocabulary shared by the current generic snapshot-v3
 * compiler, validator, and reader. This is not a persisted snapshot schema.
 */

export type GenericSnapshotPart = "review" | "lesson";

export type GenericSnapshotSectionKey =
  | "review_quick_sort"
  | "review_production"
  | "review_reflection"
  | "lesson_intro"
  | "guided_practice"
  | "lesson_production"
  | "lesson_dictation"
  | "lesson_probe";

export type GenericSnapshotWordRole =
  | "authentic_target"
  | "transfer"
  | "review"
  | "probe"
  | "teaching_example";

export type GenericSnapshotSelectionProvenance =
  | "learning_item"
  | "probe_miss"
  | "stretch"
  | "review_schedule"
  | "diagnostic_probe"
  | "teaching_content";

export type GenericSnapshotAttemptKind =
  | "guided_practice"
  | "review_production"
  | "reflection_retry"
  | "lesson_production"
  | "lesson_dictation"
  | "lesson_probe";

export type GenericSnapshotEvidenceClass =
  | "guided_practice_attempt"
  | "scheduled_review_attempt"
  | "reflection_attempt"
  | "first_exposure_lesson_attempt"
  | "diagnostic_probe_attempt";

export type GenericSnapshotAttemptCapture =
  | "none"
  | "optional"
  | "submitted_on_part_finish";

export type GenericSnapshotScheduleRole =
  | "none"
  | "review_outcome"
  | "lesson_final_if_no_dictation"
  | "lesson_final"
  | "diagnostic_probe";

export type GenericSnapshotRewardRole = "none" | "lesson_taught_word";

export type GenericSnapshotContentKind =
  | "composer_policy"
  | "schedule_policy"
  | "banding"
  | "family_method"
  | "activity_template"
  | "teaching_content";

export interface GenericSnapshotContentVersion {
  contentRefId: string;
  kind: GenericSnapshotContentKind;
  key: string;
  version: string;
  sourceRowHash: string | null;
}

export type GenericSnapshotCondition =
  | { kind: "always" }
  | {
      kind: "on_misspelling";
      productionItemSourceEntityId: string;
    };

export interface GenericSnapshotEvidenceBinding {
  mode:
    | "none"
    | "guided_completion"
    | "independent_word"
    | "independent_sentence"
    | "reflection"
    | "diagnostic";
  capture: GenericSnapshotAttemptCapture;
  attemptKind: GenericSnapshotAttemptKind | null;
  evidenceClass: GenericSnapshotEvidenceClass | null;
}
