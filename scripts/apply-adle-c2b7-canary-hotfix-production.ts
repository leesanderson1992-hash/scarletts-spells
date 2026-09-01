#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import pg from "pg";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const MIGRATION_FILE = "20260901130000_normalize_adle_c2b6_review_completion_milliseconds.sql";
const MIGRATION_VERSION = "20260901130000";
const PREDECESSOR_VERSION = "20260901120000";
const APPROVED_SHA256 = "5c4bb42a55336ef16d9300f069c7c33205c1dea5d652276b1546173b6fb4da11";
const CONFIRMATION = [
  "ADLE-C2B7-CANARY-HOTFIX",
  PROJECT_REF,
  MIGRATION_VERSION,
  APPROVED_SHA256,
  "TIMESTAMP-MILLISECONDS-NO-DATA-CUTOVER",
].join(":");

loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`C2B.7 Production hotfix refused: ${message}`);
}

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) fail(`missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned Production project ${PROJECT_REF}`);
  }
  return value;
}

const migrationSql = readFileSync(resolve("supabase/migrations", MIGRATION_FILE), "utf8");
const migrationSha256 = createHash("sha256").update(migrationSql).digest("hex");
if (migrationSha256 !== APPROVED_SHA256) fail(`migration SHA is ${migrationSha256}, expected ${APPROVED_SHA256}`);

const protectedSql = `
select jsonb_build_object(
  'scheduleCount',(select count(*) from public.adle_review_schedule_words),
  'scheduleFingerprint',(select encode(digest(coalesce(string_agg(to_jsonb(word)::text,E'\\n' order by word.id::text),''),'sha256'),'hex') from public.adle_review_schedule_words word),
  'policyFingerprint',(select encode(digest(coalesce(string_agg(to_jsonb(policy)::text,E'\\n' order by policy.schedule_policy_version),''),'sha256'),'hex') from public.adle_review_policy_versions policy),
  'controlledReceiptCount',(select count(*) from public.adle_controlled_graduation_receipts),
  'transitionCount',(select count(*) from public.adle_review_schedule_transition_events),
  'transitionFingerprint',(select encode(digest(coalesce(string_agg(to_jsonb(event)::text,E'\\n' order by event.id::text),''),'sha256'),'hex') from public.adle_review_schedule_transition_events event),
  'outcomeCount',(select count(*) from public.adle_review_outcome_events),
  'completionReceiptCount',(select count(*) from public.adle_review_completion_receipts),
  'canarySession',(select jsonb_build_object(
    'id',session.id,'stage',session.stage,'completedAt',session.completed_at,
    'stateVersion',session.state_version
  ) from public.adle_review_sessions session where id='71865eb0-8ecd-5141-9550-da761dc2d4a2'),
  'canarySchedule',(select jsonb_build_object(
    'id',word.id,'policy',word.word_schedule_policy_version,
    'shape',word.word_schedule_version,'membership',word.membership_status,
    'intervalIndex',word.word_interval_index,'dueOn',word.word_next_due_on,
    'revision',word.word_schedule_transition_count
  ) from public.adle_review_schedule_words word where id='5d5e843f-df5d-4188-ae53-65158b02021d')
) as facts
`;

async function facts(client: pg.Client): Promise<unknown> {
  return (await client.query<{ facts: unknown }>(protectedSql)).rows[0]?.facts;
}

async function verifySchema(client: pg.Client): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(`
    select
      (select count(*)::integer from supabase_migrations.schema_migrations where version=$1) as migration_count,
      position('date_trunc(''milliseconds'',clock_timestamp())' in regexp_replace(
        pg_get_functiondef('public.prepare_adle_review_finalization_c2b6(uuid,text)'::regprocedure), '\\s+', ' ', 'g'
      )) > 0 as canonical_milliseconds,
      has_function_privilege('service_role','public.prepare_adle_review_finalization_c2b6(uuid,text)','EXECUTE') as service_execute,
      has_function_privilege('authenticated','public.prepare_adle_review_finalization_c2b6(uuid,text)','EXECUTE') as authenticated_execute,
      (select is_active from public.adle_review_policy_versions where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1') as target_active,
      (select is_default_for_new_schedules from public.adle_review_policy_versions where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1') as target_default
  `, [MIGRATION_VERSION]);
  return result.rows[0] ?? {};
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (argument("--environment") !== "production") fail("use --environment production");
  if (apply && argument("--confirm") !== CONFIRMATION) fail(`use --confirm '${CONFIRMATION}'`);

  const connectionString = databaseUrl();
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let before: unknown;
  try {
    await client.query(apply ? "begin" : "begin read only");
    if (apply) await client.query("select pg_advisory_xact_lock(hashtextextended('adle-c2b7-canary-hotfix',0))");
    const ledger = await client.query<{ predecessor: string; target: string }>(`
      select
        (select count(*)::text from supabase_migrations.schema_migrations where version=$1) predecessor,
        (select count(*)::text from supabase_migrations.schema_migrations where version=$2) target
    `, [PREDECESSOR_VERSION, MIGRATION_VERSION]);
    if (ledger.rows[0]?.predecessor !== "1") fail("C2B.6 predecessor migration is not present exactly once");
    if ((!apply && !["0", "1"].includes(ledger.rows[0]?.target ?? ""))
      || (apply && ledger.rows[0]?.target !== "0")) fail("hotfix migration ledger state is unexpected");
    before = await facts(client);
    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "read_only_preflight", projectRef: PROJECT_REF,
        migrationFile: MIGRATION_FILE, migrationSha256, ledger: ledger.rows[0], protectedFacts: before,
        requiredConfirmation: CONFIRMATION, mutationPerformed: false }, null, 2));
      return;
    }
    await client.query(migrationSql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version,name) values($1,$2)",
      [MIGRATION_VERSION, basename(MIGRATION_FILE, ".sql").slice(15)],
    );
    const inside = await facts(client);
    if (JSON.stringify(inside) !== JSON.stringify(before)) fail("protected Production facts changed during schema transaction");
    const schema = await verifySchema(client);
    if (schema.migration_count !== 1 || schema.canonical_milliseconds !== true
      || schema.service_execute !== true || schema.authenticated_execute !== false
      || schema.target_active !== false || schema.target_default !== false) {
      fail(`schema assertion failed: ${JSON.stringify(schema)}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  const fresh = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await fresh.connect();
  try {
    await fresh.query("begin read only");
    const after = await facts(fresh);
    const schema = await verifySchema(fresh);
    await fresh.query("rollback");
    if (JSON.stringify(after) !== JSON.stringify(before)) fail("fresh read found a protected Production data delta");
    console.log(JSON.stringify({ mode: "applied_and_verified", projectRef: PROJECT_REF,
      migrationFile: MIGRATION_FILE, migrationSha256, schema, protectedFactsUnchanged: true,
      learnerRowsMutated: 0 }, null, 2));
  } finally {
    await fresh.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
