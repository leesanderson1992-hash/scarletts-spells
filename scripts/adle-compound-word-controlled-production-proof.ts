#!/usr/bin/env node
/* Controlled CW-3C-1 Production proof. Mutating commands require exact merged main and explicit confirmations. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Production rows are validated before use */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

import { buildLessonAttemptEvents } from "../lib/adle/assignment-attempt-events";
import { onLessonCompleted } from "../lib/adle/composer-completions";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { loadCompoundWordAssignmentReadiness, generateGuardedCompoundWordAssignment } from "../lib/adle/loaders/compound-word-assignment-loader";
import { loadActiveReviewPolicy } from "../lib/adle/loaders/composer-facts-loader";
import { getAdleDailyPlanReadModel } from "../lib/adle/loaders/daily-plan-surface";
import { persistReleaseBoundWordLabCompletion } from "../lib/adle/loaders/word-lab-completion-loader";
import { learningItemFromRow, type LearningItemRow } from "../lib/adle/loaders/rows";
import type { CompoundWordLessonPayloadV2 } from "../lib/adle/morphology/compound-word-lesson-v2";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const MIGRATION = "20260812150000_enable_controlled_compound_word_v2_assignments.sql";
const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const CHILD = "e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e";
const OTHER_CHILD = "2498bb47-0b09-47c9-bfc1-18f95b52d35c";
const PARENT = "a28d4885-8328-4853-ba11-6c676619b9ea";
const CLOSED = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS" as const;
const SEPARATED = "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED" as const;
const SKILLS = [CLOSED, SEPARATED] as const;
const DATES = { [CLOSED]: "2026-08-13", [SEPARATED]: "2026-08-14" } as const;
const RELEASES = {
  [CLOSED]: {
    id: "be3c9822-9253-4ec6-b5de-85808791eb67",
    manifest: "5a54b522543e281755e275a3911c8774f572eef3cc4003ac9153c3a5e0988350",
    dependency: "460a20d244e5bc4e6971619fc6f75ab0d5c0689b29a5586ec048a60f0f8a0fe7",
    teaching: "d68407fe-b342-47d0-9bfc-98fb139b5edc",
  },
  [SEPARATED]: {
    id: "8ba3118d-7adb-4634-8aa4-598773a2cda3",
    manifest: "7374d47fab6caf21ef2e3257319bec06e5210f6b141bb9a8a1a0f0072b21ad6f",
    dependency: "83072cc60fb24890db03e9a846de13c3b83ecd0d868ee56c0f694e52fa2cd18c",
    teaching: "d1b73832-ff8a-4aa4-81b8-5888deaa7bee",
  },
} as const;
const HISTORICAL_RELEASE = "8bcae678-a1d2-4572-a1e9-9aacb378cf9f";
const LEARNING_ITEM_IDS = [
  "fa4871f1-1caf-4615-a97e-b04052c0c7fa",
  "331f75b3-c16b-4c6e-8466-4a06973d496f",
  "42bad401-9873-4aad-82d0-fbe546ce98ed",
  "7451af3a-8687-4349-b61f-625987ddb3e9",
] as const;
const CONFIRM = {
  migrate: "migrate:cw-3c-1:production",
  activate: `activate:cw-3c-1:${CHILD}:production`,
  assign: `assign:cw-3c-1:${CHILD}:production`,
  complete: `complete:cw-3c-1:${CHILD}:production`,
  revoke: "safety-revoke:cw-3c-1:production",
} as const;

function fail(message: string): never { throw new Error(message); }
function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function git(...args: string[]): string { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function exactMain(): string {
  const head = git("rev-parse", "HEAD");
  const main = git("rev-parse", "origin/main");
  if (head !== main || git("status", "--porcelain")) fail(`exact clean merged main required (${head} / ${main})`);
  return head;
}
function dbUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED ?? process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION ?? process.env.SUPABASE_PRODUCTION_DB_URL;
  if (!value) fail("Production database URL is required");
  const parsed = new URL(value);
  if (!parsed.hostname.includes(PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PROJECT_REF)) fail("database is not the governed Production project");
  return value;
}
function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !url.includes(PROJECT_REF)) fail("governed Production Supabase service credentials required");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}

