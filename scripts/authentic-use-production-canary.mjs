import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const TEST_CHILD_ID = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
const MIGRATION_VERSION = "20261005120000";
const MIGRATION_NAME = "add_first_submission_authentic_use";
const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261005120000_add_first_submission_authentic_use.sql",
  import.meta.url,
);

const command = process.argv[2] ?? "status";
const confirmation = process.argv[3];
const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!connectionString) throw new Error("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED is required");
const connection = new URL(connectionString);
if (connection.username.split(".").at(-1) !== PROJECT_REF) {
  throw new Error("Production database project mismatch");
}

const rawMigration = readFileSync(MIGRATION_PATH, "utf8");
const migrationSql = rawMigration.replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
const migrationSha256 = createHash("sha256").update(rawMigration).digest("hex");
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function facts() {
  const child = (
    await db.query("select id,parent_user_id from public.children where id=$1", [TEST_CHILD_ID])
  ).rows[0];
  if (!child) throw new Error("Named test child does not exist in Production");
  const migration = (
    await db.query(
      "select exists(select 1 from supabase_migrations.schema_migrations where version=$1) applied",
      [MIGRATION_VERSION],
    )
  ).rows[0].applied;
  const objects = (
    await db.query(
      "select to_regclass('public.authentic_use_controls') is not null controls, to_regprocedure('public.finalise_authentic_use_parent_action(uuid,uuid,text,text)') is not null finaliser",
    )
  ).rows[0];
  const submissions = (
    await db.query(
      "select count(*)::int total,count(distinct task_id)::int task_chains,count(*) filter(where parent_review_status='pending')::int pending from public.task_submissions where child_id=$1",
      [TEST_CHILD_ID],
    )
  ).rows[0];
  let canary = null;
  if (objects.controls) {
    canary = (
      await db.query(
        `select c.mode,c.gold_enabled,c.proficiency_enabled,c.activation_cutoff,
          (select count(*)::int from public.authentic_use_submission_chains x where x.child_id=c.child_id) indexed_chains,
          (select count(*)::int from public.authentic_use_credits x where x.child_id=c.child_id) credits,
          (select count(*)::int from public.authentic_use_deliveries x where x.child_id=c.child_id and x.status in ('pending','failed','processing')) open_deliveries
        from public.authentic_use_controls c where c.child_id=$1`,
        [TEST_CHILD_ID],
      )
    ).rows[0] ?? null;
  }
  return { projectRef: PROJECT_REF, childId: TEST_CHILD_ID, migrationSha256, migrationApplied: migration, objects, submissions, canary };
}

function requireConfirmation(expected) {
  if (confirmation !== expected) throw new Error(`Confirmation argument must be exactly: ${expected}`);
}

await db.connect();
try {
  if (command === "status") {
    await db.query("begin read only");
    const result = await facts();
    await db.query("rollback");
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "apply-schema") {
    requireConfirmation("APPLY_AUTHENTIC_USE_SCHEMA_TO_PRODUCTION");
    await db.query("begin");
    try {
      await db.query("select pg_advisory_xact_lock(hashtextextended('authentic-use-production-migration',0))");
      const before = await facts();
      if (before.migrationApplied || before.objects.controls || before.objects.finaliser) {
        throw new Error("Migration or authentic-use objects already exist");
      }
      const protectedCounts = (
        await db.query(`select
          (select count(*)::bigint from public.task_submissions) submissions,
          (select count(*)::bigint from public.adle_authentic_use_events) authentic_events,
          (select count(*)::bigint from public.child_word_treasure_events) treasure_events,
          (select count(*)::bigint from public.child_gold_bar_ledger_events) gold_ledger`)
      ).rows[0];
      await db.query("set local lock_timeout='3s'; set local statement_timeout='60s'");
      await db.query(migrationSql);
      const empty = (
        await db.query(`select
          (select count(*)::int from public.authentic_use_controls) controls,
          (select count(*)::int from public.authentic_use_submission_chains) chains,
          (select count(*)::int from public.authentic_use_credits) credits`)
      ).rows[0];
      if (empty.controls !== 0 || empty.chains !== 0 || empty.credits !== 0) {
        throw new Error("Default-off schema created canary data");
      }
      const afterProtected = (
        await db.query(`select
          (select count(*)::bigint from public.task_submissions) submissions,
          (select count(*)::bigint from public.adle_authentic_use_events) authentic_events,
          (select count(*)::bigint from public.child_word_treasure_events) treasure_events,
          (select count(*)::bigint from public.child_gold_bar_ledger_events) gold_ledger`)
      ).rows[0];
      if (JSON.stringify(protectedCounts) !== JSON.stringify(afterProtected)) {
        throw new Error("Protected business row counts changed during schema application");
      }
      await db.query(
        "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
        [MIGRATION_VERSION, MIGRATION_NAME, [migrationSql]],
      );
      await db.query("commit");
      console.log(JSON.stringify({ applied: true, version: MIGRATION_VERSION, migrationSha256, defaultOff: true }, null, 2));
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    }
  } else if (command === "activate-shadow") {
    requireConfirmation("ACTIVATE_AUTHENTIC_USE_SHADOW_FOR_TEST_CHILD");
    await db.query("begin");
    try {
      const before = await facts();
      if (!before.migrationApplied || !before.objects.controls || !before.objects.finaliser) throw new Error("Schema is not installed");
      const parent = (await db.query("select parent_user_id from public.children where id=$1", [TEST_CHILD_ID])).rows[0].parent_user_id;
      await db.query(
        `insert into public.authentic_use_controls(child_id,parent_user_id,mode,gold_enabled,proficiency_enabled,activation_cutoff)
         values($1,$2,'shadow',false,false,clock_timestamp())
         on conflict(child_id) do update set parent_user_id=excluded.parent_user_id,mode='shadow',gold_enabled=false,proficiency_enabled=false,activation_cutoff=clock_timestamp()`,
        [TEST_CHILD_ID, parent],
      );
      const attached = (await db.query("select public.backfill_authentic_use_chains_for_child($1) attached", [TEST_CHILD_ID])).rows[0].attached;
      await db.query("commit");
      console.log(JSON.stringify({ childId: TEST_CHILD_ID, mode: "shadow", consumers: "disabled", attachedSubmissions: attached }, null, 2));
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    }
  } else if (command === "enable") {
    requireConfirmation("ENABLE_AUTHENTIC_USE_FOR_TEST_CHILD");
    const updated = await db.query(
      `update public.authentic_use_controls set mode='enabled',gold_enabled=true,proficiency_enabled=true
       where child_id=$1 and mode='shadow' returning child_id`,
      [TEST_CHILD_ID],
    );
    if (updated.rowCount !== 1) throw new Error("Test child must be in shadow mode before enablement");
    console.log(JSON.stringify({ childId: TEST_CHILD_ID, mode: "enabled", goldEnabled: true, proficiencyEnabled: true }, null, 2));
  } else if (command === "disable") {
    requireConfirmation("DISABLE_AUTHENTIC_USE_FOR_TEST_CHILD");
    const updated = await db.query(
      "update public.authentic_use_controls set mode='off',gold_enabled=false,proficiency_enabled=false where child_id=$1 returning child_id",
      [TEST_CHILD_ID],
    );
    if (updated.rowCount !== 1) throw new Error("Test child has no canary control");
    console.log(JSON.stringify({ childId: TEST_CHILD_ID, mode: "off", consumers: "disabled" }, null, 2));
  } else {
    throw new Error("Use status, apply-schema, activate-shadow, enable, or disable");
  }
} finally {
  await db.end();
}
