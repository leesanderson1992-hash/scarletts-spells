import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION,
  qualifyReviewWritingGoldBarUse,
  reviewWritingGoldBarGateConfig,
} from "../lib/rewards/gold-bar-authentic-use";
import {
  sentenceContainingSpan,
  validateContextualGoldBarUse,
} from "../lib/rewards/contextual-use-validator";
import type { ReviewTargetSnapshotV3 } from "../lib/adle/review-v3/contracts";
import { findExactReviewTargetMatches } from "../lib/adle/review-v3/target-word-matcher";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const base = {
  reviewCompleted: true,
  sourceEventActive: true,
  provenanceKind: "prompted_review_writing_application",
  useKind: "authentic_correct_use",
  writingDisposition: "correct_in_writing" as const,
  originalOutcome: "success",
  originalOutcomeSource: "writing" as const,
  repairState: "not_required",
  exactAuthoredOccurrence: true,
  answerVisibilityStatus: "HIDDEN" as const,
  contextValidationStatus: "NOT_REQUIRED" as const,
  writingSubmittedAt: "2026-09-02T10:00:00.000Z",
  enteredForgeAt: "2026-09-01T09:00:00.000Z",
  policyEffectiveAt: "2026-09-01T00:00:00.000Z",
};

assert.equal(qualifyReviewWritingGoldBarUse(base).status, "ELIGIBLE");
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, answerVisibilityStatus: "VISIBLE" }).status,
  "INELIGIBLE",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, answerVisibilityStatus: "UNKNOWN" }).status,
  "UNCERTAIN",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, contextValidationStatus: "INVALID" }).status,
  "INELIGIBLE",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, contextValidationStatus: "UNCERTAIN" }).status,
  "UNCERTAIN",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, repairState: "completed_correct" }).status,
  "INELIGIBLE",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({
    ...base,
    writingSubmittedAt: "2026-08-31T10:00:00.000Z",
  }).status,
  "INELIGIBLE",
);
assert.equal(
  qualifyReviewWritingGoldBarUse({ ...base, enteredForgeAt: null }).status,
  "INELIGIBLE",
);

assert.equal(
  validateContextualGoldBarUse({
    canonicalWord: "their",
    containingSentence: "Their going home.",
    contextRequired: true,
  }).status,
  "INVALID",
);
assert.equal(
  validateContextualGoldBarUse({
    canonicalWord: "their",
    containingSentence: "Their house is nearby.",
    contextRequired: true,
  }).status,
  "VALID",
);
assert.equal(
  validateContextualGoldBarUse({
    canonicalWord: "piece",
    containingSentence: "I ate a piece of cake.",
    contextRequired: true,
  }).status,
  "UNCERTAIN",
);
assert.equal(
  sentenceContainingSpan("First sentence. Their going home! Last.", 16, 21),
  "Their going home",
);

const target: ReviewTargetSnapshotV3 = {
  contractVersion: 3,
  encounterId: "00000000-0000-4000-8000-000000000001",
  order: 1,
  canonicalWordId: "00000000-0000-4000-8000-000000000002",
  canonicalSpelling: "dragon",
  answerAuthority: {
    referenceId: "dictionary:dragon",
    version: "1",
    matchingPolicy: "governed_exact_tokens_v1",
  },
  audioAuthority: {
    referenceId: "audio:dragon",
    version: "1",
    kind: "speech_text",
    speechText: "dragon",
    assetReference: null,
  },
  schedule: {
    scheduleWordId: "00000000-0000-4000-8000-000000000003",
    sourceBundleId: null,
    dueKind: "scheduled_review",
    dueOn: "2026-09-01",
    intervalIndex: 0,
    schedulePolicyVersion: "review_policy_v1_2026-07-04",
    wordScheduleVersion: "adle_review_per_word_schedule_v1",
  },
  routeProvenance: [{
    routeId: "00000000-0000-4000-8000-000000000004",
    microSkillKey: "D4_PAT_TEST",
    learningItemId: null,
  }],
  availableCue: null,
};
assert.equal(
  findExactReviewTargetMatches(
    "The dragon flew. The dragon landed beside another dragon.",
    [target],
  ).length,
  1,
  "the governed matcher returns one target match even when the word occurs repeatedly",
);
assert.equal(findExactReviewTargetMatches("The dragons flew.", [target]).length, 0);