async function snapshot(db: pg.Client): Promise<any> {
  const releases = await db.query(`select release.id,release.release_manifest_sha256,release.dependency_fingerprint,
    (array_agg(dependency.authority_id) filter(where dependency.authority_type='teaching_content'))[1] teaching_authority_id
    from public.adle_curriculum_release_manifests release
    join public.adle_curriculum_release_dependencies dependency on dependency.release_manifest_id=release.id
    where release.id=any($1::uuid[]) group by release.id order by release.id`, [[RELEASES[CLOSED].id, RELEASES[SEPARATED].id]]);
  for (const skill of SKILLS) {
    const expected = RELEASES[skill];
    const row = releases.rows.find((candidate) => candidate.id === expected.id);
    if (!row || row.release_manifest_sha256 !== expected.manifest || row.dependency_fingerprint !== expected.dependency || row.teaching_authority_id !== expected.teaching) fail(`${skill} release authority drifted`);
  }
  const teaching = await db.query(`select id,semantic_projection from public.adle_curriculum_dependency_authorities where id=any($1::uuid[])`, [[RELEASES[CLOSED].teaching, RELEASES[SEPARATED].teaching]]);
  const closedTeaching = teaching.rows.find((row) => row.id === RELEASES[CLOSED].teaching)?.semantic_projection;
  const separatedTeaching = teaching.rows.find((row) => row.id === RELEASES[SEPARATED].teaching)?.semantic_projection;
  if (!closedTeaching || closedTeaching.microSkillKey !== CLOSED || !closedTeaching.contentVersion || !closedTeaching.childFriendlyExplanation || !closedTeaching.ruleExplanation) fail("Closed teaching authority is not activation-ready");
  if (!separatedTeaching || separatedTeaching.microSkillKey !== SEPARATED || separatedTeaching.contentVersion !== "human_reviewed_reading_pages_v2" || separatedTeaching.readingPages?.length !== 3) fail("Separated/Hyphenated reviewed reading authority is not activation-ready");
  const learning = await db.query(`select item.id,item.child_id,word.display_word,item.micro_skill_key,item.source_kind,item.source_ref,item.item_status,item.row_status
    from public.adle_learning_items item join public.canonical_teaching_dictionary_words word on word.id=item.canonical_word_id
    where item.id=any($1::uuid[]) order by word.display_word`, [LEARNING_ITEM_IDS]);
  if (learning.rowCount !== 4 || learning.rows.some((row) => row.child_id !== CHILD || row.source_kind !== "verified_misspelling" || row.row_status !== "active")) fail("proof learner evidence drifted");
  const activations = await db.query(`select head.micro_skill_key,head.current_revision_id,revision.release_manifest_id,revision.activation_status,revision.readiness_report,revision.created_at
    from public.adle_route_activation_heads head join public.adle_route_activation_revisions revision on revision.id=head.current_revision_id
    where head.environment_key='production' and head.route_id='compound_word_lab' and head.route_version='v2' order by head.micro_skill_key`);
  if (activations.rows.some((row) => row.release_manifest_id === HISTORICAL_RELEASE)) fail("historical Separated/Hyphenated release is selected");
  const assignments = await db.query(`select id,assignment_date,status,lesson_route_metadata from public.daily_assignments
    where child_id=$1 and lesson_route_metadata#>>'{route,routeId}'='compound_word_lab' order by assignment_date`, [CHILD]);
  return { releases: releases.rows, teachingAuthorities: teaching.rows.map((row) => ({ id: row.id, contentVersion: row.semantic_projection.contentVersion, readingPageCount: row.semantic_projection.readingPages?.length ?? 0 })), learningItems: learning.rows, activations: activations.rows, assignments: assignments.rows };
}

