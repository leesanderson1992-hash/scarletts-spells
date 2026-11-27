import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import pg from 'pg';
const e=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert.equal(e.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
const f=JSON.parse(fs.readFileSync('outputs/latin-root-release-20261127/staging-fixture.json','utf8'));const d=new pg.Client({connectionString:e.SUPABASE_STAGING_DB_URL,ssl:{rejectUnauthorized:false}});await d.connect();
const q=async(s:string,args:unknown[]=s.includes("$1")?[f.assignmentId]:[])=>(await d.query(s,args)).rows;
try{await q('begin');
const h=(await q('select status,compiled_lesson_snapshot from daily_assignments where id=$1'))[0];assert.equal(h.status,'completed');
const words=h.compiled_lesson_snapshot.words;const authentic=words.filter((w:{learningItemId:string|null})=>w.learningItemId).map((w:{canonicalWordId:string})=>w.canonicalWordId);
const items=await q('select status from assignment_items where daily_assignment_id=$1');assert.equal(items.length,17);assert(items.every(i=>i.status==='completed'));
const attempts=await q('select * from adle_assignment_attempt_events where daily_assignment_id=$1');assert.equal(attempts.length,17);assert.equal(attempts.filter(a=>a.attempt_kind!=='guided_practice').length,10);assert.equal(attempts.filter(a=>a.is_correct===false).length,2);
const routes=await q('select r.* from adle_assignment_attempt_event_routes r join adle_assignment_attempt_events a on a.id=r.attempt_event_id where a.daily_assignment_id=$1');assert.equal(routes.length,4);
const source=`lesson:${f.childId}:${f.date}:D4_MOR_ROOTS_COMMON_LATIN_ROOTS`;
const taught=await q('select canonical_word_id from adle_taught_word_history where child_id=$1 and source_ref=$2 and row_status=\'active\'',[f.childId,source]);assert.equal(taught.length,2);assert(taught.every(w=>authentic.includes(w.canonical_word_id)));
const schedules=await q('select canonical_word_id from adle_review_schedule_words where child_id=$1 and row_status=\'active\'',[f.childId]);assert.equal(schedules.length,1);assert(schedules.every(w=>authentic.includes(w.canonical_word_id)));
const needs=await q('select canonical_word_id,item_status from adle_learning_items where child_id=$1 and row_status=\'active\'',[f.childId]);assert.equal(needs.find(w=>w.canonical_word_id===f.words[0].id)?.item_status,'pending');assert.equal(needs.filter(w=>w.item_status==='awaiting_review_outcome').length,1);
const reflection=await q('select reflection_text from adle_child_learning_reflections where daily_assignment_id=$1');assert.equal(reflection.length,1);assert(reflection[0].reflection_text.includes('port means carry'));
const saved=(await q('select checkpoint_payload,completed_at from adle_specialist_stage_checkpoints where daily_assignment_id=$1'))[0];assert(saved.completed_at&&saved.checkpoint_payload.state.finished);
// The original independent attempt cannot be repaired through a checkpoint write.
await q('savepoint invalid');let rejected=false;try{const bad=structuredClone(saved.checkpoint_payload);bad.state.coverAttempts[f.words[0].id]='transport';await q('update adle_specialist_stage_checkpoints set checkpoint_payload=$2 where daily_assignment_id=$1',[f.assignmentId,bad]);}catch{rejected=true;}await q('rollback to savepoint invalid');assert(rejected);
await q('rollback');const report={passed:true,assignmentId:f.assignmentId,completedItems:17,attempts:17,independentAttempts:10,originalIncorrectAttempts:2,authenticTaughtWords:2,transferWordsWithInventedLineage:0,schedules:1,reflectionRows:1,checkpointFinished:true,repairRejected:true};fs.writeFileSync('outputs/latin-root-release-20261127/staging-completion-proof.json',JSON.stringify(report,null,2));console.log(report);
}finally{await d.end();}
