/** Phase C: generic keys are compatibility inputs, not React renderer kinds. */
import { readFileSync } from "node:fs";
import { deepStrictEqual } from "node:assert/strict";

import { listRegisteredActivityTemplateKeys } from "../lib/adle/activity-template-registry";
import { normalizeGenericActivity, normalizeGenericActivitySequence } from "../lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(templateKey: string, sectionKey: string): AdleSessionItem {
  return { id: `${sectionKey}:${templateKey || "metadata-free"}`, sourceEntityId: templateKey, sectionKey, templateKey, position: 0, status: "pending", targetWord: "helpful", canonicalWordId: "word-helpful", microSkillKey: null, adleLearningItemRef: null, promptData: {} };
}

const safeContracts = [
  ["MICRO_READ_ONLY_INTRO", "lesson_intro", "INTRODUCTION", "historical_generic_read_only"],
  ["LESSON_WORDS_INTRO", "lesson_intro", "INTRODUCTION", "historical_generic_read_only"],
  ["REVIEW_DICTATION", "review_production", "COLD_WORD_RECALL", "scheduled_review"],
  ["DICTATION_SENTENCE_CONTEXT", "review_production", "COLD_WORD_RECALL", "scheduled_review"],
  ["DIAGNOSTIC_DICTATION_PROBE", "lesson_probe", "COLD_WORD_RECALL", "diagnostic_probe"],
  ["CONTROLLED_SPELLING", "lesson_production", "COVER_CHECK", "whole_word"],
  ["HIDE_WRITE", "guided_practice", "COVER_CHECK", "whole_word"],
  ["REVIEW_QUICK_SORT", "review_quick_sort", "REVIEW_SORT", "compatibility_noop"],
  ["ERROR_REFLECTION_CUE", "review_reflection", "ERROR_REPAIR", "reveal_hide_retry"],
  ["MEMORY_CUE", "guided_practice", "MEMORY_CUE", "child_authored_cue"],
  ["MUST_USE_FREEWRITING", "lesson_production", "FREE_WRITING", "first_impression_transfer"],
  ["REVIEW_MUST_USE_WRITING", "review_production", "FREE_WRITING", "review_transfer"],
] as const;

for (const [templateKey, sectionKey, concept, mode] of safeContracts) {
  const input = fixture(templateKey, sectionKey);
  if (templateKey === "DIAGNOSTIC_DICTATION_PROBE") input.promptData.words = [{ canonicalWordId: "probe-1", targetWord: "brightness" }];
  const result = normalizeGenericActivity(input);
  assert(result.status !== "blocked", `${templateKey} must remain a supported compatibility input`);
  assert(result.spec.concept === concept && result.spec.mode === mode, `${templateKey} must normalize to ${concept}.${mode}`);
}

for (const templateKey of ["PG_SOUND_NOTICE", "PG_GRAPHEME_MAP", "HOM_SENTENCE_CHOICE", "HOM_CORRECTION", "INF_CONTEXT_CHOICE", "INF_RULE_CHOICE", "INF_TRANSFORM", "IRRE_TRICKY_PART", "MOR_STRIP_BUILD", "MOR_BUILD_WORD", "MOR_COMPOUND_JIGSAW", "PAT_PATTERN_SPOT", "PAT_RULE_APPLY", "SYL_SPLIT", "SYL_REBUILD", "SCHWA_STRESS_MARK", "SCHWA_VOWEL_REVEAL", "SCHWA_ANCHOR"]) {
  const result = normalizeGenericActivity(fixture(templateKey, "guided_practice"));
  assert(result.status === "blocked" && result.blocker.code === "ADLE_ACTIVITY_RICH_INTERACTION_UNAVAILABLE", `${templateKey} must fail closed instead of selecting GuidedActivity`);
}

const unknown = normalizeGenericActivity(fixture("BRAND_NEW_TEMPLATE", "guided_practice"));
assert(unknown.status === "blocked" && unknown.blocker.code === "ADLE_ACTIVITY_UNKNOWN_TEMPLATE", "unknown keys must fail closed");
assert(listRegisteredActivityTemplateKeys().length === 34, "the immutable historical key vocabulary remains complete pending later retirement evidence");
deepStrictEqual(normalizeGenericActivitySequence([fixture("MEMORY_CUE", "guided_practice")]), normalizeGenericActivitySequence([fixture("MEMORY_CUE", "guided_practice")]), "normalization is deterministic");

const normalizerSource = readFileSync("lib/adle/generic-activity-compatibility.ts", "utf8");
for (const forbidden of ["react", "CanonicalActivityHost", "completeAdleLessonPartAction", "review-scheduler", "reward", "supabase"]) {
  assert(!normalizerSource.includes(forbidden), `compatibility normalization must not own ${forbidden}`);
}

console.log("PASS: generic/historical keys normalize to canonical contracts; rich and unknown inputs fail closed; no React selection authority remains in compatibility code");
