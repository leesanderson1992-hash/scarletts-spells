/** Called only inside the disposable Docker proof; never opens a hosted connection. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const hash = (s) => createHash('sha256').update(s).digest('hex');
export async function proveContextShadowStage1({ db, parent, child, task }) {
  await db.query("alter table task_submissions add column parent_review_status text not null default 'pending'");
  await db.query("alter table writing_occurrences add column if not exists extractor_version text not null default 'test'");
  // The reduced harness omitted this FK; match the real source-capture migration.
  await db.query('alter table writing_source_snapshots add foreign key(child_id) references children(id) on delete cascade');
  const files = ['20260929100000_harden_context_shadow_lifecycle.sql',
    '20260929110000_add_context_shadow_governance_and_dispatch.sql',
    '20260929120000_add_context_ai_cost_provenance.sql','20260929130000_add_context_shadow_operations.sql'];
  for (const file of files) await db.query(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows[0], { enabled:false, ai_mode:'disabled' });
  await assert.rejects(db.query("update writing_context_advisory_control set enabled=true,ai_mode='parent_advisory'"));
  const tables=['writing_context_provider_approvals','writing_context_learner_authorisations','writing_context_approval_revocations',
    'writing_context_shadow_policy','writing_context_shadow_jobs','writing_context_shadow_dispatches','writing_context_ai_rate_cards','writing_context_shadow_stops','writing_context_shadow_policy_history','writing_context_shadow_consumption'];
  for (const t of tables) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[t])).rows[0].relrowsecurity,true);
    for (const role of ['anon','authenticated']) assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT') ok",[role,t])).rows[0].ok,false);
  }
  for (const fn of ['enqueue_writing_context_shadow(uuid)','claim_writing_context_shadow(uuid)',
    'begin_writing_context_shadow_dispatch(uuid,uuid)','monitor_writing_context_shadow()'])
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') ok",[fn])).rows[0].ok,false);
  assert.equal((await db.query('select provider_approval_id,max_requests_per_day from writing_context_shadow_policy')).rows[0].provider_approval_id,null);
  await db.query('set role service_role');
  await db.query('update writing_context_shadow_policy set max_concurrent=1 where singleton');
  assert.equal((await db.query('select count(*)::int n from writing_context_shadow_policy_history')).rows[0].n,1);
  await assert.rejects(db.query("update writing_context_shadow_policy_history set policy='{}'"));
  await db.query('reset role');
  const approval=randomUUID(),auth=randomUUID(),version='disposable-card-v1', config='a'.repeat(64), runtime='b'.repeat(64), deployment='c'.repeat(40), window='d'.repeat(64);
  const cardFp=hash([version,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,
    '0.1000000000','0.0100000000','0.1250000000','0.5000000000','CONTEXT_COST_USD_V1'].join('|'));
  await db.query(`insert into writing_context_ai_rate_cards(version,provider,model,endpoint,service_tier,currency,unit_tokens,
    input_rate,cached_input_rate,cache_write_rate,output_rate,calculation_version,effective_at,source_url,evidence_ref,approved_by,fingerprint)
    values($1,'openai','gpt-6-luna','/v1/responses','default','USD',1000000,.10,.01,.125,.50,'CONTEXT_COST_USD_V1',now()-interval '1 hour',
      'https://developers.openai.com/api/docs/pricing','disposable/pricing',$2,$3)`,[version,parent,cardFp]);
  await assert.rejects(db.query('update writing_context_ai_rate_cards set input_rate=1 where version=$1',[version]));
  await db.query(`insert into writing_context_provider_approvals(id,environment,project_ref,deployment_sha,model,endpoint,config_fingerprint,
    runtime_fingerprint,zdr_verified,data_sharing_disabled,evidence_ref,approved_by,approved_at,expires_at)
    values($1,'staging','proj_disposable',$2,'gpt-6-luna','/v1/responses',$3,$4,true,true,'disposable/privacy',$5,now()-interval '1 hour',now()+interval '1 day')`,[approval,deployment,config,runtime,parent]);
  await db.query(`insert into writing_context_learner_authorisations(id,child_id,parent_user_id,policy_version,evidence_ref,approved_by,approved_at,expires_at)
    values($1,$2,$3,'disposable-v1','disposable/consent',$3,now()-interval '1 hour',now()+interval '1 day')`,[auth,child,parent]);
  // These limits are permissive synthetic fixture values, never Production recommendations.
  await db.query(`update writing_context_shadow_policy set provider_approval_id=$1,rate_card_version=$2,learner_policy_version='disposable-v1',
    max_requests_per_day=100,max_usd_per_day=1,max_usd_per_request=.01,evidence_ref='disposable/limits',approved_by=$3,
    thresholds='{"window_seconds":3600,"minimum_calls":100,"error_rate":1,"timeout_rate":1,"malformed_rate":1,"gate_failure_rate":1,"p95_ms":9000,"max_queue_age_seconds":86400}'`,[approval,version,parent]);
  await assert.rejects(db.query("update writing_context_shadow_policy set thresholds='{\"minimum_calls\":0}'"));
  await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  async function fixture(childId=child) {
    const submission=randomUUID(),jobKey=randomUUID();
    await db.query('insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,clock_timestamp(),$5)',[submission,parent,childId,task,'Their cat is here.']);
    await db.query('insert into task_submission_processing_jobs values($1,$2,$3,$4,$5,$6)',[jobKey,submission,parent,childId,task,{writingSourceCapture:{rawSubmissionText:'Their cat is here.'}}]);
    const snapshot=(await db.query('select id from writing_source_snapshots where submission_id=$1',[submission])).rows[0].id;
    const occurrence=`stage1:${randomUUID()}`;
    await db.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance,extractor_version)
      values($1,$2,'/rawSubmissionText',$3,0,5,'Their','learner_response','disposable-extractor')`,[occurrence,snapshot,hash(JSON.stringify('Their cat is here.'))]);
    const run=(await db.query("select record_writing_context_detector_run($1,$2,$3,$4,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',$5) id",[snapshot,parent,childId,jobKey,[occurrence]])).rows[0].id;
    const queued=(await db.query('select enqueue_writing_context_shadow($1) id',[submission])).rows[0].id; assert(queued);
    const job=(await db.query('select claim_writing_context_shadow($1) job',[submission])).rows[0].job; assert(job);
    return {submission,snapshot,occurrence,run,job,child:childId};
  }
  const f=await fixture();
  const reserveSql='select reserve_writing_context_shadow($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result';
  const reserveArgs=(x,overrides={})=>[x.job.id,x.job.claim_token,x.occurrence,x.run,window,5000,overrides.environment??'staging','proj_disposable',deployment,config,runtime,cardFp];
  const reserve = async (x=f,overrides={}) => (await db.query(reserveSql,reserveArgs(x,overrides))).rows[0].result;
  assert.equal((await reserve(f,{environment:'production'})).reason,'AI_PROVIDER_APPROVAL_UNAVAILABLE');
  await db.query('begin');
  await db.query(`insert into writing_context_approval_revocations(learner_authorisation_id,revoked_by,evidence_ref) values($1,$2,'disposable/revoke')`,[auth,parent]);
  assert.equal((await reserve()).reason,'AI_LEARNER_NOT_AUTHORISED'); await db.query('rollback');
  const d=(await reserve()).id; assert(d);
  assert.equal((await reserve()).reason,'AI_ALREADY_RESERVED');
  await db.query('begin'); await db.query('update children set parent_user_id=$1 where id=$2',[randomUUID(),child]);
  assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[d,f.job.claim_token])).rows[0].ok,false);
  await db.query('rollback');
  assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[d,f.job.claim_token])).rows[0].ok,true);
  assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[d,f.job.claim_token])).rows[0].ok,false);
  const f2=await fixture(); assert.equal((await reserve(f2)).reason,'AI_GLOBAL_CONCURRENCY_LIMIT');
  const insertAttempt=async(x,dispatch,decision='VALID',input=100,output=20,failure='none')=>await db.query(`insert into writing_context_ai_attempts(
    occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,result_status,reason_code,provider,model,returned_model,
    prompt_fingerprint,schema_fingerprint,config_fingerprint,gate_version,window_fingerprint,detector_run_id,candidate_detector_version,
    family_registry_version,provider_called,dispatch_id,input_tokens,cached_input_tokens,cache_write_tokens,output_tokens,reasoning_tokens,
    service_tier,runtime_fingerprint,failure_kind)
    values($1,$2,$3,$4,$5,'shadow','THERE_THEIR_THEYRE',$6,'SUPPORTED_USE','openai','gpt-6-luna','gpt-6-luna',
      $7,$7,$7,'CONTEXT_AI_SAFETY_GATE_V1',$8,$9,'CONTEXT_ROUTING_FOUR_FAMILY_V1','CONTEXT_FOUR_FAMILY_V1',true,$10,$11,0,0,$12,5,'default',$13,$14) returning *`,
    [x.occurrence,x.snapshot,parent,x.child,x.job.run_key,decision,config,window,x.run,dispatch,input,output,runtime,failure]);
  await db.query('select disable_writing_context_advisory($1)',[parent]);
  const fact=(await insertAttempt(f,d)).rows[0]; assert.equal(fact.calculated_cost_usd,'0.00002000');
  assert.equal(fact.billing_status,'KNOWN'); assert.equal(fact.completed_after_disable,true); assert.equal(fact.rate_card_fingerprint,cardFp);
  assert.equal((await db.query('select finish_writing_context_shadow_dispatch($1,$2) ok',[d,f.job.claim_token])).rows[0].ok,true);
  assert.equal((await reserve(f2)).reason,'AI_CONTROL_DISABLED');
  await assert.rejects(db.query('update writing_context_ai_attempts set reasoning_tokens=0 where id=$1',[fact.id]));
  assert.equal((await db.query('select count(*)::int n from writing_context_advisory_observations where occurrence_id=$1',[f.occurrence])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from writing_issues where source_writing_occurrence_id=$1',[f.occurrence])).rows[0].n,0);
  const ops=(await db.query("select writing_context_shadow_operations(now()-interval '1 day',clock_timestamp()) o")).rows[0].o;
  assert.equal(ops.totals.provider_calls,1); assert.equal(ops.totals.valid,1); assert.equal(ops.unrecorded_sends,0);
  // Budget and missing-receipt hard stops, with rollback leaving the scenario independent.
  await db.query('begin'); await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  const budget=await fixture(); await db.query('update writing_context_shadow_policy set max_requests_per_day=1');
  assert.equal((await reserve(budget)).reason,'AI_GLOBAL_BUDGET_STOP');
  assert.equal((await db.query('select ai_mode from writing_context_advisory_control')).rows[0].ai_mode,'disabled');
  await db.query('rollback');
  await db.query('begin'); await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  const orphan=await fixture(),orphanSlot=(await reserve(orphan)).id; assert(orphanSlot);
  await db.query('select begin_writing_context_shadow_dispatch($1,$2)',[orphanSlot,orphan.job.claim_token]);
  await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[orphanSlot,orphan.job.claim_token]);
  assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,false);
  assert.equal((await db.query('select code from writing_context_shadow_stops order by created_at desc limit 1')).rows[0].code,'AI_MISSING_PROVENANCE_STOP');
  await db.query('rollback');
  // A reservation made before kill is cancelled at final admission.
  await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  const f3=await fixture(),d3=(await reserve(f3)).id; assert(d3);
  await db.query('select disable_writing_context_advisory($1)',[parent]);
  assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[d3,f3.job.claim_token])).rows[0].ok,false);
  assert.equal((await db.query('select state from writing_context_shadow_dispatches where id=$1',[d3])).rows[0].state,'cancelled');
  // Populated diagnostic deletion, the omitted Stage 0 lifecycle case.
  const decision=(await db.query("insert into writing_context_parent_decisions(occurrence_id,parent_user_id,child_id,family_key,classification) values($1,$2,$3,'THERE_THEIR_THEYRE','VALID') returning id",[f.occurrence,parent,child])).rows[0].id;
  await db.query("insert into writing_context_diagnostic_promotions(decision_id,occurrence_id,parent_user_id,child_id,category) values($1,$2,$3,$4,'OTHER')",[decision,f.occurrence,parent,child]);
  const research=(await db.query("insert into writing_context_research_candidates(parent_decision_id,category) values($1,'OTHER') returning id",[decision])).rows[0].id;
  await db.query('delete from writing_source_snapshots where id=$1',[f.snapshot]);
  for (const [table,key,id] of [['writing_context_ai_attempts','id',fact.id],['writing_context_shadow_dispatches','id',d],
    ['writing_context_shadow_jobs','id',f.job.id],['writing_context_diagnostic_promotions','decision_id',decision],['writing_context_research_candidates','id',research]])
    assert.equal((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[id])).rows[0].n,0);
  // Two independent connections prove database serialization, not a sequential simulation.
  const sibling=new db.constructor(db.connectionParameters); await sibling.connect();
  try {
    await db.query("update writing_context_advisory_control set ai_mode='shadow'");
    const concurrent=await fixture();
    const responses=await Promise.all([db.query(reserveSql,reserveArgs(concurrent)),sibling.query(reserveSql,reserveArgs(concurrent))]);
    assert.equal(responses.filter(x=>x.rows[0].result.id).length,1);
    assert.equal(responses.filter(x=>x.rows[0].result.reason==='AI_ALREADY_RESERVED').length,1);
    const slot=responses.find(x=>x.rows[0].result.id).rows[0].result.id;
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[slot,concurrent.job.claim_token]);
    const killRace=await fixture();
    await db.query('begin'); await db.query('select 1 from writing_context_advisory_control where singleton for update');
    const waiting=sibling.query(reserveSql,reserveArgs(killRace));
    await db.query('select disable_writing_context_advisory($1)',[parent]); await db.query('commit');
    assert.equal((await waiting).rows[0].result.reason,'AI_CONTROL_DISABLED');
    assert.equal((await db.query('select count(*)::int n from writing_context_shadow_dispatches where job_id=$1',[killRace.job.id])).rows[0].n,0);
  } finally { await db.query('rollback'); await sibling.end(); }
  // Learner cascade with a populated sent attempt and independent feedback/research pointers.
  await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  const disposableChild=randomUUID(); await db.query('insert into children values($1,$2)',[disposableChild,parent]);
  await db.query(`insert into writing_context_learner_authorisations(child_id,parent_user_id,policy_version,evidence_ref,approved_by,approved_at,expires_at)
    values($1,$2,'disposable-v1','disposable/deletion',$2,now()-interval '1 hour',now()+interval '1 day')`,[disposableChild,parent]);
  const deleted=await fixture(disposableChild),deletedSlot=(await reserve(deleted)).id; assert(deletedSlot);
  await db.query('select begin_writing_context_shadow_dispatch($1,$2)',[deletedSlot,deleted.job.claim_token]);
  const deletedFact=(await insertAttempt(deleted,deletedSlot)).rows[0].id;
  const deletedDecision=(await db.query("insert into writing_context_parent_decisions(occurrence_id,parent_user_id,child_id,family_key,classification) values($1,$2,$3,'THERE_THEIR_THEYRE','VALID') returning id",[deleted.occurrence,parent,disposableChild])).rows[0].id;
  const deletedResearch=(await db.query("insert into writing_context_research_candidates(parent_decision_id,category) values($1,'OTHER') returning id",[deletedDecision])).rows[0].id;
  await db.query('delete from children where id=$1',[disposableChild]);
  for (const [table,key,id] of [['writing_source_snapshots','id',deleted.snapshot],['writing_context_ai_attempts','id',deletedFact],
    ['writing_context_shadow_dispatches','id',deletedSlot],['writing_context_shadow_jobs','id',deleted.job.id],
    ['writing_context_parent_decisions','id',deletedDecision],['writing_context_research_candidates','id',deletedResearch],
    ['writing_context_learner_authorisations','child_id',disposableChild]])
    assert.equal((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from writing_context_ai_rate_cards where version=$1',[version])).rows[0].n,1);
  await db.query('select disable_writing_context_advisory($1)',[parent]);
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows[0],{enabled:false,ai_mode:'disabled'});

  // Independent synthetic Production accounting scope; all connections are this Docker DB.
  const productionApproval=randomUUID();
  await db.query(`insert into writing_context_provider_approvals(id,environment,project_ref,deployment_sha,model,endpoint,
    config_fingerprint,runtime_fingerprint,zdr_verified,data_sharing_disabled,evidence_ref,approved_by,approved_at,expires_at)
    values($1,'production','proj_disposable',$2,'gpt-6-luna','/v1/responses',$3,$4,true,true,'disposable/budget',$5,
      now()-interval '1 hour',now()+interval '1 day')`,[productionApproval,deployment,config,runtime,parent]);
  async function budgetPolicy(requests=3,usd='.03') {
    await db.query('update writing_context_shadow_policy set provider_approval_id=$1,max_requests_per_day=$2,max_usd_per_day=$3',
      [productionApproval,requests,usd]);
    await db.query("update writing_context_advisory_control set ai_mode='shadow'");
  }
  async function budgetFixture() {
    const c=randomUUID(); await db.query('insert into children values($1,$2)',[c,parent]);
    await db.query(`insert into writing_context_learner_authorisations(child_id,parent_user_id,policy_version,evidence_ref,approved_by,approved_at,expires_at)
      values($1,$2,'disposable-v1','disposable/budget-consent',$2,now()-interval '1 hour',now()+interval '1 day')`,[c,parent]);
    return fixture(c);
  }
  const productionArgs=x=>reserveArgs(x,{environment:'production'});
  const reserveProduction=async x=>(await db.query(reserveSql,productionArgs(x))).rows[0].result;
  async function consume(x,kind='known') {
    const slot=(await reserveProduction(x)).id; assert(slot);
    assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[slot,x.job.claim_token])).rows[0].ok,true);
    if(kind!=='missing-receipt') {
      const receipt=(await insertAttempt(x,slot,kind==='known'?'VALID':'NOT_ASSESSED',kind==='known'?100:null,kind==='known'?20:null,
        kind==='timeout'?'timeout':kind==='known'?'none':'provider')).rows[0];
      assert.equal(receipt.billing_status,kind==='known'?'KNOWN':'UNKNOWN');
      if(kind!=='known') assert.equal(receipt.calculated_cost_usd,null);
    }
    await db.query('select finish_writing_context_shadow_dispatch($1,$2)',[slot,x.job.claim_token]);
    return slot;
  }
  const consumption=async()=>(await db.query(`select coalesce(sum(requests_reserved),0)::int requests,
    coalesce(sum(requests_admitted),0)::int admitted,coalesce(sum(reserved_usd),0)::numeric(20,8)::text exposure,
    coalesce(sum(known_actual_usd),0)::numeric(20,8)::text actual,
    coalesce(sum(admitted_exposure_usd-known_exposure_usd),0)::numeric(20,8)::text unknown
    from writing_context_shadow_consumption where environment='production'
    and budget_day=(clock_timestamp() at time zone 'UTC')::date`)).rows[0];
  // No personal/prose dimensions, no learner/source FK, no direct service-role mutation.
  const columns=(await db.query("select column_name from information_schema.columns where table_name='writing_context_shadow_consumption' order by ordinal_position")).rows.map(x=>x.column_name);
  assert.deepEqual(columns,['environment','budget_day','policy_revision_id','currency','requests_reserved','requests_admitted','reserved_usd',
    'admitted_exposure_usd','known_actual_usd','known_exposure_usd','sequence','updated_at']);
  for(const privilege of ['INSERT','UPDATE','DELETE']) assert.equal((await db.query("select has_table_privilege('service_role','writing_context_shadow_consumption',$1) ok",[privilege])).rows[0].ok,false);
  assert.deepEqual((await db.query("select confrelid::regclass::text ref from pg_constraint where conrelid='writing_context_shadow_consumption'::regclass and contype='f'")).rows,
    [{ref:'writing_context_shadow_policy_history'}]);
  for(const scenario of ['known-snapshot','known-learner','unknown-snapshot','timeout-learner','missing-receipt','multiple-snapshots']) {
    await db.query('begin');
    try {
      await budgetPolicy(); const sources=[];
      for(let i=0;i<3;i++) {
        const x=await budgetFixture(); sources.push(x);
        await consume(x,i===0 ? scenario.startsWith('unknown')?'unknown':scenario.startsWith('timeout')?'timeout':scenario==='missing-receipt'?'missing-receipt':'known' : 'known');
      }
      const before=await consumption(); assert.equal(before.requests,3); assert.equal(before.admitted,3); assert.equal(before.exposure,'0.03000000');
      assert.equal(before.unknown,['unknown-snapshot','timeout-learner','missing-receipt'].includes(scenario)?'0.01000000':'0.00000000');
      const fourth=await budgetFixture();
      await db.query('savepoint full_budget');
      assert.equal((await reserveProduction(fourth)).reason,'AI_GLOBAL_BUDGET_STOP');
      assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows[0],{enabled:false,ai_mode:'disabled'});
      await db.query('rollback to savepoint full_budget');
      for(const x of scenario==='multiple-snapshots'?sources:[sources[0]]) {
        await db.query(scenario.endsWith('learner')?'delete from children where id=$1':'delete from writing_source_snapshots where id=$1',
          [scenario.endsWith('learner')?x.child:x.snapshot]);
        for(const [table,key,value] of [['writing_context_shadow_dispatches','job_id',x.job.id],['writing_context_ai_attempts','occurrence_id',x.occurrence],
          ['writing_context_shadow_jobs','id',x.job.id],['writing_occurrences','id',x.occurrence],['writing_context_detector_runs','id',x.run]])
          assert.equal((await db.query(`select count(*)::int n from ${table} where ${key}=$1`,[value])).rows[0].n,0);
      }
      assert.deepEqual(await consumption(),before,'privacy deletion must not refund capacity or lose known/unknown accounting');
      const daily=(await db.query('select writing_context_shadow_operations(null,null) o')).rows[0].o.daily_capacity;
      assert.equal(daily.requests_admitted,3); assert.equal(daily.requests_reserved,3); assert.equal(daily.reserved_usd,.03);
      assert.equal(daily.remaining_requests,0); assert.equal(daily.remaining_reserved_usd,0);
      assert.equal(daily.known_actual_usd,Number(before.actual)); assert.equal(daily.unknown_or_unsettled_admitted_usd,Number(before.unknown));
      assert.equal((await reserveProduction(fourth)).reason,'AI_GLOBAL_BUDGET_STOP');
      assert.deepEqual(await consumption(),before);
      console.log(`PASS budget deletion: ${scenario}; 3 requests/$0.03 remain consumed and fourth remains denied`);
    } finally { await db.query('rollback'); }
  }
  await db.query('begin');
  try {
    await budgetPolicy(); const x=await budgetFixture(),slot=(await reserveProduction(x)).id; assert(slot);
    const reserved=await consumption(); assert.equal(reserved.admitted,0);
    await db.query('select disable_writing_context_advisory($1)',[parent]);
    assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[slot,x.job.claim_token])).rows[0].ok,false);
    assert.deepEqual(await consumption(),reserved,'cancelled unsent reservations retain conservative capacity, no admission count');
    await db.query('delete from writing_source_snapshots where id=$1',[x.snapshot]);
    assert.deepEqual(await consumption(),reserved);
    console.log('PASS budget: unsent kill cancellation preserves reservation, denial creates no admitted unit');
  } finally { await db.query('rollback'); }
  for(const sent of [false,true]) {
    await db.query('begin');
    try {
      await budgetPolicy(); const x=await budgetFixture(),slot=(await reserveProduction(x)).id; assert(slot);
      if(sent) await db.query('select begin_writing_context_shadow_dispatch($1,$2)',[slot,x.job.claim_token]);
      const before=await consumption();
      await db.query("update writing_context_shadow_jobs set claimed_at=clock_timestamp()-interval '61 seconds' where id=$1",[x.job.id]);
      const renewed=(await db.query('select claim_writing_context_shadow($1) job',[x.submission])).rows[0].job; assert(renewed);
      assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[slot,renewed.claim_token])).rows[0].ok,false);
      assert.equal((await reserveProduction({...x,job:renewed})).reason,'AI_ALREADY_RESERVED');
      assert.deepEqual(await consumption(),before);
      if(sent) assert.equal((await db.query('select monitor_writing_context_shadow() ok')).rows[0].ok,false);
      console.log(`PASS budget: stale ${sent?'possibly-sent':'unsent'} recovery never resends or refunds`);
    } finally { await db.query('rollback'); }
  }
  await db.query('begin');
  try {
    await budgetPolicy();
    const revision=(await db.query('select revision_id from writing_context_shadow_policy')).rows[0].revision_id;
    await db.query(`insert into writing_context_shadow_consumption(environment,budget_day,policy_revision_id,requests_reserved,reserved_usd,sequence)
      values('production',(clock_timestamp() at time zone 'UTC')::date-1,$1,3,.03,1)`,[revision]);
    const historical=(await db.query("select * from writing_context_shadow_consumption where environment='production' and budget_day<(clock_timestamp() at time zone 'UTC')::date")).rows;
    const x=await budgetFixture(),slot=await consume(x); assert(slot);
    const before=await consumption();
    await db.query('insert into writing_context_ai_attempts select * from writing_context_ai_attempts where dispatch_id=$1 on conflict do nothing',[slot]);
    assert.deepEqual(await consumption(),before,'receipt replay cannot settle twice');
    const original=(await db.query('select id from writing_context_ai_attempts where dispatch_id=$1',[slot])).rows[0].id;
    await db.query('delete from writing_context_ai_attempts where id=$1',[original]);
    assert.deepEqual(await consumption(),before,'receipt-only deletion cannot refund accounting');
    await insertAttempt(x,slot);
    assert.deepEqual(await consumption(),before,'known receipt reinsert after deletion cannot settle twice');
    assert.deepEqual((await db.query("select * from writing_context_shadow_consumption where environment='production' and budget_day<(clock_timestamp() at time zone 'UTC')::date")).rows,historical);
    await db.query('savepoint refund');
    await assert.rejects(db.query("update writing_context_shadow_consumption set requests_reserved=0,sequence=sequence+1 where environment='production'"));
    await db.query('rollback to savepoint refund');
    await assert.rejects(db.query("delete from writing_context_shadow_consumption where environment='production'"));
    await db.query('rollback to savepoint refund');
    console.log('PASS budget: UTC rollover preserves history; immutable receipt settles once; refund/delete rejected');
  } finally { await db.query('rollback'); }
  await db.query('begin');
  try {
    await budgetPolicy(); const x=await budgetFixture(),before=await consumption();
    await db.query('savepoint invalid_dispatch'); const bad=productionArgs(x); bad[4]='invalid-fingerprint';
    await assert.rejects(db.query(reserveSql,bad));
    await db.query('rollback to savepoint invalid_dispatch');
    assert.deepEqual(await consumption(),before,'dispatch insert failure rolls consumption back atomically');
    assert.equal((await db.query('select count(*)::int n from writing_context_shadow_dispatches where job_id=$1',[x.job.id])).rows[0].n,0);
    assert.equal((await reserveProduction({...x,job:{...x.job,claim_token:randomUUID()}})).reason,'AI_SOURCE_INELIGIBLE');
    assert.deepEqual(await consumption(),before,'pre-reservation denial consumes nothing');
    console.log('PASS budget: reservation denial and transaction failure consume nothing');
  } finally { await db.query('rollback'); }
  // Committed fixtures and two physical connections race for the last quota slot.
  const contender=new db.constructor(db.connectionParameters); await contender.connect();
  async function compete(connection,x) {
    await connection.query('begin');
    try {
      const result=(await connection.query(reserveSql,productionArgs(x))).rows[0].result;
      if(result.id) {
        assert.equal((await connection.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[result.id,x.job.claim_token])).rows[0].ok,true);
        await connection.query('select finish_writing_context_shadow_dispatch($1,$2)',[result.id,x.job.claim_token]);
      }
      await connection.query('commit'); return result;
    } catch(error) { await connection.query('rollback'); throw error; }
  }
  try {
    for(const [label,requests,usd] of [['final request',1,'.01'],['final spend',100,'.02']]) {
      await budgetPolicy(requests,usd); const a=await budgetFixture(),b=await budgetFixture();
      const before=await consumption(),results=await Promise.all([compete(db,a),compete(contender,b)]);
      assert.equal(results.filter(x=>x.id).length,1); assert.equal(results.filter(x=>x.reason==='AI_GLOBAL_BUDGET_STOP').length,1);
      const after=await consumption(); assert.equal(after.requests,before.requests+1); assert.equal(after.admitted,before.admitted+1);
      assert.equal(Number(after.exposure),Number(before.exposure)+.01);
      console.log(`PASS budget concurrency: ${label}; exactly one reservation/admission across policy revisions`);
    }
    await budgetPolicy(100,'1'); const race=await budgetFixture(),slot=(await reserveProduction(race)).id; assert(slot);
    const before=await consumption();
    await db.query('begin'); await db.query('select 1 from writing_context_advisory_control where singleton for update');
    const waiting=contender.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[slot,race.job.claim_token]);
    await db.query('select disable_writing_context_advisory($1)',[parent]); await db.query('commit');
    assert.equal((await waiting).rows[0].ok,false); assert.deepEqual(await consumption(),before);
    console.log('PASS budget: final admission waiting behind committed kill remains denied');
  } finally { await db.query('rollback'); await contender.end(); }
  await db.query('select disable_writing_context_advisory($1)',[parent]);
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows[0],{enabled:false,ai_mode:'disabled'});
  console.log('PASS: Stage 1 defaults, RLS, approvals, single dispatch, concurrent admission/kill, hard stops, cost, invisible shadow and populated snapshot/learner deletion');
}
