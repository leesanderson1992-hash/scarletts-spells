import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { resolveGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-reader";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { buildDynamicPrefixAssignmentPlan } from "../lib/adle/morphology/dynamic-prefix-assignment-plan";
import {
  compileDynamicPrefixWordLabPayload,
  selectDynamicPrefixWordLab,
  type DynamicPrefixProfile,
} from "../lib/adle/morphology/dynamic-prefix-word-lab";
import type { ComposedDailyPlan, DailyPlanFacts } from "../lib/adle/daily-assignment-composer";
import { getAdleDailyPlanReadModel } from "../lib/adle/loaders/daily-plan-surface";
import {
  DAILY_PLAN_HEADER_BASELINE_PROJECTION,
  DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION,
  detectDailyPlanSnapshotCapability,
  getCachedDailyPlanSnapshotCapability,
  isDeferredDailyPlanSnapshotColumnError,
  resetDailyPlanSnapshotCapabilityCacheForTests,
} from "../lib/adle/loaders/daily-plan-snapshot-capability";

async function main() {
const oldSnapshotMode = process.env.ADLE_GENERIC_SNAPSHOT_MODE;
const oldSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.ADLE_GENERIC_SNAPSHOT_MODE;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://snapshot-compatibility.test";

function makeWord(id: string, displayWord: string) {
  const sentence = `Use ${displayWord}.`;
  return {
    canonicalWordId: id,
    displayWord,
    audioText: sentence,
    baseWord: displayWord.slice(2),
    baseMeaning: "base",
    derivedMeaning: "derived",
    effect: "not" as const,
    parts: [
      { id: `${id}:p`, text: "un", sourceText: "un", role: "prefix" as const, start: 0, end: 2 },
      { id: `${id}:b`, text: displayWord.slice(2), sourceText: displayWord.slice(2), role: "base" as const, start: 2, end: displayWord.length },
    ],
    joins: [{ afterPartId: `${id}:p`, beforePartId: `${id}:b`, joinType: "none" as const }],
    splitPoints: [2],
    dictationSentence: sentence,
    dictationTargetTokenIndex: 1,
    approvedTransfer: true,
  };
}

function prefixPlan(): ComposedDailyPlan {
  const profile: DynamicPrefixProfile = {
    microSkillKey: "D4_MOR_PREFIXES_UN",
    productionEnabled: true,
    prefixText: "un",
    prefixLabel: "un-",
    prefixMeaning: "not",
    meaningBins: [
      { id: "not", label: "NOT", description: "not" },
      { id: "reverse", label: "REVERSE", description: "reverse" },
    ],
    wordsByCanonicalId: new Map(
      [
        makeWord("authentic", "unfair"),
        makeWord("transfer-1", "unkind"),
        makeWord("transfer-2", "untidy"),
        makeWord("transfer-3", "unwell"),
      ].map((word) => [word.canonicalWordId, word]),
    ),
    transferCanonicalWordIds: ["transfer-1", "transfer-2", "transfer-3"],
    prefixChoices: [{ text: "un", label: "un-", outcome: "correct", meaning: "not", status: "target" }],
    reflection: { promptKey: "fixture", promptText: "What changed?" },
  };
  const selection = selectDynamicPrefixWordLab({
    profiles: [profile],
    learningItems: [{
      learningItemId: "learning-authentic",
      childId: "child",
      canonicalWordId: "authentic",
      microSkillKey: profile.microSkillKey,
      itemStatus: "pending",
      sourceKind: "verified_misspelling",
      sourceRef: "source",
      sourceAttemptText: null,
      reteachPriority: false,
      ejectedOn: null,
      intakeOn: "2026-08-05",
      rowStatus: "active",
    }],
  });
  assert(selection);
  const payload = compileDynamicPrefixWordLabPayload(selection);
  assert(payload);
  const base = {
    childId: "child",
    planDate: "2026-08-05",
    composerPolicyVersion: "fixture",
    schedulePolicyVersion: "fixture",
    throttle: {},
    partOne: {},
    partTwo: {},
    budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
  } as unknown as ComposedDailyPlan;
  return buildDynamicPrefixAssignmentPlan({
    basePlan: base,
    facts: {} as DailyPlanFacts,
    selection,
    payload,
  });
}

type CapabilityError = { code: string; message: string };

function fakeClient(input: {
  capabilityError: CapabilityError | null;
  header: Record<string, unknown>;
  items: Record<string, unknown>[];
}) {
  const projections: string[] = [];
  let probeCount = 0;
  const client = {
    from(table: string) {
      return {
        select(projection: string) {
          projections.push(`${table}:${projection}`);
          if (table === "daily_assignments" && projection === "compiled_lesson_snapshot") {
            return {
              async limit() {
                probeCount += 1;
                return { data: [], error: input.capabilityError };
              },
            };
          }
          const query = {
            eq() { return query; },
            async maybeSingle() { return { data: input.header, error: null }; },
            async order() { return { data: input.items, error: null }; },
          };
          return query;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, projections, probeCount: () => probeCount };
}

const exactPostgresError = {
  code: "42703",
  message: "column daily_assignments.compiled_lesson_snapshot does not exist",
};
const exactPostgrestError = {
  code: "PGRST204",
  message: "Could not find the 'compiled_lesson_snapshot' column of 'daily_assignments' in the schema cache",
};
assert(isDeferredDailyPlanSnapshotColumnError(exactPostgresError));
assert(isDeferredDailyPlanSnapshotColumnError(exactPostgrestError));
for (const error of [
  { code: "42703", message: "column daily_assignments.lesson_route_metadata does not exist" },
  { code: "42703", message: "column other.compiled_lesson_snapshot does not exist" },
  { code: "42501", message: "permission denied for table daily_assignments" },
  { code: "PGRST301", message: "connection error" },
  { code: "PGRST100", message: "malformed query" },
]) {
  assert.equal(isDeferredDailyPlanSnapshotColumnError(error), false);
  await assert.rejects(
    detectDailyPlanSnapshotCapability({ mode: "off", probe: async () => ({ error }) }),
    new RegExp(error.code),
  );
}
assert.deepEqual(
  await detectDailyPlanSnapshotCapability({ mode: "observe", probe: async () => ({ error: exactPostgresError }) }),
  { genericSnapshotColumn: "deferred_absent" },
  "capability detection stays factual; the assignment route decides whether the column is required",
);

resetDailyPlanSnapshotCapabilityCacheForTests();
let cachedProbeCount = 0;
const cachedProbe = async () => {
  cachedProbeCount += 1;
  return { error: exactPostgresError };
};
await Promise.all([
  getCachedDailyPlanSnapshotCapability({ mode: "off", cacheKey: "same-db", probe: cachedProbe }),
  getCachedDailyPlanSnapshotCapability({ mode: "off", cacheKey: "same-db", probe: cachedProbe }),
]);
assert.equal(cachedProbeCount, 1, "one capability probe is shared per database/mode process cache");

const plan = prefixPlan();
const planItems = plan.partTwo.sections.flatMap((section) => section.items);
const rows = planItems.map((item) => ({
  id: `item-${item.position}`,
  source_entity_id: `source-${item.position}`,
  position: item.position,
  status: "pending",
  template_key: item.templateKey,
  target_word: item.targetWord,
  prompt_data: item.payload,
  metadata: {
    sectionKey: item.sectionKey,
    canonicalWordId: item.canonicalWordId,
    microSkillKey: item.microSkillKey,
    adleLearningItemRef: item.learningItemId,
  },
}));

resetDailyPlanSnapshotCapabilityCacheForTests();
const withoutColumn = fakeClient({
  capabilityError: exactPostgresError,
  header: {
    lesson_route_metadata: plan.lessonRouteMetadata,
    assignment_generation_source: "adle_composer_v1",
  },
  items: rows,
});
const compatibleRead = await getAdleDailyPlanReadModel({
  userClient: withoutColumn.client,
  parentUserId: "parent",
  childId: "child",
  planDate: "2026-08-05",
  assignmentId: "assignment",
});
assert.deepEqual(compatibleRead.snapshotCapability, { genericSnapshotColumn: "deferred_absent" });
assert.equal(compatibleRead.compiledLessonSnapshot, undefined);
assert.equal(compatibleRead.state, "ready");
assert(withoutColumn.projections.includes(`daily_assignments:${DAILY_PLAN_HEADER_BASELINE_PROJECTION}`));
assert(!withoutColumn.projections.includes(`daily_assignments:${DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION}`));
assert.equal(withoutColumn.probeCount(), 1);
await getAdleDailyPlanReadModel({
  userClient: withoutColumn.client,
  parentUserId: "parent",
  childId: "child",
  planDate: "2026-08-05",
  assignmentId: "assignment",
});
assert.equal(withoutColumn.probeCount(), 1, "the absent-column probe is not repeated once cached");
const routeItems = [...compatibleRead.partOne.items, ...compatibleRead.partTwo.items];
const prefixRoute = resolvePersistedLessonRoute({
  lessonRouteMetadata: compatibleRead.lessonRouteMetadata,
  items: routeItems,
  runtimeContext: {
    morphologyUnEnabled: true,
    dynamicPrefixEnabled: true,
    dynamicAffixEnabled: false,
    baseWordFamilyEnabled: true,
  },
});
assert.equal(prefixRoute.status, "resolved_explicit");
assert.equal(prefixRoute.runtime.adapterKey, "dynamic_prefix_v2");
assert.equal(compatibleRead.genericSnapshotResolution, null, "Prefix never invokes the Generic Snapshot reader");

resetDailyPlanSnapshotCapabilityCacheForTests();
const withColumn = fakeClient({
  capabilityError: null,
  header: {
    lesson_route_metadata: plan.lessonRouteMetadata,
    assignment_generation_source: "adle_composer_v1",
    compiled_lesson_snapshot: null,
  },
  items: rows,
});
const completeRead = await getAdleDailyPlanReadModel({
  userClient: withColumn.client,
  parentUserId: "parent",
  childId: "child",
  planDate: "2026-08-05",
  assignmentId: "assignment",
});
assert.deepEqual(completeRead.snapshotCapability, { genericSnapshotColumn: "available" });
assert.equal(completeRead.compiledLessonSnapshot, null);
assert(withColumn.projections.includes(`daily_assignments:${DAILY_PLAN_HEADER_SNAPSHOT_PROJECTION}`));

const legacyItem = {
  id: "legacy",
  sourceEntityId: "legacy",
  sectionKey: "lesson_production",
  templateKey: "CONTROLLED_SPELLING",
  position: 1,
  status: "pending",
  targetWord: "word",
  canonicalWordId: "word",
  microSkillKey: "skill",
  adleLearningItemRef: null,
  promptData: {},
};
const legacyRow = {
  id: legacyItem.id,
  source_entity_id: legacyItem.sourceEntityId,
  position: legacyItem.position,
  status: legacyItem.status,
  template_key: legacyItem.templateKey,
  target_word: legacyItem.targetWord,
  prompt_data: legacyItem.promptData,
  metadata: {
    sectionKey: legacyItem.sectionKey,
    canonicalWordId: legacyItem.canonicalWordId,
    microSkillKey: legacyItem.microSkillKey,
  },
};
process.env.ADLE_GENERIC_SNAPSHOT_MODE = "enforce";
resetDailyPlanSnapshotCapabilityCacheForTests();
const requiredGenericClient = fakeClient({
  capabilityError: exactPostgresError,
  header: {
    lesson_route_metadata: createPersistedRouteMetadata("generic_composer"),
    assignment_generation_source: "adle_composer_v1",
  },
  items: [legacyRow],
});
const requiredGenericRead = await getAdleDailyPlanReadModel({
  userClient: requiredGenericClient.client,
  parentUserId: "parent",
  childId: "child",
  planDate: "2026-08-05",
  assignmentId: "generic-assignment",
});
assert.equal(requiredGenericRead.genericSnapshotResolution?.status, "blocked");
assert(
  requiredGenericRead.genericSnapshotResolution?.status === "blocked" &&
  requiredGenericRead.genericSnapshotResolution.blockers[0]?.code === "snapshot_column_unavailable",
  "an explicit Generic Snapshot assignment fails closed when its required column is unavailable",
);
delete process.env.ADLE_GENERIC_SNAPSHOT_MODE;
assert.equal(
  resolveGenericLessonSnapshot({
    mode: "off",
    lessonRouteMetadata: null,
    assignmentGenerationSource: "adle_composer_v1",
    compiledLessonSnapshot: undefined,
    items: [legacyItem],
    snapshotColumn: "deferred_absent",
    requiresSnapshot: false,
  }).status,
  "compatibility",
  "authorized metadata-free historical generic assignments remain readable",
);
const requiredSnapshot = resolveGenericLessonSnapshot({
  mode: "enforce",
  lessonRouteMetadata: null,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: undefined,
  items: [legacyItem],
  snapshotColumn: "deferred_absent",
  requiresSnapshot: true,
});
assert.equal(requiredSnapshot.status, "blocked");
assert(requiredSnapshot.status === "blocked" && requiredSnapshot.blockers[0]?.code === "snapshot_column_unavailable");

if (oldSnapshotMode === undefined) delete process.env.ADLE_GENERIC_SNAPSHOT_MODE;
else process.env.ADLE_GENERIC_SNAPSHOT_MODE = oldSnapshotMode;
if (oldSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
else process.env.NEXT_PUBLIC_SUPABASE_URL = oldSupabaseUrl;

console.log("ADLE daily-plan optional snapshot column compatibility regression passed.");
}

void main();
