// Run against staging after preparing a reviewed prefix draft. All publication
// and synthetic dependent-membership writes are rolled back by this proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const connectionString=process.env.SUPABASE_STAGING_DB_URL;
assert(connectionString?.includes('qkpjbajicacbrphthibk'));
const ready=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(ready.status,'ready_to_launch');
const db=new pg.Client({connectionString});await db.connect();
try {
  await db.query('begin');
  const {rows:[draft]}=await db.query(`select c.canonical_word_id,c.draft_id,d.payload
    from teaching_dictionary_route_content_versions c join teaching_dictionary_manager_drafts d on d.id=c.draft_id
    where c.id=$1`,[ready.reviewedCandidateIds[0]]);
  const check=async payload=>(await db.query('select teaching_dictionary_affix_draft_matches_canonical($1,$2,$3) ok',
    [draft.canonical_word_id,ready.microSkillKey,payload])).rows[0].ok;
  assert(await check(draft.payload));
  const changed=structuredClone(draft.payload);changed.senseSet.senses[0].definition='Unreviewed meaning';
  assert.equal(await check(changed),false);
  const spelling=structuredClone(draft.payload);spelling.displayWord+='x';assert.equal(await check(spelling),false);
  const parts=structuredClone(draft.payload);parts.canonicalMorphology.parts[0].gloss='Unreviewed prefix meaning';
  assert.equal(await check(parts),false);
  const {rows:[dependent]}=await db.query(`select id,micro_skill_key from canonical_teaching_dictionary_prefix_profiles
    where row_status='active' and review_status='approved_for_first_exposure' and id<>$1 order by id limit 1`,[ready.releaseId]);
  assert(dependent);
  // A synthetic link exercises the historical cross-lesson guard without
  // persisting a word in a lesson it does not belong to.
  await db.query(`insert into canonical_teaching_dictionary_prefix_members
    select (jsonb_populate_record(null::canonical_teaching_dictionary_prefix_members,
      to_jsonb(m)||jsonb_build_object('id',$3::uuid,'prefix_profile_id',$2::uuid,
        'source_row_hash',encode(extensions.digest($3::text,'sha256'),'hex')))).*
    from canonical_teaching_dictionary_prefix_members m
    where m.prefix_profile_id=$1 and m.canonical_word_id=$4 and m.row_status='active' limit 1`,
    [ready.releaseId,dependent.id,randomUUID(),draft.canonical_word_id]);
  const fingerprint=async()=>(await db.query(`select md5(to_jsonb(p)::text||coalesce((select string_agg(to_jsonb(m)::text,'' order by m.id)
    from canonical_teaching_dictionary_prefix_members m where m.prefix_profile_id=p.id),'')) hash
    from canonical_teaching_dictionary_prefix_profiles p where p.id=$1`,[dependent.id])).rows[0].hash;
  const before=await fingerprint();
  const result=await db.query(`select launch_teaching_dictionary_lesson_v2(p_route_id=>$1,p_micro_skill_key=>$2,
    p_versions=>$3,p_actor=>$4,p_expected_profile=>$5,p_expected_profile_hash=>$6,p_preflight_fingerprint=>$7,p_compiler_witnesses=>$8) id`,
    [ready.routeId,ready.microSkillKey,ready.reviewedCandidateIds,ready.actor,ready.releaseId,ready.profileSourceHash,
      ready.preflightFingerprint,ready.compilerWitnesses]);
  assert(result.rows[0].id);assert.equal(await fingerprint(),before,'Dependent lesson snapshot must stay unchanged');
  const queued=await db.query(`select * from teaching_dictionary_lesson_review_requests where canonical_word_id=$1
    and micro_skill_key=$2 and request_id=$3 and environment_key='staging'`,
    [draft.canonical_word_id,dependent.micro_skill_key,ready.reviewedCandidateIds[0]]);
  assert.equal(queued.rows.length,1,'Dependent lesson must receive a review request');
  await db.query('rollback');
  const {rows:[active]}=await db.query(`select id from canonical_teaching_dictionary_prefix_profiles
    where micro_skill_key=$1 and row_status='active'`,[ready.microSkillKey]);
  assert.equal(active.id,ready.releaseId,'Rollback must restore the original lesson pool');
  console.log({passed:true,canonicalFactsChecked:true,unreviewedChangesRejected:true,
    dependentSnapshotPreserved:true,dependentReviewQueued:true,publicationRehearsed:true,rolledBack:true});
} finally {await db.query('rollback').catch(()=>{});await db.end();}
