#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import pg from "pg";

import { buildApprovedCutoverCandidate } from "../lib/adle/review-policy/cutover-persistence";
import type { CutoverPreviewRecord } from "../lib/adle/review-policy/cutover-preview";
import {
  hydratePersistedReviewSchedule,
  targetPolicyConfigFromRegistry,
  type PersistedReviewPolicyRow,
  type PersistedReviewScheduleWordRow,
  type PersistedTargetTransitionRow,
} from "../lib/adle/review-policy/runtime-coexistence";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const CHILD_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const PREVIEW_FINGERPRINT = "263278060f62e930be58681206d7b19e87dc4d69b205b5e06f3a55922b7219fa";
const APPROVAL_REFERENCE = "OWNER_APPROVAL_C2B7_PRODUCTION_REMAINING_COHORT_02_2026-09-01";
const RECEIPT_PATH = "docs/implementation/adle-c2b7-remaining-cohort-preview-2026-09-01.md";
const RECEIPT_SHA256 = "ffcb6f8d083373192feedccac43e8ba84d004c47b4afdff1f1a159105c7d6fd6";
const MIGRATION_PATH = "supabase/migrations/20260901120000_add_adle_c2b6_controlled_opt_in.sql";
const MIGRATION_SHA256 = "a36c48a633b37bd66b56957c6437e7c175cb50162a66619d3f2b6607b061128d";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const CONFIRMATION = `ADLE-C2B7-APPLY-REMAINING-COHORT-02:${PROJECT_REF}:${PREVIEW_FINGERPRINT}:17`;

const APPROVED_REVISIONS = new Map<string, number>([
  ["09b3011a-251e-4965-83b3-c9543207f1f9", 1],
  ["0ac95e15-b2fa-4aed-9017-0cc82a4fe50b", 1],
  ["0daad7b6-f09d-452f-ad40-12d77f43774a", 1],
  ["21176bb1-3587-40be-a53e-19e9ccd964a7", 1],
  ["43c8c5cf-d6e2-4a7f-962d-12848e456c19", 1],
  ["4d72c04c-cfd1-4d70-aae0-19bd41120536", 1],
  ["64c8a1a1-ebd0-4fe8-b210-254e9caa131f", 1],
  ["74713a4b-d9ac-4e12-9029-2ca616540cc2", 1],
  ["93f641f4-e8ef-484a-8709-b6b4ba49f657", 1],
  ["9444b26e-9546-4e3d-95bf-ce39d7c4616c", 1],
  ["9a31a74b-57dc-409a-9806-82c0ecb36566", 0],
  ["9bddf825-80d1-4158-9e27-3fbda6c27e32", 1],
  ["9e8b4953-a11e-4e0d-b8ee-9d381f91127f", 1],
  ["ab948cda-7baf-4662-9cb1-6d2caff84b1a", 1],
  ["b0623db0-bbef-4a95-a798-87f3ec802410", 2],
  ["b88454c0-13ee-4892-857d-92a06821aba6", 1],
  ["f54f2ea3-5bbb-477d-881d-baedbc27b69a", 1],
]);
const EXCLUDED_IDS = [
  "4299fc98-a5f6-47d0-a8f2-3231e8ce58d5",
  "7c37a74f-c5e7-477d-8c53-202b3bbe8d8a",
  "9fa394d9-afdf-4642-a242-eb3ea9872494",
  "d138de61-09cc-419f-a39d-c70ded5d2f74",
];

loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`C2B.7 remaining-cohort Production cutover refused: ${message}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`missing ${name}`);
  return value;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function databaseUrl(): string {
  const value = required(DATABASE_URL_ENV);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned Production project ${PROJECT_REF}`);
  }
  return value;
}

type PreviewFile = {
  projectRef: string;
  transactionReadOnly: boolean;
  preview: {
    fingerprint: string;
    learnerId: string;
    approvalReference: string;
    targetRegistry: { isActive: boolean; isDefaultForNewSchedules: boolean };
    remainingRecords: CutoverPreviewRecord[];
    candidates: Array<{ scheduleWordId: string; sourceFingerprint: string }>;
  };
  protectedBefore: unknown;
  protectedAfter: unknown;
  mutationPerformed: boolean;
};

