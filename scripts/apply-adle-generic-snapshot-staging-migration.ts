import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import pg from "pg";

const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const TARGET = {
  version: "20260731200000",
  name: "add_adle_generic_lesson_snapshot_v2",
  file: resolve(
    "supabase/migrations/20260731200000_add_adle_generic_lesson_snapshot_v2.sql",
  ),
} as const;
const DATABASE_URL_ENV = "ADLE_GENERIC_SNAPSHOT_STAGING_DATABASE_URL";

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) throw new Error(`Missing ${DATABASE_URL_ENV}.`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (
    !parsed.username.includes(STAGING_PROJECT_REF) ||
    identity.includes(PRODUCTION_PROJECT_REF) ||
    !parsed.hostname.endsWith("pooler.supabase.com")
  ) {
    throw new Error(`Generic snapshot migration requires staging ${STAGING_PROJECT_REF}; production and unknown targets are rejected.`);
  }
  return value;
}

function redact(output: string, connection: string): string {
  const password = decodeURIComponent(new URL(connection).password);
  return password ? output.replaceAll(password, "[REDACTED]") : output;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]+/g, "_");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const environment = process.argv[process.argv.indexOf("--environment") + 1];
  if (environment !== "staging") throw new Error("Use --environment staging.");
  if (apply && !process.argv.includes("--confirm-generic-snapshot-migration")) {
    throw new Error("Apply requires --confirm-generic-snapshot-migration.");
  }
  const connection = databaseUrl();
  const client = new pg.Client({ connectionString: connection, ssl: { rejectUnauthorized: false } });
  let workdir: string | null = null;
  await client.connect();
  try {
    const identity = await client.query<{ database: string; already_applied: boolean; column_exists: boolean }>(`
      select current_database() as database,
        exists(select 1 from supabase_migrations.schema_migrations where version = '${TARGET.version}') as already_applied,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='daily_assignments' and column_name='compiled_lesson_snapshot') as column_exists
    `);
    const before = identity.rows[0];
    if (!before || before.database !== "postgres") throw new Error("Unexpected staging database identity.");
    if (before.already_applied !== before.column_exists) throw new Error("Snapshot schema and migration ledger disagree.");
    if (before.already_applied) {
      console.log(JSON.stringify({ mode: "already_applied", projectRef: STAGING_PROJECT_REF, version: TARGET.version, mutationPerformed: false }, null, 2));
      return;
    }
    const ledger = await client.query<{ name: string; version: string }>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    workdir = mkdtempSync(join(tmpdir(), "adle-generic-snapshot-migration-"));
    const migrationsDir = join(workdir, "supabase", "migrations");
    mkdirSync(migrationsDir, { recursive: true });
    writeFileSync(join(workdir, "supabase", "config.toml"), `project_id = "${STAGING_PROJECT_REF}"\n`);
    for (const row of ledger.rows) {
      writeFileSync(join(migrationsDir, `${row.version}_${safeName(row.name)}.sql`), `-- Mirrored staging ledger ${row.version}; intentionally empty.\n`);
    }
    writeFileSync(join(migrationsDir, basename(TARGET.file)), readFileSync(TARGET.file, "utf8"));
    const result = spawnSync("npx", [
      "supabase", "db", "push",
      ...(apply ? [] : ["--dry-run"]),
      "--db-url", connection,
      "--workdir", workdir,
      ...(apply ? ["--yes"] : []),
    ], { cwd: resolve("."), encoding: "utf8", maxBuffer: 20_000_000 });
    const output = redact(`${result.stdout ?? ""}${result.stderr ?? ""}`, connection);
    process.stdout.write(output);
    if (result.status !== 0) throw new Error(`Supabase snapshot migration ${apply ? "apply" : "dry run"} failed.`);
    if (!output.includes(basename(TARGET.file))) throw new Error("Reviewed snapshot migration was not selected.");
    const selected = [...output.matchAll(/20\d{12}_[a-zA-Z0-9_]+[.]sql/g)].map((match) => match[0]);
    if (selected.some((file) => file !== basename(TARGET.file))) throw new Error(`Unexpected migration selected: ${selected.join(", ")}`);
    if (!apply) {
      console.log(JSON.stringify({ mode: "dry_run", projectRef: STAGING_PROJECT_REF, selectedMigration: basename(TARGET.file), mutationPerformed: false }, null, 2));
      return;
    }
    const after = await client.query<Record<string, boolean>>(`
      select
        exists(select 1 from supabase_migrations.schema_migrations where version = '${TARGET.version}' and name = '${TARGET.name}') as ledger_applied,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='daily_assignments' and column_name='compiled_lesson_snapshot' and is_nullable='YES') as nullable_column,
        exists(select 1 from pg_constraint where conname='daily_assignments_compiled_lesson_snapshot_v2_check') as check_constraint,
        exists(select 1 from pg_trigger where tgname='daily_assignments_compiled_lesson_snapshot_immutable' and not tgisinternal) as immutable_trigger,
        to_regclass('public.daily_assignments_compiled_snapshot_version_idx') is not null as version_index,
        to_regprocedure('public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)') is not null as generic_rpc,
        has_function_privilege('authenticated','public.adle_generic_lesson_snapshot_is_structurally_valid_v2(jsonb)','EXECUTE') as authenticated_validator,
        has_function_privilege('service_role','public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)','EXECUTE') as service_writer,
        not has_function_privilege('authenticated','public.persist_adle_generic_daily_plan_v2(uuid,uuid,date,jsonb,jsonb,jsonb,jsonb)','EXECUTE') as authenticated_writer_denied,
        not exists(select 1 from public.daily_assignments where compiled_lesson_snapshot is not null) as no_backfill
    `);
    const verification = after.rows[0];
    if (!verification || Object.values(verification).some((value) => value !== true)) {
      throw new Error(`Staging snapshot schema verification failed: ${JSON.stringify(verification)}`);
    }
    console.log(JSON.stringify({ mode: "applied", projectRef: STAGING_PROJECT_REF, version: TARGET.version, verification, learnerRowsCreated: 0 }, null, 2));
  } finally {
    await client.end();
    if (workdir) rmSync(workdir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
