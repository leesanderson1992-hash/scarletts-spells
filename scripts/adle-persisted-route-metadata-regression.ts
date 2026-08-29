import assert from "node:assert/strict";

import {
  ADLE_NEW_ASSIGNMENT_ROUTE_IDS,
  createPersistedRouteMetadata,
  createPersistedRouteMetadataV2,
  parsePersistedLessonRouteMetadata,
  validatePersistedRouteMetadataCompatibility,
} from "../lib/adle/composable-lesson/persisted-route-metadata";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "../lib/adle/curriculum-readiness/route-registry";
import { ADLE_IMPLEMENTED_RUNTIME_ADAPTER_KEYS } from "../lib/adle/composable-lesson/route-resolution";

const expected = {
  generic_composer: {
    route: "v1",
    recipe: "generic_first_exposure:v1",
    payload: "composed_daily_plan:1",
  },
  dynamic_prefix_word_lab: {
    route: "v2",
    recipe: "dynamic_prefix_word_lab:v2",
    payload: "dynamic_prefix_lesson_v2:2",
  },
  dynamic_affix_word_lab: {
    route: "v3",
    recipe: "dynamic_affix_word_lab:v3",
    payload: "dynamic_affix_lesson_v3:3",
  },
  base_word_lab: {
    route: "v2",
    recipe: "base_word_family:v1",
    payload: "base_word_family_snapshot_v1:1",
  },
  compound_word_lab: {
    route: "v2",
    recipe: "compound_word_lab:v2",
    payload: "compound_word_lesson_v2:2",
  },
} as const;

assert.deepEqual(
  [...ADLE_NEW_ASSIGNMENT_ROUTE_IDS].sort(),
  Object.keys(expected).sort(),
);

for (const routeId of ADLE_NEW_ASSIGNMENT_ROUTE_IDS) {
  const metadata = createPersistedRouteMetadata(routeId);
  assert.equal(metadata.metadataSchemaVersion, 1);
  assert.equal(metadata.route.routeId, routeId);
  assert.equal(metadata.route.routeVersion, expected[routeId].route);
  assert.equal(
    `${metadata.recipe.recipeKey}:${metadata.recipe.recipeVersion}`,
    expected[routeId].recipe,
  );
  assert.equal(
    `${metadata.payload.kind}:${metadata.payload.version}`,
    expected[routeId].payload,
  );
  assert.deepEqual(parsePersistedLessonRouteMetadata(metadata), {
    ok: true,
    metadata,
  });
  assert.deepEqual(validatePersistedRouteMetadataCompatibility(metadata), {
    ok: true,
  });
}

assert(!ADLE_CURRICULUM_ROUTE_REGISTRY.some((route) => route.routeId === "fixed_un_prefix_word_lab"));
assert(!ADLE_CURRICULUM_ROUTE_REGISTRY.some((route) => route.routeId === "closed_compound_word_lab"));
assert.deepEqual(
  [...new Set(ADLE_CURRICULUM_ROUTE_REGISTRY.map((route) => route.runtimeAdapterKey))].sort(),
  [...ADLE_IMPLEMENTED_RUNTIME_ADAPTER_KEYS].sort(),
  "every canonical route adapter has exactly one runtime implementation",
);

assert.equal(
  parsePersistedLessonRouteMetadata(null).ok,
  false,
  "the parser accepts only a complete non-null document",
);
assert.deepEqual(
  parsePersistedLessonRouteMetadata({
    ...createPersistedRouteMetadata("generic_composer"),
    metadataSchemaVersion: 3,
  }),
  { ok: false, blocker: "unsupported_metadata_schema_version" },
);

const releaseAuthority = {
  activationRevisionId: "11111111-1111-4111-8111-111111111111",
  releaseManifestId: "22222222-2222-4222-8222-222222222222",
  releaseKey: "base-word-v2-release-fixture",
  releaseManifestSha256: "a".repeat(64),
  dependencyFingerprint: "b".repeat(64),
};
const v2 = createPersistedRouteMetadataV2("base_word_lab", releaseAuthority);
assert.equal(v2.metadataSchemaVersion, 2);
assert.deepEqual(v2.curriculumRelease, releaseAuthority);
assert.deepEqual(parsePersistedLessonRouteMetadata(v2), { ok: true, metadata: v2 });
assert.deepEqual(validatePersistedRouteMetadataCompatibility(v2), { ok: true });
assert.throws(
  () => createPersistedRouteMetadataV2("generic_composer", releaseAuthority),
  /has not adopted curriculum release authority/,
  "existing routes cannot emit release metadata before governed adoption",
);
assert.equal(
  parsePersistedLessonRouteMetadata({
    ...v2,
    curriculumRelease: { ...releaseAuthority, dependencyFingerprint: "invalid" },
  }).ok,
  false,
  "metadata v2 fails closed on malformed release provenance",
);
assert.equal(
  parsePersistedLessonRouteMetadata({
    ...createPersistedRouteMetadata("generic_composer"),
    route: { routeId: "generic_composer" },
  }).ok,
  false,
);
assert.deepEqual(
  validatePersistedRouteMetadataCompatibility({
    ...createPersistedRouteMetadata("generic_composer"),
    route: { routeId: "generic_composer", routeVersion: "v999" },
  }),
  { ok: false, blocker: "unsupported_route_version" },
);
assert.deepEqual(
  validatePersistedRouteMetadataCompatibility({
    ...createPersistedRouteMetadata("generic_composer"),
    recipe: { recipeKey: "wrong", recipeVersion: "v1" },
  }),
  { ok: false, blocker: "recipe_mismatch" },
);
assert.deepEqual(
  validatePersistedRouteMetadataCompatibility({
    ...createPersistedRouteMetadata("generic_composer"),
    payload: { kind: "dynamic_affix_lesson_v3", version: 3 },
  }),
  { ok: false, blocker: "payload_kind_mismatch" },
);

console.log("ADLE persisted route metadata regression passed.");
