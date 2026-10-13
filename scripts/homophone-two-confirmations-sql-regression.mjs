import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
create table contextual_micro_skill_demands (
  child_id uuid, micro_skill_key text, confirmed_count integer default 0,
  threshold_count integer not null default 3, demand_status text default 'BELOW_THRESHOLD',
  canonical_word_id uuid, adle_learning_item_id uuid, updated_at timestamptz default now(),
  primary key(child_id,micro_skill_key), check(confirmed_count >= 0 and threshold_count = 3));
create table writing_occurrences(id text primary key, observed_text text);
create table writing_context_parent_decisions(occurrence_id text, child_id uuid, classification text, intended_member text);
create view writing_context_current_parent_decisions as select * from writing_context_parent_decisions;
create table writing_context_parent_added_cases(occurrence_id text,child_id uuid,intended_member text,id uuid);
create table writing_context_catalog_review_cases(id uuid,parent_added_case_id uuid);
create table contextual_micro_skill_case_links(catalog_case_id uuid,micro_skill_key text);
create table adle_review_context_decisions(finding_id uuid,child_id uuid,intended_word text,action text);
create table adle_review_context_findings(id uuid,observed_text text);
create table spelling_catalog_review_cases(child_id uuid,source_misspelling_instance_id uuid,correct_spelling_normalized text,id uuid,case_status text);
create table contextual_spelling_catalog_case_links(catalog_case_id uuid,micro_skill_key text);
create table contextual_micro_skill_pairs(micro_skill_key text,member_a text,member_b text);
create table contextual_micro_skill_members(micro_skill_key text,member_normalized text);
create table canonical_teaching_dictionary_words(id uuid,normalised_word text,row_status text,review_status text);
create table canonical_teaching_dictionary_word_support(canonical_word_id uuid,micro_skill_key text,row_status text,review_status text);
create table adle_family_methods(family_key text,row_status text);
create table micro_skill_catalog(micro_skill_key text,skill_family_key text);
create table canonical_teaching_dictionary_content_versions(micro_skill_key text,is_active boolean,version_status text,final_readiness_review_status text);
create table adle_learning_items(id uuid default gen_random_uuid(),child_id uuid,canonical_word_id uuid,micro_skill_key text,
  item_status text,source_kind text,source_ref text,reteach_priority boolean,intake_on date,row_status text,
  created_at timestamptz default now(),updated_at timestamptz default now());
