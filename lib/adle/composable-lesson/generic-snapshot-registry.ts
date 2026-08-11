import type {
  ActivitySnapshotV2,
  GenericSnapshotActivityKindV2,
  GenericSnapshotEvidenceBindingV2,
  GenericSnapshotPartV2,
  GenericSnapshotRendererKindV2,
  GenericSnapshotRewardRoleV2,
  GenericSnapshotScheduleRoleV2,
  GenericSnapshotSectionKeyV2,
} from "./generic-snapshot-contracts";

export const GENERIC_SNAPSHOT_TEMPLATE_REGISTRY_VERSION =
  "adle_generic_snapshot_templates_v2" as const;

export interface GenericSnapshotTemplateDefinition {
  templateKey: string;
  contractVersion: 2;
  kind: GenericSnapshotActivityKindV2;
  rendererKind: GenericSnapshotRendererKindV2;
  supportedSections: readonly GenericSnapshotSectionKeyV2[];
  answerVisibility: ActivitySnapshotV2["answerVisibility"];
  evidence: GenericSnapshotEvidenceBindingV2;
  scheduleRole: GenericSnapshotScheduleRoleV2;
  rewardRole: GenericSnapshotRewardRoleV2;
  compileSupport: "supported" | "route_specific" | "registered_legacy_only";
}

const none: GenericSnapshotEvidenceBindingV2 = {
  mode: "none",
  capture: "none",
  attemptKind: null,
  evidenceClass: null,
};
const guided: GenericSnapshotEvidenceBindingV2 = {
  mode: "guided_completion",
  capture: "optional",
  attemptKind: "guided_practice",
  evidenceClass: "guided_practice_attempt",
};

function definition(
  templateKey: string,
  input: Omit<GenericSnapshotTemplateDefinition, "templateKey" | "contractVersion">,
): GenericSnapshotTemplateDefinition {
  return { templateKey, contractVersion: 2, ...input };
}

function intro(templateKey: string): GenericSnapshotTemplateDefinition {
  return definition(templateKey, {
    kind: "introduction",
    rendererKind: "intro",
    supportedSections: ["lesson_intro"],
    answerVisibility: "teaching",
    evidence: none,
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  });
}

function guidedPrompt(templateKey: string): GenericSnapshotTemplateDefinition {
  return definition(templateKey, {
    kind: "guided_prompt",
    rendererKind: "guided_prompt",
    supportedSections: ["guided_practice"],
    answerVisibility: "guided",
    evidence: guided,
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  });
}

function routeGuidedPrompt(templateKey: string): GenericSnapshotTemplateDefinition {
  return { ...guidedPrompt(templateKey), compileSupport: "route_specific" };
}

