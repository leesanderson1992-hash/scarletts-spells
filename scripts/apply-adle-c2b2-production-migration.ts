#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import pg from "pg";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const MIGRATION_FILE = "20260831120000_add_adle_c2b2_scheduler_persistence.sql";
const MIGRATION_VERSION = "20260831120000";
const MIGRATION_NAME = "add_adle_c2b2_scheduler_persistence";
const PREDECESSOR_VERSION = "20260829133000";
const APPROVED_SHA256 = "f5fec1fe241b7a64080892ec353be8ff607e048b7d672180265043e939d26fb1";
const CONFIRMATION = [
  "ADLE-C2B2-PRODUCTION-SCHEMA",
  PRODUCTION_PROJECT_REF,
  MIGRATION_VERSION,
  APPROVED_SHA256,
  "TARGET-INACTIVE-NONDEFAULT-NO-BACKFILL",
].join(":");

const migrationPath = resolve("supabase/migrations", MIGRATION_FILE);
const migrationSql = readFileSync(migrationPath, "utf8");
const migrationSha256 = createHash("sha256").update(migrationSql).digest("hex");

type ProductionFacts = {
  max_ledger_version: string | null;
  predecessor_count: string;
  target_ledger_count: string;
  c2b2_object_count: string;
  schedule_count: string;
  v1_schedule_count: string;
  v2_schedule_count: string;
  schedule_fingerprint: string;
  v1_schedule_fingerprint: string;
  children_count: string;
  assignments_count: string;
  assignment_items_count: string;
  attempts_count: string;
  outcomes_count: string;
  current_policy_count: string;
  current_policy_core_fingerprint: string;
  target_policy_count: string;
};

type VerificationFacts = ProductionFacts & {
  target_ledger_name: string | null;
  target_policy_active: boolean | null;
  target_policy_default: boolean | null;
  current_policy_active: boolean | null;
  current_policy_default: boolean | null;
  controlled_receipt_count: string;
  transition_event_count: string;
  c2b2_column_count: string;
  c2b2_constraint_count: string;
  c2b2_index_count: string;
  c2b2_trigger_count: string;
  c2b2_function_count: string;
  c2b2_rls_table_count: string;
  c2b2_policy_count: string;
  service_table_select_count: string;
  forbidden_table_write_grant_count: string;
  service_rpc_execute_count: string;
  forbidden_rpc_execute_count: string;
  schema_fingerprint: string;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`C2B.2 Production release refused: ${message}`);
}

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) fail(`missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (identity.includes(STAGING_PROJECT_REF)) fail("staging database URL supplied to Production runner");
  if (!identity.includes(PRODUCTION_PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned Production project ${PRODUCTION_PROJECT_REF}`);
  }
  return value;
}

function assertInvocation(apply: boolean): void {
  if (migrationSha256 !== APPROVED_SHA256) {
    fail(`migration SHA-256 ${migrationSha256} does not match owner-approved ${APPROVED_SHA256}`);
  }
  if (argument("--environment") !== "production") fail("use --environment production");
  if (argument("--migration-sha256") !== APPROVED_SHA256) {
    fail(`use --migration-sha256 ${APPROVED_SHA256}`);
  }
  if (apply && argument("--confirm") !== CONFIRMATION) {
    fail(`apply requires --confirm '${CONFIRMATION}'`);
  }
}

function migrationBody(): string {
  const beginMatches = migrationSql.match(/^begin;$/gim) ?? [];
  const commitMatches = migrationSql.match(/^commit;\s*$/gim) ?? [];
  if (beginMatches.length !== 1 || commitMatches.length !== 1) {
    fail("approved migration must contain exactly one outer BEGIN and COMMIT");
  }
  const withoutBegin = migrationSql.replace(/^begin;\s*$/im, "");
  return withoutBegin.replace(/^commit;\s*$/im, "");
}

