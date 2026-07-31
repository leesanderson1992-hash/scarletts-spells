import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import pg from "pg";

const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const TARGET_MIGRATIONS = [
  {
    version: "20260731120000",
    name: "add_adle_lesson_route_metadata",
    file: resolve(
      "supabase/migrations/20260731120000_add_adle_lesson_route_metadata.sql",
    ),
  },
  {
    version: "20260731123000",
    name: "fix_adle_route_metadata_structural_validator",
    file: resolve(
      "supabase/migrations/20260731123000_fix_adle_route_metadata_structural_validator.sql",
    ),
  },
  {
    version: "20260731124500",
    name: "grant_adle_route_metadata_validator",
    file: resolve(
      "supabase/migrations/20260731124500_grant_adle_route_metadata_validator.sql",
    ),
  },
] as const;
const DATABASE_URL_ENV = "ADLE_ROUTE_METADATA_STAGING_DATABASE_URL";

function requiredDatabaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) {
    throw new Error(`Missing ${DATABASE_URL_ENV}.`);
  }

  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (
    !parsed.username.includes(STAGING_PROJECT_REF) ||
    identity.includes(PRODUCTION_PROJECT_REF) ||
    !parsed.hostname.endsWith("pooler.supabase.com")
  ) {
    throw new Error(
      `Staging route-metadata migration requires ${STAGING_PROJECT_REF}; production, unknown, and direct-host identities are rejected.`,
    );
  }
  return value;
}

function redactDatabaseUrl(output: string, databaseUrl: string): string {
  const password = new URL(databaseUrl).password;
  return password
    ? output.replaceAll(decodeURIComponent(password), "[REDACTED]")
    : output;
}

