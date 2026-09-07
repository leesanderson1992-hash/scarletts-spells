/** Disposable PostgreSQL proof for S7 lineage and continuation. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const runtime = process.env.WRITING_PROOF_RUNTIME;
assert.ok(runtime, "WRITING_PROOF_RUNTIME must name an isolated PostgreSQL runtime");
const require = createRequire(join(resolve(runtime), "package.json"));
const { Client } = require("pg");
const binaries = await import(require.resolve("@embedded-postgres/darwin-arm64"));
const root = mkdtempSync(join(tmpdir(), "writing-s7-proof-"));
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
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table children(id uuid primary key, parent_user_id uuid not null);
    create table task_submissions(id uuid primary key, parent_user_id uuid not null, child_id uuid not null);
    create table writing_source_snapshots(id uuid primary key, submission_id uuid not null, parent_user_id uuid not null, child_id uuid not null);
    create table writing_occurrences(id text primary key, snapshot_id uuid not null references writing_source_snapshots(id));
    create table writing_samples(id uuid primary key, task_submission_id uuid, parent_user_id uuid, child_id uuid);
    create table misspelling_instances(
      id uuid primary key, writing_sample_id uuid, parent_user_id uuid not null, child_id uuid not null,
      source_writing_occurrence_id text references writing_occurrences(id)
    );
    create table parent_verified_spelling_candidate_mappings(
      id uuid primary key, parent_user_id uuid not null, child_id uuid not null,
      task_submission_id uuid,
      source_misspelling_instance_id uuid references misspelling_instances(id)
    );
    create table spelling_catalog_review_cases(
      id uuid primary key, parent_user_id uuid not null, child_id uuid not null,
      task_submission_id uuid,
      source_misspelling_instance_id uuid not null references misspelling_instances(id)
    );
    create table spelling_canonical_mapping_recommendations(
      id uuid primary key, parent_user_id uuid not null, child_id uuid not null,
      task_submission_id uuid,
      candidate_mapping_id uuid references parent_verified_spelling_candidate_mappings(id),
      source_misspelling_instance_id uuid references misspelling_instances(id)
    );
    create table adle_canonical_intake_candidates(
      id uuid primary key, source_candidate_mapping_id uuid not null references parent_verified_spelling_candidate_mappings(id),
      child_id uuid not null
    );
    create table adle_learning_items(id uuid primary key, child_id uuid not null);
    create table adle_learning_item_sources(
      id uuid primary key, learning_item_id uuid not null references adle_learning_items(id),
      parent_verified_candidate_mapping_id uuid references parent_verified_spelling_candidate_mappings(id)
    );
    create function adle_authorize_governed_source_continuation(uuid, uuid, uuid)
    returns jsonb language sql as $$
      select jsonb_build_object(
        'candidate_mapping_id', $1,
        'parent_user_id', $2,
        'child_id', $3,
        'task_submission_id', null,
        'source_adle_review_session_id', gen_random_uuid(),
        'source_misspelling_instance_id', null,
        'misspelling_normalized', 'becos',
        'correct_spelling_normalized', 'because',
        'micro_skill_key', 'fixture_skill',
        'transitioned_count', 0,
        'handoff_state', 'r8c_exact_id_handed_off'
      )
    $$;
    grant usage on schema public, auth to authenticated, anon, service_role;
  `);

  const migration = readFileSync(
    new URL("../supabase/migrations/20260907110000_integrate_whole_writing_unknown_error_intake.sql", import.meta.url),
    "utf8",
  );
  await db.query(migration);
  proof();

  const parent = randomUUID();
  const otherParent = randomUUID();
  const child = randomUUID();
  const otherChild = randomUUID();
  const submission = randomUUID();
  const snapshot = randomUUID();
  const sample = randomUUID();
  const occurrence = "whole-writing:s7:occurrence-1";
  const otherSnapshot = randomUUID();
  const otherOccurrence = "whole-writing:s7:occurrence-other";
  await db.query("insert into auth.users values($1),($2)", [parent, otherParent]);
  await db.query("insert into children values($1,$2),($3,$4)", [child, parent, otherChild, otherParent]);
  await db.query("insert into task_submissions values($1,$2,$3)", [submission, parent, child]);
  await db.query("insert into writing_source_snapshots values($1,$2,$3,$4),($5,$2,$6,$7)", [snapshot, submission, parent, child, otherSnapshot, otherParent, otherChild]);
  await db.query("insert into writing_occurrences values($1,$2),($3,$4)", [occurrence, snapshot, otherOccurrence, otherSnapshot]);
  await db.query("insert into writing_samples values($1,$2,$3,$4)", [sample, submission, parent, child]);

  const misspelling = randomUUID();
  await db.query("insert into misspelling_instances values($1,$2,$3,$4,$5)", [misspelling, sample, parent, child, occurrence]);
  const candidate = randomUUID();
  await db.query("insert into parent_verified_spelling_candidate_mappings(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id) values($1,$2,$3,$4,$5)", [candidate, parent, child, submission, misspelling]);
  assert.equal((await db.query("select source_writing_occurrence_id from parent_verified_spelling_candidate_mappings where id=$1", [candidate])).rows[0].source_writing_occurrence_id, occurrence);
  proof();

  const recommendation = randomUUID();
  const reviewCase = randomUUID();
  const intake = randomUUID();
  const learningItem = randomUUID();
  const learningSource = randomUUID();
  await db.query("insert into spelling_canonical_mapping_recommendations(id,parent_user_id,child_id,task_submission_id,candidate_mapping_id) values($1,$2,$3,$4,$5)", [recommendation, parent, child, submission, candidate]);
  await db.query("insert into spelling_catalog_review_cases(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id) values($1,$2,$3,$4,$5)", [reviewCase, parent, child, submission, misspelling]);
  await db.query("insert into adle_canonical_intake_candidates(id,source_candidate_mapping_id,child_id) values($1,$2,$3)", [intake, candidate, child]);
  await db.query("insert into adle_learning_items values($1,$2)", [learningItem, child]);
  await db.query("insert into adle_learning_item_sources(id,learning_item_id,parent_verified_candidate_mapping_id) values($1,$2,$3)", [learningSource, learningItem, candidate]);
  const linked = await db.query(`select
    (select source_writing_occurrence_id from spelling_canonical_mapping_recommendations where id=$1) recommendation,
    (select source_writing_occurrence_id from spelling_catalog_review_cases where id=$2) review_case,
    (select source_writing_occurrence_id from adle_canonical_intake_candidates where id=$3) intake,
    (select source_writing_occurrence_id from adle_learning_item_sources where id=$4) learning_source`,
    [recommendation, reviewCase, intake, learningSource]);
  assert.deepEqual(linked.rows[0], { recommendation: occurrence, review_case: occurrence, intake: occurrence, learning_source: occurrence });
  await db.query(
    "insert into adle_learning_item_sources(id,learning_item_id,parent_verified_candidate_mapping_id) values($1,$2,null)",
    [randomUUID(), learningItem],
  );
  proof();

  await assert.rejects(
    db.query("update parent_verified_spelling_candidate_mappings set source_writing_occurrence_id=$1 where id=$2", [otherOccurrence, candidate]),
    /lineage_conflict|scope_invalid/,
  );
  await assert.rejects(
    db.query("insert into adle_canonical_intake_candidates values($1,$2,$3,$4)", [randomUUID(), candidate, otherChild, occurrence]),
    /child_scope_invalid/,
  );
  await assert.rejects(
    db.query("update parent_verified_spelling_candidate_mappings set task_submission_id=$1 where id=$2", [randomUUID(), candidate]),
    /submission_invalid/,
  );
  proof();

  const lateMisspelling = randomUUID();
  const lateCandidate = randomUUID();
  const lateIntake = randomUUID();
  const lateLearningSource = randomUUID();
  await db.query("insert into misspelling_instances(id,writing_sample_id,parent_user_id,child_id) values($1,$2,$3,$4)", [lateMisspelling, sample, parent, child]);
  await db.query("insert into parent_verified_spelling_candidate_mappings(id,parent_user_id,child_id,task_submission_id,source_misspelling_instance_id) values($1,$2,$3,$4,$5)", [lateCandidate, parent, child, submission, lateMisspelling]);
  await db.query("insert into adle_canonical_intake_candidates(id,source_candidate_mapping_id,child_id) values($1,$2,$3)", [lateIntake, lateCandidate, child]);
  await db.query("insert into adle_learning_item_sources(id,learning_item_id,parent_verified_candidate_mapping_id) values($1,$2,$3)", [lateLearningSource, learningItem, lateCandidate]);
  await db.query("update misspelling_instances set source_writing_occurrence_id=$1 where id=$2", [occurrence, lateMisspelling]);
  const late = await db.query("select (select source_writing_occurrence_id from parent_verified_spelling_candidate_mappings where id=$1) candidate,(select source_writing_occurrence_id from adle_canonical_intake_candidates where id=$2) intake,(select source_writing_occurrence_id from adle_learning_item_sources where id=$3) source", [lateCandidate, lateIntake, lateLearningSource]);
  assert.deepEqual(late.rows[0], { candidate: occurrence, intake: occurrence, source: occurrence });
  proof();

  const receipt = (await db.query("select adle_authorize_governed_source_continuation_s7($1,$2,$3) receipt", [candidate, parent, child])).rows[0].receipt;
  assert.equal(receipt.source_writing_occurrence_id, occurrence);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [parent]);
  await assert.rejects(db.query("select adle_authorize_governed_source_continuation_s7($1,$2,$3)", [candidate, parent, child]), /service governance only/);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  proof();

  const observation = (await db.query("select occurrence_linked_parent_findings::int,occurrence_linked_candidate_mappings::int,occurrence_linked_catalog_cases::int,occurrence_linked_intake_candidates::int,occurrence_linked_learning_sources::int from writing_unknown_error_intake_observability where child_id=$1", [child])).rows[0];
  assert.deepEqual(observation, {
    occurrence_linked_parent_findings: 2,
    occurrence_linked_candidate_mappings: 2,
    occurrence_linked_catalog_cases: 1,
    occurrence_linked_intake_candidates: 2,
    occurrence_linked_learning_sources: 2,
  });
  proof();

  await db.query("set role authenticated");
  await assert.rejects(db.query("select * from writing_unknown_error_intake_observability"), /permission denied/);
  await db.query("reset role");
  proof();

  console.log(JSON.stringify({ status: "passed", proofs, database: "disposable PostgreSQL 18", productionConnections: 0 }));
} finally {
  if (db) await db.end();
  if (started) execFileSync(binaries.pg_ctl, ["-D", dataDir, "-m", "immediate", "-w", "stop"], options);
  rmSync(root, { recursive: true, force: true });
}
