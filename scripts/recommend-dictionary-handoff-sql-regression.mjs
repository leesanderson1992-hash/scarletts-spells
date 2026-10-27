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
  create table authentic_use_credits(
    word_key text, child_id uuid, adle_review_id uuid, review_id uuid,
    occurred_at timestamptz, canonical_word_id uuid
  );
  create table canonical_teaching_dictionary_words(
    id uuid primary key, normalised_word text, display_word text,
    dialect_code text, row_status text, review_status text
  );
  insert into authentic_use_credits(word_key,child_id,occurred_at)
    values('ingredients','11111111-1111-4111-8111-111111111111',now());
`);
await db.exec(readFileSync(resolve('supabase/migrations/20261012120000_admin_recommend_dictionary_entries.sql'), 'utf8'));
const before = await db.query('select word_key from admin_recommend_dictionary_entries');
if (before.rows.length !== 1 || before.rows[0].word_key !== 'ingredients') throw new Error('missing word not recommended');
await db.exec(`
  insert into canonical_teaching_dictionary_words(id,normalised_word,display_word,dialect_code,row_status,review_status)
    values('22222222-2222-4222-8222-222222222222','ingredients','Ingredients','en-GB','active','in_review');
`);
const after = await db.query('select word_key from admin_recommend_dictionary_entries');
if (after.rows.length !== 0) throw new Error('existing dictionary word still recommended');
console.log('PASS: published dictionary identity removes the recommendation without route approval');
await db.close();
