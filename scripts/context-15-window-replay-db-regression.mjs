import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const container = `context-15-window-replay-${randomUUID().slice(0, 8)}`;
const run = (args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 }).trim();
let db;
let started = false;
let stage = 'start';
try {
  run(['run', '--rm', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=disposable-proof-only',
    '-p', '127.0.0.1::5432', 'postgres:16-alpine']);
  started = true;
  const port = Number(run(['port', container, '5432/tcp']).split(':').at(-1));
  for (let i = 0; i < 30; i++) {
    try { run(['exec', container, 'pg_isready', '-U', 'postgres']); break; }
    catch { if (i === 29) throw new Error('LOCAL_POSTGRES_UNAVAILABLE');
      await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  db = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'disposable-proof-only' });
  db.on('error', () => {});
  stage = 'connect';
  await db.connect();
  stage = 'schema';
  await db.query(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create table public.children(id uuid primary key, parent_user_id uuid, is_archived boolean);
    create table public.course_tasks(id uuid primary key, parent_user_id uuid, task_type text);
    create table public.task_submissions(id uuid primary key, task_id uuid, child_id uuid,
      parent_user_id uuid, parent_review_status text, submitted_at timestamptz);
    create table public.writing_source_snapshots(id uuid primary key, submission_id uuid,
      child_id uuid, parent_user_id uuid, source_purpose text, envelope jsonb);
    create table public.writing_context_shadow_jobs(id uuid primary key, snapshot_id uuid unique,
      status text, error_code text, claim_token uuid, claimed_at timestamptz,
      completed_at timestamptz, claim_count integer, run_key text, next_eligible_at timestamptz,
      summary jsonb);
    create table public.writing_context_advisory_control(singleton boolean, enabled boolean, ai_mode text);
    create table public.writing_context_shadow_policy(singleton boolean, provider_approval_id uuid,
      execution_policy_kind text, dispatch_scope text, revision_id uuid, learner_policy_version text);
    create table public.writing_context_provider_approvals(id uuid primary key, environment text,
      dispatch_scope text, model text, endpoint text, config_fingerprint text,
      runtime_fingerprint text, approved_at timestamptz, expires_at timestamptz);
    create table public.writing_context_approval_revocations(provider_approval_id uuid, learner_authorisation_id uuid);
    create table public.course_context_replay_grants(id uuid primary key default gen_random_uuid(),
      snapshot_id uuid unique, source_hash text, approved_by uuid, evidence_ref text,
      approved_at timestamptz default clock_timestamp(), expires_at timestamptz);
    create table public.writing_context_shadow_dispatches(job_id uuid);
    create table public.writing_context_ai_attempts(snapshot_id uuid);
    create table public.writing_context_passage_findings(snapshot_id uuid);
    create table public.writing_context_learner_authorisations(id uuid primary key,
      child_id uuid, parent_user_id uuid, policy_version text, authorisation_kind text,
      approved_by uuid, expires_at timestamptz);
    create function public.reject_writing_fact_update() returns trigger language plpgsql as $$
      begin raise exception 'immutable'; end $$;
  `);
  const migration = readFileSync(new URL('../supabase/migrations/20261022130000_replay_15_window_course_scan.sql', import.meta.url), 'utf8');
  stage = 'migration';
  await db.query(migration);
  const capacityMigration = readFileSync(new URL('../supabase/migrations/20261022210000_allow_distinct_15_window_capacity_replay.sql', import.meta.url), 'utf8');
  await db.query(capacityMigration);
  stage = 'fixture';
  const signature = 'public.replay_named_15_window_course_scan(text,uuid,text,timestamptz)';
  for (const role of ['anon', 'authenticated']) assert.equal((await db.query(
    'select has_function_privilege($1,$2,$3) allowed', [role, signature, 'EXECUTE'])).rows[0].allowed, false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',
    ['service_role', signature, 'EXECUTE'])).rows[0].allowed, true);

  const owner = randomUUID(), approval = randomUUID(), authorisation = randomUUID();
  const source = 'c994580f-0662-4f7c-9365-7ea39e6950b8';
  const job = 'c7a32b7e-08c5-4804-b0ee-b732cfbe1728';
  const submission = 'eace113f-3521-400c-9c55-c319f0a1bd1f';
  const child = 'e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e';
  const task = randomUUID();
  const envelope = { contextAiModeAtCapture: 'shadow', contextAiShadowCapture: true,
    contextAdvisoryCapture: false, rawSubmissionText: 'Synthetic writing for a disposable test.' };
  await db.query('insert into auth.users values($1)', [owner]);
  await db.query('insert into children values($1,$2,false)', [child, owner]);
  await db.query("insert into course_tasks values($1,$2,'lesson')", [task, owner]);
  await db.query("insert into task_submissions values($1,$2,$3,$4,'pending',clock_timestamp())",
    [submission, task, child, owner]);
  await db.query("insert into writing_source_snapshots values($1,$2,$3,$4,'REAL_LEARNER',$5)",
    [source, submission, child, owner, envelope]);
  await db.query(`insert into writing_context_shadow_jobs values
    ($1,$2,'failed','AI_PASSAGE_TOO_LONG',$3,clock_timestamp(),clock_timestamp(),1,'original-run',null,'{}')`,
    [job, source, randomUUID()]);
  await db.query("insert into writing_context_advisory_control values(true,false,'shadow')");
  await db.query("insert into writing_context_shadow_policy values(true,$1,'ADULT_RELEASE','REAL_LEARNER',$2,'ADULT_WRITING_V1')",
    [approval, randomUUID()]);
  await db.query(`insert into writing_context_provider_approvals values
    ($1,'production','REAL_LEARNER','gpt-6-luna','/v1/responses',
     'c38bce41e1d31c829d0c96be92b142bb28d6999ce4c2f6b8f159c066a89b175d',
     'f3af484fcf56f622fba6e7175a0799e309eafa04c7eef11adaec46a89f325217',
     clock_timestamp(),clock_timestamp()+interval '2 days')`, [approval]);
  await db.query(`insert into writing_context_learner_authorisations values
    ($1,$2,$3,'ADULT_WRITING_V1','ADULT_SUBMISSION',$3,clock_timestamp()+interval '2 days')`,
    [authorisation, child, owner]);
  const sourceHash = (await db.query(`select encode(extensions.digest(
    convert_to(envelope::text,'UTF8'),'sha256'),'hex') hash
    from writing_source_snapshots where id=$1`, [source])).rows[0].hash;
  await db.query(`insert into course_context_replay_grants
    (id,snapshot_id,source_hash,approved_by,evidence_ref,expires_at)
    values('d2f1eb3a-24f7-4e85-bb3b-32fcc5b3cddd',$1,$2,$3,
      'owner/2026-10-08/reactivate-current-course-review',clock_timestamp()-interval '1 day')`,
    [source, sourceHash, owner]);
  assert.equal((await db.query('select course_context_replay_authorised($1) authorised', [source])).rows[0].authorised, false);
  const args = [sourceHash, owner, 'owner/2026-10-22/15-window-replay',
    new Date(Date.now() + 86400_000).toISOString()];
  const replay = () => db.query('select replay_named_15_window_course_scan($1,$2,$3,$4) job_id', args);
  const denied = async (label, setup) => {
    await db.query('savepoint replay_guard');
    await setup();
    await assert.rejects(replay(), /named_15_window_replay_ineligible/, label);
    await db.query('rollback to savepoint replay_guard');
  };
  await db.query('begin');
  stage = 'guards';
  await denied('source hash', async () => { args[0] = '0'.repeat(64); });
  args[0] = sourceHash;
  await denied('missing historical grant', () => db.query('delete from course_context_replay_grants where snapshot_id=$1', [source]));
  await denied('prior dispatch', () => db.query('insert into writing_context_shadow_dispatches values($1)', [job]));
  await denied('prior attempt', () => db.query('insert into writing_context_ai_attempts values($1)', [source]));
  await denied('prior finding', () => db.query('insert into writing_context_passage_findings values($1)', [source]));
  await denied('review closed', () => db.query("update task_submissions set parent_review_status='complete' where id=$1", [submission]));
  await denied('superseded submission', () => db.query("insert into task_submissions values($1,$2,$3,$4,'pending',clock_timestamp()+interval '1 second')",
    [randomUUID(), task, child, owner]));
  await denied('approval mismatch', () => db.query("update writing_context_provider_approvals set config_fingerprint='old' where id=$1", [approval]));
  await denied('learner authorisation expired', () => db.query("update writing_context_learner_authorisations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [authorisation]));
  await denied('wrong error', () => db.query("update writing_context_shadow_jobs set error_code='AI_PROVIDER_UNAVAILABLE' where id=$1", [job]));
  await denied('inactive policy', () => db.query("update writing_context_advisory_control set ai_mode='disabled'"));
  const success = await replay();
  assert.equal(success.rows[0].job_id, job);
  const state = (await db.query('select status,error_code,claim_count,claim_token,claimed_at,completed_at,run_key from writing_context_shadow_jobs where id=$1', [job])).rows[0];
  assert.equal(state.status, 'pending'); assert.equal(state.error_code, null);
  assert.equal(state.claim_count, 0); assert.equal(state.claim_token, null);
  assert.equal(state.claimed_at, null); assert.equal(state.completed_at, null);
  assert.match(state.run_key, /^capacity-replay:/);
  assert.equal((await db.query('select count(*)::int n from course_context_replay_grants where snapshot_id=$1', [source])).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int n from course_context_capacity_replay_grants where snapshot_id=$1', [source])).rows[0].n, 1);
  assert.equal((await db.query('select course_context_replay_authorised($1) authorised', [source])).rows[0].authorised, true);
  await db.query('savepoint replay_twice');
  await assert.rejects(replay(), /named_15_window_replay_ineligible/, 'second replay denied');
  await db.query('rollback to savepoint replay_twice');
  await db.query('rollback');
  console.log('PASS: exact replay, unique job reset, service-role boundary and guarded denials');
} catch (error) {
  console.error(`Replay regression failed at ${stage}: ${error instanceof Error ? error.message : String(error)}`);
  if (started) console.error(run(['logs', '--tail', '20', container]));
  process.exitCode = 1;
} finally {
  if (db) await db.end().catch(() => {});
  if (started) run(['stop', container]);
}
