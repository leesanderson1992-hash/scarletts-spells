#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_R8C_EXACT_ID_HANDOFF_LOCALLY";
if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing disposable R8C proof without: -- ${CONFIRMATION}`);
}

const root = process.cwd();
const container =
  process.env.ADLE_PRODUCTION_SHAPED_DB_CONTAINER?.trim() ||
  "supabase_db_scarletts-spells-adle-prodshape-20260827";
const sourceDatabase =
  process.env.ADLE_PRODUCTION_SHAPED_DB_NAME?.trim() || "postgres";
const proofDatabase = `r8c_exact_id_${process.pid}`;
const maxBuffer = 128 * 1024 * 1024;

function docker(args: string[], input?: string | Buffer): string {
  return execFileSync("docker", args, {
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    maxBuffer,
  });
}

function psql(database: string, sql: string): string {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    sql,
  );
}

const sourceHasR8B = psql(
  sourceDatabase,
  `select exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='parent_verified_spelling_candidate_mappings'
      and column_name='canonical_intake_handoff_state'
  );`,
).trim();
if (sourceHasR8B !== "f") {
  throw new Error(
    "Production-shaped source must remain the pre-R8B schema so ancestry is exercised",
  );
}

docker([
  "exec",
  container,
  "dropdb",
  "-U",
  "postgres",
  "--if-exists",
  proofDatabase,
]);

try {
  docker([
    "exec",
    container,
    "createdb",
    "-U",
    "postgres",
    "-T",
    "template0",
    proofDatabase,
  ]);
  psql(proofDatabase, "drop schema public cascade;");
  psql(
    proofDatabase,
    `create schema if not exists extensions;
     create extension if not exists pgcrypto with schema extensions;
     create extension if not exists "uuid-ossp" with schema extensions;`,
  );

  const schemaDump = docker([
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    sourceDatabase,
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    "--schema=auth",
    "--schema=supabase_migrations",
  ]);
  psql(proofDatabase, schemaDump);
  psql(
    proofDatabase,
    "grant usage on schema public to anon, authenticated, service_role;",
  );

  psql(
    proofDatabase,
    readFileSync(
      resolve(
        root,
        "supabase/migrations/20260828120000_make_parent_approval_occurrence_complete.sql",
      ),
      "utf8",
    ),
  );
  psql(
    proofDatabase,
    readFileSync(
      resolve(
        root,
        "supabase/migrations/20260828130000_authorize_exact_id_canonical_intake_handoff.sql",
      ),
      "utf8",
    ),
  );

  const output = psql(
    proofDatabase,
    readFileSync(
      resolve(root, "scripts/sql/prove-r8c-exact-id-handoff-local.sql"),
      "utf8",
    ),
  );
  const receiptLine = output
    .split("\n")
    .find((line) => line.startsWith("R8C_SQL_RECEIPT:"));
  if (!receiptLine) {
    throw new Error(`R8C SQL proof returned no receipt:\n${output}`);
  }
  const receipt = JSON.parse(receiptLine.slice("R8C_SQL_RECEIPT:".length));
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        sourceSchema: "production-shaped through 20260827120000",
        migrationsAppliedToDisposableDatabase: [
          "20260828120000",
          "20260828130000",
        ],
        ...receipt,
        disposableDatabaseDropped: true,
      },
      null,
      2,
    ),
  );
} finally {
  docker([
    "exec",
    container,
    "dropdb",
    "-U",
    "postgres",
    "--if-exists",
    proofDatabase,
  ]);
}
