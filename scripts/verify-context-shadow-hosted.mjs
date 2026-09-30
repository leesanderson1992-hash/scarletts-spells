/** READ ONLY. Operator-run after separately authorised hosted migrations. Never print connection details. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), {Client}=require('pg');
const url=process.env.CONTEXT_SHADOW_VERIFY_DATABASE_URL;
if (!url) throw new Error('CONTEXT_SHADOW_VERIFY_DATABASE_URL_REQUIRED');
const client=new Client({connectionString:url});
const versions=['20260906100000','20260906110000','20260924120000','20260924130000',
  '20260927120000','20260927130000','20260928120000','20260929100000','20260929110000','20260929120000','20260929130000','20260929140000','20260929150000','20260929160000','20260929170000'];
try {
  await client.connect(); await client.query('begin isolation level repeatable read read only');
  const history=(await client.query('select version from supabase_migrations.schema_migrations where version=any($1)',[versions])).rows.map(x=>x.version);
  assert(versions.every(v=>history.includes(v)),'SCHEMA_VERSION_INCOMPLETE');
  assert.deepEqual((await client.query('select enabled,ai_mode from writing_context_advisory_control')).rows,
    [{enabled:false,ai_mode:'disabled'}],'POST_MIGRATION_CONTROL_NOT_DISABLED');
  const constraint=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='writing_context_advisory_control'::regclass and conname='context_stage1_shadow_only'")).rows[0];
  assert(constraint?.definition.includes('enabled = false') && constraint.definition.includes('shadow'),'STAGE1_BOUNDARY_MISSING');
  assert.equal((await client.query("select convalidated from pg_constraint where conrelid='writing_context_advisory_control'::regclass and conname='context_stage1_shadow_only'")).rows[0]?.convalidated,true,'STAGE1_BOUNDARY_NOT_VALIDATED');
  const privateTables=['writing_context_ai_attempts','writing_context_detector_runs','writing_context_detector_members',
    'writing_context_provider_approvals','writing_context_learner_authorisations','writing_context_approval_revocations',
    'writing_context_shadow_policy','writing_context_shadow_jobs','writing_context_shadow_dispatches','writing_context_ai_rate_cards','writing_context_shadow_stops','writing_context_shadow_policy_history','writing_context_shadow_consumption','writing_context_provider_proof_learners',
    'writing_context_bootstrap_failures','writing_context_proof_fault_plans','writing_context_proof_fault_consumptions','writing_context_proof_fault_events',
    'writing_context_passage_findings','writing_context_passage_review_events'];
  for (const table of privateTables) {
    assert.equal((await client.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true,'RLS_MISSING');
    for (const role of ['anon','authenticated']) {
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await client.query('select has_table_privilege($1,$2,$3) ok',[role,table,privilege])).rows[0].ok,false,'PRIVATE_TABLE_GRANT');
    }
    assert.equal((await client.query("select count(*)::int n from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=$1::regclass and a.grantee=0",[table])).rows[0].n,0,'PUBLIC_PRIVATE_TABLE_GRANT');
  }
  // Owner-approved trust assumption: broad service authority is accepted, not credential containment.
  // Approved paths use immutable guards and canonical learner cleanup; no direct relabelling operation.
  const servicePrivileges=[];
  for (const table of privateTables) {
    const privileges={};
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
      privileges[privilege]=(await client.query('select has_table_privilege($1,$2,$3) ok',['service_role',table,privilege])).rows[0].ok;
    servicePrivileges.push({table,privileges});
  }
  // Verify the frozen consumption table's explicit grants; this is not a compromised-key defence.
  for (const privilege of ['INSERT','UPDATE','DELETE']) assert.equal((await client.query(
    "select has_table_privilege('service_role','writing_context_shadow_consumption',$1) ok",[privilege])).rows[0].ok,false,'CONSUMPTION_DIRECT_MUTATION_GRANT');
  assert.deepEqual((await client.query("select confrelid::regclass::text ref from pg_constraint where conrelid='writing_context_shadow_consumption'::regclass and contype='f'")).rows,
    [{ref:'writing_context_shadow_policy_history'}],'CONSUMPTION_PERSONAL_LINK');
  for (const fn of ['disable_writing_context_advisory(uuid)','enqueue_writing_context_shadow(uuid)','claim_writing_context_shadow(uuid)',
    'reconcile_writing_context_shadow()','begin_writing_context_shadow_dispatch(uuid,uuid)','monitor_writing_context_shadow()',
    'context_shadow_job_eligible(uuid,uuid,text,text,text,text,text,text)',
    'context_provider_proof_child(uuid)','context_shadow_scope_authorised(uuid,uuid)',
    'writing_context_shadow_operations_for_scope(timestamptz,timestamptz,text)',
    'stop_writing_context_shadow(text)','writing_context_shadow_operations(timestamptz,timestamptz)',
    'bind_writing_context_proof_fault(uuid,uuid)','record_writing_context_proof_fault_phase(uuid,uuid,text)',
    'writing_context_proof_fault_status(uuid,uuid)','release_writing_context_proof_fault(uuid,uuid)',
    'revoke_writing_context_proof_fault(uuid,uuid,text)','stop_failed_writing_context_bootstrap()',
    'retry_writing_context_passage(uuid,uuid)',
    'commit_reviewed_context_passage_finding(uuid,uuid,text)']) {
    for (const role of ['anon','authenticated']) assert.equal((await client.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,fn])).rows[0].ok,false,'PRIVATE_RPC_GRANT');
    assert.equal((await client.query("select has_function_privilege('service_role',$1,'EXECUTE') ok",[fn])).rows[0].ok,true,'SERVICE_RPC_MISSING');
  }
  const defaults=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_advisory_control' and column_name='ai_mode'")).rows[0];
  assert(defaults?.column_default.includes('disabled'),'DEFAULT_MODE_INVALID');
  const enabledDefault=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_advisory_control' and column_name='enabled'")).rows[0];
  assert.equal(enabledDefault?.column_default,'false','DEFAULT_ENABLED_INVALID');
  assert.equal((await client.query('select count(*)::int n from writing_context_shadow_policy where singleton')).rows[0].n,1,'POLICY_SINGLETON_INVALID');
  assert.deepEqual((await client.query('select execution_policy_kind,bootstrap_expires_at,dispatch_scope from writing_context_shadow_policy')).rows,
    [{execution_policy_kind:'MEASURED',bootstrap_expires_at:null,dispatch_scope:'DENY'}],'POST_PROOF_POLICY_NOT_DENIED');
  assert.equal((await client.query("select convalidated from pg_constraint where conrelid='writing_context_shadow_policy'::regclass and conname='context_execution_scope_check'")).rows[0]?.convalidated,true,'EXECUTION_SCOPE_BOUNDARY_MISSING');
  assert.equal((await client.query("select convalidated from pg_constraint where conrelid='writing_context_shadow_policy'::regclass and conname='context_adult_daily_spend_cap'")).rows[0]?.convalidated,true,'ADULT_DAILY_CAP_MISSING');
  assert.equal((await client.query("select convalidated from pg_constraint where conrelid='writing_context_provider_approvals'::regclass and conname='context_provider_retention_evidence_check'")).rows[0]?.convalidated,true,'RETENTION_MODE_BOUNDARY_MISSING');
  const bootstrapDefault=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_shadow_policy' and column_name='execution_policy_kind'")).rows[0];
  assert(bootstrapDefault?.column_default.includes('MEASURED'),'BOOTSTRAP_DEFAULT_NOT_MEASURED');
  const proofDefault=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_shadow_policy' and column_name='dispatch_scope'")).rows[0];
  assert(proofDefault?.column_default.includes('DENY'),'PROOF_SCOPE_DEFAULT_INVALID');
  const approvalDefault=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_provider_approvals' and column_name='dispatch_scope'")).rows[0];
  assert(approvalDefault?.column_default.includes('DENY'),'APPROVAL_SCOPE_DEFAULT_INVALID');
  assert.equal((await client.query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'")).rows[0]?.nspname,'extensions','PGCRYPTO_NAMESPACE_INVALID');
  for (const privilege of ['text,text','bytea,text']) assert.equal((await client.query(
    "select has_schema_privilege('service_role','extensions','USAGE') and has_function_privilege('service_role',$1,'EXECUTE') ok",[`extensions.digest(${privilege})`])).rows[0].ok,true,'SERVICE_DIGEST_UNAVAILABLE');
  for (const [signature,securityDefiner] of [['public.assert_context_rate_card()',false],
    ['public.record_parent_added_contextual_occurrence(text,uuid,text,text,text)',true]]) {
    const fn=(await client.query('select prosrc,prosecdef,proconfig,proowner::regrole::text owner from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
    assert(fn?.prosrc.includes('extensions.digest(') && !/(?<![\w.])digest\s*\(/.test(fn.prosrc),'DIGEST_QUALIFICATION_MISSING');
    assert.equal(fn.prosecdef,securityDefiner,'DIGEST_FUNCTION_SECURITY_CHANGED');
    assert.deepEqual(fn.proconfig,['search_path=public, pg_temp'],'DIGEST_FUNCTION_SEARCH_PATH_CHANGED');
    assert.equal((await client.query("select has_schema_privilege($1,'extensions','USAGE') and has_function_privilege($1,'extensions.digest(text,text)','EXECUTE') ok",[fn.owner])).rows[0].ok,true,'FUNCTION_OWNER_DIGEST_UNAVAILABLE');
  }
  for (const [table,trigger] of [['writing_source_snapshots','context_source_purpose'],
    ['writing_source_snapshots','context_source_purpose_immutable'],['task_submissions','context_submission_child'],
    ['writing_context_provider_proof_learners','context_proof_registration'],
    ['writing_context_provider_proof_learners','context_proof_registration_immutable'],
    ['writing_context_research_candidates','context_proof_research'],
    ['writing_context_proof_fault_plans','context_proof_fault_plan'],
    ['writing_context_ai_attempts','zz_context_proof_attempt'],['writing_context_ai_attempts','context_bootstrap_failure']])
    assert.equal((await client.query("select count(*)::int n from pg_trigger where tgrelid=$1::regclass and tgname=$2 and tgenabled='O'",[table,trigger])).rows[0].n,1,'PROOF_TRIGGER_MISSING');
  // Check every educational authority present in the real schema, including optional later modules.
  const unguarded=(await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and
      (c.relname like 'adle_%' or c.relname like 'learning_item%' or c.relname like 'child_word_treasure%'
       or c.relname in ('writing_issues','writing_samples','misspelling_instances','word_progress',
         'child_gold_coin_ledger_events','spelling_reward_events','spelling_reward_states',
         'writing_context_advisory_observations','writing_context_parent_decisions','writing_context_parent_added_cases',
         'writing_context_learning_handoffs','writing_shadow_projection_batches','writing_shadow_skill_evidence_projections'))
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and not a.attisdropped and a.attname in ('child_id','learner_id','occurrence_id','snapshot_id','learning_item_id'))
      and not exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='context_proof_educational_guard' and t.tgenabled='O')`)).rows;
  assert.equal(unguarded.length,0,'PROOF_EDUCATIONAL_GUARD_MISSING');
  const cascade=(await client.query("select count(*)::int n from pg_constraint where conrelid='writing_context_diagnostic_promotions'::regclass and contype='f' and confdeltype='c'")).rows[0].n;
  assert.equal(cascade,4,'DIAGNOSTIC_CASCADE_INCOMPLETE');
  await client.query('rollback');
  console.log(JSON.stringify({trust_assumption:'OWNER_APPROVED_TRUSTED_SERVICE_ROLE',service_role_effective_table_privileges:servicePrivileges}));
  console.log('PASS: hosted versions, disabled singleton/defaults, Stage 1 constraint, client RLS/RPC grants, owner-approved service authority, qualified digest and diagnostic cascades');
} catch {
  await client.query('rollback').catch(()=>{});
  process.stderr.write('FAIL: context shadow hosted verification; inspect privately with the operator. No connection/error body logged.\n');
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
