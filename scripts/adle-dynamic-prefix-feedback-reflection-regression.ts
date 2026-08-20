import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { onLessonCompleted, type CompletionWordPolicy } from "../lib/adle/composer-completions";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import { priceWordEvidence } from "../lib/adle/evidence-pricing";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { analyseDictationSentence } from "../lib/adle/morphology/dictation-context";
import { compileDynamicPrefixWordLabDecision } from "../lib/adle/morphology/dynamic-prefix-compiler-rollout";
import {
  DEFAULT_PREFIX_CLEAVER_FEEDBACK_POLICY,
  DYNAMIC_PREFIX_PEDAGOGY_VERSION,
  type DynamicPrefixProfile,
  type PrefixTeachingCardV1,
} from "../lib/adle/morphology/dynamic-prefix-contracts";
import { dynamicPrefixRuntime } from "../lib/adle/morphology/dynamic-prefix-runtime";
import {
  loadReviewedPrefixPackageFixtures,
  selectReviewedPrefixFixture,
} from "./lib/adle-reviewed-prefix-package-fixture";

type Manifest = {
  prefixDefinitions: PrefixTeachingCardV1[];
  profiles: Array<{
    microSkillKey: string;
    targetForms: string[];
    choiceForms: string[];
    meaningCheckKind: "meaning" | "prefix_form";
    meaningBins: DynamicPrefixProfile["meaningBins"];
    validChoiceAudit: NonNullable<DynamicPrefixProfile["pedagogy"]>["validChoiceAudit"];
  }>;
};

const manifest = JSON.parse(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-03-dynamic-prefix-pedagogy-v1/manifest.json",
  "utf8",
)) as Manifest;
const definitions = new Map(
  manifest.prefixDefinitions.map((definition) => [definition.text, definition]),
);

for (const declared of manifest.profiles) {
  const fixture = loadReviewedPrefixPackageFixtures().find(
    (entry) => entry.profile.microSkillKey === declared.microSkillKey,
  );
  assert(fixture, `${declared.microSkillKey}: fixture exists`);
  const profile: DynamicPrefixProfile = {
    ...fixture.profile,
    meaningBins: declared.meaningBins,
    prefixChoices: declared.choiceForms.map((form, index) => ({
      ...definitions.get(form)!,
      outcome: null,
      status: index === 0 ? "target" as const : "valid_alternative" as const,
      reviewedSource: "dynamic-prefix-pedagogy-v1",
    })),
    pedagogy: {
      version: DYNAMIC_PREFIX_PEDAGOGY_VERSION,
      teachingCards: declared.targetForms.map((form) => definitions.get(form)!),
      validChoiceAudit: declared.validChoiceAudit,
      meaningCheckKind: declared.meaningCheckKind,
      meaningResultsPresentation: "none",
      coverClosePolicy: { kind: "track_ratio", threshold: 0.8 },
    },
  };
  const decision = compileDynamicPrefixWordLabDecision(
    selectReviewedPrefixFixture(profile, fixture.words[0]!),
    { mode: "shared_authoritative", sourceKind: "reviewed_fixture" },
  );
  assert(decision.ok, `${declared.microSkillKey}: compiles through shared authority`);
  assert.equal(decision.metrics.legacyInvoked, false);
  assert.deepEqual(
    decision.payload.activities.guided?.cleaverFeedbackPolicy,
    DEFAULT_PREFIX_CLEAVER_FEEDBACK_POLICY,
    `${declared.microSkillKey}: serialises the route-safe Cleaver policy`,
  );
  const runtime = dynamicPrefixRuntime(decision.payload);
  assert(runtime, `${declared.microSkillKey}: runtime remains readable`);
  const split = runtime.activities.find((activity) => activity.type === "strip_build");
  assert.deepEqual(split?.cleaverFeedbackPolicy, DEFAULT_PREFIX_CLEAVER_FEEDBACK_POLICY);
  const feedback = [
    ...(split?.cleaverFeedbackPolicy?.firstMiss ?? []),
    ...(split?.cleaverFeedbackPolicy?.repeatedMiss ?? []),
  ].join("\n");
  assert(!/(?:un|dis|mis|in|im|il|ir|re|pre|sub|inter|super)-/u.test(feedback));
  assert.equal(split?.cleaverFeedbackPolicy?.firstMiss.at(-1), "Try again.");
  assert.equal(split?.cleaverFeedbackPolicy?.repeatedMiss.at(-1), "Try again.");
  assert.equal(split?.cleaverFeedbackPolicy?.revealCorrectBoundaryAfterMisses, false);

  const historical = structuredClone(decision.payload);
  if (historical.activities.guided) delete historical.activities.guided.cleaverFeedbackPolicy;
  const historicalRuntime = dynamicPrefixRuntime(historical);
  assert(historicalRuntime, `${declared.microSkillKey}: historical payload remains readable`);
  assert.deepEqual(
    historicalRuntime.activities.find((activity) => activity.type === "strip_build")?.cleaverFeedbackPolicy,
    DEFAULT_PREFIX_CLEAVER_FEEDBACK_POLICY,
    `${declared.microSkillKey}: historical payload receives the safe default`,
  );
}

