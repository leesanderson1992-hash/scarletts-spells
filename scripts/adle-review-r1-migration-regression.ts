import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  import.meta.dirname,
  "../supabase/migrations/20260824120000_add_adle_review_r1_foundations.sql",
), "utf8");

assert.match(migration, /add column if not exists compiled_review_snapshot jsonb null/);
assert.match(migration, /ADLE compiled Review snapshot is immutable/);
assert.match(migration, /review_snapshot_v3/);
assert.match(migration, /jsonb_array_length\(p_snapshot->'targets'\) not between 1 and 10/);
assert.match(migration, /jsonb_array_length\(p_snapshot->'promptCandidates'\) <> 5/);

assert.match(migration, /writingDurationSeconds}'\)::integer <> 600/);
assert.match(migration, /extensionOptionsSeconds}' <> '\[300,600,900\]'::jsonb/);
assert.match(migration, /maximumExtensions}'\)::integer <> 1/);
assert.match(migration, /creative_writing_only/);
assert.match(migration, /writing extension is single-use and immutable/);
assert.match(migration, /submitted writing is immutable/);

assert.match(migration, /correct_in_writing/);
assert.match(migration, /attributable_misspelling/);
assert.match(migration, /unaccounted_for/);
assert.match(
  migration,
  /writing_disposition = 'attributable_misspelling'[\s\S]*?original_outcome = 'failure'[\s\S]*?original_outcome_source = 'writing'/,
);
assert.match(
  migration,
  /writing_disposition = 'unaccounted_for'[\s\S]*?original_outcome in \('success', 'failure'\)[\s\S]*?original_outcome_source = 'audio_retrieval_check'/,
);
assert.match(migration, /ADLE Review original scheduled-retrieval outcome is immutable/);

assert.match(migration, /create table if not exists public\.adle_review_prompt_versions/);
assert.match(migration, /reusable_lru_no_immediate_repeat/);
assert.match(migration, /Approved ADLE Review prompt content is immutable; publish a new version/);
assert.doesNotMatch(migration.toLowerCase(), /reflection[\s\S]{0,80}cooldown|cooldown[\s\S]{0,80}reflection/,
  "Reflection governance must not acquire a fixed cooldown");

assert.match(migration, /create table if not exists public\.adle_review_sessions/);
assert.match(migration, /create table if not exists public\.adle_review_word_encounters/);
assert.match(migration, /create table if not exists public\.adle_review_transition_receipts/);
assert.match(migration, /unique \(review_session_id, idempotency_key\)/);
assert.match(migration, /transition receipts are append-only/);

assert.match(migration, /word_schedule_version = 'adle_review_per_word_schedule_v1'/);
assert.match(migration, /membership_status = 'scheduled' and word_next_due_on is not null/);
assert.match(migration, /membership_status <> 'scheduled' and word_next_due_on is null/);
assert.match(migration, /NULL preserves legacy bundle scheduling; R5 owns activation/);
assert.doesNotMatch(migration, /update public\.adle_review_schedule_words[\s\S]*word_schedule_version/i,
  "R1 must not backfill or activate the shadow word schedule");
assert.doesNotMatch(migration, /insert into public\.daily_assignments/i,
  "R1 must not create assignments");
assert.doesNotMatch(migration, /insert into public\.adle_review_sessions/i,
  "R1 must not write learner runtime state");

for (const table of [
  "adle_review_prompt_versions",
  "adle_review_sessions",
  "adle_review_word_encounters",
  "adle_review_transition_receipts",
]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role`));
}

console.log("PASS: ADLE Review R1 migration is immutable, service-only, compatibility-safe, and inactive");
