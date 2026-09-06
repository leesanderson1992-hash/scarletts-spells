import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REF="jlhotktspjvffslvuyfz";
const ROOT=".tmp/whole-writing-staging";
const FILE=`${ROOT}/fixture.json`;
const keys=JSON.parse(readFileSync(`${ROOT}/keys.json`,"utf8"));
const url=`https://${REF}.supabase.co`;
const client=createClient(url,keys.service_role,{auth:{persistSession:false,autoRefreshToken:false}});
const state=()=>JSON.parse(readFileSync(FILE,"utf8"));
const save=f=>writeFileSync(FILE,JSON.stringify(f,null,2),{mode:0o600});
const command=process.argv[2];
function check(result){if(result.error)throw new Error(result.error.message);return result.data;}
async function insert(table,row){return check(await client.from(table).insert(row).select("id").single()).id;}
const protectedTables=["adle_learning_items","child_gold_coin_ledger_events","child_gold_bar_ledger_events","adle_authentic_use_events","adle_review_schedule_words"];
async function counts(){return Object.fromEntries(await Promise.all(protectedTables.map(async table=>{const r=await client.from(table).select("id",{head:true,count:"exact"});check(r);return[table,r.count];})));}
async function parentClient(f,other=false){const c=createClient(url,keys.anon,{auth:{persistSession:false,autoRefreshToken:false}});check(await c.auth.signInWithPassword({email:other?f.otherEmail:f.email,password:f.password}));return c;}
if(command==="setup"){
  assert.ok(!existsSync(FILE),"Fixture already exists; resume it");
  const tag=randomUUID();const f={tag,email:`writing-${tag}@example.test`,otherEmail:`writing-other-${tag}@example.test`,password:`Writing-proof-${randomUUID()}!`,baseline:await counts()};save(f);
  f.parentId=check(await client.auth.admin.createUser({email:f.email,password:f.password,email_confirm:true})).user.id;save(f);
  f.otherParentId=check(await client.auth.admin.createUser({email:f.otherEmail,password:f.password,email_confirm:true})).user.id;save(f);
  f.childId=await insert("children",{parent_user_id:f.parentId,first_name:"Writing Proof",notes:`disposable-whole-writing:${tag}`});save(f);
  f.courseId=await insert("courses",{parent_user_id:f.parentId,child_id:f.childId,title:"Whole-writing proof",description:`disposable:${tag}`,structure_type:"timed"});save(f);
  f.moduleId=await insert("course_modules",{parent_user_id:f.parentId,course_id:f.courseId,title:"Source capture proof",position:0});save(f);
  const schema={version:1,theme:"scarlett-default",title:"Whole-writing source proof",blocks:[
    {block_id:"prompt",block_type:"rich_text",content:"Supplied prompt words must stay out of learner evidence."},
    {block_id:"story",block_type:"question_textarea",label:"Story",rows:5},
    {block_id:"second",block_type:"question_textarea",label:"Another answer",rows:3},
    {block_id:"table",block_type:"question_table",label:"Word table",row_count:2,columns:[{column_id:"word",label:"Written word",input_type:"text"},{column_id:"option",label:"Selected label",input_type:"select",options:[{label:"Supplied",value:"supplied"}]}]},
    {block_id:"interview",block_type:"question_repeatable_interview",label:"Interview",repeat_count:1,questions:[{question_id:"answer",prompt:"Their answer"}]},
  ]};
  f.taskId=await insert("course_tasks",{parent_user_id:f.parentId,course_id:f.courseId,module_id:f.moduleId,title:"Whole-writing source proof",task_type:"lesson",position:0,is_active:true,coin_reward_trigger:"none",gold_bar_rule:"none",lesson_schema:schema});save(f);
  check(await client.from("writing_shadow_controls").insert({child_id:f.childId,parent_user_id:f.parentId,capture_enabled:true,processing_enabled:true,extraction_enabled:true,resolution_enabled:true,evidence_shadow_enabled:false}));
  console.log(JSON.stringify({status:"fixture_ready",childId:f.childId,taskPath:`/learn/modules/${f.moduleId}/tasks/${f.taskId}?child=${f.childId}&mode=child`}));
}else if(command==="inspect"){
  const f=state();const submissions=check(await client.from("task_submissions").select("id,submission_request_id,submitted_at,parent_review_status").eq("child_id",f.childId).order("submitted_at"));
  const snapshots=check(await client.from("writing_source_snapshots").select("id,submission_id,envelope").eq("child_id",f.childId));
  const runs=snapshots.length?check(await client.from("writing_shadow_runs").select("id,snapshot_id,status,attempt_count,error_code,result").in("snapshot_id",snapshots.map(s=>s.id))):[];
  console.log(JSON.stringify({submissions,snapshots:snapshots.map(s=>({id:s.id,submission:s.submission_id,rawDraft:s.envelope.draftPayload!==null})),runs:runs.map(r=>({id:r.id,status:r.status,attempts:r.attempt_count,error:r.error_code,occurrences:r.result?.occurrences?.length}))}));
}else if(command==="concurrent"){
  const f=state();assert.ok(!f.testTaskId,"Concurrent fixture already exists");
  const original=check(await client.from("course_tasks").select("lesson_schema").eq("id",f.taskId).single());
  const source=check(await client.from("writing_source_snapshots").select("envelope").eq("child_id",f.childId).order("occurred_at").limit(1).single());
  f.testTaskId=await insert("course_tasks",{parent_user_id:f.parentId,course_id:f.courseId,module_id:f.moduleId,title:"Concurrent test proof",task_type:"test",position:1,is_active:true,coin_reward_trigger:"none",gold_bar_rule:"none",lesson_schema:original.lesson_schema});save(f);
  const parent=await parentClient(f);const capture={...source.envelope.processingPayload,writingSourceCapture:{rawSubmissionText:source.envelope.rawSubmissionText,draftPayload:source.envelope.draftPayload}};
  const now=new Date().toISOString();const args={p_parent_user_id:f.parentId,p_child_id:f.childId,p_course_id:f.courseId,p_task_id:f.testTaskId,p_submission_request_id:randomUUID(),p_submission_text:"Concurrent writing proof",p_submitted_at:now,p_completion_date:now.slice(0,10),p_structured_payload_type:"structured_test_response",p_structured_payload:source.envelope.draftPayload.__structured_lesson_response,p_processing_payload:capture};
  const results=await Promise.all([parent.rpc("submit_course_task_response_once",args),parent.rpc("submit_course_task_response_once",args)]);results.forEach(check);
  assert.deepEqual(results.map(r=>r.data.outcome).sort(),["created","duplicate"]);assert.equal(results[0].data.submissionId,results[1].data.submissionId);
  assert.equal(check(await client.from("writing_source_snapshots").select("id").eq("task_id",f.testTaskId)).length,1);
  console.log(JSON.stringify({status:"concurrent_submission_verified",created:1,duplicate:1,snapshots:1}));
}else if(command==="verify"){
  const f=state();const snapshots=check(await client.from("writing_source_snapshots").select("*").eq("child_id",f.childId).order("occurred_at"));assert.ok(snapshots.length>=1);
  for(const s of snapshots){
    const runs=check(await client.from("writing_shadow_runs").select("*").eq("snapshot_id",s.id).eq("status","completed"));assert.ok(runs.length>=1,"Recovery has not completed");
    for(const r of runs){assert.equal(r.result.qualification,"NOT_QUALIFIED");assert.ok(r.result.occurrences.length>0);assert.ok(r.result.occurrences.every(o=>o.interpretation.correctness==="NOT_ASSESSED"));}
    const parent=await parentClient(f);assert.equal(check(await parent.from("writing_source_snapshots").select("id").eq("id",s.id)).length,1);
    const other=await parentClient(f,true);assert.equal(check(await other.from("writing_source_snapshots").select("id").eq("id",s.id)).length,0);
    assert.ok((await other.rpc("claim_writing_shadow_runs",{p_limit:1})).error);
    assert.ok((await client.from("writing_source_snapshots").update({source_revision:"tampered"}).eq("id",s.id)).error);
    const initial=s.envelope.draftPayload.__structured_lesson_response.answers.find(a=>a.block_id==="story").value;
    assert.ok(initial.startsWith("  🐕"),"Leading raw whitespace lost");
    const occurrences=runs[0].result.occurrences;
    assert.equal(occurrences.length,21,"Whole-writing coverage changed");
    assert.equal(occurrences.filter(o=>o.observedText==="cat").length,5,"Repeated/independent answers were collapsed");
    assert.ok(occurrences.some(o=>o.observedText==="Quazibloom"&&o.interpretation.status==="unmapped"),"Unknown word was not retained");
    assert.ok(occurrences.some(o=>o.observedText==="cat"&&o.interpretation.status==="resolved"),"Untaught canonical word did not resolve");
    assert.equal(check(await client.from("writing_occurrences").select("id").eq("snapshot_id",s.id)).length,21);
    assert.ok((await client.from("writing_shadow_runs").update({result:{}}).eq("id",runs[0].id)).error,"Completed result was mutable");
    assert.ok(runs[0].result.occurrences.some(o=>o.observedText==="I"&&o.start===5),"UTF-16 offset after raw whitespace/emoji lost");
    assert.ok(!runs[0].result.occurrences.some(o=>o.observedText==="supplied"));
  }
  assert.deepEqual(await counts(),f.baseline,"Protected learning/reward counts changed");
  if(snapshots.length===3){
    assert.equal(snapshots.filter(s=>s.task_id===f.taskId).length,2,"Returned work did not create a new source");
    assert.equal(check(await client.from("task_submissions").select("id").eq("child_id",f.childId)).length,3);
  }
  f.verifiedSnapshots=snapshots.map(s=>s.id);save(f);
  console.log(JSON.stringify({status:"verified",snapshots:snapshots.length,rawFidelity:true,ownershipIsolation:true,noLearningConsequences:true}));
}else if(command==="recover"){
  const f=state();assert.equal(new URL(f.previewUrl).hostname,"scarletts-spells-staged-nt8meegkg.vercel.app");
  const other=check(await client.from("task_submission_processing_jobs").select("id").in("status",["pending","failed","processing"]).neq("child_id",f.childId));
  assert.equal(other.length,0,"Non-fixture jobs block recovery");
  const result=spawnSync("vercel",["curl","/api/internal/task-submissions/process","--deployment",f.previewUrl,"--","--silent","--show-error","--header","Authorization: Bearer "+f.cronSecret],{cwd:"/tmp/scarlett-whole-writing-staging-20260906",encoding:"utf8"});
  assert.equal(result.status,0,"Preview recovery request failed");
  const body=JSON.parse(result.stdout);assert.equal(body.failed,0);assert.equal(body.writingShadow.failed,0);
  f.recoveryReceipts=[...(f.recoveryReceipts??[]),body];save(f);console.log(JSON.stringify(body));
}else if(command==="replay"){
  const f=state();const s=check(await client.from("writing_source_snapshots").select("id").eq("child_id",f.childId).order("occurred_at").limit(1).single());
  f.replaySnapshot=s.id;f.beforeReplay=check(await client.from("writing_occurrences").select("id").eq("snapshot_id",s.id)).map(o=>o.id).sort();save(f);
  const params={p_snapshot_ids:[s.id],p_release_key:`proof-replay:${f.tag}`};assert.equal(check(await client.rpc("enqueue_writing_shadow_replay",params)),1);assert.equal(check(await client.rpc("enqueue_writing_shadow_replay",params)),0);
  const claims=check(await client.rpc("claim_writing_shadow_runs",{p_limit:1}));assert.equal(claims.length,1);
  f.interruptedRun=claims[0];save(f);
  check(await client.from("writing_shadow_runs").update({started_at:new Date(Date.now()-11*60000).toISOString()}).eq("id",claims[0].id));
  console.log(JSON.stringify({status:"interrupted_replay_ready"}));
}else if(command==="verify-replay"){
  const f=state();const run=check(await client.from("writing_shadow_runs").select("*").eq("id",f.interruptedRun.id).single());assert.equal(run.status,"completed");assert.equal(run.attempt_count,2);
  assert.equal(check(await client.rpc("persist_writing_shadow_result",{p_run_id:run.id,p_lease_token:f.interruptedRun.lease_token,p_result:{}})),false);
  assert.deepEqual(check(await client.from("writing_occurrences").select("id").eq("snapshot_id",f.replaySnapshot)).map(o=>o.id).sort(),f.beforeReplay);
  assert.deepEqual(await counts(),f.baseline);console.log(JSON.stringify({status:"replay_verified",stableOccurrences:f.beforeReplay.length,staleLeaseRejected:true,noLearningConsequences:true}));
}else if(command==="return"){
  const f=state();const s=check(await client.from("task_submissions").select("id").eq("child_id",f.childId).eq("task_id",f.taskId).order("submitted_at",{ascending:false}).limit(1).single());
  check(await client.from("task_submissions").update({parent_review_status:"returned",parent_review_note:"Disposable proof: submit the same writing again.",parent_reviewed_at:new Date().toISOString()}).eq("id",s.id));console.log(JSON.stringify({status:"returned",submission:s.id}));
}else if(command==="transaction-proof"){
  const f=state();for(const id of [f.childId,f.parentId,f.courseId,f.taskId])assert.match(id,/^[0-9a-f-]{36}$/);
  const cli=process.env.WRITING_PROOF_SUPABASE_CLI;assert.ok(cli);
  const sql=`begin; set local lock_timeout='5s'; set local statement_timeout='20s';
    select set_config('request.jwt.claim.sub','${f.parentId}',true);
    update task_submissions set parent_review_status='returned' where child_id='${f.childId}' and task_id='${f.taskId}';
    alter table writing_source_snapshots add constraint writing_fixture_failure check (child_id <> '${f.childId}'::uuid) not valid;
    do $proof$ declare n integer; j integer; failed boolean := false; begin
      select count(*) into n from task_submissions where child_id='${f.childId}';
      select count(*) into j from task_submission_processing_jobs where child_id='${f.childId}';
      begin
        perform submit_course_task_response_once('${f.parentId}','${f.childId}','${f.courseId}','${f.taskId}',gen_random_uuid(),'Disposable transactional proof',now(),current_date,'structured_lesson_response','{}'::jsonb,'{}'::jsonb);
      exception when check_violation then
        if sqlerrm not like '%writing_fixture_failure%' then raise; end if;
        failed := true;
      end;
      if not failed then raise exception 'Capture failure was not exercised'; end if;
      if n <> (select count(*) from task_submissions where child_id='${f.childId}') or j <> (select count(*) from task_submission_processing_jobs where child_id='${f.childId}') then raise exception 'Capture failure leaked writes'; end if;
    end $proof$;
    alter table writing_source_snapshots drop constraint writing_fixture_failure;
    update writing_shadow_controls set capture_enabled=false where child_id='${f.childId}';
    do $proof$ declare n integer; r jsonb; begin
      select count(*) into n from writing_source_snapshots where child_id='${f.childId}';
      select submit_course_task_response_once('${f.parentId}','${f.childId}','${f.courseId}','${f.taskId}',gen_random_uuid(),'Disposable disabled proof',now(),current_date,'structured_lesson_response','{}'::jsonb,'{}'::jsonb) into r;
      if r->>'outcome' <> 'created' then raise exception 'Disabled submission was not created'; end if;
      if n <> (select count(*) from writing_source_snapshots where child_id='${f.childId}') then raise exception 'Disabled capture created source'; end if;
    end $proof$;
    rollback; select true as capture_rollback, true as disabled_capture;`;
  const file=`${ROOT}/transaction-proof.sql`;writeFileSync(file,sql,{mode:0o600});
  try{
    const result=spawnSync(cli,["db","query","--linked","--project-ref",REF,"--output","json","--file",file],{encoding:"utf8",timeout:60000});
    if(result.status!==0)throw new Error(result.stderr||"Transactional proof failed");
    const output=JSON.parse(result.stdout.slice(result.stdout.indexOf("{"),result.stdout.lastIndexOf("}")+1));
    assert.deepEqual(output.rows,[{capture_rollback:true,disabled_capture:true}]);
    console.log(JSON.stringify({status:"transaction_proof_verified",captureRollback:true,disabledCapture:true,allChangesRolledBack:true}));
  }finally{unlinkSync(file);}
}else if(command==="cleanup"){
  const f=state();
  const snapshotIds=check(await client.from("writing_source_snapshots").select("id").eq("child_id",f.childId)).map(s=>s.id);
  const occurrenceIds=snapshotIds.length?check(await client.from("writing_occurrences").select("id").in("snapshot_id",snapshotIds)).map(o=>o.id):[];
  check(await client.from("writing_shadow_controls").update({capture_enabled:false,processing_enabled:false}).eq("child_id",f.childId));
  // Existing cascade lifecycle removes only the exact disposable parents.
  check(await client.auth.admin.deleteUser(f.parentId));check(await client.auth.admin.deleteUser(f.otherParentId));
  assert.equal(check(await client.from("writing_source_snapshots").select("id").eq("child_id",f.childId)).length,0);
  assert.equal(check(await client.from("children").select("id").eq("id",f.childId)).length,0);
  assert.equal(check(await client.from("writing_shadow_controls").select("child_id").eq("child_id",f.childId)).length,0);
  if(snapshotIds.length)for(const table of ["writing_shadow_runs","writing_occurrences"])assert.equal(check(await client.from(table).select("id").in("snapshot_id",snapshotIds)).length,0);
  if(occurrenceIds.length)assert.equal(check(await client.from("writing_occurrence_interpretations").select("id").in("occurrence_id",occurrenceIds)).length,0);
  assert.deepEqual(await counts(),f.baseline);f.cleaned=true;save(f);console.log(JSON.stringify({status:"cleanup_verified",protectedCountsRestored:true,snapshotsRemoved:snapshotIds.length,occurrencesRemoved:occurrenceIds.length}));
}else throw new Error("Use setup, inspect, concurrent, verify, recover, replay, verify-replay, return, transaction-proof or cleanup");
