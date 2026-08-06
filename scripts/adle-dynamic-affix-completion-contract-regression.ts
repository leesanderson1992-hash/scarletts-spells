import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { onLessonCompleted } from "../lib/adle/composer-completions";
import { EVIDENCE_POLICY_V1 } from "../lib/adle/evidence-policy";
import { priceWordEvidence } from "../lib/adle/evidence-pricing";
import type { LearningItemFact } from "../lib/adle/learning-items";
import {
  deriveDynamicAffixCompletionPolicy,
  type DynamicAffixCompletionItem,
} from "../lib/adle/morphology/dynamic-affix-completion-policy";
import { compileDynamicAffixWordLabPayloadLegacy } from "../lib/adle/morphology/dynamic-affix-legacy-compiler";
import { selectDynamicAffixWordLab } from "../lib/adle/morphology/affix-word-lab";
import { PROFICIENCY_POLICY_V1, stateCredit } from "../lib/adle/proficiency-policy";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import { computeWordEvidenceState } from "../lib/adle/word-evidence-state";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const childId = "dynamic-affix-completion-fixture";
const fixture = loadReviewedAffixPackageFixture(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-ment/reviewed-staging-package.json",
);

function item(wordId: string, position: number): LearningItemFact {
  return {
    learningItemId: `completion:${wordId}:${position}`,
    childId,
    canonicalWordId: wordId,
    microSkillKey: fixture.profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "dynamic-affix-completion-regression",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-08-0${position + 1}`,
    rowStatus: "active",
  };
}

for (const authenticCount of [1, 2, 3, 4]) {
  const authenticItems = fixture.words
    .slice(0, authenticCount)
    .map((word, index) => item(word.canonicalWordId, index));
  const selection = selectDynamicAffixWordLab({
    profiles: [fixture.profile],
    learningItems: authenticItems,
  });
  assert(selection);
  const payload = compileDynamicAffixWordLabPayloadLegacy(selection);
  assert(payload);
  const productionItems: DynamicAffixCompletionItem[] = payload.words.lesson.map((word) => ({
    canonicalWordId: word.canonicalWordId,
    adleLearningItemRef: word.source === "authentic"
      ? authenticItems.find((entry) => entry.canonicalWordId === word.canonicalWordId)!.learningItemId
      : null,
    promptData: { source: word.source },
  }));
  const policy = deriveDynamicAffixCompletionPolicy({
    allItems: [{
      promptData: {
        dynamicAffixActivityId: "intro-root",
        dynamicAffixLesson: payload,
      },
    }],
    productionItems,
  });
  assert(policy.ok);
  assert.deepEqual(policy.scheduledCanonicalWordIds, payload.authenticCanonicalWordIds);
  assert(policy.wordPolicies.every((word) => word.evidenceEligible && word.rewardEligible));
  assert.equal(policy.wordPolicies.filter((word) => word.scheduleEligible).length, authenticCount);
  assert.equal(policy.wordPolicies.filter((word) => word.learningItemTransitionEligible).length, authenticCount);

  const producedWords = payload.words.lesson.map((word) => ({
    canonicalWordId: word.canonicalWordId,
    attemptText: word.displayWord,
    correct: true,
  }));
  const completion = onLessonCompleted(REVIEW_POLICY_V1, {
    childId,
    microSkillKey: payload.microSkillId,
    completedOn: "2026-08-06",
    sourceRef: `lesson:${childId}:2026-08-06:${payload.microSkillId}:${authenticCount}`,
    bundleId: `bundle-${authenticCount}`,
    producedWords,
    wordPolicies: policy.wordPolicies,
    learningItems: authenticItems,
    scheduleAllProducedWords: true,
  });
  assert.equal(completion.taughtEvents.length, 4, "every lesson word is evidence-bearing");
  assert.deepEqual(
    completion.scheduleWords.map((word) => word.canonicalWordId),
    payload.authenticCanonicalWordIds,
    "only authentic words enter the review schedule",
  );
  assert.deepEqual(
    completion.itemTransitions.map((entry) => entry.canonicalWordId),
    payload.authenticCanonicalWordIds,
    "only authentic learning items transition",
  );
  for (const transfer of payload.words.lesson.filter((word) => word.source === "transfer")) {
    assert(!completion.scheduleWords.some((row) => row.canonicalWordId === transfer.canonicalWordId));
    assert(!completion.itemTransitions.some((row) => row.canonicalWordId === transfer.canonicalWordId));
    const taught = completion.taughtEvents.filter((event) => event.canonicalWordId === transfer.canonicalWordId);
    assert.equal(taught.length, 1);
    const pricing = priceWordEvidence(EVIDENCE_POLICY_V1, {
      childId,
      canonicalWordId: transfer.canonicalWordId,
      normalisedWord: transfer.displayWord,
      skillFamilyKey: "D4_MOR",
      outcomeEvents: [],
      taughtHistory: taught,
      authenticUseEvents: [],
      slippageEvents: [],
    });
    assert.equal(pricing.score, 0.75);
    assert.equal(pricing.entries.length, 1);
    const state = computeWordEvidenceState(EVIDENCE_POLICY_V1, pricing, {
      outcomeEvents: [],
      taughtHistory: taught,
      slippageEvents: [],
    });
    assert.equal(state.state, "active");
    assert.equal(stateCredit(PROFICIENCY_POLICY_V1, state.state), 0.1);

    const coverAndDictation = priceWordEvidence(EVIDENCE_POLICY_V1, {
      childId,
      canonicalWordId: transfer.canonicalWordId,
      normalisedWord: transfer.displayWord,
      skillFamilyKey: "D4_MOR",
      outcomeEvents: [],
      taughtHistory: [
        ...taught,
        { ...taught[0]!, sourceRef: `${taught[0]!.sourceRef}:duplicate-attempt` },
      ],
      authenticUseEvents: [],
      slippageEvents: [],
    });
    assert.equal(coverAndDictation.score, 0.75);
    assert.equal(coverAndDictation.entries.length, 2);
    assert.equal(coverAndDictation.entries.filter((entry) => entry.weight === 0.75).length, 1);
    assert.equal(coverAndDictation.entries.filter((entry) => entry.capApplied === "session_cap").length, 1);
  }
}

const oneAuthentic = selectDynamicAffixWordLab({
  profiles: [fixture.profile],
  learningItems: [item(fixture.words[0]!.canonicalWordId, 0)],
})!;
const onePayload = compileDynamicAffixWordLabPayloadLegacy(oneAuthentic)!;
const validItems: DynamicAffixCompletionItem[] = onePayload.words.lesson.map((word) => ({
  canonicalWordId: word.canonicalWordId,
  adleLearningItemRef: word.source === "authentic" ? "authentic-item" : null,
  promptData: {},
}));
const allItems = [{ promptData: { dynamicAffixActivityId: "intro-root", dynamicAffixLesson: onePayload } }];
const transferIndex = validItems.findIndex((entry) => entry.adleLearningItemRef === null);
const badTransferRef = structuredClone(validItems);
badTransferRef[transferIndex]!.adleLearningItemRef = "forbidden-transfer-item";
assert.deepEqual(
  deriveDynamicAffixCompletionPolicy({ allItems, productionItems: badTransferRef }),
  { ok: false, blockerCode: "completion_role_mismatch" },
);
const reordered = structuredClone(validItems).reverse();
assert.deepEqual(
  deriveDynamicAffixCompletionPolicy({ allItems, productionItems: reordered }),
  { ok: false, blockerCode: "completion_role_mismatch" },
);
const roleDrift = structuredClone(onePayload);
roleDrift.words.lesson[transferIndex]!.source = "authentic";
assert.deepEqual(
  deriveDynamicAffixCompletionPolicy({
    allItems: [{ promptData: { dynamicAffixActivityId: "intro-root", dynamicAffixLesson: roleDrift } }],
    productionItems: validItems,
  }),
  { ok: false, blockerCode: "completion_role_mismatch" },
);

const completionAction = readFileSync("app/learn/week/adle/actions.ts", "utf8");
assert(completionAction.includes("deriveDynamicAffixCompletionPolicy"));
assert(completionAction.includes("scheduleAllProducedWords: dynamicSuffix !== null"));
assert(completionAction.includes("dynamicAffixCompletionPolicy.wordPolicies"));

console.log(JSON.stringify({
  status: "passed",
  authenticTransferShapes: 4,
  evidencePerWord: 0.75,
  transferBreadthWhenEligible: 0.1,
  completionRoleMismatchCases: 3,
  rewardPolicy: "all_lesson_words",
}));