function loadApprovedPreview(path: string): PreviewFile {
  const source = readFileSync(resolve(path), "utf8");
  const jsonStart = source.indexOf("{");
  if (jsonStart < 0) fail("preview file contains no JSON object");
  const value = JSON.parse(source.slice(jsonStart)) as PreviewFile;
  if (value.projectRef !== PROJECT_REF || value.transactionReadOnly !== true
    || value.preview.fingerprint !== PREVIEW_FINGERPRINT || value.preview.learnerId !== CHILD_ID
    || value.preview.approvalReference !== APPROVAL_REFERENCE
    || value.preview.targetRegistry.isActive !== false
    || value.preview.targetRegistry.isDefaultForNewSchedules !== false
    || value.mutationPerformed !== false
    || JSON.stringify(value.protectedBefore) !== JSON.stringify(value.protectedAfter)) {
    fail("approved preview identity or read-only proof does not match");
  }
  if (value.preview.remainingRecords.length !== 17 || value.preview.candidates.length !== 17) {
    fail("approved preview does not contain exactly 17 candidates");
  }
  const receipt = readFileSync(resolve(RECEIPT_PATH), "utf8");
  for (const record of value.preview.remainingRecords) {
    const revision = APPROVED_REVISIONS.get(record.scheduleWordId);
    const candidate = value.preview.candidates.find((item) => item.scheduleWordId === record.scheduleWordId);
    if (revision === undefined || record.childId !== CHILD_ID
      || record.current.stateRevision !== revision || record.eligibility !== "ELIGIBLE"
      || !candidate || !receipt.includes(candidate.sourceFingerprint)
      || !receipt.includes(record.scheduleWordId)) {
      fail(`candidate ${record.scheduleWordId} differs from owner approval`);
    }
  }
  if (new Set(value.preview.remainingRecords.map((record) => record.scheduleWordId)).size !== 17
    || value.preview.remainingRecords.some((record) => !APPROVED_REVISIONS.has(record.scheduleWordId))) {
    fail("candidate identity set differs from owner approval");
  }
  return value;
}

type Facts = {
  schedule_count: string;
  v2_count: string;
  nonselected_schedule_fingerprint: string;
  excluded_schedule_fingerprint: string;
  policy_fingerprint: string;
  target_active: boolean;
  target_default: boolean;
  controlled_receipt_count: string;
  controlled_receipt_fingerprint: string;
  transition_count: string;
  approved_ledger_count: string;
};

const FACTS_SQL = `
select
  (select count(*)::text from public.adle_review_schedule_words) as schedule_count,
  (select count(*)::text from public.adle_review_schedule_words
    where word_schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
      and word_schedule_version='adle_review_per_word_schedule_v2') as v2_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(word)::text,E'\\n' order by word.id::text),''),'sha256'),'hex')
    from public.adle_review_schedule_words word where not (word.id=any($1::uuid[]))) as nonselected_schedule_fingerprint,
  (select encode(digest(coalesce(string_agg(to_jsonb(word)::text,E'\\n' order by word.id::text),''),'sha256'),'hex')
    from public.adle_review_schedule_words word where word.id=any($2::uuid[])) as excluded_schedule_fingerprint,
  (select encode(digest(coalesce(string_agg(to_jsonb(policy)::text,E'\\n' order by policy.schedule_policy_version),''),'sha256'),'hex')
    from public.adle_review_policy_versions policy) as policy_fingerprint,
  (select is_active from public.adle_review_policy_versions
    where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1') as target_active,
  (select is_default_for_new_schedules from public.adle_review_policy_versions
    where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1') as target_default,
  (select count(*)::text from public.adle_controlled_graduation_receipts) as controlled_receipt_count,
  (select encode(digest(coalesce(string_agg(to_jsonb(receipt)::text,E'\\n' order by receipt.id::text),''),'sha256'),'hex')
    from public.adle_controlled_graduation_receipts receipt) as controlled_receipt_fingerprint,
  (select count(*)::text from public.adle_review_schedule_transition_events) as transition_count,
  (select count(*)::text from public.adle_review_schedule_transition_events
    where cutover_approval_reference=$3) as approved_ledger_count
`;

async function facts(client: pg.Client, selectedIds: string[]): Promise<Facts> {
  return (await client.query<Facts>(FACTS_SQL, [selectedIds, EXCLUDED_IDS, APPROVAL_REFERENCE])).rows[0];
}

async function selectedRows(client: pg.Client, selectedIds: string[]) {
  return (await client.query(`
    select id::text,canonical_word_id::text,word_schedule_policy_version,
      word_schedule_version,membership_status,word_interval_index,
      word_next_due_on::text,word_schedule_transition_count::integer,
      consecutive_independent_failures,failure_episode_id::text,
      last_28_day_review_on::text,word_last_review_completed_on::text,
      word_last_review_completed_at::text
    from public.adle_review_schedule_words where id=any($1::uuid[]) order by id::text
  `, [selectedIds])).rows as Array<Record<string, unknown>>;
}

