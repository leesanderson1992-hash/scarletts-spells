import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const MIGRATION_VERSION = "20261006190000";
const MIGRATION_NAME = "authentic_use_all_children_rollout";
const MIGRATION_PATH = new URL("../supabase/migrations/20261006190000_authentic_use_all_children_rollout.sql", import.meta.url);
const TEST_CHILD_ID = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!connectionString || new URL(connectionString).username.split(".").at(-1) !== PROJECT_REF) {
  throw new Error("Expected the reviewed Production database project");
}

const command = process.argv[2] ?? "status";
const migrationSource = readFileSync(MIGRATION_PATH, "utf8");
const migrationSql = migrationSource.replace(/^\s*--[^\n]*\n\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
const migrationSha256 = createHash("sha256").update(migrationSource).digest("hex");
const db = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function counts() {
  return (await db.query(`select
    (select count(*)::int from public.children where not is_archived) active_children,
    (select count(*)::int from public.authentic_use_controls where mode='enabled' and gold_enabled and proficiency_enabled) enabled_children,
    (select count(*)::int from public.task_submissions) submissions,
    (select count(*)::int from public.authentic_use_submission_chains) chains,
    (select count(*)::int from public.authentic_use_credits) credits,
    (select count(*)::int from public.authentic_use_deliveries) deliveries,
    (select count(*)::int from public.adle_authentic_use_events) adle_events,
    (select count(*)::int from public.child_word_treasure_events) treasure_events,
    (select count(*)::int from public.child_gold_bar_ledger_events) gold_ledger`)).rows[0];
}

async function status() {
  const migrationApplied = (await db.query(
    "select exists(select 1 from supabase_migrations.schema_migrations where version=$1) applied",
    [MIGRATION_VERSION],
  )).rows[0].applied;
  const hasRollout = (await db.query("select to_regclass('public.authentic_use_rollout') is not null present")).rows[0].present;
  const rollout = hasRollout ? (await db.query("select enabled,enabled_at from public.authentic_use_rollout where id")).rows[0] : null;
  return { projectRef: PROJECT_REF, migrationVersion: MIGRATION_VERSION, migrationSha256,
    migrationApplied, rollout, counts: await counts() };
}

await db.connect();
try {
  if (command === "status") {
    await db.query("begin read only");
    console.log(JSON.stringify(await status(), null, 2));
    await db.query("rollback");
  } else if (command === "release" || command === "simulate") {
    if (command === "release" && process.argv[3] !== "RELEASE_AUTHENTIC_USE_FOR_ALL_CHILDREN") {
      throw new Error("Explicit release command argument missing");
    }
    await db.query("begin");
    try {
      await db.query("set local lock_timeout='5s'; set local statement_timeout='90s'");
      await db.query("select pg_advisory_xact_lock(hashtextextended('authentic-use-all-children-rollout',0))");
      await db.query("lock table public.children, public.task_submissions in share row exclusive mode");
      const before = await status();
      if (before.migrationApplied || before.rollout) {
        throw new Error("Rollout schema already exists; inspect status before retrying");
      }
      if ((await db.query("select count(*)::int n from public.authentic_use_controls c join public.children ch on ch.id=c.child_id where c.parent_user_id<>ch.parent_user_id")).rows[0].n) {
        throw new Error("Existing child ownership mismatch");
      }
      const canaryCutoff = (await db.query(
        "select activation_cutoff from public.authentic_use_controls where child_id=$1 and mode='enabled'",
        [TEST_CHILD_ID],
      )).rows[0]?.activation_cutoff;
      if (!canaryCutoff) throw new Error("The tested child is not enabled");

      await db.query(migrationSql);
      const rolloutAt = (await db.query("select clock_timestamp() value")).rows[0].value;
      await db.query("update public.authentic_use_rollout set enabled=true,enabled_at=$1 where id", [rolloutAt]);
      await db.query(`insert into public.authentic_use_controls
          (child_id,parent_user_id,mode,gold_enabled,proficiency_enabled,activation_cutoff)
        select id,parent_user_id,'enabled',true,true,$1 from public.children where not is_archived
        on conflict (child_id) do update set
          parent_user_id=excluded.parent_user_id,mode='enabled',gold_enabled=true,proficiency_enabled=true,
          activation_cutoff=case when public.authentic_use_controls.mode='enabled'
            then public.authentic_use_controls.activation_cutoff else excluded.activation_cutoff end`, [rolloutAt]);
      const attached = (await db.query(`select coalesce(sum(public.backfill_authentic_use_chains_for_child(id)),0)::int n
        from public.children where not is_archived`)).rows[0].n;
      const missing = (await db.query(`select count(*)::int n from public.children ch
        left join public.authentic_use_controls c on c.child_id=ch.id
        where not ch.is_archived and (c.child_id is null or c.parent_user_id<>ch.parent_user_id
          or c.mode<>'enabled' or not c.gold_enabled or not c.proficiency_enabled)`)).rows[0].n;
      if (missing) throw new Error(`Active children missing enabled controls: ${missing}`);
      const after = await counts();
      for (const field of ["credits", "deliveries", "adle_events", "treasure_events", "gold_ledger"]) {
        if (after[field] !== before.counts[field]) throw new Error(`Historical award count changed: ${field}`);
      }
      const newCanaryCutoff = (await db.query(
        "select activation_cutoff from public.authentic_use_controls where child_id=$1", [TEST_CHILD_ID],
      )).rows[0]?.activation_cutoff;
      if (String(newCanaryCutoff) !== String(canaryCutoff)) throw new Error("Canary activation date changed");
      await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
        [MIGRATION_VERSION, MIGRATION_NAME, [migrationSql]]);
      await db.query(command === "release" ? "commit" : "rollback");
      console.log(JSON.stringify({ released: command === "release", simulated: command === "simulate", rolloutAt, attachedHistoricalSubmissions: attached,
        before: before.counts, after, migrationSha256 }, null, 2));
    } catch (error) {
      await db.query("rollback").catch(() => {});
      throw error;
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} finally {
  await db.end();
}
