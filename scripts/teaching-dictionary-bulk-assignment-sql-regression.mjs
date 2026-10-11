import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
if (!root) throw new Error("pglite unavailable");
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table micro_skill_catalog(micro_skill_key text primary key,is_active boolean,is_assignable boolean);
create table adle_word_skill_review_controls(environment_key text primary key,review_enabled boolean,publication_enabled boolean,withdrawal_enabled boolean);
create table canonical_teaching_dictionary_words(id uuid primary key,row_status text,review_status text);
create table adle_word_skill_candidate_packages(id uuid primary key default gen_random_uuid(),package_key text unique,environment_key text,candidates jsonb,created_by uuid);
create table adle_word_skill_package_reviews(package_id uuid primary key,decisions jsonb);
create table adle_word_skill_package_publications(package_id uuid primary key,release_id uuid);
create table test_publish_failure(word_id uuid);
create function create_word_skill_candidate_package(p_key text,p_environment text,p_candidates jsonb,p_actor uuid)
returns uuid language plpgsql as $$declare v_id uuid; begin
  select id into v_id from adle_word_skill_candidate_packages where package_key=p_key;
  if v_id is not null then return v_id; end if;
  insert into adle_word_skill_candidate_packages(package_key,environment_key,candidates,created_by)
    values(p_key,p_environment,p_candidates,p_actor) returning id into v_id;
  return v_id;
end$$;
create function review_word_skill_candidate_package_with_metrics(
  p_package uuid,p_environment text,p_decisions jsonb,p_rejection_reasons jsonb,p_actor uuid,p_note text,p_active_seconds integer)
returns void language plpgsql as $$begin
  insert into adle_word_skill_package_reviews values(p_package,p_decisions) on conflict do nothing;
end$$;
create function publish_word_skill_candidate_package(p_package uuid,p_environment text,p_actor uuid,p_authority_fingerprint text)
returns uuid language plpgsql as $$declare v_id uuid; v_word uuid; begin
  select (candidates->0->>'canonicalWordId')::uuid into v_word from adle_word_skill_candidate_packages where id=p_package;
  if exists(select 1 from test_publish_failure where word_id=v_word) then raise exception 'fixture blocked'; end if;
  select release_id into v_id from adle_word_skill_package_publications where package_id=p_package;
  if v_id is not null then return v_id; end if;
  v_id:=gen_random_uuid();
  insert into adle_word_skill_package_publications values(p_package,v_id);
  return v_id;
end$$;
`);
await db.exec(readFileSync("supabase/migrations/20261011160000_teaching_dictionary_bulk_skill_approvals.sql", "utf8"));
const actor = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const a = "33333333-3333-4333-8333-333333333333";
const b = "44444444-4444-4444-8444-444444444444";
const skill = "D4_TEST";
await db.query("insert into micro_skill_catalog values($1,true,true)", [skill]);
await db.query("insert into adle_word_skill_review_controls values('local',true,true,true)");
for (const id of [a, b]) await db.query("insert into canonical_teaching_dictionary_words values($1,'active','approved_for_first_exposure')", [id]);
const args = ["local", skill, [a, b], actor, request];
const prepared = await db.query("select * from prepare_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid)", args);
assert.equal(prepared.rows.length, 2);
assert.notEqual(prepared.rows[0].package_id, prepared.rows[1].package_id);
const managerLookup = await db.query("select count(*)::integer count from adle_word_skill_candidate_packages where package_key like $1", [`tdm-bulk:%:${a}`]);
assert.equal(managerLookup.rows[0].count, 1);
const again = await db.query("select * from prepare_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid)", args);
assert.deepEqual(again.rows, prepared.rows);
await db.query("insert into test_publish_failure values($1)", [b]);
await assert.rejects(db.query("select publish_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid,$6)", [...args, "fingerprint"]));
const rolledBack = await db.query("select count(*)::integer count from adle_word_skill_package_publications");
assert.equal(rolledBack.rows[0].count, 0);
await db.query("delete from test_publish_failure");
const published = await db.query("select publish_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid,$6) count", [...args, "fingerprint"]);
assert.equal(published.rows[0].count, 2);
const retried = await db.query("select publish_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid,$6) count", [...args, "fingerprint"]);
assert.equal(retried.rows[0].count, 2);
const releases = await db.query("select count(distinct release_id)::integer count from adle_word_skill_package_publications");
assert.equal(releases.rows[0].count, 2);
await db.query("update canonical_teaching_dictionary_words set review_status='draft' where id=$1", [b]);
await assert.rejects(db.query("select publish_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid,$6)", [...args, "fingerprint"]));
await db.query("update canonical_teaching_dictionary_words set review_status='approved_for_first_exposure' where id=$1", [b]);
await db.query("update adle_word_skill_review_controls set publication_enabled=false where environment_key='local'");
await assert.rejects(db.query("select publish_teaching_dictionary_bulk_skill_approvals($1,$2,$3::uuid[],$4::uuid,$5::uuid,$6)", [...args, "fingerprint"]));
await db.close();
console.log("Teaching dictionary bulk approval transaction passed.");
