/** Disposable PostgreSQL contract test for the new admin migration.
 * Existing canonical-resolver RPCs are represented by small fixture stubs;
 * their own regressions cover their internal mapping and visibility rules. */
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, delimiter } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = process.env.PATH?.split(delimiter).map(p => resolve(p, '../@electric-sql/pglite')).find(p => existsSync(p));
if (!root) throw new Error('pglite unavailable');
const { PGlite } = require(root);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create table children(id uuid primary key);
create table micro_skill_catalog(micro_skill_key text primary key,mastery_domain_key text,skill_family_key text,skill_cluster_key text,display_name text,practice_route text,is_active boolean,is_assignable boolean,allowed_template_keys text[] default array[]::text[],metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
insert into micro_skill_catalog(micro_skill_key,mastery_domain_key,skill_family_key,skill_cluster_key,display_name,practice_route,is_active,is_assignable) values('D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO','D4','D4_HOM','D4_HOM_FUNCTION_WORD_HOMOPHONES','Choose to, too, and two by meaning','word_practice',true,true);
create table micro_skill_families(skill_family_key text primary key,mastery_domain_key text,display_name text,is_active boolean,is_assignable boolean);
create table micro_skill_clusters(skill_cluster_key text primary key,mastery_domain_key text,skill_family_key text,display_name text,is_active boolean,is_assignable boolean);
create table canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,row_status text,review_status text);
create table canonical_teaching_dictionary_word_support(canonical_word_id uuid,micro_skill_key text,row_status text,review_status text);
create table canonical_teaching_dictionary_content_versions(micro_skill_key text,is_active boolean,version_status text,final_readiness_review_status text);
create table adle_family_methods(family_key text,row_status text);
insert into adle_family_methods(family_key,row_status) values('D4_HOM','active');
create table adle_learning_items(id uuid primary key default gen_random_uuid(),child_id uuid,canonical_word_id uuid,micro_skill_key text,item_status text,source_kind text,source_ref text,reteach_priority boolean,intake_on date,row_status text,created_at timestamptz default now(),updated_at timestamptz default now());
create table writing_occurrences(id text primary key,observed_text text);
create table writing_issues(id uuid primary key,observed_text text,approved_replacement text,metadata jsonb,issue_status text,final_classification text,source_writing_occurrence_id text,parent_user_id uuid,child_id uuid,micro_skill_key text,updated_at timestamptz);
create table writing_context_parent_decisions(id uuid primary key,occurrence_id text,child_id uuid,parent_user_id uuid,classification text,intended_member text,supersedes_decision_id uuid);
create view writing_context_current_parent_decisions as select * from writing_context_parent_decisions;
create table writing_context_parent_added_cases(id uuid primary key,occurrence_id text,child_id uuid,parent_user_id uuid,intended_member text,writing_issue_id uuid,governed_family_key text);
create table writing_context_catalog_review_cases(id uuid primary key,parent_added_case_id uuid,case_status text,created_at timestamptz,reviewed_at timestamptz);
create table spelling_canonical_mappings(id uuid primary key,misspelling_normalized text,correct_spelling_normalized text,dialect_code text,micro_skill_key text,mapping_status text,resolver_visibility_status text,created_at timestamptz default now());
create table spelling_resolution_items(id uuid primary key,misspelling text,correction text,dialect_code text,review_status text,mapping_id uuid,micro_skill_key text,resolver_enabled boolean default false,created_at timestamptz default now(),updated_at timestamptz);
create table spelling_no_matching_skill_cases(resolution_item_id uuid unique,case_status text default 'open',moved_by_admin_user_id uuid,moved_by_admin_email text,moved_at timestamptz default now(),returned_at timestamptz);
create table spelling_resolution_item_sources(item_id uuid,source_type text,source_id uuid);
create table spelling_catalog_review_cases(id uuid primary key,child_id uuid,source_misspelling_instance_id uuid,misspelling_normalized text,correct_spelling_normalized text,case_status text,updated_at timestamptz,parent_note text,metadata jsonb);
create table spelling_catalog_review_case_decisions(id uuid primary key default gen_random_uuid(),case_id uuid,admin_user_id uuid,admin_email text,linked_micro_skill_key text,decision_type text,previous_status text,new_status text,decision_note text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
create function reconcile_contextual_adle_learning_need(uuid,uuid,uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function finalise_contextual_learning_item(uuid,uuid,uuid,text) returns jsonb language sql as $$ select jsonb_build_object('learning_item_id',gen_random_uuid()) $$;
create function return_no_matching_skill_to_resolution_admin(uuid,uuid) returns uuid language plpgsql as $$begin update spelling_resolution_items set review_status='pending' where id=$1; return $1; end$$;
create function confirm_spelling_resolution_admin(uuid,uuid,text,text) returns uuid language plpgsql as $$begin update spelling_resolution_items set review_status='confirmed' where id=$1; return gen_random_uuid(); end$$;
create function set_spelling_canonical_mapping_resolver_visibility_admin(uuid,text,uuid,text,text,jsonb) returns uuid language plpgsql as $$begin update spelling_canonical_mappings set resolver_visibility_status=$2 where id=$1; return $1; end$$;
set check_function_bodies=off;
`);
const seededChild='66666666-6666-4666-8666-666666666666';
const seededCase='77777777-7777-4777-8777-777777777777';
const seededAdmin='11111111-1111-4111-8111-111111111111';
await db.query('insert into children(id) values($1)',[seededChild]);
await db.query('insert into spelling_catalog_review_cases(id,child_id,source_misspelling_instance_id,misspelling_normalized,correct_spelling_normalized,case_status,updated_at,metadata) values($1,$2,$3,$4,$5,$6,now(),$7)',[seededCase,seededChild,randomUUID(),'to','too','linked_existing_skill',{}]);
await db.query('insert into spelling_catalog_review_case_decisions(id,case_id,admin_user_id,linked_micro_skill_key,decision_type,created_at) values($1,$2,$3,$4,$5,now())',[randomUUID(),seededCase,seededAdmin,'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO','linked_existing_skill']);
const source = readFileSync('supabase/migrations/20261004120000_no_matching_skill_creation.sql','utf8');
try { await db.exec(source); console.log('Migration DDL parsed and applied in disposable PGlite fixture'); }
catch(e) { console.error(e.message); process.exitCode=1; }
if (!process.exitCode) {
  const followup = readFileSync('supabase/migrations/20261004220000_reuse_existing_canonical_mapping_for_catalog_case.sql','utf8');
  try { await db.exec(followup); console.log('Existing-mapping catalog correction migration parsed and applied'); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}
if (!process.exitCode) {
  const followup = readFileSync('supabase/migrations/20261004230000_move_disabled_mapping_to_no_matching_skill.sql','utf8');
  try { await db.exec(followup); console.log('Disabled-mapping No Matching Skill migration parsed and applied'); }
  catch(e) { console.error(e.message); process.exitCode=1; }
}

if (!process.exitCode) {
  const seeded=await db.query('select count(*)::integer pair_count from contextual_micro_skill_pairs where micro_skill_key=$1',['D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO']);
  if (seeded.rows[0].pair_count!==3) throw new Error('existing homophone word set was not migrated');
  const earlier=await db.query('select confirmed_count from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2',[seededChild,'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO']);
  if (earlier.rows[0].confirmed_count!==1) throw new Error('earlier parent catalog confirmation was not counted');
  console.log('Existing to/too/two micro skill migrated into the reviewed pair registry');
  const admin='11111111-1111-4111-8111-111111111111';
  const child='22222222-2222-4222-8222-222222222222';
  const brakeMapping=randomUUID(), brakeItem=randomUUID();
  await db.query('insert into spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,dialect_code,mapping_status,resolver_visibility_status) values($1,$2,$3,$4,$5,$6)',[brakeMapping,'brake','break','en-GB','disabled','disabled']);
  await db.query('insert into spelling_resolution_items(id,misspelling,correction,dialect_code,review_status,mapping_id) values($1,$2,$3,$4,$5,$6)',[brakeItem,'brake','break','en-GB','pending',brakeMapping]);
  await db.query('select move_spelling_resolution_to_no_matching_skill_admin($1,$2,$3)',[brakeItem,admin,'admin@example.test']);
  const moved=await db.query('select (select review_status from spelling_resolution_items where id=$1) status,(select mapping_id is null from spelling_resolution_items where id=$1) detached,(select case_status from spelling_no_matching_skill_cases where resolution_item_id=$1) queue_status,(select mapping_status from spelling_canonical_mappings where id=$2) historical_status',[brakeItem,brakeMapping]);
  if (moved.rows[0].status!=='no_matching_skill' || !moved.rows[0].detached || moved.rows[0].queue_status!=='open' || moved.rows[0].historical_status!=='disabled') throw new Error(JSON.stringify(moved.rows[0]));
  const activeMapping=randomUUID(), activeItem=randomUUID();
  await db.query('insert into spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,dialect_code,mapping_status,resolver_visibility_status) values($1,$2,$3,$4,$5,$6)',[activeMapping,'sun','son','en-GB','active','visible']);
  await db.query('insert into spelling_resolution_items(id,misspelling,correction,dialect_code,review_status,mapping_id,resolver_enabled) values($1,$2,$3,$4,$5,$6,$7)',[activeItem,'sun','son','en-GB','pending',activeMapping,true]);
  let moveRejected=false;
  try { await db.query('select move_spelling_resolution_to_no_matching_skill_admin($1,$2,$3)',[activeItem,admin,'admin@example.test']); }
  catch(e) { moveRejected=String(e.message).includes('Only pending, resolver-inactive'); }
  if (!moveRejected) throw new Error('active resolver mapping was moved to No Matching Skill');
  console.log('Brake/break moves with disabled mapping history preserved; active mappings stay protected');
  const issue='33333333-3333-4333-8333-333333333333';
  const parentCase='44444444-4444-4444-8444-444444444444';
  const review='55555555-5555-4555-8555-555555555555';
  await db.query('insert into auth.users(id) values($1)',[admin]);
  await db.query('insert into children(id) values($1)',[child]);
  await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',['occ-1','there']);
  await db.query('insert into writing_issues(id) values($1)',[issue]);
  await db.query('insert into writing_context_parent_added_cases(id,occurrence_id,child_id,parent_user_id,intended_member,writing_issue_id) values($1,$2,$3,$4,$5,$6)',[parentCase,'occ-1',child,admin,'their',issue]);
  await db.query('insert into writing_context_catalog_review_cases(id,parent_added_case_id,case_status,created_at) values($1,$2,$3,now())',[review,parentCase,'open']);
  const payload={mode:'new',classification:'context',family_key:'D4_HOM',new_family_name:'Homophones',cluster_key:'D4_HOM_TEST',new_cluster_name:'Test homophones',micro_skill_key:'D4_HOM_TEST_THERE',display_name:'Choose there and their',practice_route:'word_practice',members:['there','their','they’re']};
  await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`context:${review}`,admin,'admin@example.test',payload]);
  const result=await db.query('select (select count(*) from contextual_micro_skill_pairs where micro_skill_key=$2) pair_count,(select confirmed_count from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2) confirmed_count,(select case_status from writing_context_catalog_review_cases where id=$3) case_status',[child,payload.micro_skill_key,review]);
  if (result.rows[0].pair_count!==3 || result.rows[0].confirmed_count!==1 || result.rows[0].case_status!=='reviewed') throw new Error(JSON.stringify(result.rows[0]));
  console.log('Context skill creation, full-set pair registration, case resolution, and count passed');
  for (let n=2;n<=3;n++) {
    const parentId=randomUUID();
    const reviewId=randomUUID();
    const issueId=randomUUID();
    await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',[`occ-${n}`, n===2?'their':"they're"]);
    await db.query('insert into writing_issues(id) values($1)',[issueId]);
    await db.query('insert into writing_context_parent_added_cases(id,occurrence_id,child_id,parent_user_id,intended_member,writing_issue_id) values($1,$2,$3,$4,$5,$6)',[parentId,`occ-${n}`,child,admin,'there',issueId]);
    await db.query('insert into writing_context_catalog_review_cases(id,parent_added_case_id,case_status,created_at) values($1,$2,$3,now())',[reviewId,parentId,'open']);
  }
  const demand=await db.query('select confirmed_count,demand_status from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2',[child,payload.micro_skill_key]);
  if (demand.rows[0].confirmed_count!==3 || demand.rows[0].demand_status!=='PENDING_WORD_SUPPORT') throw new Error(JSON.stringify(demand.rows[0]));
  console.log('Three distinct parent confirmations route automatically; ADLE stays blocked without approved word support');
  const extraIssue=randomUUID(), extraParent=randomUUID(), extraReview=randomUUID();
  await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',['occ-conflict','there']);
  await db.query('insert into writing_issues(id) values($1)',[extraIssue]);
  await db.query('insert into writing_context_parent_added_cases(id,occurrence_id,child_id,parent_user_id,intended_member,writing_issue_id) values($1,$2,$3,$4,$5,$6)',[extraParent,'occ-conflict',child,admin,'their',extraIssue]);
  await db.query('insert into writing_context_catalog_review_cases(id,parent_added_case_id,case_status,created_at) values($1,$2,$3,now())',[extraReview,extraParent,'open']);
  const auto=await db.query('select case_status from writing_context_catalog_review_cases where id=$1',[extraReview]);
  if (auto.rows[0].case_status!=='reviewed') throw new Error('approved pair failed to route');
  const deleteIssue=randomUUID(), deleteParent=randomUUID(), deleteReview=randomUUID();
  await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',['occ-delete','eight']);
  await db.query('insert into writing_issues(id) values($1)',[deleteIssue]);
  await db.query('insert into writing_context_parent_added_cases(id,occurrence_id,child_id,parent_user_id,intended_member,writing_issue_id) values($1,$2,$3,$4,$5,$6)',[deleteParent,'occ-delete',child,admin,'ate',deleteIssue]);
  await db.query('insert into writing_context_catalog_review_cases(id,parent_added_case_id,case_status,created_at) values($1,$2,$3,now())',[deleteReview,deleteParent,'open']);
  await db.query('select delete_no_matching_skill_admin($1,$2)',[`context:${deleteReview}`,admin]);
  const deleted=await db.query('select (select count(*) from writing_context_catalog_review_cases where id=$1) admin_case,(select count(*) from writing_context_parent_added_cases where id=$2) parent_source',[deleteReview,deleteParent]);
  if (deleted.rows[0].admin_case!==0 || deleted.rows[0].parent_source!==1) throw new Error(JSON.stringify(deleted.rows[0]));
  console.log('Approved pair auto-routing and confirmed admin-case-only deletion passed');
  const spellRow=randomUUID();
  await db.query('insert into spelling_resolution_items(id,misspelling,correction,dialect_code,review_status,updated_at) values($1,$2,$3,$4,$5,now())',[spellRow,'there','their','en-GB','no_matching_skill']);
  await db.query('insert into spelling_no_matching_skill_cases(resolution_item_id,case_status) values($1,$2)',[spellRow,'open']);
  let rejected=false;
  try { await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`resolution:${spellRow}`,admin,'admin@example.test',{mode:'existing',classification:'spelling',micro_skill_key:payload.micro_skill_key}]); }
  catch(e) { rejected=String(e.message).includes('valid_word_cannot_enter_spelling_resolver'); }
  if (!rejected) throw new Error('valid word entered spelling resolver');
  console.log('Valid-word resolver activation rejected');
  const misspellingRow=randomUUID();
  await db.query('insert into spelling_resolution_items(id,misspelling,correction,dialect_code,review_status,updated_at) values($1,$2,$3,$4,$5,now())',[misspellingRow,'thier','their','en-GB','no_matching_skill']);
  await db.query('insert into spelling_no_matching_skill_cases(resolution_item_id,case_status) values($1,$2)',[misspellingRow,'open']);
  await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`resolution:${misspellingRow}`,admin,'admin@example.test',{mode:'existing',classification:'spelling',micro_skill_key:payload.micro_skill_key}]);
  const spelling=await db.query('select review_status,micro_skill_key from spelling_resolution_items where id=$1',[misspellingRow]);
  if (spelling.rows[0].review_status!=='confirmed' || spelling.rows[0].micro_skill_key!==payload.micro_skill_key) throw new Error(JSON.stringify(spelling.rows[0]));
  console.log('Genuine misspelling takes atomic confirm-and-enable route');
  for (const [observed,intended] of [['natrual','natural'],['buisness','business']]) {
    const caseId=randomUUID(), itemId=randomUUID(), mappingId=randomUUID();
    await db.query('insert into spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,dialect_code,micro_skill_key,mapping_status,resolver_visibility_status) values($1,$2,$3,$4,$5,$6,$7)',[mappingId,observed,intended,'en-GB',payload.micro_skill_key,'active','visible']);
    await db.query('insert into spelling_resolution_items(id,misspelling,correction,dialect_code,review_status,mapping_id,updated_at) values($1,$2,$3,$4,$5,$6,now())',[itemId,observed,intended,'en-GB','confirmed',mappingId]);
    await db.query('insert into spelling_catalog_review_cases(id,child_id,source_misspelling_instance_id,misspelling_normalized,correct_spelling_normalized,case_status,updated_at,metadata) values($1,$2,$3,$4,$5,$6,now(),$7)',[caseId,child,randomUUID(),observed,intended,'needs_new_micro_skill',{}]);
    await db.query('insert into spelling_resolution_item_sources(item_id,source_type,source_id) values($1,$2,$3)',[itemId,'catalog',caseId]);
    await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`catalog:${caseId}`,admin,'admin@example.test',{mode:'existing',classification:'spelling',micro_skill_key:payload.micro_skill_key}]);
    const linked=await db.query('select (select case_status from spelling_catalog_review_cases where id=$1) status,(select count(*)::integer from spelling_catalog_review_case_decisions where case_id=$1 and decision_type=$2) decision_count,(select count(*)::integer from spelling_canonical_mappings where misspelling_normalized=$3 and correct_spelling_normalized=$4) mapping_count',[caseId,'linked_existing_skill',observed,intended]);
    if (linked.rows[0].status!=='linked_existing_skill' || linked.rows[0].decision_count!==1 || linked.rows[0].mapping_count!==1) throw new Error(JSON.stringify(linked.rows[0]));
  }
  const mismatchedCase=randomUUID();
  await db.query('insert into spelling_catalog_review_cases(id,child_id,source_misspelling_instance_id,misspelling_normalized,correct_spelling_normalized,case_status,updated_at,metadata) values($1,$2,$3,$4,$5,$6,now(),$7)',[mismatchedCase,child,randomUUID(),'natrual','natural','needs_new_micro_skill',{}]);
  rejected=false;
  try { await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`catalog:${mismatchedCase}`,admin,'admin@example.test',{mode:'existing',classification:'spelling',micro_skill_key:'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO'}]); }
  catch(e) { rejected=String(e.message).includes('canonical_pair_already_linked_to_skill'); }
  if (!rejected) throw new Error('catalog case re-routed an already mapped spelling pair');
  console.log('Natural and business reuse existing resolver mappings; conflicting skill selection is rejected');
  const conflictIssue=randomUUID(), conflictParent=randomUUID(), conflictReview=randomUUID();
  await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',['occ-new-pair','sun']);
  await db.query('insert into writing_issues(id) values($1)',[conflictIssue]);
  await db.query('insert into writing_context_parent_added_cases(id,occurrence_id,child_id,parent_user_id,intended_member,writing_issue_id) values($1,$2,$3,$4,$5,$6)',[conflictParent,'occ-new-pair',child,admin,'son',conflictIssue]);
  await db.query('insert into writing_context_catalog_review_cases(id,parent_added_case_id,case_status,created_at) values($1,$2,$3,now())',[conflictReview,conflictParent,'open']);
  rejected=false;
  try { await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`context:${conflictReview}`,admin,'admin@example.test',{mode:'new',classification:'context',family_key:'D4_HOM',cluster_key:'D4_HOM_TEST',micro_skill_key:'D4_HOM_CONFLICT_TEST',display_name:'Choose sun and son',practice_route:'word_practice',members:['sun','son','there','their']}]); }
  catch(e) { rejected=String(e.message).includes('context_pair_already_linked_to_another_skill'); }
  if (!rejected) throw new Error('conflicting contextual pair was accepted');
  await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`context:${conflictReview}`,admin,'admin@example.test',{mode:'existing',classification:'context',micro_skill_key:payload.micro_skill_key,members:['sun','son']}]);
  const selected=await db.query('select micro_skill_key from contextual_micro_skill_pairs where member_a=$1 and member_b=$2',['son','sun']);
  if (selected.rows[0]?.micro_skill_key!==payload.micro_skill_key) throw new Error('existing skill selection failed');
  console.log('Duplicate pair rejected; existing skill selection linked');
  for (const member of ['there','their',"they're",'sun','son']) {
    const id=randomUUID();
    await db.query('insert into canonical_teaching_dictionary_words(id,normalised_word,row_status,review_status) values($1,$2,$3,$4)',[id,member,'active','approved_for_first_exposure']);
    await db.query('insert into canonical_teaching_dictionary_word_support(canonical_word_id,micro_skill_key,row_status,review_status) values($1,$2,$3,$4)',[id,payload.micro_skill_key,'active','approved_for_first_exposure']);
  }
  const waiting=await db.query('select demand_status from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2',[child,payload.micro_skill_key]);
  if (waiting.rows[0].demand_status!=='PENDING_TEACHING_CONTENT') throw new Error(JSON.stringify(waiting.rows[0]));
  await db.query('insert into canonical_teaching_dictionary_content_versions(micro_skill_key,is_active,version_status,final_readiness_review_status) values($1,true,$2,$3)',[payload.micro_skill_key,'active','signed_off']);
  const ready=await db.query('select confirmed_count,demand_status,adle_learning_item_id from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2',[child,payload.micro_skill_key]);
  if (ready.rows[0].demand_status!=='READY' || !ready.rows[0].adle_learning_item_id || ready.rows[0].confirmed_count<3) throw new Error(JSON.stringify(ready.rows[0]));
  console.log('Approved words, support, and content release exactly one ADLE item after the threshold');
  await db.query(`update writing_issues set observed_text='there',approved_replacement='their',
    metadata='{"source_kind":"contextual_advisory_v4","feedback_origin":"parent_added"}'::jsonb,
    issue_status='child_responded',source_writing_occurrence_id='occ-1',parent_user_id=$1,
    child_id=$2,micro_skill_key='unknown' where id=$3`,[admin,child,issue]);
  const finalised=await db.query('select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,$4,$5) result',[issue,admin,child,'concept_gap',payload.micro_skill_key]);
  if (!finalised.rows[0].result.learning_item_id) throw new Error('linked contextual case did not finalise');
  console.log('Previously unknown parent-added pair finalises through dynamic skill registry');
  const catalogCase=randomUUID(), previousMapping=randomUUID();
  await db.query('insert into spelling_canonical_mappings(id,misspelling_normalized,correct_spelling_normalized,dialect_code,mapping_status,resolver_visibility_status) values($1,$2,$3,$4,$5,$6)',[previousMapping,'there','their','en-GB','active','visible']);
  await db.query('insert into spelling_catalog_review_cases(id,child_id,source_misspelling_instance_id,misspelling_normalized,correct_spelling_normalized,case_status,updated_at,metadata) values($1,$2,$3,$4,$5,$6,now(),$7)',[catalogCase,child,randomUUID(),'there','their','open',{}]);
  await db.query('select resolve_no_matching_skill_admin($1,$2,$3,$4)',[`catalog:${catalogCase}`,admin,'admin@example.test',{mode:'existing',classification:'context',micro_skill_key:payload.micro_skill_key,members:['there','their','they’re','sun','son']}]);
  const catalogLinked=await db.query('select (select case_status from spelling_catalog_review_cases where id=$1) status,(select confirmed_count from contextual_micro_skill_demands where child_id=$2 and micro_skill_key=$3) confirmed_count,(select count(*)::integer from adle_learning_items where child_id=$2 and micro_skill_key=$3) item_count',[catalogCase,child,payload.micro_skill_key]);
  if (catalogLinked.rows[0].status!=='linked_existing_skill' || catalogLinked.rows[0].confirmed_count<4 || catalogLinked.rows[0].item_count!==1) throw new Error(JSON.stringify(catalogLinked.rows[0]));
  const disabled=await db.query('select resolver_visibility_status from spelling_canonical_mappings where id=$1',[previousMapping]);
  if (disabled.rows[0].resolver_visibility_status!=='disabled') throw new Error('old contextual resolver mapping remained visible');
  console.log('Parent spelling-catalog confirmation links to context skill and counts once without duplicating ADLE');
  const secondChild=seededChild;
  for (let n=1;n<=2;n++) {
    const occurrence=`legacy-to-${n}`;
    await db.query('insert into writing_occurrences(id,observed_text) values($1,$2)',[occurrence,'to']);
    await db.query('insert into writing_context_parent_decisions(id,occurrence_id,child_id,parent_user_id,classification,intended_member) values($1,$2,$3,$4,$5,$6)',[randomUUID(),occurrence,secondChild,admin,'INVALID','too']);
  }
  const legacy=await db.query('select confirmed_count,demand_status from contextual_micro_skill_demands where child_id=$1 and micro_skill_key=$2',[secondChild,'D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO']);
  if (legacy.rows[0].confirmed_count!==3 || legacy.rows[0].demand_status!=='PENDING_WORD_SUPPORT') throw new Error(JSON.stringify(legacy.rows[0]));
  console.log('Existing homophone family parent decisions reach the same three-confirmation threshold');
}
await db.close();
