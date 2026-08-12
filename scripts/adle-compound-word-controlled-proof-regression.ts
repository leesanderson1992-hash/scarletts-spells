import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import { createPersistedRouteMetadataV2 } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { getCurriculumRouteDefinition } from "../lib/adle/curriculum-readiness/route-registry";
import { extractAuthoredTargetSpan, validateDictationTargetSpanV2 } from "../lib/adle/morphology/dictation-target-span";
import { activationAllowsChild, childAllowlistActivationReport } from "../lib/adle/route-activation-scope";
import { isExactGovernedFormCorrect } from "../lib/adle/session-correctness";

const PROOF_CHILD = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const OTHER_CHILD = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
const RELEASE = {
  activationRevisionId: "1d5129c8-d83a-4dd3-80ce-f4ab8ee69a3f",
  releaseManifestId: "8ba3118d-7adb-4634-8aa4-598773a2cda3",
  releaseKey: "compound-word-separated-hyphenated-v2-reading-pages-2026-08-12",
  releaseManifestSha256: "7374d47fab6caf21ef2e3257319bec06e5210f6b141bb9a8a1a0f0072b21ad6f",
  dependencyFingerprint: "83072cc60fb24890db03e9a846de13c3b83ecd0d868ee56c0f694e52fa2cd18c",
} as const;

const route = getCurriculumRouteDefinition("compound_word_lab", "v2");
assert(route?.newAssignmentCapable, "Compound v2 is assignment-capable through the existing route registry");
assert.equal(route.activationAuthority, "database_route_activation");
const metadata = createPersistedRouteMetadataV2("compound_word_lab", RELEASE);
assert.equal(metadata.route.routeId, "compound_word_lab");
assert.equal(metadata.curriculumRelease.releaseManifestId, RELEASE.releaseManifestId);

const scope = childAllowlistActivationReport([PROOF_CHILD]);
assert(activationAllowsChild(scope, PROOF_CHILD));
assert(!activationAllowsChild(scope, OTHER_CHILD));
assert(!activationAllowsChild({ ...scope, scope: { kind: "all_eligible", childIds: [PROOF_CHILD] } }, PROOF_CHILD));
assert(!activationAllowsChild({ ...scope, emergencyDisableAvailable: false }, PROOF_CHILD));

for (const [target, correct, wrong] of [
  ["grandmother", "grandmother", ["grand mother", "grand-mother"]],
  ["football", "football", ["foot ball"]],
  ["mother-in-law", "mother-in-law", ["mother in law", "motherinlaw"]],
  ["well-known", "well-known", ["well known", "wellknown"]],
  ["ice cream", "ice cream", ["icecream", "ice-cream"]],
] as const) {
  assert(isExactGovernedFormCorrect(correct, target));
  for (const attempt of wrong) assert(!isExactGovernedFormCorrect(attempt, target));
}

const openSpan = { schemaVersion: 2, startTokenIndex: 2, endTokenIndexExclusive: 4, exactAnswer: "ice cream" } as const;
assert(validateDictationTargetSpanV2("We shared ice cream today.", openSpan));
assert.equal(extractAuthoredTargetSpan("We shared ice cream today.", openSpan), "ice cream");
const hyphenSpan = { schemaVersion: 2, startTokenIndex: 2, endTokenIndexExclusive: 3, exactAnswer: "mother-in-law" } as const;
assert(validateDictationTargetSpanV2("My kind mother-in-law visited.", hyphenSpan));
assert.equal(extractAuthoredTargetSpan("My kind mother-in-law visited.", hyphenSpan), "mother-in-law");

const item = (targetWord: string) => ({
  id: "bf40c342-04d8-4207-b262-942e92a8dc84",
  sourceEntityId: "cw-3c-1-regression",
  sectionKey: "lesson_dictation" as const,
  templateKey: "DICTATION_NO_IMAGE",
  position: 18,
  status: "ready",
  canonicalWordId: "fb1fe829-cedb-4889-9db3-7a3ee9955dca",
  targetWord,
  microSkillKey: "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
  adleLearningItemRef: null,
  promptData: {},
});
const exactEvents = buildLessonAttemptEvents({
  context: {
    childId: PROOF_CHILD,
    parentUserId: "a28d4885-8328-4853-ba11-6c676619b9ea",
    assignmentId: "30b4be4d-380a-4320-a5b4-6c23f35f0a42",
    planDate: "2026-08-14",
  },
  items: [item("ice cream")],
  sourceRef: "lesson:compound-proof",
  controlledAttempts: new Map(),
  dictationAttempts: new Map([["fb1fe829-cedb-4889-9db3-7a3ee9955dca", "ice cream"]]),
  dictationRawAttempts: new Map([["fb1fe829-cedb-4889-9db3-7a3ee9955dca", "We shared ice cream today"]]),
  guidedAttempts: new Map(),
  probeAttempts: new Map(),
  correctness: "exact_governed_form",
});
assert.equal(exactEvents.length, 1);
assert.equal(exactEvents[0]?.attemptText, "ice cream", "release-bound evidence stores the complete governed target span");
assert.equal(exactEvents[0]?.isCorrect, true);

const migration = readFileSync("supabase/migrations/20260812150000_enable_controlled_compound_word_v2_assignments.sql", "utf8");
assert(migration.includes("adle_release_activation_allows_child_v2"));
assert(migration.includes("adle_release_bound_composed_plan_is_ready_v2"));
assert(migration.includes("complete_adle_release_bound_word_lab_v2"));
assert(!migration.includes("complete_adle_compound_word_v2"), "completion remains a shared release-bound Word Lab abstraction");
assert(migration.includes("child_allowlist"));
assert(migration.includes("jsonb_array_length(p_items) <> 18"));
assert(migration.includes("Generated Compound practice cannot enter learner scheduling"));
const authorityLoader = readFileSync("lib/adle/morphology/compound-word-v2-loader.ts", "utf8");
assert(!authorityLoader.includes("canonical_teaching_dictionary_words!canonical_word_id"), "governed authority loading avoids ambiguous nested PostgREST relationships");
assert(authorityLoader.includes('.in("structure_id", structureIds)'), "components and joins are fetched through their explicit governed structure identity");

console.log("controlled Compound Word Production proof regression passed");
