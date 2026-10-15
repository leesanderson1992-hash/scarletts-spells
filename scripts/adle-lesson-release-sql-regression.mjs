import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);
const packageRoot = process.env.PATH?.split(delimiter).map(path => resolve(path, "../@electric-sql/pglite")).find(existsSync);
if (!packageRoot) throw new Error("Run with npx --package=@electric-sql/pglite@0.5.8");
const { PGlite } = require(packageRoot);
const { pgcrypto } = require(resolve(packageRoot, "dist/contrib/pgcrypto.cjs"));
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function public.reject_writing_fact_update() returns trigger language plpgsql as $$begin raise exception 'immutable'; end$$;
    create table public.canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,dialect_code text,display_word text,source_row_hash text,row_status text,review_status text,age_band text,frequency_band text,complexity_band text);
    create table public.canonical_teaching_dictionary_word_metadata(canonical_word_id uuid,source_row_hash text,row_status text,review_status text,syllables text,phoneme_hint text,stress_pattern text,has_schwa boolean,created_at timestamptz default now());
    create table public.canonical_teaching_dictionary_dictation_sentences(canonical_word_id uuid,source_row_hash text,row_status text,review_status text,dictation_sentence text,audio_text text,dictation_target_token_index int,created_at timestamptz default now());
    create table public.canonical_teaching_dictionary_word_morphology(canonical_word_id uuid,source_row_hash text,row_status text,created_at timestamptz default now());
    create table public.teaching_dictionary_manager_drafts(id uuid primary key,canonical_word_id uuid,normalised_word text,dialect_code text,payload jsonb);
    create table public.teaching_dictionary_route_content_versions(id uuid primary key default gen_random_uuid(),canonical_word_id uuid,route_id text,route_version text,micro_skill_key text,content jsonb,draft_id uuid,published_at timestamptz default now());
    create table public.canonical_teaching_dictionary_prefix_profiles(id uuid primary key,source_row_hash text,micro_skill_key text,row_status text,review_status text,production_enabled boolean);
    create table public.canonical_teaching_dictionary_suffix_profiles(id uuid primary key default gen_random_uuid(),import_batch_id uuid,source_row_hash text,micro_skill_key text,row_status text,review_status text,production_enabled boolean,suffix_label text,suffix_text text,suffix_meaning text,meaning_bins jsonb,include_meaning_sort boolean,suffix_choices jsonb,intro_content jsonb,reflection_prompt_key text,reflection_prompt_text text,source_sheet text,source_row_number int,source_metadata jsonb,source_category text,source_name text,source_url text,source_licence text,source_use_note text,confidence text,reviewed_by text,reviewed_at timestamptz,updated_at timestamptz);
    create table public.canonical_teaching_dictionary_suffix_members(id uuid primary key default gen_random_uuid(),import_batch_id uuid,suffix_profile_id uuid,canonical_word_id uuid,member_role text,suffix_variant text,semantic_base_text text,semantic_base_kind text,base_meaning text,new_word_meaning text,meaning_bin_key text,teaching_split_parts jsonb,teaching_split_joins jsonb,true_morphology_parts jsonb,true_morphology_joins jsonb,true_morphology_transformations jsonb,transformation_notes text,true_morphology_provenance jsonb,assignment_eligible boolean,row_status text,review_status text,source_sheet text,source_row_number int,source_row_hash text,source_metadata jsonb,source_category text,source_name text,source_url text,source_licence text,source_use_note text,confidence text,reviewed_by text,reviewed_at timestamptz);
    create table public.canonical_teaching_dictionary_import_batches(id uuid primary key default gen_random_uuid(),source_folder_path text,source_folder_sha256 text,validator_version text,validation_summary jsonb,row_counts jsonb,readiness_summary jsonb,import_mode text,batch_status text,source_metadata jsonb,imported_by text,imported_at timestamptz);
    create table public.teaching_dictionary_route_content_publications(content_version_id uuid primary key,route_profile_id uuid,published_by uuid);
    create table public.teaching_dictionary_route_content_rollbacks(content_version_id uuid primary key,route_profile_id uuid,previous_profile_id uuid,reason text,rolled_back_by uuid);
  `);
  await db.exec(readFileSync("supabase/migrations/20261015120000_adle_lesson_editorial_reviews.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261015121000_adle_replace_reviewed_affix_members.sql", "utf8"));
  assert.equal((await db.query("select has_function_privilege('service_role','public.publish_teaching_dictionary_suffix_content(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed, false, "single-member publication is private");
  assert.equal((await db.query("select has_function_privilege('service_role','public.publish_teaching_dictionary_lesson(text,text,uuid[],uuid)','EXECUTE') allowed")).rows[0].allowed, true, "whole-lesson publication remains available");

  const actor = randomUUID(), word = randomUUID(), draft = randomUUID(), nextDraft = randomUUID();
  const skill = "D4_MOR_SUFFIXES_ABLE_IBLE";
  const route = { routeId: "dynamic_affix_word_lab", routeVersion: "v3", microSkillKey: skill,
    wordMeaning: "a reviewed meaning", wordSum: "root + ible", content: {
      trueMorphologyParts: [{ surfaceText: "respons" }, { surfaceText: "ible" }],
      trueMorphologyJoins: [{ joinType: "none" }],
      trueMorphologyProvenance: { status: "reviewed", source: "editorial" },
    } };
  await db.query("insert into auth.users(id) values($1)", [actor]);
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,display_word,source_row_hash,row_status,review_status,age_band,frequency_band,complexity_band) values($1,'responsible','en-GB','responsible','word-v1','active','approved_for_first_exposure','middle_primary','high','medium')", [word]);
  await db.query("insert into canonical_teaching_dictionary_word_metadata(canonical_word_id,source_row_hash,row_status,review_status,syllables,phoneme_hint,stress_pattern,has_schwa) values($1,'metadata-v1','active','approved_for_first_exposure','4','/fixture/','primary',false)", [word]);
  await db.query("insert into canonical_teaching_dictionary_dictation_sentences(canonical_word_id,source_row_hash,row_status,review_status,dictation_sentence,audio_text,dictation_target_token_index) values($1,'dictation-v1','active','approved_for_first_exposure','Be responsible.','Be responsible.',1)", [word]);
  await db.query("insert into canonical_teaching_dictionary_word_morphology(canonical_word_id,source_row_hash,row_status) values($1,'morph-v1','active')", [word]);
  for (const id of [draft, nextDraft]) await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload) values($1,$2,'responsible','en-GB',$3)", [id, word, JSON.stringify({ routeContents: [route] })]);
  const first = await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [draft, actor]);
  const firstId = first.rows[0].ids[0];
  assert.deepEqual((await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [draft, actor])).rows[0].ids, [firstId], "staging is idempotent");
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [firstId, actor]);
  assert.equal((await db.query("select count(*)::int total from teaching_dictionary_route_content_reviews")).rows[0].total, 1);

  const newer = await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [nextDraft, actor]);
  await assert.rejects(db.query("select public.review_teaching_dictionary_route_content($1,$2)", [firstId, actor]), /TEACHING_ROUTE_CONTENT_STALE/);
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [newer.rows[0].ids[0], actor]);
  await db.query("update canonical_teaching_dictionary_words set source_row_hash='word-v2' where id=$1", [word]);
  await assert.rejects(db.query("select public.review_teaching_dictionary_route_content($1,$2)", [newer.rows[0].ids[0], actor]), /TEACHING_ROUTE_REVIEW_STALE/);
  const profileId = randomUUID(), publicationDraft = randomUUID();
  const fullRoute = { ...route, content: { ...route.content,
    expectedProfileId: profileId, expectedSourceRowHash: "profile-v1",
    suffixVariant: "ible", semanticBaseText: "respons", semanticBaseKind: "root",
    baseMeaning: "answerable", meaningBinKey: "possible",
    teachingSplitParts: [{ kind: "root", surfaceText: "respons" }, { kind: "suffix", surfaceText: "ible" }],
    teachingSplitJoins: [{ joinType: "none" }],
    transformationNotes: "",
  } };
  await db.query("insert into canonical_teaching_dictionary_suffix_profiles(id,source_row_hash,micro_skill_key,row_status,review_status,production_enabled,meaning_bins,suffix_choices,intro_content,source_metadata) values($1,'profile-v1',$2,'active','approved_for_first_exposure',false,$3,'[]','{}','{}')", [profileId, skill, JSON.stringify([{ id: "possible" }])]);
  await db.query("insert into canonical_teaching_dictionary_suffix_members(suffix_profile_id,canonical_word_id,member_role,row_status,review_status,assignment_eligible,source_row_hash) values($1,$2,'transfer','active','approved_for_first_exposure',true,'old-member')", [profileId, word]);
  for (let index = 0; index < 3; index++) await db.query("insert into canonical_teaching_dictionary_suffix_members(suffix_profile_id,canonical_word_id,member_role,row_status,review_status,assignment_eligible,source_row_hash) values($1,$2,'transfer','active','approved_for_first_exposure',true,'other-member')", [profileId, randomUUID()]);
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload) values($1,$2,'responsible','en-GB',$3)", [publicationDraft, word, JSON.stringify({ routeContents: [fullRoute] })]);
  const releaseContentId = (await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [publicationDraft, actor])).rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [releaseContentId, actor]);
  const releasedId = (await db.query("select public.publish_teaching_dictionary_lesson('dynamic_affix_word_lab',$1,$2,$3) id", [skill, [releaseContentId], actor])).rows[0].id;
  assert.notEqual(releasedId, profileId, "release creates a new immutable profile snapshot");
  assert.deepEqual((await db.query("select row_status,production_enabled from canonical_teaching_dictionary_suffix_profiles where id=$1", [profileId])).rows[0], { row_status: "superseded", production_enabled: false });
  assert.equal((await db.query("select production_enabled from canonical_teaching_dictionary_suffix_profiles where id=$1", [releasedId])).rows[0].production_enabled, false, "release preserves the disabled profile gate");
  const members = (await db.query("select canonical_word_id,member_role,transformation_notes from canonical_teaching_dictionary_suffix_members where suffix_profile_id=$1 order by canonical_word_id", [releasedId])).rows;
  assert.equal(members.length, 4, "whole profile keeps the other members and replaces the reviewed word");
  assert.equal(members.find(member => member.canonical_word_id === word).member_role, "transfer", "replacement preserves the original member role");
  assert.equal(members.find(member => member.canonical_word_id === word).transformation_notes, "", "notes are optional");
  const replayId = (await db.query("select public.publish_teaching_dictionary_lesson('dynamic_affix_word_lab',$1,$2,$3) id", [skill, [releaseContentId], actor])).rows[0].id;
  assert.equal(replayId, releasedId, "duplicate launch is idempotent");
  await db.query("select public.rollback_teaching_dictionary_suffix_content($1,$2,'fixture rollback')", [releaseContentId, actor]);
  assert.deepEqual((await db.query("select row_status,production_enabled from canonical_teaching_dictionary_suffix_profiles where id=$1", [profileId])).rows[0], { row_status: "active", production_enabled: false });
  const staleProfileDraft = randomUUID();
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload) values($1,$2,'responsible','en-GB',$3)", [staleProfileDraft, word, JSON.stringify({ routeContents: [{ ...fullRoute, content: { ...fullRoute.content, expectedSourceRowHash: "old-profile-hash" } }] })]);
  const staleProfileContent = (await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [staleProfileDraft, actor])).rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [staleProfileContent, actor]);
  await assert.rejects(db.query("select public.publish_teaching_dictionary_lesson('dynamic_affix_word_lab',$1,$2,$3)", [skill, [staleProfileContent], actor]), /TEACHING_SUFFIX_PROFILE_CHANGED/);
  const secondWord = randomUUID(), revisedDraft = randomUUID(), secondDraft = randomUUID();
  const secondRoute = { ...fullRoute, content: { ...fullRoute.content, semanticBaseText: "test",
    teachingSplitParts: [{ kind: "root", surfaceText: "test" }, { kind: "suffix", surfaceText: "ible" }],
    trueMorphologyParts: [{ surfaceText: "test" }, { surfaceText: "ible" }] } };
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,display_word,source_row_hash,row_status,review_status,age_band,frequency_band,complexity_band) values($1,'testible','en-GB','testible','word-2','active','approved_for_first_exposure','middle_primary','high','medium')", [secondWord]);
  await db.query("insert into canonical_teaching_dictionary_word_metadata(canonical_word_id,source_row_hash,row_status,review_status,syllables,phoneme_hint,stress_pattern,has_schwa) values($1,'metadata-2','active','approved_for_first_exposure','3','/fixture/','primary',false)", [secondWord]);
  await db.query("insert into canonical_teaching_dictionary_dictation_sentences(canonical_word_id,source_row_hash,row_status,review_status,dictation_sentence,audio_text,dictation_target_token_index) values($1,'dictation-2','active','approved_for_first_exposure','Be testible.','Be testible.',1)", [secondWord]);
  await db.query("insert into canonical_teaching_dictionary_word_morphology(canonical_word_id,source_row_hash,row_status) values($1,'morph-2','active')", [secondWord]);
  for (const [id, wordId, spelling, authored] of [[revisedDraft, word, "responsible", fullRoute], [secondDraft, secondWord, "testible", secondRoute]]) {
    await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload) values($1,$2,$3,'en-GB',$4)", [id, wordId, spelling, JSON.stringify({ routeContents: [authored] })]);
  }
  const firstBatchId = (await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [revisedDraft, actor])).rows[0].ids[0];
  const secondBatchId = (await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids", [secondDraft, actor])).rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [firstBatchId, actor]);
  await db.query("select public.review_teaching_dictionary_route_content($1,$2)", [secondBatchId, actor]);
  await db.query("update canonical_teaching_dictionary_words set display_word='testable' where id=$1", [secondWord]);
  await assert.rejects(db.query("select public.publish_teaching_dictionary_lesson('dynamic_affix_word_lab',$1,$2,$3)", [skill, [firstBatchId, secondBatchId], actor]), /TEACHING_SUFFIX_SPLIT_INVALID/);
  assert.equal((await db.query("select id from canonical_teaching_dictionary_suffix_profiles where row_status='active' and micro_skill_key=$1", [skill])).rows[0].id, profileId, "failed batch retains the original active profile");
  assert.equal((await db.query("select count(*)::int total from teaching_dictionary_route_content_publications where content_version_id in ($1,$2)", [firstBatchId, secondBatchId])).rows[0].total, 0, "failed batch publishes no member");
  await db.query("update canonical_teaching_dictionary_words set display_word='testible' where id=$1", [secondWord]);
  const batchReleaseId = (await db.query("select public.publish_teaching_dictionary_lesson('dynamic_affix_word_lab',$1,$2,$3) id", [skill, [firstBatchId, secondBatchId], actor])).rows[0].id;
  assert.equal((await db.query("select count(*)::int total from canonical_teaching_dictionary_suffix_members where suffix_profile_id=$1", [batchReleaseId])).rows[0].total, 5, "whole batch includes both reviewed words");
  await db.query("select public.rollback_teaching_dictionary_suffix_content($1,$2,'undo batch word 2')", [secondBatchId, actor]);
  await db.query("select public.rollback_teaching_dictionary_suffix_content($1,$2,'undo batch word 1')", [firstBatchId, actor]);
  assert.equal((await db.query("select id from canonical_teaching_dictionary_suffix_profiles where row_status='active' and micro_skill_key=$1", [skill])).rows[0].id, profileId, "reverse rollback restores the original version");
  console.log(JSON.stringify({ status: "passed", stagedVersions: 3, staleReviewRejected: true,
    dependencyChangeRejected: true, replacementPublished: true, duplicateLaunchIdempotent: true,
    rollbackRestored: true, staleProfileRejected: true, failedBatchAtomic: true, twoWordReleaseAndRollback: true }));
} finally {
  await db.close();
}
