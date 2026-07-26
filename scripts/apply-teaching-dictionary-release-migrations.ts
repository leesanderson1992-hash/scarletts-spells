#!/usr/bin/env node
/* Apply only the reviewed Teaching Dictionary release prerequisites. */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

import { REQUIRED_MIGRATION_VERSIONS, sha256Bytes } from "./teaching-dictionary-release-contract";
import { TARGETS, assertDatabaseTarget } from "./teaching-dictionary-release";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const LOCK = "canonical_teaching_dictionary_release_migrations";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

async function migrationFile(version: string): Promise<{ name: string; sql: string }> {
  const fileName = (await readdir(MIGRATIONS)).find(
    (name) => name.startsWith(`${version}_`) && name.endsWith(".sql"),
  );
  if (!fileName) fail(`Required migration ${version} is not present in the repository.`);
  return { name: fileName.slice(`${version}_`.length, -".sql".length), sql: await readFile(resolve(MIGRATIONS, fileName), "utf8") };
}

async function main(): Promise<void> {
  const target = value("--target") as keyof typeof TARGETS | undefined;
  if (!target || !(target in TARGETS)) fail("--target must be staging or production.");
  const expectedConfirmation = `teaching-dictionary-release-migrations:${target}:${REQUIRED_MIGRATION_VERSIONS.at(-1)}`;
  if (value("--confirm") !== expectedConfirmation) fail(`Exact confirmation required: ${expectedConfirmation}`);
  const url = process.env[TARGETS[target].databaseUrlEnv];
  if (!url) fail(`${TARGETS[target].databaseUrlEnv} is required.`);
  assertDatabaseTarget(url, target);
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== "false" } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LOCK]);
    const existing = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations where version = any($1::text[])",
      [[...REQUIRED_MIGRATION_VERSIONS]],
    );
    const applied = new Set(existing.rows.map((row) => row.version));
    const missing = REQUIRED_MIGRATION_VERSIONS.filter((version) => !applied.has(version));
    const appliedNow: Array<Record<string, string>> = [];
    for (const version of missing) {
      const migration = await migrationFile(version);
      await client.query(migration.sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2::text[], $3)",
        [version, [migration.sql], migration.name],
      );
      appliedNow.push({ version, name: migration.name, sha256: sha256Bytes(migration.sql) });
    }
    await client.query("commit");
    console.log(JSON.stringify({ target, status: "applied", alreadyPresent: [...applied], appliedNow }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
