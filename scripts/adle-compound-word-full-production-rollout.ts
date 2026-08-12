#!/usr/bin/env node
/* CW-3C-2 all-eligible rollout. Mutations require exact merged main and confirmations. */
/* eslint-disable @typescript-eslint/no-explicit-any -- Production rows are validated before use */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const MIGRATION = "20260812190000_enable_all_eligible_route_activation_scope.sql";
const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const CLOSED = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const SEPARATED = "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED";
const SKILLS = [CLOSED, SEPARATED] as const;
type CompoundWordSkill = (typeof SKILLS)[number];
const RELEASES = {
  [CLOSED]: {
    id: "be3c9822-9253-4ec6-b5de-85808791eb67",
    manifest: "5a54b522543e281755e275a3911c8774f572eef3cc4003ac9153c3a5e0988350",
    teaching: "d68407fe-b342-47d0-9bfc-98fb139b5edc",
    proofRevision: "ce9d920b-38fd-424a-8158-05c40d7f1fdb",
  },
  [SEPARATED]: {
    id: "8ba3118d-7adb-4634-8aa4-598773a2cda3",
    manifest: "7374d47fab6caf21ef2e3257319bec06e5210f6b141bb9a8a1a0f0072b21ad6f",
    teaching: "d1b73832-ff8a-4aa4-81b8-5888deaa7bee",
    proofRevision: "18c8e3bf-809e-4629-971f-e38d921310d6",
  },
} as const;
const HISTORICAL_RELEASE = "8bcae678-a1d2-4572-a1e9-9aacb378cf9f";
const PROOF_ASSIGNMENTS = [
  "20c16fed-1c13-41bc-ab80-04a32b0edf5d",
  "cfc7a2cc-0f78-466a-b065-244649891376",
] as const;
const PROOF_ITEMS = [
  "fa4871f1-1caf-4615-a97e-b04052c0c7fa",
  "331f75b3-c16b-4c6e-8466-4a06973d496f",
  "42bad401-9873-4aad-82d0-fbe546ce98ed",
  "7451af3a-8687-4349-b61f-625987ddb3e9",
] as const;
const CONFIRM = {
  migrate: "migrate:cw-3c-2:production",
  activate: "activate:cw-3c-2:all-eligible:production",
  revoke: "safety-revoke:cw-3c-2:production",
} as const;

function fail(message: string): never { throw new Error(message); }
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
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
  if (!parsed.hostname.includes(PROJECT_REF) && !decodeURIComponent(parsed.username).includes(PROJECT_REF)) fail("database is not governed Production");
  return value;
}
async function withDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}

