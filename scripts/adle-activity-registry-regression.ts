/**
 * ADLE 7-UI-B: activity template registry regression — pure, DB-free.
 *
 * Proves typed metadata, renderer routing, section-safe fallback, and the
 * evidence-boundary rule that the registry imports no scheduler/reward/evidence
 * write code.
 */

import { readFileSync } from "node:fs";

import {
  getActivityTemplateDefinition,
  listRegisteredActivityTemplateKeys,
  resolveActivityTemplateDefinition,
  type ActivityMode,
  type ActivityRendererKind,
} from "../lib/adle/activity-template-registry";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const resolve = (templateKey: string, sectionKey: string) =>
  resolveActivityTemplateDefinition({ templateKey, sectionKey });

// --- Data-backed templates resolve to their tailored kind -------------------

const EXPECTED: ReadonlyArray<[string, string, ActivityRendererKind, ActivityMode, boolean]> = [
  ["MICRO_READ_ONLY_INTRO", "lesson_intro", "intro", "read_only", false],
  ["LESSON_WORDS_INTRO", "lesson_intro", "intro", "read_only", false],
  ["REVIEW_DICTATION", "review_production", "dictation", "production", true],
  ["DICTATION_NO_IMAGE", "lesson_dictation", "dictation", "production", true],
  ["DICTATION_SENTENCE_CONTEXT", "lesson_dictation", "dictation", "production", true],
  ["DIAGNOSTIC_DICTATION_PROBE", "lesson_probe", "dictation", "production", true],
  ["CONTROLLED_SPELLING", "lesson_production", "dictation", "production", true],
  ["HIDE_WRITE", "guided_practice", "dictation", "guided", true],
  ["REVIEW_QUICK_SORT", "review_quick_sort", "quick_sort", "read_only", false],
  ["ERROR_REFLECTION_CUE", "review_reflection", "reflection", "reflection", true],
  ["MEMORY_CUE", "guided_practice", "reflection", "guided", true],
  ["MUST_USE_FREEWRITING", "lesson_production", "must_use_writing", "production", true],
  ["REVIEW_MUST_USE_WRITING", "review_production", "must_use_writing", "production", true],
];
for (const [templateKey, sectionKey, kind, mode, capturesAttempt] of EXPECTED) {
  const definition = resolve(templateKey, sectionKey);
  assert(definition.rendererKind === kind, `${templateKey} resolves to ${kind}`);
  assert(definition.activityMode === mode, `${templateKey} activity mode is ${mode}`);
  assert(definition.capturesAttempt === capturesAttempt, `${templateKey} capturesAttempt is ${capturesAttempt}`);
  assert(definition.fallbackBehaviour === "none", `${templateKey} is a registered route`);
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
  const definition = resolve(templateKey, "guided_practice");
  assert(definition.rendererKind === "guided_prompt", `${templateKey} is a warm prompt shell`);
  assert(definition.activityMode === "guided", `${templateKey} is guided mode`);
  assert(definition.capturesAttempt, `${templateKey} captures the existing guided attempt map`);
}

// --- get/list APIs expose a strict known-key set ----------------------------

for (const [templateKey] of EXPECTED) {
  assert(getActivityTemplateDefinition(templateKey)?.templateKey === templateKey, `${templateKey} is gettable`);
}
assert(getActivityTemplateDefinition("BRAND_NEW_TEMPLATE") === null, "unknown template is not registered");

// --- Unknown templates fail closed to safe, never throw ---------------------

assert(resolve("BRAND_NEW_TEMPLATE", "lesson_production").rendererKind === "dictation", "unknown template falls back by section");
assert(resolve("BRAND_NEW_TEMPLATE", "lesson_production").fallbackBehaviour === "section_safe_fallback", "section fallback is auditable");
assert(resolve("BRAND_NEW_TEMPLATE", "review_reflection").rendererKind === "reflection", "unknown template -> reflection section");
assert(resolve("BRAND_NEW_TEMPLATE", "review_quick_sort").rendererKind === "quick_sort", "unknown template -> quick_sort section");
assert(
  resolve("BRAND_NEW_TEMPLATE", "totally_unknown_section").rendererKind === "guided_prompt",
  "unknown template + unknown section -> warm prompt shell (never a broken screen)",
);
assert(resolve("", "").rendererKind === "guided_prompt", "empty keys fail closed to the warm shell");

const unsupportedKnownSection = resolve("ERROR_REFLECTION_CUE", "lesson_production");
assert(
  unsupportedKnownSection.rendererKind === "dictation" &&
    unsupportedKnownSection.fallbackBehaviour === "section_safe_fallback",
  "known template in unsupported section falls back by section without claiming implementation",
);

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
const registeredKeys: ReadonlySet<string> = new Set(listRegisteredActivityTemplateKeys());
assert(ACTIVE_TEMPLATES.length === 32, "the pinned active template set has 32 entries");
for (const templateKey of ACTIVE_TEMPLATES) {
  assert(registeredKeys.has(templateKey), `registry knows active template ${templateKey}`);
}
assert(
  registeredKeys.size === ACTIVE_TEMPLATES.length,
  "registry has no stale/extra templates beyond the active set",
);

// --- Import boundary: metadata registry stays out of evidence/scheduler/reward

const registrySource = readFileSync("lib/adle/activity-template-registry.ts", "utf8");
for (const forbidden of [
  "assignment-attempt-events",
  "session-completion-loader",
  "evidence-policy",
  "evidence-pricing",
  "review-scheduler",
  "review-due-queue",
  "composer-completions",
  "learning-items",
  "reward",
  "supabase",
]) {
  assert(!registrySource.includes(`from "./${forbidden}`), `registry must not import ${forbidden}`);
  assert(!registrySource.includes(`from "../${forbidden}`), `registry must not import ${forbidden}`);
  assert(!registrySource.includes(`@/lib/adle/${forbidden}`), `registry must not import ${forbidden}`);
  assert(!registrySource.includes(`@/lib/rewards`), "registry must not import reward code");
}

console.log("adle-activity-registry-regression: all checks passed");
