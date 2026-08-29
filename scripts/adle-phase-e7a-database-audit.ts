import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const EXPECTED_PRODUCTION_SHA = "a57fe67fe840fa02f0d326391c230daa9a36f485";
const GENUINE_CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const root = resolve(import.meta.dirname, "..");

const candidateFunctions = [
  "persist_adle_composed_daily_plan_v1",
  "persist_adle_generic_daily_plan_v2",
  "complete_adle_word_lab_v1",
  "persist_adle_base_word_family_pilot_v1",
  "persist_adle_base_word_family_pilot_v2",
  "adle_generic_lesson_snapshot_is_structurally_valid",
  "adle_generic_lesson_snapshot_is_structurally_valid_v2",
] as const;

const protectedFunctions = [
  "persist_adle_generic_daily_plan_v3",
  "persist_adle_specialist_daily_plan_v3",
  "complete_adle_release_bound_word_lab_v2",
  "persist_adle_base_word_family_pilot_v1",
  "persist_adle_base_word_family_pilot_v2",
  "complete_adle_base_word_family_pilot_v1",
  "complete_adle_base_word_family_pilot_v2",
  "adle_lesson_route_metadata_is_valid_v1",
  "adle_lesson_route_metadata_is_valid_v2",
  "adle_generic_lesson_snapshot_is_structurally_valid",
  "adle_lesson_snapshot_is_structurally_valid",
  "adle_generic_lesson_snapshot_is_structurally_valid_v3",
  "prevent_adle_lesson_route_metadata_update",
  "prevent_adle_compiled_lesson_snapshot_update",
  "materialize_resolved_stage_f_spelling_occurrence_source",
  "adle_authorize_parent_approval_exact_id_handoff",
  "adle_reconcile_parent_spelling_decision_r8d",
  "materialize_r8e_stage_f_historical_occurrence_source",
  "adle_authorize_governed_source_continuation",
  "publish_adle_teaching_dictionary_closure_v1",
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function currentGitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function localMigrationVersions(): string[] {
  return [...new Set(readdirSync(resolve(root, "supabase/migrations")).flatMap((name) => {
    const match = /^(\d{8}(?:\d{6})?)_.*\.sql$/u.exec(name);
    return match?.[1] ? [match[1]] : [];
  }))].sort();
}

function stableRows(rows: readonly Record<string, unknown>[]) {
  return [...rows].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const gitHead = currentGitHead();
  if (gitHead !== EXPECTED_PRODUCTION_SHA) {
    throw new Error(`E7A is pinned to ${EXPECTED_PRODUCTION_SHA}; current HEAD is ${gitHead}.`);
  }

  const connectionString = process.env.SUPABASE_DB_URL?.trim()
    ?? process.env.DATABASE_URL?.trim()
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim()
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim();
  if (!connectionString) throw new Error("Missing a supported read-only Production database URL.");
  const databaseUrl = new URL(connectionString);
  if (
    databaseUrl.hostname !== required("ADLE_PHASE_E_PRODUCTION_HOST")
    || !databaseUrl.username.includes(PRODUCTION_PROJECT_REF)
  ) {
    throw new Error("E7A is pinned to the acknowledged Production project.");
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const readOnly = await client.query<{ transaction_read_only: string }>("show transaction_read_only");
    if (readOnly.rows[0]?.transaction_read_only !== "on") {
      throw new Error("Database did not enter a read-only transaction.");
    }

    const allAuditedFunctions = [...candidateFunctions, ...protectedFunctions];
    const functions = await client.query<Record<string, unknown>>(`
      select
        proc.oid::text as oid,
        proc.proname as object_name,
        pg_get_function_identity_arguments(proc.oid) as identity_arguments,
        pg_get_function_result(proc.oid) as result_type,
        language.lanname as language,
        proc.prosecdef as security_definer,
        proc.provolatile as volatility,
        has_function_privilege('service_role', proc.oid, 'EXECUTE') as service_role_execute,
        has_function_privilege('authenticated', proc.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('anon', proc.oid, 'EXECUTE') as anon_execute,
        encode(digest(pg_get_functiondef(proc.oid), 'sha256'), 'hex') as definition_sha256
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      join pg_language language on language.oid = proc.prolang
      where namespace.nspname = 'public'
        and proc.proname = any($1::text[])
      order by proc.proname, pg_get_function_identity_arguments(proc.oid)
    `, [allAuditedFunctions]);

    const functionDefinitionReferences = await client.query<Record<string, unknown>>(`
      with audited(name) as (select unnest($1::text[])), definitions as (
        select proc.oid, proc.proname, pg_get_function_identity_arguments(proc.oid) identity_arguments,
          pg_get_functiondef(proc.oid) definition
        from pg_proc proc
        join pg_namespace namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'public'
      )
      select audited.name as referenced_object, definitions.proname as referencing_function,
        definitions.identity_arguments
      from audited
      join definitions on definitions.definition ~ ('(^|[^a-zA-Z0-9_])' || audited.name || '([^a-zA-Z0-9_]|$)')
      where definitions.proname <> audited.name
      order by audited.name, definitions.proname, definitions.identity_arguments
    `, [allAuditedFunctions]);

    const catalogDependencies = await client.query<Record<string, unknown>>(`
      select target.proname as referenced_object,
        dependent_ns.nspname as dependent_schema,
        dependent_proc.proname as dependent_function,
        pg_get_function_identity_arguments(dependent_proc.oid) as dependent_identity_arguments,
        dependency.deptype
      from pg_depend dependency
      join pg_proc target on target.oid = dependency.refobjid
      join pg_namespace target_ns on target_ns.oid = target.pronamespace
      join pg_proc dependent_proc on dependent_proc.oid = dependency.objid
      join pg_namespace dependent_ns on dependent_ns.oid = dependent_proc.pronamespace
      where target_ns.nspname = 'public'
        and target.proname = any($1::text[])
      order by target.proname, dependent_ns.nspname, dependent_proc.proname
    `, [allAuditedFunctions]);

    const assignmentColumns = await client.query<Record<string, unknown>>(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('daily_assignments', 'assignment_items')
      order by table_name, ordinal_position
    `);
    const assignmentConstraints = await client.query<Record<string, unknown>>(`
      select cls.relname as table_name, constraint_name.conname as object_name,
        constraint_name.contype as constraint_type,
        pg_get_constraintdef(constraint_name.oid, true) as definition
      from pg_constraint constraint_name
      join pg_class cls on cls.oid = constraint_name.conrelid
      join pg_namespace namespace on namespace.oid = cls.relnamespace
      where namespace.nspname = 'public'
        and cls.relname in ('daily_assignments', 'assignment_items')
      order by cls.relname, constraint_name.conname
    `);
    const assignmentIndexes = await client.query<Record<string, unknown>>(`
      select tablename as table_name, indexname as object_name, indexdef as definition
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('daily_assignments', 'assignment_items')
      order by tablename, indexname
    `);
    const assignmentTriggers = await client.query<Record<string, unknown>>(`
      select event_object_table as table_name, trigger_name as object_name,
        event_manipulation, action_timing, action_statement
      from information_schema.triggers
      where trigger_schema = 'public'
        and event_object_table in ('daily_assignments', 'assignment_items')
      order by event_object_table, trigger_name, event_manipulation
    `);
    const assignmentPolicies = await client.query<Record<string, unknown>>(`
      select tablename as table_name, policyname as object_name, permissive, roles, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and tablename in ('daily_assignments', 'assignment_items')
      order by tablename, policyname
    `);
    const assignmentGrants = await client.query<Record<string, unknown>>(`
      select table_name, grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('daily_assignments', 'assignment_items')
      order by table_name, grantee, privilege_type
    `);

    const dailyPractice = await client.query<Record<string, unknown>>(`
      with headers as (
        select * from public.daily_assignments where title = 'Daily spelling practice'
      )
      select
        (select count(*)::int from headers) as exact_title_headers,
        (select count(*)::int from public.daily_assignments where title ilike '%daily%practice%') as title_like_headers,
        (select count(*)::int from public.assignment_items where daily_assignment_id in (select id from headers)) as exact_title_items,
        (select count(*)::int from headers where status = 'completed') as completed_headers,
        (select min(created_at) from headers) as earliest_header,
        (select max(created_at) from headers) as latest_header,
        (select jsonb_object_agg(source, count) from (
          select coalesce(assignment_generation_source, '<null>') source, count(*)::int count
          from headers group by 1 order by 1
        ) sources) as generation_sources
    `);

    const dependencyCounts = await client.query<Record<string, unknown>>(`
      with adle_assignments as (
        select * from public.daily_assignments
        where assignment_generation_source like 'adle%' or title ilike 'ADLE%'
      )
      select
        count(*) filter (where assignment.compiled_review_snapshot is null
          and assignment.compiled_lesson_snapshot is null)::int
          as snapshot_null_lessons,
        count(*) filter (where assignment.compiled_review_snapshot is null
          and assignment.compiled_lesson_snapshot->>'snapshotSchemaVersion' = '3')::int
          as snapshot_v3_lessons,
        count(*) filter (where assignment.compiled_review_snapshot is null
          and assignment.compiled_lesson_snapshot->>'snapshotSchemaVersion' = '2')::int
          as generic_v2_lessons,
        (select count(*)::int from public.assignment_items
          where prompt_data::text like '%"pilotActivityId": "intro-root"%')
          as fixed_un_v1_lessons,
        (select count(*)::int from public.assignment_items
          where prompt_data::text like '%closedCompoundActivityId%')
          as closed_v1_lessons,
        count(*) filter (where assignment.compiled_lesson_snapshot is null
          and assignment.compiled_review_snapshot is null
          and assignment.lesson_route_metadata is null
          and assignment.assignment_generation_source = 'adle_composer_v1')::int
          as metadata_free_generic_assignments
      from adle_assignments assignment
    `);
    const historicalItemCounts = await client.query<Record<string, unknown>>(`
      with snapshotless as (
        select id from public.daily_assignments
        where compiled_review_snapshot is null and compiled_lesson_snapshot is null
          and (assignment_generation_source like 'adle%' or title ilike 'ADLE%')
      )
      select
        count(*) filter (where template_key = 'REVIEW_QUICK_SORT')::int as review_quick_sort,
        count(*) filter (where template_key = 'CONTROLLED_SPELLING')::int as controlled_spelling
      from public.assignment_items
      where daily_assignment_id in (select id from snapshotless)
    `);
    const snapshotInventory = await client.query<Record<string, unknown>>(`
      with lesson_assignments as (
        select * from public.daily_assignments
        where compiled_review_snapshot is null
          and (assignment_generation_source like 'adle%' or title ilike 'ADLE%')
      )
      select assignment_generation_source, status,
        coalesce(compiled_lesson_snapshot->>'snapshotSchemaVersion', 'snapshot_null') snapshot_version,
        coalesce(compiled_lesson_snapshot#>>'{route,routeId}', lesson_route_metadata#>>'{route,routeId}', 'metadata_free_generic') route_id,
        coalesce(compiled_lesson_snapshot#>>'{route,routeVersion}', lesson_route_metadata#>>'{route,routeVersion}', 'metadata_free') route_version,
        count(*)::int count
      from lesson_assignments
      group by 1, 2, 3, 4, 5
      order by 1, 2, 3, 4, 5
    `);
    const retainedRelationCounts = await client.query<Record<string, unknown>>(`
      select 'canonical_teaching_dictionary_compound_profiles' object_name, count(*)::int row_count
        from public.canonical_teaching_dictionary_compound_profiles
      union all select 'canonical_teaching_dictionary_compound_facts', count(*)::int
        from public.canonical_teaching_dictionary_compound_facts
      union all select 'adle_base_word_family_pilot_runs', count(*)::int
        from public.adle_base_word_family_pilot_runs
      order by object_name
    `);
    const scheduleCounts = await client.query<Record<string, unknown>>(`
      select
        count(*)::int as schedule_rows,
        count(*) filter (where row_status = 'active')::int as active_schedule_rows,
        count(*) filter (where row_status = 'active' and word_schedule_version is null)::int as active_legacy_bundle_rows,
        (select count(*)::int from public.adle_review_bundles where row_status = 'active') as active_bundles
      from public.adle_review_schedule_words
    `);

    const matchingRelations = await client.query<Record<string, unknown>>(`
      select namespace.nspname as schema_name, cls.relname as object_name,
        case cls.relkind when 'r' then 'table' when 'p' then 'partitioned table'
          when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence'
          else cls.relkind::text end as object_type,
        coalesce(stat.n_live_tup, 0)::bigint as estimated_rows
      from pg_class cls
      join pg_namespace namespace on namespace.oid = cls.relnamespace
      left join pg_stat_user_tables stat on stat.relid = cls.oid
      where namespace.nspname = 'public'
        and (cls.relname ilike '%adle%' or cls.relname ilike '%daily%practice%' or cls.relname ilike '%spelling%practice%')
      order by object_type, object_name
    `);

    const matchingFunctions = await client.query<Record<string, unknown>>(`
      select proc.proname as object_name, pg_get_function_identity_arguments(proc.oid) identity_arguments,
        has_function_privilege('service_role', proc.oid, 'EXECUTE') as service_role_execute
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and (proc.proname ilike '%adle%' or proc.proname ilike '%daily%practice%' or proc.proname ilike '%spelling%practice%')
      order by proc.proname, identity_arguments
    `);

    const cronAvailable = await client.query<{ cron_exists: boolean }>(`
      select to_regclass('cron.job') is not null as cron_exists
    `);
    const cronJobs = cronAvailable.rows[0]?.cron_exists
      ? await client.query<Record<string, unknown>>(`
          select jobid, schedule, command, nodename, database, username, active, jobname
          from cron.job
          where command ilike '%adle%' or command ilike '%daily%practice%' or command ilike '%spelling%practice%'
          order by jobid
        `)
      : { rows: [] as Record<string, unknown>[] };

    const trackFunctions = await client.query<{ track_functions: string }>("show track_functions");
    const functionStats = await client.query<Record<string, unknown>>(`
      select funcname as object_name, calls, total_time, self_time
      from pg_stat_user_functions
      where funcname = any($1::text[])
      order by funcname
    `, [allAuditedFunctions]);

    const childTables = await client.query<{ table_name: string }>(`
      select distinct table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'child_id'
        and (table_name like 'adle_%' or table_name in (
          'daily_assignments', 'assignment_items', 'learning_items',
          'child_word_treasures', 'child_word_treasure_events',
          'child_gold_coin_ledger_events', 'spelling_reward_states', 'spelling_reward_events'
        ))
      order by table_name
    `);
    const protectedState: Record<string, { count: number; sha256: string }> = {};
    for (const { table_name: tableName } of childTables.rows) {
      const rows = await client.query<Record<string, unknown>>(
        `select * from public.${quoteIdentifier(tableName)} where child_id = $1`,
        [GENUINE_CHILD_ID],
      );
      const stable = stableRows(rows.rows);
      protectedState[tableName] = { count: stable.length, sha256: sha256(stable) };
    }

    const reviewLinked = await client.query<Record<string, unknown>>(`
      select
        (select count(*)::int from public.adle_review_sessions where child_id = $1) as sessions,
        (select count(*)::int from public.adle_review_word_encounters encounter
          join public.adle_review_sessions session on session.id = encounter.review_session_id
          where session.child_id = $1) as encounters,
        (select count(*)::int from public.adle_review_repair_attempts repair
          join public.adle_review_word_encounters encounter on encounter.id = repair.review_encounter_id
          join public.adle_review_sessions session on session.id = encounter.review_session_id
          where session.child_id = $1) as repairs,
        (select count(*)::int from public.adle_review_completion_receipts receipt
          join public.adle_review_sessions session on session.id = receipt.review_session_id
          where session.child_id = $1) as receipts
    `, [GENUINE_CHILD_ID]);

    const localMigrations = localMigrationVersions();
    const remoteMigrations = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by version",
    );
    const remoteVersions = remoteMigrations.rows.map(({ version }) => version);
    const localSet = new Set(localMigrations);
    const remoteSet = new Set(remoteVersions);

    await client.query("commit");
    console.log(JSON.stringify({
      contractVersion: "adle_phase_e7a_database_cleanup_audit_v1",
      gitHead,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      mutationPerformed: false,
      auditedAt: new Date().toISOString(),
      invocationEvidence: {
        trackFunctions: trackFunctions.rows[0]?.track_functions,
        warning: "Function statistics are cumulative and are not sufficient alone to prove current application invocation.",
        rows: functionStats.rows,
      },
      functions: functions.rows,
      functionDefinitionReferences: functionDefinitionReferences.rows,
      catalogDependencies: catalogDependencies.rows,
      sharedAssignmentStorage: {
        columns: assignmentColumns.rows,
        constraints: assignmentConstraints.rows,
        indexes: assignmentIndexes.rows,
        triggers: assignmentTriggers.rows,
        policies: assignmentPolicies.rows,
        grants: assignmentGrants.rows,
      },
      dailyPractice: dailyPractice.rows[0],
      dependencyCounts: dependencyCounts.rows[0],
      historicalItemCounts: historicalItemCounts.rows[0],
      snapshotInventory: snapshotInventory.rows,
      retainedRelationCounts: retainedRelationCounts.rows,
      scheduleCounts: scheduleCounts.rows[0],
      matchingRelations: matchingRelations.rows,
      matchingFunctions: matchingFunctions.rows,
      cronJobs: cronJobs.rows,
      protectedBaseline: {
        genuineChildId: GENUINE_CHILD_ID,
        tables: protectedState,
        linkedReview: reviewLinked.rows[0],
      },
      migrationLedger: {
        localCount: localMigrations.length,
        remoteCount: remoteVersions.length,
        localOnly: localMigrations.filter((version) => !remoteSet.has(version)),
        remoteOnly: remoteVersions.filter((version) => !localSet.has(version)),
      },
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
