import { createHash } from "node:crypto";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";

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

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const childId = option("--genuine-child-id")?.trim();
  if (!childId || !/^[0-9a-f-]{36}$/i.test(childId)) {
    throw new Error("Pass the verified genuine learner with --genuine-child-id <uuid>.");
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

    const protectedState: Record<string, { count: number; sha256: string }> = {};
    for (const { table_name: tableName } of tableResult.rows) {
      const rows = await client.query<Record<string, unknown>>(
        `select * from public.${quoteIdentifier(tableName)} where child_id = $1`,
        [childId],
      );
      const stable = stableRows(rows.rows);
      protectedState[tableName] = { count: stable.length, sha256: sha256(stable) };
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
      protectedState[name] = { count: rows.length, sha256: sha256(rows) };
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
          where assignment.compiled_lesson_snapshot->>'snapshotSchemaVersion' = 'generic_lesson_snapshot_v2')
          as generic_snapshot_v2_count
    `);

    const scheduleAuthority = await client.query(`
      select coalesce(word_schedule_version, 'legacy_bundle') as authority,
        count(*)::int as count
      from public.adle_review_schedule_words
      where row_status = 'active'
      group by coalesce(word_schedule_version, 'legacy_bundle')
      order by authority
    `);

    const learnerSnapshot = {
      contractVersion: "adle_phase_e_protected_learner_snapshot_v1",
      childId,
      protectedState,
    };
    const report = {
      contractVersion: "adle_phase_e_readonly_audit_v1",
      productionProjectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      mutationPerformed: false,
      dependencies: dependencies.rows[0],
      activeScheduleAuthority: scheduleAuthority.rows,
      genuineLearner: {
        childId,
        tableCount: Object.keys(protectedState).length,
        state: protectedState,
        aggregateSha256: sha256(learnerSnapshot),
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
