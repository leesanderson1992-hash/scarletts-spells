#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const CONFIRMATION = `GOLD-BAR-GB5-PRODUCTION-READ-ONLY:${PRODUCTION_PROJECT_REF}`;
const TARGET_MIGRATION = "20260901160000_add_gold_bar_review_writing_alignment.sql";
const TARGET_VERSION = TARGET_MIGRATION.slice(0, 14);
const EXPECTED_STATES = ["pre-schema", "post-schema-dark"] as const;
type ExpectedState = (typeof EXPECTED_STATES)[number];
const REQUIRED_ANCESTRY = [
  "20260627120000",
  "20260628130000",
  "20260705210000",
  "20260824120000",
  "20260825130000",
  "20260825140000",
  "20260831120000",
  "20260901120000",
  "20260901130000",
  "20260901140000",
] as const;

loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`Gold Bar GB.5 Production audit refused: ${message}`);
}

function assertInvocation(): void {
  if (argument("--environment") !== "production") fail("use --environment production");
  if (argument("--confirm-read-only") !== CONFIRMATION) {
    fail(`use --confirm-read-only '${CONFIRMATION}'`);
  }
  const forbidden = [
    "--apply", "--write", "--migrate", "--deploy", "--activate",
    "--repair", "--push", "--set-env", "--backfill",
  ];
  if (forbidden.some((flag) => process.argv.includes(flag))) {
    fail("mutation flags are not supported");
  }
  const expectedState = argument("--expected-state") ?? "pre-schema";
  if (!EXPECTED_STATES.includes(expectedState as ExpectedState)) {
    fail("use --expected-state pre-schema|post-schema-dark");
  }
}

function productionDatabaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) fail(`missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${decodeURIComponent(parsed.username)}`;
  if (identity.includes(STAGING_PROJECT_REF)) fail("staging URL supplied to Production audit");
  if (!identity.includes(PRODUCTION_PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned to Production project ${PRODUCTION_PROJECT_REF}`);
  }
  return value;
}

function readonlySql(sql: string): void {
  const normalized = sql.trimStart().toLowerCase();
  if (!normalized.startsWith("select") && !normalized.startsWith("with") &&
      !normalized.startsWith("show")) {
    fail("query rejected by SELECT-only guard");
  }
  if (/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|copy|execute)\b/iu.test(sql)) {
    fail("mutation token rejected by SELECT-only guard");
  }
}

async function select<T extends pg.QueryResultRow>(
  client: pg.Client,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> {
  readonlySql(sql);
  return (await client.query<T>(sql, [...values])).rows;
}

type ProtectedFacts = {
  treasures_count: string;
  treasures_fingerprint: string;
  reward_events_count: string;
  reward_events_fingerprint: string;
  authentic_uses_count: string;
  authentic_uses_fingerprint: string;
  review_sessions_count: string;
  review_sessions_fingerprint: string;
  review_encounters_count: string;
  review_encounters_fingerprint: string;
  schedules_count: string;
  schedules_fingerprint: string;
  outcomes_count: string;
  outcomes_fingerprint: string;
};

const PROTECTED_SQL = `select
  (select count(*)::text from public.child_word_treasures) treasures_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.child_word_treasures row) treasures_fingerprint,
  (select count(*)::text from public.child_word_treasure_events) reward_events_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.child_word_treasure_events row) reward_events_fingerprint,
  (select count(*)::text from public.adle_authentic_use_events) authentic_uses_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.adle_authentic_use_events row) authentic_uses_fingerprint,
  (select count(*)::text from public.adle_review_sessions) review_sessions_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.adle_review_sessions row) review_sessions_fingerprint,
  (select count(*)::text from public.adle_review_word_encounters) review_encounters_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.adle_review_word_encounters row) review_encounters_fingerprint,
  (select count(*)::text from public.adle_review_schedule_words) schedules_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.adle_review_schedule_words row) schedules_fingerprint,
  (select count(*)::text from public.adle_review_outcome_events) outcomes_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(row)::text,E'\\n' order by row.id::text),''),'sha256'),'hex') from public.adle_review_outcome_events row) outcomes_fingerprint`;

async function main(): Promise<void> {
  assertInvocation();
  const expectedState = (argument("--expected-state") ?? "pre-schema") as ExpectedState;
  const migrationPath = resolve("supabase/migrations", TARGET_MIGRATION);
  const migrationSha256 = createHash("sha256")
    .update(readFileSync(migrationPath, "utf8"))
    .digest("hex");
  const sourceBaseline = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const workingTreeStatus = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
    .trim().split("\n").filter(Boolean);

  const client = new pg.Client({
    connectionString: productionDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  let began = false;
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    began = true;
    const readOnly = (await select<{ transaction_read_only: string }>(
      client,
      "show transaction_read_only",
    ))[0]?.transaction_read_only;
    if (readOnly !== "on") fail("transaction is not read-only");
    const before = (await select<ProtectedFacts>(client, PROTECTED_SQL))[0];

    const ledger = await select<{ version: string; name: string }>(client, `select version,name
      from supabase_migrations.schema_migrations
      where version = any($1::text[]) or version=$2
      order by version`, [REQUIRED_ANCESTRY, TARGET_VERSION]);
    const appliedVersions = new Set(ledger.map((row) => row.version));
    const missingAncestry = REQUIRED_ANCESTRY.filter((version) => !appliedVersions.has(version));

    const schema = (await select<{
      qualification_table: string | null;
      reward_rpc: string | null;
      source_entity_type: string | null;
      reward_source_unique_index: string | null;
      prompted_use_unique_index: string | null;
    }>(client, `select
      to_regclass('public.child_word_treasure_review_use_qualifications')::text qualification_table,
      to_regprocedure('public.record_review_writing_gold_bar_use_v2(uuid,uuid,text,text,text,text,text[],text,timestamptz,text)')::text reward_rpc,
      (select data_type from information_schema.columns where table_schema='public'
        and table_name='child_word_treasure_events' and column_name='source_entity_id') source_entity_type,
      (select indexdef from pg_indexes where schemaname='public'
        and indexname='child_word_treasure_events_source_uidx') reward_source_unique_index,
      (select indexdef from pg_indexes where schemaname='public'
        and indexname='adle_authentic_use_events_one_prompted_review_encounter_idx') prompted_use_unique_index`))[0];

    const thresholdDistribution = await select<{
      required_uses_for_bar: number;
      status: string;
      treasure_count: string;
    }>(client, `select required_uses_for_bar,status,count(*)::text treasure_count
      from public.child_word_treasures
      group by required_uses_for_bar,status
      order by required_uses_for_bar,status`);

    const prompted = (await select<{
      active_prompted_uses: string;
      invalid_prompted_shape: string;
      completed_original_writing_successes: string;
      matched_treasures: string;
      current_in_forge_matches: string;
      historical_post_forge_matches: string;
      canonical_identity_conflicts: string;
      d4_homophone_uses: string;
    }>(client, `select
      count(*) filter (where evidence.row_status='active')::text active_prompted_uses,
      count(*) filter (where evidence.parent_verified or evidence.verified_at is not null
        or evidence.use_kind<>'authentic_correct_use' or evidence.review_session_id is null
        or evidence.review_encounter_id is null or evidence.writing_submitted_at is null)::text invalid_prompted_shape,
      count(*) filter (where session.stage='completed' and session.completed_at is not null
        and encounter.writing_disposition='correct_in_writing'
        and encounter.original_outcome='success' and encounter.original_outcome_source='writing'
        and encounter.repair_state='not_required')::text completed_original_writing_successes,
      count(*) filter (where treasure.id is not null)::text matched_treasures,
      count(*) filter (where treasure.status='in_forge')::text current_in_forge_matches,
      count(*) filter (where treasure.status='in_forge' and treasure.entered_forge_at is not null
        and evidence.writing_submitted_at>=treasure.entered_forge_at)::text historical_post_forge_matches,
      count(*) filter (where treasure.canonical_word_id is not null
        and treasure.canonical_word_id<>evidence.canonical_word_id)::text canonical_identity_conflicts,
      count(*) filter (where exists (
        select 1 from public.adle_review_schedule_word_routes route
        join public.micro_skill_catalog skill on skill.micro_skill_key=route.micro_skill_key
        where route.schedule_word_id=encounter.schedule_word_id
          and route.row_status='active' and skill.skill_family_key='D4_HOM'
      ))::text d4_homophone_uses
    from public.adle_authentic_use_events evidence
    join public.adle_review_sessions session on session.id=evidence.review_session_id
    join public.adle_review_word_encounters encounter on encounter.id=evidence.review_encounter_id
    join public.canonical_teaching_dictionary_words dictionary on dictionary.id=evidence.canonical_word_id
    left join public.child_word_treasures treasure
      on treasure.child_id=evidence.child_id
      and treasure.parent_user_id=session.parent_user_id
      and treasure.corrected_word_normalized=dictionary.normalised_word
    where evidence.provenance_kind='prompted_review_writing_application'`))[0];

    const productionDarkBase = (await select<{
      target_ledger_rows: string;
      review_reward_events: string;
    }>(client, `select
      (select count(*)::text from supabase_migrations.schema_migrations where version=$1) target_ledger_rows,
      (select count(*)::text from public.child_word_treasure_events
        where source_type='review_writing_authentic_use') review_reward_events`, [TARGET_VERSION]))[0];
    const reviewQualificationRows = schema?.qualification_table === null
      ? null
      : (await select<{ count: string }>(client,
        "select count(*)::text count from public.child_word_treasure_review_use_qualifications"))[0]?.count ?? null;
    const productionDark = {
      ...productionDarkBase,
      review_qualification_rows: reviewQualificationRows,
    };

    const after = (await select<ProtectedFacts>(client, PROTECTED_SQL))[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fail("protected facts changed during read-only audit");
    }
    await client.query("rollback");
    began = false;

    const thresholdInvariant = thresholdDistribution.every((row) => row.required_uses_for_bar === 5);
    const ancestryReady = missingAncestry.length === 0;
    const sourceShapeReady = prompted?.invalid_prompted_shape === "0" &&
      prompted?.canonical_identity_conflicts === "0";
    const darkStateConfirmed = expectedState === "pre-schema"
      ? productionDark?.target_ledger_rows === "0" &&
        productionDark?.review_reward_events === "0" &&
        productionDark?.review_qualification_rows === null &&
        schema?.qualification_table === null && schema?.reward_rpc === null
      : productionDark?.target_ledger_rows === "1" &&
        productionDark?.review_reward_events === "0" &&
        productionDark?.review_qualification_rows === "0" &&
        schema?.qualification_table !== null && schema?.reward_rpc !== null;
    const storagePrerequisitesReady = schema?.source_entity_type === "text" &&
      Boolean(schema?.reward_source_unique_index) && Boolean(schema?.prompted_use_unique_index);

    console.log(JSON.stringify({
      mode: "gold_bar_gb5_production_repeatable_read_read_only_audit",
      projectRef: PRODUCTION_PROJECT_REF,
      expectedState,
      transactionReadOnly: true,
      mutationSurface: false,
      sourceBaseline,
      candidateWorkingTreeDirty: workingTreeStatus.length > 0,
      candidateChangedPathCount: workingTreeStatus.length,
      migration: { filename: TARGET_MIGRATION, version: TARGET_VERSION, sha256: migrationSha256 },
      readiness: {
        ancestryReady,
        storagePrerequisitesReady,
        thresholdInvariant,
        sourceShapeReady,
        productionDarkStateConfirmed: darkStateConfirmed,
        candidateMergedAndClean: workingTreeStatus.length === 0,
        gb5ReleaseAuthorized: false,
      },
      ledger: { applied: ledger, missingAncestry, targetApplied: appliedVersions.has(TARGET_VERSION) },
      schema,
      thresholdDistribution,
      promptedReviewEvidenceAggregates: prompted,
      productionDark,
      protectedBefore: before,
      protectedAfter: after,
    }, null, 2));
  } catch (error) {
    if (began) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