async function preflight(): Promise<any> {
  return withDb(async (db) => {
    const state = await snapshot(db);
    const old = await db.query(`select count(*)::int activation_count from public.adle_route_activation_revisions where release_manifest_id=$1`, [HISTORICAL_RELEASE]);
    const ledger = await db.query(`select version from supabase_migrations.schema_migrations where version=$1`, [MIGRATION.slice(0, 14)]);
    const occupied = await db.query(`select assignment_date,title,status from public.daily_assignments where child_id=$1 and assignment_date=any($2::date[])`, [CHILD, Object.values(DATES)]);
    const other = await db.query(`select id from public.children where id=$1 and coalesce(is_archived,false)=false`, [OTHER_CHILD]);
    if (old.rows[0].activation_count !== 0 || other.rowCount !== 1) fail("historical activation or non-proof control drifted");
    return { status: "preflight", migrationApplied: ledger.rowCount === 1, proofDatesOccupied: occupied.rows, historicalActivationCount: 0, ...state };
  });
}

async function migrate(): Promise<any> {
  const mainSha = exactMain();
  if (arg("--confirm") !== CONFIRM.migrate) fail(`exact confirmation required: ${CONFIRM.migrate}`);
  return withDb(async (db) => {
    const version = MIGRATION.slice(0, 14);
    const present = await db.query(`select 1 from supabase_migrations.schema_migrations where version=$1`, [version]);
    if (present.rowCount) return { status: "already_applied", mainSha, version };
    const sql = readFileSync(resolve(ROOT, "supabase/migrations", MIGRATION), "utf8");
    await db.query("begin transaction isolation level serializable");
    try {
      await db.query("select pg_advisory_xact_lock(hashtext('cw-3c-1-compound-controlled-proof'))");
      await db.query(sql);
      await db.query(`insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])`, [version, MIGRATION.replace(`${version}_`, "").replace(/\.sql$/u, ""), [sql]]);
      await db.query("commit");
      return { status: "applied", mainSha, version };
    } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  });
}

