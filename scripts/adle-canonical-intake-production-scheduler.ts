#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const STAGING_REF = "jlhotktspjvffslvuyfz";
const VERCEL_PROJECT_ID = "prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl";
const VERCEL_PROJECT_NAME = "scarletts-spells";
const VERCEL_SCOPE = "leesanderson1992-hashs-projects";
const TARGET_HOST = "scarletts-spells.vercel.app";
const MIGRATION_VERSION = "20260805070000";
const CRON_SECRET_NAME = "adle_canonical_intake_production_cron_secret";
const CONFIGURE_CONFIRMATION =
  "configure:adle-canonical-intake-production-supabase-cron-v1:wwohrqtunajrbwxyssjf";
const ACTIVATE_CONFIRMATION =
  "activate:adle-canonical-intake-production-supabase-cron-v1:wwohrqtunajrbwxyssjf";
const DEACTIVATE_CONFIRMATION =
  "deactivate:adle-canonical-intake-production-supabase-cron-v1:wwohrqtunajrbwxyssjf";

type Command =
  | "validate"
  | "plan"
  | "configure"
  | "activate"
  | "verify"
  | "deactivate";

function selectedCommand(): Command {
  const value = process.argv[2] ?? "validate";
  if (
    value === "validate" ||
    value === "plan" ||
    value === "configure" ||
    value === "activate" ||
    value === "verify" ||
    value === "deactivate"
  ) {
    return value;
  }
  throw new Error(
    "Usage: adle-canonical-intake-production-scheduler.ts <validate|plan|configure|activate|verify|deactivate>",
  );
}

function databaseUrl(): string {
  const value =
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim();
  if (!value) throw new Error("A production Postgres URL is required.");
  const parsed = new URL(value);
  const identity = `${parsed.hostname}\n${decodeURIComponent(parsed.username)}`;
  if (identity.includes(STAGING_REF)) {
    throw new Error("Staging Supabase is permanently rejected.");
  }
  if (!identity.includes(PRODUCTION_REF)) {
    throw new Error("The Postgres URL does not identify the production Supabase project.");
  }
  return value;
}

function vercelLinkDirectory(): string {
  const value = process.env.ADLE_CANONICAL_INTAKE_VERCEL_LINK_DIR?.trim();
  if (!value) {
    throw new Error("ADLE_CANONICAL_INTAKE_VERCEL_LINK_DIR is required.");
  }
  return resolve(value);
}

function requireLinkedProductionProject(): string {
  const directory = vercelLinkDirectory();
  const linked = JSON.parse(
    readFileSync(resolve(directory, ".vercel/project.json"), "utf8"),
  ) as { projectId?: string; projectName?: string };
  assert.equal(linked.projectId, VERCEL_PROJECT_ID);
  assert.equal(linked.projectName, VERCEL_PROJECT_NAME);
  return directory;
}

function runVercel(args: string[], input?: string): void {
  const result = spawnSync("npx", ["vercel", ...args], {
    cwd: requireLinkedProductionProject(),
    encoding: "utf8",
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    const diagnostic = (result.stderr || result.stdout || "Vercel command failed")
      .replaceAll(/https?:\/\/\S+/g, "[url]")
      .slice(0, 600);
    throw new Error(`Guarded Vercel operation failed: ${diagnostic}`);
  }
}

async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: databaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const identity = await client.query<{ current_database: string; current_user: string }>(
      "select current_database(), current_user",
    );
    assert.equal(identity.rows[0]?.current_database, "postgres");
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function validateDatabase(client: Client) {
  const migration = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations where version = $1",
    [MIGRATION_VERSION],
  );
  const extensions = await client.query<{ extname: string }>(
    "select extname from pg_extension where extname = any($1::text[]) order by extname",
    [["pg_cron", "pg_net", "supabase_vault"]],
  );
  const functions = await client.query<{ function_name: string }>(
    `select routine_name as function_name
       from information_schema.routines
      where routine_schema = 'public'
        and routine_name = any($1::text[])
      order by routine_name`,
    [[
      "adle_activate_canonical_intake_production_scheduler",
      "adle_canonical_intake_production_scheduler_status",
      "adle_deactivate_canonical_intake_production_scheduler",
      "adle_dispatch_canonical_intake_production_safety_sweep",
    ]],
  );
  return {
    migrationApplied: migration.rowCount === 1,
    extensions: extensions.rows.map((row) => row.extname),
    functions: functions.rows.map((row) => row.function_name),
  };
}

