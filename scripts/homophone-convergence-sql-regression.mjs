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
create schema if not exists public;
create schema extensions;
create function extensions.digest(bytea,text) returns bytea language sql as $$select sha256($1)$$;
create role anon; create role authenticated; create role service_role;
create table public.micro_skill_clusters (mastery_domain_key text,skill_family_key text,
  skill_cluster_key text primary key,display_name text,is_assignable boolean,is_active boolean,metadata jsonb);
create table public.micro_skill_catalog (id uuid default gen_random_uuid(),mastery_domain_key text,
  skill_family_key text,skill_cluster_key text,micro_skill_key text primary key,display_name text,
  practice_route text,is_assignable boolean,is_active boolean,metadata jsonb);
create table public.canonical_teaching_dictionary_words (id uuid primary key,normalised_word text,
  display_word text,dialect_code text,row_status text,review_status text);
create table public.adle_learning_items (id uuid primary key);
create table public.daily_assignments (id uuid primary key, compiled_lesson_snapshot jsonb);
create function public.prevent_adle_release_authority_mutation() returns trigger language plpgsql as
  $$begin raise exception 'immutable'; end;$$;
`);
await db.exec(readFileSync("supabase/migrations/20261023150000_homophone_convergence_foundations.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261023153000_homophone_assignment_snapshot_set_binding.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261023151000_homophone_convergence_draft_catalog.sql", "utf8"));
for (const source of [
  "D4_HOM_CONTENT_WORD_HOMOPHONES_COMMON_VERB_NOUN_PAIRS",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_PIECE_PEACE",
  "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS",
  "D4_HOM_CONTRACTION_POSSESSIVE_WERE_WERE",
  "D4_HOM_CONTRACTION_POSSESSIVE_WHOS_WHOSE",
  "D4_HOM_FUNCTION_WORD_HOMOPHONES_FOR_FOUR_OF_OFF",
  "D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE",
]) {
  await db.query("insert into public.micro_skill_catalog(micro_skill_key) values($1)", [source]);
}
await db.exec(readFileSync("supabase/migrations/20261023152000_homophone_convergence_draft_redirects.sql", "utf8"));
const catalog = await db.query("select count(*)::integer n from public.micro_skill_catalog");
assert.equal(catalog.rows[0].n, 65);
const inactive = await db.query("select count(*)::integer n from public.micro_skill_catalog where is_active or is_assignable");
assert.equal(inactive.rows[0].n, 0);
const redirects = await db.query("select count(*)::integer n from public.homophone_skill_redirects where redirect_status='draft'");
assert.equal(redirects.rows[0].n, 8);
const skill = "D4_HOM_CONFUSABLE_WORDS_LOOSE_LOSE";
await db.query(`insert into public.homophone_contrast_sets
  (set_key,micro_skill_key,relation_kind,source_reference) values('loose-lose',$1,'confusable','owner source list')`, [skill]);
const id1 = randomUUID(), id2 = randomUUID();
for (const [i, id, word] of [[1, id1, "loose"], [2, id2, "lose"]]) {
  await db.query(`insert into public.canonical_teaching_dictionary_words values
    ($1,$2,$2,'en-GB','active','approved_for_first_exposure')`, [id, word]);
  await db.query(`insert into public.homophone_contrast_set_members
    (set_key,revision,member_ordinal,canonical_word_id,intended_sense,
      grammatical_role,target_sentence,sense_source_reference)
    values('loose-lose',1,$1,$2,$3,$4,$5,'review fixture')`,
    [i, id, word === "loose" ? "not tight" : "misplace", word === "loose" ? "adjective" : "verb",
      word === "loose" ? "The knot is loose." : "Do not lose the key."]);
}
const approved = await db.query("select public.approve_homophone_contrast_set('loose-lose',1,'reviewer','fixture approval') as hash");
assert.match(approved.rows[0].hash, /^[a-f0-9]{64}$/);
await assert.rejects(db.query(`update public.homophone_contrast_set_members
  set intended_sense='changed' where set_key='loose-lose' and member_ordinal=1`));
await assert.rejects(db.query(`update public.homophone_contrast_sets
  set source_reference='changed' where set_key='loose-lose'`));
const assignment = randomUUID();
await db.query("insert into public.daily_assignments values($1,$2::jsonb)", [assignment, JSON.stringify({
  route: { routeId: "homophone_contextual_choice", routeVersion: "v1" },
  microSkillKey: skill,
  selectedSets: [{ setKey: "loose-lose", revision: 1, semanticFingerprint: approved.rows[0].hash }],
})]);
await db.query(`insert into public.homophone_assignment_contrast_sets
  (assignment_id,selected_ordinal,set_key,revision,semantic_fingerprint)
  values($1,1,'loose-lose',1,$2)`, [assignment, approved.rows[0].hash]);
await assert.rejects(db.query("delete from public.homophone_assignment_contrast_sets where assignment_id=$1", [assignment]));
const wrong = randomUUID();
await db.query("insert into public.daily_assignments values($1,$2::jsonb)", [wrong, JSON.stringify({
  route: { routeId: "homophone_contextual_choice", routeVersion: "v1" },
  microSkillKey: skill, selectedSets: [],
})]);
await assert.rejects(db.query(`insert into public.homophone_assignment_contrast_sets
  (assignment_id,selected_ordinal,set_key,revision,semantic_fingerprint)
  values($1,1,'loose-lose',1,$2)`, [wrong, approved.rows[0].hash]));
console.log("homophone convergence SQL regression passed");
