import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260804210000_add_adle_canonical_intake_demands.sql",
  "utf8",
);
const blockedFunctionCorrection = readFileSync(
  "supabase/migrations/20260804223000_qualify_adle_canonical_intake_blocked_links.sql",
  "utf8",
);
const page = readFileSync(
  "app/admin/adle-canonical-intake-readiness/page.tsx",
  "utf8",
);
const actions = readFileSync(
  "app/admin/adle-canonical-intake-readiness/actions.ts",
  "utf8",
);

for (const table of [
  "adle_canonical_intake_candidates",
  "adle_canonical_intake_demands",
  "adle_canonical_intake_candidate_demands",
  "adle_canonical_intake_reconciliation_queue",
  "adle_canonical_intake_events",
]) assert.match(migration, new RegExp(`create table public\\.${table}`));

assert.match(migration, /unique\(candidate_id, demand_id\)/);
assert.match(migration, /normalized_target_token text not null/);
assert.match(migration, /target_record_link_status = 'token_only' and canonical_word_id is null/);
assert.match(migration, /primary_blocker_code = 'canonical_word_missing' and demand_type <> 'teaching_content'/);
assert.match(migration, /occurrence_count = occurrence_count \+ 1/);
assert.match(migration, /if not v_link_existed then/);
assert.match(migration, /notification_status = 'resolved'/);
assert.match(migration, /create or replace function public\.adle_seed_canonical_intake_candidate/);
assert.match(migration, /canonical intake seed differs from reviewed source/);
assert.match(migration, /enable row level security/g);
assert.match(migration, /grant execute .* to service_role/g);
assert.match(
  blockedFunctionCorrection,
  /where link\.candidate_id = v_candidate\.id/,
);
assert.match(
  blockedFunctionCorrection,
  /on conflict on constraint adle_canonical_intake_candidate_dema_candidate_id_demand_id_key/,
);
assert.match(
  blockedFunctionCorrection,
  /where queue\.candidate_id = v_candidate\.id/,
);
assert.match(
  blockedFunctionCorrection,
  /grant execute on function public\.adle_record_canonical_intake_blocked[\s\S]*to service_role/,
);

assert.match(page, /Teaching Dictionary content is required for/);
assert.match(page, /Mapping identity:/);
assert.match(page, /resolved and resolver-visible/);
assert.match(page, /Required reviewed content/);
assert.match(page, /This context does not create, approve or publish teaching facts/);
assert.doesNotMatch(page, /child_name|parent_email|raw_answer/i);
assert.doesNotMatch(actions, /adle_persist_canonical_intake|daily_assignments|assignment_items/);
assert.doesNotMatch(actions, /mark.{0,10}ready|create.{0,10}assignment/i);
assert.match(actions, /requireAdminUser/g);
assert.match(actions, /audited note/i);

console.log("adle-canonical-intake-demand-regression: ok");