function safeMigrationName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]+/g, "_");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = requiredDatabaseUrl();
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  let workdir: string | null = null;

  await client.connect();
  try {
    const identity = await client.query<{
      database: string;
      route_column_exists: boolean;
    }>(`
      select
        current_database() as database,
        exists(
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'daily_assignments'
            and column_name = 'lesson_route_metadata'
        ) as route_column_exists
    `);
    const before = identity.rows[0];
    if (!before || before.database !== "postgres") {
      throw new Error("Unexpected staging database identity.");
    }

    const ledger = await client.query<{ name: string; version: string }>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    const appliedVersions = new Set(ledger.rows.map((row) => row.version));
    const pendingMigrations = TARGET_MIGRATIONS.filter(
      (migration) => !appliedVersions.has(migration.version),
    );
    if (pendingMigrations.length === 0) {
      throw new Error("All route-metadata staging migrations are already applied.");
    }
    const foundationApplied = appliedVersions.has(TARGET_MIGRATIONS[0].version);
    if (foundationApplied !== before.route_column_exists) {
      throw new Error(
        "Route-metadata schema and migration ledger disagree; refusing an ambiguous replay.",
      );
    }
    workdir = mkdtempSync(join(tmpdir(), "adle-route-metadata-migration-"));
    const supabaseDir = join(workdir, "supabase");
    const migrationsDir = join(supabaseDir, "migrations");
    mkdirSync(migrationsDir, { recursive: true });
    writeFileSync(
      join(supabaseDir, "config.toml"),
      `project_id = "${STAGING_PROJECT_REF}"\n`,
    );

    for (const row of ledger.rows) {
      writeFileSync(
        join(migrationsDir, `${row.version}_${safeMigrationName(row.name)}.sql`),
        `-- Mirrored hosted staging ledger entry ${row.version}; deliberately empty in this disposable workspace.\n`,
      );
    }
    for (const migration of TARGET_MIGRATIONS) {
      writeFileSync(
        join(migrationsDir, basename(migration.file)),
        readFileSync(migration.file, "utf8"),
      );
    }

    const args = [
      "supabase",
      "db",
      "push",
      ...(apply ? [] : ["--dry-run"]),
      "--db-url",
      databaseUrl,
      "--workdir",
      workdir,
      ...(apply ? ["--yes"] : []),
    ];
    const result = spawnSync("npx", args, {
      cwd: resolve("."),
      encoding: "utf8",
      maxBuffer: 20_000_000,
    });
    const output = redactDatabaseUrl(
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
      databaseUrl,
    );
    process.stdout.write(output);
    if (result.status !== 0) {
      throw new Error(`Supabase migration ${apply ? "apply" : "dry run"} failed.`);
    }
    for (const migration of pendingMigrations) {
      if (!output.includes(basename(migration.file))) {
        throw new Error(
          `The reviewed route-metadata migration ${basename(migration.file)} was not selected.`,
        );
      }
    }

    const selectedMigrationFiles = [
      ...output.matchAll(/20\d{12}_[a-zA-Z0-9_]+[.]sql/g),
    ].map((match) => match[0]);
    const pendingFiles = new Set(
      pendingMigrations.map((migration) => basename(migration.file)),
    );
    if (
      selectedMigrationFiles.some((file) => !pendingFiles.has(file)) ||
      pendingMigrations.some(
        (migration) => !selectedMigrationFiles.includes(basename(migration.file)),
      )
    ) {
      throw new Error(
        `Unexpected migration selected: ${selectedMigrationFiles.join(", ")}`,
      );
    }

    if (!apply) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            projectRef: STAGING_PROJECT_REF,
            mirroredLedgerEntries: ledger.rowCount ?? ledger.rows.length,
            selectedMigrations: [...pendingFiles],
            mutationPerformed: false,
          },
          null,
          2,
        ),
      );
      return;
    }

    const after = await client.query<{
      base_v1_exists: boolean;
      base_v2_exists: boolean;
      composed_rpc_exists: boolean;
      constraint_exists: boolean;
      validator_authenticated_execute: boolean;
      validator_service_execute: boolean;
      index_exists: boolean;
      route_column_exists: boolean;
      target_applied: boolean;
      trigger_exists: boolean;
    }>(`
      select
        exists(
          select 1 from supabase_migrations.schema_migrations
          where (version, name) in (
            ${TARGET_MIGRATIONS.map(
              (migration) => `('${migration.version}', '${migration.name}')`,
            ).join(",\n            ")}
          )
          having count(*) = ${TARGET_MIGRATIONS.length}
        ) as target_applied,
        exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'daily_assignments'
            and column_name = 'lesson_route_metadata'
            and is_nullable = 'YES'
            and column_default is null
        ) as route_column_exists,
        exists(
          select 1 from pg_constraint
          where conname = 'daily_assignments_lesson_route_metadata_v1_check'
        ) as constraint_exists,
        to_regclass('public.daily_assignments_lesson_route_version_idx') is not null
          as index_exists,
        exists(
          select 1 from pg_trigger
          where tgname = 'daily_assignments_lesson_route_metadata_immutable'
            and not tgisinternal
        ) as trigger_exists,
        has_function_privilege(
          'authenticated',
          'public.adle_lesson_route_metadata_is_valid_v1(jsonb)',
          'EXECUTE'
        ) as validator_authenticated_execute,
        has_function_privilege(
          'service_role',
          'public.adle_lesson_route_metadata_is_valid_v1(jsonb)',
          'EXECUTE'
        ) as validator_service_execute,
        to_regprocedure(
          'public.persist_adle_composed_daily_plan_v1(uuid,uuid,date,jsonb,jsonb,jsonb)'
        ) is not null as composed_rpc_exists,
        to_regprocedure(
          'public.persist_adle_base_word_family_pilot_v1(uuid,uuid,date,jsonb,jsonb)'
        ) is not null as base_v1_exists,
        to_regprocedure(
          'public.persist_adle_base_word_family_pilot_v2(uuid,uuid,date,jsonb,jsonb,jsonb)'
        ) is not null as base_v2_exists
    `);
    const verification = after.rows[0];
    if (!verification || Object.values(verification).some((value) => !value)) {
      throw new Error(
        `Staging schema verification failed: ${JSON.stringify(verification)}`,
      );
    }
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          projectRef: STAGING_PROJECT_REF,
          migrationVersions: TARGET_MIGRATIONS.map(
            (migration) => migration.version,
          ),
          verification,
          learnerRowsCreated: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
    if (workdir) {
      rmSync(workdir, { force: true, recursive: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