async function verifyTargetHydration(client: pg.Client, selectedIds: string[]): Promise<number> {
  const scheduleRows = (await client.query<PersistedReviewScheduleWordRow>(`
    select id::text,child_id::text,canonical_word_id::text,bundle_id::text,
      membership_status,taught_on::text,row_status,word_schedule_version,
      word_schedule_policy_version,word_interval_index,word_next_due_on::text,
      catch_up_stage,next_retest_due_on::text,failed_review_on::text,
      pre_retirement_check_due_on::text,last_28_day_review_on::text,
      reteach_cycle_count,word_schedule_transition_count::integer,
      word_last_review_completed_on::text,word_last_review_completed_at::text,
      consecutive_independent_failures,failure_episode_id::text
    from public.adle_review_schedule_words where id=any($1::uuid[]) order by id::text
  `, [selectedIds])).rows;
  const transitionRows = (await client.query<PersistedTargetTransitionRow>(`
    select schedule_word_id::text,schedule_policy_version,state_shape_version,
      transition_kind,source_review_outcome_event_id::text,
      source_controlled_graduation_receipt_id::text,expected_state_revision::integer,
      applied_state_revision::integer,from_state,to_state,transition_reason
    from public.adle_review_schedule_transition_events
    where schedule_word_id=any($1::uuid[]) order by schedule_word_id::text,applied_state_revision
  `, [selectedIds])).rows;
  const policy = (await client.query<PersistedReviewPolicyRow>(`
    select schedule_policy_version,is_active,is_default_for_new_schedules,
      transition_family,interval_ladder_days,catch_up_offsets_days,
      recovery_delay_days,due_anchor,controlled_graduation_policy_version,session_cap
    from public.adle_review_policy_versions
    where schedule_policy_version='ADLE_SPACED_REVIEW_REGRESSION_V1'
  `)).rows[0];
  if (!policy || !targetPolicyConfigFromRegistry(policy)) fail("target registry failed runtime codec");
  for (const row of scheduleRows) {
    const hydrated = hydratePersistedReviewSchedule({
      row,
      transitions: transitionRows.filter((event) => event.schedule_word_id === row.id),
    });
    if (hydrated.disposition !== "HYDRATED" || hydrated.schedule.kind !== "TARGET_REGRESSION_V1") {
      fail(`target hydration rejected ${row.id}`);
    }
  }
  return scheduleRows.length;
}