async function schedulerStatus(client: Client): Promise<Record<string, unknown>> {
  const result = await client.query<{ status: Record<string, unknown> }>(
    "select public.adle_canonical_intake_production_scheduler_status() as status",
  );
  return result.rows[0]?.status ?? {};
}

async function readOrCreateVaultSecret(client: Client): Promise<string> {
  const existing = await client.query<{ decrypted_secret: string }>(
    "select decrypted_secret from vault.decrypted_secrets where name = $1",
    [CRON_SECRET_NAME],
  );
  if (existing.rowCount === 1) {
    const value = existing.rows[0]!.decrypted_secret;
    if (!value?.trim()) throw new Error("Production Cron Vault secret is blank.");
    return value;
  }
  if ((existing.rowCount ?? 0) > 1) {
    throw new Error("Production Cron Vault secret is duplicated.");
  }
  const value = randomBytes(32).toString("hex");
  await client.query("select vault.create_secret($1, $2, $3)", [
    value,
    CRON_SECRET_NAME,
    "Production bearer token for the canonical-intake five-minute safety sweep.",
  ]);
  return value;
}

async function configure(client: Client) {
  assert.equal(
    process.env.ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM,
    CONFIGURE_CONFIRMATION,
    `Set ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM=${CONFIGURE_CONFIRMATION}.`,
  );
  const validated = await validateDatabase(client);
  assert.equal(validated.migrationApplied, true, "Scheduler migration is not applied.");
  assert.deepEqual(validated.extensions, ["pg_cron", "pg_net", "supabase_vault"]);
  assert.equal(validated.functions.length, 4);

  const cronSecret = await readOrCreateVaultSecret(client);
  runVercel(
    [
      "env",
      "add",
      "CRON_SECRET",
      "production",
      "--force",
      "--yes",
      "--scope",
      VERCEL_SCOPE,
    ],
    cronSecret,
  );
  return { configured: true, vaultSecretReady: true, vercelEnvironmentUpdated: true };
}

async function activate(client: Client) {
  assert.equal(
    process.env.ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM,
    ACTIVATE_CONFIRMATION,
    `Set ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM=${ACTIVATE_CONFIRMATION}.`,
  );
  const activated = await client.query<{ result: Record<string, unknown> }>(
    "select public.adle_activate_canonical_intake_production_scheduler($1) as result",
    [ACTIVATE_CONFIRMATION],
  );
  return activated.rows[0]?.result ?? {};
}

async function deactivate(client: Client) {
  assert.equal(
    process.env.ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM,
    DEACTIVATE_CONFIRMATION,
    `Set ADLE_CANONICAL_INTAKE_PRODUCTION_SCHEDULER_CONFIRM=${DEACTIVATE_CONFIRMATION}.`,
  );
  const result = await client.query<{ result: Record<string, unknown> }>(
    "select public.adle_deactivate_canonical_intake_production_scheduler($1) as result",
    [DEACTIVATE_CONFIRMATION],
  );
  return result.rows[0]?.result ?? {};
}

async function main() {
  requireLinkedProductionProject();
  const command = selectedCommand();
  const output = await withClient(async (client) => {
    const validated = await validateDatabase(client);
    if (command === "configure") {
      return { command, validated, configuration: await configure(client) };
    }
    if (command === "activate") {
      return { command, validated, activation: await activate(client), status: await schedulerStatus(client) };
    }
    if (command === "deactivate") {
      return { command, deactivation: await deactivate(client), status: await schedulerStatus(client) };
    }
    const status = validated.migrationApplied ? await schedulerStatus(client) : null;
    if (command === "verify") {
      assert.equal(validated.migrationApplied, true);
      assert.deepEqual(validated.extensions, ["pg_cron", "pg_net", "supabase_vault"]);
      assert.equal(status?.environment, "production");
      assert.equal(status?.targetHost, TARGET_HOST);
      assert.equal(status?.schedule, "*/5 * * * *");
      assert.equal(status?.enabled, true);
      assert.equal(status?.cronJobActive, true);
      assert.equal(status?.cronSecretReady, true);
    }
    return { command, validated, status };
  });
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production scheduler operation failed.");
  process.exitCode = 1;
});
