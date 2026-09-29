/** Isolated Docker database only. Synthetic prices/caps/receipts are regression inputs, never approvals. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function proveContextShadowStage1B({db,parent}) {
  // Canonical removal of earlier harness fixtures deliberately left ambiguous.
  // Retain their durable capacity; never relax a guard or refund consumption.
  await db.query(`delete from writing_source_snapshots where id in (
    select j.snapshot_id from writing_context_shadow_jobs j join writing_context_shadow_dispatches d on d.job_id=j.id
    where d.state in ('reserved','sent') or d.sent_at is not null and not exists(select 1 from writing_context_ai_attempts a where a.dispatch_id=d.id))`);
  await db.query(readFileSync(new URL('../supabase/migrations/20260929160000_add_disposable_context_bootstrap_and_faults.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows,[{enabled:false,ai_mode:'disabled'}]);
  assert.deepEqual((await db.query('select execution_policy_kind,bootstrap_expires_at,dispatch_scope from writing_context_shadow_policy')).rows,
    [{execution_policy_kind:'MEASURED',bootstrap_expires_at:null,dispatch_scope:'DENY'}]);
  for(const t of ['writing_context_bootstrap_failures','writing_context_proof_fault_plans','writing_context_proof_fault_consumptions','writing_context_proof_fault_events']) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[t])).rows[0].relrowsecurity,true);
    for(const role of ['anon','authenticated']) for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,t,privilege])).rows[0].ok,false);
  }
  for(const signature of ['bind_writing_context_proof_fault(uuid,uuid)','record_writing_context_proof_fault_phase(uuid,uuid,text)',
    'writing_context_proof_fault_status(uuid,uuid)','release_writing_context_proof_fault(uuid,uuid)','revoke_writing_context_proof_fault(uuid,uuid,text)'])
    for(const role of ['anon','authenticated']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,signature])).rows[0].ok,false);
  const text='Their cat is here.',config='a'.repeat(64),runtime='b'.repeat(64),sha='c'.repeat(40),version='stage1b-isolated-card';
  const card=hash([version,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,'0.1000000000','0.0100000000','0.1250000000','0.5000000000','CONTEXT_COST_USD_V1'].join('|'));
  await db.query(`insert into writing_context_ai_rate_cards(version,provider,model,endpoint,service_tier,currency,unit_tokens,input_rate,cached_input_rate,
    cache_write_rate,output_rate,calculation_version,effective_at,source_url,evidence_ref,approved_by,fingerprint)
    values($1,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,.1,.01,.125,.5,'CONTEXT_COST_USD_V1',clock_timestamp(),
    'https://developers.openai.com/api/docs/pricing','local/test-only',$2,$3)`,[version,parent,card]);
  async function policy(kind='DISPOSABLE_BOOTSTRAP',options={}) {
    const approval=randomUUID();
    await db.query(`insert into writing_context_provider_approvals(id,environment,project_ref,deployment_sha,model,endpoint,config_fingerprint,runtime_fingerprint,
      zdr_verified,data_sharing_disabled,evidence_ref,approved_by,expires_at,dispatch_scope)
      values($1,'production','proj_disposable',$2,'gpt-6-luna','/v1/responses',$3,$4,true,true,'local/not-privacy-approval',$5,clock_timestamp()+interval '1 hour','DISPOSABLE_PROVIDER_PROOF')`,[approval,sha,config,runtime,parent]);
    await db.query(`update writing_context_shadow_policy set execution_policy_kind=$1,bootstrap_expires_at=case when $1='DISPOSABLE_BOOTSTRAP' then clock_timestamp()+interval '30 minutes' else null end,
      dispatch_scope='DISPOSABLE_PROVIDER_PROOF',provider_approval_id=$2,rate_card_version=$3,learner_policy_version='isolated-stage1b',
      max_requests_per_day=$4,max_usd_per_day=100,max_usd_per_request=.01,thresholds='{}',approved_by=$5,evidence_ref='local/test-limits'`,[kind,approval,version,options.requests??10000,parent]);
    await db.query("update writing_context_advisory_control set enabled=false,ai_mode='shadow'");
    return {approval,revision:(await db.query('select revision_id from writing_context_shadow_policy')).rows[0].revision_id};
  }
  async function fixture(p,action=null,proof=true,options={}) {
    const child=randomUUID(),task=randomUUID(),auth=randomUUID(),submission=randomUUID(),jobKey=randomUUID();
    await db.query('insert into children values($1,$2)',[child,parent]);
    await db.query("insert into course_tasks values($1,$2,'lesson','Synthetic','Synthetic',null)",[task,parent]);
    if(proof) await db.query(`insert into writing_context_provider_proof_learners(child_id,parent_user_id,task_id,approved_by,evidence_ref,expires_at)
      values($1,$2,$3,$2,'local/fixture',clock_timestamp()+interval '1 hour')`,[child,parent,task]);
    await db.query(`insert into writing_context_learner_authorisations(id,child_id,parent_user_id,policy_version,approved_by,evidence_ref,expires_at,authorisation_kind)
      values($1,$2,$3,'isolated-stage1b',$3,'local/permission',clock_timestamp()+interval '1 hour',$4)`,[auth,child,parent,proof?'OPERATOR_PROOF':'GUARDIAN']);
    let plan=null;
    if(action) plan=(await db.query(`insert into writing_context_proof_fault_plans(child_id,parent_user_id,task_id,policy_revision_id,runtime_fingerprint,
      field_path,field_hash,window_fingerprint,start_utf16,end_utf16,action,approved_by,evidence_ref,expires_at)
      values($1,$2,$3,$4,$5,'/rawSubmissionText',$6,$7,0,5,$8,$2,'local/fault',clock_timestamp()+$9*interval '1 millisecond') returning id`,
      [child,parent,task,p.revision,runtime,options.fieldHash??hash(JSON.stringify(text)),hash(text),action,options.lifetime??600000])).rows[0].id;
    await db.query('insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,clock_timestamp(),$5)',[submission,parent,child,task,text]);
    await db.query('insert into task_submission_processing_jobs values($1,$2,$3,$4,$5,$6)',[jobKey,submission,parent,child,task,{writingSourceCapture:{rawSubmissionText:text}}]);
    const snapshot=(await db.query('select * from writing_source_snapshots where submission_id=$1',[submission])).rows[0];
    const occurrence='stage1b:'+randomUUID();
    await db.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance,extractor_version)
      values($1,$2,'/rawSubmissionText',$3,0,5,'Their','learner_response','isolated')`,[occurrence,snapshot.id,hash(JSON.stringify(text))]);
    const run=(await db.query("select record_writing_context_detector_run($1,$2,$3,$4,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',$5) id",[snapshot.id,parent,child,jobKey,[occurrence]])).rows[0].id;
    await db.query('select enqueue_writing_context_shadow($1)',[submission]);
    const job=(await db.query('select claim_writing_context_shadow($1) j',[submission])).rows[0].j;
    return {child,task,auth,submission,snapshot,occurrence,run,job,plan,action};
  }
  const reserve=async x=>(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,5000,$6,$7,$8,$9,$10,$11) r',
    [x.job.id,x.job.claim_token,x.occurrence,x.run,hash(text),'production','proj_disposable',sha,config,runtime,card])).rows[0].r;
  const bind=async(x,id)=>(await db.query('select bind_writing_context_proof_fault($1,$2) r',[id,x.job.claim_token])).rows[0].r;
  const begin=async(x,id)=>(await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[id,x.job.claim_token])).rows[0].ok;
  async function receipt(x,id,{status='VALID',reason='SUPPORTED_USE',known=true,transport=true}={}) {
    return (await db.query(`insert into writing_context_ai_attempts(occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,
      result_status,reason_code,provider,model,returned_model,prompt_fingerprint,schema_fingerprint,config_fingerprint,gate_version,window_fingerprint,
      detector_run_id,candidate_detector_version,family_registry_version,provider_called,dispatch_id,input_tokens,cached_input_tokens,cache_write_tokens,
      output_tokens,reasoning_tokens,service_tier,runtime_fingerprint,failure_kind,transport_attempted)
      values($1,$2,$3,$4,$5,'shadow','THERE_THEIR_THEYRE',$6,$7,'openai','gpt-6-luna',$8,$9,$9,$9,'CONTEXT_AI_SAFETY_GATE_V1',$10,
        $11,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',false,$12,$13,$14,$14,$15,$16,$17,$18,$19,$20) returning *`,
      [x.occurrence,x.snapshot.id,parent,x.child,x.job.run_key,status,reason,known?'gpt-6-luna':null,config,hash(text),x.run,id,
        known?100:null,known?0:null,known?20:null,known?5:null,known?'default':null,runtime,status==='NOT_ASSESSED'?'configuration':'none',transport])).rows[0];
  }
  const capacity=async()=>(await db.query("select * from writing_context_shadow_consumption where environment='production' order by policy_revision_id")).rows;
  const isolated=async fn=>{await db.query('begin');try{await fn();}finally{await db.query('rollback');}};
  await isolated(async()=>{
    const p=await policy('MEASURED'),x=await fixture(p);
    assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,false);
    assert.equal((await reserve(x)).reason,'AI_POLICY_UNAPPROVED');
  });
  for(const scope of ['DENY','REAL_LEARNER']) await isolated(async()=>{
    await policy(); await assert.rejects(db.query('update writing_context_shadow_policy set dispatch_scope=$1',[scope]),{code:'23514'});
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p),ordinary=await fixture(p,null,false);
    assert.equal(ordinary.snapshot.source_purpose,'REAL_LEARNER');assert.equal(ordinary.snapshot.envelope.contextAiShadowCapture,false);assert.equal(ordinary.job,null);
    assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,true);
    const id=(await reserve(x)).id;assert(id);assert.equal((await bind(x,id)).kind,'NONE');assert(await begin(x,id));
    const r=await receipt(x,id,{status:'UNCERTAIN',reason:'SEMANTIC_AMBIGUITY'});assert.equal(r.billing_status,'KNOWN');
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[id,x.job.claim_token]);
    assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,true,'Linguistic uncertainty is not operational failure');
    const before=await capacity();await db.query('delete from writing_source_snapshots where id=$1',[x.snapshot.id]);assert.deepEqual(await capacity(),before);
  });
  for(const action of ['SIMULATE_TIMEOUT','SIMULATE_429','SIMULATE_5XX']) await isolated(async()=>{
    const p=await policy(),x=await fixture(p,action),id=(await reserve(x)).id;assert(id);
    const bound=await bind(x,id);assert.equal(bound.action,action);assert.equal((await bind(x,id)).kind,'DENIED');
    assert.equal(await begin(x,id),false,'Database independently forbids simulation admission');
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[id,x.job.claim_token]);
    const r=await receipt(x,id,{status:'NOT_ASSESSED',reason:'AI_PROOF_'+action.replace('SIMULATE_','SIMULATED_'),known:false,transport:false});
    assert.equal(r.evidence_kind,'PROOF_SIMULATION');assert.equal(r.provider_called,false);assert.equal(r.billing_status,'NOT_SENT');assert.equal(r.calculated_cost_usd,null);
    assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows,[{enabled:false,ai_mode:'disabled'}]);
    const before=await capacity();await db.query('delete from children where id=$1',[x.child]);await db.query('delete from course_tasks where id=$1',[x.task]);assert.deepEqual(await capacity(),before);
    assert.equal((await db.query('select count(*)::int n from writing_context_proof_fault_plans where id=$1',[x.plan])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from writing_context_bootstrap_failures where provider_approval_id=$1',[p.approval])).rows[0].n,1);
    await db.query("update writing_context_shadow_policy set evidence_ref='local/new-revision'");await db.query("update writing_context_advisory_control set ai_mode='shadow'");
    assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,false,'Failure latch survives deletion/revision');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'PAUSE_BEFORE_ADMISSION'),id=(await reserve(x)).id;
    assert.equal(await begin(x,id),false,'Selected but unbound fault cannot fall back');
  });
  for(const action of ['PAUSE_BEFORE_ADMISSION','PAUSE_AFTER_FETCH','PAUSE_BEFORE_RECEIPT','INTERRUPT_AFTER_FETCH']) await isolated(async()=>{
    const p=await policy(),x=await fixture(p,action),id=(await reserve(x)).id;assert(id);await bind(x,id);
    const phase=action==='PAUSE_BEFORE_ADMISSION'?'BEFORE_ADMISSION':action==='PAUSE_BEFORE_RECEIPT'?'BEFORE_RECEIPT':'FETCH_INVOKED';
    if(action!=='PAUSE_BEFORE_ADMISSION') assert(await begin(x,id));
    assert.equal((await db.query('select record_writing_context_proof_fault_phase($1,$2,$3) ok',[id,x.job.claim_token,phase])).rows[0].ok,true);
    await db.query('select disable_writing_context_advisory($1)',[parent]);
    assert.equal((await db.query('select release_writing_context_proof_fault($1,$2) ok',[x.plan,randomUUID()])).rows[0].ok,false);
    assert.equal((await db.query('select release_writing_context_proof_fault($1,$2) ok',[x.plan,parent])).rows[0].ok,true);
    if(action==='PAUSE_BEFORE_ADMISSION') {assert.equal(await begin(x,id),false);return;}
    const pending=(await db.query("select writing_context_shadow_operations_for_scope(null,null,'DISPOSABLE_PROVIDER_PROOF') o")).rows[0].o;
    assert.deepEqual(pending.fault_dispatches,[{action,state:'sent',dispatches:1,receipts:0}],'Controlled sends stay labelled before receipt/recovery');
    const r=await receipt(x,id,action==='INTERRUPT_AFTER_FETCH'?{status:'NOT_ASSESSED',reason:'AI_RESERVED_OUTCOME_AMBIGUOUS',known:false}:{});
    assert.equal(r.evidence_kind,'PROOF_TIMING');assert.equal(r.completed_after_disable,true);
    assert.equal(r.billing_status,action==='INTERRUPT_AFTER_FETCH'?'UNKNOWN':'KNOWN');
    const o=(await db.query("select writing_context_shadow_operations_for_scope(null,null,'DISPOSABLE_PROVIDER_PROOF') o")).rows[0].o;
    assert(o.evidence_kinds.PROOF_TIMING>=1);assert.equal(o.measurements.provider_calls,0,'Timing hooks excluded from threshold sample');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'PAUSE_AFTER_FETCH'),id=(await reserve(x)).id;
    await db.query('select revoke_writing_context_proof_fault($1,$2,$3)',[x.plan,parent,'local/revoked']);
    assert.equal((await bind(x,id)).kind,'DENIED');assert.equal(await begin(x,id),false);
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p),id=(await reserve(x)).id;
    await db.query("update writing_context_shadow_policy set bootstrap_expires_at=clock_timestamp()-interval '1 second'");
    assert.equal(await begin(x,id),false,'Expiry/revision checked at admission');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p),id=(await reserve(x)).id;assert(await begin(x,id));
    await db.query("update writing_context_shadow_dispatches set state='abandoned',sent_at=clock_timestamp()-interval '2 minutes' where id=$1",[id]);
    assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,false,'Unrecorded admission blocks regardless of lease age');
  });
  for(const action of ['SIMULATE_TIMEOUT','SIMULATE_429','SIMULATE_5XX','PAUSE_BEFORE_ADMISSION','PAUSE_AFTER_FETCH','PAUSE_BEFORE_RECEIPT','INTERRUPT_AFTER_FETCH'])
    await isolated(async()=>{const p=await policy();await assert.rejects(fixture(p,action,false),/AI_PROOF_FAULT_APPROVAL_DENIED/);});
  for(const options of [{fieldHash:'f'.repeat(64)},{lifetime:100}]) await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'PAUSE_AFTER_FETCH',true,options),id=(await reserve(x)).id;
    if(options.lifetime) await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal((await bind(x,id)).kind,'DENIED');assert.equal(await begin(x,id),false,'Mismatch/expiry never falls through');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'PAUSE_AFTER_FETCH'),id=(await reserve(x)).id;await bind(x,id);
    await db.query(`insert into writing_context_approval_revocations(learner_authorisation_id,revoked_by,evidence_ref) values($1,$2,'local/revoked')`,[x.auth,parent]);
    assert.equal(await begin(x,id),false,'Permission revocation repeated at final admission');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'SIMULATE_429'),id=(await reserve(x)).id;await bind(x,id);
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[id,x.job.claim_token]);
    await assert.rejects(receipt(x,id,{status:'NOT_ASSESSED',reason:'AI_PROOF_SIMULATED_429',known:true,transport:false}),/AI_PROOF_SIMULATION_PROVENANCE_DENIED/);
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'SIMULATE_429'),id=(await reserve(x)).id;await bind(x,id);
    await db.query('select revoke_writing_context_proof_fault($1,$2,$3)',[x.plan,parent,'local/revoked-after-bind']);
    assert.equal((await db.query('select writing_context_proof_fault_status($1,$2) s',[id,x.job.claim_token])).rows[0].s.authorised,false);
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[id,x.job.claim_token]);
    const r=await receipt(x,id,{status:'NOT_ASSESSED',reason:'AI_PROOF_HOOK_UNAVAILABLE',known:false,transport:false});
    assert.equal(r.evidence_kind,'PROOF_SIMULATION');assert.equal(r.billing_status,'NOT_SENT');
    assert.equal((await db.query('select ai_mode from writing_context_advisory_control')).rows[0].ai_mode,'disabled');
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'SIMULATE_5XX'),id=(await reserve(x)).id;await bind(x,id);
    const before=await capacity();
    await db.query("update writing_context_shadow_dispatches set state='abandoned' where id=$1",[id]);
    const r=await receipt(x,id,{status:'NOT_ASSESSED',reason:'AI_RESERVED_OUTCOME_AMBIGUOUS',known:false,transport:null});
    assert.equal(r.evidence_kind,'PROOF_SIMULATION');assert.equal(r.billing_status,'NOT_SENT');
    assert.equal(r.transport_attempted,false);assert.equal(r.provider_called,false);assert.deepEqual(await capacity(),before);
  });
  await isolated(async()=>{
    const p=await policy(),x=await fixture(p,'SIMULATE_429'),id=(await reserve(x)).id;await bind(x,id);
    await db.query('delete from writing_source_snapshots where id=$1',[x.snapshot.id]);
    assert.equal((await db.query("select count(*)::int n from writing_context_proof_fault_events where plan_id=$1 and phase='BOUND'",[x.plan])).rows[0].n,1,'One-shot marker survives snapshot deletion');
  });
  // New RPC definitions: two physical connections, actual control lock ordering.
  const contender=new db.constructor(db.connectionParameters);await contender.connect();
  try {
    const p=await policy(),x=await fixture(p),id=(await reserve(x)).id;assert(id);
    const before=await capacity(),pid=(await contender.query('select pg_backend_pid() pid')).rows[0].pid;
    await db.query('begin');await db.query('select 1 from writing_context_advisory_control where singleton for update');
    const waiting=contender.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[id,x.job.claim_token]);
    let blocked=false;
    for(let i=0;i<100;i++) {blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[pid])).rows[0]?.blocked;
      if(blocked) break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert(blocked);await db.query('select disable_writing_context_advisory($1)',[parent]);await db.query('commit');
    assert.equal((await waiting).rows[0].ok,false);assert.deepEqual(await capacity(),before);
    await db.query('delete from children where id=$1',[x.child]);await db.query('delete from course_tasks where id=$1',[x.task]);
    const used=(await db.query("select coalesce(sum(requests_reserved),0)::int n from writing_context_shadow_consumption where environment='production' and budget_day=(clock_timestamp() at time zone 'UTC')::date")).rows[0].n;
    const cap=await policy('DISPOSABLE_BOOTSTRAP',{requests:used+1}),a=await fixture(cap),b=await fixture(cap);
    const reserveSql='select reserve_writing_context_shadow($1,$2,$3,$4,$5,5000,$6,$7,$8,$9,$10,$11) r';
    const args=y=>[y.job.id,y.job.claim_token,y.occurrence,y.run,hash(text),'production','proj_disposable',sha,config,runtime,card];
    const results=await Promise.all([db.query(reserveSql,args(a)),contender.query(reserveSql,args(b))]);
    const winners=results.map(r=>r.rows[0].r);assert.equal(winners.filter(r=>r.id).length,1,'Only one final capacity reservation');
    const winner=winners[0].id?a:b,loser=winner===a?b:a,slot=winners.find(r=>r.id).id;
    assert(await begin(winner,slot));await receipt(winner,slot);await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[slot,winner.job.claim_token]);
    assert.equal((await reserve(loser)).reason,'AI_GLOBAL_BUDGET_STOP');
    const retained=await capacity();for(const y of [a,b]) {await db.query('delete from children where id=$1',[y.child]);await db.query('delete from course_tasks where id=$1',[y.task]);}
    assert.deepEqual(await capacity(),retained,'Contended nonzero capacity survives cleanup');
  } finally {await db.query('rollback');await contender.end();}
  await db.query('select disable_writing_context_advisory($1)',[parent]);
  await db.query("update writing_context_shadow_policy set execution_policy_kind='MEASURED',bootstrap_expires_at=null,dispatch_scope='DENY'");
  console.log('PASS: isolated Stage 1B bootstrap/fault scope, latches, no-send admission, one-shot authority, timing, metrics and durable deletion');
}
