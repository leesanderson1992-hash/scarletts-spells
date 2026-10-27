// Run with: node --env-file=.env.staging.local scripts/prove-teaching-pos-correction-staging.mjs
// Every mutation is rolled back; this is deliberately restricted to staging.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
assert(url && ref && url.includes(ref), 'A verified staging connection is required');
assert(process.env.STAGING_ADMIN_USER_ID, 'A staging reviewer is required');
const db = new pg.Client({ connectionString: url });
const wordId = '7824cfc5-f8c2-57ac-ba9e-d806161371e8'; // disposable play fixture

await db.connect();
try {
  await db.query('begin');
  const source = await db.query(`select id,raw_morpholex_pos from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=$1 and row_status='active' for update`, [wordId]);
  assert.equal(source.rows[0]?.raw_morpholex_pos, 'noun');
  // Recreate the missing POS while keeping all morphology and family evidence.
  await db.query(`update public.canonical_teaching_dictionary_word_morphology
    set raw_morpholex_pos=null where id=$1`, [source.rows[0].id]);
  const args = [randomUUID(), wordId, source.rows[0].id, 'noun',
    process.env.STAGING_ADMIN_USER_ID, 'Transactional staging regression proof'];
  const approved = await db.query(`select public.approve_teaching_dictionary_part_of_speech(
    $1,$2,$3,$4,$5,$6) as id`, args);
  const newId = approved.rows[0].id;
  const morphologies = await db.query(`select id,row_status,raw_morpholex_pos
    from public.canonical_teaching_dictionary_word_morphology
    where id in ($1,$2)`, [source.rows[0].id, newId]);
  assert(morphologies.rows.some(row => row.id === newId && row.row_status === 'active' && row.raw_morpholex_pos === 'noun'));
  assert(morphologies.rows.some(row => row.id === source.rows[0].id && row.row_status === 'retired'));
  const family = await db.query(`select f.review_status,m.canonical_morphology_id
    from public.canonical_teaching_dictionary_lexical_base_families f
    join public.canonical_teaching_dictionary_lexical_base_family_members m using(family_key,revision)
    where f.family_key='play_noun_base_family' and m.canonical_word_id=$1
    order by f.revision desc limit 1`, [wordId]);
  assert.deepEqual(family.rows[0], { review_status: 'approved', canonical_morphology_id: newId });
  const replay = await db.query(`select public.approve_teaching_dictionary_part_of_speech(
    $1,$2,$3,$4,$5,$6) as id`, args);
  assert.equal(replay.rows[0].id, newId);
  const audit = await db.query(`select count(*)::int as count from public.teaching_dictionary_part_of_speech_reviews
    where request_id=$1 and approved_morphology_id=$2`, [args[0], newId]);
  assert.equal(audit.rows[0].count, 1);
  await db.query('rollback');
  console.log('PASS: reviewed POS versions morphology and family, preserves history, and replays idempotently');
} catch (error) {
  await db.query('rollback');
  throw error;
} finally {
  await db.end();
}
