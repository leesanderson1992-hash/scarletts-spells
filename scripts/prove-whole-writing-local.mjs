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
import { proveWritingEnrichment } from "./fixtures/prove-writing-enrichment.mjs";

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
    create table canonical_teaching_dictionary_import_batches(id uuid primary key,source_folder_path text,source_folder_sha256 text,source_commit text,batch_status text);
    create table canonical_teaching_dictionary_words(id uuid primary key,normalised_word text,dialect_code text,row_status text,import_batch_id uuid references canonical_teaching_dictionary_import_batches);
    create table micro_skill_catalog(micro_skill_key text primary key,is_active boolean);
    create table parent_verifications(id uuid primary key,parent_user_id uuid,child_id uuid,task_submission_id uuid,source_entity_id text);
    create table writing_samples(id uuid primary key default gen_random_uuid(),child_id uuid,parent_user_id uuid,sample_text text,task_submission_id uuid);
    create table misspelling_instances(id uuid primary key default gen_random_uuid(),writing_sample_id uuid not null,child_id uuid not null,parent_user_id uuid not null,misspelled_word text not null,corrected_word text not null,word_family_id uuid,context_text text,position_start integer,position_end integer,notes text,error_type text,secondary_error_type text,confidence_score numeric(4,2),suggested_word text,is_parent_overridden boolean not null default false,is_false_positive boolean not null default false,created_at timestamptz default now(),updated_at timestamptz default now());
    create table writing_issue_suggestions(id uuid primary key default gen_random_uuid(),child_id uuid not null,parent_user_id uuid not null,task_submission_id uuid,writing_sample_id uuid,misspelling_instance_id uuid,source_type text default 'misspelling_instance',suggestion_status text default 'pending',observed_text text,suggested_replacement text,context_text text,source_field_key text,position_start integer,position_end integer,suggested_micro_skill_key text,metadata jsonb default '{}',created_at timestamptz default now());
    create table writing_issues(id uuid primary key default gen_random_uuid(),child_id uuid not null,parent_user_id uuid not null,task_submission_id uuid,writing_sample_id uuid,source_suggestion_id uuid,source_misspelling_instance_id uuid,issue_status text default 'pending_parent_review',final_classification text,observed_text text,suggested_replacement text,approved_replacement text,context_text text,source_field_key text,position_start integer,position_end integer,micro_skill_key text default 'unknown',metadata jsonb default '{}',created_at timestamptz default now());
    create table writing_issue_correction_attempts(id uuid primary key default gen_random_uuid(),writing_issue_id uuid not null,child_id uuid not null,parent_user_id uuid not null,task_submission_id uuid,attempted_correction text,attempt_notes text,corrected_independently boolean not null default false,reflection text not null,metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table fixture_token_safe_mappings(mapping_id uuid primary key,misspelling_normalized text,correct_spelling_normalized text,micro_skill_key text,dialect_code text,normalization_version text,authority_reference text);
    create function find_resolver_visible_token_safe_canonical_mappings(text[],text default 'en-GB',text default 'spelling_normalize_v1') returns table(mapping_id uuid,misspelling_normalized text,correct_spelling_normalized text,micro_skill_key text,dialect_code text,normalization_version text,authority_reference text) language sql stable as $$
      select m.* from fixture_token_safe_mappings m where m.misspelling_normalized=any($1) and m.dialect_code=$2 and m.normalization_version=$3
      order by m.misspelling_normalized,m.correct_spelling_normalized,m.mapping_id
    $$;
    grant all on writing_samples,misspelling_instances,writing_issue_suggestions,writing_issues,writing_issue_correction_attempts to authenticated,service_role;
  `);
  await db.query(migration("20260717153000_add_idempotent_course_task_submission.sql"));
  await db.query(migration("20260721110000_allow_returned_task_resubmission_after_historical_pending.sql"));
  await db.query(migration("20260906100000_add_writing_shadow_capture.sql"));
  await db.query(migration("20260906110000_add_whole_writing_occurrences.sql"));
  await db.query(migration("20260906120000_add_reviewed_word_skill_publications.sql"));
  await db.query(migration("20260906130000_add_writing_shadow_health.sql"));
  await db.query(migration("20260906140000_add_word_skill_review_workflow.sql"));
  await db.query(migration("20260906150000_add_whole_writing_shadow_projections.sql"));
  const writerBeforeE1 = (await db.query("select pg_get_functiondef('persist_writing_shadow_result(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
  await db.query(migration("20260906160000_add_writing_enrichment_operations.sql"));
  const writerAfterE1 = (await db.query("select pg_get_functiondef('persist_writing_shadow_result(uuid,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
  assert.equal(writerAfterE1, writerBeforeE1, "E1 must compose with the installed evidence writer"); proof();
  await db.query(migration("20260906170000_fix_writing_enrichment_published_metrics.sql"));
  await db.query(migration("20260906180000_allow_unknown_enrichment_gap_skill_keys.sql"));
  await db.query(migration("20260906190000_integrate_e1_s5_current_evidence.sql"));
  await db.query(migration("20260907100000_add_whole_writing_known_errors_and_retries.sql"));
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
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,row_status) values($1,'i','en-GB','active')",[word]);
  await db.query("insert into micro_skill_catalog values('fixture_skill',true)");
  await db.query("update writing_enrichment_controls set inventory_enabled=true,generation_enabled=true,replay_enabled=true where environment_key='local'");
  await db.query("insert into writing_enrichment_cohorts(environment_key,child_id,parent_user_id,enabled) values('local',$1,$2,true)",[child,parent]);
  const manifest = { approvedPairs:[{ canonicalWordId:word,microSkillKey:"fixture_skill",relationshipRole:"demonstrates",decision:"approved",sourceReference:"synthetic-test-only",licenceReference:"original-synthetic-fixture" }] };
  const unaffectedWord=randomUUID();
  const unaffectedOccurrence={...occurrence,id:"synthetic:unaffected-occurrence",start:7,end:9,observedText:"am",interpretation:{...occurrence.interpretation,status:"resolved",canonicalWordId:unaffectedWord,normalizedForm:"am"}};
  await db.query("insert into canonical_teaching_dictionary_words(id,normalised_word,dialect_code,row_status) values($1,'am','en-GB','active')",[unaffectedWord]);
  await db.query("insert into micro_skill_catalog values('unaffected_fixture_skill',true)");
  const relationship=(canonicalWordId,microSkillKey)=>({canonicalWordId,microSkillKey,relationshipRole:"demonstrates",positiveEvidenceEligible:true,authorityFingerprint:`fixture:${microSkillKey}`});
  function s5Result(items,key) {
    const interpreted=items.map(({base,canonicalWordId,relationships=[]})=>{
      const assessmentId=randomUUID();
      return {...base,assessmentId,interpretation:{...base.interpretation,status:canonicalWordId?"resolved":"unmapped",canonicalWordId,relationships,relationshipFingerprint:`fixture-authority:${key}`}};
    });
    return {...result,relationshipAuthorityFingerprint:`fixture-authority:${key}`,occurrences:interpreted,shadowEvidence:{events:[],projections:[],decisions:interpreted.map((item)=>({
      candidateId:`whole-writing-assessment:${item.assessmentId}`,sourceKind:"whole_writing_occurrence",sourceEntityId:item.id,
      disposition:"BLOCKED",reason:"SOURCE_CONTEXT_UNSUPPORTED",performanceLineageKey:`whole-writing:${child}:${item.id}`,eventId:null,
    })),reconciliation:{interpretationVersion:"ADLE_LEARNER_EVIDENCE_PROJECTION_V1",sourceFingerprint:`source:${key}`,eventFingerprint:"empty-events",projectionFingerprint:"empty-projections",rawCandidateSourceRowCount:interpreted.length,admittedSourceEventCount:0,excludedCount:0,blockedCount:interpreted.length,ambiguousCount:0}}};
  }
  await db.query("select enqueue_writing_shadow_replay($1,'s5-before-publication')",[[source.id]]);
  const beforePublication=(await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[beforePublication.id,beforePublication.lease_token,s5Result([
    {base:occurrence,canonicalWordId:null},{base:unaffectedOccurrence,canonicalWordId:unaffectedWord,relationships:[relationship(unaffectedWord,"unaffected_fixture_skill")]},
  ],"before-publication")]);
  assert.equal((await db.query("select count(*)::int n from writing_shadow_current_occurrence_report where child_id=$1",[child])).rows[0].n,2); proof();
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
  assert.equal((await db.query("select count(*)::int n from writing_enrichment_replay_work")).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from writing_enrichment_authority_events where event_kind='s4_publication'")).rows[0].n,1);
  assert.equal((await db.query("select schedule_writing_enrichment_replays(1) n")).rows[0].n,1);
  assert.equal((await db.query("select schedule_writing_enrichment_replays(1) n")).rows[0].n,0); proof();
  const enriched = (await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[enriched.id,enriched.lease_token,s5Result([
    {base:occurrence,canonicalWordId:word,relationships:[relationship(word,"fixture_skill")]},
  ],"publication")]);
  assert.equal((await db.query("select count(*)::int n from writing_occurrences")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_interpretations where canonical_word_id=$1",[word])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from writing_occurrence_assessments where outcome<>'unknown'")).rows[0].n,0);
  let currentEvidence=(await db.query("select occurrence_id,batch_id from writing_shadow_current_occurrence_report where child_id=$1 order by occurrence_id",[child])).rows;
  assert.deepEqual(currentEvidence.map((row)=>row.occurrence_id),[occurrence.id,unaffectedOccurrence.id].sort());
  assert.equal(new Set(currentEvidence.map((row)=>row.batch_id)).size,2); proof();
  await db.query("select enqueue_writing_shadow_replay($1,'s5-late-unscoped')",[[source.id]]);
  const lateUnscoped=(await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[lateUnscoped.id,lateUnscoped.lease_token,s5Result([
    {base:occurrence,canonicalWordId:word,relationships:[relationship(word,"fixture_skill")]},
    {base:unaffectedOccurrence,canonicalWordId:unaffectedWord,relationships:[relationship(unaffectedWord,"unaffected_fixture_skill")]},
  ],"late-unscoped")]);
  assert.equal((await db.query("select authority_event_sequence::int sequence from writing_current_occurrence_interpretations where occurrence_id=$1",[occurrence.id])).rows[0].sequence,1);
  const publicationMetricsBeforeWithdrawal=(await db.query("select identity_resolutions::int,relationship_resolutions::int from writing_enrichment_event_resolution_metrics where event_kind='s4_publication'")).rows[0];
  assert.deepEqual(publicationMetricsBeforeWithdrawal,{identity_resolutions:1,relationship_resolutions:1}); proof();
  await assert.rejects(db.query("update adle_reviewed_word_skill_pairs set relationship_role='negative_only'"),/immutable/);
  await db.query("insert into adle_reviewed_word_skill_withdrawals(release_id,reviewed_by,reason) values($1,$2,'Synthetic withdrawal')",[release,parent]);
  assert.equal((await db.query("select count(*)::int n from adle_reviewed_word_skill_pairs")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from writing_enrichment_authority_events where event_kind='s4_withdrawal'")).rows[0].n,1);
  assert.equal((await db.query("select schedule_writing_enrichment_replays(1) n")).rows[0].n,1);
  const withdrawnReplay = (await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result($1,$2,$3)",[withdrawnReplay.id,withdrawnReplay.lease_token,s5Result([
    {base:occurrence,canonicalWordId:word,relationships:[]},
  ],"withdrawal")]);
  const withdrawalSequence=(await db.query("select event_sequence::text from writing_enrichment_authority_events where event_kind='s4_withdrawal'")).rows[0].event_sequence;
  assert.equal((await db.query("select authority_event_sequence::text from writing_current_occurrence_interpretations where occurrence_id=$1",[occurrence.id])).rows[0].authority_event_sequence,withdrawalSequence);
  currentEvidence=(await db.query("select id,occurrence_id,batch_id from writing_shadow_current_occurrence_report where child_id=$1 order by occurrence_id",[child])).rows;
  assert.deepEqual(currentEvidence.map((row)=>row.occurrence_id),[occurrence.id,unaffectedOccurrence.id].sort());
  assert.equal(new Set(currentEvidence.map((row)=>row.batch_id)).size,2);
  await db.query("alter table children add column first_name text,add column last_name text; alter table micro_skill_catalog add column display_name text; update children set first_name='Fixture'; update micro_skill_catalog set display_name=micro_skill_key");
  const { loadWholeWritingLongitudinalReport } = await import("../lib/writing-engine/whole-writing/projection-repository.ts");
  const currentReport=await loadWholeWritingLongitudinalReport(postgresWorkerClient(db),child,"current");
  assert.equal(currentReport.rows.length,2);
  assert.equal(currentReport.candidateCount,2);
  assert.equal(currentReport.batchCount,2);
  assert.deepEqual(currentReport.rows.map((row)=>row.receiptId).sort(),currentEvidence.map((row)=>row.id).sort()); proof();
  const eventMetrics=(await db.query("select event_kind,identity_resolutions::int,relationship_resolutions::int,relationship_withdrawals::int from writing_enrichment_event_resolution_metrics order by event_kind")).rows;
  assert.deepEqual(eventMetrics.find((row)=>row.event_kind==='s4_publication'),{event_kind:'s4_publication',identity_resolutions:1,relationship_resolutions:1,relationship_withdrawals:0});
  assert.deepEqual(eventMetrics.find((row)=>row.event_kind==='s4_withdrawal'),{event_kind:'s4_withdrawal',identity_resolutions:0,relationship_resolutions:0,relationship_withdrawals:1}); proof();
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
  const enrichmentProofs=await proveWritingEnrichment({db,connect,actor:parent,otherActor:otherParent,child,occurrence,word});
  await db.query("insert into micro_skill_catalog values('second_fixture_skill',true)");
  const reviewProofs = await proveWordSkillReview({ db, connect, actor: parent, otherActor: otherParent, word });
  const s6Occurrence={...occurrence,id:"synthetic:s6-known-error",start:10,end:17,observedText:"becuase",interpretation:{...occurrence.interpretation,normalizedForm:"becuase"}};
  const legacyOccurrence={...occurrence,id:"synthetic:s6-legacy-known-error",start:18,end:24,observedText:"adress",interpretation:{...occurrence.interpretation,normalizedForm:"adress"}};
  const knownMappingId=randomUUID(),legacyMappingId=randomUUID();
  await db.query("insert into fixture_token_safe_mappings values($1,'becuase','because','fixture_skill','en-GB','spelling_normalize_v1','fixture:governed-token-safe')",[knownMappingId]);
  await db.query("insert into fixture_token_safe_mappings values($1,'adress','address','fixture_skill','en-GB','spelling_normalize_v1','fixture:legacy-governed-token-safe')",[legacyMappingId]);
  const knownFinding={findingKey:"fixture-known-error-key",occurrenceId:s6Occurrence.id,observedNormalized:"becuase",intendedNormalized:"because",
    mappingIds:[knownMappingId],microSkillKeys:["fixture_skill"],authorityReferences:["fixture:governed-token-safe"],dialect:"en-GB",
    normalizationVersion:"spelling_normalize_v1",category:"Pattern/rule",secondaryCategory:null,errorPattern:"transposition"};
  const legacyFinding={...knownFinding,findingKey:"fixture-legacy-known-error-key",occurrenceId:legacyOccurrence.id,observedNormalized:"adress",intendedNormalized:"address",
    mappingIds:[legacyMappingId],authorityReferences:["fixture:legacy-governed-token-safe"]};
  const known=(finding=true)=>({version:"WHOLE_WRITING_KNOWN_ERROR_V1",mappingAuthorityFingerprint:"fixture-mapping-authority",
    eligibleOccurrenceCount:1,ineligibleOccurrenceCount:0,abstainedOccurrenceCount:0,
    checks:[{occurrenceId:s6Occurrence.id,disposition:finding?"FINDING":"NO_MAPPING",findingKey:finding?knownFinding.findingKey:null}],findings:finding?[knownFinding]:[]});
  const knownWithLegacy={...known(true),eligibleOccurrenceCount:2,
    checks:[...known(true).checks,{occurrenceId:legacyOccurrence.id,disposition:"FINDING",findingKey:legacyFinding.findingKey}],
    findings:[knownFinding,legacyFinding]};
  await db.query("update writing_shadow_controls set known_error_detection_enabled=true,known_error_review_enabled=true where child_id=$1",[child]);
  const s6Sample=(await db.query("insert into writing_samples(child_id,parent_user_id,sample_text,task_submission_id) values($1,$2,'becuase adress',$3) returning id",[child,parent,source.submission_id])).rows[0];
  const legacyMisspellingId=randomUUID();
  await db.query("insert into misspelling_instances(id,writing_sample_id,child_id,parent_user_id,misspelled_word,corrected_word) values($1,$2,$3,$4,'adress','address')",[legacyMisspellingId,s6Sample.id,child,parent]);
  await db.query("select enqueue_writing_shadow_replay($1,'s6-first')",[[source.id]]);
  const s6First=(await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  const s6FirstResult={...s5Result([{base:s6Occurrence,canonicalWordId:null},{base:legacyOccurrence,canonicalWordId:null}],"s6-first"),knownSpellingErrors:knownWithLegacy};
  await db.query("delete from fixture_token_safe_mappings where mapping_id=$1",[knownMappingId]);
  await assert.rejects(db.query("select persist_writing_shadow_result_with_known_errors($1,$2,$3)",[s6First.id,s6First.lease_token,s6FirstResult]),/authority_changed/);
  assert.equal((await db.query("select status from writing_shadow_runs where id=$1",[s6First.id])).rows[0].status,"processing");
  await db.query("insert into fixture_token_safe_mappings values($1,'becuase','because','fixture_skill','en-GB','spelling_normalize_v1','fixture:governed-token-safe')",[knownMappingId]); proof();
  assert.equal((await db.query("select persist_writing_shadow_result_with_known_errors($1,$2,$3) ok",[s6First.id,s6First.lease_token,s6FirstResult])).rows[0].ok,true);
  assert.equal((await db.query("select count(*)::int n from writing_known_spelling_findings")).rows[0].n,2);
  await assert.rejects(db.query("update writing_known_spelling_findings set intended_normalized='changed'"),/immutable/); proof();
  assert.equal((await db.query("select materialize_writing_known_error_review_candidates(100)::int n")).rows[0].n,2);
  const materialized=(await db.query("select * from misspelling_instances where source_writing_occurrence_id=$1",[s6Occurrence.id])).rows[0];
  assert.equal(materialized.corrected_word,"because"); assert.equal(materialized.position_start,null); proof();
  assert.equal((await db.query("select id from misspelling_instances where source_writing_occurrence_id=$1",[legacyOccurrence.id])).rows[0].id,legacyMisspellingId); proof();
  const suggestionId=randomUUID(),issueId=randomUUID();
  await db.query("insert into writing_issue_suggestions(id,child_id,parent_user_id,task_submission_id,writing_sample_id,misspelling_instance_id) values($1,$2,$3,$4,$5,$6)",
    [suggestionId,child,parent,source.submission_id,materialized.writing_sample_id,materialized.id]);
  await db.query("insert into writing_issues(id,child_id,parent_user_id,task_submission_id,writing_sample_id,source_suggestion_id,source_misspelling_instance_id,approved_replacement) values($1,$2,$3,$4,$5,$6,$7,'because')",
    [issueId,child,parent,source.submission_id,materialized.writing_sample_id,suggestionId,materialized.id]);
  await db.query("insert into writing_issue_correction_attempts(writing_issue_id,child_id,parent_user_id,task_submission_id,attempted_correction,reflection,correction_outcome,assistance_state,answer_visibility) values($1,$2,$3,$4,'because','medium','correct','unknown','unknown')",
    [issueId,child,parent,source.submission_id]);
  const lineage=(await db.query("select s.source_writing_occurrence_id suggestion_occurrence,i.source_writing_occurrence_id issue_occurrence,a.source_writing_occurrence_id attempt_occurrence,a.correction_outcome,a.corrected_independently,a.assistance_state from writing_issue_suggestions s join writing_issues i on i.source_suggestion_id=s.id join writing_issue_correction_attempts a on a.writing_issue_id=i.id where s.id=$1",[suggestionId])).rows[0];
  assert.deepEqual(lineage,{suggestion_occurrence:s6Occurrence.id,issue_occurrence:s6Occurrence.id,attempt_occurrence:s6Occurrence.id,correction_outcome:"correct",corrected_independently:false,assistance_state:"unknown"}); proof();
  await assert.rejects(db.query("update writing_issue_correction_attempts set corrected_independently=true where writing_issue_id=$1",[issueId]),/fact_immutable/);
  const observed=(await db.query("select findings::int,review_candidates::int,parent_review_issues::int,retry_attempts::int,correct_retries::int,retries_with_unknown_assistance::int from writing_known_spelling_observability where child_id=$1",[child])).rows[0];
  assert.deepEqual(observed,{findings:2,review_candidates:2,parent_review_issues:1,retry_attempts:1,correct_retries:1,retries_with_unknown_assistance:1}); proof();
  await db.query("select enqueue_writing_shadow_replay($1,'s6-replay')",[[source.id]]);
  const s6Replay=(await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  assert.equal((await db.query("select persist_writing_shadow_result_with_known_errors($1,$2,$3) ok",[s6Replay.id,s6Replay.lease_token,{...s5Result([{base:s6Occurrence,canonicalWordId:null}],"s6-replay"),knownSpellingErrors:known(true)}])).rows[0].ok,true);
  assert.equal((await db.query("select count(*)::int n from writing_known_spelling_findings where occurrence_id=$1",[s6Occurrence.id])).rows[0].n,2);
  assert.equal((await db.query("select lineage_reconciliation from writing_known_spelling_current_findings where occurrence_id=$1",[s6Occurrence.id])).rows[0].lineage_reconciliation,"EXACT_HISTORICAL_MATCH");
  assert.equal((await db.query("select materialize_writing_known_error_review_candidates(100)::int n")).rows[0].n,0); proof();
  await db.query("select enqueue_writing_shadow_replay($1,'s6-withdrawn')",[[source.id]]);
  const s6Withdrawn=(await db.query("select * from claim_writing_shadow_runs(1)")).rows[0];
  await db.query("select persist_writing_shadow_result_with_known_errors($1,$2,$3)",[s6Withdrawn.id,s6Withdrawn.lease_token,{...s5Result([{base:s6Occurrence,canonicalWordId:null}],"s6-withdrawn"),knownSpellingErrors:known(false)}]);
  assert.equal((await db.query("select count(*)::int n from writing_known_spelling_current_findings where occurrence_id=$1",[s6Occurrence.id])).rows[0].n,0); proof();
  await db.query("set role authenticated");
  await assert.rejects(db.query("select * from writing_known_spelling_findings"),/permission denied/);
  await db.query("reset role"); proof();
  console.log(JSON.stringify({ status:"passed",proofs,enrichmentProofs,reviewProofs,s6Proofs:10,database:"disposable PostgreSQL 18", productionConnections:0,limitations:"Minimal dependency fixture; staging and full migration-chain verification remain required." }));
} finally {
  await Promise.allSettled(connections.map((client) => client.end()));
  if (started) execFileSync(binaries.pg_ctl,["-D",dataDir,"-m","immediate","-w","stop"],options);
  rmSync(root,{recursive:true,force:true});
}