create table writing_issues(id uuid,parent_user_id uuid,child_id uuid,metadata jsonb,micro_skill_key text);
create function reconcile_contextual_adle_learning_need_pre_skill_threshold(uuid,uuid,uuid)
returns jsonb language sql as $$ select jsonb_build_object('handoff_state','READY') $$;
`);

const child = randomUUID(), parent = randomUUID(), wordId = randomUUID();
const skill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE";
await db.query("insert into micro_skill_catalog values($1,'D4_HOM')", [skill]);
await db.query("insert into adle_family_methods values('D4_HOM','active')");
await db.query("insert into canonical_teaching_dictionary_content_versions values($1,true,'active','signed_off')", [skill]);
for (const word of ["there", "their"]) {
  const id = word === "there" ? wordId : randomUUID();
  await db.query("insert into contextual_micro_skill_members values($1,$2)", [skill, word]);
  await db.query("insert into canonical_teaching_dictionary_words values($1,$2,'active','approved_for_first_exposure')", [id, word]);
  await db.query("insert into canonical_teaching_dictionary_word_support values($1,$2,'active','approved_for_first_exposure')", [id, skill]);
}
await db.query("insert into contextual_micro_skill_pairs values($1,'their','there')", [skill]);
await db.query("insert into contextual_micro_skill_demands(child_id,micro_skill_key,confirmed_count) values($1,$2,1)", [child, skill]);
await db.query("insert into writing_occurrences values('first','their')");
await db.query("insert into writing_context_parent_decisions values('first',$1,'INVALID','there')", [child]);

await db.exec(readFileSync("supabase/migrations/20261013120000_homophone_two_confirmations_trigger.sql", "utf8"));
let result = await db.query("select confirmed_count,threshold_count,demand_status from contextual_micro_skill_demands where child_id=$1", [child]);
assert.deepEqual(result.rows[0], { confirmed_count: 1, threshold_count: 2, demand_status: "BELOW_THRESHOLD" });
await db.query("insert into writing_occurrences values('second','their')");
await db.query("insert into writing_context_parent_decisions values('second',$1,'INVALID','there')", [child]);
await db.query("select reconcile_contextual_micro_skill_demand($1,$2)", [child, skill]);
result = await db.query("select confirmed_count,demand_status from contextual_micro_skill_demands where child_id=$1", [child]);
assert.deepEqual(result.rows[0], { confirmed_count: 2, demand_status: "READY" });
const items = await db.query("select id,canonical_word_id from adle_learning_items where child_id=$1", [child]);
assert.equal(items.rows.length, 1);
assert.equal(items.rows[0].canonical_word_id, wordId);
await db.query("delete from writing_context_parent_decisions where occurrence_id='second'");
await db.query("select reconcile_contextual_micro_skill_demand($1,$2)", [child, skill]);
assert.equal((await db.query("select item_status from adle_learning_items where id=$1", [items.rows[0].id])).rows[0].item_status,
  "paused_parent_review", "withdrawing one confirmation pauses the threshold item");
await db.query("insert into writing_context_parent_decisions values('second',$1,'INVALID','there')", [child]);
await db.query("select reconcile_contextual_micro_skill_demand($1,$2)", [child, skill]);
assert.equal((await db.query("select item_status from adle_learning_items where id=$1", [items.rows[0].id])).rows[0].item_status,
  "pending", "restoring the second confirmation resumes the same item");

const otherSkill = "D4_CONTEXT_OTHER_FIXTURE";
await db.query("insert into micro_skill_catalog values($1,'D4_OTHER')", [otherSkill]);
await db.query("insert into contextual_micro_skill_pairs values($1,'their','there')", [otherSkill]);
await db.query("select reconcile_contextual_micro_skill_demand($1,$2)", [child, otherSkill]);
const otherDemand = await db.query("select confirmed_count,threshold_count,demand_status from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2", [child,otherSkill]);
assert.deepEqual(otherDemand.rows[0], { confirmed_count: 2, threshold_count: 3, demand_status: "BELOW_THRESHOLD" });

const issue = randomUUID();
await db.query("insert into writing_issues values($1,$2,$3,$4,$5)", [issue, parent, child, { source_kind: "contextual_advisory_v4" }, skill]);
const admitted = await db.query("select reconcile_contextual_adle_learning_need($1,$2,$3) result", [issue,parent,child]);
assert.equal(admitted.rows[0].result.handoff_state, "READY");
await db.query("update adle_learning_items set item_status='awaiting_review_outcome' where id=$1", [items.rows[0].id]);
await db.query("insert into writing_occurrences values('third','their')");
await db.query("insert into writing_context_parent_decisions values('third',$1,'INVALID','there')", [child]);
await db.query("select reconcile_contextual_micro_skill_demand($1,$2)", [child, skill]);
result = await db.query("select confirmed_count,demand_status from contextual_micro_skill_demands where child_id=$1", [child]);
assert.deepEqual(result.rows[0], { confirmed_count: 3, demand_status: "PENDING_EXISTING_ITEM_REVIEW" });
assert.equal((await db.query("select count(*)::integer count from adle_learning_items where child_id=$1", [child])).rows[0].count, 1);
const blocked = await db.query("select reconcile_contextual_adle_learning_need($1,$2,$3) result", [issue,parent,child]);
assert.equal(blocked.rows[0].result.handoff_state, "PENDING_EXISTING_ITEM_REVIEW");
await db.close();
console.log("Homophone two-confirmation SQL regression passed.");
