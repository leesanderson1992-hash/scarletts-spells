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
create table teaching_dictionary_route_content_versions(canonical_word_id uuid,route_id text,micro_skill_key text);
create table canonical_teaching_dictionary_prefix_profiles(id uuid,micro_skill_key text,row_status text,production_enabled boolean);
create table canonical_teaching_dictionary_prefix_members(canonical_word_id uuid,prefix_profile_id uuid,row_status text);
create table canonical_teaching_dictionary_suffix_profiles(id uuid,micro_skill_key text,row_status text,production_enabled boolean);
create table canonical_teaching_dictionary_suffix_members(canonical_word_id uuid,suffix_profile_id uuid,row_status text);
create table canonical_teaching_dictionary_base_word_family_members(canonical_word_id uuid,row_status text);
`);
await db.exec(readFileSync(resolve('supabase/migrations/20261025090000_teaching_dictionary_route_blocked_ids.sql'), 'utf8'));

const ids = Object.fromEntries(['approvedPrefix','missingPrefix','inactivePrefix','contentSuffix','baseMember','baseMissing','irrelevant'].map((name,index) =>
  [name, `00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`]));
const prefixProfile='00000000-0000-4000-8001-000000000001';
await db.query("insert into canonical_teaching_dictionary_prefix_profiles values ($1,'PREFIX_X','active',true)",[prefixProfile]);
await db.query("insert into canonical_teaching_dictionary_prefix_members values ($1,$2,'active'),($3,$2,'inactive')",[ids.approvedPrefix,prefixProfile,ids.inactivePrefix]);
await db.query("insert into teaching_dictionary_route_content_versions values ($1,'dynamic_affix_word_lab','SUFFIX_X'),($2,'base_word_lab','BASE_X')",[ids.contentSuffix,ids.baseMissing]);
await db.query("insert into canonical_teaching_dictionary_base_word_family_members values ($1,'active')",[ids.baseMember]);
const pairs = [
  [ids.approvedPrefix,'PREFIX_X','dynamic_prefix_word_lab'],
  [ids.missingPrefix,'PREFIX_X','dynamic_prefix_word_lab'],
  [ids.inactivePrefix,'PREFIX_X','dynamic_prefix_word_lab'],
  [ids.baseMember,'BASE_X','base_word_lab'],
  [ids.irrelevant,'HOM_X','homophone_word_lab'],
].map(([wordId,microSkillKey,routeId])=>({wordId,microSkillKey,routeId}));
const result=(await db.query('select teaching_dictionary_admin_route_blocked_ids($1::jsonb) as ids',[JSON.stringify(pairs)])).rows[0].ids.sort();
assert.deepEqual(result,[ids.missingPrefix,ids.inactivePrefix,ids.contentSuffix,ids.baseMissing].sort());
assert.deepEqual((await db.query("select teaching_dictionary_admin_route_blocked_ids('[]'::jsonb) as ids")).rows[0].ids.sort(),
  [ids.contentSuffix,ids.baseMissing].sort());
console.log('teaching dictionary route filter regression passed');
