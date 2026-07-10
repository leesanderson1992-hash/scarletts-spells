/**
 * ADLE 7-UI-B: pure activity/template registry.
 *
 * This module owns only template metadata and renderer routing. It has no
 * evidence, scheduler, reward, database, or server-action imports; completion
 * semantics stay in the existing attempt/completion modules.
 */

export type ActivityRendererKind =
  | "intro"
  | "dictation"
  | "quick_sort"
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
  | "none"
  | "section_safe_fallback"
  | "guided_prompt_fallback";

export interface ActivityTemplateDefinition {
  templateKey: string;
  templateFamily: ActivityTemplateFamily;
  supportedSectionKeys: readonly string[];
  rendererKind: ActivityRendererKind;
  fallbackBehaviour: ActivityTemplateFallbackBehaviour;
  capturesAttempt: boolean;
  activityMode: ActivityMode;
}

const TEMPLATE_DEFINITIONS = {
  MICRO_READ_ONLY_INTRO: definition("MICRO_READ_ONLY_INTRO", "intro", ["lesson_intro"], "intro", false, "read_only"),
  LESSON_WORDS_INTRO: definition("LESSON_WORDS_INTRO", "intro", ["lesson_intro"], "intro", false, "read_only"),

  REVIEW_DICTATION: definition("REVIEW_DICTATION", "dictation", ["review_production"], "dictation", true, "production"),
  DICTATION_NO_IMAGE: definition("DICTATION_NO_IMAGE", "dictation", ["lesson_dictation"], "dictation", true, "production"),
  DICTATION_SENTENCE_CONTEXT: definition(
    "DICTATION_SENTENCE_CONTEXT",
    "dictation",
    ["review_production", "lesson_dictation"],
    "dictation",
    true,
    "production",
  ),
  DIAGNOSTIC_DICTATION_PROBE: definition(
    "DIAGNOSTIC_DICTATION_PROBE",
    "dictation",
    ["lesson_probe"],
    "dictation",
    true,
    "production",
  ),
  CONTROLLED_SPELLING: definition(
    "CONTROLLED_SPELLING",
    "dictation",
    ["lesson_production"],
    "dictation",
    true,
    "production",
  ),
  HIDE_WRITE: definition("HIDE_WRITE", "guided", ["guided_practice"], "dictation", true, "guided"),

  REVIEW_QUICK_SORT: definition(
    "REVIEW_QUICK_SORT",
    "review",
    ["review_quick_sort"],
    "quick_sort",
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
  HOM_MEANING_MATCH: guidedDefinition("HOM_MEANING_MATCH", "homophone"),
  HOM_SENTENCE_CHOICE: guidedDefinition("HOM_SENTENCE_CHOICE", "homophone"),
  HOM_CORRECTION: guidedDefinition("HOM_CORRECTION", "homophone"),
  INF_CONTEXT_CHOICE: guidedDefinition("INF_CONTEXT_CHOICE", "inflection"),
  INF_RULE_CHOICE: guidedDefinition("INF_RULE_CHOICE", "inflection"),
  INF_TRANSFORM: guidedDefinition("INF_TRANSFORM", "inflection"),
  IRRE_TRICKY_PART: guidedDefinition("IRRE_TRICKY_PART", "irregular"),
  MOR_STRIP_BUILD: guidedDefinition("MOR_STRIP_BUILD", "morphology"),
  MOR_MEANING_MATCH: guidedDefinition("MOR_MEANING_MATCH", "morphology"),
  MOR_BUILD_WORD: guidedDefinition("MOR_BUILD_WORD", "morphology"),
  PAT_PATTERN_SPOT: guidedDefinition("PAT_PATTERN_SPOT", "pattern"),
  PAT_RULE_APPLY: guidedDefinition("PAT_RULE_APPLY", "pattern"),
  SYL_SPLIT: guidedDefinition("SYL_SPLIT", "syllable"),
  SYL_REBUILD: guidedDefinition("SYL_REBUILD", "syllable"),
  SCHWA_STRESS_MARK: guidedDefinition("SCHWA_STRESS_MARK", "schwa"),
  SCHWA_VOWEL_REVEAL: guidedDefinition("SCHWA_VOWEL_REVEAL", "schwa"),
  SCHWA_ANCHOR: guidedDefinition("SCHWA_ANCHOR", "schwa"),
} as const;

export type ActivityTemplateKey = keyof typeof TEMPLATE_DEFINITIONS;

const SECTION_FALLBACKS: Readonly<Record<string, Omit<ActivityTemplateDefinition, "templateKey">>> = {
  lesson_intro: fallback("intro", ["lesson_intro"], "intro", false, "read_only", "section_safe_fallback"),
  review_quick_sort: fallback(
    "review",
    ["review_quick_sort"],
    "quick_sort",
    false,
    "read_only",
    "section_safe_fallback",
  ),
  review_production: fallback(
    "dictation",
    ["review_production"],
    "dictation",
    true,
    "production",
    "section_safe_fallback",
  ),
  review_reflection: fallback(
    "review",
    ["review_reflection"],
    "reflection",
    true,
    "reflection",
    "section_safe_fallback",
  ),
  lesson_production: fallback(
    "dictation",
    ["lesson_production"],
    "dictation",
    true,
    "production",
    "section_safe_fallback",
  ),
  lesson_dictation: fallback(
    "dictation",
    ["lesson_dictation"],
    "dictation",
    true,
    "production",
    "section_safe_fallback",
  ),
  lesson_probe: fallback(
    "dictation",
    ["lesson_probe"],
    "dictation",
    true,
    "production",
    "section_safe_fallback",
  ),
  guided_practice: fallback(
    "guided",
    ["guided_practice"],
    "guided_prompt",
    true,
    "guided",
    "section_safe_fallback",
  ),
};

export function getActivityTemplateDefinition(templateKey: string): ActivityTemplateDefinition | null {
  return TEMPLATE_DEFINITIONS[templateKey as ActivityTemplateKey] ?? null;
}

export function resolveActivityTemplateDefinition(input: {
  templateKey: string;
  sectionKey: string;
}): ActivityTemplateDefinition {
  const registered = getActivityTemplateDefinition(input.templateKey);
  if (
    registered !== null &&
    (input.sectionKey === "" || registered.supportedSectionKeys.includes(input.sectionKey))
  ) {
    return registered;
  }
  return (
    withTemplateKey(input.templateKey, SECTION_FALLBACKS[input.sectionKey]) ??
    {
      templateKey: input.templateKey,
      templateFamily: "unsupported",
      supportedSectionKeys: [],
      rendererKind: "guided_prompt",
      fallbackBehaviour: "guided_prompt_fallback",
      capturesAttempt: false,
      activityMode: "guided",
    }
  );
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
  return definition(templateKey, templateFamily, ["guided_practice"], "guided_prompt", true, "guided");
}

function fallback(
  templateFamily: ActivityTemplateFamily,
  supportedSectionKeys: readonly string[],
  rendererKind: ActivityRendererKind,
  capturesAttempt: boolean,
  activityMode: ActivityMode,
  fallbackBehaviour: ActivityTemplateFallbackBehaviour,
): Omit<ActivityTemplateDefinition, "templateKey"> {
  return {
    templateFamily,
    supportedSectionKeys,
    rendererKind,
    fallbackBehaviour,
    capturesAttempt,
    activityMode,
  };
}

function withTemplateKey(
  templateKey: string,
  definitionWithoutKey: Omit<ActivityTemplateDefinition, "templateKey"> | undefined,
): ActivityTemplateDefinition | null {
  return definitionWithoutKey === undefined ? null : { templateKey, ...definitionWithoutKey };
}