async function main(): Promise<void> {
  if (argument("--environment") !== "production" || argument("--confirm") !== CONFIRMATION) {
    fail(`use --environment production --confirm '${CONFIRMATION}'`);
  }
  const previewPath = argument("--preview-file");
  if (!previewPath) fail("use --preview-file with the fresh approved read-only JSON artifact");
  if (sha256(RECEIPT_PATH) !== RECEIPT_SHA256) fail("approved preview receipt SHA changed");
  if (sha256(MIGRATION_PATH) !== MIGRATION_SHA256) fail("approved cutover migration SHA changed");
  const previewFile = loadApprovedPreview(previewPath);
  const records = [...previewFile.preview.remainingRecords]
    .sort((left, right) => left.scheduleWordId.localeCompare(right.scheduleWordId));
  const selectedIds = records.map((record) => record.scheduleWordId);

  const connectionString = databaseUrl();
  const preflightClient = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await preflightClient.connect();
  let before: Facts;
  let rowsBefore: Array<Record<string, unknown>>;
  try {
    await preflightClient.query("begin transaction isolation level repeatable read read only");
    before = await facts(preflightClient, selectedIds);
    rowsBefore = await selectedRows(preflightClient, selectedIds);
    await preflightClient.query("rollback");
  } finally {
    await preflightClient.end();
  }
  if (before.schedule_count !== "56" || before.v2_count !== "1"
    || before.transition_count !== "2" || before.approved_ledger_count !== "0"
    || before.target_active !== false || before.target_default !== false
    || rowsBefore.length !== 17) {
    fail("Production pre-cutover counts, registry, or ledger drifted");
  }

  const candidates = records.map((record) => buildApprovedCutoverCandidate({
    record,
    reviewedPreviewFingerprint: PREVIEW_FINGERPRINT,
    approvalReference: APPROVAL_REFERENCE,
  }));
  const mutationClient = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await mutationClient.connect();
  let applied: { status: "applied" | "already_applied"; appliedCount: number; replayedCount: number };
  try {
    const mutation = await mutationClient.query<{ result: typeof applied }>(`
      select public.apply_adle_review_policy_cutover_c2b6($1::uuid,$2::text,$3::text,$4::jsonb) as result
    `, [CHILD_ID, PREVIEW_FINGERPRINT, APPROVAL_REFERENCE, JSON.stringify(candidates)]);
    applied = mutation.rows[0]?.result;
  } finally {
    await mutationClient.end();
  }
  if (applied.status !== "applied" || applied.appliedCount !== 17 || applied.replayedCount !== 0) {
    fail(`governed RPC returned unexpected result ${JSON.stringify(applied)}`);
  }

  const verificationClient = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await verificationClient.connect();
  let after: Facts;
  let rowsAfter: Array<Record<string, unknown>>;
  let ledger: Array<Record<string, unknown>>;
  let hydratedCount = 0;
  try {
    await verificationClient.query("begin transaction isolation level repeatable read read only");
    const readOnly = await verificationClient.query<{ transaction_read_only: string }>("show transaction_read_only");
    if (readOnly.rows[0]?.transaction_read_only !== "on") fail("post-verification is not read-only");
    after = await facts(verificationClient, selectedIds);
    rowsAfter = await selectedRows(verificationClient, selectedIds);
    ledger = (await verificationClient.query(`
      select schedule_word_id::text,transition_kind,cutover_approval_reference,
        expected_state_revision::integer,applied_state_revision::integer,
        source_fingerprint,idempotency_key,from_state,to_state
      from public.adle_review_schedule_transition_events
      where cutover_approval_reference=$1 order by schedule_word_id::text
    `, [APPROVAL_REFERENCE])).rows;
    hydratedCount = await verifyTargetHydration(verificationClient, selectedIds);
    await verificationClient.query("rollback");
  } finally {
    await verificationClient.end();
  }

  if (after.schedule_count !== before.schedule_count || after.v2_count !== "18"
    || after.transition_count !== "19" || after.approved_ledger_count !== "17"
    || after.nonselected_schedule_fingerprint !== before.nonselected_schedule_fingerprint
    || after.excluded_schedule_fingerprint !== before.excluded_schedule_fingerprint
    || after.policy_fingerprint !== before.policy_fingerprint
    || after.controlled_receipt_count !== before.controlled_receipt_count
    || after.controlled_receipt_fingerprint !== before.controlled_receipt_fingerprint
    || after.target_active !== false || after.target_default !== false
    || rowsAfter.length !== 17 || ledger.length !== 17) {
    fail("post-cutover protected facts do not match the approved atomic delta");
  }

  for (const [index, record] of records.entries()) {
    const row = rowsAfter[index];
    const event = ledger[index];
    const candidate = previewFile.preview.candidates.find((item) => item.scheduleWordId === record.scheduleWordId)!;
    if (row.id !== record.scheduleWordId
      || row.word_schedule_policy_version !== "ADLE_SPACED_REVIEW_REGRESSION_V1"
      || row.word_schedule_version !== "adle_review_per_word_schedule_v2"
      || row.membership_status !== "scheduled"
      || row.word_interval_index !== record.current.intervalIndex
      || row.word_next_due_on !== record.current.dueOn
      || row.word_schedule_transition_count !== record.current.stateRevision + 1
      || row.consecutive_independent_failures !== 0 || row.failure_episode_id !== null
      || row.last_28_day_review_on !== record.current.last28DayReviewOn
      || row.word_last_review_completed_on !== record.current.wordLastReviewCompletedOn
      || row.word_last_review_completed_at !== record.current.wordLastReviewCompletedAt
      || event.schedule_word_id !== record.scheduleWordId
      || event.transition_kind !== "POLICY_CUTOVER_APPLIED"
      || event.cutover_approval_reference !== APPROVAL_REFERENCE
      || event.expected_state_revision !== record.current.stateRevision
      || event.applied_state_revision !== record.current.stateRevision + 1
      || event.source_fingerprint !== candidate.sourceFingerprint) {
      fail(`post-cutover row/ledger mismatch for ${record.scheduleWordId}`);
    }
  }

  console.log(JSON.stringify({
    status: "C2B.7_COMPLETE",
    projectRef: PROJECT_REF,
    approvalReference: APPROVAL_REFERENCE,
    previewFingerprint: PREVIEW_FINGERPRINT,
    governedRpcResult: applied,
    before,
    after,
    rowsBefore,
    rowsAfter,
    ledger: ledger.map((event) => ({
      scheduleWordId: event.schedule_word_id,
      expectedRevision: event.expected_state_revision,
      appliedRevision: event.applied_state_revision,
      sourceFingerprint: event.source_fingerprint,
    })),
    targetHydration: { attempted: selectedIds.length, hydrated: hydratedCount },
    postVerificationReadOnly: true,
    excludedSchedulesUnchanged: true,
    unrelatedSchedulesUnchanged: true,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
