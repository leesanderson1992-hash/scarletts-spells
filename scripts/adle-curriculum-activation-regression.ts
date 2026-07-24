import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  ADLE_LESSON_ROUTE_REGISTRY,
  getAdleLessonRouteDefinition,
} from "../lib/adle/lesson-route-registry";
import { validateAdleCurriculumImportManifest } from "../lib/adle/curriculum-import-manifest";
import { loadAdleLessonRouteActivations } from "../lib/adle/loaders/lesson-route-activations";
import { loadBaseWordFamilyPilotReadiness } from "../lib/adle/loaders/base-word-family-pilot-loader";
import { parseAdleRouteActivationEnvironment } from "../lib/adle/route-activation-environment";
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

assert.equal(getAdleLessonRouteDefinition("generic_first_exposure_v1"), null, "routes without runtime consumers cannot be activated");
assert.equal(getAdleLessonRouteDefinition("review_v1"), null, "review activation remains deferred until its runtime consumer exists");

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
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  routes: [{ ...validManifest.routes[0], payloadVersion: 2 }],
}).valid, false, "unsupported payload versions are rejected");
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  routes: [{ ...validManifest.routes[0], lessonRouteKey: "generic_first_exposure_v1" }],
}).valid, false, "routes without consumers are rejected");
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  approvalRefs: [],
}).valid, false, "manifest approval references are mandatory");
assert.equal(validateAdleCurriculumImportManifest({
  ...validManifest,
  routes: [{ ...validManifest.routes[0], contentImportBatchId: "not-a-uuid" }],
}).valid, false, "a staging content-batch reference must be a UUID");

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
assert(migration.includes("manifest_file_sha256"), "raw manifest file provenance is retained separately");
assert(migration.includes("manifest_payload_sha256"), "database-owned canonical payload digest is stored");
assert(migration.includes("extensions.digest(convert_to(p_manifest::text"), "database computes the canonical payload digest");
assert(migration.includes("on conflict (environment_key, manifest_payload_sha256) do nothing"), "manifest replay has a payload-bound idempotent identity");
const stagingContentReferenceMigration = readFileSync(
  "supabase/migrations/20260724110000_allow_staging_existing_approved_activation_content.sql",
  "utf8",
);
assert(stagingContentReferenceMigration.includes("p_environment_key <> 'staging' and v_content_import_batch_id <> v_import_batch_id"), "only staging can borrow content from another batch");
assert(migration.includes("set row_status = 'superseded'"), "route changes retain history instead of deleting activation rows");
assert(migration.includes("requestedStatus' = 'paused'"), "rollback is represented as a paused activation state");
assert.equal(ADLE_LESSON_ROUTE_REGISTRY.size, 1, "only Base Word has an activation consumer");

const intakeLoader = readFileSync("lib/adle/loaders/canonical-intake-live.ts", "utf8");
const baseLoader = readFileSync("lib/adle/loaders/base-word-family-pilot-loader.ts", "utf8");
const activationLoader = readFileSync("lib/adle/loaders/lesson-route-activations.ts", "utf8");
const baseWordReadModel = readFileSync("lib/adle/loaders/base-word-family-lesson-read-model.ts", "utf8");
assert(intakeLoader.includes("loadAdleLessonRouteActivations"));
assert(baseLoader.includes("adle_route_not_production_enabled"));
assert(intakeLoader.includes("resolveAdleRouteActivationEnvironment"));
assert(baseLoader.includes("resolveAdleRouteActivationEnvironment"));
assert(activationLoader.includes("import_manifest_id") && activationLoader.includes("import_batch_id"), "activation resolution binds a route to its immutable manifest batch");
assert(baseLoader.includes("activation.importBatchId"), "Base Word selection scopes family facts to the enabled manifest batch");
assert(baseWordReadModel.includes('.eq("import_batch_id", request.importBatchId)'), "Base Word payload compilation cannot read families from another active batch");
const productionCli = readFileSync("scripts/adle-curriculum-production.ts", "utf8");
assert(productionCli.includes("assertProductionApplyDisabled();"), "production CLI always checks the disabled-apply boundary first");
assert(productionCli.includes('assert(!process.argv.includes("--apply")'), "production CLI rejects --apply while this programme is under review");
assert(productionCli.includes("p_manifest_file_sha256"), "CLI passes file provenance under its explicit RPC name");

assert.equal(parseAdleRouteActivationEnvironment(undefined), null, "unset activation environment is default-off");
assert.equal(parseAdleRouteActivationEnvironment("invalid"), null, "invalid activation environment is default-off");
assert.equal(parseAdleRouteActivationEnvironment("staging"), "staging", "staging activation environment is explicit");

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

function activationQueryClientWithFilters(filters: Array<[string, unknown]>): SupabaseClient {
  return {
    from: (table: string) => {
      assert.equal(table, "adle_lesson_route_activations");
      return {
        select: () => ({
          in: () => ({
            eq: (column: string, value: unknown) => {
              filters.push([column, value]);
              return {
                eq: async (rowStatusColumn: string, rowStatusValue: unknown) => {
                  filters.push([rowStatusColumn, rowStatusValue]);
                  return { data: [], error: null };
                },
              };
            },
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
  assert.deepEqual(
    await loadAdleLessonRouteActivations(activationQueryClient({
      code: "PGRST205",
      message: "Could not find the table 'public.adle_lesson_route_activations' in the schema cache",
    }), {
      microSkillKeys: BASE_SKILLS,
      environmentKey: "staging",
    }),
    [],
    "a PostgREST table-not-found response also fails closed",
  );
  await assert.rejects(
    () => loadAdleLessonRouteActivations(activationQueryClient({
      code: "42501",
      message: "permission denied for table adle_lesson_route_activations",
    }), { microSkillKeys: BASE_SKILLS, environmentKey: "production" }),
    /permission denied/,
    "a permission failure must not be hidden as an unavailable migration",
  );
  const filters: Array<[string, unknown]> = [];
  await loadAdleLessonRouteActivations(activationQueryClientWithFilters(filters), {
    microSkillKeys: BASE_SKILLS,
    environmentKey: "staging",
  });
  assert.deepEqual(filters, [["environment_key", "staging"], ["row_status", "active"]], "staging reads only staging activation rows");

  const savedEnvironment = process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT;
  delete process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT;
  try {
    const noQueryClient = {
      from: () => { throw new Error("activation environment default-off must not query"); },
    } as unknown as SupabaseClient;
    assert.deepEqual(
      await loadBaseWordFamilyPilotReadiness({
        client: noQueryClient,
        childId: "fixture-child",
        planDate: "2026-07-24",
      }),
      { payload: null, readinessReason: "adle_route_activation_environment_not_configured" },
      "Base Word stays blocked without an explicit activation environment",
    );
  } finally {
    if (savedEnvironment === undefined) delete process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT;
    else process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = savedEnvironment;
  }
  console.log("adle-curriculum-activation-regression: ok");
}

verifyMissingActivationTableFailsClosed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
