/**
 * ADLE Slice 7a (7a-A): activity registry regression — pure, DB-free.
 *
 * Proves the registry maps every composed activity to the right interaction
 * archetype under the data-honest Tier map: the data-backed templates resolve
 * to their tailored kind; every content-dependent guided template resolves to
 * the warm prompt shell (`guided_prompt`); unknown templates degrade by section
 * and then to the warm shell without ever throwing; and the registry stays in
 * sync with the active template set (drift guard).
 */

import {
  DATA_BACKED_TEMPLATE_KEYS,
  KNOWN_TEMPLATE_KEYS,
  resolveActivityKind,
  type AdleActivityKind,
} from "../components/adle/activities/registry";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const resolve = (templateKey: string, sectionKey: string): AdleActivityKind =>
  resolveActivityKind({ templateKey, sectionKey });

// --- Data-backed templates resolve to their tailored kind -------------------

const EXPECTED: ReadonlyArray<[string, string, AdleActivityKind]> = [
  ["MICRO_READ_ONLY_INTRO", "lesson_intro", "intro"],
  ["LESSON_WORDS_INTRO", "lesson_intro", "intro"],
  ["REVIEW_DICTATION", "review_production", "dictation"],
  ["DICTATION_NO_IMAGE", "lesson_dictation", "dictation"],
  ["DICTATION_SENTENCE_CONTEXT", "lesson_dictation", "dictation"],
  ["DIAGNOSTIC_DICTATION_PROBE", "lesson_probe", "dictation"],
  ["CONTROLLED_SPELLING", "lesson_production", "dictation"],
  ["HIDE_WRITE", "guided_practice", "dictation"],
  ["REVIEW_QUICK_SORT", "review_quick_sort", "quick_sort"],
  ["ERROR_REFLECTION_CUE", "review_reflection", "reflection"],
  ["MEMORY_CUE", "guided_practice", "reflection"],
  ["MUST_USE_FREEWRITING", "lesson_production", "must_use_writing"],
  ["REVIEW_MUST_USE_WRITING", "review_production", "must_use_writing"],
];
for (const [templateKey, sectionKey, kind] of EXPECTED) {
  assert(resolve(templateKey, sectionKey) === kind, `${templateKey} resolves to ${kind}`);
}

// --- Every content-dependent guided template is a warm prompt shell ---------

const TIER_C_TEMPLATES = [
  "PG_SOUND_NOTICE",
  "PG_GRAPHEME_MAP",
  "HOM_MEANING_MATCH",
  "HOM_SENTENCE_CHOICE",
  "HOM_CORRECTION",
  "INF_CONTEXT_CHOICE",
  "INF_RULE_CHOICE",
  "INF_TRANSFORM",
  "IRRE_TRICKY_PART",
  "MOR_STRIP_BUILD",
  "MOR_MEANING_MATCH",
  "MOR_BUILD_WORD",
  "PAT_PATTERN_SPOT",
  "PAT_RULE_APPLY",
  "SYL_SPLIT",
  "SYL_REBUILD",
  "SCHWA_STRESS_MARK",
  "SCHWA_VOWEL_REVEAL",
  "SCHWA_ANCHOR",
];
for (const templateKey of TIER_C_TEMPLATES) {
  assert(resolve(templateKey, "guided_practice") === "guided_prompt", `${templateKey} is a warm prompt shell`);
  assert(!DATA_BACKED_TEMPLATE_KEYS.has(templateKey), `${templateKey} is not marked data-backed`);
}

// --- Data-backed set is exactly the tailored templates ----------------------

for (const [templateKey, , kind] of EXPECTED) {
  const shouldBeBacked = kind !== "guided_prompt";
  assert(
    DATA_BACKED_TEMPLATE_KEYS.has(templateKey) === shouldBeBacked,
    `${templateKey} data-backed flag matches its kind`,
  );
}

// --- Unknown templates fail closed to safe, never throw ---------------------

assert(resolve("BRAND_NEW_TEMPLATE", "lesson_production") === "dictation", "unknown template falls back by section");
assert(resolve("BRAND_NEW_TEMPLATE", "review_reflection") === "reflection", "unknown template -> reflection section");
assert(resolve("BRAND_NEW_TEMPLATE", "review_quick_sort") === "quick_sort", "unknown template -> quick_sort section");
assert(
  resolve("BRAND_NEW_TEMPLATE", "totally_unknown_section") === "guided_prompt",
  "unknown template + unknown section -> warm prompt shell (never a broken screen)",
);
assert(resolve("", "") === "guided_prompt", "empty keys fail closed to the warm shell");

// --- Drift guard: the registry knows exactly the active template set ---------
// (32 active templates in adle_activity_templates, verified 2026-07-07.)

const ACTIVE_TEMPLATES = [
  "CONTROLLED_SPELLING",
  "DIAGNOSTIC_DICTATION_PROBE",
  "DICTATION_NO_IMAGE",
  "DICTATION_SENTENCE_CONTEXT",
  "ERROR_REFLECTION_CUE",
  "HIDE_WRITE",
  "HOM_CORRECTION",
  "HOM_MEANING_MATCH",
  "HOM_SENTENCE_CHOICE",
  "INF_CONTEXT_CHOICE",
  "INF_RULE_CHOICE",
  "INF_TRANSFORM",
  "IRRE_TRICKY_PART",
  "LESSON_WORDS_INTRO",
  "MEMORY_CUE",
  "MICRO_READ_ONLY_INTRO",
  "MOR_BUILD_WORD",
  "MOR_MEANING_MATCH",
  "MOR_STRIP_BUILD",
  "MUST_USE_FREEWRITING",
  "PAT_PATTERN_SPOT",
  "PAT_RULE_APPLY",
  "PG_GRAPHEME_MAP",
  "PG_SOUND_NOTICE",
  "REVIEW_DICTATION",
  "REVIEW_MUST_USE_WRITING",
  "REVIEW_QUICK_SORT",
  "SCHWA_ANCHOR",
  "SCHWA_STRESS_MARK",
  "SCHWA_VOWEL_REVEAL",
  "SYL_REBUILD",
  "SYL_SPLIT",
];
assert(ACTIVE_TEMPLATES.length === 32, "the pinned active template set has 32 entries");
for (const templateKey of ACTIVE_TEMPLATES) {
  assert(KNOWN_TEMPLATE_KEYS.has(templateKey), `registry knows active template ${templateKey}`);
}
assert(
  KNOWN_TEMPLATE_KEYS.size === ACTIVE_TEMPLATES.length,
  "registry has no stale/extra templates beyond the active set",
);

console.log("adle-activity-registry-regression: all checks passed");
