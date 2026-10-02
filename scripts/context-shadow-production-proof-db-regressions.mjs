/** Runs only in the isolated Docker database owned by the local prerequisite proof. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { proveContextDigestQualification } from './context-shadow-digest-db-regressions.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
export async function proveProductionProofIsolation({db,parent,task}) {
  // Reduced database has no rewards/ADLE schema. Representative authorities exercise the same trigger,
  // while hosted verification requires guards on every matching authority in the actual schema.
  for (const table of ['adle_learning_items','adle_authentic_use_events','adle_review_retirement_decision_receipts',
    'child_word_treasure_evidence_candidates','child_word_treasures','child_gold_coin_ledger_events','writing_samples'])
    await db.query(`create table if not exists ${table}(id uuid primary key default gen_random_uuid(),child_id uuid not null)`);
  const migration=readFileSync(new URL('../supabase/migrations/20260929140000_isolate_production_context_provider_proofs.sql',import.meta.url),'utf8');
  // Reproduce Production's broad inherited service grants, inside this disposable database only.
  await db.query('alter default privileges in schema public grant all on tables to service_role');
  try { await db.query(migration); }
  finally { await db.query('alter default privileges in schema public revoke all on tables from service_role'); }
  await proveContextDigestQualification({db,parent});
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows,[{enabled:false,ai_mode:'disabled'}]);
  assert.equal((await db.query('select dispatch_scope from writing_context_shadow_policy')).rows[0].dispatch_scope,'DENY');
  assert.equal((await db.query('select count(*)::int n from writing_context_provider_proof_learners')).rows[0].n,0);
  for (const role of ['anon','authenticated']) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,'writing_context_provider_proof_learners',privilege])).rows[0].ok,false);
  for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',['service_role','writing_context_provider_proof_learners',privilege])).rows[0].ok,true);
  console.log('PASS: owner-approved broad service-role registration authority; client restrictions retained');
  for (const fn of ['context_provider_proof_child(uuid)','context_shadow_scope_authorised(uuid,uuid)',
    'writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text)'])
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') ok",[fn])).rows[0].ok,false);
  task=randomUUID();
  await db.query("insert into course_tasks values($1,$2,'lesson','Disposable synthetic proof','Synthetic only',null)",[task,parent]);
  const synthetic=randomUUID(),real=randomUUID(),wrongTask=randomUUID();
  await db.query('insert into children values($1,$3),($2,$3)',[synthetic,real,parent]);
  await db.query("insert into course_tasks values($1,$2,'lesson','Synthetic','Synthetic',null)",[wrongTask,parent]);
  await db.query('set role service_role');
  try { await db.query(`insert into writing_context_provider_proof_learners(child_id,parent_user_id,task_id,approved_by,evidence_ref,approved_at,expires_at)
    values($1,$2,$3,$2,'local/proof',now()-interval '1 hour',now()+interval '1 day')`,[synthetic,parent,task]);
    await assert.rejects(db.query('update writing_context_provider_proof_learners set task_id=$1 where child_id=$2',[wrongTask,synthetic]),
      {code:'P0001',where:/reject_writing_fact_update/});
  } finally { await db.query('reset role'); }
  const version='production-proof-card', approval=randomUUID(),realApproval=randomUUID(),config='a'.repeat(64),runtime='b'.repeat(64),deployment='c'.repeat(40);
  const cardFp=hash([version,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,'0.1000000000','0.0100000000','0.1250000000','0.5000000000','CONTEXT_COST_USD_V1'].join('|'));
  await db.query(`insert into writing_context_ai_rate_cards(version,provider,model,endpoint,service_tier,currency,unit_tokens,input_rate,
    cached_input_rate,cache_write_rate,output_rate,calculation_version,effective_at,source_url,evidence_ref,approved_by,fingerprint)
    values($1,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,.1,.01,.125,.5,'CONTEXT_COST_USD_V1',now()-interval '1 day',
      'https://developers.openai.com/api/docs/pricing','local/card',$2,$3)`,[version,parent,cardFp]);
  for (const [id,scope] of [[approval,'DISPOSABLE_PROVIDER_PROOF'],[realApproval,'REAL_LEARNER']])
    await db.query(`insert into writing_context_provider_approvals(id,environment,project_ref,deployment_sha,model,endpoint,config_fingerprint,
      runtime_fingerprint,zdr_verified,data_sharing_disabled,evidence_ref,approved_by,approved_at,expires_at,dispatch_scope)
      values($1,'production','proj_disposable',$2,'gpt-6-luna','/v1/responses',$3,$4,true,true,'local/privacy',$5,now()-interval '1 hour',now()+interval '1 day',$6)`,[id,deployment,config,runtime,parent,scope]);
  const proofAuth=randomUUID(),guardianAuth=randomUUID();
  for (const [id,child,kind] of [[proofAuth,synthetic,'OPERATOR_PROOF'],[guardianAuth,real,'GUARDIAN']])
    await db.query(`insert into writing_context_learner_authorisations(id,child_id,parent_user_id,policy_version,evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
      values($1,$2,$3,'production-proof-v1','local/permission',$3,now()-interval '1 hour',now()+interval '1 day',$4)`,[id,child,parent,kind]);
  const policy=async(scope,provider=approval)=>await db.query(`update writing_context_shadow_policy set dispatch_scope=$1,provider_approval_id=$2,
    rate_card_version=$3,learner_policy_version='production-proof-v1',max_requests_per_day=100,max_usd_per_day=1,max_usd_per_request=.01,
    evidence_ref='local/limits',approved_by=$4,thresholds='{"window_seconds":3600,"minimum_calls":100,"error_rate":1,"timeout_rate":1,"malformed_rate":1,"gate_failure_rate":1,"p95_ms":9000,"max_queue_age_seconds":86400}'`,[scope,provider,version,parent]);
  await policy('DISPOSABLE_PROVIDER_PROOF');
  await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  async function source(child=synthetic,taskId=task) {
    const submission=randomUUID(),key=randomUUID();
    await db.query('insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,clock_timestamp(),$5)',[submission,parent,child,taskId,'Their cat is here.']);
    await db.query('insert into task_submission_processing_jobs values($1,$2,$3,$4,$5,$6)',[key,submission,parent,child,taskId,{writingSourceCapture:{rawSubmissionText:'Their cat is here.',source_purpose:'DISPOSABLE_PROVIDER_PROOF'}}]);
    const snapshot=(await db.query('select * from writing_source_snapshots where submission_id=$1',[submission])).rows[0];
    const occurrence=`proof:${randomUUID()}`;
    await db.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance,extractor_version)
      values($1,$2,'/rawSubmissionText',$3,0,5,'Their','learner_response','proof')`,[occurrence,snapshot.id,hash(JSON.stringify('Their cat is here.'))]);
    const run=(await db.query("select record_writing_context_detector_run($1,$2,$3,$4,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',$5) id",[snapshot.id,parent,child,key,[occurrence]])).rows[0].id;
    return {submission,snapshot,occurrence,run,key,child};
  }
  const queue=async x=>{ const id=(await db.query('select enqueue_writing_context_shadow($1) id',[x.submission])).rows[0].id;
    if (!id) return null; return (await db.query('select claim_writing_context_shadow($1) job',[x.submission])).rows[0].job; };
  const reserve=async(x,job,overrides={})=>(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,5000,$6,$7,$8,$9,$10,$11) result',
    [job.id,job.claim_token,x.occurrence,x.run,'d'.repeat(64),overrides.environment??'production',overrides.project??'proj_disposable',overrides.sha??deployment,config,runtime,overrides.card??cardFp])).rows[0].result;
  const begin=async(id,job)=>(await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[id,job.claim_token])).rows[0].ok;
  const syntheticSource=await source(),realSource=await source(real,wrongTask);
  await assert.rejects(source(real,task),/AI_PROOF_TASK_OWNERSHIP_DENIED/);
  assert.equal(syntheticSource.snapshot.source_purpose,'DISPOSABLE_PROVIDER_PROOF');
  assert.equal(realSource.snapshot.source_purpose,'REAL_LEARNER');
  assert.equal(realSource.snapshot.envelope.contextAiShadowCapture,false);
  assert.equal(await queue(realSource),null,'Real authorised learner must not queue in proof-only activation');
  await assert.rejects(db.query(`insert into writing_context_provider_proof_learners(child_id,parent_user_id,task_id,approved_by,evidence_ref,expires_at)
    values($1,$2,$3,$2,'local/late',now()+interval '1 day')`,[real,parent,task]),'Existing writing cannot be reclassified');
  const wrong=await source(synthetic,wrongTask); assert.equal(await queue(wrong),null,'Unregistered task denied');
  await db.query('begin');
  await db.query(`insert into writing_context_approval_revocations(learner_authorisation_id,revoked_by,evidence_ref) values($1,$2,'local/revoke')`,[proofAuth,parent]);
  await db.query(`insert into writing_context_learner_authorisations(child_id,parent_user_id,policy_version,evidence_ref,approved_by,approved_at,expires_at,authorisation_kind)
    values($1,$2,'production-proof-v1','local/wrong-kind',$2,now()-interval '1 hour',now()+interval '1 day','GUARDIAN')`,[synthetic,parent]);
  assert.equal(await queue(syntheticSource),null,'Guardian authorisation cannot substitute for operator proof approval');
  await db.query('rollback');
  const job=await queue(syntheticSource);assert(job);
  for (const overrides of [{environment:'staging'},{project:'wrong'},{sha:'e'.repeat(40)}])
    assert.equal((await reserve(syntheticSource,job,overrides)).reason,'AI_PROVIDER_APPROVAL_UNAVAILABLE');
  assert.equal((await reserve(syntheticSource,job,{card:'f'.repeat(64)})).reason,'AI_RATE_CARD_MISMATCH');
  // All phase changes are transactional and final admission repeats scope checks.
  await db.query('begin'); await policy('REAL_LEARNER',realApproval);
  assert.equal((await reserve(syntheticSource,job)).reason,'AI_PROOF_SCOPE_DENIED');await db.query('rollback');
  const dispatch=(await reserve(syntheticSource,job)).id;assert(dispatch);
  assert.equal((await reserve(syntheticSource,job)).reason,'AI_ALREADY_RESERVED');
  await db.query('begin'); await db.query(`insert into writing_context_approval_revocations(learner_authorisation_id,revoked_by,evidence_ref) values($1,$2,'local/revoke')`,[proofAuth,parent]);
  assert.equal(await begin(dispatch,job),false);await db.query('rollback');
  await db.query('begin');await policy('REAL_LEARNER',realApproval);assert.equal(await begin(dispatch,job),false);await db.query('rollback');
  assert.equal(await begin(dispatch,job),true);assert.equal(await begin(dispatch,job),false);
  const attempt=(await db.query(`insert into writing_context_ai_attempts(occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,
    result_status,reason_code,provider,model,returned_model,prompt_fingerprint,schema_fingerprint,config_fingerprint,gate_version,window_fingerprint,
    detector_run_id,candidate_detector_version,family_registry_version,provider_called,dispatch_id,input_tokens,cached_input_tokens,cache_write_tokens,
    output_tokens,reasoning_tokens,service_tier,runtime_fingerprint,failure_kind)
    values($1,$2,$3,$4,$5,'shadow','THERE_THEIR_THEYRE','VALID','SUPPORTED_USE','openai','gpt-6-luna','gpt-6-luna',$6,$6,$6,
      'CONTEXT_AI_SAFETY_GATE_V1',$7,$8,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',true,$9,100,0,0,20,5,'default',$10,'none') returning *`,
    [syntheticSource.occurrence,syntheticSource.snapshot.id,parent,synthetic,job.run_key,config,'d'.repeat(64),syntheticSource.run,dispatch,runtime])).rows[0];
  assert.equal(attempt.calculated_cost_usd,'0.00002000');assert.equal(attempt.billing_status,'KNOWN');assert.equal(attempt.rate_card_fingerprint,cardFp);
  await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[dispatch,job.claim_token]);
  await db.query("select finish_writing_context_shadow_job($1,$2,null,'{}')",[job.id,job.claim_token]);
  const realOps=(await db.query('select writing_context_shadow_operations(null,null) o')).rows[0].o;
  const proofOps=(await db.query("select writing_context_shadow_operations_for_scope(null,null,'DISPOSABLE_PROVIDER_PROOF') o")).rows[0].o;
  assert.equal(proofOps.totals.provider_calls,1);assert.equal(proofOps.totals.valid,1);
  await db.query('begin'); await policy('REAL_LEARNER',realApproval);
  const freshReal=await source(real,wrongTask),realJob=await queue(freshReal); assert(realJob);
  const realSlot=(await reserve(freshReal,realJob)).id;assert(realSlot);
  assert.equal(await begin(realSlot,realJob),true,'Separately authorised real-writing scope remains operational');
  await db.query('rollback');
  await db.query('begin');
  const monitored=(await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok;
  assert.equal(monitored,realOps.unrecorded_sends===0,'Scope separation must not hide a previous missing receipt hard stop');
  if (realOps.unrecorded_sends>0) assert.equal((await db.query('select code from writing_context_shadow_stops order by created_at desc limit 1')).rows[0].code,'AI_MISSING_PROVENANCE_STOP');
  await db.query('rollback');
  assert.deepEqual(proofOps.daily_capacity,realOps.daily_capacity,'Proofs and real writing share durable Production capacity');
  const realAttemptCount=(await db.query("select count(*)::int n from writing_context_ai_attempts a join writing_source_snapshots s on s.id=a.snapshot_id where a.record_version=1 and s.source_purpose='REAL_LEARNER' and a.created_at>=clock_timestamp()-interval '1 day'")).rows[0].n;
  assert.equal(realOps.totals.attempts,realAttemptCount,'Real operations never include proof attempts');
  assert.equal((await db.query("select count(*)::int n from writing_context_feedback_operations_v1 where pricing_version=$1",[version])).rows[0].n,0);

  const detectorBefore=(await db.query('select * from writing_context_feedback_detector_metrics_v1')).rows;
  // Exercise the guard with a trusted service identity that really has INSERT authority.
  await db.query('grant insert on adle_learning_items to service_role');
  await db.query('set role service_role');
  try { await assert.rejects(db.query('insert into adle_learning_items(child_id) values($1)',[synthetic]),
    /AI_PROOF_EDUCATIONAL_WRITE_DENIED/); }
  finally { await db.query('reset role'); }
  for (const table of ['adle_learning_items','adle_authentic_use_events','adle_review_retirement_decision_receipts',
    'child_word_treasure_evidence_candidates','child_word_treasures','child_gold_coin_ledger_events','writing_samples'])
    await assert.rejects(db.query(`insert into ${table}(child_id) values($1)`,[synthetic]),/AI_PROOF_EDUCATIONAL_WRITE_DENIED/);
  await assert.rejects(db.query("insert into writing_context_parent_decisions(occurrence_id,parent_user_id,child_id,family_key,classification) values($1,$2,$3,'THERE_THEIR_THEYRE','VALID')",[syntheticSource.occurrence,parent,synthetic]),/AI_PROOF_EDUCATIONAL_WRITE_DENIED/);
  await assert.rejects(db.query('insert into writing_issues(child_id) values($1)',[synthetic]),/AI_PROOF_EDUCATIONAL_WRITE_DENIED/);
  // Privileged client cannot spoof a snapshot purpose, including after capture expiry.
  await assert.rejects(db.query("update writing_source_snapshots set source_purpose='REAL_LEARNER' where id=$1",[syntheticSource.snapshot.id]));
  // Expired registration still isolates education, but does not authorise a dispatch.
  await db.query('begin'); await db.query('alter table writing_context_provider_proof_learners disable trigger context_proof_registration_immutable');
  await db.query("update writing_context_provider_proof_learners set expires_at=clock_timestamp()-interval '1 second' where child_id=$1",[synthetic]);
  const expired=await source();assert.equal(expired.snapshot.source_purpose,'DISPOSABLE_PROVIDER_PROOF');assert.equal(await queue(expired),null);
  await assert.rejects(db.query('insert into adle_learning_items(child_id) values($1)',[synthetic]));await db.query('rollback');
  const educationTask=randomUUID();
  await db.query("insert into course_tasks values($1,$2,'lesson','Registration race','Synthetic only',null)",[educationTask,parent]);
  const educationOnly=randomUUID();
  await db.query('insert into children values($1,$2)',[educationOnly,parent]);
  await db.query('insert into adle_learning_items(child_id) values($1)',[educationOnly]);
  await assert.rejects(db.query(`insert into writing_context_provider_proof_learners(child_id,parent_user_id,task_id,approved_by,evidence_ref,expires_at)
    values($1,$2,$3,$2,'local/education',now()+interval '1 day')`,[educationOnly,parent,educationTask]),/AI_PROOF_EXISTING_EDUCATION_DENIED/);
  const racingChild=randomUUID();
  await db.query('insert into children values($1,$2)',[racingChild,parent]);
  const contender=new db.constructor(db.connectionParameters); await contender.connect();
  try {
    const contenderPid=(await contender.query('select pg_backend_pid() pid')).rows[0].pid;
    await db.query('begin'); await db.query('insert into adle_learning_items(child_id) values($1)',[racingChild]);
    const racingRegistration=contender.query(`insert into writing_context_provider_proof_learners(child_id,parent_user_id,task_id,approved_by,evidence_ref,expires_at)
      values($1,$2,$3,$2,'local/race',now()+interval '1 day')`,[racingChild,parent,educationTask]).then(()=>null,e=>e.code);
    let blocked=false;
    for (let i=0;i<100;i++) {
      blocked=(await db.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') ok",[contenderPid])).rows[0].ok;
      if (blocked) break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert(blocked,'Registration must wait for the same child lock as educational admission');
    await db.query('commit');
    assert.equal(await racingRegistration,'P0001','Concurrent educational write cannot be relabelled synthetic');
  } finally { await db.query('rollback'); await contender.end(); }
  const before=(await db.query("select * from writing_context_shadow_consumption where environment='production' order by policy_revision_id")).rows;
  await db.query('delete from writing_source_snapshots where id=$1',[syntheticSource.snapshot.id]);
  for (const [table,key,id] of [['writing_context_ai_attempts','id',attempt.id],['writing_context_shadow_dispatches','id',dispatch],['writing_context_shadow_jobs','id',job.id]])
    assert.equal((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[id])).rows[0].n,0);
  assert.deepEqual((await db.query("select * from writing_context_shadow_consumption where environment='production' order by policy_revision_id")).rows,before);
  assert.deepEqual((await db.query('select * from writing_context_feedback_detector_metrics_v1')).rows,detectorBefore);
  const unsent=await source(),unsentJob=await queue(unsent),unsentDispatch=(await reserve(unsent,unsentJob)).id;assert(unsentDispatch);
  const afterReserve=(await db.query("select * from writing_context_shadow_consumption where environment='production' order by policy_revision_id")).rows;
  await db.query('select disable_writing_context_advisory($1)',[parent]);assert.equal(await begin(unsentDispatch,unsentJob),false);
  await assert.rejects(db.query('delete from course_tasks where id=$1',[task]),{code:'23503'},'Proof task remains restricted until canonical learner cleanup');
  await db.query('delete from children where id=$1',[synthetic]);
  assert.equal(await begin(unsentDispatch,unsentJob),false);
  assert.equal((await db.query('select count(*)::int n from writing_context_provider_proof_learners where child_id=$1',[synthetic])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from writing_context_learner_authorisations where child_id=$1',[synthetic])).rows[0].n,0);
  await db.query('delete from course_tasks where id=$1',[task]);
  assert.deepEqual((await db.query("select * from writing_context_shadow_consumption where environment='production' order by policy_revision_id")).rows,afterReserve);
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows,[{enabled:false,ai_mode:'disabled'}]);
  console.log('PASS: Production proof-only scope, trusted capture, admission rechecks, authorisation, identity/card pins, educational guards, separate metrics, shared durable budget, kill and synthetic deletion');
}