export const GENERIC_SNAPSHOT_TEMPLATE_REGISTRY = [
  intro("MICRO_READ_ONLY_INTRO"),
  intro("LESSON_WORDS_INTRO"),
  guidedPrompt("PG_SOUND_NOTICE"),
  guidedPrompt("PG_GRAPHEME_MAP"),
  guidedPrompt("PAT_PATTERN_SPOT"),
  guidedPrompt("PAT_RULE_APPLY"),
  guidedPrompt("SYL_SPLIT"),
  guidedPrompt("SYL_REBUILD"),
  guidedPrompt("HOM_MEANING_MATCH"),
  guidedPrompt("HOM_SENTENCE_CHOICE"),
  guidedPrompt("HOM_CORRECTION"),
  guidedPrompt("IRRE_TRICKY_PART"),
  guidedPrompt("MOR_STRIP_BUILD"),
  guidedPrompt("MOR_MEANING_MATCH"),
  guidedPrompt("MOR_BUILD_WORD"),
  routeGuidedPrompt("MOR_COMPOUND_JIGSAW"),
  routeGuidedPrompt("MOR_COMPOUND_MEANING_CONNECTION"),
  guidedPrompt("INF_CONTEXT_CHOICE"),
  guidedPrompt("INF_RULE_CHOICE"),
  guidedPrompt("INF_TRANSFORM"),
  guidedPrompt("SCHWA_STRESS_MARK"),
  guidedPrompt("SCHWA_VOWEL_REVEAL"),
  guidedPrompt("SCHWA_ANCHOR"),
  definition("MEMORY_CUE", {
    kind: "reflection",
    rendererKind: "reflection",
    supportedSections: ["guided_practice"],
    answerVisibility: "guided",
    evidence: guided,
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("HIDE_WRITE", {
    kind: "hide_write",
    rendererKind: "dictation",
    supportedSections: ["guided_practice"],
    answerVisibility: "guided",
    evidence: guided,
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("CONTROLLED_SPELLING", {
    kind: "controlled_spelling",
    rendererKind: "dictation",
    supportedSections: ["lesson_production"],
    answerVisibility: "teaching",
    evidence: {
      mode: "independent_word",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_production",
      evidenceClass: "first_exposure_lesson_attempt",
    },
    scheduleRole: "lesson_final_if_no_dictation",
    rewardRole: "lesson_taught_word",
    compileSupport: "supported",
  }),
  definition("DICTATION_NO_IMAGE", {
    kind: "dictation",
    rendererKind: "dictation",
    supportedSections: ["lesson_dictation"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "independent_word",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_dictation",
      evidenceClass: "first_exposure_lesson_attempt",
    },
    scheduleRole: "lesson_final",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("DICTATION_SENTENCE_CONTEXT", {
    kind: "dictation",
    rendererKind: "dictation",
    supportedSections: ["review_production", "lesson_dictation"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "independent_word",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_dictation",
      evidenceClass: "first_exposure_lesson_attempt",
    },
    scheduleRole: "lesson_final",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("DIAGNOSTIC_DICTATION_PROBE", {
    kind: "diagnostic_probe",
    rendererKind: "dictation",
    supportedSections: ["lesson_probe"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "diagnostic",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_probe",
      evidenceClass: "diagnostic_probe_attempt",
    },
    scheduleRole: "diagnostic_probe",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("REVIEW_QUICK_SORT", {
    kind: "review_quick_sort",
    rendererKind: "quick_sort",
    supportedSections: ["review_quick_sort"],
    answerVisibility: "guided",
    evidence: none,
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("REVIEW_DICTATION", {
    kind: "dictation",
    rendererKind: "dictation",
    supportedSections: ["review_production"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "independent_word",
      capture: "submitted_on_part_finish",
      attemptKind: "review_production",
      evidenceClass: "scheduled_review_attempt",
    },
    scheduleRole: "review_outcome",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("ERROR_REFLECTION_CUE", {
    kind: "reflection",
    rendererKind: "reflection",
    supportedSections: ["review_reflection"],
    answerVisibility: "post_submit",
    evidence: {
      mode: "reflection",
      capture: "optional",
      attemptKind: "reflection_retry",
      evidenceClass: "reflection_attempt",
    },
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "supported",
  }),
  definition("MUST_USE_FREEWRITING", {
    kind: "must_use_writing",
    rendererKind: "must_use_writing",
    supportedSections: ["lesson_production"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "independent_sentence",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_production",
      evidenceClass: "first_exposure_lesson_attempt",
    },
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "registered_legacy_only",
  }),
  definition("REVIEW_MUST_USE_WRITING", {
    kind: "must_use_writing",
    rendererKind: "must_use_writing",
    supportedSections: ["review_production"],
    answerVisibility: "recall_neutral",
    evidence: {
      mode: "independent_sentence",
      capture: "submitted_on_part_finish",
      attemptKind: "review_production",
      evidenceClass: "scheduled_review_attempt",
    },
    scheduleRole: "none",
    rewardRole: "none",
    compileSupport: "registered_legacy_only",
  }),
] as const satisfies readonly GenericSnapshotTemplateDefinition[];

const BY_TEMPLATE = new Map(
  GENERIC_SNAPSHOT_TEMPLATE_REGISTRY.map((entry) => [entry.templateKey, entry]),
);

export function getGenericSnapshotTemplateDefinition(
  templateKey: string,
): GenericSnapshotTemplateDefinition | null {
  return BY_TEMPLATE.get(templateKey) ?? null;
}

/** DICTATION_SENTENCE_CONTEXT has section-dependent existing semantics. */
export function resolveGenericTemplateSemantics(
  definition: GenericSnapshotTemplateDefinition,
  sectionKey: GenericSnapshotSectionKeyV2,
): Pick<GenericSnapshotTemplateDefinition, "evidence" | "scheduleRole" | "rewardRole"> {
  if (
    definition.templateKey === "DICTATION_SENTENCE_CONTEXT" &&
    sectionKey === "review_production"
  ) {
    return {
      evidence: {
        mode: "independent_word",
        capture: "submitted_on_part_finish",
        attemptKind: "review_production",
        evidenceClass: "scheduled_review_attempt",
      },
      scheduleRole: "review_outcome",
      rewardRole: "none",
    };
  }
  return definition;
}

export function genericSnapshotPartForSection(
  sectionKey: GenericSnapshotSectionKeyV2,
): GenericSnapshotPartV2 {
  return sectionKey.startsWith("review_") ? "review" : "lesson";
}

export function validateGenericSnapshotTemplateRegistry(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of GENERIC_SNAPSHOT_TEMPLATE_REGISTRY) {
    if (seen.has(entry.templateKey)) errors.push(`duplicate_template:${entry.templateKey}`);
    seen.add(entry.templateKey);
    if (entry.supportedSections.length === 0) {
      errors.push(`template_without_section:${entry.templateKey}`);
    }
  }
  return errors.sort();
}
