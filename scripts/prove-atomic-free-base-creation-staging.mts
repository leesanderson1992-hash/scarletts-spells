/** Disposable rollback proof: a family gets reviewed meanings and its first sense link together. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const word = await db.query(`select w.id,m.id morphology_id from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id
      and m.row_status='active' and m.analysis_status='approved'
    where w.normalised_word='read' and w.dialect_code='en-GB' and w.row_status='active'`);
  assert.equal(word.rows.length, 1);
  const { id: wordId, morphology_id: morphologyId } = word.rows[0];
  const previous = await db.query(`select count(*)::int n from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [wordId]);
  assert.equal(previous.rows[0].n, 0);
  const familyKey = "read_noun_base_family";
  const priorFamily = await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=$1`, [familyKey]);
  assert.equal(priorFamily.rows[0].n, 0);
  const senseId = "staging-proof:read-noun";
  await db.query(`insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by) values($1,$2::jsonb,$3)`,
  [wordId, JSON.stringify({ pronunciations: [{ id: "staging-proof:read-ipa", ipa: "/riːd/",
    stressPattern: "primary", spokenSyllableCount: 1 }], senses: [{ id: senseId,
    partOfSpeech: "noun", definition: "understand written words",
    pronunciationId: "staging-proof:read-ipa" }] }), actor]);
  await db.query("savepoint bad_component");
  try {
    await db.query(`select public.create_reviewed_lexical_free_base_family_for_sense(
      $1,$2,$2,$3,$3,$4,$4,'missing-part','free_base',
      'Disposable rollback proof',$5,'Disposable rollback proof')`,
    [randomUUID(),wordId,morphologyId,senseId,actor]);
    throw new Error("INVALID_COMPONENT_UNEXPECTEDLY_APPROVED");
  } catch (error) {
    assert.match(String(error), /SENSE_FAMILY_COMPONENT_INVALID/);
    await db.query("rollback to savepoint bad_component");
  }
  const created = await db.query(`select public.create_reviewed_lexical_free_base_family_for_sense(
    $1,$2,$2,$3,$3,$4,$4,'base','free_base',
    'Disposable rollback proof',$5,'Disposable rollback proof') family_key`,
  [randomUUID(),wordId,morphologyId,senseId,actor]);
  assert.equal(created.rows[0].family_key, familyKey);
  const current = await db.query(`select family_key,sense_id,component_part_id from
    public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and family_key=$2`, [wordId,familyKey]);
  assert.deepEqual(current.rows, [{ family_key: familyKey, sense_id: senseId, component_part_id: "base" }]);
  await db.query("rollback");
  console.log(JSON.stringify({ result: "passed", invalidComponentRejected: true,
    familyAndSenseLinked: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
