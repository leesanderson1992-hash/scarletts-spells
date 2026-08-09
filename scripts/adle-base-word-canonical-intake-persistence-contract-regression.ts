import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260809120000_guard_base_word_canonical_intake_persistence.sql", "utf8");
const proof = readFileSync("scripts/sql/prove-adle-base-word-canonical-intake-local.sql", "utf8");
const runner = readFileSync("scripts/prove-adle-base-word-canonical-intake-local.ts", "utf8");

const argumentsBlock = migration.match(/create function public\.adle_persist_canonical_intake\(([\s\S]*?)\)\s*returns table/)?.[1];
assert(argumentsBlock);
assert.equal(argumentsBlock.match(/^\s*p_[a-z_]+\s+(?:uuid|text|date)(?: default null)?,?$/gm)?.length, 12);
assert.match(argumentsBlock, /p_route_activation_id uuid default null/);
assert.match(migration, /v_is_base_word boolean := p_micro_skill_key in \([\s\S]*D4_MOR_BASE_WORDS_IDENTIFY_BASE[\s\S]*D4_MOR_BASE_WORDS_PRESERVE_BASE/);
assert.match(migration, /Base Word candidate must request base_word_lab:v2/);
assert.match(migration, /activation\.id = p_route_activation_id/);
assert.match(migration, /activation\.lesson_route_key = 'base_word_family_v1'/);
assert.match(migration, /activation\.payload_version = 1/);
assert.match(migration, /activation\.activation_status = 'production_enabled'/);
assert.match(migration, /manifest\.environment_key = activation\.environment_key/);
assert.match(migration, /manifest\.row_status = 'active'/);
assert.match(migration, /import_batch\.batch_status = 'applied'/);
assert.match(migration, /family\.import_batch_id = manifest\.import_batch_id/);
assert.match(migration, /family\.micro_skill_key = activation\.micro_skill_key/);
assert.match(migration, /family\.row_status = 'active'/);
assert.match(migration, /family\.review_status = 'approved_for_first_exposure'/);
assert.match(migration, /member\.canonical_word_id = p_canonical_word_id/);
assert.match(migration, /member\.member_role = 'authentic_target'/);
assert.match(migration, /member\.assignment_eligible = true/);
assert.match(migration, /for key share of activation, manifest, import_batch, skill, family, member/);
assert.match(migration, /v_route_id := 'base_word_lab';[\s\S]*v_route_version := 'v2'/);

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
assert.match(migration, /revoke all on function public\.adle_persist_canonical_intake\([\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.adle_persist_canonical_intake\([\s\S]*to service_role/);
assert.doesNotMatch(migration, /alter table public\.adle_learning_items[\s\S]*(route_id|route_version)/i);

assert.match(proof, /^begin;/m);
assert.match(proof, /^rollback;/m);
assert.match(proof, /adle_seed_canonical_intake_candidate/);
assert.match(proof, /public\.adle_persist_canonical_intake\(/);
assert.doesNotMatch(proof, /insert\s+into\s+public\.adle_learning_items/i);
assert.match(proof, /BW-1 replay did not reuse the same learning item/);
assert.match(proof, /item\.item_status = 'pending'/);
assert.match(proof, /item\.source_kind = 'verified_misspelling'/);
assert.match(proof, /BW-1 immutable source lineage is missing/);
assert.match(proof, /BW-1 replay duplicated or lost parent approval/);
assert.match(proof, /BW-1 RPC accepted a base-role member/);
assert.match(proof, /BW-1 RPC accepted a non-member word/);
assert.match(proof, /candidate\.route_id <> 'base_word_lab'/);
assert.match(proof, /candidate\.route_version <> 'v2'/);
assert.match(runner, /signature\.split\(","\)\.length !== 12/);
assert.match(runner, /serviceExecute !== true/);

console.log("adle-base-word-canonical-intake-persistence-contract-regression: ok");
