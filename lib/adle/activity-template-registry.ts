/**
 * Legacy generic template vocabulary retained for Snapshot v2 parity tooling
 * and route compile-time keys. Learner runtime does not import this module.
 *
 * This module owns only immutable template metadata. Its former section and
 * catch-all renderer fallback functions were removed in Phase C. It has no
 * evidence, scheduler, reward, database, or server-action imports; completion
 * semantics stay in the existing attempt/completion modules.
 */

export type ActivityRendererKind =
  | "intro"
  | "cover_check"
  | "sentence_dictation"
  | "cold_word_recall"
  | "compatibility_noop"
  | "meaning_match"
  | "reflection"
  | "must_use_writing"
  | "guided_prompt";

export type ActivityMode = "read_only" | "guided" | "production" | "reflection";

export type ActivityTemplateFamily =
  | "intro"
  | "review"
  | "dictation"
  | "guided"
  | "phoneme_grapheme"
  | "homophone"
  | "inflection"
  | "irregular"
  | "morphology"
  | "pattern"
  | "syllable"
  | "schwa"
  | "freewriting"
  | "unsupported";

export type ActivityTemplateFallbackBehaviour =
  | "none";

export interface ActivityTemplateDefinition {
  templateKey: string;
  templateFamily: ActivityTemplateFamily;
  supportedSectionKeys: readonly string[];
  rendererKind: ActivityRendererKind;
  fallbackBehaviour: ActivityTemplateFallbackBehaviour;
  capturesAttempt: boolean;
  activityMode: ActivityMode;
  richExperience?: "D4_MOR_GUIDED" | "D4_MOR_COMPOUND_WORD";
  supportedPayloadVersions?: readonly number[];
}

const TEMPLATE_DEFINITIONS = {
  MICRO_READ_ONLY_INTRO: definition("MICRO_READ_ONLY_INTRO", "intro", ["lesson_intro"], "intro", false, "read_only"),
  LESSON_WORDS_INTRO: definition("LESSON_WORDS_INTRO", "intro", ["lesson_intro"], "intro", false, "read_only"),

  REVIEW_DICTATION: definition("REVIEW_DICTATION", "dictation", ["review_production"], "cold_word_recall", true, "production"),
  DICTATION_NO_IMAGE: definition("DICTATION_NO_IMAGE", "dictation", ["lesson_dictation"], "sentence_dictation", true, "production"),
  DICTATION_SENTENCE_CONTEXT: definition(
    "DICTATION_SENTENCE_CONTEXT",
    "dictation",
    ["review_production", "lesson_dictation"],
    "sentence_dictation",
    true,
    "production",
  ),
  DIAGNOSTIC_DICTATION_PROBE: definition(
    "DIAGNOSTIC_DICTATION_PROBE",
    "dictation",
    ["lesson_probe"],
    "cold_word_recall",
    true,
    "production",
  ),
  CONTROLLED_SPELLING: definition(
    "CONTROLLED_SPELLING",
    "dictation",
    ["lesson_production"],
    "cover_check",
    true,
    "production",
  ),
  HIDE_WRITE: definition("HIDE_WRITE", "guided", ["guided_practice"], "cover_check", true, "guided"),

  REVIEW_QUICK_SORT: definition(
    "REVIEW_QUICK_SORT",
    "review",
    ["review_quick_sort"],
    "compatibility_noop",
    false,
    "read_only",
  ),
  ERROR_REFLECTION_CUE: definition(
    "ERROR_REFLECTION_CUE",
    "review",
    ["review_reflection"],
    "reflection",
    true,
    "reflection",
  ),
  MEMORY_CUE: definition("MEMORY_CUE", "guided", ["guided_practice"], "reflection", true, "guided"),

  MUST_USE_FREEWRITING: definition(
    "MUST_USE_FREEWRITING",
    "freewriting",
    ["lesson_production"],
    "must_use_writing",
    true,
    "production",
  ),
  REVIEW_MUST_USE_WRITING: definition(
    "REVIEW_MUST_USE_WRITING",
    "freewriting",
    ["review_production"],
    "must_use_writing",
    true,
    "production",
  ),

  PG_SOUND_NOTICE: guidedDefinition("PG_SOUND_NOTICE", "phoneme_grapheme"),
  PG_GRAPHEME_MAP: guidedDefinition("PG_GRAPHEME_MAP", "phoneme_grapheme"),
  HOM_MEANING_MATCH: meaningDefinition("HOM_MEANING_MATCH", "homophone"),
  HOM_SENTENCE_CHOICE: guidedDefinition("HOM_SENTENCE_CHOICE", "homophone"),
  HOM_CORRECTION: guidedDefinition("HOM_CORRECTION", "homophone"),
  INF_CONTEXT_CHOICE: guidedDefinition("INF_CONTEXT_CHOICE", "inflection"),
  INF_RULE_CHOICE: guidedDefinition("INF_RULE_CHOICE", "inflection"),
  INF_TRANSFORM: guidedDefinition("INF_TRANSFORM", "inflection"),
  IRRE_TRICKY_PART: guidedDefinition("IRRE_TRICKY_PART", "irregular"),
  MOR_STRIP_BUILD: guidedDefinition("MOR_STRIP_BUILD", "morphology"),
  MOR_MEANING_MATCH: meaningDefinition("MOR_MEANING_MATCH", "morphology"),
  MOR_BUILD_WORD: guidedDefinition("MOR_BUILD_WORD", "morphology"),
  MOR_COMPOUND_JIGSAW: compoundDefinition("MOR_COMPOUND_JIGSAW"),
  MOR_COMPOUND_MEANING_CONNECTION: meaningDefinition("MOR_COMPOUND_MEANING_CONNECTION", "morphology", "D4_MOR_COMPOUND_WORD"),
  PAT_PATTERN_SPOT: guidedDefinition("PAT_PATTERN_SPOT", "pattern"),
  PAT_RULE_APPLY: guidedDefinition("PAT_RULE_APPLY", "pattern"),
  SYL_SPLIT: guidedDefinition("SYL_SPLIT", "syllable"),
  SYL_REBUILD: guidedDefinition("SYL_REBUILD", "syllable"),
  SCHWA_STRESS_MARK: guidedDefinition("SCHWA_STRESS_MARK", "schwa"),
  SCHWA_VOWEL_REVEAL: guidedDefinition("SCHWA_VOWEL_REVEAL", "schwa"),
  SCHWA_ANCHOR: guidedDefinition("SCHWA_ANCHOR", "schwa"),
} as const;

