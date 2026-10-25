import { readFileSync, existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(p => resolve(p, '../@electric-sql/pglite')).find(p => existsSync(p));
if (!root) throw new Error('pglite unavailable');
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,display_word text,age_band text,frequency_band text,row_status text);
create table canonical_teaching_dictionary_word_metadata(id uuid primary key,canonical_word_id uuid,row_status text,review_status text,syllables text,phoneme_hint text,stress_pattern text,has_schwa boolean,morphemes text,morphology_notes text);
create table canonical_teaching_dictionary_dictation_sentences(id uuid primary key,canonical_word_id uuid,row_status text,review_status text);
`);
await db.exec(readFileSync(resolve('supabase/migrations/20261024210000_teaching_dictionary_admin_filtered_page.sql'), 'utf8'));
const ids = {
  apple: '00000000-0000-4000-8000-000000000001',
  banana: '00000000-0000-4000-8000-000000000002',
  cherry: '00000000-0000-4000-8000-000000000003',
  dormant: '00000000-0000-4000-8000-000000000004',
};
await db.query(`insert into canonical_teaching_dictionary_words values
($1,'apple','Apple','7-9','common','active'),
($2,'banana','Banana','7-9','common','active'),
($3,'cherry','Cherry',null,'common','active'),
($4,'dormant','Dormant',null,null,'inactive')`, Object.values(ids));
await db.query(`insert into canonical_teaching_dictionary_word_metadata values
('00000000-0000-4000-8000-000000000011',$1,'active','approved_for_first_exposure','2','a-pul','first',false,'apple',''),
('00000000-0000-4000-8000-000000000012',$2,'active','pending','3','ba-na-na','first',false,'banana','')`, [ids.apple,ids.banana]);
await db.query(`insert into canonical_teaching_dictionary_dictation_sentences values
('00000000-0000-4000-8000-000000000021',$1,'active','approved_for_first_exposure')`, [ids.apple]);
const page = async (filter, search = '', wordIds = null, limit = 50, offset = 0) =>
  (await db.query('select teaching_dictionary_admin_filtered_page($1,$2,$3::uuid[],$4,$5) as result',
    [filter, search, wordIds, limit, offset])).rows[0].result;
assert.deepEqual((await page('all')).words.map(w => w.normalised_word), ['apple','banana','cherry']);
assert.deepEqual((await page('missing_metadata')).words.map(w => w.normalised_word), ['banana','cherry']);
assert.deepEqual((await page('evidence_approved','',[ids.apple,ids.cherry])).words.map(w => w.normalised_word), ['apple','cherry']);
assert.deepEqual((await page('route_blocked','ban',[ids.apple,ids.banana])).words.map(w => w.normalised_word), ['banana']);
const second = await page('all','',null,1,1);
assert.equal(second.total, 3);
assert.deepEqual(second.words.map(w => w.normalised_word), ['banana']);
assert.equal((await page('all','%')).total, 0, 'search treats wildcard as literal');
assert.equal((await page('evidence_approved','',[])).total, 0);
await assert.rejects(() => page('invalid'));
console.log('teaching dictionary admin SQL paging regression passed');