const FACTS_SQL = `
with object_facts as (
  select
    (select count(*) from information_schema.columns
      where table_schema = 'public' and (
        (table_name = 'adle_review_policy_versions' and column_name in (
          'is_default_for_new_schedules', 'transition_family', 'due_anchor',
          'recovery_delay_days', 'controlled_graduation_policy_version'
        )) or
        (table_name = 'adle_review_schedule_words' and column_name in (
          'consecutive_independent_failures', 'failure_episode_id'
        ))
      ))
    + case when to_regclass('public.adle_controlled_graduation_receipts') is null then 0 else 1 end
    + case when to_regclass('public.adle_review_schedule_transition_events') is null then 0 else 1 end
    + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (
         'prevent_adle_c2b2_update',
         'persist_adle_controlled_graduation_receipt_c2b2',
         'persist_adle_review_schedule_transition_c2b2'
       )) as c2b2_object_count
), schedule_facts as (
  select
    count(*)::text as schedule_count,
    count(*) filter (where word_schedule_version = 'adle_review_per_word_schedule_v1'
      and word_schedule_policy_version = 'review_policy_v1_2026-07-04')::text as v1_schedule_count,
    count(*) filter (where word_schedule_version = 'adle_review_per_word_schedule_v2'
      or word_schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1')::text as v2_schedule_count,
    encode(digest(coalesce(string_agg(
      ((to_jsonb(word) - array['consecutive_independent_failures','failure_episode_id']::text[]))::text,
      E'\\n' order by word.id::text
    ), ''), 'sha256'), 'hex') as schedule_fingerprint,
    encode(digest(coalesce(string_agg(
      ((to_jsonb(word) - array['consecutive_independent_failures','failure_episode_id']::text[]))::text,
      E'\\n' order by word.id::text
    ) filter (where word.word_schedule_version = 'adle_review_per_word_schedule_v1'
      and word.word_schedule_policy_version = 'review_policy_v1_2026-07-04'), ''), 'sha256'), 'hex')
      as v1_schedule_fingerprint
  from public.adle_review_schedule_words word
), policy_facts as (
  select
    count(*) filter (where schedule_policy_version = 'review_policy_v1_2026-07-04')::text
      as current_policy_count,
    encode(digest(coalesce(string_agg(
      ((to_jsonb(policy) - array[
        'updated_at', 'is_default_for_new_schedules', 'transition_family', 'due_anchor',
        'recovery_delay_days', 'controlled_graduation_policy_version'
      ]::text[]))::text,
      E'\\n' order by policy.schedule_policy_version
    ) filter (where schedule_policy_version = 'review_policy_v1_2026-07-04'), ''), 'sha256'), 'hex')
      as current_policy_core_fingerprint,
    count(*) filter (where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1')::text
      as target_policy_count
  from public.adle_review_policy_versions policy
)
select
  (select max(version) from supabase_migrations.schema_migrations) as max_ledger_version,
  (select count(*)::text from supabase_migrations.schema_migrations
    where version = '${PREDECESSOR_VERSION}') as predecessor_count,
  (select count(*)::text from supabase_migrations.schema_migrations
    where version = '${MIGRATION_VERSION}') as target_ledger_count,
  object_facts.c2b2_object_count::text,
  schedule_facts.*,
  (select count(*)::text from public.children) as children_count,
  (select count(*)::text from public.daily_assignments) as assignments_count,
  (select count(*)::text from public.assignment_items) as assignment_items_count,
  (select count(*)::text from public.adle_assignment_attempt_events) as attempts_count,
  (select count(*)::text from public.adle_review_outcome_events) as outcomes_count,
  policy_facts.*
from object_facts cross join schedule_facts cross join policy_facts
`;

async function facts(client: pg.Client): Promise<ProductionFacts> {
  const result = await client.query<ProductionFacts>(FACTS_SQL);
  if (result.rowCount !== 1) fail("Production fact query did not return exactly one row");
  return result.rows[0];
}

function assertPreflight(value: ProductionFacts): void {
  if (value.max_ledger_version !== PREDECESSOR_VERSION) {
    fail(`hosted ledger tip ${value.max_ledger_version ?? "null"} is not approved predecessor ${PREDECESSOR_VERSION}`);
  }
  if (value.predecessor_count !== "1" || value.target_ledger_count !== "0") {
    fail(`migration ledger ancestry conflict: predecessor=${value.predecessor_count}, target=${value.target_ledger_count}`);
  }
  if (value.c2b2_object_count !== "0") fail(`partial C2B.2 schema already exists (${value.c2b2_object_count} objects)`);
  if (value.current_policy_count !== "1" || value.target_policy_count !== "0") {
    fail(`policy preflight conflict: current=${value.current_policy_count}, target=${value.target_policy_count}`);
  }
  if (value.v2_schedule_count !== "0") fail(`unexpected pre-existing target/v2 schedules: ${value.v2_schedule_count}`);
}

