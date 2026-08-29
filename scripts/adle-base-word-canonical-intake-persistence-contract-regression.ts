import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260809150000_integrate_base_word_release_authority.sql", "utf8");
const clusterOwnershipMigration = readFileSync(
  "supabase/migrations/20260810160000_generalise_base_word_cluster_route_authority.sql",
  "utf8",
);
const baseLedMigration = readFileSync(
  "supabase/migrations/20260810201000_bind_base_led_family_selection.sql",
  "utf8",
);
const proof = readFileSync("scripts/sql/prove-adle-base-word-canonical-intake-local.sql", "utf8");
const runner = readFileSync("scripts/prove-adle-base-word-canonical-intake-local.ts", "utf8");

const argumentsBlock = migration.match(/create function public\.adle_persist_canonical_intake\(([\s\S]*?)\)\s*returns table/)?.[1];
assert(argumentsBlock);
assert.equal(argumentsBlock.match(/^\s*p_[a-z0-9_]+\s+(?:uuid|text|date)(?: default null)?,?$/gm)?.length, 15);
assert.match(argumentsBlock, /p_route_activation_id uuid default null/);
assert.match(argumentsBlock, /p_release_manifest_id uuid default null/);
assert.match(argumentsBlock, /p_release_manifest_sha256 text default null/);
assert.match(argumentsBlock, /p_dependency_fingerprint text default null/);
assert.match(migration, /v_is_base_word boolean := p_micro_skill_key in \([\s\S]*D4_MOR_BASE_WORDS_IDENTIFY_BASE[\s\S]*D4_MOR_BASE_WORDS_PRESERVE_BASE/);
assert.match(migration, /Base Word candidate must request base_word_lab:v2/);
assert.match(migration, /adle_route_activation_revision_is_current_v2/);
assert.match(migration, /revision\.activation_status = 'enabled'/);
assert.match(migration, /family_authority\.semantic_projection/);
assert.match(migration, /member->>'memberRole' = 'authentic_target'/);
assert.match(migration, /closure_word\.canonical_word_id = p_canonical_word_id/);
assert.match(migration, /for share of head, revision, release, skill/);
assert.match(migration, /v_route_id := 'base_word_lab';[\s\S]*v_route_version := 'v2'/);
assert.match(clusterOwnershipMigration, /skill\.skill_cluster_key = 'D4_MOR_BASE_WORDS'/);
assert.match(clusterOwnershipMigration, /adle_micro_skill_owns_base_word_lab_v2\(p_micro_skill_key\)/);
assert.match(clusterOwnershipMigration, /canonical-intake Base Word ownership guard differs from the reviewed predecessor/);
assert.match(clusterOwnershipMigration, /D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX/);
assert.match(clusterOwnershipMigration, /D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX/);
assert.match(clusterOwnershipMigration, /D4_MOR_PREFIXES_UN/);
assert.match(baseLedMigration, /family_authority\.schema_version = 1/);
assert.match(baseLedMigration, /family_authority\.schema_version = 2/);
assert.match(baseLedMigration, /reviewed family relationship/);
assert.match(baseLedMigration, /queued_family_practice/);
assert.match(baseLedMigration, /generated_family_practice/);
assert.match(baseLedMigration, /item\.item_status in \('pending','pending_reteach'\)/, "v2 assignment persistence rejects learner items that are no longer selectable");
assert.doesNotMatch(
  clusterOwnershipMigration,
  /update\s+public\.(parent_verified_spelling_candidate_mappings|adle_learning_items|learning_items)/i,
  "route generalisation must not rewrite historical learner lineage",
);

for (const preserved of [
  "Dynamic Affix candidate must request dynamic_affix_word_lab:v3",
  "Dynamic Prefix candidate requested an invalid route",
  "generic candidate requested an invalid route",
  "pg_advisory_xact_lock",
  "canonical intake candidate identity is no longer approved",
  "'pending'",
  "'verified_misspelling'",
  "adle_learning_item_sources",
  "adle_canonical_intake_candidate_demands",
  "adle_canonical_intake_demands demand",
  "adle_canonical_intake_reconciliation_queue",
  "'candidate_activated'",
]) assert.ok(migration.includes(preserved), `BW-0 contract lost: ${preserved}`);
assert.match(migration, /revoke all on function public\.adle_persist_canonical_intake\([\s\S]*from public,\s*anon,\s*authenticated/);
assert.match(migration, /grant execute on function public\.adle_persist_canonical_intake\([\s\S]*to service_role/);
assert.doesNotMatch(migration, /alter table public\.adle_learning_items[\s\S]*(route_id|route_version)/i);

assert.match(proof, /^begin;/m);
assert.match(proof, /^rollback;/m);
assert.match(proof, /adle_seed_canonical_intake_candidate/);
assert.match(proof, /Base Word cluster route ownership proof failed/);
assert.match(proof, /canonical-intake persistence is not cluster-owned/);
assert.match(proof, /public\.adle_persist_canonical_intake\(/);
assert.doesNotMatch(proof, /insert\s+into\s+public\.adle_learning_items/i);
assert.match(proof, /intake replay changed learning item/);
assert.match(proof, /parent approval replay drift/);
assert.match(proof, /canonical intake learning-item semantics drift/);
assert.match(proof, /canonical intake immutable source lineage drift/);
assert.match(proof, /structural base members did not retain genuine learner authenticity/);
assert.match(proof, /source membership incorrectly authorised a different micro-skill/);
assert.match(proof, /intake route\/release provenance drift/);
assert.match(proof, /persist_adle_base_word_family_pilot_v2/);
assert.match(proof, /bindingsPerAssignment',18/);
assert.match(proof, /base-led completion replay was not idempotent/);
assert.match(proof, /generated family practice entered learner review scheduling/);
assert.match(proof, /queued verified learner evidence was downgraded/);
assert.match(proof, /old closure followed mutable source/);
assert.match(proof, /old assignment provenance changed/);
assert.match(proof, /safety revocation did not block incomplete assignment/);
assert(
  runner.indexOf("throw new Error(RETIRED_OPERATIONAL_ENTRYPOINT)") > runner.indexOf("RETIRED_OPERATIONAL_ENTRYPOINT"),
  "the mixed legacy assignment-persistence proof has no database execution path",
);
assert.match(runner, /specialist snapshot-v3.*Base Word completion regressions/);

console.log("adle-base-word-canonical-intake-persistence-contract-regression: ok");
