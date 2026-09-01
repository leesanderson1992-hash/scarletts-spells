#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { loadEnvConfig } from "@next/env";
import pg from "pg";

import {
  buildC2BProductionObservation,
  type C2BProductionObservationReceipt,
  type ObservationCompletionReceiptRow,
  type ObservationControlledReceiptRow,
  type ObservationEncounterRow,
  type ObservationLogFact,
  type ObservationOutcomeRow,
  type ObservationSessionRow,
  type ObservationTransitionRow,
} from "../lib/adle/review-policy/production-observation";
import type {
  PersistedReviewPolicyRow,
  PersistedReviewScheduleWordRow,
} from "../lib/adle/review-policy/runtime-coexistence";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const STAGING_PROJECT_REF = "jlhotktspjvffslvuyfz";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const CONFIRMATION = `ADLE-C2B-PRODUCTION-OBSERVE:${PRODUCTION_PROJECT_REF}`;
const LEARNER_ID = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const TARGET_POLICY = "ADLE_SPACED_REVIEW_REGRESSION_V1";
const TARGET_SHAPE = "adle_review_per_word_schedule_v2";
const COHORT_STARTED_AT = "2026-09-01T00:00:00Z";
const APPROVED_TARGET_IDS = [
  "09b3011a-251e-4965-83b3-c9543207f1f9",
  "0ac95e15-b2fa-4aed-9017-0cc82a4fe50b",
  "0daad7b6-f09d-452f-ad40-12d77f43774a",
  "21176bb1-3587-40be-a53e-19e9ccd964a7",
  "43c8c5cf-d6e2-4a7f-962d-12848e456c19",
  "4d72c04c-cfd1-4d70-aae0-19bd41120536",
  "5d5e843f-df5d-4188-ae53-65158b02021d",
  "64c8a1a1-ebd0-4fe8-b210-254e9caa131f",
  "74713a4b-d9ac-4e12-9029-2ca616540cc2",
  "93f641f4-e8ef-484a-8709-b6b4ba49f657",
  "9444b26e-9546-4e3d-95bf-ce39d7c4616c",
  "9a31a74b-57dc-409a-9806-82c0ecb36566",
  "9bddf825-80d1-4158-9e27-3fbda6c27e32",
  "9e8b4953-a11e-4e0d-b8ee-9d381f91127f",
  "ab948cda-7baf-4662-9cb1-6d2caff84b1a",
  "b0623db0-bbef-4a95-a798-87f3ec802410",
  "b88454c0-13ee-4892-857d-92a06821aba6",
  "f54f2ea3-5bbb-477d-881d-baedbc27b69a",
] as const;

loadEnvConfig(process.cwd());

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(`C2B Production observation refused: ${message}`);
}

function assertInvocation(): void {
  if (argument("--environment") !== "production") fail("use --environment production");
  if (argument("--confirm-read-only") !== CONFIRMATION) {
    fail(`use --confirm-read-only '${CONFIRMATION}'`);
  }
  if (!argument("--observed-at")) fail("use --observed-at <ISO timestamp>");
  const observedAt = new Date(argument("--observed-at") as string);
  if (Number.isNaN(observedAt.getTime())) fail("invalid --observed-at timestamp");
  if (!/^[a-f0-9]{7,40}$/.test(argument("--source-baseline") ?? "")) {
    fail("use --source-baseline <exact git commit>");
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(argument("--deployment-identity") ?? "")) {
    fail("use --deployment-identity <exact Vercel deployment id>");
  }
  const forbidden = ["--apply", "--write", "--cut-over", "--activate", "--default", "--repair", "--retry"];
  if (forbidden.some((flag) => process.argv.includes(flag))) fail("mutation flags are not supported");
}

function databaseUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) fail(`missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  const identity = `${parsed.hostname}:${parsed.username}`;
  if (identity.includes(STAGING_PROJECT_REF)) fail("staging URL supplied to Production observer");
  if (!identity.includes(PRODUCTION_PROJECT_REF) || !parsed.hostname.endsWith("pooler.supabase.com")) {
    fail(`database URL is not pinned to Production project ${PRODUCTION_PROJECT_REF}`);
  }
  return value;
}

function readonlySql(sql: string): void {
  const normalized = sql.trimStart().toLowerCase();
  if (!normalized.startsWith("select") && !normalized.startsWith("with")
    && !normalized.startsWith("show")) fail("query rejected by SELECT-only guard");
  if (/\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|copy|execute)\b/i.test(sql)) {
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
  schedule_count: string;
  schedule_fingerprint: string;
  transition_count: string;
  transition_fingerprint: string;
  outcome_count: string;
  outcome_fingerprint: string;
  completion_count: string;
  completion_fingerprint: string;
  controlled_count: string;
  controlled_fingerprint: string;
};

const PROTECTED_SQL = `
select
 (select count(*)::text from public.adle_review_schedule_words) schedule_count,
 (select encode(digest(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by x.id::text),''),'sha256'),'hex') from public.adle_review_schedule_words x) schedule_fingerprint,
 (select count(*)::text from public.adle_review_schedule_transition_events) transition_count,
 (select encode(digest(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by x.id::text),''),'sha256'),'hex') from public.adle_review_schedule_transition_events x) transition_fingerprint,
 (select count(*)::text from public.adle_review_outcome_events) outcome_count,
 (select encode(digest(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by x.id::text),''),'sha256'),'hex') from public.adle_review_outcome_events x) outcome_fingerprint,
 (select count(*)::text from public.adle_review_completion_receipts) completion_count,
 (select encode(digest(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by x.id::text),''),'sha256'),'hex') from public.adle_review_completion_receipts x) completion_fingerprint,
 (select count(*)::text from public.adle_controlled_graduation_receipts) controlled_count,
 (select encode(digest(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by x.id::text),''),'sha256'),'hex') from public.adle_controlled_graduation_receipts x) controlled_fingerprint
`;

const SCHEDULE_SQL = `select
 id::text,child_id::text,canonical_word_id::text,bundle_id::text,membership_status,taught_on::text,row_status,
 word_schedule_version,word_schedule_policy_version,word_interval_index,word_next_due_on::text,catch_up_stage,
 next_retest_due_on::text,failed_review_on::text,pre_retirement_check_due_on::text,last_28_day_review_on::text,
 reteach_cycle_count,word_schedule_transition_count::integer,word_last_review_completed_on::text,
 case when word_last_review_completed_at is null then null else
   regexp_replace(replace(word_last_review_completed_at::text,' ','T'),'\\+00$','+00:00') end
   as word_last_review_completed_at,
 consecutive_independent_failures,failure_episode_id::text
from public.adle_review_schedule_words
where word_schedule_policy_version=$1 and word_schedule_version=$2
order by child_id::text,id::text`;

const POLICY_SQL = `select schedule_policy_version,is_active,is_default_for_new_schedules,transition_family,
 interval_ladder_days,catch_up_offsets_days,recovery_delay_days,due_anchor,controlled_graduation_policy_version,session_cap
from public.adle_review_policy_versions where schedule_policy_version=$1`;

const TRANSITION_SQL = `select id::text,schedule_word_id::text,child_id::text,canonical_word_id::text,
 schedule_policy_version,state_shape_version,transition_kind,source_review_outcome_event_id::text,
 source_controlled_graduation_receipt_id::text,cutover_approval_reference,idempotency_key,
 expected_state_revision::integer,applied_state_revision::integer,from_state,to_state,transition_reason,reducer_version,
 source_fingerprint,occurred_at::text,created_at::text
from public.adle_review_schedule_transition_events where child_id=$1 order by schedule_word_id,applied_state_revision,id`;

const OUTCOME_SQL = `select id::text,schedule_word_id::text,child_id::text,canonical_word_id::text,
 schedule_policy_version,word_schedule_version,due_kind,frozen_interval_index,original_result,
 review_completed_on::text,completed_at::text,review_session_id::text,review_encounter_id::text,event_type,
 result_source,frozen_due_on::text,assignment_practice_date::text,source_provenance,created_at::text
