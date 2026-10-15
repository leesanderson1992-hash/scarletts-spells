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

  await db.exec(`
    create function public.adle_generic_snapshot_json_sha256_v1(v jsonb) returns text language sql immutable as $$select encode(extensions.digest(convert_to(v::text,'UTF8'),'sha256'),'hex')$$;
    alter table canonical_teaching_dictionary_words add column import_batch_id uuid, add column word_key text, add column source_category text, add column source_name text, add column source_url text, add column source_licence text, add column source_use_note text, add column confidence text, add column updated_at timestamptz;
    alter table canonical_teaching_dictionary_word_metadata add column id uuid default gen_random_uuid(), add column import_batch_id uuid, add column source_sheet text, add column source_row_number int, add column grapheme_notes text, add column morphemes text, add column morphology_notes text, add column irregularity_notes text, add column written_syllable_breakdown text, add column source_category text, add column source_use_note text, add column confidence text, add column reviewed_by text, add column reviewed_at timestamptz, add column updated_at timestamptz;
    alter table canonical_teaching_dictionary_dictation_sentences add column id uuid default gen_random_uuid(), add column import_batch_id uuid, add column source_sheet text, add column source_row_number int, add column source_category text, add column source_use_note text, add column confidence text, add column reviewed_by text, add column reviewed_at timestamptz, add column updated_at timestamptz;
    alter table canonical_teaching_dictionary_word_morphology add column id uuid default gen_random_uuid(), add column import_batch_id uuid, add column source_sheet text, add column source_row_number int, add column raw_morpholex_segmentation text, add column raw_morpholex_pos text, add column morphology_parts jsonb, add column morphology_joins jsonb, add column feature_keys jsonb, add column transformation_notes text, add column word_sum text, add column analysis_status text, add column source_category text, add column source_name text, add column source_url text, add column source_licence text, add column source_use_note text, add column confidence text, add column review_status text, add column reviewed_by text, add column reviewed_at timestamptz, add column review_notes text;
    alter table teaching_dictionary_manager_drafts add column source_reference text, add column created_at timestamptz default clock_timestamp();
    create table teaching_dictionary_manager_publications(draft_id uuid primary key, canonical_word_id uuid, published_by uuid, published_at timestamptz default now());
    create table teaching_dictionary_definition_versions(canonical_word_id uuid,definition text,draft_id uuid,route_id text,micro_skill_key text,published_at timestamptz default now());
    create table canonical_teaching_dictionary_prefix_members(id uuid default gen_random_uuid(),canonical_word_id uuid,prefix_profile_id uuid,row_status text,assignment_eligible boolean);
    create table canonical_teaching_dictionary_base_word_family_members(canonical_word_id uuid,row_status text);
    create table canonical_teaching_dictionary_compound_structures_v2(canonical_word_id uuid);
    create table canonical_teaching_dictionary_compound_facts(canonical_word_id uuid);
    create table canonical_teaching_dictionary_word_support(canonical_word_id uuid,row_status text);
    create table adle_reviewed_word_skill_pairs(canonical_word_id uuid);
    create table adle_learning_items(canonical_word_id uuid,row_status text);
  `);
  await db.exec(`
    alter table canonical_teaching_dictionary_import_batches add column release_id uuid, add column package_sha256 text;
    create table adle_curriculum_dependency_authorities(id uuid primary key default gen_random_uuid(),authority_key text,authority_type text,schema_version int,source_classification text,manifest_file_sha256 text,authority_manifest jsonb,authority_manifest_sha256 text,semantic_projection jsonb,semantic_fingerprint text,source_provenance jsonb,approval_refs jsonb,published_by text,unique(authority_type,authority_key));
    create table adle_teaching_dictionary_closure_words(authority_id uuid,word_key text,canonical_word_id uuid,canonical_word_import_batch_id uuid,canonical_word_source_row_hash text,canonical_word_release_id uuid,canonical_word_package_sha256 text,dictation_sentence_id uuid,dictation_import_batch_id uuid,dictation_source_row_hash text,dictation_release_id uuid,dictation_package_sha256 text,normalised_word text,display_word text,dialect_code text,dictation_sentence text,dictation_target_token_index int,dictation_target_end_exclusive int,exact_governed_answer text,audio_text text,semantic_fingerprint text);
    create table adle_curriculum_release_manifests(id uuid primary key default gen_random_uuid(),release_key text,release_manifest_sha256 text,manifest_payload jsonb,dependency_fingerprint text,route_id text,route_version text,published_by text,published_at timestamptz default now());
    create table adle_route_activation_revisions(id uuid primary key default gen_random_uuid(),activation_status text,release_manifest_id uuid,release_manifest_sha256 text,dependency_fingerprint text,readiness_report jsonb);
    create table adle_route_activation_heads(environment_key text,route_id text,micro_skill_key text,current_revision_id uuid);
    create function adle_canonical_json_sha256_v1(jsonb) returns text language sql as $$select adle_generic_snapshot_json_sha256_v1($1)$$;
    create function set_adle_route_activation_revision_v2(text,text,text,text,text,jsonb,uuid,text,text) returns uuid language plpgsql as $$declare v_id uuid;v_release uuid;begin
      if not exists(select 1 from adle_route_activation_heads where micro_skill_key=$2 and environment_key=$3 and current_revision_id=$7) then raise exception 'CAS failed'; end if;
      select id into v_release from adle_curriculum_release_manifests where release_manifest_sha256=$1;
      insert into adle_route_activation_revisions(activation_status,release_manifest_id,release_manifest_sha256,readiness_report)values($4,v_release,$1,$6)returning id into v_id;
      update adle_route_activation_heads set current_revision_id=v_id where current_revision_id=$7;return v_id;end$$;
    -- Native package validation is covered separately by the existing route SQL
    -- regressions. This stub isolates the new guarded transaction and rollback.
    create function publish_adle_ing_package_v1(jsonb,text,text) returns uuid language plpgsql as $$declare v_id uuid;begin
      insert into adle_curriculum_release_manifests(release_key,release_manifest_sha256,manifest_payload,route_id,published_by)values($1#>>'{manifest,releaseKey}',$2,$1->'manifest',$1#>>'{manifest,route,routeId}',$3)returning id into v_id;return v_id;end$$;
  `);
  const compoundMigration=readFileSync("supabase/migrations/20260811210000_publish_compound_word_v2_release_authority.sql","utf8");
  await db.exec(compoundMigration.slice(compoundMigration.indexOf("create or replace function public.publish_adle_compound_word_structure_authority_v1("),compoundMigration.indexOf("revoke all on function public.publish_adle_compound_word_structure_authority_v1")));
  for (const file of ["20261015120000_adle_lesson_editorial_reviews.sql", "20261015121000_adle_replace_reviewed_affix_members.sql", "20261015122000_adle_require_explicit_morphology_review.sql", "20261015150000_teaching_dictionary_word_workspace.sql", "20261015151000_teaching_dictionary_atomic_launch.sql", "20261015151500_teaching_dictionary_reviewed_closure.sql", "20261015152000_teaching_dictionary_governed_launch.sql", "20261015153000_teaching_dictionary_workspace_compatibility.sql"]) await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
  const actor=randomUUID(), word=randomUUID(), profile=randomUUID(), draft=randomUUID();
  const skill="D4_MOR_SUFFIXES_ABLE_IBLE";
  await db.query("insert into auth.users values($1)",[actor]);
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,display_word,source_row_hash,row_status,review_status,age_band,frequency_band,complexity_band,source_category,source_name,source_use_note,confidence) values($1,'responsible','en-GB','responsible','old-word','active','approved_for_first_exposure','middle_primary','common','moderate','internal_authored','Editor','Reviewed','high')",[word]);
  await db.query("insert into canonical_teaching_dictionary_word_metadata(canonical_word_id,source_row_hash,row_status,review_status,syllables,phoneme_hint,stress_pattern,has_schwa,written_syllable_breakdown) values($1,'old-meta','active','approved_for_first_exposure','4','old','second',true,'re-spon-si-ble')",[word]);
  await db.query("insert into canonical_teaching_dictionary_dictation_sentences(canonical_word_id,source_row_hash,row_status,review_status,dictation_sentence,audio_text,dictation_target_token_index) values($1,'old-sentence','active','approved_for_first_exposure','Be responsible.','Be responsible.',1)",[word]);
  await db.query("insert into canonical_teaching_dictionary_suffix_profiles(id,micro_skill_key,source_row_hash,row_status,review_status,production_enabled,meaning_bins) values($1,$2,'profile-v1','active','approved_for_first_exposure',true,$3)",[profile,skill,JSON.stringify([{id:'possible'}])]);
  await db.query("insert into canonical_teaching_dictionary_suffix_members(suffix_profile_id,canonical_word_id,member_role,row_status,review_status,assignment_eligible) values($1,$2,'transfer','active','approved_for_first_exposure',true)",[profile,word]);
  const parts=[{id:'part_1',kind:'root',surfaceText:'respons',sourceText:'respons',gloss:'answer',displayRange:{start:0,end:7}},{id:'part_2',kind:'suffix',surfaceText:'ible',sourceText:'ible',gloss:'capable of',displayRange:{start:7,end:11}}];
  const joins=[{afterPartId:'part_1',beforePartId:'part_2',joinType:'none'}];
  const route={routeId:'dynamic_affix_word_lab',routeVersion:'v3',microSkillKey:skill,wordMeaning:'answerable',wordSum:'respons + ible → responsible',content:{expectedProfileId:profile,expectedSourceRowHash:'profile-v1',suffixVariant:'ible',semanticBaseText:'respons',semanticBaseKind:'root',baseMeaning:'answer',meaningBinKey:'possible',teachingSplitParts:parts,teachingSplitJoins:joins,trueMorphologyParts:parts,trueMorphologyJoins:joins,trueMorphologyProvenance:{status:'reviewed'},trueMorphologyTransformations:[]}};
  const payload={displayWord:'responsible',definition:'answerable',dictationSentence:'Be responsible.',dictationTargetTokenIndex:1,dictationVariants:[{id:'primary',sentence:'Be responsible.',targetTokenIndex:1,audioText:'Be responsible.'},{id:'alternate',sentence:'She is responsible.',targetTokenIndex:2,audioText:'She is responsible.'}],writtenSyllableBreakdown:'re-spon-si-ble',ageBand:'middle_primary',frequencyBand:'common',complexityBand:'moderate',metadata:{syllables:'4',phoneme_hint:'reviewed',stress_pattern:'second',has_schwa:true},canonicalMorphology:{parts,joins,featureKeys:[],wordSum:route.wordSum,analysisStatus:'approved',reviewNotes:'Reviewed',transformations:[]},provenance:{sourceCategory:'internal_authored',sourceName:'Editor',sourceUseNote:'Reviewed',confidence:'high'},skillKeys:[skill],routeContents:[route]};
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload,source_reference) values($1,$2,'responsible','en-GB',$3,'Reviewed')",[draft,word,JSON.stringify(payload)]);
  await assert.rejects(db.query('select publish_teaching_dictionary_manager_draft($1,$2)',[draft,actor]),/TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED/);
  const beforeFingerprint=(await db.query('select teaching_dictionary_route_dictionary_fingerprint($1) value',[word])).rows[0].value;
  await db.query('select review_teaching_dictionary_overview($1,$2)',[draft,actor]);
  const content=(await db.query('select stage_teaching_dictionary_route_draft($1,$2) ids',[draft,actor])).rows[0].ids[0];
  await db.query('select review_teaching_dictionary_route_content($1,$2)',[content,actor]);
  const args=['dynamic_affix_word_lab',skill,[content],profile,'profile-v1','a'.repeat(64),actor,JSON.stringify({[word]:[word]})];
  await assert.rejects(db.query('select launch_teaching_dictionary_lesson_v2($1,$2,$3,$4,$5,$6,$7,$8)',[...args.slice(0,4),'stale',...args.slice(5)]),/TEACHING_LESSON_PROFILE_CHANGED/);
  const launch=(await db.query('select launch_teaching_dictionary_lesson_v2($1,$2,$3,$4,$5,$6,$7,$8) id',args)).rows[0].id;
  assert.equal((await db.query("select phoneme_hint from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active'",[word])).rows[0].phoneme_hint,'reviewed');
  assert.equal((await db.query('select jsonb_array_length(variants)::int n from teaching_dictionary_dictation_sets')).rows[0].n,2);
  await assert.rejects(db.query('select launch_teaching_dictionary_lesson_v2($1,$2,$3,$4,$5,$6,$7,$8)',args),/TEACHING_LESSON_ALREADY_RELEASED/);
  await db.query('select rollback_teaching_dictionary_launch_v2($1,$2,$3)',[launch,actor,'Restore fixture']);
  assert.equal((await db.query("select phoneme_hint from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active'",[word])).rows[0].phoneme_hint,'old');
  assert.equal((await db.query("select id from canonical_teaching_dictionary_suffix_profiles where row_status='active'")).rows[0].id,profile);
  assert.equal((await db.query('select count(*)::int n from teaching_dictionary_dictation_heads')).rows[0].n,0);
  assert.equal((await db.query('select teaching_dictionary_route_dictionary_fingerprint($1) value',[word])).rows[0].value,beforeFingerprint,'rollback restores the prior semantic dictionary fingerprint, including an absent definition');

  const groupWord=randomUUID(),groupDraft=randomUUID(),oldRelease=randomUUID(),oldRevision=randomUUID();
  const groupSkill='D4_INF_ING_ENDINGS_JUST_ADD_ING',groupRoute='ing_endings_word_lab';
  const groupPayload={...payload,displayWord:'jumping',dictationSentence:'She is jumping.',dictationTargetTokenIndex:2,
    dictationVariants:[{id:'primary',sentence:'She is jumping.',targetTokenIndex:2,audioText:'She is jumping.'}],writtenSyllableBreakdown:'jump-ing',
    routeContents:[{routeId:groupRoute,routeVersion:'v1',microSkillKey:groupSkill,wordMeaning:'moving upwards',wordSum:'jump + ing → jumping',content:{base:'jump'}}]};
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,display_word,row_status,review_status,source_row_hash)values($1,'jumping','en-GB','jumping','active','approved_for_first_exposure','initial')",[groupWord]);
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload,source_reference)values($1,$2,'jumping','en-GB',$3,'Group proof')",[groupDraft,groupWord,JSON.stringify(groupPayload)]);
  await db.query('select review_teaching_dictionary_overview($1,$2)',[groupDraft,actor]);
  const groupContent=(await db.query('select stage_teaching_dictionary_route_draft($1,$2) ids',[groupDraft,actor])).rows[0].ids[0];
  await db.query('select review_teaching_dictionary_route_content($1,$2)',[groupContent,actor]);
  await db.query("insert into adle_curriculum_release_manifests(id,release_manifest_sha256)values($1,$2)",[oldRelease,'b'.repeat(64)]);
  await db.query("insert into adle_route_activation_revisions(id,activation_status,release_manifest_id,release_manifest_sha256)values($1,'enabled',$2,$3)",[oldRevision,oldRelease,'b'.repeat(64)]);
  await db.query("insert into adle_route_activation_heads values('staging',$1,$2,$3)",[groupRoute,groupSkill,oldRevision]);
  const pkg={schemaVersion:1,activation:'inactive',manifest:{releaseKey:'reviewed-group',route:{routeId:groupRoute},microSkills:[{microSkillKey:groupSkill}],approvalRefs:[`admin-review:${groupContent}`]},authorities:[{authorityType:'ing_word_members',semanticProjection:{microSkillKey:groupSkill,words:[{canonicalWordId:groupWord}]}}]};
  const packageHash=(await db.query('select adle_generic_snapshot_json_sha256_v1($1::jsonb) hash',[JSON.stringify(pkg)])).rows[0].hash;
  const nativeArgs=[groupRoute,groupSkill,[groupContent],JSON.stringify({...pkg,packageSha256:packageHash}),packageHash,oldRevision,'staging','c'.repeat(64),actor,JSON.stringify({[groupWord]:[groupWord]})];
  const launchSql='select launch_teaching_dictionary_governed_package_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id';
  await assert.rejects(db.query(launchSql,[...nativeArgs.slice(0,5),randomUUID(),...nativeArgs.slice(6)]),/TEACHING_LESSON_ACTIVATION_CHANGED/);
  const groupLaunch=(await db.query(launchSql,nativeArgs)).rows[0].id;
  assert.equal((await db.query('select count(*)::int n from teaching_dictionary_route_content_publications where content_version_id=$1',[groupContent])).rows[0].n,1);
  assert.equal((await db.query('select readiness_report from adle_route_activation_revisions where id=(select current_revision_id from adle_route_activation_heads where micro_skill_key=$1)',[groupSkill])).rows[0].readiness_report.scope.kind,'all_eligible');
  await assert.rejects(db.query(launchSql,nativeArgs),/TEACHING_LESSON_ALREADY_RELEASED/);
  await db.query('select rollback_teaching_dictionary_launch_v2($1,$2,$3)',[groupLaunch,actor,'Restore native fixture']);
  assert.equal((await db.query('select release_manifest_id from adle_route_activation_revisions where id=(select current_revision_id from adle_route_activation_heads where micro_skill_key=$1)',[groupSkill])).rows[0].release_manifest_id,oldRelease);
  assert.equal((await db.query('select count(*)::int n from teaching_dictionary_dictation_heads where canonical_word_id=$1',[groupWord])).rows[0].n,0);

  const compatibilityDraft=randomUUID();const modern={...groupPayload,dictationVariants:[...groupPayload.dictationVariants,{id:"alternate",sentence:"They are jumping.",targetTokenIndex:2,audioText:"They are jumping."}],routeContents:[],canonicalMorphology:{...groupPayload.canonicalMorphology,transformations:[{type:'base_spelling_change',sourcePartId:'part_1',sourceText:'jump',surfaceText:'jump',explanation:'Compatibility fixture'}]}};
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload,source_reference)values($1,$2,'jumping','en-GB',$3,'Compatibility proof')",[compatibilityDraft,groupWord,JSON.stringify(modern)]);
  await db.query('select review_teaching_dictionary_overview($1,$2)',[compatibilityDraft,actor]);await db.query('select publish_teaching_dictionary_manager_draft($1,$2)',[compatibilityDraft,actor]);
  const legacyDraft=randomUUID(),legacy=structuredClone(modern);delete legacy.dictationVariants;delete legacy.writtenSyllableBreakdown;delete legacy.canonicalMorphology.transformations;legacy.metadata.phoneme_hint='New pronunciation';
  await db.query("insert into teaching_dictionary_manager_drafts(id,canonical_word_id,normalised_word,dialect_code,payload,source_reference)values($1,$2,'jumping','en-GB',$3,'Earlier editor')",[legacyDraft,groupWord,JSON.stringify(legacy)]);
  await db.query('select publish_teaching_dictionary_manager_draft($1,$2)',[legacyDraft,actor]);
  assert.equal((await db.query("select written_syllable_breakdown from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active'",[groupWord])).rows[0].written_syllable_breakdown,'jump-ing');
  assert.deepEqual((await db.query("select morphology_transformations from canonical_teaching_dictionary_word_morphology where canonical_word_id=$1 and row_status='active'",[groupWord])).rows[0].morphology_transformations,modern.canonicalMorphology.transformations);
  assert.equal((await db.query('select jsonb_array_length(s.variants)::int n from teaching_dictionary_dictation_heads h join teaching_dictionary_dictation_sets s on s.id=h.set_id where h.canonical_word_id=$1',[groupWord])).rows[0].n,2);
  console.log('PASS: earlier editor preserves reviewed syllables and transformations during schema-first rollout');
  console.log('PASS: native head CAS, reviewed package transaction, global scope and audited native rollback');
  console.log('PASS: protected replacement, immutable variant set, stale launch, duplicate launch and full rollback');
} catch(error) { console.error({message:error.message,code:error.code,where:error.where});process.exitCode=1; } finally { await db.close(); }
