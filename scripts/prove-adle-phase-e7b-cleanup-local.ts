#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const CONFIRMATION = "PROVE_ADLE_PHASE_E7B_LOCALLY";
if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing disposable E7B proof without: -- ${CONFIRMATION}`);
}

const root = process.cwd();
const container = process.env.ADLE_PRODUCTION_SHAPED_DB_CONTAINER?.trim()
  || "supabase_db_scarletts-spells-adle-prodshape-20260827";
const sourceDatabase = process.env.ADLE_PRODUCTION_SHAPED_DB_NAME?.trim() || "postgres";
const proofDatabase = `phase_e7b_cleanup_${process.pid}`;
const maxBuffer = 256 * 1024 * 1024;
const migrationPath = resolve(root, "supabase/migrations/20260829133000_retire_verified_adle_legacy_database_functions.sql");
const restorationPath = resolve(root, "scripts/sql/adle-phase-e7b-forward-restoration.sql");
const v3ProofPath = resolve(root, "scripts/sql/prove-adle-phase-e7b-v3-authorities-local.sql");

const retired = [
  "public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)",
  "public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)",
  "public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)",
  "public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text)",
  "public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb)",
  "public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb)",
  "public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)",
] as const;

function docker(args: string[], input?: string | Buffer): string {
  return execFileSync("docker", args, {
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    maxBuffer,
  });
}

function psql(database: string, sql: string): string {
  return docker([
    "exec", "-i", container, "psql", "-U", "postgres", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-At",
  ], sql);
}

function migration(name: string): string {
  return readFileSync(resolve(root, "supabase/migrations", name), "utf8");
}

function recordMigration(database: string, file: string) {
  const version = file.split("_")[0]!;
  const name = basename(file, ".sql").slice(version.length + 1);
  psql(database, `insert into supabase_migrations.schema_migrations(version,name) values ('${version}','${name}') on conflict(version) do nothing;`);
}

const protectedStateSql = `
  select jsonb_object_agg(relation_name,row_count order by relation_name)::text
  from (
    select 'daily_assignments' relation_name,count(*) row_count from public.daily_assignments
    union all select 'assignment_items',count(*) from public.assignment_items
    union all select 'children',count(*) from public.children
    union all select 'adle_learning_items',count(*) from public.adle_learning_items
    union all select 'adle_review_schedule_words',count(*) from public.adle_review_schedule_words
    union all select 'adle_review_bundles',count(*) from public.adle_review_bundles
    union all select 'adle_taught_word_history',count(*) from public.adle_taught_word_history
    union all select 'adle_authentic_use_events',count(*) from public.adle_authentic_use_events
    union all select 'child_word_treasures',count(*) from public.child_word_treasures
    union all select 'child_word_treasure_events',count(*) from public.child_word_treasure_events
    union all select 'child_gold_coin_ledger_events',count(*) from public.child_gold_coin_ledger_events
  ) protected;
`;

const sourceFacts = JSON.parse(psql(sourceDatabase, `
  select jsonb_build_object(
    'ledgerCount',(select count(*) from supabase_migrations.schema_migrations),
    'learnerRows',(select count(*) from public.daily_assignments),
    'retiredFunctions',(select count(*) from unnest(array[${retired.map((signature) => `'${signature}'`).join(",")}]) signature where to_regprocedure(signature) is not null)
  );
