import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolvePersistedLessonRoute,
  type LessonRouteResolutionItem,
  type LessonRouteRuntimeContext,
} from "../lib/adle/composable-lesson/route-resolution";
import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";

const enabled: LessonRouteRuntimeContext = {
  dynamicPrefixEnabled: true,
  dynamicAffixEnabled: true,
  baseWordFamilyEnabled: true,
};

const genericItems: LessonRouteResolutionItem[] = [
  {
    id: "generic-intro",
    sectionKey: "lesson_intro",
    templateKey: "MICRO_READ_ONLY_INTRO",
    canonicalWordId: null,
    targetWord: null,
    promptData: {},
  },
];

const legacyGeneric = resolvePersistedLessonRoute({
  lessonRouteMetadata: null,
  items: genericItems,
  runtimeContext: enabled,
});
assert.equal(legacyGeneric.status, "resolved_legacy");
assert(
  legacyGeneric.runtime.adapterKey === "generic_composer_v1",
);

const explicitGeneric = resolvePersistedLessonRoute({
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  items: genericItems,
  runtimeContext: enabled,
});
assert.equal(explicitGeneric.status, "resolved_explicit");
assert(
  explicitGeneric.runtime.rendererKey === "generic_session",
);

function blocker(
  metadata: unknown,
  items: readonly LessonRouteResolutionItem[] = genericItems,
) {
  const result = resolvePersistedLessonRoute({
    lessonRouteMetadata: metadata,
    items,
    runtimeContext: enabled,
  });
  assert.equal(result.status, "blocked");
  return result.status === "blocked"
    ? result.blockers.map((entry) => entry.code)
    : [];
}

assert(blocker({}).includes("malformed_metadata"));
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    metadataSchemaVersion: 3,
  }).includes("unsupported_metadata_schema_version"),
);
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    route: { routeId: "unknown_route", routeVersion: "v1" },
  }).includes("unknown_route"),
);
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    route: { routeId: "generic_composer", routeVersion: "v999" },
  }).includes("unsupported_route_version"),
);
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    recipe: { recipeKey: "wrong", recipeVersion: "v1" },
  }).includes("recipe_mismatch"),
);
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    payload: { kind: "dynamic_affix_lesson_v3", version: 3 },
  }).includes("payload_kind_mismatch"),
);
assert(
  blocker({
    ...createPersistedRouteMetadata("generic_composer"),
    payload: { kind: "composed_daily_plan", version: 99 },
  }).includes("payload_version_mismatch"),
);
assert(
  blocker(
    createPersistedRouteMetadata("dynamic_prefix_word_lab"),
    genericItems,
  ).includes("root_item_missing"),
);
assert(
  blocker(
    createPersistedRouteMetadata("dynamic_prefix_word_lab"),
    [
      {
        ...genericItems[0],
        promptData: {
          dynamicPrefixActivityId: "intro-root",
          dynamicPrefixLesson: {},
        },
      },
      {
        ...genericItems[0],
        id: "duplicate-prefix-root",
        promptData: {
          dynamicPrefixActivityId: "intro-root",
          dynamicPrefixLesson: {},
        },
      },
    ],
  ).includes("root_item_duplicate"),
);
assert(
  blocker(
    createPersistedRouteMetadata("generic_composer"),
    genericItems.map((item) => ({
      ...item,
      itemMetadata: { lessonRouteMetadata: {} },
    })),
  ).includes("duplicate_metadata_source"),
);
assert(
  blocker(createPersistedRouteMetadata("generic_composer"), [
    {
      ...genericItems[0],
      promptData: {
        dynamicPrefixActivityId: "intro-root",
        dynamicPrefixLesson: {},
      },
    },
  ]).includes("explicit_legacy_disagreement"),
);
assert(
  blocker(null, [
    {
      ...genericItems[0],
      promptData: {
        dynamicPrefixActivityId: "intro-root",
        dynamicPrefixLesson: {},
      },
    },
    {
      ...genericItems[0],
      id: "affix-root",
      promptData: {
        dynamicAffixActivityId: "intro-root",
        dynamicAffixLesson: {},
      },
    },
  ]).includes("multiple_legacy_routes"),
);
assert(
  blocker(null, [
    {
      ...genericItems[0],
      promptData: {
        dynamicPrefixActivityId: "intro-root",
        dynamicPrefixLesson: {},
      },
    },
  ]).includes("persisted_payload_malformed"),
  "a recognised corrupt historical payload never falls through to generic",
);

const pageSource = readFileSync("app/learn/week/adle/page.tsx", "utf8");
const actionSource = readFileSync("app/learn/week/adle/actions.ts", "utf8");
const runnerSource = readFileSync("components/adle-session-runner.tsx", "utf8");
assert(pageSource.includes("This Word Lab needs a grown-up check before it can continue."));
assert(pageSource.includes("routeResolution?.status === \"blocked\""));
assert(runnerSource.includes("props.routeResolution") && !runnerSource.includes("closedCompoundActivityId === \"intro-root\""));
const lessonCompletion = actionSource.slice(actionSource.indexOf("export async function completeAdleLessonPartAction"));
assert(lessonCompletion.indexOf("resolvePersistedLessonRoute") < lessonCompletion.indexOf("parseAttempts(formData"));
assert(lessonCompletion.indexOf("resolvePersistedLessonRoute") < lessonCompletion.indexOf("insertAssignmentAttemptEvents"));
const reviewCompletion = actionSource.slice(
  actionSource.indexOf("export async function completeAdleReviewPartAction"),
  actionSource.indexOf("export async function completeAdleLessonPartAction"),
);
for (const completion of [reviewCompletion, lessonCompletion]) {
  assert(completion.includes("blockInvalidGenericSnapshot(context, readModel)"));
  assert(completion.indexOf("blockInvalidGenericSnapshot(context, readModel)") < completion.indexOf("parseAttempts(formData"));
  assert(completion.includes("items: allSessionItems(readModel)"));
}
const blockerHelper = actionSource.slice(
  actionSource.indexOf("function blockInvalidGenericSnapshot"),
  actionSource.indexOf("function withParam"),
);
assert(blockerHelper.includes('genericSnapshotResolution?.status === "blocked"'));
for (const forbiddenWrite of [
  "insertAssignmentAttemptEvents",
  "persistLessonCompletion",
  "persistReviewSessionCompletion",
  "markItemsCompleted",
  "scheduleLessonReward",
]) assert(!blockerHelper.includes(forbiddenWrite), `snapshot blocker performs zero ${forbiddenWrite} writes`);

console.log("ADLE route resolution regression passed.");