export type ActivityTemplateKey = keyof typeof TEMPLATE_DEFINITIONS;

export function getActivityTemplateDefinition(templateKey: string): ActivityTemplateDefinition | null {
  return TEMPLATE_DEFINITIONS[templateKey as ActivityTemplateKey] ?? null;
}

export function listRegisteredActivityTemplateKeys(): ActivityTemplateKey[] {
  return Object.keys(TEMPLATE_DEFINITIONS).sort() as ActivityTemplateKey[];
}

export const REGISTERED_ACTIVITY_TEMPLATE_DEFINITIONS: ReadonlyMap<
  ActivityTemplateKey,
  ActivityTemplateDefinition
> = new Map(
  listRegisteredActivityTemplateKeys().map((templateKey) => [templateKey, TEMPLATE_DEFINITIONS[templateKey]]),
);

function definition(
  templateKey: string,
  templateFamily: ActivityTemplateFamily,
  supportedSectionKeys: readonly string[],
  rendererKind: ActivityRendererKind,
  capturesAttempt: boolean,
  activityMode: ActivityMode,
): ActivityTemplateDefinition {
  return {
    templateKey,
    templateFamily,
    supportedSectionKeys,
    rendererKind,
    fallbackBehaviour: "none",
    capturesAttempt,
    activityMode,
  };
}

function guidedDefinition(
  templateKey: string,
  templateFamily: ActivityTemplateFamily,
): ActivityTemplateDefinition {
  const result = definition(templateKey, templateFamily, ["guided_practice"], "guided_prompt", true, "guided");
  return templateFamily === "morphology"
    ? { ...result, richExperience: "D4_MOR_GUIDED", supportedPayloadVersions: [1] }
    : result;
}

function meaningDefinition(
  templateKey: string,
  templateFamily: ActivityTemplateFamily,
  richExperience?: ActivityTemplateDefinition["richExperience"],
): ActivityTemplateDefinition {
  return {
    ...definition(templateKey, templateFamily, ["guided_practice"], "meaning_match", true, "guided"),
    ...(richExperience ? { richExperience, supportedPayloadVersions: [1, 2] } : {}),
  };
}

function compoundDefinition(templateKey: string): ActivityTemplateDefinition {
  return {
    ...definition(templateKey, "morphology", ["guided_practice"], "guided_prompt", true, "guided"),
    richExperience: "D4_MOR_COMPOUND_WORD",
    supportedPayloadVersions: [1, 2],
  };
}