function expectAnalysis(params: {
  expected: string;
  attempted: string;
  targetIndex: number;
  targetCorrect: boolean;
  contextKinds: Array<"substitution" | "omission" | "insertion">;
}) {
  const result = analyseDictationSentence(params.expected, params.attempted, params.targetIndex);
  assert.equal(result.targetCorrect, params.targetCorrect);
  assert.deepEqual(result.contextSlips.map((slip) => slip.edit.kind), params.contextKinds);
  assert(result.contextSlips.every((slip) => slip.targetToken === false));
  return result;
}

expectAnalysis({ expected: "We took the subway home.", attempted: "We took the subway home.", targetIndex: 3, targetCorrect: true, contextKinds: [] });
expectAnalysis({ expected: "We took the subway home.", attempted: "We tuk the subway home.", targetIndex: 3, targetCorrect: true, contextKinds: ["substitution"] });
expectAnalysis({ expected: "We took the subway home.", attempted: "Us tuk the subway home.", targetIndex: 3, targetCorrect: true, contextKinds: ["substitution", "substitution"] });
expectAnalysis({ expected: "We took the subway home.", attempted: "We took subway home.", targetIndex: 3, targetCorrect: true, contextKinds: ["omission"] });
expectAnalysis({ expected: "We took the subway home.", attempted: "We quickly took the subway home.", targetIndex: 3, targetCorrect: true, contextKinds: ["insertion"] });
expectAnalysis({ expected: "We took the subway home.", attempted: "We took the subwai home.", targetIndex: 3, targetCorrect: false, contextKinds: [] });
expectAnalysis({ expected: "We took the subway home.", attempted: "We tuk the subwai home.", targetIndex: 3, targetCorrect: false, contextKinds: ["substitution"] });
expectAnalysis({ expected: "We took the subway home.", attempted: "we TOOK the SUBWAY home", targetIndex: 3, targetCorrect: true, contextKinds: [] });
expectAnalysis({ expected: "The child’s well-known hero smiled.", attempted: "The child's well-known hero smiled", targetIndex: 3, targetCorrect: true, contextKinds: [] });
expectAnalysis({ expected: "The cat and the cat sat.", attempted: "The cat plus and the cat sat.", targetIndex: 4, targetCorrect: true, contextKinds: ["insertion"] });

