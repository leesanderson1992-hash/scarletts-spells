import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260627120000_add_word_treasure_storage.sql";
const helperPath = "lib/rewards/word-treasures.ts";

const migration = readFileSync(migrationPath, "utf8");
const helper = readFileSync(helperPath, "utf8");

for (const table of [
  "child_word_treasures",
  "child_word_treasure_events",
]) {
  assert.match(
    migration,
    new RegExp(`create table if not exists public\\.${table}`),
    `Expected ${table} to be created.`,
  );
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `Expected ${table} to enable RLS.`,
  );
  assert.match(
    migration,
    new RegExp(`revoke all on table public\\.${table} from authenticated`),
    `Expected ${table} to revoke blanket authenticated access before grants.`,
  );
  assert.match(
    migration,
    new RegExp(`grant select on table public\\.${table} to authenticated`),
    `Expected ${table} to allow authenticated parent-scoped reads only.`,
  );
  assert.match(
    migration,
    new RegExp(`grant all on table public\\.${table} to service_role`),
    `Expected ${table} service-role write access for later server actions.`,
  );
}

for (const status of ["golden_nugget", "in_forge", "golden_bar"]) {
  assert.match(
    migration,
    new RegExp(`'${status}'`),
    `Expected canonical Word Treasure status ${status}.`,
  );
  assert.match(
    helper,
    new RegExp(`"${status}"`),
    `Expected helper type support for ${status}.`,
  );
}

assert.doesNotMatch(
  migration,
  /warm_workshop|gold_bar_earned|in_machine/,
  "Canonical Word Treasure storage must not use legacy status names.",
);
assert.doesNotMatch(
  migration,
  /\b(drop|alter)\s+table\s+public\.spelling_reward_(states|events)\b/i,
  "Phase 3.1 must not remove or reshape compatibility reward tables.",
);
assert.doesNotMatch(
  migration,
  /\b(insert into|update|delete from)\s+public\.spelling_reward_(states|events)\b/i,
  "Phase 3.1 must not write compatibility reward tables.",
);

for (const column of [
  "canonical_word_id",
  "canonical_mapping_id",
  "corrected_word",
  "corrected_word_normalized",
  "original_misspelling",
  "source_issue_id",
  "source_learning_item_id",
  "source_submission_id",
  "source_misspelling_instance_id",
  "micro_skill_key",
  "discovered_at",
  "correction_attempted_at",
  "entered_forge_at",
  "golden_bar_at",
  "authentic_correct_uses_after_forge",
  "required_uses_for_bar",
  "metadata",
]) {
  assert.match(
    migration,
    new RegExp(`\\b${column}\\b`),
    `Expected child_word_treasures column ${column}.`,
  );
}

assert.match(
  migration,
  /child_word_treasures_child_word_uidx[\s\S]*\(child_id, corrected_word_normalized\)/,
  "Expected one canonical treasure row per child and normalized corrected word.",
);
assert.match(
  migration,
  /child_word_treasure_events_source_uidx[\s\S]*\(treasure_id, event_type, source_type, source_entity_id\)/,
  "Expected event idempotency by treasure, event type, source type, and source id.",
);
assert.match(
  migration,
  /foreign key \(treasure_id, child_id, parent_user_id\)[\s\S]*references public\.child_word_treasures\(id, child_id, parent_user_id\)/,
  "Expected events to match the referenced treasure child and parent.",
);
assert.match(
  migration,
  /create or replace trigger set_child_word_treasures_updated_at[\s\S]*execute function public\.set_updated_at\(\)/,
  "Expected updated_at trigger on child_word_treasures.",
);

assert.match(
  helper,
  /export async function getChildWordTreasures/,
  "Expected canonical treasure list read helper.",
);
assert.match(
  helper,
  /export async function getChildWordTreasureByWord/,
  "Expected canonical treasure word lookup helper.",
);
assert.match(
  helper,
  /export async function getChildWordTreasureEvents/,
  "Expected canonical treasure event read helper.",
);
assert.doesNotMatch(
  helper,
  /spelling_reward_states|spelling_reward_events/,
  "Canonical helper must not read or write compatibility reward tables.",
);

console.log("word-treasure-storage-foundation-regression: ok");
