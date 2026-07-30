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
