import assert from "node:assert/strict";

import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import type { ComposedDailyPlan, DailyPlanFacts, PlanItemCandidate } from "../lib/adle/daily-assignment-composer";
import { authorCompleteGenericSnapshotV3, evaluateNoSpecialistGenericSnapshotV3Boundary } from "../lib/adle/composable-lesson/generic-snapshot-v3-forward-authoring";
import { compileGenericLessonSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-compiler";
import { persistGuardedGenericSnapshotV3, type GenericSnapshotJsonPersistencePort } from "../lib/adle/composable-lesson/generic-snapshot-v3-persistence";
import {
  ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV,
  ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV,
  selectProductionGenericSnapshotV3Writer,
} from "../lib/adle/composable-lesson/generic-snapshot-writer-rollout";

const CHILD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PARENT = "33333333-3333-4333-8333-333333333333";
const DATE = "2026-08-23";
const SKILL = "D3_GENERIC_TEST";
const FAMILY = "D3_GENERIC";
const WORD_ID = "44444444-4444-4444-8444-444444444444";

function rawItem(templateKey: string, sectionKey = "guided_practice"): PlanItemCandidate {
  return {
    position: 1, sectionKey, templateKey, microSkillKey: SKILL,
    canonicalWordId: WORD_ID, targetWord: "helpful", learningItemId: "learning-1",
    payload: {}, expectedEvidenceKind: null, provenance: "d3-test",
  };
}

function rawPlan(overrides: Partial<ComposedDailyPlan["partTwo"]> = {}): ComposedDailyPlan {
  return {
    childId: CHILD, planDate: DATE, lessonRouteMetadata: null,
    composerPolicyVersion: "composer-v1", schedulePolicyVersion: "schedule-v1",
    throttle: {} as ComposedDailyPlan["throttle"],
    partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
    partTwo: {
      composed: true, microSkillKey: SKILL, selectionAudit: [],
      lessonWords: [{ canonicalWordId: WORD_ID, provenance: "learning_item", learningItemId: "learning-1", complexityLevel: 1 }],
      probePlan: null, stretchItemIntakes: [],
      sections: [{ sectionKey: "guided_practice", purpose: "Memory", items: [rawItem("MEMORY_CUE")] }],
      skips: [], ...overrides,
    },
    budget: { budgetResponses: 12, estimatedResponses: 5, guidedWordCount: 1, introTrimmed: false, trims: [] },
  };
}

function facts(): DailyPlanFacts {
  return {
    childId: CHILD,
    reviewPolicy: { schedulePolicyVersion: "schedule-v1" },
    composerPolicy: { composerPolicyVersion: "composer-v1" },
    bundles: [], scheduleWords: [], reviewWordFacts: new Map(),
    familyMethods: [{ familyKey: FAMILY, familyName: "Generic", guidedQuestionSequence: ["MEMORY_CUE"], reviewSortDimension: "", productionTask: "", contentVersion: "family-v1", rowStatus: "active" }],
    activityTemplates: [
      { templateKey: "MEMORY_CUE", phase: "guided", minWordsRequired: 1, requiresSentenceContext: false, requiresContrastWords: false, evidenceKind: "guided", childFacingCopy: "Write a memory cue for this word.", purpose: "Memory", childResponse: "text", contentVersion: "memory-v1", rowStatus: "active" },
      { templateKey: "LESSON_REFLECTION", phase: "reflection", minWordsRequired: 1, requiresSentenceContext: false, requiresContrastWords: false, evidenceKind: "reflection", childFacingCopy: "What helped you spell this word?", purpose: "Reflect", childResponse: "text", contentVersion: "reflection-v1", rowStatus: "active" },
    ],
    teachingContent: new Map([[SKILL, { microSkillKey: SKILL, teachingObjective: "What helped you spell this word?", childFriendlyExplanation: "Notice the whole word.", ruleExplanation: "Look carefully at every part.", commonMisconceptions: "Do not miss a letter.", contentVersion: "teaching-v1", sourceRowHash: "teaching-hash" }]]),
    genericV3Dictation: new Map([[WORD_ID, { canonicalWordId: WORD_ID, sentence: "The helpful child smiled.", audioText: "The helpful child smiled.", targetTokenIndex: 1, sourceRowHash: "dictation-hash" }]]),
    genericV3Reflection: new Map([[SKILL, { microSkillKey: SKILL, authorityKind: "reflection_prompt", promptKey: "d3-generic-reflection-v1", promptText: "What helped you spell this word?", contentVersion: "reflection-v1", sourceRowHash: "reflection-hash" }]]),
    skillFamilyKeyBySkill: new Map([[SKILL, FAMILY]]), learningItems: [], prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(), previousLessonFamilyKey: null,
    dictionary: {
      words: [{ canonicalWordId: WORD_ID, wordKey: "helpful", normalisedWord: "helpful", displayWord: "helpful", rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "middle_primary" }],
      supports: [], bandings: [], overrides: [], activeBandingVersion: { bandingVersion: "banding-v1", isActive: true, levelCount: 3 },
      activeTeachingSkillKeys: new Set([SKILL]),
    },
    childBand: { allowedFrequencyBands: ["high"], allowedAgeBands: ["middle_primary"] },
    taughtHistory: { wasTaught: () => false }, probeRuns: [], probeMissWordIdsToday: [],
  } as unknown as DailyPlanFacts;
}

async function main() {
  assert.equal(selectProductionGenericSnapshotV3Writer({ childId: CHILD }), null);
  assert.equal(selectProductionGenericSnapshotV3Writer({ childId: CHILD, mode: "off", currentLearnerChildId: CHILD }), null);
  assert.equal(selectProductionGenericSnapshotV3Writer({ childId: CHILD, mode: "unknown", currentLearnerChildId: CHILD }), null);
  assert.equal(selectProductionGenericSnapshotV3Writer({ childId: CHILD, mode: "on_for_current_learner", currentLearnerChildId: "not-a-uuid" }), null);
  assert.equal(selectProductionGenericSnapshotV3Writer({ childId: OTHER, mode: "on_for_current_learner", currentLearnerChildId: CHILD }), null);
  const authorization = selectProductionGenericSnapshotV3Writer({ childId: CHILD, mode: "on_for_current_learner", currentLearnerChildId: CHILD });
  assert(authorization);
  let authorCalls = 0;
  assert.deepEqual(evaluateNoSpecialistGenericSnapshotV3Boundary({
    authorization: null,
    author: () => { authorCalls += 1; return { ok: false, blockerCode: "generic_v3_no_lesson_composed" }; },
  }), { authorization: null, authoring: null, blockerCode: "no_active_specialist_route" });
  assert.equal(authorCalls, 0, "OFF must not invoke generic composition or authoring");

  const eligibleFacts = facts();
  const eligible = authorCompleteGenericSnapshotV3(eligibleFacts, rawPlan());
  assert(eligible.ok);
  if (!eligible.ok) throw new Error("expected eligible D3 plan");
  assert.deepEqual(eligible.plan.partTwo.sections.map((section) => section.sectionKey), [
    "lesson_intro", "guided_practice", "lesson_production", "lesson_dictation", "lesson_reflection",
  ]);
  assert.equal(eligible.plan.partTwo.sections[0].items.length, 1, "Meet the Words remains inside TeachingPages");
  assert.equal(eligible.plan.partTwo.sections.at(-1)?.items.length, 1);
  assert(!eligible.plan.partTwo.sections.flatMap((section) => section.items).some((item) => item.templateKey !== "CANONICAL_ACTIVITY_V3"));

  const unsupported = authorCompleteGenericSnapshotV3(eligibleFacts, rawPlan({ sections: [{ sectionKey: "guided_practice", purpose: "Old", items: [rawItem("TYPED_PROMPT")] }] }));
  assert.deepEqual(unsupported, { ok: false, blockerCode: "generic_v3_unsupported_activity" });
  const probe = authorCompleteGenericSnapshotV3(eligibleFacts, rawPlan({ probePlan: { canonicalWordIds: [WORD_ID] } as unknown as ComposedDailyPlan["partTwo"]["probePlan"] }));
  assert.deepEqual(probe, { ok: false, blockerCode: "generic_v3_required_dictation_replaced_by_probe" });
  const reviewPlan = rawPlan();
  reviewPlan.partOne.sections = [{ sectionKey: "review_quick_sort", purpose: "Review", items: [rawItem("REVIEW_QUICK_SORT", "review_quick_sort")] }];
  assert.deepEqual(authorCompleteGenericSnapshotV3(eligibleFacts, reviewPlan), { ok: false, blockerCode: "generic_v3_review_activity_unsupported" });
  const incompleteFacts = facts();
  incompleteFacts.genericV3Dictation = new Map();
  assert.deepEqual(authorCompleteGenericSnapshotV3(incompleteFacts, rawPlan()), { ok: false, blockerCode: "generic_v3_authored_content_incomplete" });
  const noReflectionAuthority = facts();
  noReflectionAuthority.genericV3Reflection = new Map();
  assert.deepEqual(authorCompleteGenericSnapshotV3(noReflectionAuthority, rawPlan()), { ok: false, blockerCode: "generic_v3_authored_content_incomplete" });

  const persistence = planAssignmentPersistence(eligible.plan, { parentUserId: PARENT, existingHeaders: [], generationTrigger: "parent_manual" });
  assert(persistence.action === "insert" && persistence.header);
  const compiler = { facts: eligibleFacts, plan: eligible.plan, persistence: persistence as typeof persistence & { action: "insert"; header: NonNullable<typeof persistence.header> } };
  const first = compileGenericLessonSnapshotV3(compiler);
  const second = compileGenericLessonSnapshotV3(compiler);
  assert(first.ok && second.ok);
  if (!first.ok || !second.ok) throw new Error("expected compilation");
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.equal(first.snapshot.provenance.sourceFingerprint, second.snapshot.provenance.sourceFingerprint);
  const reflectionActivity = first.snapshot.activities.find((activity) => activity.canonical.concept === "LESSON_REFLECTION");
  assert(reflectionActivity);
  assert.equal(reflectionActivity.payload.prompt, "What helped you spell this word?");
  assert.deepEqual(reflectionActivity.payload.promptSource, {
    kind: "teaching_content",
    contentRefId: `teaching_content:${SKILL}:reflection:d3-generic-reflection-v1:reflection-v1`,
    contentVersion: "reflection-v1",
    promptKey: "d3-generic-reflection-v1",
    sourceRowHash: "reflection-hash",
  });
  assert(first.snapshot.contentVersions.some((entry) =>
    entry.contentRefId === `teaching_content:${SKILL}:reflection:d3-generic-reflection-v1:reflection-v1`
    && entry.sourceRowHash === "reflection-hash"));

  let writes = 0;
  const port: GenericSnapshotJsonPersistencePort = { persist: async () => { writes += 1; return "55555555-5555-4555-8555-555555555555"; } };
  await assert.rejects(persistGuardedGenericSnapshotV3(port, {
    environment: "production", parentUserId: PARENT, childId: CHILD, planDate: DATE,
    header: persistence.header, items: persistence.items, intakes: persistence.learningItemIntakes, snapshot: first.snapshot,
  }), /Production persistence is not authorised/);
  assert.equal(writes, 0);

  const previousMode = process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV];
  const previousChild = process.env[ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV];
  process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV] = "on_for_current_learner";
  process.env[ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV] = CHILD;
  try {
    await persistGuardedGenericSnapshotV3(port, {
      environment: "production", productionAuthorization: authorization,
      parentUserId: PARENT, childId: CHILD, planDate: DATE,
      header: persistence.header, items: persistence.items, intakes: persistence.learningItemIntakes, snapshot: first.snapshot,
    });
  } finally {
    if (previousMode === undefined) delete process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV]; else process.env[ADLE_GENERIC_SNAPSHOT_V3_WRITER_MODE_ENV] = previousMode;
    if (previousChild === undefined) delete process.env[ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV]; else process.env[ADLE_GENERIC_SNAPSHOT_V3_CURRENT_LEARNER_CHILD_ID_ENV] = previousChild;
  }
  assert.equal(writes, 1);
  console.log("PASS: D3 exact-learner OFF/ON selector, fail-closed eligibility, deterministic v3 authoring and Production authorization");
}

void main();
