/**
 * ADLE Slice 7a (7a-A): the activity registry — the single, pure source of
 * truth that maps a composed activity to the interaction archetype that renders
 * it. Kept free of React/JSX so it is unit-testable DB-free by
 * `adle:activity-registry-regression`, exactly like the other adle:* suites.
 *
 * The mapping encodes the OWNER-APPROVED, data-honest Tier map (Slice 7a):
 * full tailored interactions exist only where the data backs them; every
 * content-dependent guided step resolves to a warm, template-specific prompt
 * shell (`guided_prompt`) rather than a naked input, and is designed so the
 * richer interaction is a drop-in once the structured content lands.
 *
 * Resolution never throws: an unknown template falls back by section, and an
 * unknown section falls back to the warm prompt shell (fail-closed to safe).
 */

/** The interaction archetypes the session runner knows how to render. */
export type AdleActivityKind =
  | "intro" // warm read-only reveal of the teaching point + lesson words
  | "dictation" // clean audio/spelling input (Tier-B, data-backed)
  | "quick_sort" // drag/tap categorise; concrete bins for D4_SYL/D4_SCHWA, else warm
  | "reflection" // non-punitive repair / memory cue
  | "must_use_writing" // writing pad that lights each target word as it is used
  | "guided_prompt"; // warm, template-specific Tier-C prompt shell (drop-in upgradeable)

/**
 * Explicit template -> archetype map. Every active template
 * (`adle_activity_templates`, verified 2026-07-07) has an entry so resolution
 * is deterministic and reviewable; the fallbacks below only catch drift.
 */
const KIND_BY_TEMPLATE: Readonly<Record<string, AdleActivityKind>> = {
  // Intros — teaching content + display-word previews exist.
  MICRO_READ_ONLY_INTRO: "intro",
  LESSON_WORDS_INTRO: "intro",

  // Dictation / spelling cluster — word + audio + clean input is fully backed.
  REVIEW_DICTATION: "dictation",
  DICTATION_NO_IMAGE: "dictation",
  DICTATION_SENTENCE_CONTEXT: "dictation",
  DIAGNOSTIC_DICTATION_PROBE: "dictation",
  CONTROLLED_SPELLING: "dictation",
  HIDE_WRITE: "dictation",

  // Quick sort — the component derives concrete bins for D4_SYL/D4_SCHWA from
  // the payload's sortBins, and shows a warm sort prompt otherwise.
  REVIEW_QUICK_SORT: "quick_sort",

  // Reflection / memory — repair flow + misconception hint exist.
  ERROR_REFLECTION_CUE: "reflection",
  MEMORY_CUE: "reflection",

  // Must-use writing — list the target words, light each as it is used.
  MUST_USE_FREEWRITING: "must_use_writing",
  REVIEW_MUST_USE_WRITING: "must_use_writing",

  // Content-dependent guided steps — warm Tier-C prompt shells until the
  // structured content (grapheme maps, homophone sets, morphology sets,
  // syllable segmentation, misconception taxonomies) is authored.
  PG_SOUND_NOTICE: "guided_prompt",
  PG_GRAPHEME_MAP: "guided_prompt",
  HOM_MEANING_MATCH: "guided_prompt",
  HOM_SENTENCE_CHOICE: "guided_prompt",
  HOM_CORRECTION: "guided_prompt",
  INF_CONTEXT_CHOICE: "guided_prompt",
  INF_RULE_CHOICE: "guided_prompt",
  INF_TRANSFORM: "guided_prompt",
  IRRE_TRICKY_PART: "guided_prompt",
  MOR_STRIP_BUILD: "guided_prompt",
  MOR_MEANING_MATCH: "guided_prompt",
  MOR_BUILD_WORD: "guided_prompt",
  PAT_PATTERN_SPOT: "guided_prompt",
  PAT_RULE_APPLY: "guided_prompt",
  SYL_SPLIT: "guided_prompt",
  SYL_REBUILD: "guided_prompt",
  SCHWA_STRESS_MARK: "guided_prompt",
  SCHWA_VOWEL_REVEAL: "guided_prompt",
  SCHWA_ANCHOR: "guided_prompt",
};

/** Section-level fallback when a template key is unknown (registry drift). */
const KIND_BY_SECTION: Readonly<Record<string, AdleActivityKind>> = {
  lesson_intro: "intro",
  review_quick_sort: "quick_sort",
  review_production: "dictation",
  review_reflection: "reflection",
  lesson_production: "dictation",
  lesson_dictation: "dictation",
  lesson_probe: "dictation",
  guided_practice: "guided_prompt",
};

export interface ActivityResolutionInput {
  templateKey: string;
  sectionKey: string;
}

/**
 * Resolve an activity to its interaction archetype. Never throws: unknown
 * template -> section fallback -> `guided_prompt` (a warm shell is always a
 * safe render, never a broken screen).
 */
export function resolveActivityKind(input: ActivityResolutionInput): AdleActivityKind {
  return (
    KIND_BY_TEMPLATE[input.templateKey] ??
    KIND_BY_SECTION[input.sectionKey] ??
    "guided_prompt"
  );
}

/** Templates whose full interaction is data-backed today (Tier-B). Everything
 * else routes through the warm prompt shell. Exposed for the regression + docs. */
export const DATA_BACKED_TEMPLATE_KEYS: ReadonlySet<string> = new Set(
  Object.entries(KIND_BY_TEMPLATE)
    .filter(([, kind]) => kind !== "guided_prompt")
    .map(([templateKey]) => templateKey),
);

/** All template keys the registry knows about (for exhaustiveness checks). */
export const KNOWN_TEMPLATE_KEYS: ReadonlySet<string> = new Set(Object.keys(KIND_BY_TEMPLATE));