const childId = "fixture-child";
const words = ["international", "superhero", "subway", "interact"] as const;
const authentic = new Set<string>(words.slice(0, 3));
const producedWords = words.map((word) => ({ canonicalWordId: word, attemptText: word, correct: true }));
const policies: CompletionWordPolicy[] = words.map((word) => ({
  canonicalWordId: word,
  evidenceEligible: true,
  scheduleEligible: authentic.has(word),
  learningItemTransitionEligible: authentic.has(word),
  rewardEligible: authentic.has(word),
}));
const learningItems = words.slice(0, 3).map((word) => ({
  learningItemId: `item-${word}`,
  childId,
  canonicalWordId: word,
  microSkillKey: "D4_MOR_PREFIXES_SUB_INTER_SUPER",
  itemStatus: "pending" as const,
  sourceKind: "verified_misspelling" as const,
  sourceRef: `source-${word}`,
  sourceAttemptText: word,
  reteachPriority: false,
  ejectedOn: null,
  intakeOn: "2026-08-05" as const,
  rowStatus: "active" as const,
}));
const completion = onLessonCompleted(REVIEW_POLICY_V1, {
  childId,
  microSkillKey: "D4_MOR_PREFIXES_SUB_INTER_SUPER",
  completedOn: "2026-08-05",
  sourceRef: "lesson:fixture-child:2026-08-05:D4_MOR_PREFIXES_SUB_INTER_SUPER",
  bundleId: "fixture-bundle",
  producedWords,
  wordPolicies: policies,
  learningItems,
});
assert.deepEqual(completion.taughtEvents.map((event) => event.canonicalWordId), words);
assert.deepEqual(completion.scheduleWords.map((word) => word.canonicalWordId), words.slice(0, 3));
assert.deepEqual(completion.itemTransitions.map((item) => item.canonicalWordId), words.slice(0, 3));
assert(!completion.scheduleWords.some((word) => word.canonicalWordId === "interact"));

const interactTaught = completion.taughtEvents.filter((event) => event.canonicalWordId === "interact");
assert.equal(interactTaught.length, 1);
const pricing = priceWordEvidence(EVIDENCE_POLICY_V1, {
  childId,
  canonicalWordId: "interact",
  normalisedWord: "interact",
  skillFamilyKey: "D4_MOR",
  outcomeEvents: [],
  taughtHistory: interactTaught,
  authenticUseEvents: [],
  slippageEvents: [],
});
assert.equal(pricing.entries.length, 1);
assert.equal(pricing.entries[0]?.kind, "lesson_production");
assert.equal(pricing.entries[0]?.weight, 0.75);
assert.equal(pricing.score, 0.75);
const state = computeWordEvidenceState(EVIDENCE_POLICY_V1, pricing, {
  outcomeEvents: [],
  taughtHistory: interactTaught,
  slippageEvents: [],
});
assert.equal(state.state, "active");

const splitHandle = readFileSync("components/adle/activities/shared/split-handle.tsx", "utf8");
const renderer = readFileSync("components/adle/morphology/morphology-guided-lesson.tsx", "utf8");
const completionAction = readFileSync("app/learn/week/adle/actions.ts", "utf8");
assert(!splitHandle.includes("Look for the prefix un-"));
assert(!splitHandle.includes("un- is the first two letters"));
assert(splitHandle.includes("revealCorrectBoundaryAfterMisses !== false"));
assert(renderer.includes("Today we studied:"));
assert(renderer.includes("<LessonReflection"));
assert(renderer.includes("analyseDictationSentence"));
assert(renderer.includes("contextItems.slice(0, 3)"));
assert(renderer.includes('data-reflection-context-recap') === false, "the route supplies recap data while the canonical component owns presentation");
assert(
  renderer.includes('!prefixCards?.length') && renderer.includes('position: "after_response" as const'),
  "Prefix Reflection never renders the legacy MeaningCards summary boxes",
);
assert(renderer.includes("targetAttemptedToken") && renderer.includes("correctSpelling: sentence.targetWord"));
assert(renderer.includes("These are useful sentence checks. They do not add target-word mistakes"));
assert(completionAction.includes("evidenceEligible: true"));
assert(completionAction.includes("scheduleEligible: authentic"));
assert(completionAction.includes("learningItemTransitionEligible: authentic"));

console.log("PASS: profile-safe Cleaver feedback, target/context Dictation analysis, Prefix Reflection context, and evidence-bearing non-scheduled transfer completion");