async function setActivations(status: "enabled" | "safety_revoked"): Promise<any> {
  const mainSha = exactMain();
  const confirmation = status === "enabled" ? CONFIRM.activate : CONFIRM.revoke;
  if (arg("--confirm") !== confirmation) fail(`exact confirmation required: ${confirmation}`);
  return withDb(async (db) => {
    await db.query("begin transaction isolation level serializable");
    try {
      await db.query("select pg_advisory_xact_lock(hashtext('cw-3c-1-compound-controlled-proof'))");
      const before = await snapshot(db);
      const receipts = [];
      for (const skill of SKILLS) {
        const current = before.activations.find((row: any) => row.micro_skill_key === skill)?.current_revision_id ?? null;
        const report = status === "enabled" ? {
          schemaVersion: 1,
          scope: { kind: "child_allowlist", childIds: [CHILD] },
          emergencyDisableAvailable: true,
          provenance: { task: "CW-3C-1", proofChildId: CHILD, nonProofChildId: OTHER_CHILD },
        } : { schemaVersion: 1, scope: { kind: "child_allowlist", childIds: [CHILD] }, emergencyDisableAvailable: true, provenance: { task: "CW-3C-1 emergency disable" } };
        const result = await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'production',$3,$4,$5::jsonb,$6,$7,$8) id`, [
          RELEASES[skill].manifest, skill, status, status === "enabled" ? "allow_existing" : "block_incomplete",
          report, current, "Katie Sanderson / Codex CW-3C-1",
          status === "enabled" ? "Controlled Compound Word v2 proof-child activation" : "CW-3C-1 emergency safety revocation",
        ]);
        receipts.push({ microSkillKey: skill, releaseId: RELEASES[skill].id, previousRevisionId: current, revisionId: result.rows[0].id });
      }
      await db.query("commit");
      return { status, mainSha, scope: { kind: "child_allowlist", childIds: [CHILD] }, receipts };
    } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  });
}

async function assign(): Promise<any> {
  const mainSha = exactMain();
  if (arg("--confirm") !== CONFIRM.assign) fail(`exact confirmation required: ${CONFIRM.assign}`);
  process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";
  const client = serviceClient();
  const receipts = [];
  for (const skill of SKILLS) {
    const first = await generateGuardedCompoundWordAssignment({ userClient: client, serviceClient: client, parentUserId: PARENT, childId: CHILD, planDate: DATES[skill], microSkillKey: skill, generationTrigger: "parent_manual" });
    if (!first.assignmentId || first.readinessReason) fail(`${skill} assignment was not persisted: ${first.readinessReason}`);
    const replay = await generateGuardedCompoundWordAssignment({ userClient: client, serviceClient: client, parentUserId: PARENT, childId: CHILD, planDate: DATES[skill], microSkillKey: skill, generationTrigger: "parent_manual" });
    if (replay.assignmentId !== first.assignmentId) fail(`${skill} assignment replay changed identity`);
    const model = await getAdleDailyPlanReadModel({ userClient: client, parentUserId: PARENT, childId: CHILD, planDate: DATES[skill], assignmentId: first.assignmentId });
    const route = resolvePersistedLessonRoute({ lessonRouteMetadata: model.lessonRouteMetadata, items: model.partTwo.items, runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true } });
    if (model.partTwo.items.length !== 18 || route.status !== "resolved_explicit" || route.runtime.adapterKey !== "compound_word_v2") fail(`${skill} persisted runtime did not resolve exactly`);
    const payload = route.runtime.payload;
    const authentic = payload.words.lesson.filter((word) => word.lineage.kind === "learner_target");
    const generated = payload.words.lesson.filter((word) => word.lineage.kind === "generated_transfer");
    if (authentic.length !== 2 || generated.length !== 2) fail(`${skill} lineage split is not 2 authentic + 2 generated`);
    if (skill === SEPARATED && !generated.some((word) => word.structure.joins.some((join) => join.kind === "space"))) fail("Separated/Hyphenated assignment omitted open generated practice");
    receipts.push({ microSkillKey: skill, planDate: DATES[skill], assignmentId: first.assignmentId, replayAssignmentId: replay.assignmentId, authentic: authentic.map((word) => ({ word: word.structure.wholeWord, learningItemId: word.lineage.kind === "learner_target" ? word.lineage.learningItemId : null })), generated: generated.map((word) => word.structure.wholeWord), runtimeAdapter: route.runtime.adapterKey, itemCount: model.partTwo.items.length });
  }
  const blocked = await loadCompoundWordAssignmentReadiness({ client, childId: OTHER_CHILD, planDate: DATES[CLOSED], microSkillKey: CLOSED });
  if (blocked.payload || blocked.releaseAuthority || blocked.readinessReason !== "compound_word_release_not_enabled_for_child") fail("non-allowlisted child did not fail closed");
  return { status: "assigned", mainSha, receipts, nonAllowlisted: blocked.readinessReason };
}

function payloadFromRoute(model: Awaited<ReturnType<typeof getAdleDailyPlanReadModel>>): CompoundWordLessonPayloadV2 {
  const route = resolvePersistedLessonRoute({ lessonRouteMetadata: model.lessonRouteMetadata, items: model.partTwo.items, runtimeContext: { morphologyUnEnabled: true, dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true } });
  if (route.status !== "resolved_explicit" || route.runtime.adapterKey !== "compound_word_v2") fail("assignment did not resolve through Compound v2 runtime");
  return route.runtime.payload;
}

async function complete(): Promise<any> {
  exactMain();
  if (arg("--confirm") !== CONFIRM.complete) fail(`exact confirmation required: ${CONFIRM.complete}`);
  process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";
  const client = serviceClient();
  const policy = await loadActiveReviewPolicy(client);
  const { data: rows, error } = await client.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").in("id", LEARNING_ITEM_IDS);
  if (error || !rows) fail(`learning item load failed: ${error?.message ?? "no rows"}`);
  const learningItems = (rows as LearningItemRow[]).map(learningItemFromRow);
  const receipts = [];
  for (const skill of SKILLS) {
    const { data: header, error: headerError } = await client.from("daily_assignments").select("id").eq("child_id", CHILD).eq("assignment_date", DATES[skill]).eq("title", "ADLE Daily Plan").maybeSingle();
    if (headerError || !header) fail(`${skill} assignment header missing`);
    const model = await getAdleDailyPlanReadModel({ userClient: client, parentUserId: PARENT, childId: CHILD, planDate: DATES[skill], assignmentId: (header as any).id });
    const payload = payloadFromRoute(model);
    const controlled = new Map(payload.words.lesson.map((word) => [word.structure.wholeCanonicalWordId, word.structure.wholeWord]));
    const dictation = new Map(payload.words.lesson.map((word) => [word.structure.wholeCanonicalWordId, word.dictation.targetSpan.exactAnswer]));
    const rawDictation = new Map(payload.words.lesson.map((word) => [word.structure.wholeCanonicalWordId, word.dictation.sentence]));
    const guided = new Map(model.partTwo.items.filter((item) => item.sectionKey === "lesson_intro" || item.sectionKey === "guided_practice").map((item) => [item.id, "completed"]));
    const sourceRef = `lesson:${CHILD}:${DATES[skill]}:${skill}`;
    const produced = model.partTwo.items.filter((item) => item.sectionKey === "lesson_production" && item.canonicalWordId && item.targetWord).map((item) => ({ canonicalWordId: item.canonicalWordId!, attemptText: item.targetWord!, correct: true }));
    const authentic = new Set(model.partTwo.items.filter((item) => item.sectionKey === "lesson_production" && item.adleLearningItemRef).map((item) => item.canonicalWordId));
    const lesson = onLessonCompleted(policy, {
      childId: CHILD, microSkillKey: skill, completedOn: DATES[skill], sourceRef, bundleId: randomUUID(), scheduleAllProducedWords: true,
      producedWords: produced,
      wordPolicies: produced.map((word) => ({ canonicalWordId: word.canonicalWordId, evidenceEligible: true, scheduleEligible: authentic.has(word.canonicalWordId), learningItemTransitionEligible: authentic.has(word.canonicalWordId), rewardEligible: authentic.has(word.canonicalWordId) })),
      learningItems,
    });
    const attempts = buildLessonAttemptEvents({ context: { childId: CHILD, parentUserId: PARENT, assignmentId: (header as any).id, planDate: DATES[skill] }, sourceRef, items: model.partTwo.items, controlledAttempts: controlled, dictationAttempts: dictation, dictationRawAttempts: rawDictation, guidedAttempts: guided, probeAttempts: new Map(), correctness: "exact_governed_form" });
    const reflection = { childId: CHILD, parentUserId: PARENT, assignmentId: (header as any).id, microSkillKey: skill, contentVersion: payload.contentVersion, promptKey: payload.activities.reflection.promptKey, promptText: payload.activities.reflection.promptText, reflectionText: "The governed parts and joins show how the compound makes its whole meaning." };
    const input = { parentUserId: PARENT, childId: CHILD, assignmentId: (header as any).id, planDate: DATES[skill], microSkillKey: skill, sourceRef, assignmentItemIds: model.partTwo.items.map((item) => item.id), attempts, lesson, reflection };
    const first = await persistReleaseBoundWordLabCompletion(client, input);
    const replay = await persistReleaseBoundWordLabCompletion(client, input);
    if (first.status !== "completed" && first.status !== "already_completed") fail(`${skill} completion failed`);
    if (replay.status !== "already_completed" || JSON.stringify(first.counts) !== JSON.stringify(replay.counts)) fail(`${skill} completion replay was not idempotent`);
    receipts.push({ microSkillKey: skill, assignmentId: (header as any).id, first, replay, readingPageTitles: payload.activities.introduction.readingPages?.map((page) => page.title) ?? [], targets: payload.words.lesson.map((word) => ({ word: word.structure.wholeWord, lineage: word.lineage })) });
  }
  return { status: "completed", receipts };
}

async function verify(): Promise<any> {
  process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "production";
  const client = serviceClient();
  return withDb(async (db) => {
    const state = await snapshot(db);
    if (state.assignments.length !== 2 || state.assignments.some((row: any) => row.status !== "completed")) fail("controlled assignments are not exactly two completed rows");
    const ids = state.assignments.map((row: any) => row.id);
    const counts = await db.query(`select
      (select count(*)::int from public.assignment_items where daily_assignment_id=any($1::uuid[])) items,
      (select count(*)::int from public.adle_assignment_attempt_events where daily_assignment_id=any($1::uuid[])) attempts,
      (select count(*)::int from public.adle_child_learning_reflections where daily_assignment_id=any($1::uuid[])) reflections,
      (select count(*)::int from public.adle_assignment_attempt_event_routes route join public.adle_assignment_attempt_events event on event.id=route.attempt_event_id where event.daily_assignment_id=any($1::uuid[])) evidence_routes,
      (select count(*)::int from public.adle_taught_word_history where source_ref like 'lesson:${CHILD}:2026-08-1%:D4_MOR_COMPOUND_WORDS_%' and row_status='active') taught,
      (select count(*)::int from public.adle_review_schedule_word_routes route where route.learning_item_id=any($2::uuid[]) and route.row_status='active') authentic_schedules,
      (select count(*)::int from public.adle_review_schedule_words schedule where schedule.bundle_id in (select id from public.adle_review_bundles where source_ref like 'lesson:${CHILD}:2026-08-1%:D4_MOR_COMPOUND_WORDS_%') and not exists(select 1 from public.adle_review_schedule_word_routes route where route.schedule_word_id=schedule.id and route.row_status='active')) generated_schedules`, [ids, LEARNING_ITEM_IDS]);
    const lineage = await db.query(`select word.display_word,item.learning_item_id,item.metadata->>'adleLearningItemRef' metadata_ref,item.metadata->>'sectionKey' section_key
      from public.assignment_items item join public.canonical_teaching_dictionary_words word on word.id=(item.metadata->>'canonicalWordId')::uuid
      where item.daily_assignment_id=any($1::uuid[]) and item.metadata->>'sectionKey'='lesson_production' order by word.display_word`, [ids]);
    const historical = await db.query(`select count(*)::int count from public.adle_route_activation_revisions where release_manifest_id=$1`, [HISTORICAL_RELEASE]);
    const blocked = await loadCompoundWordAssignmentReadiness({ client, childId: OTHER_CHILD, planDate: DATES[CLOSED], microSkillKey: CLOSED });
    if (counts.rows[0].items !== 36 || counts.rows[0].attempts !== 36 || counts.rows[0].reflections !== 2 || counts.rows[0].evidence_routes !== 16 || counts.rows[0].taught !== 8 || counts.rows[0].authentic_schedules !== 4 || counts.rows[0].generated_schedules !== 0 || historical.rows[0].count !== 0 || blocked.payload) fail("final controlled-proof invariants failed");
    return { status: "verified", state, counts: counts.rows[0], productionLineage: lineage.rows, historicalActivationCount: historical.rows[0].count, nonAllowlistedReadiness: blocked.readinessReason, emergencyDisableCommand: `npm run adle:compound-word-controlled-proof:production -- safety-revoke --confirm ${CONFIRM.revoke}` };
  });
}

async function main() {
  const command = process.argv[2] ?? "preflight";
  if (command === "preflight") console.log(JSON.stringify(await preflight(), null, 2));
  else if (command === "migrate") console.log(JSON.stringify(await migrate(), null, 2));
  else if (command === "activate") console.log(JSON.stringify(await setActivations("enabled"), null, 2));
  else if (command === "safety-revoke") console.log(JSON.stringify(await setActivations("safety_revoked"), null, 2));
  else if (command === "assign") console.log(JSON.stringify(await assign(), null, 2));
  else if (command === "complete") console.log(JSON.stringify(await complete(), null, 2));
  else if (command === "verify") console.log(JSON.stringify(await verify(), null, 2));
  else fail("expected preflight, migrate, activate, safety-revoke, assign, complete, or verify");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
