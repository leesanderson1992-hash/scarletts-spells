import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";
import {
  normalizeGenericActivity,
  normalizeGenericActivitySequence,
} from "../lib/adle/generic-activity-compatibility";

function item(input: Partial<AdleSessionItem> & Pick<AdleSessionItem, "id" | "sectionKey" | "templateKey">): AdleSessionItem {
  return {
    sourceEntityId: input.id,
    position: 0,
    status: "pending",
    targetWord: "helpful",
    canonicalWordId: "word-helpful",
    microSkillKey: "fixture",
    adleLearningItemRef: "fixture",
    promptData: {},
    ...input,
  };
}

function contract(result: ReturnType<typeof normalizeGenericActivity>): string {
  if (result.status === "blocked") throw new Error(`Expected normalized contract, received ${result.blocker.code}`);
  return `${result.spec.concept}.${result.spec.mode}@${result.spec.contractVersion}`;
}

assert.equal(contract(normalizeGenericActivity(item({ id: "intro", sectionKey: "lesson_intro", templateKey: "MICRO_READ_ONLY_INTRO" }))), "INTRODUCTION.historical_generic_read_only@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "review", sectionKey: "review_production", templateKey: "REVIEW_DICTATION" }))), "COLD_WORD_RECALL.scheduled_review@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "cover", sectionKey: "lesson_production", templateKey: "CONTROLLED_SPELLING" }))), "COVER_CHECK.whole_word@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "hide", sectionKey: "guided_practice", templateKey: "HIDE_WRITE" }))), "COVER_CHECK.whole_word@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "memory", sectionKey: "guided_practice", templateKey: "MEMORY_CUE" }))), "MEMORY_CUE.child_authored_cue@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "repair", sectionKey: "review_reflection", templateKey: "ERROR_REFLECTION_CUE" }))), "ERROR_REPAIR.reveal_hide_retry@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "noop", sectionKey: "review_quick_sort", templateKey: "REVIEW_QUICK_SORT" }))), "REVIEW_SORT.compatibility_noop@1");
assert.equal(contract(normalizeGenericActivity(item({ id: "writing", sectionKey: "lesson_production", templateKey: "MUST_USE_FREEWRITING" }))), "FREE_WRITING.first_impression_transfer@1");

const dictation = normalizeGenericActivity(item({
  id: "sentence",
  sectionKey: "lesson_dictation",
  templateKey: "DICTATION_NO_IMAGE",
  promptData: { audioText: "The helpful child smiled.", sentence: "The helpful child smiled.", targetTokenIndex: 1 },
}));
assert.equal(contract(dictation), "DICTATION.whole_sentence@1");

const meaning = item({ id: "meaning", sectionKey: "guided_practice", templateKey: "MOR_MEANING_MATCH", promptData: { definition: "giving help" } });
assert.equal(contract(normalizeGenericActivity(meaning)), "MEANING_MATCH.component_clues@1");
const meaningFallback = item({ id: "meaning-old", sectionKey: "guided_practice", templateKey: "HOM_MEANING_MATCH" });
const meaningSequence = normalizeGenericActivitySequence([meaning, meaningFallback]);
assert(meaningSequence.every((result) => result.status === "compatibility" && result.spec.mode === "historical_free_response"), "a definition-less historical meaning sequence must retain its all-free-response replay semantics");

for (const richKey of ["PG_SOUND_NOTICE", "HOM_SENTENCE_CHOICE", "INF_TRANSFORM", "MOR_BUILD_WORD", "PAT_RULE_APPLY", "SYL_SPLIT", "SCHWA_ANCHOR"]) {
  const result = normalizeGenericActivity(item({ id: richKey, sectionKey: "guided_practice", templateKey: richKey }));
  assert.equal(result.status, "blocked");
  assert.equal(result.blocker.code, "ADLE_ACTIVITY_RICH_INTERACTION_UNAVAILABLE");
}

const unknown = normalizeGenericActivity(item({ id: "unknown", sectionKey: "guided_practice", templateKey: "BRAND_NEW_KEY" }));
assert.equal(unknown.status, "blocked");
assert.equal(unknown.blocker.code, "ADLE_ACTIVITY_UNKNOWN_TEMPLATE");
const malformed = normalizeGenericActivity(item({ id: "malformed", sectionKey: "lesson_dictation", templateKey: "DICTATION_NO_IMAGE" }));
assert.equal(malformed.status, "blocked");
assert.equal(malformed.blocker.code, "ADLE_ACTIVITY_INVALID_HISTORICAL_PAYLOAD");

const metadataFree = normalizeGenericActivity(item({ id: "metadata-free", sectionKey: "review_production", templateKey: "" }));
assert.equal(contract(metadataFree), "COLD_WORD_RECALL.scheduled_review@1");
assert.equal(metadataFree.status, "compatibility");
assert.deepEqual(normalizeGenericActivitySequence([meaning, meaningFallback]), normalizeGenericActivitySequence([meaning, meaningFallback]), "normalization must be deterministic and mutation-free");

for (const retiredV2Path of [
  "lib/adle/composable-lesson/generic-snapshot-compiler.ts",
  "lib/adle/composable-lesson/generic-snapshot-contracts.ts",
  "lib/adle/composable-lesson/generic-snapshot-registry.ts",
  "lib/adle/composable-lesson/generic-snapshot-requirements.ts",
  "lib/adle/composable-lesson/generic-snapshot-validator.ts",
]) {
  assert(!existsSync(retiredV2Path), `${retiredV2Path} must stay retired after the zero-row E5 proof`);
}

const runner = readFileSync("components/adle-session-runner.tsx", "utf8");
assert(runner.includes("normalizeGenericActivitySequence") && runner.includes("CanonicalActivityHost"), "generic/historical rendering must pass through the normalizer and canonical host");
for (const obsolete of ["rendererKindFor", "itemsForRenderer", "resolveActivityTemplateDefinition", "<GuidedActivity", "<ColdWordRecall", "<CoverShutter", "<SentenceDictation", "<ReflectionActivity", "<IntroActivity"]) {
  assert(!runner.includes(obsolete), `generic runtime must not retain renderer selection ${obsolete}`);
}
assert(runner.includes("action={blockers.length === 0 ? completeAdleLessonPartAction : undefined}"), "blocked lesson activities must not retain a completion action");
assert(!existsSync("components/adle/activities/registry.ts"), "the obsolete React renderer-kind wrapper must be removed");

console.log("PASS: Phase C generic/historical compatibility normalization (deterministic canonical contracts, fail-closed rich inputs, snapshot-v3 authority, one runtime renderer authority)");
