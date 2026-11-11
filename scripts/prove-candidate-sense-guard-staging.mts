/** Rollback proof for exact sense analysis and family-link candidate snapshots. */
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
const file = "supabase/migrations/20261111040000_teaching_candidate_sense_analysis_guard.sql";
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
  const reviewed = await db.query<{ sense_set: { senses: { id: string; pronunciationId: string }[] } }>(
    `select sense_set from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  const sense = reviewed.rows[0].sense_set.senses.find(row => row.id === "live-to-remain-alive");
  assert(sense);
  const family = await db.query<{ family_key: string; base_meaning: string }>(
    `select family_key,base_meaning from public.canonical_teaching_dictionary_lexical_base_families
      where family_key='live_verb_base_family' and review_status='approved'
      order by revision desc limit 1`);
  assert.equal(family.rows.length, 1);
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const applied = await db.query<{ present: boolean }>(`select exists(select 1 from
    supabase_migrations.schema_migrations where version='20261111040000') present`);
  if (!applied.rows[0].present) await db.query(body);
  const parts = [{ id: "base", kind: "base", sourceText: "live", surfaceText: "live",
    gloss: family.rows[0].base_meaning, displayRange: { start: 0, end: 4 } }];
  const analysis = await db.query<{ id: string }>(`select public.review_teaching_dictionary_sense_morphology(
    $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,'[]'::jsonb,'live → live',$5,$6) id`,
  [randomUUID(), wordId, sense.id, JSON.stringify(parts), actor, "Disposable candidate guard proof"]);
  const analysisId = analysis.rows[0].id;
  const familyLink = await db.query<{ id: string }>(`select public.review_teaching_dictionary_sense_family_membership(
    $1,$2,$3,$4,$5,'base','free_base','approve',$6,$7) id`,
  [randomUUID(), wordId, sense.id, analysisId, family.rows[0].family_key,
    actor, "Disposable candidate guard proof"]);
  const fact = { senseId: sense.id, senseSet: reviewed.rows[0].sense_set,
    morphologyId: analysisId, morphologySource: "sense", familyLinkIds: [familyLink.rows[0].id] };
  const reconcile = (expected: typeof fact) => db.query(`select public.reconcile_teaching_dictionary_bulk_review_v4(
    'staging','D4_MOR_SUFFIXES_ING',array[]::uuid[],array[]::uuid[],
    array[$1]::uuid[],array[]::uuid[],array[]::uuid[],
    $2::jsonb,$3,$4,null,'reviewed_overview_candidate_v3',$5::jsonb)`,
  [wordId, JSON.stringify({ [wordId]: sense.id }), actor, randomUUID(),
    JSON.stringify({ [wordId]: expected })]);
  async function expectRejected(expected: typeof fact, pattern: RegExp) {
    await db.query("savepoint candidate_check");
    try {
      await reconcile(expected);
      throw new Error("CANDIDATE_GUARD_UNEXPECTED_SUCCESS");
    } catch (error) {
      assert.match(String(error), pattern);
    } finally {
      await db.query("rollback to savepoint candidate_check");
      await db.query("release savepoint candidate_check");
    }
  }
  await expectRejected({ ...fact, morphologyId: randomUUID() }, /TEACHING_CANDIDATE_FACTS_STALE/);
  await expectRejected({ ...fact, familyLinkIds: [] }, /TEACHING_CANDIDATE_FAMILY_STALE/);
  await expectRejected({ ...fact, morphologySource: "unknown" }, /TEACHING_CANDIDATE_FACTS_STALE/);
  await expectRejected(fact, /TEACHING_BULK_SKILL_INVALID/);
  await db.query("rollback");
  console.log(JSON.stringify({ target: "staging", result: "passed",
    staleAnalysisRejected: true, staleFamilyRejected: true, unknownSourceRejected: true,
    validFactsPassedGuard: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
