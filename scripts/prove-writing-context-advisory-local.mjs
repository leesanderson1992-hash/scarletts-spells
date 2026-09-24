/** Disposable PostgreSQL proof. No staging or Production connection. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const container = `writing-context-advisory-proof-${randomUUID().slice(0, 8)}`;
const options = { encoding: "utf8", timeout: 60_000, stdio: "pipe" };
let db;
let started = false;
try {
  execFileSync("docker", ["run", "--rm", "-d", "--name", container,
    "-e", "POSTGRES_PASSWORD=disposable-proof-only", "-p", "127.0.0.1::5432",
    "postgres:16-alpine"], options);
  started = true;
  const portOutput = execFileSync("docker", ["port", container, "5432/tcp"], options).trim();
  const port = Number(portOutput.split(":").at(-1));
  assert(Number.isInteger(port) && port > 0, "isolated PostgreSQL port unavailable");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      execFileSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
        { ...options, timeout: 2_000 });
      break;
    } catch {
      if (attempt === 59) throw new Error("isolated PostgreSQL did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  db = new Client({ host: "127.0.0.1", port, user: "postgres", password: "disposable-proof-only", database: "postgres" });
  db.on("error", (error) => { process.stderr.write(`disposable PostgreSQL client error: ${error.message}\n`); });
  await db.connect();
  await db.query(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create extension pgcrypto;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.children(id uuid primary key,parent_user_id uuid not null);
    create table public.course_tasks(id uuid primary key,parent_user_id uuid not null,task_type text,title text,instructions text,lesson_schema jsonb);
    create table public.task_submissions(id uuid primary key,parent_user_id uuid not null,child_id uuid not null,
      task_id uuid not null,submitted_at timestamptz not null,submission_text text);
    create table public.task_submission_payloads(id uuid primary key,submission_id uuid,payload_type text,payload_version text,payload_json jsonb);
    create table public.task_submission_processing_jobs(id uuid primary key,submission_id uuid,parent_user_id uuid,child_id uuid,task_id uuid,payload jsonb);
    create table public.writing_shadow_controls(child_id uuid primary key,parent_user_id uuid,capture_enabled boolean not null default false);
    create table public.writing_source_snapshots(id uuid primary key default gen_random_uuid(),submission_id uuid not null unique,
      parent_user_id uuid not null,child_id uuid not null,task_id uuid not null,occurred_at timestamptz not null,
      envelope jsonb not null,source_revision text not null default '1');
    create table public.writing_shadow_runs(id uuid primary key default gen_random_uuid(),snapshot_id uuid not null unique);
    create table public.writing_occurrences(id text primary key,snapshot_id uuid not null,field_path text not null,
      field_hash text not null,start_utf16 integer not null,end_utf16 integer not null,observed_text text not null);
    create table public.writing_issues(id uuid primary key default gen_random_uuid(),child_id uuid,parent_user_id uuid,
      task_submission_id uuid,issue_status text,final_classification text,observed_text text,suggested_replacement text,
      approved_replacement text,context_text text,source_field_key text,micro_skill_key text,parent_marked_at timestamptz,
      metadata jsonb not null default '{}',source_writing_occurrence_id text,created_at timestamptz not null default now(),
      updated_at timestamptz,final_classified_at timestamptz);
    create function public.reject_writing_fact_update() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
    create function public.finalise_writing_issue_classification_and_learning_item(uuid,uuid,uuid,text)
      returns jsonb language sql as $$ select jsonb_build_object('normal_delegate',true) $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
  `);
  const migration = readFileSync(new URL("../supabase/migrations/20260924120000_add_global_contextual_advisory_review.sql", import.meta.url), "utf8");
  await db.query(migration);
  await db.query("create trigger capture_writing_source_from_submission_job after insert on task_submission_processing_jobs for each row execute function capture_writing_source_from_submission_job()");
  const parent = randomUUID();
  const child = randomUUID();
  const task = randomUUID();
  const submission = randomUUID();
  const occurrence = "context-advisory:occurrence-1";
  await db.query("insert into auth.users values($1)", [parent]);
  await db.query("insert into children values($1,$2)", [child, parent]);
  await db.query("insert into course_tasks values($1,$2,'lesson','Test','Write',null)", [task, parent]);
  await db.query("insert into task_submissions values($1,$2,$3,$4,now(),'their should be their')", [submission, parent, child, task]);
  await db.query("update writing_context_advisory_control set enabled=true where singleton=true");
  const capture = await db.query("insert into task_submission_processing_jobs values($1,$2,$3,$4,$5,$6) returning id", [
    randomUUID(), submission, parent, child, task, { writingSourceCapture: { rawSubmissionText: "their should be their" } },
  ]);
  assert.equal(capture.rowCount, 1);
  const captured = await db.query("select * from writing_source_snapshots where submission_id=$1", [submission]);
  assert.equal(captured.rowCount, 1);
  assert.equal(captured.rows[0].envelope.contextAdvisoryCapture, true);
  assert.equal(captured.rows[0].envelope.rawSubmissionText.slice(16, 21), "their");
  await db.query("insert into writing_occurrences values($1,$2,'/envelope','hash',0,5,'their')", [occurrence, captured.rows[0].id]);
  const recorded = await db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there',null,'their should be') as id", [occurrence, parent]);
  assert(recorded.rows[0].id);
  const issue = await db.query("select * from writing_issues where source_writing_occurrence_id=$1", [occurrence]);
  assert.equal(issue.rowCount, 1);
  assert.equal(issue.rows[0].metadata.evidence_kind, "REPAIR_ONLY");
  await db.query("update writing_issues set issue_status='child_responded' where id=$1", [issue.rows[0].id]);
  const repaired = await db.query("select finalise_writing_issue_classification_and_learning_item($1,$2,$3,'transfer_failure') as result", [issue.rows[0].id, parent, child]);
  assert.equal(repaired.rows[0].result.evidence_kind, "REPAIR_ONLY");
  assert.equal(repaired.rows[0].result.learning_item_id, null);
  await assert.rejects(db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','too')", [occurrence, parent]));
  const metrics = await db.query("select count(*)::int as n from writing_context_advisory_review_metrics");
  assert.equal(metrics.rows[0].n, 1);
  const another = "context-advisory:occurrence-2";
  await db.query("insert into writing_occurrences values($1,$2,'/envelope','hash',16,21,'their')", [another, captured.rows[0].id]);
  await db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there',null,'their should be')", [another, parent]);
  await db.query("select record_writing_context_parent_decision($1,null,$2,'VALID',null,null,'their should be')", [another, parent]);
  const superseded = await db.query("select classification from writing_context_current_parent_decisions where occurrence_id=$1", [another]);
  assert.deepEqual(superseded.rows.map((row) => row.classification), ["VALID"]);
  const cancelled = await db.query("select issue_status,final_classification from writing_issues where source_writing_occurrence_id=$1", [another]);
  assert.equal(cancelled.rows[0].issue_status, "finalised");
  assert.equal(cancelled.rows[0].final_classification, "not_an_issue");
  console.log("context advisory disposable database proof passed");
} catch (error) {
  if (started) {
    try { process.stderr.write(execFileSync("docker", ["logs", "--tail", "40", container], options)); }
    catch { /* The container may already have exited. */ }
  }
  throw error;
} finally {
  if (db) await db.end().catch(() => {});
  if (started) execFileSync("docker", ["stop", container], options);
}
