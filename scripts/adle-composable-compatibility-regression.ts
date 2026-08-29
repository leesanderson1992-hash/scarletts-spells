import { strict as assert } from "node:assert";

import {
  ADLE_ACTIVITY_REQUIREMENT_REGISTRY,
  validateActivityRequirementRegistry,
  type ActivityFactKey,
} from "../lib/adle/composable-lesson/activity-requirements";
import {
  assessLessonWordCompatibility,
  COMPATIBILITY_BLOCKER_CODES,
} from "../lib/adle/composable-lesson/compatibility";
import { LESSON_ACTIVITY_KINDS } from "../lib/adle/composable-lesson/contracts";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";

assert.deepEqual(validateActivityRequirementRegistry(), []);
assert.deepEqual(
  ADLE_ACTIVITY_REQUIREMENT_REGISTRY.map((entry) => entry.kind).sort(),
  [...LESSON_ACTIVITY_KINDS].sort(),
  "every activity kind has exactly one requirements declaration",
);
assert.equal(new Set(COMPATIBILITY_BLOCKER_CODES).size, COMPATIBILITY_BLOCKER_CODES.length);
for (const route of ADLE_CURRICULUM_ROUTE_REGISTRY) {
  for (const activity of route.requiredActivities) {
    assert(
      ADLE_ACTIVITY_REQUIREMENT_REGISTRY.some((entry) => entry.kind === activity),
      `${route.routeId}:${route.routeVersion} references a registered activity`,
    );
  }
}

const completeFacts = [
  "canonical_identity",
  "display_word",
  "canonical_status",
  "pronunciation",
  "syllables",
  "stress",
  "schwa",
  "phonemes",
  "frequency_band",
  "age_band",
  "complexity_band",
  "word_micro_skill_support",
  "child_meaning",
  "whole_word_meaning",
  "teaching_decomposition",
  "canonical_morphology",
  "joins",
  "transformations",
  "compound_components",
  "dictation_sentence",
  "dictation_target",
  "dictation_audio",
  "micro_skill_content",
  "reflection_prompt",
  "assignment_binding",
  "prior_attempt_summary",
] as const satisfies readonly ActivityFactKey[];

const input = {
  route: { routeKey: "compound_word_lab", routeVersion: "v2" },
  recipe: { recipeKey: "compound_word_lab", recipeVersion: "v2" },
  microSkillKey: "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
  canonicalWordId: "fixture-word",
  role: "authentic_target" as const,
  selected: false,
  dependencyFingerprint: "fixture-dependency-v1",
  routeAvailable: true,
  profileAvailable: true,
  taxonomyBound: true,
  microSkillCompatible: true,
  canonicalIdentityPresent: true,
  canonicalApproved: true,
  authenticTargetApproved: true,
  transferApproved: false,
  availableFacts: completeFacts,
  requiredActivities: [
    "compound_jigsaw",
    "meaning_match",
    "cover_check",
    "dictation",
  ] as const,
  currentProductionCoupling: "authentic_requires_transfer" as const,
};

const authenticOnly = assessLessonWordCompatibility(input);
assert.equal(authenticOnly.outcomes.supported, "compatible");
assert.equal(
  authenticOnly.outcomes.authenticTarget,
  "compatible",
  "architectural authentic eligibility does not require transfer approval",
);
assert.equal(authenticOnly.outcomes.transfer, "incompatible");
assert.equal(authenticOnly.outcomes.selected, false, "selection remains an observed state");
assert(
  authenticOnly.blockers.some(
    (entry) =>
      entry.code === "transfer_not_approved" &&
      entry.scope === "production_parity",
  ),
  "the current Closed Compound authentic/transfer coupling is reported",
);

const comparatorMismatch = assessLessonWordCompatibility({
  ...input,
  transferApproved: true,
  selected: true,
  contradictions: ["answer_comparator"],
});
assert.equal(comparatorMismatch.outcomes.selected, true);
assert(
  comparatorMismatch.blockers.some(
    (entry) =>
      entry.code === "answer_comparator_mismatch" &&
      entry.scope === "production_parity",
  ),
  "the current child/server separator comparator mismatch is reported",
);

const missing = assessLessonWordCompatibility({
  ...input,
  transferApproved: true,
  availableFacts: completeFacts.filter(
    (fact) => fact !== "compound_components" && fact !== "dictation_target",
  ),
});
assert(
  missing.blockers.some((entry) => entry.code === "compound_component_missing"),
);
assert(
  missing.blockers.some(
    (entry) => entry.code === "dictation_target_missing_or_mismatched",
  ),
);
assert.equal(missing.outcomes.supported, "incompatible");

const again = assessLessonWordCompatibility({
  ...input,
  availableFacts: [...completeFacts].reverse(),
});
assert.equal(
  again.assessmentFingerprint,
  authenticOnly.assessmentFingerprint,
  "fact input ordering does not change the deterministic assessment",
);

console.log("ADLE composable compatibility regression passed.");
