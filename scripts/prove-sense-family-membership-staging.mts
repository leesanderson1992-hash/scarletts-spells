/** Rollback proof: a family membership names the selected reviewed analysis. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
assert(actor, "STAGING_ADMIN_ACTOR_MISSING");
const file = "supabase/migrations/20261111030000_teaching_sense_family_membership_events.sql";
const sql = readFileSync(file, "utf8");
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
    where normalised_word='live' and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id;
  const reviewed = await db.query<{ sense_set: { senses: { id: string; definition: string;
    pronunciationId: string }[]; pronunciations: unknown[] } }>(`select sense_set from
    public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(reviewed.rows.length, 1);
  const sense = reviewed.rows[0].sense_set.senses.find(row => row.id === "live-to-remain-alive");
  assert(sense);
  const family = await db.query<{ family_key: string; base_meaning: string }>(`select family_key,base_meaning
    from public.canonical_teaching_dictionary_lexical_base_families
    where family_key='live_verb_base_family' and review_status='approved'
    order by revision desc limit 1`);
  assert.equal(family.rows.length, 1);
  assert.equal(family.rows[0].base_meaning, sense.definition);
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const applied = await db.query<{ present: boolean }>(`select exists(select 1 from
    supabase_migrations.schema_migrations where version='20261111030000') present`);
  if (!applied.rows[0].present) await db.query(body);
  const parts = [{ id: "base", kind: "base", sourceText: "live", surfaceText: "live",
    gloss: family.rows[0].base_meaning, displayRange: { start: 0, end: 4 } }];
  const analysis = await db.query<{ id: string }>(`select public.review_teaching_dictionary_sense_morphology(
    $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,'[]'::jsonb,'live → live',$5,$6) id`,
  [randomUUID(), wordId, sense.id, JSON.stringify(parts), actor, "Disposable staging rollback proof"]);
  assert.equal(analysis.rows.length, 1);
  const analysisId = analysis.rows[0].id;
  const requestId = randomUUID();
  const review = (action: "approve" | "withdraw", request: string, component = "base") =>
    db.query<{ id: string }>(`select public.review_teaching_dictionary_sense_family_membership(
      $1,$2,$3,$4,$5,$6,'free_base',$7,$8,$9) id`,
    [request, wordId, sense.id, analysisId, family.rows[0].family_key,
      component, action, actor, "Disposable staging rollback proof"]);
  const linked = await review("approve", requestId);
  assert.equal((await review("approve", requestId)).rows[0].id, linked.rows[0].id);
  const current = await db.query<{ id: string; sense_morphology_id: string;
    relationship_kind: string }>(`select id,sense_morphology_id,relationship_kind
    from public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, sense.id]);
  assert.deepEqual(current.rows, [{ id: linked.rows[0].id, sense_morphology_id: analysisId,
    relationship_kind: "free_base" }]);
  await db.query("savepoint wrong_part");
  try {
    await review("approve", randomUUID(), "wrong-part");
    throw new Error("INVALID_COMPONENT_APPROVED");
  } catch (error) {
    assert.match(String(error), /SENSE_FAMILY_COMPONENT_INVALID/);
    await db.query("rollback to savepoint wrong_part");
  }
  await db.query("savepoint withdrawn");
  await review("withdraw", randomUUID());
  const withdrawn = await db.query(`select id from
    public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, sense.id]);
  assert.equal(withdrawn.rows.length, 0);
  await db.query("rollback to savepoint withdrawn");
  const expanded = { ...reviewed.rows[0].sense_set, senses: [
    ...reviewed.rows[0].sense_set.senses,
    { id: `staging-proof:${randomUUID()}`, partOfSpeech: "noun",
      definition: "An unrelated meaning.", pronunciationId: sense.pronunciationId },
  ] };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(expanded)]);
  const afterOther = await db.query(`select id from
    public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, sense.id]);
  assert.deepEqual(afterOther.rows, [{ id: linked.rows[0].id }]);
  const changed = { ...expanded, senses: expanded.senses.map(item =>
    item.id === sense.id ? { ...item, definition: "Changed selected meaning" } : item) };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(changed)]);
  const stale = await db.query(`select id from
    public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 and sense_id=$2`, [wordId, sense.id]);
  assert.equal(stale.rows.length, 0);
  await db.query("rollback");
  console.log(JSON.stringify({ target: "staging", result: "passed", exactAnalysisLinked: true,
    idempotent: true, invalidComponentRejected: true, withdrawalScoped: true,
    unrelatedSensePreserved: true, selectedSenseStaled: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
