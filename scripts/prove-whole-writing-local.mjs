/** Disposable native PostgreSQL proof. Never connects to an application database.
 * Install @embedded-postgres/darwin-arm64 and pg outside the repo, then set
 * WRITING_PROOF_RUNTIME to that directory. See the implementation receipt.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { postgresWorkerClient } from "./fixtures/whole-writing-postgres-client.mjs";
import { proveWordSkillReview } from "./fixtures/prove-word-skill-review.mjs";

const runtime = process.env.WRITING_PROOF_RUNTIME;
assert.ok(runtime, "WRITING_PROOF_RUNTIME must name an isolated installed native PostgreSQL runtime");
const require = createRequire(join(resolve(runtime), "package.json"));
const { Client } = require("pg");
const binaries = await import(require.resolve("@embedded-postgres/darwin-arm64"));
const root = mkdtempSync(join(tmpdir(), "writing-proof-"));
const dataDir = join(root, "data");
const options = { encoding: "utf8", timeout: 30_000, stdio: "pipe" };
const connections = [];
let started = false;
async function connect() {
  const client = new Client({ host: root, port: 5432, user: "writing_proof", database: "postgres" });
  await client.connect(); connections.push(client); return client;
}
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
let proofs = 0;
function proof() { proofs++; }
try {
  execFileSync(binaries.initdb, ["-D", dataDir, "-U", "writing_proof", "-A", "trust", "--no-locale", "--encoding=UTF8"], options);
  execFileSync(binaries.pg_ctl, ["-D", dataDir, "-l", join(root, "postgres.log"), "-o", `-h '' -k ${root}`, "-w", "start"], options);
  started = true;
  const db = await connect();
  // Dependency fixture has the fields/constraints consumed by the real RPC.
  // Both submission migrations and whole-writing migrations below are unmodified.
  await db.query(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    create table children(id uuid primary key,parent_user_id uuid not null references auth.users);
    create table courses(id uuid primary key,child_id uuid not null references children,parent_user_id uuid not null references auth.users);
    create table course_tasks(id uuid primary key,course_id uuid references courses,parent_user_id uuid references auth.users,task_type text,title text,instructions text,lesson_schema jsonb);
    create table task_submissions(id uuid primary key default gen_random_uuid(),task_id uuid references course_tasks,course_id uuid references courses,child_id uuid references children,parent_user_id uuid references auth.users,submission_text text,submitted_at timestamptz,parent_review_status text,parent_review_note text,parent_reviewed_at timestamptz,created_at timestamptz default now());
    create table task_submission_payloads(id uuid primary key default gen_random_uuid(),submission_id uuid references task_submissions,parent_user_id uuid references auth.users,course_id uuid references courses,task_id uuid references course_tasks,child_id uuid references children,payload_type text,payload_version integer,payload_json jsonb);
    create table task_completions(id uuid primary key default gen_random_uuid(),task_id uuid,course_id uuid,child_id uuid,parent_user_id uuid,completion_date date,quantity_completed integer,completed_at timestamptz,updated_at timestamptz,unique(task_id,child_id,completion_date));
    create table canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,dialect_code text,row_status text);
    create table micro_skill_catalog(micro_skill_key text primary key,is_active boolean);
    create table parent_verifications(id uuid primary key,parent_user_id uuid,child_id uuid,task_submission_id uuid,source_entity_id text);
  `);
  await db.query(migration("20260717153000_add_idempotent_course_task_submission.sql"));
  await db.query(migration("20260721110000_allow_returned_task_resubmission_after_historical_pending.sql"));
  await db.query(migration("20260906100000_add_writing_shadow_capture.sql"));
  await db.query(migration("20260906110000_add_whole_writing_occurrences.sql"));
  await db.query(migration("20260906120000_add_reviewed_word_skill_publications.sql"));
  await db.query(migration("20260906130000_add_writing_shadow_health.sql"));
  await db.query(migration("20260906140000_add_word_skill_review_workflow.sql"));
  const parent = randomUUID(), otherParent = randomUUID(), child = randomUUID(), course = randomUUID(), task = randomUUID();
  await db.query("insert into auth.users values($1),($2)", [parent, otherParent]);
  await db.query("insert into children values($1,$2)", [child,parent]);
  await db.query("insert into courses values($1,$2,$3)", [course,child,parent]);
  const schema = { blocks: [{ block_id: "answer", block_type: "question_textarea" }] };
  await db.query("insert into course_tasks values($1,$2,$3,'lesson','Saved task','Original prompt',$4)", [task,course,parent,schema]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [parent]);
  const raw = "  🐕 I am I. Café.  \n";
  const capture = { writingSourceCapture: { rawSubmissionText: raw, draftPayload: { answer: raw } }, draftPayload: { answer: raw } };
  let clock = Date.parse("2026-09-06T10:00:00Z");
  async function submit(client = db, request = randomUUID(), payload = capture) {
    const result = await client.query("select submit_course_task_response_once($1,$2,$3,$4,$5,$6,$7,$8,'structured_lesson_response',$9,$10) as result", [parent,child,course,task,request,raw.trim(),new Date(clock += 1000).toISOString(),"2026-09-06",{ answers: [{ block_id:"answer", value:raw }] },payload]);
    return result.rows[0].result;
  }
  async function returned(id) { await db.query("update task_submissions set parent_review_status='returned' where id=$1", [id]); }
  const disabled = await submit();
  assert.equal((await db.query("select count(*)::int n from writing_source_snapshots")).rows[0].n, 0); proof();
  await returned(disabled.submissionId);
  await db.query("insert into writing_shadow_controls(child_id,parent_user_id,capture_enabled,processing_enabled,extraction_enabled,resolution_enabled) values($1,$2,true,true,true,true)", [child,parent]);
  await assert.rejects(db.query("update writing_shadow_controls set parent_user_id=$1 where child_id=$2",[otherParent,child]),/ownership/); proof();
  const request = randomUUID();
  const other = await connect(); await other.query("select set_config('request.jwt.claim.sub',$1,false)", [parent]);
  const [a,b] = await Promise.all([submit(db,request),submit(other,request)]);
  assert.equal(a.submissionId,b.submissionId);
  assert.deepEqual([a.outcome,b.outcome].sort(), ["created","duplicate"]);
  assert.equal((await db.query("select count(*)::int n from writing_source_snapshots")).rows[0].n,1); proof();
  const source = (await db.query("select * from writing_source_snapshots")).rows[0];
  assert.equal(source.envelope.rawSubmissionText,raw);
  assert.equal(source.envelope.draftPayload.answer,raw);
  assert.equal(source.envelope.structuredPayloads[0].value.answers[0].value,raw);
  assert.equal(source.envelope.displayedContextVerified,false); proof();
  await db.query("update course_tasks set instructions='Changed later' where id=$1", [task]);
  assert.equal((await db.query("select envelope from writing_source_snapshots")).rows[0].envelope.taskContext.instructions,"Original prompt");
  await assert.rejects(db.query("update writing_source_snapshots set envelope='{}'"), /immutable/); proof();
  await db.query("set role authenticated");
  assert.equal((await db.query("select count(*)::int n from writing_source_snapshots")).rows[0].n,1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherParent]);
  assert.equal((await db.query("select count(*)::int n from writing_source_snapshots")).rows[0].n,0);
  await assert.rejects(db.query("select * from claim_writing_shadow_runs(1)"), /permission denied/);
  await assert.rejects(db.query("update writing_shadow_controls set capture_enabled=true"), /permission denied/);
  await db.query("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]); proof();
  await returned(a.submissionId);
  const jobsBefore = (await db.query("select count(*)::int n from task_submission_processing_jobs")).rows[0].n;
  await db.query("create function force_capture_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic_capture_failure'; end $$; create trigger synthetic_failure before insert on writing_source_snapshots for each row execute function force_capture_failure()");
  await assert.rejects(submit(), /synthetic_capture_failure/);
  assert.equal((await db.query("select count(*)::int n from task_submission_processing_jobs")).rows[0].n,jobsBefore);
  assert.equal((await db.query("select count(*)::int n from task_submissions")).rows[0].n,2);
  await db.query("drop trigger synthetic_failure on writing_source_snapshots"); proof();
  const next = await submit();
  assert.notEqual(next.submissionId,a.submissionId);
  assert.equal((await db.query("select count(*)::int n from writing_source_snapshots")).rows[0].n,2); proof();
  const [claims1,claims2] = await Promise.all([db.query("select * from claim_writing_shadow_runs(1)"), other.query("select * from claim_writing_shadow_runs(1)")]);
  assert.equal(claims1.rows.length,1); assert.equal(claims2.rows.length,1);
  assert.notEqual(claims1.rows[0].id,claims2.rows[0].id); proof();
  const run = claims1.rows[0];
  const stale = randomUUID();
  assert.equal((await db.query("select persist_writing_shadow_result($1,$2,'{}') ok",[run.id,stale])).rows[0].ok,false);
  const occurrence = { id: "synthetic:stable-occurrence", fieldKey:"/draftPayload/answer", start:5,end:6,observedText:"I",textHash:"fixture-field-hash",provenance:"learner_response",interpretation:{ status:"unmapped",canonicalWordId:null,normalizedForm:"i",dialect:"en-GB" } };
  const result = { extractionVersion:"WHOLE_WRITING_EXTRACTION_V1", occurrences:[occurrence], qualification:"NOT_QUALIFIED" };
  await assert.rejects(db.query("select persist_writing_shadow_result($1,$2,$3)",[run.id,run.lease_token,{ ...result, occurrences:[occurrence,{...occurrence,id:"invalid",end:-1}] }]), /check constraint/);
  assert.equal((await db.query("select count(*)::int n from writing_occurrences")).rows[0].n,0); proof();
  assert.equal((await db.query("select persist_writing_shadow_result($1,$2,$3) ok",[run.id,run.lease_token,result])).rows[0].ok,true);
  assert.equal((await db.query("select persist_writing_shadow_result($1,$2,$3) ok",[run.id,run.lease_token,result])).rows[0].ok,false);
  await assert.rejects(db.query("update writing_shadow_runs set result='{}' where id=$1",[run.id]), /immutable/);
  await assert.rejects(db.query("update writing_occurrences set observed_text='changed'"), /immutable/); proof();
  const incorrectScope=randomUUID();
  await db.query("insert into parent_verifications values($1,$2,$3,$4,'another-occurrence')",[incorrectScope,parent,child,source.submission_id]);
  await assert.rejects(db.query("insert into writing_occurrence_assessments(interpretation_id,parent_verification_id,outcome) select id,$1,'correct' from writing_occurrence_interpretations limit 1",[incorrectScope]),/scope_invalid/); proof();
  const interrupted = claims2.rows[0];
  await db.query("update writing_shadow_runs set started_at=now()-interval '11 minutes' where id=$1",[interrupted.id]);
  const reclaimed = (await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  assert.equal(reclaimed.id,interrupted.id); assert.notEqual(reclaimed.lease_token,interrupted.lease_token);
  assert.equal((await db.query("select finish_writing_shadow_run($1,$2,'{}',null) ok",[interrupted.id,interrupted.lease_token])).rows[0].ok,false);
  await db.query("select finish_writing_shadow_run($1,$2,null,'ANALYSIS_FAILED')",[reclaimed.id,reclaimed.lease_token]);
  assert.equal((await db.query("select * from claim_writing_shadow_runs(1)")).rows.length,0); proof();
  await db.query("update writing_shadow_runs set attempt_count=8,next_retry_at=now() where id=$1",[reclaimed.id]);
  assert.equal((await db.query("select * from claim_writing_shadow_runs(1)")).rows.length,0); proof();
  await db.query("select enqueue_writing_shadow_replay($1,'release-two')",[[run.snapshot_id]]);
  assert.equal((await db.query("select enqueue_writing_shadow_replay($1,'release-two') n",[[run.snapshot_id]])).rows[0].n,0);
  const replay = (await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[replay.id,replay.lease_token,result]);
  assert.equal((await db.query("select count(*)::int n from writing_occurrences")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_interpretations")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_assessments where outcome<>'unknown'")).rows[0].n,0); proof();
  await db.query("set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherParent]);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_assessments")).rows[0].n,0);
  await db.query("reset role"); proof();
  const jobs = (await db.query("select status,attempt_count from task_submission_processing_jobs")).rows;
  assert.equal(jobs.length,3); assert.ok(jobs.every((j) => j.status==='pending' && j.attempt_count===0)); proof();
  const word = randomUUID();
  await db.query("insert into canonical_teaching_dictionary_words values($1,'i','en-GB','active')",[word]);
  await db.query("insert into micro_skill_catalog values('fixture_skill',true)");
  const manifest = { approvedPairs:[{ canonicalWordId:word,microSkillKey:"fixture_skill",relationshipRole:"demonstrates",decision:"approved",sourceReference:"synthetic-test-only",licenceReference:"original-synthetic-fixture" }] };
  async function publish(key, value) {
    return (await db.query("select publish_reviewed_word_skill_release($1,'local',$2,$3,'Explicit synthetic pair review') id",[key,value,parent])).rows[0].id;
  }
  await assert.rejects(publish("bad",{ approvedPairs:[{...manifest.approvedPairs[0],decision:"candidate"}] }),/not_approved/);
  await assert.rejects(publish("bad",{ approvedPairs:[{...manifest.approvedPairs[0],canonicalWordId:randomUUID()}] }),/identity_invalid/);
  await assert.rejects(publish("bad",{ approvedPairs:[{...manifest.approvedPairs[0],licenceReference:""}] }),/check constraint/);
  assert.equal((await db.query("select count(*)::int n from adle_reviewed_word_skill_releases")).rows[0].n,0); proof();
  const release = await publish("synthetic-release",manifest);
  assert.equal(await publish("synthetic-release",manifest),release);
  await assert.rejects(publish("synthetic-release",{ approvedPairs:[{...manifest.approvedPairs[0],relationshipRole:"contrast_only"}] }),/conflict/);
  assert.equal((await db.query("select count(*)::int n from writing_enrichment_replay_work")).rows[0].n,1);
  assert.equal((await db.query("select schedule_writing_enrichment_replays(1) n")).rows[0].n,1);
  assert.equal((await db.query("select schedule_writing_enrichment_replays(1) n")).rows[0].n,0); proof();
  const enriched = (await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[enriched.id,enriched.lease_token,{...result,occurrences:[{...occurrence,interpretation:{...occurrence.interpretation,status:"resolved",canonicalWordId:word}}]}]);
  assert.equal((await db.query("select count(*)::int n from writing_occurrences")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_interpretations where canonical_word_id=$1",[word])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_assessments where outcome<>'unknown'")).rows[0].n,0); proof();
  await assert.rejects(db.query("update adle_reviewed_word_skill_pairs set relationship_role='negative_only'"),/immutable/);
  await db.query("insert into adle_reviewed_word_skill_withdrawals(release_id,reviewed_by,reason) values($1,$2,'Synthetic withdrawal')",[release,parent]);
  assert.equal((await db.query("select count(*)::int n from adle_reviewed_word_skill_pairs")).rows[0].n,1); proof();
  await db.query("update writing_shadow_controls set processing_enabled=false");
  assert.equal((await db.query("select enqueue_writing_shadow_replay($1,'disabled') n",[[source.id]])).rows[0].n,0); proof();
  const { recoverWritingShadowRuns } = await import("../lib/writing-engine/whole-writing/worker.ts");
  await db.query("update writing_shadow_controls set processing_enabled=true");
  await db.query("select enqueue_writing_shadow_replay($1,'real-worker')",[[source.id]]);
  const summary=await recoverWritingShadowRuns(postgresWorkerClient(db));
  assert.equal(summary.completed,1); assert.equal(summary.failed,0);
  const workerResult=(await db.query("select result from writing_shadow_runs where replay_key='real-worker'")).rows[0].result;
  assert.equal(workerResult.occurrences.filter((o) => o.observedText==='I').length,2);
  assert.equal(workerResult.qualification,"NOT_QUALIFIED");
  assert.ok(workerResult.occurrences.every((o) => o.interpretation.correctness==='NOT_ASSESSED'));
  assert.equal((await recoverWritingShadowRuns(postgresWorkerClient(db))).claimed,0);
  assert.ok((await db.query("select attempt_count from task_submission_processing_jobs")).rows.every((j) => j.attempt_count===0)); proof();
  await db.query("insert into micro_skill_catalog values('second_fixture_skill',true)");
  const reviewProofs = await proveWordSkillReview({ db, connect, actor: parent, otherActor: otherParent, word });
  console.log(JSON.stringify({ status:"passed",proofs,reviewProofs,database:"disposable PostgreSQL 18", productionConnections:0, limitations:"Minimal dependency fixture; staging and full migration-chain verification remain required." }));
} finally {
  await Promise.allSettled(connections.map((client) => client.end()));
  if (started) execFileSync(binaries.pg_ctl,["-D",dataDir,"-m","immediate","-w","stop"],options);
  rmSync(root,{recursive:true,force:true});
}