const VERIFY_SQL = `
with base as (${FACTS_SQL}),
catalog_parts as (
  select 'column:' || table_name || '.' || column_name || ':' || data_type || ':' || is_nullable
    || ':' || coalesce(column_default, '') as part
  from information_schema.columns
  where table_schema = 'public' and (
    (table_name = 'adle_review_policy_versions' and column_name in (
      'is_default_for_new_schedules', 'transition_family', 'due_anchor',
      'recovery_delay_days', 'controlled_graduation_policy_version'
    )) or
    (table_name = 'adle_review_schedule_words' and column_name in (
      'consecutive_independent_failures', 'failure_episode_id'
    )) or
    table_name in ('adle_controlled_graduation_receipts', 'adle_review_schedule_transition_events')
  )
  union all
  select 'constraint:' || c.conname || ':' || pg_get_constraintdef(c.oid, true)
  from pg_constraint c join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and (
    c.conrelid in (
      'public.adle_review_policy_versions'::regclass,
      'public.adle_review_schedule_words'::regclass,
      'public.adle_review_outcome_events'::regclass,
      'public.adle_controlled_graduation_receipts'::regclass,
      'public.adle_review_schedule_transition_events'::regclass
    ) and (
      c.conname like 'adle_controlled_graduation_receipts_%'
      or c.conname like 'adle_review_schedule_transition_events_%'
      or c.conname in (
        'adle_review_policy_versions_transition_family_check',
        'adle_review_policy_versions_due_anchor_check',
        'adle_review_policy_versions_recovery_delay_check',
        'adle_review_policy_versions_controlled_policy_check',
        'adle_review_policy_versions_family_shape_check',
        'adle_review_policy_versions_default_activation_check',
        'adle_review_schedule_words_failure_episode_fkey',
        'adle_review_schedule_words_membership_check',
        'adle_review_schedule_words_word_authority_check',
        'adle_review_outcome_events_r5_shape_check'
      )
    )
  )
  union all
  select 'index:' || indexname || ':' || indexdef
  from pg_indexes
  where schemaname = 'public' and indexname in (
    'adle_review_policy_versions_one_default_idx',
    'adle_review_schedule_words_target_due_idx',
    'adle_controlled_receipts_cover_attempt_idx',
    'adle_controlled_receipts_dictation_attempt_idx',
    'adle_controlled_receipts_later_attempt_idx',
    'adle_controlled_receipts_child_word_idx',
    'adle_review_schedule_transition_review_source_idx',
    'adle_review_schedule_transition_controlled_source_idx',
    'adle_review_schedule_transition_child_word_idx'
  )
  union all
  select 'trigger:' || c.relname || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and t.tgname in (
    'adle_assignment_attempt_events_update_immutable',
    'adle_controlled_graduation_receipts_update_immutable',
    'adle_review_schedule_transition_events_update_immutable'
  )
  union all
  select 'function:' || p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'prevent_adle_c2b2_update',
    'persist_adle_controlled_graduation_receipt_c2b2',
    'persist_adle_review_schedule_transition_c2b2'
  )
), catalog_summary as (
  select encode(digest(string_agg(part, E'\\n' order by part), 'sha256'), 'hex') as schema_fingerprint
  from catalog_parts
)
select base.*,
  (select name from supabase_migrations.schema_migrations where version = '${MIGRATION_VERSION}')
    as target_ledger_name,
  (select is_active from public.adle_review_policy_versions
    where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1') as target_policy_active,
  (select is_default_for_new_schedules from public.adle_review_policy_versions
    where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1') as target_policy_default,
  (select is_active from public.adle_review_policy_versions
    where schedule_policy_version = 'review_policy_v1_2026-07-04') as current_policy_active,
  (select is_default_for_new_schedules from public.adle_review_policy_versions
    where schedule_policy_version = 'review_policy_v1_2026-07-04') as current_policy_default,
  (select count(*)::text from public.adle_controlled_graduation_receipts) as controlled_receipt_count,
  (select count(*)::text from public.adle_review_schedule_transition_events) as transition_event_count,
  (select count(*)::text from information_schema.columns where table_schema = 'public' and (
    (table_name = 'adle_review_policy_versions' and column_name in (
      'is_default_for_new_schedules','transition_family','due_anchor','recovery_delay_days','controlled_graduation_policy_version'
    )) or (table_name = 'adle_review_schedule_words' and column_name in (
      'consecutive_independent_failures','failure_episode_id'
    )) or table_name in ('adle_controlled_graduation_receipts','adle_review_schedule_transition_events')
  )) as c2b2_column_count,
  (select count(*)::text from pg_constraint where conname in (
    'adle_review_policy_versions_transition_family_check','adle_review_policy_versions_due_anchor_check',
    'adle_review_policy_versions_recovery_delay_check','adle_review_policy_versions_controlled_policy_check',
    'adle_review_policy_versions_family_shape_check','adle_review_policy_versions_default_activation_check',
    'adle_review_schedule_words_failure_episode_fkey','adle_review_schedule_words_membership_check',
    'adle_review_schedule_words_word_authority_check','adle_review_outcome_events_r5_shape_check',
    'adle_controlled_graduation_receipts_identity_unique','adle_controlled_graduation_receipts_source_ref_check',
    'adle_controlled_graduation_receipts_policy_check','adle_controlled_graduation_receipts_kind_check',
    'adle_controlled_graduation_receipts_outcomes_check','adle_controlled_graduation_receipts_decision_check',
    'adle_controlled_graduation_receipts_reason_check','adle_controlled_graduation_receipts_shape_check',
    'adle_controlled_graduation_receipts_fingerprint_check','adle_review_schedule_transition_events_key_unique',
    'adle_review_schedule_transition_events_revision_unique','adle_review_schedule_transition_events_key_check',
    'adle_review_schedule_transition_events_revision_check','adle_review_schedule_transition_events_state_check',
    'adle_review_schedule_transition_events_reason_check','adle_review_schedule_transition_events_fingerprint_check',
    'adle_review_schedule_transition_events_kind_check','adle_review_schedule_transition_events_source_shape_check'
  )) as c2b2_constraint_count,
  (select count(*)::text from pg_indexes where schemaname = 'public' and indexname in (
    'adle_review_policy_versions_one_default_idx','adle_review_schedule_words_target_due_idx',
    'adle_controlled_receipts_cover_attempt_idx','adle_controlled_receipts_dictation_attempt_idx',
    'adle_controlled_receipts_later_attempt_idx','adle_controlled_receipts_child_word_idx',
    'adle_review_schedule_transition_review_source_idx','adle_review_schedule_transition_controlled_source_idx',
    'adle_review_schedule_transition_child_word_idx'
  )) as c2b2_index_count,
  (select count(*)::text from pg_trigger where not tgisinternal and tgname in (
    'adle_assignment_attempt_events_update_immutable','adle_controlled_graduation_receipts_update_immutable',
    'adle_review_schedule_transition_events_update_immutable'
  )) as c2b2_trigger_count,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'prevent_adle_c2b2_update','persist_adle_controlled_graduation_receipt_c2b2',
      'persist_adle_review_schedule_transition_c2b2'
    )) as c2b2_function_count,
  (select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'adle_controlled_graduation_receipts','adle_review_schedule_transition_events'
    ) and c.relrowsecurity) as c2b2_rls_table_count,
  (select count(*)::text from pg_policies where schemaname = 'public' and tablename in (
    'adle_controlled_graduation_receipts','adle_review_schedule_transition_events'
  )) as c2b2_policy_count,
  (select count(*)::text from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ('adle_controlled_graduation_receipts','adle_review_schedule_transition_events')
    and grantee = 'service_role' and privilege_type = 'SELECT') as service_table_select_count,
  (select count(*)::text from information_schema.role_table_grants where table_schema = 'public'
    and table_name in ('adle_controlled_graduation_receipts','adle_review_schedule_transition_events')
    and grantee in ('anon','authenticated','service_role') and privilege_type in ('INSERT','UPDATE','DELETE'))
    as forbidden_table_write_grant_count,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'persist_adle_controlled_graduation_receipt_c2b2','persist_adle_review_schedule_transition_c2b2'
    ) and has_function_privilege('service_role', p.oid, 'EXECUTE')) as service_rpc_execute_count,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'persist_adle_controlled_graduation_receipt_c2b2','persist_adle_review_schedule_transition_c2b2'
    ) and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('public', p.oid, 'EXECUTE'))) as forbidden_rpc_execute_count,
  catalog_summary.schema_fingerprint
from base cross join catalog_summary
`;

