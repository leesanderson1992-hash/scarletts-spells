import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import pg from 'pg';
import {fingerprintSnapshotValue} from '../lib/adle/composable-lesson/canonical-fingerprint';
const outputDir=process.env.LATIN_ROOT_PROOF_DIR??'outputs/latin-root-release-20261127';
const e=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert.equal(e.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
const fixture=JSON.parse(fs.readFileSync(outputDir+'/staging-fixture.json','utf8'));
const draft=JSON.parse(fs.readFileSync(outputDir+'/staging-assignment-draft.json','utf8'));
const db=new pg.Client({connectionString:e.SUPABASE_STAGING_DB_URL,ssl:{rejectUnauthorized:false}});await db.connect();
const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows;
const metadata=draft.header.lessonRouteMetadata;
function rehash(s:typeof draft.snapshot){const l=s.payload.resolvedLesson;l.contentVersion=`latin_root_word_lab:v1:${fingerprintSnapshotValue({content:l.content,familyAuthorities:l.familyAuthorities,words:l.words})}`;delete s.provenance.sourceFingerprint;s.provenance.sourceFingerprint=fingerprintSnapshotValue(s);return s;}
try{await q('begin');await q("update adle_learning_items set item_status='pending' where child_id=$1 and row_status='active'",[fixture.childId]);
const call=async(snapshot:unknown,meta=metadata,child=fixture.childId) => q('select assert_adle_latin_root_assignment_v1($1,$2,$3,$4,$5)',[snapshot,meta,JSON.stringify(draft.items),child,fixture.parentUserId]);
await call(draft.snapshot);
const checks=[];
for(const [label,mutate,expected] of [
 ['word_parts',(s:typeof draft.snapshot)=>{s.payload.resolvedLesson.content.families[0].words[0].parts[0].meaning='unreviewed';},'LATIN_ROOT_WORD_FACTS_CHANGED'],
 ['family_meaning',(s:typeof draft.snapshot)=>{s.payload.resolvedLesson.content.families[0].meaning='Light';},'LATIN_ROOT_FAMILY_FACTS_CHANGED'],
 ['target_sentence',(s:typeof draft.snapshot)=>{s.payload.resolvedLesson.content.families[0].words[0].sentence='Invented sentence.';},'LATIN_ROOT_WORD_FACTS_CHANGED']
] as const){await q('savepoint invalid');let failed=false;try{const s=structuredClone(draft.snapshot);mutate(s);await call(rehash(s));}catch(error){assert(String(error).includes(expected),String(error));failed=true;}await q('rollback to savepoint invalid');assert(failed,label);checks.push(label);}
await q('savepoint invalid');let wrongChild=false;try{await call(draft.snapshot,metadata,'00000000-0000-4000-8000-000000000001');}catch{wrongChild=true;}await q('rollback to savepoint invalid');assert(wrongChild);checks.push('wrong_child');
const header=(await q("insert into daily_assignments(child_id,parent_user_id,assignment_date,title,status,assignment_generation_source) values($1,$2,'2026-11-28','ADLE Daily Plan','pending','adle_composer_v1') returning id",[fixture.childId,fixture.parentUserId]))[0];
await q("insert into adle_today_session_orchestrations(daily_assignment_id,child_id,parent_user_id,assignment_date,major_stage,review_generation_status,specialist_generation_status) values($1,$2,$3,'2026-11-28','specialist_generation','completed','generating')",[header.id,fixture.childId,fixture.parentUserId]);
const appended=(await q("select append_adle_latin_root_stage_r6($1,$2,$3,'[]',$4) result",[header.id,draft.snapshot,JSON.stringify(draft.items),metadata]))[0].result;assert(appended.ok);assert.equal((await q('select count(*)::integer count from assignment_items where daily_assignment_id=$1',[header.id]))[0].count,fixture.expected.items);checks.push('review_to_lesson_append');
if(outputDir.includes('multi-family')){
 const old=JSON.parse(fs.readFileSync('outputs/latin-root-release-20261127/staging-assignment-draft.json','utf8')).header.lessonRouteMetadata.curriculumRelease;
 assert.equal((await q('select adle_incomplete_assignment_runtime_policy_v2($1) policy',[old.activationRevisionId]))[0].policy,'allow_existing');
 const current=(await q('select * from adle_route_activation_revisions where id=$1',[metadata.curriculumRelease.activationRevisionId]))[0];
 await q("select set_adle_route_activation_revision_v2($1,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS','staging','safety_revoked','block_incomplete',$2,$3,$4,'Rollback-only safety policy regression')",[current.release_manifest_sha256,current.readiness_report,current.id,fixture.parentUserId]);
 assert.equal((await q('select adle_incomplete_assignment_runtime_policy_v2($1) policy',[old.activationRevisionId]))[0].policy,'block_incomplete');
 checks.push('older_assignment_preserved_and_safety_revocation_honoured');
}
await q('rollback');fs.writeFileSync(outputDir+'/staging-authority-proof.json',JSON.stringify({passed:true,checks},null,2));console.log({authorityProof:true,checks});
}finally{await db.end();}
