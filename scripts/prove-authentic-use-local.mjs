import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { startTmpfsContextPostgres } from "./context-local-postgres.mjs";

// A separate disposable cluster: never connect to the host container's database.
const tmpfs = await startTmpfsContextPostgres(process.argv.find(a => a.startsWith("--container="))?.split("=")[1] ?? "atria-pm-postgres");
let db = new pg.Client({ host: "127.0.0.1", port: tmpfs.port, user: "postgres", database: "postgres" });
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
try {
  await db.connect();
  await db.query("create database authentic_use_proof encoding 'UTF8' template template0");
  await db.end();
  db = new pg.Client({ host: "127.0.0.1", port: tmpfs.port, user: "postgres", database: "authentic_use_proof" });
  await db.connect();
  await db.query(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table children(id uuid primary key,parent_user_id uuid);
    create table courses(id uuid primary key,is_archived boolean default false);
    create table course_tasks(id uuid primary key,parent_user_id uuid,course_id uuid,task_type text default 'lesson',title text,instructions text,lesson_schema jsonb,
      is_active boolean default true,updated_at timestamptz default now());
    create table task_submissions(id uuid primary key,parent_user_id uuid,child_id uuid,task_id uuid,submitted_at timestamptz default now(),created_at timestamptz default now(),submission_text text,parent_review_status text default 'pending',parent_review_note text,parent_reviewed_at timestamptz);
    create table canonical_teaching_dictionary_words(id uuid primary key,display_word text,normalised_word text,row_status text default 'active',dialect_code text default 'en-GB');
    create table task_submission_payloads(id uuid primary key,submission_id uuid,parent_user_id uuid,child_id uuid,task_id uuid,course_id uuid,
      payload_type text,payload_version integer,payload_json jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
    create table task_submission_processing_jobs(id uuid primary key,submission_id uuid,parent_user_id uuid,status text default 'completed',payload jsonb,
      created_at timestamptz default now());
    create table writing_source_snapshots(id uuid primary key default gen_random_uuid(),submission_id uuid unique,parent_user_id uuid,child_id uuid,task_id uuid,occurred_at timestamptz,source_purpose text,source_revision text default '1',envelope jsonb);
    create table writing_samples(id uuid primary key,task_submission_id uuid);
    create table misspelling_instances(id uuid primary key,writing_sample_id uuid,parent_user_id uuid);
    create table writing_issues(id uuid primary key,task_submission_id uuid,parent_user_id uuid);
    create table writing_issue_suggestions(id uuid primary key,task_submission_id uuid,parent_user_id uuid);
    create table parent_verifications(id uuid primary key,task_submission_id uuid,parent_user_id uuid,verified_at timestamptz);
    create table writing_occurrences(id text primary key,snapshot_id uuid,provenance text);
    create table writing_context_passage_findings(id uuid primary key,snapshot_id uuid,parent_user_id uuid);
    create table writing_context_passage_review_events(id uuid primary key,finding_id uuid,parent_user_id uuid,created_at timestamptz);
    create table writing_context_parent_decisions(id uuid primary key,occurrence_id text,parent_user_id uuid);
    create view writing_context_current_parent_decisions as select * from writing_context_parent_decisions;
    create table writing_context_advisory_observations(id uuid primary key,snapshot_id uuid,parent_user_id uuid,created_at timestamptz);
    create table writing_context_ai_attempts(id uuid primary key,snapshot_id uuid,parent_user_id uuid,family_key text,window_fingerprint text,result_status text);
    create table adle_authentic_use_events(id uuid primary key default gen_random_uuid(),child_id uuid,canonical_word_id uuid,occurred_on date,verified_at timestamptz,use_kind text,parent_verified boolean,piece_ref text,source_ref text,row_status text,provenance_kind text,writing_submitted_at timestamptz,provenance jsonb,
      constraint adle_authentic_use_events_provenance_kind_check check(provenance_kind in ('independent_or_parent_verified_application','prompted_review_writing_application')),
      constraint prompted_shape check(provenance_kind <> 'prompted_review_writing_application' or parent_verified=false),
      unique(child_id,canonical_word_id,piece_ref,use_kind));
    create function approve_task_submission_with_reason_drafts(p_submission_id uuid,p_parent_user_id uuid,p_child_id uuid) returns jsonb language plpgsql as $$ begin
      if current_setting('proof.approval_fault',true)='true' then raise exception 'APPROVAL_FAULT'; end if;
      update task_submissions set parent_review_status='approved',parent_reviewed_at=now() where id=p_submission_id;
      return jsonb_build_object('issue_results','[]'::jsonb); end $$;
    create table spelling_canonical_mappings(id uuid primary key); create table learning_items(id uuid primary key);
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  // Reuse actual reward table constraints, rather than permissive reward stubs.
  const treasureSql = readFileSync(new URL("../supabase/migrations/20260627120000_add_word_treasure_storage.sql", import.meta.url), "utf8");
  const treasureStatements = treasureSql.match(/create table if not exists public\.child_word_(?:treasures|treasure_events) \([\s\S]*?\n\);/g);
  for (const statement of treasureStatements) await db.query(statement);
  await db.query("alter table child_word_treasure_events alter column source_entity_id type text using source_entity_id::text");
  const baseline = readFileSync(new URL("../supabase/migrations/20260525123937_baseline_current_production_schema.sql", import.meta.url), "utf8");
  await db.query(baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."child_gold_bar_ledger_events" \([\s\S]*?\n\);/)[0]);
  await db.query(readFileSync(new URL("../supabase/migrations/20261005120000_add_first_submission_authentic_use.sql", import.meta.url), "utf8"));
  await db.query(`
    create schema extensions; create extension pgcrypto with schema extensions;
    create table adle_review_sessions(id uuid primary key,child_id uuid,parent_user_id uuid,
      submitted_writing_text text,completed_at timestamptz);
    create table adle_review_parent_reviews(review_session_id uuid primary key,parent_user_id uuid,
      child_id uuid,reviewed_by_user_id uuid);
    create table adle_review_context_sources(id uuid primary key,review_session_id uuid,child_id uuid,
      parent_user_id uuid,submitted_text text,source_hash text,submitted_at timestamptz);
    create table adle_review_context_jobs(id uuid primary key,source_id uuid,status text);
    create table adle_review_context_findings(id uuid primary key,source_id uuid,source_hash text,
      start_utf16 int,end_utf16 int,observed_text text);
    create table adle_review_context_decisions(id uuid primary key,source_id uuid,finding_id uuid,
      action text,intended_word text);
    create table adle_review_context_attempts(id uuid primary key,source_id uuid,window_fingerprint text,
      result_status text);
    create table adle_review_parent_issue_links(id uuid primary key,review_session_id uuid,
      position_start int,position_end int,observed_spelling_normalized text,
      correct_spelling_normalized text,resolution_status text);
    create function reject_writing_fact_update() returns trigger language plpgsql as $$
      begin raise exception 'IMMUTABLE'; end $$;
    create function context_utf16_length(p_text text) returns integer language sql immutable as $$
      select char_length(p_text) $$;
  `);
  await db.query(readFileSync(new URL("../supabase/migrations/20261007081500_adle_authentic_use_parent_review.sql", import.meta.url), "utf8"));
  const parent = randomUUID(), child = randomUUID();
  await db.query("insert into auth.users values($1);", [parent]);
  await db.query("insert into children values($1,$2)", [child,parent]);
  const historicalTask = randomUUID(), historicalSubmission = randomUUID();
  await db.query("insert into course_tasks(id,parent_user_id) values($1,$2)", [historicalTask,parent]);
  await db.query("insert into task_submissions(id,parent_user_id,child_id,task_id,submission_text) values($1,$2,$3,$4,'historical')", [historicalSubmission,parent,child,historicalTask]);
  check((await db.query("select authentic_use_chain_id from task_submissions where id=$1", [historicalSubmission])).rows[0].authentic_use_chain_id,null);
  check((await db.query("select count(*)::int n from authentic_use_submission_chains")).rows[0].n,0);
  await db.query("insert into authentic_use_controls(child_id,parent_user_id,mode,gold_enabled,proficiency_enabled,activation_cutoff) values($1,$2,'shadow',false,false,now())", [child,parent]);
  check((await db.query("select backfill_authentic_use_chains_for_child($1) n", [child])).rows[0].n,1);
  check(Boolean((await db.query("select authentic_use_chain_id from task_submissions where id=$1", [historicalSubmission])).rows[0].authentic_use_chain_id),true);
  await db.query("update authentic_use_controls set mode='enabled',gold_enabled=true,proficiency_enabled=true,activation_cutoff='2026-01-01' where child_id=$1", [child]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [parent]);
  const makeSubmission = async (word = "because", occurred = "2026-10-05T10:00:00Z", existingTask = null, supplied = false) => {
    const task = existingTask ?? randomUUID(), submission = randomUUID();
    if (!existingTask) await db.query("insert into course_tasks(id,parent_user_id) values($1,$2)", [task,parent]);
    await db.query("insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,$5,$6)", [submission,parent,child,task,occurred,word]);
    await db.query("insert into task_submission_processing_jobs(id,submission_id,parent_user_id,payload) values($1,$2,$3,$4)", [randomUUID(),submission,parent,{ writingSourceCapture: { rawSubmissionText: word, rawLessonReviewSummary: "summary" } }]);
    const snapshot = (await db.query("select * from writing_source_snapshots where submission_id=$1", [submission])).rows[0];
    check(snapshot.envelope.captureMetadata.rawLessonReviewSummary, "summary");
    await db.query("insert into writing_occurrences values($1,$2,'learner_response')",[`occurrence:${submission}`,snapshot.id]);
    const loaded = (await db.query("select load_authentic_use_review($1) data", [submission])).rows[0].data;
    const preview = { policyVersion: "FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05", snapshotId: snapshot.id,
      candidates: [{ wordKey: word, observedWord: word, occurrenceIds: [`occurrence:${submission}`], suppliedSpelling: supplied }], blocked: [], excludedFields: [], requiresManualReview: false };
    const preparation = (await db.query("select prepare_authentic_use_review($1,$2,$3,false) id", [submission,loaded.fingerprint,preview])).rows[0].id;
    return { submission, task, snapshot, preparation };
  };
  const finalise = async (s, action = "approved") => db.query("select finalise_authentic_use_parent_action($1,$2,$3,null)", [s.submission,s.preparation,action]);
  const first = await makeSubmission();
  await finalise(first,"returned");
  await finalise(first,"returned");
  check((await db.query("select count(*)::int n from authentic_use_credits")).rows[0].n,1);
  const retry = await makeSubmission("newword", undefined, first.task);
  await finalise(retry);
  check((await db.query("select count(*)::int n from authentic_use_credits")).rows[0].n,1);
  const stale = await makeSubmission("stale");
  await db.query("insert into writing_issues values($1,$2,$3)",[randomUUID(),stale.submission,parent]);
  await assert.rejects(finalise(stale),/AUTHENTIC_USE_STALE_REVIEW/); checks++;
  const rollback = await makeSubmission("rollback");
  await db.query("select set_config('proof.approval_fault','true',false)");
  await assert.rejects(finalise(rollback),/APPROVAL_FAULT/); checks++;
  check((await db.query("select count(*)::int n from authentic_use_reviews r join task_submissions s on s.authentic_use_chain_id=r.chain_id where s.id=$1",[rollback.submission])).rows[0].n,0);
  await db.query("select set_config('proof.approval_fault','false',false)");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
  await assert.rejects(finalise(rollback),/AUTHENTIC_USE_PARENT_OWNERSHIP/); checks++;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]);
  const treasure = randomUUID();
  await db.query("insert into child_word_treasures(id,child_id,parent_user_id,corrected_word,corrected_word_normalized,status,entered_forge_at) values($1,$2,$3,'because','because','in_forge','2026-10-01')",[treasure,child,parent]);
  for (let i=0;i<4;i++) await finalise(await makeSubmission());
  // Verification after Forge must not retroactively count earlier writing.
  await finalise(await makeSubmission("because","2026-09-30T10:00:00Z"));
  const supplied = await makeSubmission("novel",undefined,null,true); await finalise(supplied);
  const claim = async () => (await db.query("select * from claim_authentic_use_deliveries(100)")).rows;
  const jobs = await claim();
  const failedProf = jobs.find(j => j.consumer === "proficiency");
  await db.query("select fail_authentic_use_delivery($1,$2,$3)",[failedProf.credit_id,failedProf.consumer,failedProf.claim_token]);
  const pool = new pg.Pool({ host: "127.0.0.1", port: tmpfs.port, user: "postgres", database: "authentic_use_proof", max: 3 });
  try {
    await Promise.all(jobs.filter(j=>j.consumer==="gold").map(job=>pool.query("select deliver_authentic_use_gold($1,$2)",[job.credit_id,job.claim_token])));
  } finally { await pool.end(); }
  const goldJob = jobs.find(j=>j.consumer==="gold");
  await assert.rejects(db.query("select deliver_authentic_use_gold($1,$2)",[goldJob.credit_id,goldJob.claim_token]),/AUTHENTIC_USE_DELIVERY_LEASE/); checks++;
  check((await db.query("select count(*)::int n from authentic_use_review_action_events where outcome='DUPLICATE_SUPPRESSED'")).rows[0].n,1);
  check((await db.query("select count(*)::int n from authentic_use_review_action_events where outcome='RETRY_NO_CREDIT'")).rows[0].n,1);
  check((await db.query("select authentic_correct_uses_after_forge,status from child_word_treasures where id=$1",[treasure])).rows[0],{authentic_correct_uses_after_forge:5,status:"golden_bar"});
  check((await db.query("select count(*)::int n from child_gold_bar_ledger_events")).rows[0].n,1);
  check((await db.query("select count(*)::int n from child_word_treasure_events where event_type='golden_bar_awarded'")).rows[0].n,1);
  check((await db.query("select reason from authentic_use_deliveries d join authentic_use_credits c on c.id=d.credit_id where consumer='gold' and c.occurred_at<'2026-10-01'")).rows[0].reason,"WRITTEN_BEFORE_FORGE");
  await assert.rejects(db.query("insert into child_word_treasure_events(treasure_id,child_id,parent_user_id,event_type,source_type) values($1,$2,$3,'authentic_correct_use_recorded','legacy')",[treasure,child,parent]),/AUTHENTIC_USE_LEGACY_PATH_DISABLED/); checks++;
  // Unmapped evidence is retained, then independently delivered after identity publication.
  for (const job of jobs.filter(j=>j.consumer==="proficiency" && j!==failedProf)) await db.query("select stage_authentic_use_proficiency($1,$2)",[job.credit_id,job.claim_token]);
  const canonical = randomUUID(), novel = randomUUID();
  await db.query("insert into canonical_teaching_dictionary_words(id,display_word,normalised_word) values($1,'because','because'),($2,'novel','novel')",[canonical,novel]);
  await db.query("select reconcile_authentic_use_word_identities()");
  await db.query("update authentic_use_deliveries set next_retry_at=now() where status='failed'");
  const recovered = await claim();
  check(recovered.every(j=>j.consumer==='proficiency'),true);
  const calculations = [{ microSkillKey: "skill-a", sourceCreditIds: [failedProf.credit_id], fingerprint: "v1", policyVersion: "released-v1", priorReport: null, report: { progress:0.4, highestSecureLevel:null } },
    { microSkillKey: "skill-b", sourceCreditIds: [failedProf.credit_id], fingerprint: "v1b", policyVersion: "released-v1", priorReport: null, report: { progress:0.4, highestSecureLevel:null } }];
  for (const job of recovered) {
    const staged = (await db.query("select stage_authentic_use_proficiency($1,$2) result",[job.credit_id,job.claim_token])).rows[0].result;
    if (staged.status==='staged') await db.query("select complete_authentic_use_proficiency($1,$2,$3)",[job.credit_id,job.claim_token,JSON.stringify(calculations)]);
  }
  check((await db.query("select count(*)::int n from authentic_use_proficiency_calculations")).rows[0].n,2);
  check((await db.query("select provenance_kind,parent_verified from adle_authentic_use_events where canonical_word_id=$1",[novel])).rows[0],{ provenance_kind:"parent_verified_supplied_spelling_application",parent_verified:true });
  await db.query("select refresh_authentic_use_proficiency($1,$2,$3)",[child,parent,JSON.stringify([{...calculations[0],microSkillKey:"future-skill",fingerprint:"future"}])]);
  check((await db.query("select count(*)::int n from authentic_use_proficiency_calculations")).rows[0].n,3);
  check((await db.query("select count(*)::int n from child_gold_bar_ledger_events")).rows[0].n,1);
  // A historical award cannot be paid again even if the treasure re-enters Forge.
  await db.query("update child_word_treasures set status='in_forge',authentic_correct_uses_after_forge=4 where id=$1",[treasure]);
  await finalise(await makeSubmission());
  const reforgedJobs = await claim();
  for (const job of reforgedJobs.filter(j=>j.consumer==='gold')) await db.query("select deliver_authentic_use_gold($1,$2)",[job.credit_id,job.claim_token]);
  check((await db.query("select count(*)::int n from child_gold_bar_ledger_events")).rows[0].n,1);
  check((await db.query("select count(*)::int n from child_word_treasure_events where event_type='golden_bar_awarded'")).rows[0].n,1);
  await assert.rejects(db.query("update authentic_use_credits set word_key='changed'"),/AUTHENTIC_USE_FACT_IMMUTABLE/); checks++;
  const otherParent = randomUUID(), otherChild = randomUUID();
  await db.query("insert into auth.users values($1)",[otherParent]);
  await db.query("insert into children values($1,$2)",[otherChild,otherParent]);
  await db.query("insert into authentic_use_controls(child_id,parent_user_id,mode,proficiency_enabled) values($1,$2,'enabled',true)",[otherChild,otherParent]);
  await assert.rejects(db.query("select refresh_authentic_use_proficiency($1,$2,$3)",[otherChild,otherParent,JSON.stringify(calculations)]),/AUTHENTIC_USE_EVIDENCE_OWNERSHIP/); checks++;
  await db.query("set role authenticated");
  await assert.rejects(db.query("select claim_authentic_use_deliveries(1)"),/permission denied/); checks++;
  check((await db.query("select count(*)::int n from authentic_use_credits")).rows[0].n,8);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[otherParent]);
  check((await db.query("select count(*)::int n from authentic_use_credits")).rows[0].n,0);
  check((await db.query("select count(*)::int n from authentic_use_current_proficiency")).rows[0].n,0);
  await db.query("reset role");
  await db.query("delete from auth.users where id=$1",[parent]);
  check((await db.query("select count(*)::int n from authentic_use_credits")).rows[0].n,0);
  const adleParent = randomUUID(), adleChild = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
  check((await db.query("select enabled from authentic_use_adle_runtime where singleton")).rows[0].enabled,false);
  await db.query("update authentic_use_adle_runtime set enabled=true where singleton");
  const session = "77800d2a-26df-5b63-95cc-60ec109376dd", adleSource = randomUUID();
  const adleText = "Because she wrote.", sourceHash = createHash("sha256").update(adleText).digest("hex");
  await db.query("insert into auth.users values($1)",[adleParent]);
  await db.query("insert into children values($1,$2)",[adleChild,adleParent]);
  await db.query("insert into authentic_use_controls(child_id,parent_user_id,mode,gold_enabled,proficiency_enabled,activation_cutoff) values($1,$2,'enabled',true,true,'2026-10-06')",[adleChild,adleParent]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[adleParent]);
  await db.query("insert into adle_review_sessions values($1,$2,$3,$4,'2026-10-01')",[session,adleChild,adleParent,adleText]);
  await db.query("insert into adle_review_context_sources values($1,$2,$3,$4,$5,$6,'2026-10-01')",[adleSource,session,adleChild,adleParent,adleText,sourceHash]);
  await db.query("insert into adle_review_context_jobs values($1,$2,'complete')",[randomUUID(),adleSource]);
  await assert.rejects(db.query("insert into adle_review_parent_reviews values($1,$2,$3,$2)",[session,adleParent,adleChild]),/ADLE_AUTHENTIC_USE_ATOMIC_INSPECTION_REQUIRED/); checks++;
  await assert.rejects(db.query("insert into authentic_use_historical_grants(source_type,source_id,source_hash,parent_user_id,child_id,evidence_ref) values('adle_review',$1,$2,$3,$4,'proof')",[adleSource,"0".repeat(64),adleParent,adleChild]),/AUTHENTIC_USE_HISTORICAL_SOURCE_INELIGIBLE/); checks++;
  await db.query("insert into authentic_use_historical_grants(source_type,source_id,source_hash,parent_user_id,child_id,evidence_ref) values('adle_review',$1,$2,$3,$4,'proof')",[adleSource,sourceHash,adleParent,adleChild]);
  const adleFacts = async () => (await db.query("select load_adle_authentic_use_review($1) data",[session])).rows[0].data;
  const adlePreview = { policyVersion:"FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05",snapshotId:adleSource,
    candidates:[{wordKey:"because",observedWord:"Because",occurrenceIds:["occurrence"],suppliedSpelling:false}],
    blocked:[],excludedFields:[],requiresManualReview:false };
  const adleOccurrences = [{id:"occurrence",startUtf16:0,endUtf16:7,observed:"Because"}];
  const prepareAdle = async fingerprint => (await db.query("select prepare_adle_authentic_use_review($1,$2,$3,$4,$5,$6,false) id",[session,adleParent,adleChild,fingerprint,JSON.stringify(adlePreview),JSON.stringify(adleOccurrences)])).rows[0].id;
  let preparation = await prepareAdle((await adleFacts()).fingerprint);
  await db.query("insert into adle_review_parent_issue_links values($1,$2,0,7,'because','because','not_a_learning_issue')",[randomUUID(),session]);
  await assert.rejects(db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4)",[session,adleParent,adleChild,preparation]),/ADLE_AUTHENTIC_USE_STALE_REVIEW/); checks++;
  preparation = await prepareAdle((await adleFacts()).fingerprint);
  await assert.rejects(db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4)",[session,randomUUID(),adleChild,preparation]),/ADLE_AUTHENTIC_USE_PARENT_OWNERSHIP/); checks++;
  check((await db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4) result",[session,adleParent,adleChild,preparation])).rows[0].result.credits,1);
  check((await db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4) result",[session,adleParent,adleChild,preparation])).rows[0].result.status,"duplicate");
  check((await db.query("select count(*)::int n from authentic_use_credits where adle_source_id=$1",[adleSource])).rows[0].n,1);
  check((await db.query("select count(*)::int n from authentic_use_deliveries d join authentic_use_credits c on c.id=d.credit_id where c.adle_source_id=$1",[adleSource])).rows[0].n,2);
  const futureSession = randomUUID(), futureSource = randomUUID();
  await db.query("insert into adle_review_sessions values($1,$2,$3,$4,'2026-10-07')",[futureSession,adleChild,adleParent,adleText]);
  await db.query("insert into adle_review_context_sources values($1,$2,$3,$4,$5,$6,'2026-10-07')",[futureSource,futureSession,adleChild,adleParent,adleText,sourceHash]);
  await db.query("insert into adle_review_context_jobs values($1,$2,'complete')",[randomUUID(),futureSource]);
  const futureFacts = (await db.query("select load_adle_authentic_use_review($1) data",[futureSession])).rows[0].data;
  const futurePreview = {...adlePreview,snapshotId:futureSource};
  const futurePreparation = (await db.query("select prepare_adle_authentic_use_review($1,$2,$3,$4,$5,$6,false) id",[futureSession,adleParent,adleChild,futureFacts.fingerprint,JSON.stringify(futurePreview),JSON.stringify(adleOccurrences)])).rows[0].id;
  check((await db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4) result",[futureSession,adleParent,adleChild,futurePreparation])).rows[0].result.credits,1);
  const adultParent = randomUUID(), adultChild = randomUUID(), adultSession = randomUUID(), adultSource = randomUUID();
  await db.query("insert into auth.users values($1)",[adultParent]);
  await db.query("insert into children values($1,$2)",[adultChild,adultParent]);
  await db.query("insert into authentic_use_controls(child_id,parent_user_id,mode,activation_cutoff) values($1,$2,'enabled','2026-10-06')",[adultChild,adultParent]);
  await db.query("insert into adle_review_sessions values($1,$2,$3,$4,'2026-10-07')",[adultSession,adultChild,adultParent,adleText]);
  await db.query("insert into adle_review_context_sources values($1,$2,$3,$4,$5,$6,'2026-10-07')",[adultSource,adultSession,adultChild,adultParent,adleText,sourceHash]);
  await db.query("insert into adle_review_context_jobs values($1,$2,'complete')",[randomUUID(),adultSource]);
  const adultFacts = (await db.query("select load_adle_authentic_use_review($1) data",[adultSession])).rows[0].data;
  const adultPreview = {...adlePreview,snapshotId:adultSource};
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  const adultPrep = (await db.query("select prepare_adle_authentic_use_review($1,$2,$3,$4,$5,$6,false) id",[adultSession,adultParent,adultChild,adultFacts.fingerprint,JSON.stringify(adultPreview),JSON.stringify(adleOccurrences)])).rows[0].id;
  check((await db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4) result",[adultSession,adultParent,adultChild,adultPrep])).rows[0].result.credits,1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[adleParent]);
  const failedSession = "040c5b18-5bbd-5b0d-abe2-ce12bd00d022", failedSource = randomUUID();
  await db.query("insert into adle_review_sessions values($1,$2,$3,$4,'2026-10-01')",[failedSession,adleChild,adleParent,adleText]);
  await db.query("insert into adle_review_context_sources values($1,$2,$3,$4,$5,$6,'2026-10-01')",[failedSource,failedSession,adleChild,adleParent,adleText,sourceHash]);
  await db.query("insert into adle_review_context_jobs values($1,$2,'failed')",[randomUUID(),failedSource]);
  await db.query("insert into authentic_use_historical_grants(source_type,source_id,source_hash,parent_user_id,child_id,evidence_ref) values('adle_review',$1,$2,$3,$4,'proof')",[failedSource,sourceHash,adleParent,adleChild]);
  const failedFacts = (await db.query("select load_adle_authentic_use_review($1) data",[failedSession])).rows[0].data;
  const failedPreview = {...adlePreview,snapshotId:failedSource,requiresManualReview:true};
  await assert.rejects(db.query("select prepare_adle_authentic_use_review($1,$2,$3,$4,$5,$6,false)",[failedSession,adleParent,adleChild,failedFacts.fingerprint,JSON.stringify(failedPreview),JSON.stringify(adleOccurrences)]),/ADLE_AUTHENTIC_USE_MANUAL_REVIEW_REQUIRED/); checks++;
  const manualPrep = (await db.query("select prepare_adle_authentic_use_review($1,$2,$3,$4,$5,$6,true) id",[failedSession,adleParent,adleChild,failedFacts.fingerprint,JSON.stringify(failedPreview),JSON.stringify(adleOccurrences)])).rows[0].id;
  check((await db.query("select finalise_adle_authentic_use_review($1,$2,$3,$4) result",[failedSession,adleParent,adleChild,manualPrep])).rows[0].result.credits,1);
  const historicalCourse = randomUUID(), backfillTask = "ad385981-6bcf-49fe-bb30-4de58a67d494";
  const historicalLesson = "01e68c85-8da9-4b11-b7a6-04378f300fa0";
  await db.query("insert into courses(id) values($1)",[historicalCourse]);
  await db.query("insert into course_tasks(id,parent_user_id,course_id,title,lesson_schema,updated_at) values($1,$2,$3,'Proof lesson',$4,'2026-09-30')",
    [backfillTask,adleParent,historicalCourse,{blocks:[{block_id:"answer",block_type:"question_textarea"}]}]);
  await db.query("insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,'2026-10-01','Because')",
    [historicalLesson,adleParent,adleChild,backfillTask]);
  await db.query("insert into task_submission_payloads(id,submission_id,parent_user_id,child_id,task_id,course_id,payload_type,payload_version,payload_json,created_at,updated_at) values($1,$2,$3,$4,$5,$6,'structured_lesson_response',1,$7,'2026-10-01','2026-10-01')",
    [randomUUID(),historicalLesson,adleParent,adleChild,backfillTask,historicalCourse,{answers:[{block_id:"answer",value:"Because"}]}]);
  const reconstructed = (await db.query("select reconstruct_named_historical_lesson_source($1) result",[historicalLesson])).rows[0].result;
  check(Boolean(reconstructed.snapshot_id && reconstructed.source_hash),true);
  await db.query("insert into authentic_use_historical_grants(source_type,source_id,source_hash,parent_user_id,child_id,evidence_ref) values('course_lesson',$1,$2,$3,$4,'proof')",
    [reconstructed.snapshot_id,reconstructed.source_hash,adleParent,adleChild]);
  await db.query("insert into writing_occurrences values($1,$2,'learner_response')",["historical-occurrence",reconstructed.snapshot_id]);
  const lessonFacts = (await db.query("select load_authentic_use_review($1) data",[historicalLesson])).rows[0].data;
  const lessonPreview = {policyVersion:"FIRST_SUBMISSION_AUTHENTIC_USE_V1_2026_10_05",snapshotId:reconstructed.snapshot_id,
    candidates:[{wordKey:"because",observedWord:"Because",occurrenceIds:["historical-occurrence"],suppliedSpelling:false}],
    blocked:[],excludedFields:[],requiresManualReview:true};
  const lessonPrep = (await db.query("select prepare_authentic_use_review($1,$2,$3,true) id",
    [historicalLesson,lessonFacts.fingerprint,JSON.stringify(lessonPreview)])).rows[0].id;
  await db.query("select finalise_authentic_use_parent_action($1,$2,'approved',null)",[historicalLesson,lessonPrep]);
  check((await db.query("select count(*)::int n from authentic_use_credits where snapshot_id=$1",[reconstructed.snapshot_id])).rows[0].n,1);
  const delayedLesson = "9d31cd23-9c45-44f0-94f6-1555601589b2", delayedTask = "31937d00-70a3-45b8-835a-4884158ec35a";
  await db.query("insert into course_tasks(id,parent_user_id,course_id,title,lesson_schema,updated_at) values($1,$2,$3,'Delayed proof',$4,'2026-05-23 19:06:00+00')",
    [delayedTask,adleParent,historicalCourse,{blocks:[{block_id:"answer",block_type:"question_text"}]}]);
  await db.query("insert into task_submissions(id,parent_user_id,child_id,task_id,submitted_at,submission_text) values($1,$2,$3,$4,'2026-05-23 19:07:00+00','Because')",
    [delayedLesson,adleParent,adleChild,delayedTask]);
  await db.query("insert into task_submission_payloads(id,submission_id,parent_user_id,child_id,task_id,course_id,payload_type,payload_version,payload_json,created_at,updated_at) values($1,$2,$3,$4,$5,$6,'structured_lesson_response',1,$7,'2026-05-25','2026-05-25')",
    [randomUUID(),delayedLesson,adleParent,adleChild,delayedTask,historicalCourse,{answers:[{block_id:"answer",value:"Because"}]}]);
  const delayed = (await db.query("select reconstruct_named_historical_lesson_source($1) result",[delayedLesson])).rows[0].result;
  check((await db.query("select envelope->>'historicalProvenance' provenance from writing_source_snapshots where id=$1",[delayed.snapshot_id])).rows[0].provenance,"single_answer_matches_original_submission_text");
  console.log(`Authentic-use isolated PostgreSQL proof passed (${checks} assertions). No existing database was modified.`);
} finally { await db.end().catch(()=>{}); await tmpfs.close(); }
