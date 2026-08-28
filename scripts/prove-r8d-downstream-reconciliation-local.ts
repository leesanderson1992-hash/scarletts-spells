#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIRMATION = "PROVE_R8D_DOWNSTREAM_RECONCILIATION_LOCALLY";
if (!process.argv.slice(2).includes(CONFIRMATION)) {
  throw new Error(`Refusing disposable R8D proof without: -- ${CONFIRMATION}`);
}

const root = process.cwd();
const container =
  process.env.ADLE_PRODUCTION_SHAPED_DB_CONTAINER?.trim() ||
  "supabase_db_scarletts-spells-adle-prodshape-20260827";
const sourceDatabase =
  process.env.ADLE_PRODUCTION_SHAPED_DB_NAME?.trim() || "postgres";
const proofDatabase = `r8d_downstream_${process.pid}`;
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

function psqlAsync(
  database: string,
  sql: string,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", [
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
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolvePromise({ status: status ?? -1, stdout, stderr });
    });
    child.stdin.end(sql);
  });
}

async function main(): Promise<void> {

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
    "Production-shaped source must remain the pre-R8B schema so migration ancestry is exercised",
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

  const prerequisiteMigrations = [
    "20260828120000_make_parent_approval_occurrence_complete.sql",
    "20260828130000_authorize_exact_id_canonical_intake_handoff.sql",
  ];
  for (const migration of prerequisiteMigrations) {
    psql(
      proofDatabase,
      readFileSync(resolve(root, "supabase/migrations", migration), "utf8"),
    );
  }

  // Reuse the released R8C proof as the ancestry fixture. Committing its final
  // state gives R8D a realistic mixture of handed-off, blocked, activated, and
  // shared-source rows, while still keeping everything inside the disposable DB.
  const r8cFixture = readFileSync(
    resolve(root, "scripts/sql/prove-r8c-exact-id-handoff-local.sql"),
    "utf8",
  ).replace(/rollback;\s*$/, "commit;");
  psql(proofDatabase, r8cFixture);
  // Preserve the R8C proof result, then shape its content-blocked source into
  // the legacy production form before R8D is installed. This is disposable
  // fixture construction, not a proposed production backfill.
  psql(
    proofDatabase,
    `set session_replication_role = replica;
     update public.parent_verified_spelling_candidate_mappings
        set canonical_intake_handoff_state = null
      where id = '10000000-0000-4000-8000-000000000304'::uuid;
     set session_replication_role = origin;`,
  );
  psql(
    proofDatabase,
    readFileSync(
      resolve(
        root,
        "supabase/migrations/20260828140000_reconcile_downstream_spelling_authority.sql",
      ),
      "utf8",
    ),
  );

  const proofPath = resolve(
    root,
    "scripts/sql/prove-r8d-downstream-reconciliation-local.sql",
  );
  const proof = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      proofDatabase,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    {
      input: readFileSync(proofPath),
      encoding: "utf8",
      maxBuffer,
    },
  );
  if (proof.status !== 0) {
    throw new Error(
      `R8D SQL proof failed:\n${proof.stdout ?? ""}\n${proof.stderr ?? ""}`,
    );
  }
  const receiptLine = proof.stdout
    .split("\n")
    .find((line) => line.startsWith("R8D_SQL_RECEIPT:"));
  if (!receiptLine) {
    throw new Error(`R8D SQL proof returned no receipt:\n${proof.stdout}`);
  }
  const receipt = JSON.parse(receiptLine.slice("R8D_SQL_RECEIPT:".length));
  const concurrency = receipt.concurrency as Record<string, unknown>;
  const issueId = String(concurrency.issueId);
  const sourceId = String(concurrency.sourceId);
  const parentId = String(concurrency.parentId);
  const childId = String(concurrency.childId);
  const approvalSubmissionId = String(concurrency.approvalSubmissionId);
  const concurrentCall = (key: string) => `
    select public.adle_reconcile_parent_spelling_decision_r8d(
      '${issueId}'::uuid,
      '${sourceId}'::uuid,
      '${parentId}'::uuid,
      '${childId}'::uuid,
      1,
      'not_an_issue',
      null,
      null,
      null,
      '${approvalSubmissionId}'::uuid,
      'R8D two-session concurrency proof',
      '${key}'
    )::text;
  `;
  const staleDirectCall = `
    begin;
    set local role service_role;
    update public.parent_verified_spelling_candidate_mappings
       set candidate_status = 'pending_parent_promotion'
     where id = '${sourceId}'::uuid;
    commit;
  `;
  const [firstRpc, secondRpc, staleDirect] = await Promise.all([
    psqlAsync(proofDatabase, concurrentCall("r8d:concurrency:a")),
    psqlAsync(proofDatabase, concurrentCall("r8d:concurrency:b")),
    psqlAsync(proofDatabase, staleDirectCall),
  ]);
  const concurrentResults = [firstRpc, secondRpc];
  const winners = concurrentResults.filter((result) => result.status === 0);
  const losers = concurrentResults.filter((result) => result.status !== 0);
  if (
    winners.length !== 1 ||
    losers.length !== 1 ||
    !losers[0].stderr.includes("authority version is stale") ||
    staleDirect.status === 0 ||
    !staleDirect.stderr.includes(
      "consumed spelling source requires the governed R8D reconciliation path",
    )
  ) {
    throw new Error(
      `R8D concurrency proof did not produce one governed winner plus rejected stale paths:\n${JSON.stringify({ concurrentResults, staleDirect })}`,
    );
  }
  const concurrencyState = JSON.parse(
    psql(
      proofDatabase,
      `select jsonb_build_object(
        'candidateStatus', candidate_status,
        'authorityVersion', authority_version,
        'receiptCount', (
          select count(*) from public.adle_spelling_decision_reconciliations
          where idempotency_key in ('r8d:concurrency:a','r8d:concurrency:b')
        ),
        'activeLineageCount', (
          select count(*) from public.adle_learning_item_sources
          where parent_verified_candidate_mapping_id = '${sourceId}'::uuid
            and row_status = 'active'
        ),
        'activeScheduleRouteCount', (
          select count(*)
          from public.adle_review_schedule_word_routes route
          join public.adle_learning_item_sources source
            on source.learning_item_id = route.learning_item_id
          where source.parent_verified_candidate_mapping_id = '${sourceId}'::uuid
            and route.row_status = 'active'
        )
      )::text
      from public.parent_verified_spelling_candidate_mappings
      where id = '${sourceId}'::uuid;`,
    ).trim(),
  ) as Record<string, unknown>;
  if (
    concurrencyState.candidateStatus !== "superseded" ||
    concurrencyState.authorityVersion !== 2 ||
    concurrencyState.receiptCount !== 1 ||
    concurrencyState.activeLineageCount !== 0 ||
    concurrencyState.activeScheduleRouteCount !== 0
  ) {
    throw new Error(
      `R8D concurrency proof left partial state: ${JSON.stringify(concurrencyState)}`,
    );
  }
  receipt.concurrency = {
    twoIndependentSessions: true,
    exactlyOneWinner: true,
    staleLoserRejected: true,
    staleDirectServiceMutationRejected: true,
    noPartialTargetOrSchedule: true,
    ...concurrencyState,
  };
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        sourceSchema: "production-shaped through 20260827120000",
        migrationsAppliedToDisposableDatabase: [
          "20260828120000",
          "20260828130000",
          "20260828140000",
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
}

void main();
