/** READ ONLY. Operator-run after separately authorised hosted migrations. Never print connection details. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), {Client}=require('pg');
const url=process.env.CONTEXT_SHADOW_VERIFY_DATABASE_URL;
if (!url) throw new Error('CONTEXT_SHADOW_VERIFY_DATABASE_URL_REQUIRED');
const client=new Client({connectionString:url});
const versions=['20260906100000','20260906110000','20260924120000','20260924130000',
  '20260927120000','20260927130000','20260928120000','20260929100000','20260929110000','20260929120000','20260929130000'];
try {
  await client.connect(); await client.query('begin isolation level repeatable read read only');
  const history=(await client.query('select version from supabase_migrations.schema_migrations where version=any($1)',[versions])).rows.map(x=>x.version);
  assert(versions.every(v=>history.includes(v)),'SCHEMA_VERSION_INCOMPLETE');
  assert.deepEqual((await client.query('select enabled,ai_mode from writing_context_advisory_control where singleton')).rows,
    [{enabled:false,ai_mode:'disabled'}],'POST_MIGRATION_CONTROL_NOT_DISABLED');
  const constraint=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conname='context_stage1_shadow_only'")).rows[0];
  assert(constraint?.definition.includes('enabled = false') && constraint.definition.includes('shadow'),'STAGE1_BOUNDARY_MISSING');
  const privateTables=['writing_context_ai_attempts','writing_context_detector_runs','writing_context_detector_members',
    'writing_context_provider_approvals','writing_context_learner_authorisations','writing_context_approval_revocations',
    'writing_context_shadow_policy','writing_context_shadow_jobs','writing_context_shadow_dispatches','writing_context_ai_rate_cards','writing_context_shadow_stops','writing_context_shadow_policy_history','writing_context_shadow_consumption'];
  for (const table of privateTables) {
    assert.equal((await client.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true,'RLS_MISSING');
    for (const role of ['anon','authenticated']) {
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await client.query('select has_table_privilege($1,$2,$3) ok',[role,table,privilege])).rows[0].ok,false,'PRIVATE_TABLE_GRANT');
    }
  }
  for (const privilege of ['INSERT','UPDATE','DELETE']) assert.equal((await client.query(
    "select has_table_privilege('service_role','writing_context_shadow_consumption',$1) ok",[privilege])).rows[0].ok,false,'CONSUMPTION_DIRECT_MUTATION_GRANT');
  assert.deepEqual((await client.query("select confrelid::regclass::text ref from pg_constraint where conrelid='writing_context_shadow_consumption'::regclass and contype='f'")).rows,
    [{ref:'writing_context_shadow_policy_history'}],'CONSUMPTION_PERSONAL_LINK');
  for (const fn of ['disable_writing_context_advisory(uuid)','enqueue_writing_context_shadow(uuid)','claim_writing_context_shadow(uuid)',
    'reconcile_writing_context_shadow()','begin_writing_context_shadow_dispatch(uuid,uuid)','monitor_writing_context_shadow()',
    'context_shadow_job_eligible(uuid,uuid,text,text,text,text,text,text)',
    'stop_writing_context_shadow(text)','writing_context_shadow_operations(timestamptz,timestamptz)']) {
    for (const role of ['anon','authenticated']) assert.equal((await client.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,fn])).rows[0].ok,false,'PRIVATE_RPC_GRANT');
    assert.equal((await client.query("select has_function_privilege('service_role',$1,'EXECUTE') ok",[fn])).rows[0].ok,true,'SERVICE_RPC_MISSING');
  }
  const defaults=(await client.query("select column_default from information_schema.columns where table_schema='public' and table_name='writing_context_advisory_control' and column_name='ai_mode'")).rows[0];
  assert(defaults?.column_default.includes('disabled'),'DEFAULT_MODE_INVALID');
  assert.equal((await client.query('select count(*)::int n from writing_context_shadow_policy where singleton')).rows[0].n,1,'POLICY_SINGLETON_INVALID');
  const cascade=(await client.query("select count(*)::int n from pg_constraint where conrelid='writing_context_diagnostic_promotions'::regclass and contype='f' and confdeltype='c'")).rows[0].n;
  assert.equal(cascade,4,'DIAGNOSTIC_CASCADE_INCOMPLETE');
  await client.query('rollback'); console.log('PASS: hosted schema versions, disabled singleton/defaults, Stage 1 constraint, RLS/RPC grants and diagnostic cascades');
} catch {
  await client.query('rollback').catch(()=>{});
  process.stderr.write('FAIL: context shadow hosted verification; inspect privately with the operator. No connection/error body logged.\n');
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