`).trim()) as { ledgerCount: number; learnerRows: number; retiredFunctions: number };
if (sourceFacts.ledgerCount !== 98 || sourceFacts.learnerRows !== 0 || sourceFacts.retiredFunctions !== 7) {
  throw new Error(`Production-shaped disposable source drifted: ${JSON.stringify(sourceFacts)}`);
}

docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", proofDatabase]);

try {
  docker(["exec", container, "createdb", "-U", "postgres", "-T", "template0", proofDatabase]);
  psql(proofDatabase, "drop schema public cascade; create schema extensions; create extension pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;");
  const schemaDump = docker([
    "exec", container, "pg_dump", "-U", "postgres", "-d", sourceDatabase,
    "--schema-only", "--no-owner", "--no-privileges",
    "--schema=public", "--schema=auth", "--schema=supabase_migrations",
  ]);
  psql(proofDatabase, schemaDump);
  const ledgerDump = docker([
    "exec", container, "pg_dump", "-U", "postgres", "-d", sourceDatabase,
    "--data-only", "--inserts", "--no-owner", "--no-privileges",
    "--table=supabase_migrations.schema_migrations",
  ]);
  psql(proofDatabase, ledgerDump);
  psql(proofDatabase, "grant usage on schema public to anon,authenticated,service_role;");

  psql(proofDatabase, `
    insert into supabase_migrations.schema_migrations(version,name) values
      ('20260421','add_false_positive_to_misspelling_instances'),
      ('20260707120000','fix_teaching_dictionary_display_word_data_quality'),
      ('20260731200000','add_adle_generic_snapshot_persistence_v2'),
      ('20260804234500','add_adle_canonical_intake_supabase_scheduler')
    on conflict(version) do nothing;
    create schema if not exists cron;
    create table cron.job(jobid bigint generated by default as identity primary key,schedule text,command text,nodename text default 'localhost',nodeport integer default 5432,database text default current_database(),username text default current_user,active boolean default true,jobname text unique);
    insert into cron.job(schedule,command,active,jobname) values('*/5 * * * *','select public.adle_dispatch_canonical_intake_safety_sweep();',true,'adle-canonical-intake-production-safety-sweep-v1');
  `);

  const forwardSchemaMigrations = [
    "20260807130000_add_canonical_misspelling_intake.sql",
    "20260807173000_add_editable_writing_issue_reason_drafts.sql",
    "20260828120000_make_parent_approval_occurrence_complete.sql",
    "20260828130000_authorize_exact_id_canonical_intake_handoff.sql",
    "20260828140000_reconcile_downstream_spelling_authority.sql",
    "20260828150000_materialize_r8e_stage_f_historical_occurrence_sources.sql",
    "20260828160000_complete_governed_blocked_word_auto_resume.sql",
  ];
  for (const file of forwardSchemaMigrations) {
    psql(proofDatabase, migration(file));
    recordMigration(proofDatabase, file);
  }

  psql(proofDatabase, `
    revoke all on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) from public,anon,authenticated;
    grant execute on function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) to service_role;
    revoke all on function public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
    grant execute on function public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb) to service_role;
    revoke all on function public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb) from public,anon,authenticated;
    grant execute on function public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb) to service_role;
    revoke all on function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text) from public,anon,authenticated;
    grant execute on function public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb,uuid,uuid,text,text) to service_role;
    revoke all on function public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) from public,anon,authenticated;
    grant execute on function public.complete_adle_word_lab_v1(uuid,uuid,uuid,date,text,text,uuid[],jsonb,jsonb,jsonb) to service_role;
    revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb) from public,anon;
    grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid(jsonb) to service_role,authenticated;
    revoke all on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb) from public,anon;
    grant execute on function public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb) to service_role,authenticated;
    revoke all on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) from public,anon;
    grant execute on function public.adle_lesson_snapshot_is_structurally_valid(jsonb) to service_role,authenticated;
  `);

  const baselineRaw = JSON.parse(psql(proofDatabase, `select jsonb_build_object('ledgerCount',(select count(*) from supabase_migrations.schema_migrations),'protectedState',(${protectedStateSql.trim().replace(/;$/, "")}));`).trim()) as { ledgerCount: number; protectedState: string };
  const baseline = { ledgerCount: baselineRaw.ledgerCount, protectedState: JSON.parse(baselineRaw.protectedState) as Record<string, number> };
  if (baseline.ledgerCount !== 109) throw new Error(`Disposable E7B baseline ledger is ${baseline.ledgerCount}, expected 109.`);

  psql(proofDatabase, "alter function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) set search_path=public;");
  let definitionDriftRejected = false;
  try {
    psql(proofDatabase, readFileSync(migrationPath, "utf8"));
  } catch (error: unknown) {
    const stderr = typeof error === "object" && error !== null && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr ?? "")
      : "";
    definitionDriftRejected = `${error instanceof Error ? error.message : String(error)}\n${stderr}`.includes("definition drift");
  }
  if (!definitionDriftRejected) throw new Error("E7B migration did not fail closed on definition drift.");
  psql(proofDatabase, "alter function public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb) set search_path=public,pg_temp;");

  psql(proofDatabase, readFileSync(migrationPath, "utf8"));
  const afterCleanupCount = Number(psql(proofDatabase, `select count(*) from unnest(array[${retired.map((signature) => `'${signature}'`).join(",")}]) signature where to_regprocedure(signature) is not null;`).trim());
  if (afterCleanupCount !== 0) throw new Error(`Cleanup left ${afterCleanupCount} retired signatures.`);
  psql(proofDatabase, readFileSync(v3ProofPath, "utf8"));
  const afterCleanupState = JSON.parse(psql(proofDatabase, protectedStateSql).trim()) as Record<string, number>;
  if (JSON.stringify(afterCleanupState) !== JSON.stringify(baseline.protectedState)) {
    throw new Error(`Cleanup/v3 rollback changed protected learner rows: before=${JSON.stringify(baseline.protectedState)} after=${JSON.stringify(afterCleanupState)}.`);
  }

  psql(proofDatabase, readFileSync(restorationPath, "utf8"));
  const afterRestoreCount = Number(psql(proofDatabase, `select count(*) from unnest(array[${retired.map((signature) => `'${signature}'`).join(",")}]) signature where to_regprocedure(signature) is not null;`).trim());
  if (afterRestoreCount !== 7) throw new Error(`Restoration recreated ${afterRestoreCount} of seven signatures.`);
  const afterRestoreState = JSON.parse(psql(proofDatabase, protectedStateSql).trim()) as Record<string, number>;
  if (JSON.stringify(afterRestoreState) !== JSON.stringify(baseline.protectedState)) throw new Error("Restoration changed protected learner rows.");

  console.log(JSON.stringify({
    status: "verified",
    sourceFacts,
    disposableDatabase: proofDatabase,
    preCleanupSignatures: 7,
    postCleanupSignatures: afterCleanupCount,
    postRestorationSignatures: afterRestoreCount,
    definitionDriftRejected,
    aggregateValidator: "v3-only after cleanup; captured v2+v3 definition restored exactly",
    genericV3Writer: "executed successfully and replayed idempotently inside rollback",
    specialistV3Writer: "executed fail-closed ownership guard",
    protectedStateUnchanged: true,
    persistentLearnerMutation: false,
  }, null, 2));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", proofDatabase]);
}