from public.adle_review_outcome_events where child_id=$1 and word_schedule_version=$2
order by completed_at,id`;

const ENCOUNTER_SQL = `select e.id::text,e.review_session_id::text,e.schedule_word_id::text,e.canonical_word_id::text,
 e.target_order,e.original_outcome,e.original_outcome_source,e.review_outcome_event_id::text,e.repair_state,e.created_at::text
from public.adle_review_word_encounters e join public.adle_review_sessions s on s.id=e.review_session_id
where s.child_id=$1 and s.created_at >= $2::timestamptz order by e.review_session_id,e.target_order,e.id`;

const SESSION_SQL = `select s.id::text,s.child_id::text,s.daily_assignment_id::text,a.assignment_date::text,
 s.snapshot_fingerprint,s.stage,s.state_version,s.completed_at::text,s.created_at::text,a.compiled_review_snapshot
from public.adle_review_sessions s join public.daily_assignments a on a.id=s.daily_assignment_id
where s.child_id=$1 and s.created_at >= $2::timestamptz order by s.created_at,s.id`;

const COMPLETION_SQL = `select r.id::text,r.review_session_id::text,r.snapshot_fingerprint,r.request_fingerprint,
 r.completed_at::text,r.review_completed_on::text,r.result_payload,r.created_at::text
from public.adle_review_completion_receipts r join public.adle_review_sessions s on s.id=r.review_session_id
where s.child_id=$1 and r.created_at >= $2::timestamptz order by r.created_at,r.id`;

const CONTROLLED_SQL = `select id::text,child_id::text,daily_assignment_id::text,canonical_word_id::text,source_ref,
 controlled_policy_version,controlled_cycle_kind,cover_write_attempt_event_id::text,cover_write_outcome,
 sentence_dictation_attempt_event_id::text,sentence_dictation_outcome,later_clean_attempt_event_id::text,
 later_clean_outcome,decision,decision_reason,completed_on::text,decided_at::text,source_fingerprint,created_at::text
