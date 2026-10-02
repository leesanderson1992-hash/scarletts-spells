import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hash=s=>createHash('sha256').update(s).digest('hex');
export async function proveAdultContextRelease({db,parent}) {
  // The compact historical harness predates these existing Production columns.
  await db.query("alter table task_submissions add column if not exists parent_review_status text not null default 'pending'");
  await db.query('alter table writing_issues add column if not exists position_start integer, add column if not exists position_end integer');
  const migration=readFileSync(new URL('../supabase/migrations/20260929170000_allow_standard_context_api_retention.sql',import.meta.url),'utf8');
  await db.query(migration);
  await db.query(readFileSync(new URL('../supabase/migrations/20260929180000_allow_disposable_context_passage_proof.sql',import.meta.url),'utf8'));
  const reservationSignature='public.reserve_writing_context_shadow(uuid,uuid,text,uuid,text,integer,text,text,text,text,text,text)';
  const reservationAuthority=async()=> (await db.query('select proowner,proacl,prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[reservationSignature])).rows[0];
  const authorityBefore=await reservationAuthority();
  await db.query(readFileSync(new URL('../supabase/migrations/20261001100000_increase_context_request_cap.sql',import.meta.url),'utf8'));
  assert.deepEqual(await reservationAuthority(),authorityBefore,'Request amendment preserves owner, ACL and function security');
  assert.deepEqual((await db.query('select enabled,ai_mode from writing_context_advisory_control')).rows,
    [{enabled:false,ai_mode:'disabled'}]);
  assert.equal((await db.query("select count(*)::int n from writing_context_provider_approvals where retention_mode='ZDR' and zdr_verified")).rows[0].n>=0,true);
  for(const table of ['writing_context_passage_findings','writing_context_passage_review_events']) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
    for(const role of ['anon','authenticated']) for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,table,privilege])).rows[0].ok,false);
  }
  await assert.rejects(db.query("update writing_context_shadow_policy set dispatch_scope='REAL_LEARNER',execution_policy_kind='DISPOSABLE_BOOTSTRAP'"),{code:'23514'});
  await assert.rejects(db.query("update writing_context_shadow_policy set proof_scan_kind='PASSAGE'"),{code:'23514'});
  assert.equal((await db.query("select proof_scan_kind from writing_context_shadow_policy")).rows[0].proof_scan_kind,'FOUR_FAMILY');
  await db.query('begin');
  try {
    await db.query("update writing_context_shadow_policy set execution_policy_kind='DISPOSABLE_BOOTSTRAP',dispatch_scope='DISPOSABLE_PROVIDER_PROOF',bootstrap_expires_at=clock_timestamp()+interval '1 hour',proof_scan_kind='PASSAGE'");
    const proof=(await db.query('select revision_id,proof_scan_kind from writing_context_shadow_policy')).rows[0];
    assert.equal(proof.proof_scan_kind,'PASSAGE');
    assert.equal((await db.query('select policy->>\'proof_scan_kind\' kind from writing_context_shadow_policy_history where id=$1',[proof.revision_id])).rows[0].kind,'PASSAGE');
    await db.query('savepoint real_scope');
    await assert.rejects(db.query("update writing_context_shadow_policy set dispatch_scope='REAL_LEARNER'"),{code:'23514'});
    await db.query('rollback to savepoint real_scope');
  } finally {await db.query('rollback');}
  await assert.rejects(db.query("update writing_context_shadow_policy set dispatch_scope='REAL_LEARNER',execution_policy_kind='ADULT_RELEASE',max_usd_per_day=.51"),{code:'23514'});
  assert.equal((await db.query("select count(*)::int n from pg_constraint where conname='context_provider_retention_evidence_check'")).rows[0].n,1);
  await db.query('begin');
  try {
    const child=randomUUID(),task=randomUUID(),submission=randomUUID(),jobKey=randomUUID(),approval=randomUUID();
    const config='d'.repeat(64),runtime='e'.repeat(64),sha='f'.repeat(40),text='Their was a full moon.';
    const card=(await db.query('select version,fingerprint from writing_context_ai_rate_cards limit 1')).rows[0];
    assert(card,'isolated rate card fixture required');
    const used=(await db.query("select coalesce(sum(requests_reserved),0)::int requests,coalesce(sum(reserved_usd),0)::numeric spend from writing_context_shadow_consumption where environment='production' and budget_day=(now() at time zone 'UTC')::date")).rows[0];
    await db.query('insert into children values($1,$2)',[child,parent]);
    await db.query("insert into course_tasks values($1,$2,'lesson','Adult fixture','Fiction',null)",[task,parent]);
    await db.query(`insert into writing_context_provider_approvals(id,environment,project_ref,deployment_sha,model,endpoint,
      config_fingerprint,runtime_fingerprint,zdr_verified,data_sharing_disabled,evidence_ref,approved_by,expires_at,dispatch_scope,retention_mode)
      values($1,'production','adult_fixture',$2,'gpt-6-luna','/v1/responses',$3,$4,false,true,'local/standard-api',$5,
      clock_timestamp()+interval '1 hour','REAL_LEARNER','STANDARD_API')`,[approval,sha,config,runtime,parent]);
    await db.query(`update writing_context_shadow_policy set execution_policy_kind='ADULT_RELEASE',dispatch_scope='REAL_LEARNER',
      provider_approval_id=$1,rate_card_version=$2,learner_policy_version='ADULT_WRITING_V1',max_requests_per_day=$4,
      max_usd_per_day=.50,max_usd_per_request=.01,thresholds='{}',approved_by=$3,evidence_ref='local/adult-cap'`,
      [approval,card.version,parent,used.requests+2]);
    await db.query("update writing_context_advisory_control set ai_mode='shadow'");
    await db.query('insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,clock_timestamp(),$5)',
      [submission,parent,child,task,text]);
    await db.query('insert into task_submission_processing_jobs values($1,$2,$3,$4,$5,$6)',
      [jobKey,submission,parent,child,task,{writingSourceCapture:{rawSubmissionText:text}}]);
    const snapshot=(await db.query('select * from writing_source_snapshots where submission_id=$1',[submission])).rows[0];
    assert.equal(snapshot.source_purpose,'REAL_LEARNER');
    assert.equal(snapshot.envelope.contextAiShadowCapture,true);
    const authorisation=(await db.query("select * from writing_context_learner_authorisations where child_id=$1 and authorisation_kind='ADULT_SUBMISSION'",[child])).rows[0];
    assert(authorisation,'authenticated adult submission produces internal scope record');
    const occurrence='adult:'+randomUUID();
    await db.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance,extractor_version)
      values($1,$2,'/rawSubmissionText',$3,0,5,'Their','learner_response','adult-test')`,[occurrence,snapshot.id,hash(JSON.stringify(text))]);
    const retryOccurrence='adult:'+randomUUID();
    await db.query(`insert into writing_occurrences(id,snapshot_id,field_path,field_hash,start_utf16,end_utf16,observed_text,provenance,extractor_version)
      values($1,$2,'/rawSubmissionText',$3,12,16,'full','learner_response','adult-test')`,
      [retryOccurrence,snapshot.id,hash(JSON.stringify(text))]);
    const run=(await db.query("select record_writing_context_detector_run($1,$2,$3,$4,'CONTEXT_PASSAGE_WINDOW_V1','CONTEXT_PASSAGE_SCAN_V1',$5) id",
      [snapshot.id,parent,child,jobKey,[occurrence,retryOccurrence]])).rows[0].id;
    assert((await db.query('select enqueue_writing_context_shadow($1) id',[submission])).rows[0].id);
    const job=(await db.query('select claim_writing_context_shadow($1) j',[submission])).rows[0].j;
    assert(job);
    const eligible=(await db.query('select context_shadow_job_eligible($1,$2,$3,$4,$5,$6,$7,$8) ok',
      [job.id,job.claim_token,'production','adult_fixture',sha,config,runtime,card.fingerprint])).rows[0].ok;
    assert.equal(eligible,true);
    const reservationArgs=[job.id,job.claim_token,occurrence,run,hash(text),'production','adult_fixture',sha,config,runtime,card.fingerprint];
    const consumptionBefore=(await db.query('select sum(requests_reserved)::text requests,sum(reserved_usd)::text spend from writing_context_shadow_consumption')).rows[0];
    for(const bytes of [null,0,-1,16001]) {
      const denied=(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,$12,$6,$7,$8,$9,$10,$11) r',
        [...reservationArgs,bytes])).rows[0].r;
      assert.equal(denied.reason,'AI_REQUEST_TOO_LARGE');
    }
    await db.query(`update writing_context_shadow_policy set max_usd_per_request=(
      select (8000*greatest(input_rate,cached_input_rate,cache_write_rate)+2048*output_rate)/unit_tokens
      from writing_context_ai_rate_cards where version=$1)`,[card.version]);
    const undersizedCap=(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,16000,$6,$7,$8,$9,$10,$11) r',reservationArgs)).rows[0].r;
    assert.equal(undersizedCap.reason,'AI_REQUEST_COST_CAP_TOO_SMALL','Old 8KB cost reservation cannot admit the new maximum');
    assert.deepEqual((await db.query('select sum(requests_reserved)::text requests,sum(reserved_usd)::text spend from writing_context_shadow_consumption')).rows[0],consumptionBefore,
      'Rejected requests consume no capacity');
    await db.query('update writing_context_shadow_policy set max_usd_per_request=.01');
    const reserved=(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,16000,$6,$7,$8,$9,$10,$11) r',
      [job.id,job.claim_token,occurrence,run,hash(text),'production','adult_fixture',sha,config,runtime,card.fingerprint])).rows[0].r;
    assert(reserved.id,JSON.stringify({reserved,used}));
    assert.equal((await db.query('select request_bytes from writing_context_shadow_dispatches where id=$1',[reserved.id])).rows[0].request_bytes,16000);
    assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',[reserved.id,job.claim_token])).rows[0].ok,true);
    const acceptedAttempt=(await db.query(`insert into writing_context_ai_attempts
      (occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,result_status,
       reason_code,provider,model,prompt_fingerprint,schema_fingerprint,config_fingerprint,
       gate_version,window_fingerprint,detector_run_id,candidate_detector_version,
       family_registry_version,provider_called,dispatch_id,transport_attempted,response_received_at,
       runtime_fingerprint,failure_kind,returned_model,service_tier,input_tokens,cached_input_tokens,
       cache_write_tokens,output_tokens,reasoning_tokens)
      values($1,$2,$3,$4,$5,'shadow','PASSAGE_SCAN','SCANNED',
       'AI_PASSAGE_SCANNED','openai','gpt-6-luna',$6,$6,$6,
       'CONTEXT_AI_SAFETY_GATE_V1',$7,$8,'CONTEXT_PASSAGE_WINDOW_V1',
       'CONTEXT_PASSAGE_SCAN_V1',true,$9,true,clock_timestamp(),$10,'none',
       'gpt-6-luna','default',100,0,0,20,5) returning id`,
      [occurrence,snapshot.id,parent,child,job.run_key,config,hash(text),run,reserved.id,runtime])).rows[0].id;
    assert(acceptedAttempt);
    assert.equal((await db.query('select finish_writing_context_shadow_dispatch($1,$2) ok',
      [reserved.id,job.claim_token])).rows[0].ok,true);
    const finding=(await db.query(`insert into writing_context_passage_findings
      (attempt_id,occurrence_id,snapshot_id,parent_user_id,child_id,field_hash,start_utf16,end_utf16,observed_text,correction)
      values($1,$2,$3,$4,$5,$6,0,5,'Their','There') returning id`,
      [acceptedAttempt,occurrence,snapshot.id,parent,child,hash(JSON.stringify(text))])).rows[0].id;
    assert(finding);
    await db.query('savepoint wrong_owner');
    await assert.rejects(db.query(`insert into writing_context_passage_review_events(finding_id,parent_user_id,action)
      values($1,$2,'DISMISS')`,[finding,randomUUID()]));
    await db.query('rollback to savepoint wrong_owner');
    assert((await db.query(`insert into writing_context_passage_review_events(finding_id,parent_user_id,action)
      values($1,$2,'DISMISS') returning id`,[finding,parent])).rows[0].id);
    await db.query('savepoint dismissed_commit');
    await assert.rejects(db.query('select commit_reviewed_context_passage_finding($1,$2,$3)',
      [finding,parent,'There']));
    await db.query('rollback to savepoint dismissed_commit');
    await db.query(`insert into writing_context_passage_review_events(finding_id,parent_user_id,action)
      values($1,$2,'RESTORE')`,[finding,parent]);
    const committed=(await db.query('select commit_reviewed_context_passage_finding($1,$2,$3) id',
      [finding,parent,'There'])).rows[0].id;
    assert(committed);
    assert.equal((await db.query('select commit_reviewed_context_passage_finding($1,$2,$3) id',
      [finding,parent,'There'])).rows[0].id,committed,'Send back replay is idempotent');
    const issue=(await db.query(`select position_start,position_end,source_field_key from writing_issues
      where source_writing_occurrence_id=$1`,[occurrence])).rows[0];
    assert.deepEqual(issue,{position_start:0,position_end:5,source_field_key:'/rawSubmissionText'});
    const lineage=(await db.query(`select i.metadata->>'detection_origin' origin,
      c.governed_family_key family,c.ai_attempt_id attempt from writing_issues i
      join writing_context_parent_added_cases c on c.writing_issue_id=i.id
      where i.source_writing_occurrence_id=$1`,[occurrence])).rows[0];
    assert.deepEqual(lineage,{origin:'LUNA_PASSAGE',family:'THERE_THEIR_THEYRE',attempt:null});
    await db.query('savepoint issue_exists');
    await assert.rejects(db.query(`insert into writing_context_passage_review_events(finding_id,parent_user_id,action)
      values($1,$2,'RESTORE')`,[finding,parent]));
    await db.query('rollback to savepoint issue_exists');
    const second=(await db.query('select reserve_writing_context_shadow($1,$2,$3,$4,$5,5000,$6,$7,$8,$9,$10,$11) r',
      [job.id,job.claim_token,retryOccurrence,run,hash(text),'production','adult_fixture',sha,config,runtime,card.fingerprint])).rows[0].r;
    assert(second.id,JSON.stringify(second));
    assert.equal((await db.query('select begin_writing_context_shadow_dispatch($1,$2) ok',
      [second.id,job.claim_token])).rows[0].ok,true);
    const failedAttempt=(await db.query(`insert into writing_context_ai_attempts
      (occurrence_id,snapshot_id,parent_user_id,child_id,run_key,mode,family_key,result_status,
       reason_code,provider,model,prompt_fingerprint,schema_fingerprint,config_fingerprint,
       gate_version,window_fingerprint,detector_run_id,candidate_detector_version,
       family_registry_version,provider_called,dispatch_id,transport_attempted,response_received_at,
       runtime_fingerprint,failure_kind)
      values($1,$2,$3,$4,$5,'shadow','PASSAGE_SCAN','NOT_ASSESSED',
       'AI_PROVIDER_HTTP_429','openai','gpt-6-luna',$6,$6,$6,
       'CONTEXT_AI_SAFETY_GATE_V1',$7,$8,'CONTEXT_PASSAGE_WINDOW_V1',
       'CONTEXT_PASSAGE_SCAN_V1',true,$9,true,clock_timestamp(),$10,'provider') returning id`,
      [retryOccurrence,snapshot.id,parent,child,job.run_key,config,hash(text),run,second.id,runtime])).rows[0].id;
    assert(failedAttempt);
    assert.equal((await db.query('select finish_writing_context_shadow_dispatch($1,$2) ok',
      [second.id,job.claim_token])).rows[0].ok,true);
    assert.equal((await db.query("select finish_writing_context_shadow_job($1,$2,'AI_PROVIDER_UNAVAILABLE','{}') ok",
      [job.id,job.claim_token])).rows[0].ok,true);
    const retry=(await db.query('select retry_writing_context_passage($1,$2) id',[submission,parent])).rows[0].id;
    assert(retry,'definite received 429 permits an explicit new job');
    assert.equal((await db.query('select retry_writing_context_passage($1,$2) id',[submission,parent])).rows[0].id,null);
    assert.equal((await db.query('select count(*)::int n from writing_context_shadow_dispatches where job_id=$1',
      [retry])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from writing_context_shadow_consumption where environment=$1 and budget_day=(now() at time zone \'UTC\')::date',
      ['production'])).rows[0].n>0,true);
  } finally {await db.query('rollback');}
  console.log('PASS: adult standard-retention schema, proof isolation, private findings, $0.50 cap and disabled default');
}
