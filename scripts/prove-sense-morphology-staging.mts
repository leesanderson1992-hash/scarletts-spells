/** Rollback proof for independent reviewed analyses of both live senses. */
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
const sql = readFileSync("supabase/migrations/20261111020000_teaching_sense_morphology_events.sql", "utf8");
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
  assert.equal(reviewed.rows[0].sense_set.senses.length, 2);
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const applied = await db.query<{ present: boolean }>(`select exists(select 1 from
    supabase_migrations.schema_migrations where version='20261111020000') present`);
  if (!applied.rows[0].present) await db.query(body);
  const approvedIds: string[] = [];
  for (const sense of reviewed.rows[0].sense_set.senses) {
    const parts = [{ id: "base", kind: "base", sourceText: "live", surfaceText: "live",
      gloss: sense.definition, displayRange: { start: 0, end: 4 } }];
    const requestId = randomUUID();
    const approve = () => db.query<{ id: string }>(`select public.review_teaching_dictionary_sense_morphology(
      $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,'[]'::jsonb,'live → live',$5,$6) id`,
    [requestId, wordId, sense.id, JSON.stringify(parts), actor, "Disposable staging rollback proof"]);
    const created = await approve();
    assert.equal(created.rows.length, 1);
    approvedIds.push(created.rows[0].id);
    assert.equal((await approve()).rows[0].id, created.rows[0].id,
      "a repeated request must not create a second event");
  }
  const current = await db.query<{ sense_id: string; pronunciation_id: string;
    morphology_parts: { gloss: string }[] }>(`select sense_id,pronunciation_id,morphology_parts
      from public.teaching_dictionary_current_sense_morphology
      where canonical_word_id=$1 order by sense_id`, [wordId]);
  assert.equal(current.rows.length, 2);
  for (const row of current.rows) {
    const expected = reviewed.rows[0].sense_set.senses.find(sense => sense.id === row.sense_id);
    assert.equal(row.pronunciation_id, expected?.pronunciationId);
    assert.equal(row.morphology_parts[0].gloss, expected?.definition);
  }
  await db.query("savepoint transformed_analysis");
  const transformation = { type: "base_spelling_change", sourcePartId: "base",
    sourceText: "life", surfaceText: "live", explanation: "Disposable spelling-change proof" };
  await db.query(`select public.review_teaching_dictionary_sense_morphology(
    $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,$5::jsonb,'life → live',$6,$7)`,
  [randomUUID(), wordId, current.rows[0].sense_id, JSON.stringify([{ id: "base",
    kind: "base", sourceText: "life", surfaceText: "live",
    gloss: current.rows[0].morphology_parts[0].gloss,
    displayRange: { start: 0, end: 4 } }]), JSON.stringify([transformation]), actor,
    "Disposable staging rollback proof"]);
  const transformed = await db.query<{ morphology_transformations: unknown[] }>(`select
    morphology_transformations from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=$1 and sense_id=$2`, [wordId, current.rows[0].sense_id]);
  assert.deepEqual(transformed.rows[0].morphology_transformations, [transformation]);
  await db.query("rollback to savepoint transformed_analysis");
  await db.query("savepoint withdraw_one");
  await db.query(`select public.review_teaching_dictionary_sense_morphology(
    $1,$2,$3,'withdraw','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'',$4,$5)`,
  [randomUUID(), wordId, current.rows[0].sense_id, actor, "Disposable staging rollback proof"]);
  const afterWithdraw = await db.query(`select sense_id from
    public.teaching_dictionary_current_sense_morphology where canonical_word_id=$1`, [wordId]);
  assert.deepEqual(afterWithdraw.rows, [{ sense_id: current.rows[1].sense_id }],
    "withdrawal must affect only the selected sense");
  await db.query("rollback to savepoint withdraw_one");
  await db.query("savepoint bad_surface");
  try {
    await db.query(`select public.review_teaching_dictionary_sense_morphology(
      $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,$5::jsonb,'live → live',$6,$7)`,
    [randomUUID(), wordId, current.rows[0].sense_id, JSON.stringify([{ id: "base",
      kind: "base", sourceText: "live", surfaceText: "liva", gloss: "invalid",
      displayRange: { start: 0, end: 4 } }]), JSON.stringify([{ type: "base_spelling_change",
      sourcePartId: "base", sourceText: "live", surfaceText: "liva",
      explanation: "Disposable invalid spelling proof" }]), actor, "Disposable staging rollback proof"]);
    throw new Error("INVALID_SPELLING_APPROVED");
  } catch (error) {
    assert.match(String(error), /SENSE_MORPHOLOGY_WORD_SUM_INVALID/);
    await db.query("rollback to savepoint bad_surface");
  }
  const expanded = { ...reviewed.rows[0].sense_set, senses: [
    ...reviewed.rows[0].sense_set.senses,
    { id: `staging-proof:${randomUUID()}`, partOfSpeech: "noun",
      definition: "An unrelated meaning.", pronunciationId: current.rows[0].pronunciation_id },
  ] };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(expanded)]);
  const afterOther = await db.query(`select sense_id from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=$1`, [wordId]);
  assert.equal(afterOther.rows.length, 2, "another sense must preserve both analyses");
  const changed = { ...expanded, senses: expanded.senses.map(sense =>
    sense.id === current.rows[0].sense_id ? { ...sense, definition: "Changed selected meaning" } : sense) };
  await db.query(`update public.teaching_dictionary_reviewed_sense_sets set sense_set=$2::jsonb
    where canonical_word_id=$1`, [wordId, JSON.stringify(changed)]);
  const afterChanged = await db.query(`select sense_id from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=$1`, [wordId]);
  assert.equal(afterChanged.rows.length, 1, "changing one sense must stale only its analysis");
  assert.notEqual(afterChanged.rows[0].sense_id, current.rows[0].sense_id);
  await db.query("rollback");
  if (applied.rows[0].present) {
    const afterRollback = await db.query(`select count(*)::int n from
      public.teaching_dictionary_sense_morphology_events where canonical_word_id=$1`, [wordId]);
    assert.equal(afterRollback.rows[0].n, 0, "fixture must roll back");
  } else {
    const afterRollback = await db.query(`select to_regclass(
      'public.teaching_dictionary_sense_morphology_events') is null absent`);
    assert.equal(afterRollback.rows[0].absent, true, "migration proof must roll back");
  }
  console.log(JSON.stringify({ target: "staging", result: "passed", twoSenses: approvedIds.length,
    idempotent: true, selectiveWithdrawal: true, reviewedTransformation: true,
    invalidSpellingRejected: true,
    unrelatedSensePreserved: true,
    selectedSenseStaled: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
