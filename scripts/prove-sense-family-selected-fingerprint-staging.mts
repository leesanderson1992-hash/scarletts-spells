/** Rollback proof: another meaning must not stale the reviewed family link. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
const sql = readFileSync("supabase/migrations/20261111010000_teaching_sense_family_selected_fact_fingerprint.sql", "utf8");
assert(sql.startsWith("begin;\n") && sql.endsWith("\ncommit;\n"));
const body = sql.slice("begin;\n".length, -"\ncommit;\n".length);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  const word = await db.query<{ id: string }>(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='readable' and dialect_code='en-GB' and row_status='active'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id;
  const before = await db.query<{ id: string; sense_id: string }>(`select id,sense_id from
    public.teaching_dictionary_current_sense_family_links where canonical_word_id=$1`, [wordId]);
  assert.equal(before.rows.length, 1, "READABLE_CURRENT_FAMILY_LINK_REQUIRED");
  const reviewed = await db.query<{ sense_set: { senses: Record<string, unknown>[];
    pronunciations: Record<string, unknown>[] } }>(`select sense_set from
    public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(reviewed.rows.length, 1);
  assert.equal(reviewed.rows[0].sense_set.senses.length, 1);
  assert.equal(before.rows[0].sense_id, reviewed.rows[0].sense_set.senses[0].id);
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query(body);
  const converted = await db.query<{ sense_fingerprint: string }>(`select sense_fingerprint
    from public.teaching_dictionary_sense_family_selected_facts where event_id=$1`, [before.rows[0].id]);
  assert.match(converted.rows[0]?.sense_fingerprint ?? "", /^[a-f0-9]{64}$/);
  const otherSense = { id: `staging-proof:${randomUUID()}`, partOfSpeech: "adjective",
    definition: "A separate meaning for a rollback proof.",
    pronunciationId: reviewed.rows[0].sense_set.senses[0].pronunciationId };
  const expanded = { ...reviewed.rows[0].sense_set,
    senses: [...reviewed.rows[0].sense_set.senses, otherSense] };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(expanded)]);
  const afterOther = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2`, [wordId, before.rows[0].sense_id]);
  assert.deepEqual(afterOther.rows, [{ id: before.rows[0].id }],
    "UNRELATED_SENSE_MUST_NOT_WITHDRAW_FAMILY_LINK");
  const changedSelected = { ...expanded, senses: expanded.senses.map((sense) =>
    sense.id === before.rows[0].sense_id ? { ...sense, definition: "Changed selected meaning" } : sense) };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(changedSelected)]);
  const afterSelected = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2`, [wordId, before.rows[0].sense_id]);
  assert.equal(afterSelected.rows.length, 0, "CHANGED_SELECTED_SENSE_MUST_STALE_FAMILY_LINK");
  await db.query("rollback");
  const restored = await db.query(`select id from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1`, [wordId]);
  assert.deepEqual(restored.rows, [{ id: before.rows[0].id }]);
  console.log(JSON.stringify({ target: "staging", result: "passed",
    unrelatedSensePreservesLink: true, selectedSenseChangeStalesLink: true,
    changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
