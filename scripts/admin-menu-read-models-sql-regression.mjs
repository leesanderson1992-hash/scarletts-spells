import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter)
  .map((path) => resolve(path, '../@electric-sql/pglite'))
  .find((path) => existsSync(path));
if (!root) throw new Error('pglite unavailable');
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table authentic_use_credits(word_key text, child_id uuid, adle_review_id uuid,
    review_id uuid, occurred_at timestamptz, canonical_word_id uuid);
  create table canonical_teaching_dictionary_words(id uuid primary key, normalised_word text,
    display_word text, dialect_code text, row_status text, review_status text);
  create table spelling_catalog_review_cases(case_status text, updated_at timestamptz);
  create table spelling_no_matching_skill_queue(case_status text, updated_at timestamptz);
  create table spelling_canonical_mapping_recommendations(recommendation_status text, updated_at timestamptz);
  create table spelling_seed_import_rows(row_status text, updated_at timestamptz);
  insert into authentic_use_credits(word_key,child_id,occurred_at)
    values ('ingredients','11111111-1111-4111-8111-111111111111',now()),
      ('colourful','11111111-1111-4111-8111-111111111111',now()),
      ('can''t','11111111-1111-4111-8111-111111111111',now());
  insert into canonical_teaching_dictionary_words(id,normalised_word,display_word,dialect_code,row_status,review_status)
    values ('22222222-2222-4222-8222-222222222222','colourful','Colourful','en-GB','active','approved_for_first_exposure'),
      ('33333333-3333-4333-8333-333333333333','legacy','Can’t','en-GB','inactive','in_review');
  insert into spelling_catalog_review_cases values ('open',now()),('reviewed',now());
  insert into spelling_no_matching_skill_queue values ('open',now()),('word_level_only',now());
  insert into spelling_canonical_mapping_recommendations values ('recommended',now()),('confirmed',now());
  insert into spelling_seed_import_rows
    select case when n <= 200 then 'pending_candidate_review' else 'approved' end, now()
    from generate_series(1, 300) n;
`);
await db.exec(readFileSync(resolve('supabase/migrations/20261012120000_admin_recommend_dictionary_entries.sql'), 'utf8'));
const before = (await db.query('select * from admin_recommend_dictionary_entries order by word_key')).rows;
await db.exec(readFileSync(resolve('supabase/migrations/20261028083000_admin_menu_read_models.sql'), 'utf8'));
const after = (await db.query('select * from admin_recommend_dictionary_entries order by word_key')).rows;
assert.deepEqual(after, before, 'recommendation view changed its results');
assert.deepEqual(after.map((row) => row.word_key), ['ingredients']);
const summaries = (await db.query('select source,status,row_count from admin_spelling_queue_summary order by source,status')).rows;
assert.equal(summaries.filter((row) => row.source === 'seed_import')
  .reduce((sum, row) => sum + Number(row.row_count), 0), 300);
assert.equal(Number(summaries.find((row) => row.source === 'seed_import' && row.status === 'pending_candidate_review')?.row_count), 200);
assert.equal(summaries.length, 8);
console.log('PASS: recommendation identity unchanged; all queue rows counted beyond the old 250-row cap');
await db.close();
