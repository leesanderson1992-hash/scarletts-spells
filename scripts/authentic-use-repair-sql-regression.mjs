import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
if (!root) throw new Error("pglite unavailable");
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table auth.users(id uuid primary key);
create table children(id uuid primary key,parent_user_id uuid);
create table micro_skill_catalog(micro_skill_key text primary key,is_active boolean,is_assignable boolean,metadata jsonb default '{}'::jsonb,updated_at timestamptz default now());
create table contextual_micro_skill_members(micro_skill_key text,member_normalized text,member_display text,approved_by_admin_user_id uuid,created_at timestamptz default now(),primary key(micro_skill_key,member_normalized));
create table contextual_micro_skill_pairs(id uuid default gen_random_uuid(),dialect_code text default 'en-GB',member_a text,member_b text,micro_skill_key text,approved_by_admin_user_id uuid,created_at timestamptz default now(),primary key(dialect_code,member_a,member_b),foreign key(micro_skill_key,member_a) references contextual_micro_skill_members(micro_skill_key,member_normalized),foreign key(micro_skill_key,member_b) references contextual_micro_skill_members(micro_skill_key,member_normalized));
create table contextual_micro_skill_case_links(catalog_case_id uuid primary key,micro_skill_key text,approved_by_admin_user_id uuid,linked_at timestamptz);
create table contextual_spelling_catalog_case_links(catalog_case_id uuid primary key,micro_skill_key text,approved_by_admin_user_id uuid,linked_at timestamptz);
create table contextual_micro_skill_demands(child_id uuid,micro_skill_key text,primary key(child_id,micro_skill_key));
create table canonical_teaching_dictionary_import_batches(id uuid primary key,batch_status text);
create table canonical_teaching_dictionary_words(id uuid primary key,word_key text,display_word text,normalised_word text,row_status text,dialect_code text);
create table canonical_teaching_dictionary_word_support(id uuid primary key default gen_random_uuid(),import_batch_id uuid,canonical_word_id uuid,row_status text,source_sheet text,source_row_number integer,source_row_hash text,source_metadata jsonb,micro_skill_key text,support_role text,source_category text,source_name text,source_url text,source_licence text,source_use_note text,confidence text,review_status text,review_notes text,reviewed_by text,reviewed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create unique index support_active on canonical_teaching_dictionary_word_support(canonical_word_id,micro_skill_key,support_role) where row_status='active';
create table writing_source_snapshots(id uuid primary key,occurred_at timestamptz);
create table writing_occurrences(id text primary key,snapshot_id uuid,field_path text,start_utf16 integer,end_utf16 integer,observed_text text,field_hash text,provenance text,extractor_version text);
create table parent_verifications(id uuid primary key,child_id uuid,parent_user_id uuid,source_entity_id text,decision text);
create table authentic_use_submission_chains(id uuid primary key);
create table authentic_use_reviews(id uuid primary key,chain_id uuid,snapshot_id uuid,parent_user_id uuid,child_id uuid,verified_at timestamptz);
create table authentic_use_credits(id uuid primary key default gen_random_uuid(),review_id uuid,chain_id uuid,snapshot_id uuid,parent_user_id uuid,child_id uuid,word_key text,observed_word text,occurrence_ids text[],supplied_spelling boolean,occurred_at timestamptz,verified_at timestamptz,canonical_word_id uuid,unique(child_id,chain_id,word_key));
create table authentic_use_controls(child_id uuid,parent_user_id uuid,mode text,gold_enabled boolean,proficiency_enabled boolean,primary key(child_id,parent_user_id));
create table authentic_use_deliveries(credit_id uuid,consumer text,parent_user_id uuid,child_id uuid,status text default 'pending',primary key(credit_id,consumer));
create function protect_authentic_use_fact() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
`);

const parent = randomUUID(), child = randomUUID(), batch = randomUUID(), chain = randomUUID();
const review = "791ca3c5-6c7b-40ea-905c-328ab4d3fc61";
const verification = "5addee9b-7a42-4c2e-a487-b3a08e92bffc";
const snapshot = "71f73878-4554-482f-91b2-6fff4a1aa7dc";
const duplicate = "D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE";
const canonical = "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE";
const herd = "D4_HOM_CONTENT_WORD_HOMOPHONES_HERD_HEARD";
const threw = "D4_HOM_CONTENT_WORD_HOMOPHONES_THREW_THROUGH";
for (const skill of [duplicate, canonical, herd, threw, "D4_HOM_FIXTURE"]) {
  await db.query("insert into micro_skill_catalog values($1,true,true,'{}',now())", [skill]);
}
await db.query("insert into auth.users values($1)", [parent]);
await db.query("insert into children values($1,$2)", [child, parent]);
await db.query("insert into canonical_teaching_dictionary_import_batches values($1,'applied')", [batch]);
await db.query("insert into authentic_use_submission_chains values($1)", [chain]);
for (let index = 0; index < 31; index++) {
  const wordId = randomUUID();
  await db.query("insert into canonical_teaching_dictionary_words values($1,$2,$2,$2,'active','en-GB')", [wordId, `fixture${index}`]);
  await db.query("insert into canonical_teaching_dictionary_word_support(import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,micro_skill_key,support_role,source_category,source_use_note,confidence,review_status) values($1,$2,'active','fixture',2,'hash','{}','D4_HOM_FIXTURE','support_example','internal_reviewed_seed','fixture','medium','in_review')", [batch, wordId]);
}
for (const word of ["heard", "herd", "threw", "through", "while"]) {
  await db.query("insert into canonical_teaching_dictionary_words values($1,$2,$2,$2,'active','en-GB')", [randomUUID(), word]);
}
await db.exec(`
insert into contextual_micro_skill_members values('${duplicate}','peace','peace',null,now()),('${duplicate}','piece','piece',null,now());
insert into contextual_micro_skill_pairs(dialect_code,member_a,member_b,micro_skill_key) values('en-GB','peace','piece','${duplicate}');
insert into writing_source_snapshots values('${snapshot}','2026-10-05T10:00:00Z');
insert into writing_occurrences values('while-occurrence','${snapshot}','/answer',164,169,'while','hash','learner_response','v1');
insert into authentic_use_reviews values('${review}','${chain}','${snapshot}','${parent}','${child}','2026-10-05T11:00:00Z');
insert into parent_verifications values('${verification}','${child}','${parent}','authentic_writing::0a2e3772-e190-4694-b86e-71cb9045dcac::2b62cbf4-041b-48d4-b470-7dac973ab31e::164-169::while::whole','false_positive');
insert into authentic_use_controls values('${child}','${parent}','enabled',true,true);
`);

await db.exec(readFileSync("supabase/migrations/20261005130000_repair_authentic_use_and_publish_homophones.sql", "utf8"));
const support = await db.query("select count(*)::integer total,count(*) filter(where review_status='approved_for_first_exposure')::integer approved from canonical_teaching_dictionary_word_support where row_status='active' and micro_skill_key like 'D4_HOM_%'");
assert.deepEqual(support.rows[0], { total: 35, approved: 35 });
const consolidated = await db.query("select (select micro_skill_key from contextual_micro_skill_pairs where member_a='peace' and member_b='piece') pair_skill,(select is_active from micro_skill_catalog where micro_skill_key=$1) duplicate_active,(select count(*)::integer from contextual_micro_skill_members where micro_skill_key=$1) duplicate_members", [duplicate]);
assert.deepEqual(consolidated.rows[0], { pair_skill: canonical, duplicate_active: false, duplicate_members: 0 });
const repaired = await db.query("select (select count(*)::integer from authentic_use_credits where word_key='while') credits,(select count(*)::integer from authentic_use_credit_corrections) corrections,(select count(*)::integer from authentic_use_deliveries) receipts,(select count_authentic_use_delivery_backlog()::integer) backlog");
assert.deepEqual(repaired.rows[0], { credits: 1, corrections: 1, receipts: 2, backlog: 2 });
console.log("Authentic-use repair migration: 35 homophone relationships, duplicate consolidation, audited while correction and backlog count passed.");
await db.close();
