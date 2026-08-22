#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import pg from "pg";

const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const VERSION = "20260822190000";
const NAME = "reconcile_adle_generic_snapshot_persistence_v2_v3";
const FILE = resolve(`supabase/migrations/${VERSION}_${NAME}.sql`);
const DATABASE_URL_ENV = "ADLE_GENERIC_SNAPSHOT_STAGING_DATABASE_URL";
const APPROVAL_ENV = "D2A_STAGING_SNAPSHOT_BASELINE_APPROVAL";

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) throw new Error(`Missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (
    !parsed.username.includes(STAGING_PROJECT_REF)
    || identity.includes(PRODUCTION_PROJECT_REF)
    || !parsed.hostname.endsWith("pooler.supabase.com")
  ) {
    throw new Error(`D2A staging migration requires pinned staging ${STAGING_PROJECT_REF}`);
  }
  return value;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_");
}

function redact(output: string, connection: string): string {
  const password = decodeURIComponent(new URL(connection).password);
  return password ? output.replaceAll(password, "[REDACTED]") : output;
}

async function baseline(client: pg.Client): Promise<{ assignments: string; snapshots: string; versions: Record<string, number> }> {
  const result = await client.query<{ assignments: string; snapshots: string; versions: Record<string, number> }>(`
    select count(*)::text as assignments,
      count(compiled_lesson_snapshot)::text as snapshots,
      coalesce((
        select jsonb_object_agg(version, amount)
        from (
          select compiled_lesson_snapshot->>'snapshotSchemaVersion' as version, count(*)::int as amount
          from public.daily_assignments
          where compiled_lesson_snapshot is not null
          group by compiled_lesson_snapshot->>'snapshotSchemaVersion'
        ) distribution
      ), '{}'::jsonb) as versions
    from public.daily_assignments
  `);
  if (!result.rows[0]) throw new Error("Staging baseline query returned no row");
  return result.rows[0];
}

async function main(): Promise<void> {
  if (process.argv[process.argv.indexOf("--environment") + 1] !== "staging") {
    throw new Error("Use --environment staging");
  }
  const apply = process.argv.includes("--apply");
  const mergedSha = process.argv[process.argv.indexOf("--merged-sha") + 1];
  const approvedMigrationSha256 = process.argv[process.argv.indexOf("--migration-sha256") + 1];
  const connection = databaseUrl();
  const sql = readFileSync(FILE, "utf8");
  const migrationSha256 = createHash("sha256").update(sql).digest("hex");
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" });
  const currentSha = git.status === 0 ? git.stdout.trim() : "";
  if (!/^[a-f0-9]{40}$/.test(mergedSha ?? "") || mergedSha !== currentSha) {
    throw new Error("--merged-sha must be the exact checked-out merged commit SHA");
  }
  if (approvedMigrationSha256 !== migrationSha256) {
    throw new Error(`--migration-sha256 must equal ${migrationSha256}`);
  }
  const confirmation = [
    "D2A-STAGING-SNAPSHOT-BASELINE",
    STAGING_PROJECT_REF,
    mergedSha,
    basename(FILE),
    migrationSha256,
    "SCHEMA-ONLY-NO-BACKFILL-NO-WRITER-ENABLEMENT",
  ].join(":");
  if (apply && (
    process.argv[process.argv.indexOf("--confirm") + 1] !== confirmation
    || process.env[APPROVAL_ENV] !== confirmation
  )) {
    throw new Error(`Apply requires --confirm '${confirmation}' and ${APPROVAL_ENV}='${confirmation}'`);
  }

  const client = new pg.Client({ connectionString: connection, ssl: { rejectUnauthorized: false } });
  let workdir: string | null = null;
  await client.connect();
  try {
    await client.query("begin read only");
    const identity = await client.query<{
      database_name: string;
      target_applied: boolean;
      snapshot_column: boolean;
      v2_validator: boolean;
      v2_rpc: boolean;
      v3_rpc: boolean;
    }>(`
      select current_database() as database_name,
        exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}') as target_applied,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='daily_assignments' and column_name='compiled_lesson_snapshot') as snapshot_column,
        to_regprocedure('public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)') is not null as v2_validator,
        to_regprocedure('public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null as v2_rpc,
        to_regprocedure('public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null as v3_rpc
    `);
    const before = identity.rows[0];
    if (!before || before.database_name !== "postgres") throw new Error("Unexpected staging database identity");
    if (before.target_applied) {
      if (!before.snapshot_column || !before.v2_validator || !before.v2_rpc || !before.v3_rpc) {
        throw new Error("D2A staging ledger and schema disagree");
      }
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "already_applied", projectRef: STAGING_PROJECT_REF, migrationSha256, mutationPerformed: false }, null, 2));
      return;
    }
    const repositoryLike = before.snapshot_column && before.v2_validator && before.v2_rpc && !before.v3_rpc;
    const productionLike = !before.snapshot_column && !before.v2_validator && !before.v2_rpc && !before.v3_rpc;
    if (!repositoryLike && !productionLike) throw new Error(`Unexpected partial staging topology: ${JSON.stringify(before)}`);
    const beforeDistribution = before.snapshot_column
      ? await baseline(client)
      : { assignments: (await client.query<{ count: string }>("select count(*)::text as count from public.daily_assignments")).rows[0]?.count ?? "", snapshots: "0", versions: {} };
    const ledger = await client.query<{ version: string; name: string }>(
      "select version, name from supabase_migrations.schema_migrations order by version, name",
    );
    await client.query("rollback");
    console.log(JSON.stringify({
      mode: "read_only_preflight",
      projectRef: STAGING_PROJECT_REF,
      topology: repositoryLike ? "repository-like" : "production-like",
      targetApplied: false,
      baseline: beforeDistribution,
      mutationPerformed: false,
    }, null, 2));

    workdir = mkdtempSync(join(tmpdir(), "adle-d2a-staging-migration-"));
    const migrations = join(workdir, "supabase", "migrations");
    mkdirSync(migrations, { recursive: true });
    writeFileSync(join(workdir, "supabase", "config.toml"), `project_id = "${STAGING_PROJECT_REF}"\n`);
    for (const row of ledger.rows) {
      writeFileSync(join(migrations, `${row.version}_${safeName(row.name)}.sql`), `-- Mirrored staging ledger ${row.version}; intentionally empty.\n`);
    }
    writeFileSync(join(migrations, basename(FILE)), sql);
    const result = spawnSync("npx", [
      "--yes", "--cache", join(workdir, ".npm-cache"),
      "supabase@2.115.0", "db", "push",
      ...(apply ? [] : ["--dry-run"]),
      "--db-url", connection,
      "--workdir", workdir,
      ...(apply ? ["--yes"] : []),
    ], { cwd: resolve("."), encoding: "utf8", maxBuffer: 20_000_000 });
    const output = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`, connection);
    process.stdout.write(output);
    if (result.status !== 0) throw new Error(`D2A staging ${apply ? "apply" : "dry run"} failed`);
    const selected = [...output.matchAll(/20\d{12}_[a-zA-Z0-9_]+[.]sql/g)].map((match) => match[0]);
    if (!selected.includes(basename(FILE)) || selected.some((file) => file !== basename(FILE))) {
      throw new Error(`Expected only ${basename(FILE)}; selected ${selected.join(", ")}`);
    }
    if (!apply) {
      console.log(JSON.stringify({ mode: "dry_run", projectRef: STAGING_PROJECT_REF, selectedMigration: basename(FILE), migrationSha256, requiredApplyConfirmation: confirmation, mutationPerformed: false }, null, 2));
      return;
    }

    const after = await client.query<Record<string, boolean>>(`
      select
        exists(select 1 from supabase_migrations.schema_migrations where version='${VERSION}' and name='${NAME}') as ledger_applied,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='daily_assignments' and column_name='compiled_lesson_snapshot' and is_nullable='YES') as nullable_column,
        exists(select 1 from pg_constraint where conname='daily_assignments_compiled_lesson_snapshot_versioned_check') as versioned_constraint,
        exists(select 1 from pg_trigger where tgname='daily_assignments_compiled_lesson_snapshot_immutable' and not tgisinternal) as immutable_trigger,
        to_regclass('public.daily_assignments_compiled_snapshot_version_idx') is not null as version_index,
        to_regprocedure('public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null as v2_rpc,
        to_regprocedure('public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null as v3_rpc,
        has_function_privilege('service_role','public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)','EXECUTE') as service_v3_writer,
        not has_function_privilege('authenticated','public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)','EXECUTE') as authenticated_v3_denied,
        not has_function_privilege('anon','public.persist_adle_generic_daily_plan_v3(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)','EXECUTE') as anon_v3_denied
    `);
    const verification = after.rows[0];
    if (!verification || Object.values(verification).some((value) => value !== true)) {
      throw new Error(`D2A staging schema verification failed: ${JSON.stringify(verification)}`);
    }
    const afterDistribution = await baseline(client);
    if (JSON.stringify(beforeDistribution) !== JSON.stringify(afterDistribution)) {
      throw new Error(`D2A staging migration changed assignment/snapshot distribution: ${JSON.stringify({ beforeDistribution, afterDistribution })}`);
    }
    console.log(JSON.stringify({ mode: "applied", projectRef: STAGING_PROJECT_REF, version: VERSION, migrationSha256, verification, baselinePreserved: true, writerEnabled: false, learnerRowsCreated: 0 }, null, 2));
  } finally {
    await client.end();
    if (workdir) rmSync(workdir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
