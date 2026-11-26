// Run against the disposable Part 2 staging fixture; all mutations roll back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const connectionString = process.env.SUPABASE_STAGING_DB_URL;
assert(connectionString?.includes('qkpjbajicacbrphthibk'), 'Staging database required');
const db = new pg.Client({ connectionString });
await db.connect();
try {
  await db.query('begin');
  const word = 'e7e1981a-7824-5ff2-8e1a-2b15b8ffa428';
  const base = '87481022-3e8c-5499-9d63-acfb68e9cfa9';
  const family = 'walk_noun_base_family';
  const actor = process.env.STAGING_ADMIN_USER_ID;
  assert(actor);
  const row = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  const link = await row('select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and family_key=$2', [word, family]);
  assert(link, 'Reviewed walked fixture must exist');
  const before = await row('select count(*)::int n from teaching_dictionary_current_sense_family_memberships where family_key=$1 and canonical_word_id<>$2', [family, word]);
  await db.query('savepoint base_guard');
  await assert.rejects(db.query('select remove_teaching_dictionary_spelling_family_member($1,$2,$3,$4)', [randomUUID(), base, family, actor]), /FAMILY_REMOVE_BASE_ANCHOR/);
  await db.query('rollback to savepoint base_guard');
  const request = randomUUID();
  const remove = () => db.query('select remove_teaching_dictionary_spelling_family_member($1,$2,$3,$4)', [request, word, family, actor]);
  await remove(); await remove();
  assert.equal((await row('select count(*)::int n from teaching_dictionary_family_link_edit_events where request_id=$1', [request])).n, 1);
  const current = () => row('select count(*)::int n from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and family_key=$2', [word, family]);
  assert.equal((await current()).n, 0);
  const args = [randomUUID(), word, link.sense_id, link.sense_morphology_id, family, link.component_part_id, link.relationship_kind];
  await db.query("select review_teaching_dictionary_sense_family_membership($1,$2,$3,$4,$5,$6,$7,'approve',$8,'Old workbook retry must not restore a removed link')", [...args, actor]);
  assert.equal((await current()).n, 0);
  await db.query('select approve_teaching_dictionary_spelling_family_member($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), ...args.slice(1), actor]);
  assert.equal((await current()).n, 1);
  assert.equal((await row('select count(*)::int n from teaching_dictionary_current_sense_family_memberships where family_key=$1 and canonical_word_id<>$2', [family, word])).n, before.n);
  const smile = await row("select * from teaching_dictionary_families_with_current_meaning where family_key='smile_noun_base_family' order by revision desc limit 1");
  assert.equal(smile.base_part_of_speech, 'verb');
  assert.equal(smile.canonical_base_sense_id, 'smile-verb');
  const take = (await db.query("select distinct base_meaning from teaching_dictionary_families_with_current_meaning where base_lemma='take'")).rows;
  assert(take.some(r => r.base_meaning === 'To understand or interpret'));
  assert(take.some(r => /carry/i.test(r.base_meaning)));
  const port = await row("select * from teaching_dictionary_families_with_current_meaning where family_key='port_root_port_carry_root_base_family'");
  assert.equal(port.base_kind, 'bound_root');
  assert.equal(port.base_meaning, 'to carry');
  console.log('PASS: shared noun/verb meaning, distinct take meanings, root port, removal retry, stale workbook veto, explicit restore, base protection, unrelated members preserved');
} finally {
  await db.query('rollback');
  await db.end();
}
