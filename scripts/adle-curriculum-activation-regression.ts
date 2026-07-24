import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  ADLE_LESSON_ROUTE_REGISTRY,
  getAdleLessonRouteDefinition,
} from "../lib/adle/lesson-route-registry";
import { validateAdleCurriculumImportManifest } from "../lib/adle/curriculum-import-manifest";
import { loadAdleLessonRouteActivations } from "../lib/adle/loaders/lesson-route-activations";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE_SKILLS = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
] as const;
const base = getAdleLessonRouteDefinition("base_word_family_v1");
assert(base, "Base Word Lab route must be registered");
for (const skill of BASE_SKILLS) {
  const ready = base.validateReadiness({
    microSkillKey: skill,
    payloadVersion: 1,
    authenticTargetCount: 2,
    practiceWordCount: 6,
    transferWordCount: 4,
    sharedCurriculumComplete: true,
    routeCurriculumComplete: true,
  });
  assert.equal(ready.status, "ready", `${skill} is compatible with the Base Word Lab route`);
}
assert.equal(base.validateReadiness({
  microSkillKey: BASE_SKILLS[0],
  payloadVersion: 1,
  authenticTargetCount: 1,
  practiceWordCount: 6,
  transferWordCount: 5,
  sharedCurriculumComplete: true,
  routeCurriculumComplete: true,
}).status, "blocked", "Base Word Lab keeps its two-authentic/four-transfer contract");

const generic = getAdleLessonRouteDefinition("generic_first_exposure_v1");
assert(generic);
assert.equal(generic.validateReadiness({
  microSkillKey: "D4_PAT_SAMPLE",
  payloadVersion: 1,
  authenticTargetCount: 1,
  practiceWordCount: 5,
  transferWordCount: 0,
  sharedCurriculumComplete: true,
  routeCurriculumComplete: true,
}).status, "ready", "generic first-exposure keeps its five-word contract");

const validManifest = {
  schemaVersion: 1,
  manifestKey: "base-word-production-v1",
  sourcePackagePath: "data/adle/approved/d4-mor/v1/d4-mor-v1-manifest.json",
  sourcePackageSha256: "a".repeat(64),
  approvalRefs: ["review:2026-07-23"],
  excludedBatchStatuses: ["in_review"],
  artifacts: [{
    artifactKind: "teaching_content",
    path: "data/adle/approved/d4-mor/v1/d4-mor-v1-content.json",
    sha256: "b".repeat(64),
    rowCount: 24,
  }],
  routes: BASE_SKILLS.map((microSkillKey) => ({
    microSkillKey,
    lessonRouteKey: "base_word_family_v1",
    payloadVersion: 1,
    requestedStatus: "production_enabled",
    contentVersion: "d4-mor-base-word-family-v2",
    importBatchId: "11111111-1111-4111-8111-111111111111",
    readinessReport: { ready: true },
  })),
};
assert.equal(validateAdleCurriculumImportManifest(validManifest).valid, true);
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  excludedBatchStatuses: [],
}).valid, false, "in_review batch exclusion is mandatory");
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  routes: [{ ...validManifest.routes[0], lessonRouteKey: "invented_route" }],
}).valid, false, "unregistered routes are rejected");

const migration = readFileSync(
  "supabase/migrations/20260723100000_add_adle_curriculum_route_activations.sql",
  "utf8",
);
assert(migration.includes("adle_lesson_route_activations"));
assert(migration.includes("apply_adle_curriculum_activation_manifest_v1"));
assert(migration.includes("production_enabled"));
assert(migration.includes("excludedBatchStatuses"));
assert(migration.includes("security definer"));
assert(migration.includes("enable row level security"), "activation tables enable RLS");
assert(migration.includes("revoke all on public.adle_curriculum_import_manifests from public, anon, authenticated"), "manifest table is not public");
assert(migration.includes("revoke all on public.adle_lesson_route_activations from public, anon, authenticated"), "activation table is not public");
assert(migration.includes("grant select, insert, update on public.adle_lesson_route_activations to service_role"), "only service role receives activation writes");
assert(migration.includes("on conflict (environment_key, manifest_sha256) do nothing"), "manifest replay has an idempotent identity");
assert(migration.includes("set row_status = 'superseded'"), "route changes retain history instead of deleting activation rows");
assert(migration.includes("requestedStatus' = 'paused'"), "rollback is represented as a paused activation state");
assert.equal(ADLE_LESSON_ROUTE_REGISTRY.size, 3);

const intakeLoader = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const baseLoader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
assert(intakeLoader.includes("loadAdleLessonRouteActivations"));
assert(baseLoader.includes("adle_route_not_production_enabled"));
const productionCli = readFileSync("scripts/adle-curriculum-production.ts", "utf8");
assert(productionCli.includes("assertProductionApplyDisabled();"), "production CLI always checks the disabled-apply boundary first");
assert(productionCli.includes('assert(!process.argv.includes("--apply")'), "production CLI rejects --apply while this programme is under review");

function activationQueryClient(error: { code: string; message: string }): SupabaseClient {
  return {
    from: (table: string) => {
      assert.equal(table, "adle_lesson_route_activations");
      return {
        select: () => ({
          in: () => ({
            eq: () => ({
              eq: async () => ({
                data: null,
                error,
              }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}
async function verifyMissingActivationTableFailsClosed(): Promise<void> {
  assert.deepEqual(
    await loadAdleLessonRouteActivations(activationQueryClient({
      code: "42P01",
      message: 'relation "adle_lesson_route_activations" does not exist',
    }), {
      microSkillKeys: BASE_SKILLS,
      environmentKey: "production",
    }),
    [],
    "an unapplied activation migration fails closed as no enabled routes",
  );
  await assert.rejects(
    () => loadAdleLessonRouteActivations(activationQueryClient({
      code: "42501",
      message: "permission denied for table adle_lesson_route_activations",
    }), { microSkillKeys: BASE_SKILLS, environmentKey: "production" }),
    /permission denied/,
    "a permission failure must not be hidden as an unavailable migration",
  );
  console.log("adle-curriculum-activation-regression: ok");
}

verifyMissingActivationTableFailsClosed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