from public.adle_controlled_graduation_receipts where child_id=$1 and created_at >= $2::timestamptz
order by created_at,id`;

type RawSession = Omit<ObservationSessionRow, "target_schedule_word_ids" | "target_v2_schedule_word_ids" | "target_snapshot_facts"> & {
  compiled_review_snapshot: unknown;
};

function normalizeSession(row: RawSession): ObservationSessionRow {
  const snapshot = row.compiled_review_snapshot as { targets?: Array<{
    schedule?: {
      scheduleWordId?: string;
      schedulePolicyVersion?: string;
      wordScheduleVersion?: string;
      dueKind?: string;
      dueOn?: string;
      intervalIndex?: number;
    };
  }> } | null;
  const targets = Array.isArray(snapshot?.targets) ? snapshot.targets : [];
  const facts = targets.flatMap((target) => {
    const schedule = target.schedule;
    if (!schedule || typeof schedule.scheduleWordId !== "string"
      || typeof schedule.schedulePolicyVersion !== "string"
      || typeof schedule.wordScheduleVersion !== "string"
      || typeof schedule.intervalIndex !== "number") return [];
    return [{
      scheduleWordId: schedule.scheduleWordId,
      schedulePolicyVersion: schedule.schedulePolicyVersion,
      wordScheduleVersion: schedule.wordScheduleVersion,
      membershipStatus: schedule.dueKind ?? "unknown",
      intervalIndex: schedule.intervalIndex,
      dueOn: typeof schedule.dueOn === "string" ? schedule.dueOn as ObservationSessionRow["assignment_date"] : null,
    }];
  });
  const { compiled_review_snapshot: _snapshot, ...base } = row;
  void _snapshot;
  return {
    ...base,
    target_schedule_word_ids: facts.map((fact) => fact.scheduleWordId).sort(),
    target_v2_schedule_word_ids: facts.filter((fact) =>
      fact.schedulePolicyVersion === TARGET_POLICY && fact.wordScheduleVersion === TARGET_SHAPE)
      .map((fact) => fact.scheduleWordId).sort(),
    target_snapshot_facts: facts.filter((fact) =>
      fact.schedulePolicyVersion === TARGET_POLICY || fact.wordScheduleVersion === TARGET_SHAPE)
      .sort((left, right) => left.scheduleWordId.localeCompare(right.scheduleWordId)),
  };
}

function previousReceipt(): C2BProductionObservationReceipt | null {
  const path = argument("--previous");
  if (!path) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  const receipt = (record?.receipt ?? parsed) as C2BProductionObservationReceipt | null;
  if (!receipt || receipt.observationVersion !== "ADLE_C2B_PRODUCTION_OBSERVATION_V1"
    || !receipt.stableRecordFingerprints) fail("--previous is not a C2B observation receipt");
  return receipt;
}

function logFacts(): ObservationLogFact[] {
  const path = argument("--logs-json");
  if (!path) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) fail("--logs-json must contain a normalized JSON array");
  return parsed as ObservationLogFact[];
}

async function main(): Promise<void> {
  assertInvocation();
  const client = new pg.Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  let began = false;
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    began = true;
    const readOnly = await select<{ transaction_read_only: string }>(client, "show transaction_read_only");
    if (readOnly[0]?.transaction_read_only !== "on") fail("transaction is not read-only");
    const before = (await select<ProtectedFacts>(client, PROTECTED_SQL))[0];
    const schedules = await select<PersistedReviewScheduleWordRow>(
      client, SCHEDULE_SQL, [TARGET_POLICY, TARGET_SHAPE]);
    const policies = await select<PersistedReviewPolicyRow>(client, POLICY_SQL, [TARGET_POLICY]);
    const transitions = await select<ObservationTransitionRow>(client, TRANSITION_SQL, [LEARNER_ID]);
    const outcomes = await select<ObservationOutcomeRow>(client, OUTCOME_SQL, [LEARNER_ID, TARGET_SHAPE]);
    const encounters = await select<ObservationEncounterRow>(
      client, ENCOUNTER_SQL, [LEARNER_ID, COHORT_STARTED_AT]);
    const sessions = await select<RawSession>(client, SESSION_SQL, [LEARNER_ID, COHORT_STARTED_AT]);
    const completions = await select<ObservationCompletionReceiptRow>(
      client, COMPLETION_SQL, [LEARNER_ID, COHORT_STARTED_AT]);
    const controlled = await select<ObservationControlledReceiptRow>(
      client, CONTROLLED_SQL, [LEARNER_ID, COHORT_STARTED_AT]);
    if (policies.length !== 1) fail("target policy registry row missing or duplicated");
    const receipt = buildC2BProductionObservation({
      observedAt: new Date(argument("--observed-at") as string).toISOString(),
      sourceBaseline: argument("--source-baseline") as string,
      deploymentIdentity: argument("--deployment-identity") as string,
      productionProjectRef: PRODUCTION_PROJECT_REF,
      learnerId: LEARNER_ID,
      approvedTargetScheduleIds: APPROVED_TARGET_IDS,
      targetSchedules: schedules,
      targetPolicy: policies[0],
      transitions,
      outcomes,
      encounters,
      sessions: sessions.map(normalizeSession),
      completionReceipts: completions,
      controlledReceipts: controlled,
      logs: logFacts(),
      previous: previousReceipt(),
    });
    const after = (await select<ProtectedFacts>(client, PROTECTED_SQL))[0];
    if (JSON.stringify(before) !== JSON.stringify(after)) fail("protected facts changed during observation");
    await client.query("rollback");
    began = false;
    console.log(JSON.stringify({
      mode: "production_repeatable_read_read_only_c2b_observation",
      projectRef: PRODUCTION_PROJECT_REF,
      transactionReadOnly: true,
      protectedBefore: before,
      protectedAfter: after,
      mutationSurface: false,
      receipt,
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
