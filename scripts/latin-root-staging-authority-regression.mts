import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import pg from 'pg';
import {fingerprintSnapshotValue} from '../lib/adle/composable-lesson/canonical-fingerprint';
const e=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert.equal(e.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
const fixture=JSON.parse(fs.readFileSync('outputs/latin-root-release-20261127/staging-fixture.json','utf8'));
const draft=JSON.parse(fs.readFileSync('outputs/latin-root-release-20261127/staging-assignment-draft.json','utf8'));
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
const appended=(await q("select append_adle_latin_root_stage_r6($1,$2,$3,'[]',$4) result",[header.id,draft.snapshot,JSON.stringify(draft.items),metadata]))[0].result;assert(appended.ok);assert.equal((await q('select count(*)::integer count from assignment_items where daily_assignment_id=$1',[header.id]))[0].count,17);checks.push('review_to_lesson_append');
await q('rollback');fs.writeFileSync('outputs/latin-root-release-20261127/staging-authority-proof.json',JSON.stringify({passed:true,checks},null,2));console.log({authorityProof:true,checks});
}finally{await db.end();}