async function snapshot(db: pg.Client): Promise<any> {
  const activations = await db.query(`select head.micro_skill_key,head.current_revision_id,revision.release_manifest_id,
    revision.release_manifest_sha256,revision.activation_status,revision.readiness_report,revision.created_at
    from public.adle_route_activation_heads head join public.adle_route_activation_revisions revision on revision.id=head.current_revision_id
    where head.environment_key='production' and head.route_id='compound_word_lab' and head.route_version='v2'
      and head.micro_skill_key=any($1::text[]) order by head.micro_skill_key`, [SKILLS]);
  const authorities = await db.query(`select dependency.release_manifest_id,dependency.micro_skill_key,dependency.authority_type,dependency.authority_id
    from public.adle_curriculum_release_dependencies dependency
    where dependency.release_manifest_id=any($1::uuid[]) order by dependency.micro_skill_key,dependency.authority_type`, [[RELEASES[CLOSED].id, RELEASES[SEPARATED].id]]);
  const learning = await db.query(`select micro_skill_key,item_status,count(*)::int items,count(distinct child_id)::int children
    from public.adle_learning_items where micro_skill_key=any($1::text[]) and row_status='active' group by 1,2 order by 1,2`, [SKILLS]);
  const eligible = await db.query(`select micro_skill_key,count(*)::int items,count(distinct child_id)::int children
    from public.adle_learning_items where micro_skill_key=any($1::text[]) and row_status='active'
      and item_status in ('pending','pending_reteach') and source_kind='verified_misspelling' group by 1 order by 1`, [SKILLS]);
  const candidates = await db.query(`select micro_skill_key,candidate_state,route_id,route_version,count(*)::int candidates
    from public.adle_canonical_intake_candidates where micro_skill_key=any($1::text[]) group by 1,2,3,4 order by 1,2`, [SKILLS]);
  const assignments = await db.query(`select assignment.id,assignment.child_id,assignment.status,assignment.created_at,
    assignment.lesson_route_metadata#>>'{route,routeId}' route_id,
    assignment.lesson_route_metadata#>>'{route,routeVersion}' route_version,
    assignment.lesson_route_metadata#>>'{curriculumRelease,releaseManifestId}' release_id,
    assignment.lesson_route_metadata#>>'{curriculumRelease,activationRevisionId}' activation_revision_id,
    count(item.id)::int item_count
    from public.daily_assignments assignment left join public.assignment_items item on item.daily_assignment_id=assignment.id
    where assignment.lesson_route_metadata#>>'{route,routeId}' in ('compound_word_lab','closed_compound_word_lab')
       or assignment.lesson_route_metadata::text like '%D4_MOR_COMPOUND_WORDS_%'
    group by assignment.id order by assignment.created_at`);
  const duplicateItems = await db.query(`select child_id,canonical_word_id,micro_skill_key,count(*)::int rows
    from public.adle_learning_items where micro_skill_key=any($1::text[]) and row_status='active'
    group by 1,2,3 having count(*)>1`, [SKILLS]);
  const duplicateAssignments = await db.query(`select child_id,assignment_date,lesson_route_metadata#>>'{payload,microSkillKey}' micro_skill_key,count(*)::int rows
    from public.daily_assignments where lesson_route_metadata#>>'{route,routeId}'='compound_word_lab' and status in ('pending','active')
    group by 1,2,3 having count(*)>1`);
  const unresolved = await db.query(`select id,child_id,normalized_target_token,micro_skill_key,candidate_state,blockers
    from public.adle_canonical_intake_candidates where micro_skill_key=any($1::text[])
      and (candidate_state<>'activated' or blockers<>'[]'::jsonb) order by micro_skill_key,normalized_target_token`, [SKILLS]);
  const proof = await db.query(`select id,status from public.daily_assignments where id=any($1::uuid[]) order by id`, [PROOF_ASSIGNMENTS]);
  const schedule = await db.query(`select
    (select count(*)::int from public.adle_review_schedule_word_routes where learning_item_id=any($1::uuid[]) and row_status='active') authentic,
    (select count(*)::int from public.adle_review_schedule_words word
      where word.bundle_id in (select id from public.adle_review_bundles where source_ref like 'lesson:e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e:2026-08-1%:D4_MOR_COMPOUND_WORDS_%')
      and not exists(select 1 from public.adle_review_schedule_word_routes route where route.schedule_word_id=word.id and route.row_status='active')) generated` , [PROOF_ITEMS]);
  const historical = await db.query(`select count(*)::int count from public.adle_route_activation_revisions where release_manifest_id=$1`, [HISTORICAL_RELEASE]);
  return {
    activations: activations.rows,
    authorities: authorities.rows,
    learningItems: learning.rows,
    eligible: eligible.rows,
    candidates: candidates.rows,
    assignments: assignments.rows,
    duplicateLearningItemGroups: duplicateItems.rows,
    duplicateAssignmentGroups: duplicateAssignments.rows,
    unresolvedReadiness: unresolved.rows,
    proofAssignments: proof.rows,
    schedules: schedule.rows[0],
    historicalActivationCount: historical.rows[0].count,
  };
}

function assertInvariantState(state: any): void {
  if (state.activations.length !== 2) fail("both Compound activation heads are required");
  for (const skill of SKILLS) {
    const release = RELEASES[skill];
    const activation = state.activations.find((row: any) => row.micro_skill_key === skill);
    const teaching = state.authorities.filter((row: any) => row.micro_skill_key === skill && row.authority_type === "teaching_content");
    if (!activation || activation.release_manifest_id !== release.id || activation.release_manifest_sha256 !== release.manifest || activation.activation_status !== "enabled") fail(`${skill} release activation drifted`);
    if (teaching.length !== 1 || teaching[0].authority_id !== release.teaching) fail(`${skill} teaching authority drifted`);
  }
  if (state.historicalActivationCount !== 0) fail("historical Separated/Hyphenated release was activated");
  if (state.proofAssignments.length !== 2 || state.proofAssignments.some((row: any) => row.status !== "completed")) fail("CW-3C-1 proof assignments drifted");
  if (state.schedules.authentic !== 4 || state.schedules.generated !== 0) fail("review-scheduling invariants drifted");
  if (state.duplicateLearningItemGroups.length || state.duplicateAssignmentGroups.length || state.unresolvedReadiness.length) fail("Compound learner state contains duplicate or unresolved rows");
  if (state.candidates.some((row: any) => row.route_id !== "compound_word_lab" || row.route_version !== "v2")) fail("Compound canonical intake uses a generic or historical route");
  if (state.assignments.some((row: any) => row.item_count !== 18 || row.route_id !== "compound_word_lab" || row.route_version !== "v2")) fail("Compound assignment route or shape drifted");
}

