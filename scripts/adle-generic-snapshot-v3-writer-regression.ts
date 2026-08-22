import assert from "node:assert/strict";

import {
  canonicalActivityContractKey,
  listCanonicalActivityRendererRegistrations,
  loadCanonicalActivityRenderer,
} from "../components/adle/activities/canonical-renderer-registry";
import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import type { ComposedDailyPlan, DailyPlanFacts, PlanItemCandidate } from "../lib/adle/daily-assignment-composer";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { compileGenericLessonSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-compiler";
import type { CompiledLessonSnapshotV3, GenericCanonicalActivityAuthoringV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-contracts";
import {
  persistGuardedGenericSnapshotV3,
  persistGuardedGenericSnapshotV3ToSupabase,
  type GenericSnapshotJsonPersistencePort,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-persistence";
import { GENERIC_SNAPSHOT_V3_WRITER_ENABLED } from "../lib/adle/composable-lesson/generic-snapshot-v3-registry";
import { compileAndPersistGuardedGenericSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-writer";
import { selectGenericSnapshotWriter } from "../lib/adle/composable-lesson/generic-snapshot-writer-rollout";
import { resolveGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-reader";
import { fingerprintCompiledLessonSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-validator";
import { normalizeGenericActivitySequence } from "../lib/adle/generic-activity-compatibility";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";

const CHILD = "child-v3-writer-proof";
const PARENT = "parent-v3-writer-proof";
const PLAN_DATE = "2026-08-22";
const SKILL = "D4_AFFIX_FUL";
const FAMILY = "D4_AFFIX";
const WORD_ID = "word-helpful";
const WORD = "helpful";
const CONTENT_VERSION = "approved-affix-ful-v1";
const TEACHING_REF = `teaching_content:${SKILL}:${CONTENT_VERSION}`;

function authoring(input: Omit<GenericCanonicalActivityAuthoringV3, "schemaVersion">): GenericCanonicalActivityAuthoringV3 {
  return { schemaVersion: 3, ...input };
}

function candidate(input: {
  position: number;
  sectionKey: string;
  canonicalWordId: string | null;
  targetWord: string | null;
  activity: GenericCanonicalActivityAuthoringV3;
}): PlanItemCandidate {
  return {
    position: input.position,
    sectionKey: input.sectionKey,
    templateKey: "CANONICAL_ACTIVITY_V3",
    canonicalWordId: input.canonicalWordId,
    targetWord: input.targetWord,
    microSkillKey: SKILL,
    payload: { canonicalActivityV3: input.activity },
    learningItemId: input.canonicalWordId ? "learning-helpful" : null,
    expectedEvidenceKind: null,
    provenance: "canonical_v3_writer_proof",
  };
}

const activities = [
  candidate({
    position: 1, sectionKey: "lesson_intro", canonicalWordId: null, targetWord: null,
    activity: authoring({
      label: "Teaching", canonical: { concept: "INTRODUCTION", mode: "teaching_page", contractVersion: 1 }, canonicalWordIds: [WORD_ID],
      payload: {
        config: {
          pages: [{ id: "teaching-1", type: "teaching", title: "The suffix -ful", paragraphs: ["The suffix -ful means full of."] }],
          meetWords: { words: [{ id: WORD_ID, word: WORD, provenance: CONTENT_VERSION }] },
        },
        progression: { kind: "first_impression_sequence", meetWordsPosition: "final" },
      },
    }),
  }),
  candidate({
    position: 2, sectionKey: "guided_practice", canonicalWordId: null, targetWord: null,
    activity: authoring({
      label: "Meaning", canonical: { concept: "MEANING_MATCH", mode: "word_to_definition", contractVersion: 1 }, canonicalWordIds: [WORD_ID],
      payload: { targets: [{ canonicalWordId: WORD_ID, word: WORD, definition: "giving help" }] },
    }),
  }),
  candidate({
    position: 3, sectionKey: "lesson_production", canonicalWordId: WORD_ID, targetWord: WORD,
    activity: authoring({
      label: "Cover", canonical: { concept: "COVER_CHECK", mode: "whole_word", contractVersion: 1 }, canonicalWordIds: [WORD_ID],
      payload: { canonicalWordId: WORD_ID, word: WORD, splitPoints: [4], components: ["help", "ful"] },
    }),
  }),
  candidate({
    position: 4, sectionKey: "lesson_dictation", canonicalWordId: WORD_ID, targetWord: WORD,
    activity: authoring({
      label: "Dictation", canonical: { concept: "DICTATION", mode: "whole_sentence", contractVersion: 1 }, canonicalWordIds: [WORD_ID],
      payload: { canonicalWordId: WORD_ID, targetWord: WORD, audioText: "The helpful child smiled.", correctSentence: "The helpful child smiled.", targetBinding: { kind: "token", tokenIndex: 1 } },
    }),
  }),
  candidate({
    position: 5, sectionKey: "lesson_reflection", canonicalWordId: null, targetWord: null,
    activity: authoring({
      label: "Reflection", canonical: { concept: "LESSON_REFLECTION", mode: "standard_lesson_reflection", contractVersion: 1 }, canonicalWordIds: [],
      payload: {
        prompt: "What did you learn about spelling with -ful?",
        promptSource: { kind: "teaching_content", contentRefId: TEACHING_REF, contentVersion: CONTENT_VERSION, promptKey: "affix-ful-reflection-v1" },
        mistakeSummary: { kind: "normalized_lesson_attempts", sections: ["lesson_production", "lesson_dictation"] },
        sentenceComparison: { kind: "feedback_only", enabled: true, spellingEvidence: false },
        responseBinding: { kind: "learning_reflection", field: "learningReflection" },
        resumeBinding: { kind: "assignment_activity_session" },
        completionBoundary: "part_submission",
      },
    }),
  }),
];

const plan: ComposedDailyPlan = {
  childId: CHILD,
  planDate: PLAN_DATE,
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  composerPolicyVersion: "composer-v1",
  schedulePolicyVersion: "schedule-v1",
  throttle: {} as ComposedDailyPlan["throttle"],
  partOne: { dueQueue: [], presentationOrder: [], sections: [], skips: [] },
  partTwo: {
    composed: true,
    microSkillKey: SKILL,
    selectionAudit: [],
    lessonWords: [{ canonicalWordId: WORD_ID, provenance: "learning_item", learningItemId: "learning-helpful", complexityLevel: 1 }],
    probePlan: null,
    stretchItemIntakes: [],
    sections: [
      { sectionKey: "lesson_intro", purpose: "Teach", items: [activities[0]] },
      { sectionKey: "guided_practice", purpose: "Meaning", items: [activities[1]] },
      { sectionKey: "lesson_production", purpose: "Cover", items: [activities[2]] },
      { sectionKey: "lesson_dictation", purpose: "Dictation", items: [activities[3]] },
      { sectionKey: "lesson_reflection", purpose: "Reflection", items: [activities[4]] },
    ],
    skips: [],
  },
  budget: { budgetResponses: 12, estimatedResponses: 5, guidedWordCount: 1, introTrimmed: false, trims: [] },
};

const facts = {
  childId: CHILD,
  reviewPolicy: { schedulePolicyVersion: "schedule-v1" },
  composerPolicy: { composerPolicyVersion: "composer-v1" },
  bundles: [], scheduleWords: [], reviewWordFacts: new Map(),
  familyMethods: [{ familyKey: FAMILY, familyName: "Affixes", guidedQuestionSequence: [], reviewSortDimension: "", productionTask: "", contentVersion: "family-v1", rowStatus: "active" }],
  activityTemplates: [],
  teachingContent: new Map([[SKILL, { microSkillKey: SKILL, teachingObjective: "Use -ful", childFriendlyExplanation: "-ful means full of", ruleExplanation: "Keep the base word visible", commonMisconceptions: "Check the join", contentVersion: CONTENT_VERSION, sourceRowHash: "content-hash" }]]),
  skillFamilyKeyBySkill: new Map([[SKILL, FAMILY]]),
  learningItems: [], prerequisiteKeysBySkill: new Map(), frequencyBandByWordId: new Map(), previousLessonFamilyKey: null,
  dictionary: {
    words: [{ canonicalWordId: WORD_ID, wordKey: "helpful", normalisedWord: WORD, displayWord: WORD, rowStatus: "active", reviewStatus: "approved_for_first_exposure", frequencyBand: "high", ageBand: "middle_primary" }],
    supports: [], bandings: [], overrides: [],
    activeBandingVersion: { bandingVersion: "banding-v1", isActive: true, levelCount: 3 },
    activeTeachingSkillKeys: new Set([SKILL]),
  },
  childBand: { allowedFrequencyBands: ["high"], allowedAgeBands: ["middle_primary"] },
  taughtHistory: { wasTaught: () => false }, probeRuns: [], probeMissWordIdsToday: [],
} as unknown as DailyPlanFacts;

const persistence = planAssignmentPersistence(plan, { parentUserId: PARENT, existingHeaders: [] });
assert(persistence.action === "insert" && persistence.header);
const compilerInput = { facts, plan, persistence: persistence as typeof persistence & { action: "insert"; header: NonNullable<typeof persistence.header> } };

assert.equal(GENERIC_SNAPSHOT_V3_WRITER_ENABLED, false, "the deployed default remains OFF");
assert.equal(selectGenericSnapshotWriter({ snapshotMode: "enforce", childId: CHILD }), "v2");
assert.equal(selectGenericSnapshotWriter({ snapshotMode: "enforce", childId: CHILD, rollout: "guarded_non_production", childIds: CHILD, nodeEnv: "production" }), "v2");
assert.equal(selectGenericSnapshotWriter({ snapshotMode: "enforce", childId: CHILD, rollout: "guarded_non_production", childIds: CHILD, nodeEnv: "test" }), "v3_guarded_non_production");

const first = compileGenericLessonSnapshotV3(compilerInput);
const second = compileGenericLessonSnapshotV3(compilerInput);
assert(first.ok && second.ok);
if (!first.ok || !second.ok) throw new Error("expected deterministic v3 compilation to succeed");
assert.deepEqual(second.snapshot, first.snapshot, "v3 compiler output is deterministic");
const compiledSnapshot = first.snapshot;

type Stored = Parameters<GenericSnapshotJsonPersistencePort["persist"]>[0];
let stored: Stored | null = null;
let writes = 0;
const port: GenericSnapshotJsonPersistencePort = {
  async persist(input) {
    writes += 1;
    stored = structuredClone(input);
    return "81818181-8181-4181-8181-818181818181";
  },
};

async function main() {
  await assert.rejects(
    compileAndPersistGuardedGenericSnapshotV3({
      rollout: { snapshotMode: "enforce", childId: CHILD, nodeEnv: "test" },
      environment: "test",
      compiler: compilerInput,
      port,
    }),
    /rollout selector is not enabled/,
  );
  assert.equal(writes, 0, "default-off selection cannot reach the persistence port");

  const result = await compileAndPersistGuardedGenericSnapshotV3({
    rollout: { snapshotMode: "enforce", childId: CHILD, rollout: "guarded_non_production", childIds: CHILD, nodeEnv: "test" },
    environment: "test",
    compiler: compilerInput,
    port,
  });
  assert.equal(result.assignmentId, "81818181-8181-4181-8181-818181818181");
  assert.equal(writes, 1);
  assert(stored);
  const persisted = stored as Stored;
  assert.equal(persisted.compiledLessonSnapshot.snapshotSchemaVersion, 3);
  assert.equal(persisted.compiledLessonSnapshot.provenance.sourceFingerprint, result.sourceFingerprint);

  const sessionItems: AdleSessionItem[] = persisted.items.map((item, index) => ({
    id: `item-${index + 1}`,
    sourceEntityId: item.sourceEntityId,
    sectionKey: item.metadata.sectionKey,
    templateKey: item.templateKey,
    position: item.position,
    status: item.status,
    targetWord: item.targetWord,
    canonicalWordId: item.metadata.canonicalWordId,
    microSkillKey: item.metadata.microSkillKey,
    adleLearningItemRef: item.metadata.adleLearningItemRef,
    promptData: item.promptData,
    itemMetadata: item.metadata,
  }));
  const readback = resolveGenericLessonSnapshot({
    mode: "enforce",
    lessonRouteMetadata: persisted.header.lessonRouteMetadata,
    assignmentGenerationSource: persisted.header.assignmentGenerationSource,
    compiledLessonSnapshot: persisted.compiledLessonSnapshot,
    items: sessionItems,
  });
  assert.equal(readback.status, "resolved");
  if (readback.status !== "resolved") throw new Error("readback failed");
  assert.equal(readback.source, "snapshot_v3");
  const normalized = normalizeGenericActivitySequence(readback.items);
  assert(normalized.every((entry) => entry.status === "normalized"));
  const specs = normalized.flatMap((entry) => entry.status === "normalized" ? [entry.spec] : []);
  assert.deepEqual(specs.map((spec) => `${spec.concept}.${spec.mode}@${spec.contractVersion}`), [
    "INTRODUCTION.teaching_page@1",
    "MEANING_MATCH.word_to_definition@1",
    "COVER_CHECK.whole_word@1",
    "DICTATION.whole_sentence@1",
    "LESSON_REFLECTION.standard_lesson_reflection@1",
  ]);
  const registered = new Set(listCanonicalActivityRendererRegistrations().map(canonicalActivityContractKey));
  for (const spec of specs) {
    const key = canonicalActivityContractKey(spec);
    assert(registered.has(key), `${key} must render through the canonical registry`);
    assert.equal(typeof await loadCanonicalActivityRenderer(spec), "function", `${key} renderer must load`);
  }

  const malformed = structuredClone(compiledSnapshot as CompiledLessonSnapshotV3);
  delete (malformed.activities[0].payload as Record<string, unknown>).config;
  await assert.rejects(
    persistGuardedGenericSnapshotV3(port, {
      environment: "test", parentUserId: PARENT, childId: CHILD, planDate: PLAN_DATE,
      header: persistence.header!, items: persistence.items, intakes: persistence.learningItemIntakes,
      snapshot: malformed,
    }),
    /validation/,
  );
  assert.equal(writes, 1, "invalid snapshots are rejected before persistence");

  const missingAuthored = structuredClone(persistence);
  delete missingAuthored.items[0].promptData.canonicalActivityV3;
  const missingResult = compileGenericLessonSnapshotV3({ ...compilerInput, persistence: missingAuthored as typeof compilerInput.persistence });
  assert(missingResult.ok === false && missingResult.blockers.some((entry) => entry.code === "missing_authored_content"));

  const unsupported = structuredClone(persistence);
  const unsupportedEnvelope = unsupported.items[0].promptData.canonicalActivityV3 as GenericCanonicalActivityAuthoringV3;
  unsupportedEnvelope.canonical = { concept: "PHONEME_GRAPHEME", mode: "mapping", contractVersion: 1 };
  const unsupportedResult = compileGenericLessonSnapshotV3({ ...compilerInput, persistence: unsupported as typeof compilerInput.persistence });
  assert(unsupportedResult.ok === false && unsupportedResult.blockers.some((entry) => entry.code === "unsupported_canonical_contract"));
  assert.equal(writes, 1, "unsupported contracts cannot reach the persistence port");

  let rpcCalls = 0;
  const rpcClient = {
    async rpc() {
      rpcCalls += 1;
      return { data: "91919191-9191-4191-8191-919191919191", error: null };
    },
  };
  await assert.rejects(
    persistGuardedGenericSnapshotV3ToSupabase(
      rpcClient as never,
      {
        environment: "test",
        parentUserId: PARENT,
        childId: CHILD,
        planDate: PLAN_DATE,
        header: persistence.header!,
        items: persistence.items,
        intakes: persistence.learningItemIntakes,
        snapshot: malformed,
      },
    ),
    /validation/,
  );
  assert.equal(rpcCalls, 0, "pedagogically malformed payloads are rejected before the RPC");
  const unsupportedSnapshot = structuredClone(compiledSnapshot);
  unsupportedSnapshot.activities[0].canonical = {
    concept: "NOT_FORWARD_AUTHORISED",
    mode: "structurally_valid",
    contractVersion: 1,
  };
  const unsupportedProvenance = structuredClone(unsupportedSnapshot.provenance);
  delete (unsupportedProvenance as Partial<typeof unsupportedSnapshot.provenance>).sourceFingerprint;
  unsupportedSnapshot.provenance.sourceFingerprint = fingerprintCompiledLessonSnapshotV3({
    ...unsupportedSnapshot,
    provenance: unsupportedProvenance,
  });
  await assert.rejects(
    persistGuardedGenericSnapshotV3ToSupabase(
      rpcClient as never,
      {
        environment: "test",
        parentUserId: PARENT,
        childId: CHILD,
        planDate: PLAN_DATE,
        header: persistence.header!,
        items: persistence.items,
        intakes: persistence.learningItemIntakes,
        snapshot: unsupportedSnapshot,
      },
    ),
    /unsupported_canonical_contract/,
  );
  assert.equal(rpcCalls, 0, "application canonical validation rejects unsupported contracts before the RPC");

  const supabaseResult = await persistGuardedGenericSnapshotV3ToSupabase(
    rpcClient as never,
    {
      environment: "test",
      parentUserId: PARENT,
      childId: CHILD,
      planDate: PLAN_DATE,
      header: persistence.header!,
      items: persistence.items,
      intakes: persistence.learningItemIntakes,
      snapshot: compiledSnapshot,
    },
  );
  assert.equal(supabaseResult.assignmentId, "91919191-9191-4191-8191-919191919191");
  assert.equal(rpcCalls, 1, "valid canonical content reaches the explicit v3 RPC exactly once");

  console.log("PASS: v3 writer compiler (10-contract gate, deterministic compile, guarded Supabase persistence, readback, canonical registry render, pre-write fail-closed, Production=v2)");
}

void main();
