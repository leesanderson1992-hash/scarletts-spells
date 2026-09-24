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
  await db.query(`
    create table micro_skill_catalog(micro_skill_key text primary key,mastery_domain_key text,is_active boolean,is_assignable boolean);
    create table canonical_teaching_dictionary_words(id uuid primary key default gen_random_uuid(),normalised_word text,row_status text,review_status text);
    create table canonical_teaching_dictionary_word_support(canonical_word_id uuid,micro_skill_key text,row_status text,review_status text);
    create table canonical_teaching_dictionary_content_versions(micro_skill_key text,is_active boolean,version_status text,final_readiness_review_status text);
    create table adle_learning_items(id uuid primary key default gen_random_uuid(),child_id uuid,canonical_word_id uuid,
      micro_skill_key text,item_status text,source_kind text,source_ref text,source_attempt_text text,
      reteach_priority boolean,ejected_on date,intake_on date,row_status text,created_at timestamptz default now(),
      constraint adle_learning_items_source_kind_check check(source_kind in
        ('verified_misspelling','probe_miss','review_ejection','slippage_reentry','stretch_selection','transfer_confirmation')));
    create unique index on adle_learning_items(child_id,canonical_word_id,micro_skill_key) where row_status='active';
    create table learning_items(id uuid primary key default gen_random_uuid());
    create table learning_item_issue_links(learning_item_id uuid,writing_issue_id uuid,child_id uuid,parent_user_id uuid);
    create table learning_item_evidence(writing_issue_id uuid,source_context text,evidence_type text,metadata jsonb,updated_at timestamptz);
    create or replace function public.finalise_writing_issue_classification_and_learning_item_pre_context_advisory(
      p_issue uuid,p_parent uuid,p_child uuid,p_outcome text) returns jsonb language plpgsql as $$
    declare v_item uuid;
    begin
      insert into learning_items default values returning id into v_item;
      insert into learning_item_issue_links values(v_item,p_issue,p_child,p_parent);
      insert into learning_item_evidence values(p_issue,'child_correction_attempt','corrected_independently','{}',now());
      update writing_issues set issue_status='finalised',final_classification=p_outcome where id=p_issue;
      return jsonb_build_object('learning_item_id',v_item);
    end $$;
  `);
  const learningMigration = readFileSync(new URL("../supabase/migrations/20260924130000_add_parent_confirmed_contextual_learning_handoff.sql", import.meta.url), "utf8");
  await db.query(learningMigration);
  const skill = "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE";
  await db.query("insert into micro_skill_catalog values($1,'D4',true,true)", [skill]);
  const word = (await db.query("insert into canonical_teaching_dictionary_words(normalised_word,row_status,review_status) values('there','active','approved_for_first_exposure') returning id")).rows[0].id;
  await db.query("insert into canonical_teaching_dictionary_word_support values($1,$2,'active','approved_for_first_exposure')", [word, skill]);
  await db.query("insert into canonical_teaching_dictionary_content_versions values($1,true,'active','signed_off')", [skill]);
  const learningOccurrence = "context-advisory:learning-occurrence";
  await db.query("insert into writing_occurrences values($1,$2,'/envelope','hash',0,5,'their')", [learningOccurrence, captured.rows[0].id]);
  await db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there',null,'their should be')", [learningOccurrence, parent]);
  const learningIssue = (await db.query("select id from writing_issues where source_writing_occurrence_id=$1", [learningOccurrence])).rows[0].id;
  await db.query("update writing_issues set issue_status='child_responded' where id=$1", [learningIssue]);
  await assert.rejects(db.query("select finalise_contextual_repair_only($1,$2,$3,'concept_gap')", [learningIssue, parent, child]));
  await assert.rejects(db.query("select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,'concept_gap','D4_WRONG')", [learningIssue, parent, child]));
  const stillOpen = await db.query("select final_classification,micro_skill_key from writing_issues where id=$1", [learningIssue]);
  assert.equal(stillOpen.rows[0].final_classification, null);
  assert.equal(stillOpen.rows[0].micro_skill_key, "unknown");
  const finalised = await db.query("select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,'concept_gap',$4) as result", [learningIssue, parent, child, skill]);
  assert.equal(finalised.rows[0].result.handoff_state, "READY");
  assert.equal(finalised.rows[0].result.retry_evidence_kind, "REPAIR_ONLY");
  await assert.rejects(db.query("select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,'concept_gap',$4)", [learningIssue, parent, child, skill]));
  const repairEvidence = await db.query("select evidence_type,metadata from learning_item_evidence where writing_issue_id=$1", [learningIssue]);
  assert.equal(repairEvidence.rows[0].evidence_type, "corrected_after_prompt");
  assert.equal(repairEvidence.rows[0].metadata.evidence_kind, "REPAIR_ONLY");
  await db.query("update canonical_teaching_dictionary_content_versions set is_active=false where micro_skill_key=$1", [skill]);
  const pendingOccurrence = "context-advisory:pending-content-occurrence";
  await db.query("insert into writing_occurrences values($1,$2,'/envelope','hash',0,5,'their')", [pendingOccurrence, captured.rows[0].id]);
  await db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there',null,'their should be')", [pendingOccurrence, parent]);
  const pendingIssue = (await db.query("select id from writing_issues where source_writing_occurrence_id=$1", [pendingOccurrence])).rows[0].id;
  await db.query("update writing_issues set issue_status='child_responded' where id=$1", [pendingIssue]);
  const pending = await db.query("select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,'concept_gap',$4) as result", [pendingIssue, parent, child, skill]);
  assert.equal(pending.rows[0].result.handoff_state, "PENDING_TEACHING_CONTENT");
  await db.query("update canonical_teaching_dictionary_content_versions set is_active=true where micro_skill_key=$1", [skill]);
  const admitted = await db.query("select reconcile_contextual_adle_learning_need($1,$2,$3) as result", [pendingIssue, parent, child]);
  assert.equal(admitted.rows[0].result.handoff_state, "READY");
  await db.query("update adle_learning_items set item_status='resolved' where id=$1", [admitted.rows[0].result.adle_learning_item_id]);
  const resolvedOccurrence = "context-advisory:resolved-item-occurrence";
  await db.query("insert into writing_occurrences values($1,$2,'/envelope','hash',0,5,'their')", [resolvedOccurrence, captured.rows[0].id]);
  await db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there',null,'their should be')", [resolvedOccurrence, parent]);
  const resolvedIssue = (await db.query("select id from writing_issues where source_writing_occurrence_id=$1", [resolvedOccurrence])).rows[0].id;
  await db.query("update writing_issues set issue_status='child_responded' where id=$1", [resolvedIssue]);
  const needsReentry = await db.query("select finalise_parent_confirmed_contextual_learning_need($1,$2,$3,'concept_gap',$4) as result", [resolvedIssue, parent, child, skill]);
  assert.equal(needsReentry.rows[0].result.handoff_state, "PENDING_EXISTING_ITEM_REVIEW");
  assert.equal(needsReentry.rows[0].result.adle_learning_item_id, null);
  await db.query("select disable_writing_context_advisory($1)", [parent]);
  const switchState = await db.query("select enabled from writing_context_advisory_control where singleton=true");
  assert.equal(switchState.rows[0].enabled, false);
  await assert.rejects(db.query("select record_writing_context_parent_decision($1,null,$2,'INVALID','there')", [learningOccurrence, parent]));
  const durable = await db.query("select count(*)::int as n from writing_context_learning_handoffs where writing_issue_id=$1", [learningIssue]);
  assert.equal(durable.rows[0].n, 1);
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
