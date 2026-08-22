import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.notEqual(result.status, "blocked");
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

const snapshotHashes: Record<string, string> = {
  "lib/adle/composable-lesson/generic-snapshot-compiler.ts": "23c1fbf6973541d15c9c6c230ec47dfeae0c18dbb54efb39eff117fa59749da1",
  "lib/adle/composable-lesson/generic-snapshot-contracts.ts": "10275d6e5eb269098ebf4e57e2fb93ee696602ecd39e7e3f58b9b94dafe5361d",
  "lib/adle/composable-lesson/generic-snapshot-mode.ts": "85d3848c5f76d21835e7a15195316fc5e17e40b5e74af18a5f19dbd850286df5",
  "lib/adle/composable-lesson/generic-snapshot-reader.ts": "c792568cefc14dad268cf3ab4dbd8abf785ac70bd09c5c38479723740228826c",
  "lib/adle/composable-lesson/generic-snapshot-registry.ts": "e4fdb0ef1adb0b1487aa23255911ba1b92566f8199dfabe4e692e4e6b0fa0350",
  "lib/adle/composable-lesson/generic-snapshot-requirements.ts": "eeb2b73de9cbeafe0dee753e69c91334bb13c8ab393b830f1fec8b08a6f71ee5",
  "lib/adle/composable-lesson/generic-snapshot-validator.ts": "e6f94a21336afcd6f28a1a77160f48d25b6991430b6d0df2fe90dde82f72d101",
};
for (const [path, expected] of Object.entries(snapshotHashes)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(actual, expected, `${path} must remain byte-identical to the committed Snapshot v2 baseline`);
}

const runner = readFileSync("components/adle-session-runner.tsx", "utf8");
assert(runner.includes("normalizeGenericActivitySequence") && runner.includes("CanonicalActivityHost"), "generic/historical rendering must pass through the normalizer and canonical host");
for (const obsolete of ["rendererKindFor", "itemsForRenderer", "resolveActivityTemplateDefinition", "<GuidedActivity", "<ColdWordRecall", "<CoverShutter", "<SentenceDictation", "<ReflectionActivity", "<IntroActivity"]) {
  assert(!runner.includes(obsolete), `generic runtime must not retain renderer selection ${obsolete}`);
}
assert(runner.includes("action={blockers.length === 0 ? completeAdleLessonPartAction : undefined}"), "blocked lesson activities must not retain a completion action");
assert(!existsSync("components/adle/activities/registry.ts"), "the obsolete React renderer-kind wrapper must be removed");

console.log("PASS: Phase C generic/historical compatibility normalization (deterministic canonical contracts, fail-closed rich inputs, immutable Snapshot v2, one runtime renderer authority)");
