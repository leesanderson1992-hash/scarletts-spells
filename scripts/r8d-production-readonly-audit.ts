import { existsSync, readFileSync } from "node:fs";

import pg from "pg";

const CONFIRMATION = "AUDIT_R8D_PRODUCTION_READ_ONLY";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const AFFECTED_UNACTIVATED_CHILD_ID = "8629d7b2-5770-48bd-b33d-b10e02d9c559";

if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing production audit without: -- ${CONFIRMATION}`);
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

async function main(): Promise<void> {
  const externalEnv = process.env.R8D_PRODUCTION_ENV_FILE?.trim();
  if (externalEnv) loadEnvFile(externalEnv);
  loadEnvFile(".env.local");
  const connectionString =
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED?.trim() ??
    process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION?.trim();
  if (!connectionString) {
    throw new Error("Missing a supported production database URL.");
  }
  const parsed = new URL(connectionString);
  if (!parsed.username.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("R8D audit is not pointed at the expected production project.");
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
      throw new Error("Production transaction is not read-only.");
    }

    const migrations = await client.query<{ version: string }>(
      `select version
         from supabase_migrations.schema_migrations
        where version = any($1::text[])
        order by version`,
      [["20260828120000", "20260828130000", "20260828140000"]],
    );
    const versions = migrations.rows.map((row) => row.version);
    if (
      !versions.includes("20260828120000") ||
      !versions.includes("20260828130000") ||
      versions.includes("20260828140000")
    ) {
      throw new Error(`Unexpected R8 production baseline: ${versions.join(",")}`);
    }

    const omissions = await client.query<{
      target: string;
      governed_source_count: number;
    }>(
      `select target.target,
          count(source.id)::int as governed_source_count
         from unnest(array['football','replay']::text[]) target(target)
         left join public.writing_issues issue
           on issue.child_id = $1::uuid
          and issue.issue_status = 'finalised'
          and issue.final_classification in (
            'fragile_knowledge','concept_gap','transfer_failure'
          )
          and lower(btrim(coalesce(
            nullif(issue.approved_replacement,''),
            nullif(issue.suggested_replacement,'')
          ))) = target.target
         left join public.parent_verified_spelling_candidate_mappings source
           on source.parent_user_id = issue.parent_user_id
          and source.child_id = issue.child_id
          and source.source_misspelling_instance_id = issue.source_misspelling_instance_id
        group by target.target
        order by target.target`,
      [AFFECTED_UNACTIVATED_CHILD_ID],
    );
    if (
      omissions.rows.length !== 2 ||
      omissions.rows.some((row) => row.governed_source_count !== 0)
    ) {
      throw new Error("Known historical football/replay omissions changed unexpectedly.");
    }

    const population = await client.query<{
      activated_sources_total: number;
      activated_legacy_null_sources: number;
      activated_explicit_r8c_sources: number;
      consumed_legacy_null_sources: number;
      consumed_legacy_null_sources_protected_by_r8d: number;
      released_r8c_candidate_bypass_population: number;
      r8d_unguarded_candidate_sources: number;
      r8d_unguarded_writing_issue_occurrences: number;
    }>(`
      with source_population as (
        select
          candidate.id,
          candidate.source_misspelling_instance_id,
          candidate.canonical_intake_handoff_state,
          exists (
            select 1
            from public.adle_canonical_intake_candidates intake
            where intake.source_candidate_mapping_id = candidate.id
          ) as has_durable_intake,
          exists (
            select 1
            from public.adle_learning_item_sources lineage
            where lineage.parent_verified_candidate_mapping_id = candidate.id
          ) as has_durable_lineage,
          exists (
            select 1
            from public.adle_canonical_intake_candidates intake
            where intake.source_candidate_mapping_id = candidate.id
              and intake.candidate_state = 'activated'
          ) and exists (
            select 1
            from public.adle_learning_item_sources lineage
            where lineage.parent_verified_candidate_mapping_id = candidate.id
              and lineage.row_status = 'active'
          ) as is_activated,
          (
            candidate.canonical_intake_handoff_state is not null
            or exists (
              select 1
              from public.adle_canonical_intake_candidates intake
              where intake.source_candidate_mapping_id = candidate.id
            )
            or exists (
              select 1
              from public.adle_learning_item_sources lineage
              where lineage.parent_verified_candidate_mapping_id = candidate.id
            )
          ) as protected_by_r8d
        from public.parent_verified_spelling_candidate_mappings candidate
        where candidate.candidate_status in (
          'parent_local_promoted', 'global_canonical_promoted'
        )
      ), consumed as (
        select *
        from source_population
        where canonical_intake_handoff_state is not null
          or has_durable_intake
          or has_durable_lineage
      )
      select
        count(*) filter (where is_activated)::int
          as activated_sources_total,
        count(*) filter (
          where is_activated and canonical_intake_handoff_state is null
        )::int as activated_legacy_null_sources,
        count(*) filter (
          where is_activated
            and canonical_intake_handoff_state = 'r8c_exact_id_handed_off'
        )::int as activated_explicit_r8c_sources,
        (select count(*)::int from consumed
          where canonical_intake_handoff_state is null)
          as consumed_legacy_null_sources,
        (select count(*)::int from consumed
          where canonical_intake_handoff_state is null
            and protected_by_r8d)
          as consumed_legacy_null_sources_protected_by_r8d,
        (select count(*)::int from consumed
          where canonical_intake_handoff_state is null)
          as released_r8c_candidate_bypass_population,
        (select count(*)::int from consumed
          where not protected_by_r8d)
          as r8d_unguarded_candidate_sources,
        (select count(distinct source_misspelling_instance_id)::int
          from consumed
          where source_misspelling_instance_id is not null
            and not protected_by_r8d)
          as r8d_unguarded_writing_issue_occurrences
      from source_population
    `);
    const sourcePopulation = population.rows[0];
    if (!sourcePopulation) {
      throw new Error("Production source population audit returned no row.");
    }
    if (
      sourcePopulation.consumed_legacy_null_sources !==
        sourcePopulation.consumed_legacy_null_sources_protected_by_r8d ||
      sourcePopulation.r8d_unguarded_candidate_sources !== 0 ||
      sourcePopulation.r8d_unguarded_writing_issue_occurrences !== 0
    ) {
      throw new Error(
        `Remediated R8D predicate leaves unguarded production sources: ${JSON.stringify(sourcePopulation)}`,
      );
    }

    const r8dSchema = await client.query<{
      reconciliation_table_present: boolean;
      authority_version_present: boolean;
    }>(`
      select
        to_regclass('public.adle_spelling_decision_reconciliations') is not null
          as reconciliation_table_present,
        exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'parent_verified_spelling_candidate_mappings'
            and column_name = 'authority_version'
        ) as authority_version_present
    `);
    if (
      r8dSchema.rows[0]?.reconciliation_table_present ||
      r8dSchema.rows[0]?.authority_version_present
    ) {
      throw new Error("R8D schema is unexpectedly present in production.");
    }

    await client.query("rollback");
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "PASS",
          productionProjectRef: PRODUCTION_PROJECT_REF,
          transactionReadOnly: true,
          mutationPerformed: false,
          releasedMigrations: {
            r8b: true,
            r8c: true,
            r8d: false,
          },
          historicalOmissions: Object.fromEntries(
            omissions.rows.map((row) => [row.target, row.governed_source_count]),
          ),
          sourcePopulation,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