async function preflight(): Promise<any> {
  return withDb(async (db) => {
    const state = await snapshot(db);
    assertInvariantState(state);
    for (const skill of SKILLS) {
      const activation = state.activations.find((row: any) => row.micro_skill_key === skill);
      if (activation.current_revision_id !== RELEASES[skill].proofRevision || activation.readiness_report?.scope?.kind !== "child_allowlist") fail(`${skill} is not at the proven pre-rollout head`);
    }
    return { status: "preflight", ...state };
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
      await db.query("select pg_advisory_xact_lock(hashtext('cw-3c-2-compound-full-rollout'))");
      await db.query(sql);
      await db.query(`insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])`, [version, MIGRATION.replace(`${version}_`, "").replace(/\.sql$/u, ""), [sql]]);
      await db.query("commit");
      return { status: "applied", mainSha, version };
    } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  });
}

async function activate(): Promise<any> {
  const mainSha = exactMain();
  if (arg("--confirm") !== CONFIRM.activate) fail(`exact confirmation required: ${CONFIRM.activate}`);
  return withDb(async (db) => {
    await db.query("begin transaction isolation level serializable");
    try {
      await db.query("select pg_advisory_xact_lock(hashtext('cw-3c-2-compound-full-rollout'))");
      const state = await snapshot(db);
      assertInvariantState(state);
      const receipts = [];
      for (const skill of SKILLS) {
        const release = RELEASES[skill];
        const current = state.activations.find((row: any) => row.micro_skill_key === skill);
        const alreadyLive = current.readiness_report?.scope?.kind === "all_eligible";
        if (!alreadyLive && current.current_revision_id !== release.proofRevision) fail(`${skill} expected proof head changed`);
        const report = {
          schemaVersion: 1,
          scope: { kind: "all_eligible" },
          emergencyDisableAvailable: true,
          provenance: { task: "CW-3C-2", rollout: "all_eligible", mainSha },
        };
        const result = await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'production','enabled','allow_existing',$3::jsonb,$4,$5,$6) id`, [
          release.manifest, skill, report, current.current_revision_id,
          "Katie Sanderson / Codex CW-3C-2", "Compound Word v2 all-eligible Production rollout",
        ]);
        receipts.push({ microSkillKey: skill, releaseId: release.id, previousRevisionId: current.current_revision_id, revisionId: result.rows[0].id });
      }
      await db.query("commit");
      return { status: "enabled", mainSha, scope: { kind: "all_eligible" }, receipts };
    } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  });
}

async function safetyRevoke(): Promise<any> {
  const mainSha = exactMain();
  if (arg("--confirm") !== CONFIRM.revoke) fail(`exact confirmation required: ${CONFIRM.revoke}`);
  const requested = arg("--skill") ?? "all";
  const selected: CompoundWordSkill[] = requested === "all" ? [...SKILLS] : requested === "closed" ? [CLOSED] : requested === "separated" ? [SEPARATED] : fail("--skill must be closed, separated, or all");
  return withDb(async (db) => {
    await db.query("begin transaction isolation level serializable");
    try {
      const state = await snapshot(db);
      const receipts = [];
      for (const skill of selected) {
        const current = state.activations.find((row: any) => row.micro_skill_key === skill);
        const report = { schemaVersion: 1, scope: { kind: "all_eligible" }, emergencyDisableAvailable: true, provenance: { task: "CW-3C-2 emergency disable", mainSha } };
        const result = await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'production','safety_revoked','block_incomplete',$3::jsonb,$4,$5,$6) id`, [
          RELEASES[skill].manifest, skill, report, current.current_revision_id,
          "Katie Sanderson / Codex CW-3C-2", "CW-3C-2 emergency safety revocation",
        ]);
        receipts.push({ microSkillKey: skill, previousRevisionId: current.current_revision_id, revisionId: result.rows[0].id });
      }
      await db.query("commit");
      return { status: "safety_revoked", mainSha, receipts };
    } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  });
}

async function observe(): Promise<any> {
  return withDb(async (db) => {
    const state = await snapshot(db);
    assertInvariantState(state);
    if (state.activations.some((row: any) => row.readiness_report?.scope?.kind !== "all_eligible")) fail("both Compound heads are not all_eligible");
    const rolloutStartedAt = state.activations.map((row: any) => row.created_at).sort()[0];
    const generated = state.assignments.filter((row: any) => new Date(row.created_at) >= new Date(rolloutStartedAt));
    if (generated.some((row: any) => row.release_id === HISTORICAL_RELEASE || row.route_id !== "compound_word_lab" || row.item_count !== 18)) fail("new Compound work violated rollout authority");
    return {
      status: "observed",
      rolloutStartedAt,
      naturallyGeneratedAssignments: generated,
      emergencyDisableCommand: `npm run adle:compound-word-full-rollout:production -- safety-revoke --skill all --confirm ${CONFIRM.revoke}`,
      ...state,
    };
  });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "preflight";
  const result = command === "preflight" ? await preflight()
    : command === "migrate" ? await migrate()
      : command === "activate" ? await activate()
        : command === "safety-revoke" ? await safetyRevoke()
          : command === "observe" ? await observe()
            : fail("expected preflight, migrate, activate, safety-revoke, or observe");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