async function verify(client: pg.Client, before: ProductionFacts): Promise<VerificationFacts> {
  const result = await client.query<VerificationFacts>(VERIFY_SQL);
  if (result.rowCount !== 1) fail("Production verification did not return exactly one row");
  const after = result.rows[0];
  const stableKeys: Array<keyof ProductionFacts> = [
    "schedule_count", "v1_schedule_count", "v2_schedule_count",
    "schedule_fingerprint", "v1_schedule_fingerprint",
    "children_count", "assignments_count", "assignment_items_count",
    "attempts_count", "outcomes_count", "current_policy_count",
    "current_policy_core_fingerprint",
  ];
  for (const key of stableKeys) {
    if (after[key] !== before[key]) fail(`unexpected Production delta for ${key}: ${before[key]} -> ${after[key]}`);
  }
  if (
    after.max_ledger_version !== MIGRATION_VERSION
    || after.target_ledger_count !== "1"
    || after.target_ledger_name !== MIGRATION_NAME
    || after.target_policy_count !== "1"
    || after.target_policy_active !== false
    || after.target_policy_default !== false
    || after.current_policy_active !== true
    || after.current_policy_default !== true
    || after.v2_schedule_count !== "0"
    || after.controlled_receipt_count !== "0"
    || after.transition_event_count !== "0"
    || after.c2b2_object_count !== "12"
    || after.c2b2_column_count !== "46"
    || after.c2b2_constraint_count !== "28"
    || after.c2b2_index_count !== "9"
    || after.c2b2_trigger_count !== "3"
    || after.c2b2_function_count !== "3"
    || after.c2b2_rls_table_count !== "2"
    || after.c2b2_policy_count !== "0"
    || after.service_table_select_count !== "2"
    || after.forbidden_table_write_grant_count !== "0"
    || after.service_rpc_execute_count !== "2"
    || after.forbidden_rpc_execute_count !== "0"
    || !/^[a-f0-9]{64}$/.test(after.schema_fingerprint)
  ) {
    fail(`post-migration identity mismatch: ${JSON.stringify(after)}`);
  }
  return after;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const preflight = process.argv.includes("--preflight");
  const verifyOnly = process.argv.includes("--verify");
  if ([apply, preflight, verifyOnly].filter(Boolean).length !== 1) {
    fail("choose exactly one of --preflight, --apply, or --verify");
  }
  assertInvocation(apply);

  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    if (verifyOnly) {
      await client.query("begin read only");
      const afterFacts = await facts(client);
      const syntheticBefore = { ...afterFacts, max_ledger_version: PREDECESSOR_VERSION,
        target_ledger_count: "0", c2b2_object_count: "0", target_policy_count: "0" };
      const verification = await verify(client, syntheticBefore);
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "production_read_only_verification", projectRef: PRODUCTION_PROJECT_REF,
        migration: MIGRATION_FILE, migrationSha256, verification, mutationPerformed: false }, null, 2));
      return;
    }

    await client.query(apply ? "begin" : "begin read only");
    await client.query("select pg_advisory_xact_lock(hashtextextended('adle-c2b2-production-schema-release', 0))");
    const before = await facts(client);
    assertPreflight(before);
    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "production_read_only_preflight", projectRef: PRODUCTION_PROJECT_REF,
        migration: MIGRATION_FILE, migrationSha256, before, mutationPerformed: false,
        requiredApplyConfirmation: CONFIRMATION }, null, 2));
      return;
    }

    await client.query(migrationBody());
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)",
      [MIGRATION_VERSION, basename(MIGRATION_FILE, ".sql").slice(15)],
    );
    const verification = await verify(client, before);
    await client.query("commit");
    console.log(JSON.stringify({ mode: "production_applied", projectRef: PRODUCTION_PROJECT_REF,
      migration: MIGRATION_FILE, migrationSha256, before, verification, mutationPerformed: true }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
