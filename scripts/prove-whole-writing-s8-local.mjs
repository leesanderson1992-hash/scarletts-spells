/** Disposable PostgreSQL proof for S8 context history, selection and review lineage. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const runtime = process.env.WRITING_PROOF_RUNTIME;
assert.ok(runtime, "WRITING_PROOF_RUNTIME must name an isolated PostgreSQL runtime");
const require = createRequire(join(resolve(runtime), "package.json"));
const { Client } = require("pg");
const binaries = await import(require.resolve("@embedded-postgres/darwin-arm64"));
const root = mkdtempSync(join(tmpdir(), "writing-s8-proof-"));
const dataDir = join(root, "data");
const options = { encoding: "utf8", timeout: 30_000, stdio: "pipe" };
let db;
let started = false;
let proofs = 0;
const proof = () => { proofs += 1; };

try {
  execFileSync(binaries.initdb, ["-D", dataDir, "-U", "writing_proof", "-A", "trust", "--no-locale", "--encoding=UTF8"], options);
  execFileSync(binaries.pg_ctl, ["-D", dataDir, "-l", join(root, "postgres.log"), "-o", `-h '' -k ${root}`, "-w", "start"], options);
  started = true;
  db = new Client({ host: root, port: 5432, user: "writing_proof", database: "postgres" });
  await db.connect();
  await db.query(`
    create role authenticated; create role anon; create role service_role bypassrls;
    create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.children(id uuid primary key, parent_user_id uuid not null);
    create table public.task_submissions(id uuid primary key, parent_user_id uuid not null, child_id uuid not null);
    create table public.writing_samples(
      id uuid primary key,task_submission_id uuid,parent_user_id uuid,child_id uuid,sample_text text not null
    );
    create table public.writing_shadow_controls(
      child_id uuid primary key,parent_user_id uuid not null,capture_enabled boolean not null default false,
      processing_enabled boolean not null default false,extraction_enabled boolean not null default false,
      resolution_enabled boolean not null default false,evidence_shadow_enabled boolean not null default false,
      known_error_detection_enabled boolean not null default false,known_error_review_enabled boolean not null default false,
      updated_at timestamptz not null default clock_timestamp()
    );
    create table public.writing_source_snapshots(
      id uuid primary key,submission_id uuid not null,parent_user_id uuid not null,child_id uuid not null,
      envelope jsonb not null,captured_at timestamptz not null default clock_timestamp()
    );
    create table public.writing_shadow_runs(
      id uuid primary key,snapshot_id uuid not null,status text not null,completed_at timestamptz
    );
    create table public.canonical_teaching_dictionary_words(
      id uuid primary key,normalised_word text not null,dialect_code text not null,row_status text not null
    );
    create table public.writing_occurrences(
      id text primary key,snapshot_id uuid not null references public.writing_source_snapshots(id),field_path text not null,
      start_utf16 integer not null,end_utf16 integer not null,observed_text text not null,field_hash text not null,
      provenance text not null,extractor_version text not null
    );
    create table public.writing_occurrence_interpretations(
      id uuid primary key,occurrence_id text not null references public.writing_occurrences(id),
      run_id uuid not null references public.writing_shadow_runs(id),canonical_word_id uuid,
      normalized_form text not null,dialect text not null,resolution_status text not null,
      interpretation jsonb not null
    );
    create table public.writing_occurrence_assessments(
      id uuid primary key,interpretation_id uuid not null references public.writing_occurrence_interpretations(id),
      outcome text not null default 'unknown',independence text not null default 'unknown',environment text,
      assessment jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
    );
    create table public.writing_shadow_run_enrichment_scopes(
      run_id uuid primary key,event_sequence bigint not null
    );
    create view public.writing_current_occurrence_interpretations as
      select distinct on(i.occurrence_id) i.*,coalesce(scope.event_sequence,0) authority_event_sequence
      from public.writing_occurrence_interpretations i
      join public.writing_shadow_runs run on run.id=i.run_id and run.status='completed'
      left join public.writing_shadow_run_enrichment_scopes scope on scope.run_id=run.id
      order by i.occurrence_id,coalesce(scope.event_sequence,0) desc,run.completed_at desc,run.id desc,i.id desc;
    create table public.micro_skill_catalog(
      micro_skill_key text primary key,mastery_domain_key text not null,is_active boolean not null,
      is_assignable boolean not null
    );
    create table public.spelling_canonical_mappings(
      id uuid primary key,misspelling_normalized text not null,correct_spelling_normalized text not null,
      micro_skill_key text not null,mapping_status text not null,dialect_code text not null,
      normalization_version text not null,resolver_visibility_status text not null,metadata jsonb not null,
      created_at timestamptz not null default clock_timestamp()
    );
    create table public.spelling_canonical_mapping_events(
      id uuid primary key default gen_random_uuid(),mapping_id uuid not null,event_type text not null,
      new_resolver_visibility_status text,created_at timestamptz not null default clock_timestamp()
    );
    create table public.misspelling_instances(
      id uuid primary key default gen_random_uuid(),writing_sample_id uuid not null,child_id uuid not null,
      parent_user_id uuid not null,misspelled_word text not null,corrected_word text not null,suggested_word text,
      context_text text,position_start integer,position_end integer,notes text,error_type text,
      confidence_score numeric,is_parent_overridden boolean not null default false,
      is_false_positive boolean not null default false,source_writing_occurrence_id text
    );
    create unique index misspelling_instances_source_occurrence_key
      on public.misspelling_instances(source_writing_occurrence_id) where source_writing_occurrence_id is not null;
    create table public.writing_issue_suggestions(
      id uuid primary key default gen_random_uuid(),child_id uuid not null,parent_user_id uuid not null,
      task_submission_id uuid,writing_sample_id uuid,misspelling_instance_id uuid,source_type text not null,
      suggestion_status text not null,observed_text text,suggested_replacement text,context_text text,
      source_field_key text,position_start integer,position_end integer,suggested_micro_skill_key text not null,
      notes text,metadata jsonb not null default '{}',resolved_at timestamptz,
      source_writing_occurrence_id text,created_at timestamptz not null default clock_timestamp()
    );
    create table public.writing_issues(
      id uuid primary key default gen_random_uuid(),child_id uuid not null,parent_user_id uuid not null,
      task_submission_id uuid,writing_sample_id uuid,source_suggestion_id uuid,source_misspelling_instance_id uuid,
      issue_status text not null,observed_text text,suggested_replacement text,approved_replacement text,
      context_text text,source_field_key text,position_start integer,position_end integer,micro_skill_key text not null,
      parent_review_note text,parent_marked_at timestamptz,metadata jsonb not null default '{}',
      source_writing_occurrence_id text,created_at timestamptz not null default clock_timestamp()
    );
    create function public.reject_writing_fact_update() returns trigger language plpgsql as $$
      begin raise exception 'writing_fact_immutable'; end
    $$;
    grant usage on schema public,auth,extensions to authenticated,anon,service_role;
  `);

  const migration = readFileSync(
    new URL("../supabase/migrations/20260907120000_add_whole_writing_context_validation.sql", import.meta.url),
    "utf8",
  );
  await db.query(migration);
  proof();

  // V3 uses the existing additive release contract. This row exists only in
  // this disposable cluster and is neither selected nor approved.
  const v3Artifact = JSON.parse(readFileSync(
    new URL("../data/whole-writing/v3-ordinary-writing-evaluation/release-candidates/s8-v3-there-their-theyre.blocked.json", import.meta.url),
    "utf8",
  ));
  await db.query(`insert into writing_context_family_releases(
    id,release_key,family_key,registry_version,analyser_version,corpus_version,members,manifest,manifest_fingerprint
  ) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
    v3Artifact.releaseId,
    v3Artifact.releaseKey,
    v3Artifact.familyKey,
    v3Artifact.registryVersion,
    v3Artifact.analyserVersion,
    v3Artifact.corpusVersion,
    ["there", "their", "they're"],
    { proofFixture: true, operationalPublication: false },
    v3Artifact.manifestFingerprint,
  ]);
  assert.equal((await db.query("select count(*)::int count from writing_context_family_selection_events where release_id=$1", [v3Artifact.releaseId])).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::int count from writing_context_family_approval_events where release_id=$1", [v3Artifact.releaseId])).rows[0].count, 0);
  await assert.rejects(
    db.query("update writing_context_family_releases set release_key='changed' where id=$1", [v3Artifact.releaseId]),
    /writing_fact_immutable/,
  );
  proof();

  const parent = randomUUID();
  const otherParent = randomUUID();
  const child = randomUUID();
  const otherChild = randomUUID();
  const submission = randomUUID();
  const snapshot = randomUUID();
  const run = randomUUID();
  const sample = randomUUID();
  const theirWord = randomUUID();
  const theyreWord = randomUUID();
  const occurrence = "whole-writing:s8:their-1";
  const interpretation = randomUUID();
  const assessment = randomUUID();
  const field = "Their going to the park.";
  const fieldHash = "14c31535f3142cbdf3c797b988f94300c47427d6f20c3156f86c1ba53681c7ec";
  await db.query("insert into auth.users values($1),($2)", [parent, otherParent]);
  await db.query("insert into children values($1,$2),($3,$4)", [child, parent, otherChild, otherParent]);
  await db.query("insert into task_submissions values($1,$2,$3)", [submission, parent, child]);
  await db.query("insert into writing_samples values($1,$2,$3,$4,$5)", [sample, submission, parent, child, field]);
  await db.query(`insert into writing_shadow_controls(
    child_id,parent_user_id,context_processing_enabled,context_retrospective_enabled,context_review_enabled
  ) values($1,$2,true,true,true)`, [child, parent]);
  await db.query("insert into writing_source_snapshots values($1,$2,$3,$4,$5,clock_timestamp())", [snapshot, submission, parent, child, { draftPayload: { response: field } }]);
  await db.query("insert into writing_shadow_runs values($1,$2,'completed',clock_timestamp())", [run, snapshot]);
  await db.query("insert into canonical_teaching_dictionary_words values($1,'their','en-GB','active'),($2,$3,'en-GB','active')", [theirWord, theyreWord, "they're"]);
  await db.query("insert into writing_occurrences values($1,$2,'/draftPayload/response',0,5,'Their',$3,'learner_response','WHOLE_WRITING_EXTRACTOR_V1')", [occurrence, snapshot, fieldHash]);
  await db.query("insert into writing_occurrence_interpretations values($1,$2,$3,$4,'their','en-GB','resolved',$5)", [interpretation, occurrence, run, theirWord, { canonicalWordId: theirWord }]);
  await db.query("insert into writing_occurrence_assessments(id,interpretation_id) values($1,$2)", [assessment, interpretation]);

  assert.equal(Number((await db.query("select discover_writing_context_jobs('local',100) count")).rows[0].count), 1);
  const claimed = (await db.query("select * from claim_writing_context_jobs('local',20)")).rows;
  assert.equal(claimed.length, 1);
  assert.equal((await db.query("select count(*)::int count from claim_writing_context_jobs('local',20)")).rows[0].count, 0);
  proof();

  await assert.rejects(
    db.query(`insert into writing_context_jobs(
      occurrence_id,interpretation_id,assessment_id,snapshot_id,parent_user_id,child_id,environment_key,family_key,release_id
    ) values($1,$2,$3,$4,$5,$6,'local','THERE_THEIR_THEYRE','81000000-0000-4000-8000-000000000001')`,
    [occurrence, interpretation, assessment, snapshot, otherParent, otherChild]),
    /writing_context_job_scope_invalid/,
  );
  proof();

  const firstJob = claimed[0];
  const result = {
    status: "INVALID",
    familyKey: "THERE_THEIR_THEYRE",
    observedCanonicalWordId: theirWord,
    alternativeCanonicalWordId: theyreWord,
    observedMember: "their",
    alternativeMember: "they're",
    assessedScope: "they_are_contraction",
    reasonCode: "POSSESSIVE_BEFORE_FINITE_VERB",
    ruleId: "THERE_THEIR_THEYRE_V1",
    analyserVersion: "WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1",
    registryVersion: "WHOLE_WRITING_CONTEXT_REGISTRY_V1",
    corpusVersion: "WHOLE_WRITING_CONTEXT_CORPUS_V1",
    manifestFingerprint: "50cb8caf24132ae1b57bb5755e16c29a3152427631310483ad72c5dc3fa47df6",
    interpretationFingerprint: "fixture-interpretation-v1",
    mappingAuthorityFingerprint: "fixture-mapping-v1",
    contextExcerpt: field,
    excerptStartUtf16: 0,
    excerptEndUtf16: field.length,
    resultFingerprint: "fixture-result-v1",
  };
  assert.equal((await db.query("select finish_writing_context_job($1,$2,$3,null) saved", [firstJob.id, firstJob.lease_token, result])).rows[0].saved, true);
  const firstResult = (await db.query("select * from writing_context_current_results where occurrence_id=$1", [occurrence])).rows[0];
  assert.equal(firstResult.result_status, "INVALID");
  assert.equal((await db.query("select materialize_writing_context_review_candidates('local',100) count")).rows[0].count, 0);
  proof();

  await assert.rejects(
    db.query("update writing_context_results set reason_code='changed' where id=$1", [firstResult.id]),
    /writing_fact_immutable/,
  );
  await assert.rejects(
    db.query("update writing_context_family_releases set release_key='changed' where id='81000000-0000-4000-8000-000000000001'"),
    /writing_fact_immutable/,
  );
  proof();

  const skill = "D4_CONTEXT_HOMOPHONE";
  const conflictingSkill = "D4_CONTEXT_HOMOPHONE_CONFLICT";
  const mapping = randomUUID();
  const conflictingMapping = randomUUID();
  await db.query("insert into micro_skill_catalog values($1,'D4',true,true),($2,'D4',true,true)", [skill, conflictingSkill]);
  await db.query(`insert into spelling_canonical_mappings values(
    $1,'their',$2,$3,'active','en-GB','spelling_normalize_v1','visible',$4,clock_timestamp()
  )`, [mapping, "they're", skill, { automatic_detection_eligibility: "context_required" }]);
  await db.query("insert into spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values($1,'resolver_visibility_enabled','visible')", [mapping]);
  await db.query(`insert into spelling_canonical_mappings values(
    $1,'their',$2,$3,'active','en-GB','spelling_normalize_v1','visible',$4,clock_timestamp()
  )`, [conflictingMapping, "they're", conflictingSkill, { automatic_detection_eligibility: "context_required" }]);
  await db.query("insert into spelling_canonical_mapping_events(mapping_id,event_type,new_resolver_visibility_status) values($1,'resolver_visibility_enabled','visible')", [conflictingMapping]);
  const approval = (await db.query(`insert into writing_context_family_approval_events(
    environment_key,family_key,release_id,action,corpus_version,evaluation_fingerprint,
    quality_limits,evaluation_metrics,authority_reference,approved_by
  ) values('local','THERE_THEIR_THEYRE','81000000-0000-4000-8000-000000000001','approved',
    'WHOLE_WRITING_CONTEXT_CORPUS_V1','fixture-evaluation',
    '{"fixture":true}','{"fixture":true}','disposable-local-proof',$1) returning id`, [parent])).rows[0].id;
  assert.equal((await db.query("select materialize_writing_context_review_candidates('local',100) count")).rows[0].count, 0);
  await db.query("update spelling_canonical_mappings set mapping_status='disabled',resolver_visibility_status='disabled' where id=$1", [conflictingMapping]);
  assert.equal((await db.query("select materialize_writing_context_review_candidates('local',100) count")).rows[0].count, 1);
  const delivery = (await db.query("select * from writing_context_review_deliveries where occurrence_id=$1", [occurrence])).rows[0];
  assert.equal(delivery.approval_event_id, approval);
  assert.equal((await db.query("select count(*)::int count from writing_context_current_review_deliveries where id=$1", [delivery.id])).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int count from misspelling_instances")).rows[0].count, 0);
  proof();

  await db.query("set role authenticated");
  await assert.rejects(db.query("select resolve_writing_context_review_delivery($1,'accepted')", [delivery.id]), /permission denied/);
  await db.query("reset role");
  const decision = (await db.query("select resolve_writing_context_review_delivery($1,'accepted') id", [delivery.id])).rows[0].id;
  const created = (await db.query(`select
    (select source_writing_occurrence_id from misspelling_instances limit 1) misspelling,
    (select source_writing_occurrence_id from writing_issue_suggestions limit 1) suggestion,
    (select source_writing_occurrence_id from writing_issues limit 1) issue,
    (select decision from writing_context_review_decisions where id=$1) decision`, [decision])).rows[0];
  assert.deepEqual(created, { misspelling: occurrence, suggestion: occurrence, issue: occurrence, decision: "accepted" });
  assert.equal((await db.query("select resolve_writing_context_review_delivery($1,'accepted') id", [delivery.id])).rows[0].id, decision);
  assert.equal((await db.query("select count(*)::int count from writing_issues")).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int count from writing_context_current_review_deliveries where id=$1", [delivery.id])).rows[0].count, 0);
  proof();

  const run2 = randomUUID();
  const interpretation2 = randomUUID();
  const assessment2 = randomUUID();
  await db.query("insert into writing_shadow_runs values($1,$2,'completed',clock_timestamp()+interval '1 second')", [run2, snapshot]);
  await db.query("insert into writing_shadow_run_enrichment_scopes values($1,2)", [run2]);
  await db.query("insert into writing_occurrence_interpretations values($1,$2,$3,$4,'their','en-GB','resolved',$5)", [interpretation2, occurrence, run2, theirWord, { canonicalWordId: theirWord, release: 2 }]);
  await db.query("insert into writing_occurrence_assessments(id,interpretation_id) values($1,$2)", [assessment2, interpretation2]);
  assert.equal((await db.query("select count(*)::int count from writing_context_current_results where occurrence_id=$1", [occurrence])).rows[0].count, 0);
  assert.equal(Number((await db.query("select discover_writing_context_jobs('local',100) count")).rows[0].count), 1);
  assert.equal((await db.query("select count(*)::int count from claim_writing_context_jobs('local',20)")).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int count from writing_context_results where occurrence_id=$1", [occurrence])).rows[0].count, 1);
  assert.equal((await db.query("select materialize_writing_context_review_candidates('local',100) count")).rows[0].count, 0);
  proof();

  const observation = (await db.query(`select status,result_status,reason_code,occurrence_count::int
    from writing_context_observability where environment_key='local' order by status,result_status`)).rows;
  assert.ok(observation.some((row) => row.status === "completed" && row.result_status === "INVALID"));
  assert.ok(observation.some((row) => row.status === "processing" && row.result_status === "PENDING"));
  await db.query("set role authenticated");
  await assert.rejects(db.query("select * from writing_context_observability"), /permission denied/);
  await db.query("reset role");
  proof();

  console.log(JSON.stringify({
    status: "passed",
    proofs,
    database: "disposable PostgreSQL 18",
    familiesSeeded: 4,
    v3UnselectedReleaseFixture: true,
    exactOccurrenceLineage: true,
    productionConnections: 0,
  }));
} finally {
  if (db) await db.end();
  if (started) execFileSync(binaries.pg_ctl, ["-D", dataDir, "-m", "immediate", "-w", "stop"], options);
  rmSync(root, { recursive: true, force: true });
}
