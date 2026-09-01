#!/usr/bin/env node
import { loadEnvConfig } from "@next/env";
import pg from "pg";

import { buildCutoverPreview } from "../lib/adle/review-policy/cutover-preview";
import type { IsoDate } from "../lib/adle/review-scheduler";
import type {
  PersistedLegacyBundleAuthority,
  PersistedReviewPolicyRow,
  PersistedReviewScheduleWordRow,
} from "../lib/adle/review-policy/runtime-coexistence";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const READ_ONLY_CONFIRMATION = `ADLE-C2B5-PRODUCTION-READ-ONLY:${PRODUCTION_PROJECT_REF}`;

loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`C2B.5 Production preview refused: ${message}`);
}

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) fail(`missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (identity.includes(STAGING_PROJECT_REF)) fail("staging database URL supplied to Production preview");
  if (!identity.includes(PRODUCTION_PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned Production project ${PRODUCTION_PROJECT_REF}`);
  }
  return value;
}

function asOfDate(): IsoDate {
  const value = argument("--as-of");
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("use --as-of YYYY-MM-DD");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail("invalid --as-of date");
  }
  return value as IsoDate;
}

function assertInvocation(): void {
  if (argument("--environment") !== "production") fail("use --environment production");
  if (argument("--confirm-read-only") !== READ_ONLY_CONFIRMATION) {
    fail(`use --confirm-read-only '${READ_ONLY_CONFIRMATION}'`);
  }
  const forbidden = ["--apply", "--write", "--cut-over", "--activate", "--default"];
  if (forbidden.some((flag) => process.argv.includes(flag))) fail("mutation flags are not supported");
}

type ProtectedFacts = {
  schedule_count: string;
  schedule_fingerprint: string;
  policy_count: string;
  policy_fingerprint: string;
  controlled_receipt_count: string;
  controlled_receipt_fingerprint: string;
  transition_count: string;
  transition_fingerprint: string;
};

const PROTECTED_FACTS_SQL = `
select
  (select count(*)::text from public.adle_review_schedule_words) as schedule_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(word)::text, E'\\n' order by word.id::text), ''), 'sha256'), 'hex')
    from public.adle_review_schedule_words word) as schedule_fingerprint,
  (select count(*)::text from public.adle_review_policy_versions) as policy_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(policy)::text, E'\\n' order by policy.schedule_policy_version), ''), 'sha256'), 'hex')
    from public.adle_review_policy_versions policy) as policy_fingerprint,
  (select count(*)::text from public.adle_controlled_graduation_receipts) as controlled_receipt_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(receipt)::text, E'\\n' order by receipt.id::text), ''), 'sha256'), 'hex')
    from public.adle_controlled_graduation_receipts receipt) as controlled_receipt_fingerprint,
  (select count(*)::text from public.adle_review_schedule_transition_events) as transition_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(event)::text, E'\\n' order by event.id::text), ''), 'sha256'), 'hex')
    from public.adle_review_schedule_transition_events event) as transition_fingerprint
`;

const SCHEDULE_SQL = `
select
  word.id::text, word.child_id::text, word.canonical_word_id::text,
  word.bundle_id::text, word.membership_status, word.taught_on::text,
  word.row_status, word.word_schedule_version, word.word_schedule_policy_version,
  word.word_interval_index, word.word_next_due_on::text, word.catch_up_stage,
  word.next_retest_due_on::text, word.failed_review_on::text,
  word.pre_retirement_check_due_on::text, word.last_28_day_review_on::text,
  word.reteach_cycle_count, word.word_schedule_transition_count::integer as word_schedule_transition_count,
  word.word_last_review_completed_on::text, word.word_last_review_completed_at::text,
  word.consecutive_independent_failures, word.failure_episode_id::text
from public.adle_review_schedule_words word
where word.row_status = 'active'
order by word.child_id::text, word.canonical_word_id::text, word.id::text
`;

const BUNDLE_SQL = `
select bundle.id::text, bundle.schedule_policy_version, bundle.interval_index,
       bundle.next_due_on::text
from public.adle_review_bundles bundle
where bundle.id in (
  select distinct word.bundle_id
  from public.adle_review_schedule_words word
  where word.row_status = 'active' and word.bundle_id is not null
)
order by bundle.id::text
`;

const TARGET_POLICY_SQL = `
select schedule_policy_version, is_active, is_default_for_new_schedules,
       transition_family, interval_ladder_days, catch_up_offsets_days,
       recovery_delay_days, due_anchor, controlled_graduation_policy_version,
       session_cap
from public.adle_review_policy_versions
where schedule_policy_version = 'ADLE_SPACED_REVIEW_REGRESSION_V1'
`;

function readonlySql(sql: string): void {
  const normalized = sql.trimStart().toLowerCase();
  if (!normalized.startsWith("select") && !normalized.startsWith("with") && !normalized.startsWith("show")) {
    fail("query rejected by SELECT-only guard");
  }
  if (/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|copy)\b/i.test(sql)) {
    fail("mutation token rejected by SELECT-only guard");
  }
}

async function select<T extends pg.QueryResultRow>(client: pg.Client, sql: string): Promise<T[]> {
  readonlySql(sql);
  return (await client.query<T>(sql)).rows;
}

async function main(): Promise<void> {
  assertInvocation();
  const previewAsOfDate = asOfDate();
  const client = new pg.Client({
    connectionString: databaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const transactionReadOnly = await select<{ transaction_read_only: string }>(
      client,
      "show transaction_read_only",
    );
    if (transactionReadOnly[0]?.transaction_read_only !== "on") fail("database transaction is not read-only");
    const before = (await select<ProtectedFacts>(client, PROTECTED_FACTS_SQL))[0];
    const rows = await select<PersistedReviewScheduleWordRow>(client, SCHEDULE_SQL);
    const bundleRows = await select<PersistedLegacyBundleAuthority & { id: string }>(client, BUNDLE_SQL);
    const policyRows = await select<PersistedReviewPolicyRow>(client, TARGET_POLICY_SQL);
    if (policyRows.length !== 1) fail("exact target policy registry row is missing or duplicated");
    const legacyBundles = new Map(bundleRows.map((bundle) => [bundle.id, {
      schedule_policy_version: bundle.schedule_policy_version,
      interval_index: bundle.interval_index,
      next_due_on: bundle.next_due_on,
    }]));
    const preview = buildCutoverPreview({
      rows,
      legacyBundles,
      targetPolicy: policyRows[0],
      asOfDate: previewAsOfDate,
    });
    const after = (await select<ProtectedFacts>(client, PROTECTED_FACTS_SQL))[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) fail("protected Production facts changed during preview");
    await client.query("rollback");
    const renderedPreview = process.argv.includes("--summary-only")
      ? {
          previewVersion: preview.previewVersion,
          asOfDate: preview.asOfDate,
          targetPolicyVersion: preview.targetPolicyVersion,
          targetStateShapeVersion: preview.targetStateShapeVersion,
          summary: preview.summary,
          fingerprint: preview.fingerprint,
          recordsOmittedFromConsole: preview.records.length,
        }
      : preview;
    console.log(JSON.stringify({
      mode: "production_repeatable_read_read_only_cutover_preview",
      projectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      targetRegistry: {
        isActive: policyRows[0].is_active,
        isDefaultForNewSchedules: policyRows[0].is_default_for_new_schedules,
      },
      preview: renderedPreview,
      protectedBefore: before,
      protectedAfter: after,
      mutationPerformed: false,
    }, null, 2));
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