assert.equal(
  reviewWritingGoldBarGateConfig({
    VERCEL_ENV: "production",
    GOLD_BAR_REVIEW_WRITING_ENABLED: "enabled",
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-09-01T00:00:00Z",
  }),
  null,
  "GB.5 must remain a code gate, not an environment-only switch",
);
assert.deepEqual(
  reviewWritingGoldBarGateConfig({
    VERCEL_ENV: "preview",
    GOLD_BAR_REVIEW_WRITING_ENABLED: "enabled",
    GOLD_BAR_REVIEW_WRITING_EFFECTIVE_AT: "2026-09-01T00:00:00Z",
  }),
  {
    policyVersion: GOLD_BAR_AUTHENTIC_USE_POLICY_VERSION,
    effectiveAt: "2026-09-01T00:00:00.000Z",
  },
);

const migration = read("supabase/migrations/20260901160000_add_gold_bar_review_writing_alignment.sql");
for (const required of [
  "child_word_treasure_review_use_qualifications",
  "unique (treasure_id, review_session_id)",
  "source_authentic_use_event_id uuid not null unique",
  "review_encounter_id uuid not null unique",
  "WORD_TREASURE_AUTHENTIC_USE_V2",
  "REVIEW_WRITING_AUTHENTIC_USE",
  "review_writing_authentic_use",
  "for update",
  "v_source.writing_submitted_at < v_treasure.entered_forge_at",
  "v_treasure.required_uses_for_bar",
  "v_encounter.repair_state <> 'not_required'",
  "v_session.stage <> 'completed'",
  "parentApprovalRequired",
  "before update or delete",
  "to service_role",
]) assert.ok(migration.includes(required), `migration is missing ${required}`);
assert.ok(!migration.includes("adle_review_schedule_words"));
assert.ok(!migration.includes("required_uses_for_bar = 5"));

const consumer = read("lib/rewards/review-writing-authentic-use.ts");
for (const required of [
  "validateCompiledReviewSnapshotV3",
  "findExactReviewTargetMatches",
  "prompted_review_writing_application",
  "micro_skill_catalog",
  'families.get(key) === "D4_HOM"',
  "record_review_writing_gold_bar_use_v2",
  "fingerprintSnapshotValue(request)",
]) assert.ok(consumer.includes(required), `consumer is missing ${required}`);

for (const path of [
  "lib/rewards/free-writing-evidence.ts",
  "lib/rewards/adle-reward-bridge.ts",
]) {
  assert.ok(
    read(path).includes("SPONTANEOUS_AUTHENTIC_USE_SOURCE_CLASS"),
    `${path} must retain spontaneous source provenance`,
  );
}

const action = read("app/learn/week/adle/review-r6-actions.ts");
const finalizeIndex = action.indexOf("await finalizeReviewStageR6");
const rewardIndex = action.indexOf("recordReviewWritingGoldBarUses", finalizeIndex);
assert.ok(finalizeIndex >= 0 && rewardIndex > finalizeIndex);
assert.ok(action.includes("after(async () =>"));
assert.ok(action.includes("Review completion unaffected"));

const rewardContract = read("docs/contracts/reward-system-contract.md");
assert.ok(rewardContract.includes("SPONTANEOUS_AUTHENTIC_USE"));
assert.ok(rewardContract.includes("REVIEW_WRITING_AUTHENTIC_USE"));
assert.ok(rewardContract.includes("required_uses_for_bar = 5"));
assert.ok(rewardContract.includes("does not require a second parent approval"));

const registry = read("docs/implementation/adle-current-state-and-release-registry.md");
assert.ok(registry.includes("`GB.5` release planning and read-only preflight are approved"));
assert.ok(registry.includes("migration and activation are **not approved or active**"));
assert.match(registry, /Production is\s+hard-disabled in code/);

console.log("Gold Bar authentic-use alignment regression: PASS");
