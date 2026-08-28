import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const EXPECTED_BASELINE_COMMIT = "62aaf4c34d7634234ff81f5a6548ef4eecf72753";
const AFFECTED_UNACTIVATED_PROOF_CHILD_ID = "8629d7b2-5770-48bd-b33d-b10e02d9c559";
const AUTHORISED_R7_REAL_CHILD_ID = "bfe4ece9-2419-4a15-93c0-fbfd4c552fa5";
const OTHER_REAL_CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const TEST_2_CHILD_ID = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
const root = resolve(import.meta.dirname, "..");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRows(rows: readonly Record<string, unknown>[]) {
  return [...rows].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function semanticProtectedRows(
  tableName: string,
  rows: readonly Record<string, unknown>[],
) {
  if (tableName !== "adle_canonical_intake_candidates") return stableRows(rows);
  return stableRows(rows.map((row) => {
    const semantic = { ...row };
    delete semantic.last_evaluated_at;
    delete semantic.next_retry_at;
    delete semantic.lock_version;
    delete semantic.updated_at;
    return semantic;
  }));
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

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const childId = option("--genuine-child-id")?.trim();
  const expectedBaselineCommit = option("--expected-baseline-commit")?.trim()
    ?? EXPECTED_BASELINE_COMMIT;
  if (!childId || !/^[0-9a-f-]{36}$/i.test(childId)) {
    throw new Error("Pass the verified genuine learner with --genuine-child-id <uuid>.");
  }
  if (!/^[0-9a-f]{40}$/i.test(expectedBaselineCommit)) {
    throw new Error("Pass a full Git SHA with --expected-baseline-commit <sha>.");
  }
  if (childId !== OTHER_REAL_CHILD_ID) {
    throw new Error("The supplied learner does not match the repository-governed genuine learner baseline.");
  }
  const gitHead = currentGitHead();
  if (gitHead !== expectedBaselineCommit) {
    throw new Error(`Phase E0 baseline drifted: expected ${expectedBaselineCommit}, received ${gitHead}.`);
  }

  const connectionString = process.env.SUPABASE_DB_URL?.trim()
    ?? process.env.DATABASE_URL?.trim()
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim()
    ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim();
  if (!connectionString) {
    throw new Error("Missing a supported read-only Production database URL.");
  }
  const databaseUrl = new URL(connectionString);
  const acknowledgedHost = required("ADLE_PHASE_E_PRODUCTION_HOST");
  if (
    databaseUrl.hostname !== acknowledgedHost ||
    !databaseUrl.username.includes(PRODUCTION_PROJECT_REF)
  ) {
    throw new Error("Phase E audit is pinned to the acknowledged Production project.");
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const readOnly = await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only",
    );
    if (readOnly.rows[0]?.transaction_read_only !== "on") {
      throw new Error("Database did not enter a read-only transaction.");
    }

    const child = await client.query(
      "select id, parent_user_id, is_archived from public.children where id = $1",
      [childId],
    );
    if (child.rowCount !== 1 || child.rows[0]?.is_archived === true) {
      throw new Error("Verified genuine learner was not found as an active child.");
    }

    const tableResult = await client.query<{ table_name: string }>(`
      select distinct table_name
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'child_id'
        and (
          table_name like 'adle_%'
          or table_name in (
            'daily_assignments', 'assignment_items', 'learning_items',
            'child_word_treasures', 'child_word_treasure_events',
            'child_gold_coin_ledger_events', 'spelling_reward_states',
            'spelling_reward_events'
          )
        )
      order by table_name
    `);

    const protectedState: Record<string, {
      count: number;
      rawSha256: string;
      semanticSha256: string;
    }> = {};
    for (const { table_name: tableName } of tableResult.rows) {
      const rows = await client.query<Record<string, unknown>>(
        `select * from public.${quoteIdentifier(tableName)} where child_id = $1`,
        [childId],
      );
      const stable = stableRows(rows.rows);
      protectedState[tableName] = {
        count: stable.length,
        rawSha256: sha256(stable),
        semanticSha256: sha256(semanticProtectedRows(tableName, stable)),
      };
    }

    const linkedQueries: Record<string, string> = {
      adle_review_word_encounters: `
        select encounter.* from public.adle_review_word_encounters encounter
        join public.adle_review_sessions session
          on session.id = encounter.review_session_id
        where session.child_id = $1`,
      adle_review_repair_attempts: `
        select repair.* from public.adle_review_repair_attempts repair
        join public.adle_review_word_encounters encounter
          on encounter.id = repair.review_encounter_id
        join public.adle_review_sessions session
          on session.id = encounter.review_session_id
        where session.child_id = $1`,
      adle_review_completion_receipts: `
        select receipt.* from public.adle_review_completion_receipts receipt
        join public.adle_review_sessions session
          on session.id = receipt.review_session_id
        where session.child_id = $1`,
      adle_assignment_attempt_event_routes: `
        select route.* from public.adle_assignment_attempt_event_routes route
        join public.adle_assignment_attempt_events event
          on event.id = route.attempt_event_id
        where event.child_id = $1`,
      adle_review_outcome_event_routes: `
        select route.* from public.adle_review_outcome_event_routes route
        join public.adle_review_outcome_events event
          on event.id = route.outcome_event_id
        where event.child_id = $1`,
      adle_review_schedule_word_routes: `
        select route.* from public.adle_review_schedule_word_routes route
        join public.adle_review_schedule_words schedule
          on schedule.id = route.schedule_word_id
        where schedule.child_id = $1`,
      adle_learning_item_sources: `
        select source.* from public.adle_learning_item_sources source
        join public.adle_learning_items item
          on item.id = source.learning_item_id
        where item.child_id = $1`,
      adle_review_parent_reviews: `
        select review.* from public.adle_review_parent_reviews review
        join public.adle_review_sessions session
          on session.id = review.review_session_id
        where session.child_id = $1`,
    };
    for (const [name, sql] of Object.entries(linkedQueries)) {
      const exists = await client.query<{ present: boolean }>(
        "select to_regclass($1) is not null as present",
        [`public.${name}`],
      );
      if (!exists.rows[0]?.present) continue;
      const rows = stableRows((await client.query<Record<string, unknown>>(sql, [childId])).rows);
      protectedState[name] = {
        count: rows.length,
        rawSha256: sha256(rows),
        semanticSha256: sha256(rows),
      };
    }

    const dependencies = await client.query(`
      with adle_assignments as (
        select assignment.*
        from public.daily_assignments assignment
        where assignment.assignment_generation_source like 'adle%'
           or assignment.title ilike 'ADLE%'
      ), daily_practice as (
        select assignment.id
        from public.daily_assignments assignment
        where assignment.title = 'Daily spelling practice'
      )
      select
        (select count(*)::int from adle_assignments) as adle_assignment_count,
        (select count(*)::int from adle_assignments
          where compiled_review_snapshot is null and compiled_lesson_snapshot is null)
          as snapshot_null_lesson_count,
        (select count(*)::int from adle_assignments
          where compiled_review_snapshot is null and compiled_lesson_snapshot is not null)
          as immutable_lesson_snapshot_count,
        (select count(*)::int from adle_assignments where compiled_review_snapshot is not null)
          as immutable_review_snapshot_count,
        (select count(*)::int from daily_practice) as daily_practice_header_count,
        (select count(*)::int from public.assignment_items item
          where item.daily_assignment_id in (select id from daily_practice))
          as daily_practice_item_count,
        (select count(*)::int from public.assignment_items item
          where item.prompt_data::text like '%closedCompoundActivityId%')
          as closed_compound_v1_item_count,
        (select count(*)::int from public.assignment_items item
          where item.prompt_data::text like '%"pilotActivityId": "intro-root"%')
          as fixed_un_v1_item_count,
        (select count(*)::int from public.daily_assignments assignment
          where assignment.compiled_lesson_snapshot->>'snapshotSchemaVersion' = '2')
          as generic_snapshot_v2_count
    `);

    const snapshotInventory = await client.query(`
      with lesson_assignments as (
        select assignment.*
        from public.daily_assignments assignment
        where assignment.compiled_review_snapshot is null
          and (
            assignment.assignment_generation_source like 'adle%'
            or assignment.title ilike 'ADLE%'
          )
      )
      select
        assignment_generation_source,
        status,
        coalesce(compiled_lesson_snapshot->>'snapshotSchemaVersion', 'snapshot_null')
          as snapshot_version,
        coalesce(
          compiled_lesson_snapshot#>>'{route,routeId}',
          lesson_route_metadata#>>'{route,routeId}',
          'metadata_free_generic'
        ) as route_id,
        coalesce(
          compiled_lesson_snapshot#>>'{route,routeVersion}',
          lesson_route_metadata#>>'{route,routeVersion}',
          'metadata_free'
        ) as route_version,
        count(*)::int as count
      from lesson_assignments
      group by 1, 2, 3, 4, 5
      order by 1, 2, 3, 4, 5
    `);

    const compatibilityDependencies = await client.query(`
      with snapshotless as (
        select id
        from public.daily_assignments
        where compiled_review_snapshot is null
          and compiled_lesson_snapshot is null
          and (
            assignment_generation_source like 'adle%'
            or title ilike 'ADLE%'
          )
      )
      select
        (select count(*)::int
           from public.daily_assignments assignment
          where assignment.compiled_review_snapshot is null
            and assignment.compiled_lesson_snapshot is null
            and assignment.lesson_route_metadata is null
            and assignment.assignment_generation_source = 'adle_composer_v1')
          as metadata_free_generic_assignment_count,
        count(*) filter (where item.template_key = 'REVIEW_QUICK_SORT')::int
          as review_quick_sort_item_count,
        count(*) filter (where item.template_key = 'CONTROLLED_SPELLING')::int
          as controlled_spelling_item_count,
        count(*) filter (where item.template_key in ('MUST_USE_FREEWRITING', 'REVIEW_MUST_USE_WRITING'))::int
          as historical_free_response_item_count,
        count(*) filter (where item.template_key is null)::int
          as metadata_free_item_count
      from public.assignment_items item
      where item.daily_assignment_id in (select id from snapshotless)
    `);

    const databaseFunctions = await client.query(`
      select
        proc.proname as function_name,
        pg_get_function_identity_arguments(proc.oid) as identity_arguments,
        has_function_privilege('service_role', proc.oid, 'EXECUTE') as service_role_execute
      from pg_proc proc
      join pg_namespace namespace on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = any($1::text[])
      order by proc.proname, pg_get_function_identity_arguments(proc.oid)
    `, [[
      "persist_adle_composed_daily_plan_v1",
      "persist_adle_generic_daily_plan_v2",
      "persist_adle_generic_daily_plan_v3",
      "persist_adle_specialist_daily_plan_v3",
      "complete_adle_base_word_family_pilot_v2",
      "materialize_resolved_stage_f_spelling_occurrence_source",
      "adle_authorize_parent_approval_exact_id_handoff",
      "adle_reconcile_parent_spelling_decision_r8d",
      "materialize_r8e_stage_f_historical_occurrence_source",
      "adle_authorize_governed_source_continuation",
    ]]);

    const scheduleAuthority = await client.query(`
      select coalesce(word_schedule_version, 'legacy_bundle') as authority,
        count(*)::int as count
      from public.adle_review_schedule_words
      where row_status = 'active'
      group by coalesce(word_schedule_version, 'legacy_bundle')
      order by authority
    `);

    const bundleAuthority = await client.query(`
      select row_status, bundle_status, schedule_policy_version, count(*)::int as count
      from public.adle_review_bundles
      group by row_status, bundle_status, schedule_policy_version
      order by row_status, bundle_status, schedule_policy_version
    `);

    const learnerDependencies = await client.query(`
      with governed_cohorts(child_id, classification, cleanup_authority) as (
        values
          ($1::uuid, 'AFFECTED_UNACTIVATED_PROOF', 'NOT_PROVEN_FOR_PHASE_E'),
          ($2::uuid, 'AUTHORISED_R7_REAL', 'PROTECTED_REAL'),
          ($3::uuid, 'GENUINE_REAL', 'PROTECTED_REAL'),
          ($4::uuid, 'TEST_2_RUNTIME', 'NO_CLEANUP_AUTHORITY')
      )
      select
        cohort.child_id,
        cohort.classification,
        cohort.cleanup_authority,
        (child.id is not null) as exists,
        coalesce(child.is_archived, false) as is_archived,
        (select count(*)::int from public.daily_assignments row
          where row.child_id = cohort.child_id
            and row.compiled_review_snapshot is null
            and (row.assignment_generation_source like 'adle%' or row.title ilike 'ADLE%'))
          as lesson_assignments,
        (select count(*)::int from public.daily_assignments row
          where row.child_id = cohort.child_id
            and row.compiled_review_snapshot is null
            and row.compiled_lesson_snapshot is null
            and (row.assignment_generation_source like 'adle%' or row.title ilike 'ADLE%'))
          as snapshot_null_lessons,
        (select count(*)::int from public.adle_learning_items row
          where row.child_id = cohort.child_id) as adle_learning_items,
        (select count(*)::int from public.adle_canonical_intake_candidates row
          where row.child_id = cohort.child_id) as canonical_intake_candidates,
        (select count(*)::int from public.adle_review_schedule_words row
          where row.child_id = cohort.child_id) as review_schedule_words,
        (select count(*)::int from public.child_word_treasures row
          where row.child_id = cohort.child_id) as word_treasures
      from governed_cohorts cohort
      left join public.children child on child.id = cohort.child_id
      order by cohort.classification
    `, [
      AFFECTED_UNACTIVATED_PROOF_CHILD_ID,
      AUTHORISED_R7_REAL_CHILD_ID,
      OTHER_REAL_CHILD_ID,
      TEST_2_CHILD_ID,
    ]);

    const wordTreasureCompatibilityDependencies = await client.query(`
      with governed_cohorts(child_id, classification) as (
        values
          ($1::uuid, 'AFFECTED_UNACTIVATED_PROOF'),
          ($2::uuid, 'AUTHORISED_R7_REAL'),
          ($3::uuid, 'GENUINE_REAL'),
          ($4::uuid, 'TEST_2_RUNTIME')
      ), learning_finalised as (
        select
          issue.id,
          issue.child_id,
          issue.parent_user_id,
          issue.source_misspelling_instance_id,
          issue.micro_skill_key,
          lower(trim(coalesce(
            issue.approved_replacement,
            issue.suggested_replacement,
            ''
          ))) as corrected_word_normalized
        from public.writing_issues issue
        where issue.issue_status = 'finalised'
          and issue.final_classification in (
            'fragile_knowledge',
            'concept_gap',
            'transfer_failure'
          )
      ), classified as (
        select
          issue.*,
          coalesce(cohort.classification, 'UNDOCUMENTED_PROTECTED')
            as learner_classification,
          exists (
            select 1
            from public.learning_items item
            where item.child_id = issue.child_id
              and item.parent_user_id = issue.parent_user_id
              and item.source_writing_issue_id = issue.id
          ) or exists (
            select 1
            from public.learning_item_issue_links link
            where link.child_id = issue.child_id
              and link.parent_user_id = issue.parent_user_id
              and link.writing_issue_id = issue.id
          ) as has_learning_item,
          exists (
            select 1
            from public.child_word_treasures treasure
            where treasure.child_id = issue.child_id
              and treasure.parent_user_id = issue.parent_user_id
              and (
                treasure.source_issue_id = issue.id
                or (
                  issue.corrected_word_normalized <> ''
                  and treasure.corrected_word_normalized =
                    issue.corrected_word_normalized
                )
              )
          ) as has_word_treasure,
          exists (
            select 1
            from public.parent_verified_spelling_candidate_mappings mapping
            where mapping.child_id = issue.child_id
              and mapping.parent_user_id = issue.parent_user_id
              and mapping.source_misspelling_instance_id =
                issue.source_misspelling_instance_id
              and mapping.micro_skill_key = issue.micro_skill_key
              and mapping.candidate_status in (
                'pending_parent_promotion',
                'parent_local_promoted',
                'admin_review_requested'
              )
          ) as has_route_mapping
        from learning_finalised issue
        left join governed_cohorts cohort on cohort.child_id = issue.child_id
      ), grouped as (
        select
          learner_classification,
          count(*)::int as finalised_learning_relevant,
          count(*) filter (where has_learning_item)::int as with_learning_item,
          count(*) filter (where not has_learning_item)::int as missing_learning_item,
          count(*) filter (where has_word_treasure)::int as with_word_treasure,
          count(*) filter (where not has_word_treasure)::int as missing_word_treasure,
          count(*) filter (
            where has_learning_item and not has_word_treasure
          )::int as linked_item_missing_treasure,
          count(*) filter (
            where has_route_mapping and has_learning_item and not has_word_treasure
          )::int as routed_linked_item_missing_treasure,
          count(*) filter (
            where has_route_mapping and not has_learning_item
          )::int as routed_missing_learning_item,
          count(*) filter (where has_route_mapping)::int as with_route_mapping
        from classified
        group by learner_classification
      ), totals as (
        select
          'TOTAL_PRODUCTION'::text as learner_classification,
          count(*)::int as finalised_learning_relevant,
          count(*) filter (where has_learning_item)::int as with_learning_item,
          count(*) filter (where not has_learning_item)::int as missing_learning_item,
          count(*) filter (where has_word_treasure)::int as with_word_treasure,
          count(*) filter (where not has_word_treasure)::int as missing_word_treasure,
          count(*) filter (
            where has_learning_item and not has_word_treasure
          )::int as linked_item_missing_treasure,
          count(*) filter (
            where has_route_mapping and has_learning_item and not has_word_treasure
          )::int as routed_linked_item_missing_treasure,
          count(*) filter (
            where has_route_mapping and not has_learning_item
          )::int as routed_missing_learning_item,
          count(*) filter (where has_route_mapping)::int as with_route_mapping
        from classified
      )
      select * from grouped
      union all
      select * from totals
      order by learner_classification
    `, [
      AFFECTED_UNACTIVATED_PROOF_CHILD_ID,
      AUTHORISED_R7_REAL_CHILD_ID,
      OTHER_REAL_CHILD_ID,
      TEST_2_CHILD_ID,
    ]);

    const r8IntakeState = await client.query(`
      select candidate_state, count(*)::int as count
      from public.adle_canonical_intake_candidates
      group by candidate_state
      order by candidate_state
    `);
    const r8SourceHandoffState = await client.query(`
      select coalesce(canonical_intake_handoff_state, 'legacy_null') as handoff_state,
        count(*)::int as count
      from public.parent_verified_spelling_candidate_mappings
      group by coalesce(canonical_intake_handoff_state, 'legacy_null')
      order by handoff_state
    `);
    const r8Lineage = await client.query(`
      select row_status, count(*)::int as count
      from public.adle_learning_item_sources
      group by row_status
      order by row_status
    `);

    const localMigrations = localMigrationVersions();
    const productionMigrations = await client.query<{ version: string }>(`
      select version
      from supabase_migrations.schema_migrations
      order by version
    `);
    const productionMigrationSet = new Set(productionMigrations.rows.map((row) => row.version));
    const localMigrationSet = new Set(localMigrations);
    const pendingMigrations = localMigrations.filter((version) => !productionMigrationSet.has(version));
    const productionOnlyMigrations = productionMigrations.rows
      .map((row) => row.version)
      .filter((version) => !localMigrationSet.has(version));

    const eligibilityRows = stableRows((await client.query<Record<string, unknown>>(`
      select 'lesson' as authority, id, canonical_word_id, micro_skill_key,
        item_status as status, row_status, intake_on as due_on,
        null::int as catch_up_stage, null::text as schedule_version
      from public.adle_learning_items
      where child_id = $1
      union all
      select 'review' as authority, id, canonical_word_id, null::text as micro_skill_key,
        membership_status as status, row_status,
        coalesce(word_next_due_on, next_retest_due_on, pre_retirement_check_due_on) as due_on,
        catch_up_stage, word_schedule_version as schedule_version
      from public.adle_review_schedule_words
      where child_id = $1
      order by authority, id
    `, [childId])).rows);

    const learnerSnapshot = {
      contractVersion: "adle_phase_e_protected_learner_snapshot_v2",
      childId,
      protectedState,
      eligibilityProjectionSha256: sha256(eligibilityRows),
    };
    const semanticLearnerSnapshot = {
      contractVersion: "adle_phase_e_protected_learner_semantic_snapshot_v1",
      childId,
      protectedState: Object.fromEntries(Object.entries(protectedState).map(([name, state]) => [
        name,
        { count: state.count, semanticSha256: state.semanticSha256 },
      ])),
      eligibilityProjectionSha256: sha256(eligibilityRows),
    };
    const report = {
      contractVersion: "adle_phase_e_readonly_audit_v3_r8_complete",
      baselineCommit: gitHead,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      mutationPerformed: false,
      dependencies: dependencies.rows[0],
      lessonSnapshotInventory: snapshotInventory.rows,
      historicalCompatibilityDependencies: compatibilityDependencies.rows[0],
      databaseFunctions: databaseFunctions.rows,
      activeScheduleAuthority: scheduleAuthority.rows,
      reviewBundleAuthority: bundleAuthority.rows,
      learnerDependencies: learnerDependencies.rows,
      wordTreasureCompatibilityDependencies:
        wordTreasureCompatibilityDependencies.rows,
      r8Authorities: {
        intakeCandidateState: r8IntakeState.rows,
        governedSourceHandoffState: r8SourceHandoffState.rows,
        learningItemLineageState: r8Lineage.rows,
      },
      migrationLedger: {
        localMigrationCount: localMigrations.length,
        productionMigrationCount: productionMigrations.rowCount,
        pendingMigrations,
        productionOnlyMigrations,
        aligned: pendingMigrations.length === 0 && productionOnlyMigrations.length === 0,
      },
      genuineLearner: {
        childId,
        tableCount: Object.keys(protectedState).length,
        state: protectedState,
        eligibilityProjectionSha256: sha256(eligibilityRows),
        rawAggregateSha256: sha256(learnerSnapshot),
        semanticAggregateSha256: sha256(semanticLearnerSnapshot),
        semanticHashExclusions: {
          adle_canonical_intake_candidates: [
            "last_evaluated_at",
            "next_retry_at",
            "lock_version",
            "updated_at",
          ],
        },
      },
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    await client.query("rollback");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
