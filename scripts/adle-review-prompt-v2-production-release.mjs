// Content-only publisher. No schema, update, delete, activation or scheduler path.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { canonicalJson } from "./build-adle-review-teaching-content.mjs";
import { approvedImportFingerprint, buildApprovedFiles } from "./build-adle-review-approved-content.mjs";

export const PROJECT = "wwohrqtunajrbwxyssjf";
export const RELEASE = "adle-review-writing-challenge-2026-08-26-v2";
export const PACKAGE_SHA = "9b53410602db3facb5addc3cf44486d815f323617de56bc8c27f22c9d4f525a6";
export const MANIFEST_SHA = "8baac80c2d3498a4dc4b90ad82a82d1f0ef764c86714e2cb356b5e629eed71d3";
export const CONFIRMATION = `publish:${PROJECT}:${RELEASE}:${PACKAGE_SHA}:approved-archived:REVIEW-V3-INACTIVE`;
const root = new URL("../", import.meta.url);
const directory = new URL("data/adle/review/writing-challenge/v2/", root);
const receipts = new URL("data/adle/review/writing-challenge/releases/2026-08-26-production-v2-inactive/", root);
const sha = value => createHash("sha256").update(value).digest("hex");
const fingerprint = value => sha(canonicalJson(value));
const read = (base, name) => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const guard = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { safeReleaseError: true }); };
const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const COLUMNS = ["stable_prompt_key", "challenge_type", "content_version", "prompt_text", "instruction_text", "configuration", "reuse_policy", "release_reference", "source_fingerprint", "review_status", "row_status"];

export function validateProductionUrl(value) {
  guard(Boolean(value), "production_connection_missing");
  let parsed;
  try { parsed = new URL(value); } catch { guard(false, "invalid_production_connection"); }
  guard(["postgres:", "postgresql:"].includes(parsed.protocol) &&
    decodeURIComponent(parsed.username) === `postgres.${PROJECT}` &&
    parsed.hostname.endsWith(".pooler.supabase.com") && parsed.pathname === "/postgres",
  "production_project_pin_mismatch");
  return value;
}

export function loadReleasePackage() {
  guard(sha(readFileSync(new URL("manifest.json", directory))) === MANIFEST_SHA, "v2_manifest_drift");
  guard(sha(readFileSync(new URL("adle_review_prompt_versions.import.json", directory))) === PACKAGE_SHA, "v2_import_drift");
  const files = buildApprovedFiles();
  for (const [name, expected] of Object.entries(files)) {
    guard(canonicalJson(read(directory, name)) === canonicalJson(expected), `v2_generated_drift:${name}`);
  }
  const authorisation = read(receipts, "authorisation.json");
  guard(authorisation.source === "explicit_user_message" && authorisation.project_ref === PROJECT &&
    authorisation.package_sha256 === PACKAGE_SHA && authorisation.manifest_sha256 === MANIFEST_SHA &&
    authorisation.release_reference === RELEASE && authorisation.row_count === 98 &&
    authorisation.target_review_status === "approved" && authorisation.target_row_status === "archived" &&
    authorisation.rollout_or_gate_changes_authorised === false && authorisation.schema_changes_authorised === false &&
    authorisation.updates_or_deletes_authorised === false && authorisation.learner_or_scheduler_changes_authorised === false &&
    authorisation.v3_water_addition_authorised === false, "inactive_release_authorisation_mismatch");
  const source = files["adle_review_prompt_versions.import.json"];
  guard(source.length === 98 && new Set(source.map(row => row.stable_prompt_key)).size === 98, "v2_package_count_mismatch");
  const rows = source.map(row => {
    guard(row.content_version === "v2" && row.release_reference === RELEASE && row.review_status === "approved" &&
      row.stable_prompt_key !== "CONUNDRUM-YXMchZeXnXw" && row.source_fingerprint === approvedImportFingerprint(row), "v2_row_contract_mismatch");
    return { ...row, row_status: "archived" };
  });
  return { rows, authorisation, operationalPayloadSha256: fingerprint(rows) };
}

export function planRows(expected, existing) {
  const expectedByKey = new Map(expected.map(row => [row.stable_prompt_key, row]));
  const videoKeys = new Map(expected.filter(row => row.challenge_type === "conundrums")
    .map(row => [row.configuration.youtube_video_id, row.stable_prompt_key]));
  const present = new Map();
  for (const row of existing) {
    const videoId = row.configuration?.youtube_video_id ?? row.configuration?.provenance?.youtube_video_id;
    const watchId = (row.configuration?.youtube_url ?? "").match(/^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/)?.[1];
    for (const id of [videoId, watchId].filter(Boolean)) {
      guard(!videoKeys.has(id) || videoKeys.get(id) === row.stable_prompt_key, "historic_video_identity_alias_conflict");
    }
    const desired = expectedByKey.get(row.stable_prompt_key);
    if (row.release_reference === RELEASE) guard(desired && row.content_version === "v2", "unexpected_v2_release_row");
    if (!desired || row.content_version !== "v2") continue;
    guard(!present.has(row.stable_prompt_key), "duplicate_v2_identity");
    const actual = Object.fromEntries(COLUMNS.map(column => [column, row[column]]));
    guard(canonicalJson(actual) === canonicalJson(desired), `existing_v2_content_or_status_conflict:${row.stable_prompt_key}`);
    present.set(row.stable_prompt_key, row);
  }
  return { missing: expected.filter(row => !present.has(row.stable_prompt_key)), existing: [...present.values()] };
}

const identifier = name => {
  guard(/^[a-z_][a-z0-9_]*$/.test(name), "unsafe_table_identifier");
  return `public."${name}"`;
};
async function protectedTables(db) {
  const result = await db.query(`select tablename from pg_tables where schemaname='public'
    and ((tablename like 'adle_review_%' and tablename <> 'adle_review_prompt_versions')
      or tablename = any($1::text[])) order by tablename`,
  [["daily_assignments", "assignment_items", "adle_today_session_orchestrations", "adle_specialist_stage_checkpoints"]]);
  const names = result.rows.map(row => row.tablename);
  for (const required of ["adle_review_r6_child_rollouts", "adle_review_r6_approval_receipts", "adle_review_sessions", "adle_review_schedule_words", "daily_assignments", "assignment_items"]) {
    guard(names.includes(required), `required_production_table_missing:${required}`);
  }
  return names;
}
async function digests(db, tables) {
  const result = await db.query(tables.map(name => `select '${name}'::text as table_name,
    count(*)::int as row_count,
    encode(sha256(convert_to(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),''),'UTF8')),'hex') as digest
    from ${identifier(name)} t`).join(" union all "));
  return Object.fromEntries(result.rows.map(({ table_name, ...value }) => [table_name, value]));
}
async function capture(db, accepted, tables) {
  const schema = await db.query(`select conname,pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid='public.adle_review_prompt_versions'::regclass order by conname`);
  guard(schema.rows.some(row => row.conname === "adle_review_prompt_versions_row_status_check" && row.definition.includes("'archived'")), "archived_state_not_supported");
  const insertTriggers = await db.query(`select count(*)::int count from pg_trigger
    where tgrelid='public.adle_review_prompt_versions'::regclass and not tgisinternal and (tgtype & 4) <> 0`);
  guard(insertTriggers.rows[0].count === 0, "unexpected_prompt_insert_side_effect_trigger");
  const rows = await db.query("select * from public.adle_review_prompt_versions order by stable_prompt_key,content_version");
  const rowPlan = planRows(accepted.rows, rows.rows);
  const counts = await db.query(`select
    (select count(*)::int from public.adle_review_r6_child_rollouts where rollout_state='active') as active_rollouts,
    (select count(*)::int from public.adle_review_prompt_versions where review_status='approved' and row_status='active') as selectable_prompts`);
  guard(counts.rows[0].active_rollouts === 0, "review_v3_is_already_active_stop_without_changes");
  const snapshot = {
    protected: await digests(db, tables),
    promptTable: (await digests(db, ["adle_review_prompt_versions"])).adle_review_prompt_versions,
    schemaFingerprint: fingerprint(schema.rows),
    ...counts.rows[0],
    existingExactRows: rowPlan.existing.length,
    missingKeys: rowPlan.missing.map(row => row.stable_prompt_key),
  };
  return { rowPlan, snapshot, planSha256: fingerprint(snapshot) };
}

export const INSERT_SQL = `insert into public.adle_review_prompt_versions (${COLUMNS.join(",")})
  select ${COLUMNS.join(",")} from jsonb_to_recordset($1::jsonb) as source(
    stable_prompt_key text,challenge_type text,content_version text,prompt_text text,
    instruction_text text,configuration jsonb,reuse_policy text,release_reference text,
    source_fingerprint text,review_status text,row_status text)
  returning id,stable_prompt_key,content_version,source_fingerprint,review_status,row_status`;

export async function runTransaction(db, accepted, mode, expectedPlanSha256) {
  const writes = ["rehearse", "apply"].includes(mode);
  guard(["plan", "rehearse", "apply", "verify"].includes(mode), "invalid_release_mode");
  // Writes lock every protected table before reading state. READ COMMITTED makes
  // the first captured state current after any lock wait, not a pre-lock snapshot.
  await db.query(writes ? "begin isolation level read committed" : "begin isolation level repeatable read read only");
  try {
    await db.query("set local statement_timeout = '30s'");
    await db.query("set local lock_timeout = '5s'");
    await db.query("set local idle_in_transaction_session_timeout = '45s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('adle-review-r1-r6-release',0))");
    const tables = await protectedTables(db);
    if (writes) {
      await db.query("lock table public.adle_review_prompt_versions in share row exclusive mode");
      await db.query(`lock table ${tables.map(identifier).join(",")} in share mode`);
    }
    const before = await capture(db, accepted, tables);
    if (writes) guard(expectedPlanSha256 === before.planSha256, "production_plan_changed");
    let inserted = [];
    if (writes && before.rowPlan.missing.length) {
      const result = await db.query(INSERT_SQL, [JSON.stringify(before.rowPlan.missing)]);
      inserted = result.rows;
      guard(inserted.length === before.rowPlan.missing.length, "insert_count_mismatch");
    }
    const after = writes ? await capture(db, accepted, tables) : before;
    if (mode !== "plan") guard(after.rowPlan.missing.length === 0 && after.rowPlan.existing.length === 98, "post_release_readback_incomplete");
    guard(fingerprint(before.snapshot.protected) === fingerprint(after.snapshot.protected), "protected_review_or_learner_state_changed");
    guard(before.snapshot.selectable_prompts === after.snapshot.selectable_prompts && after.snapshot.active_rollouts === 0, "release_changed_eligibility_or_rollout");
    const operation = await db.query("select txid_current()::text transaction_id,clock_timestamp()::text observed_at");
    const result = {
      mode, ...operation.rows[0], before: before.snapshot, after: after.snapshot,
      planSha256: before.planSha256, insertedRows: inserted.length,
      rows: after.rowPlan.existing.map(row => ({ id: row.id, stable_prompt_key: row.stable_prompt_key,
        content_version: row.content_version, source_fingerprint: row.source_fingerprint,
        review_status: row.review_status, row_status: row.row_status })),
      protectedStateUnchanged: true, reviewV3ActiveRollouts: 0,
      mutationCommitted: mode === "apply" && inserted.length > 0,
      transactionDisposition: mode === "apply" ? "committed" : "rolled_back",
    };
    await db.query(mode === "apply" ? "commit" : "rollback");
    return result;
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function withClient(fn) {
  const db = new pg.Client({connectionString: validateProductionUrl(process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED),
    ssl: {rejectUnauthorized: false}, connectionTimeoutMillis: 10000, application_name: "adle_review_v2_inactive_content_release"});
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}

async function main() {
  const mode = process.argv[2] ?? "validate";
  const accepted = loadReleasePackage();
  if (mode === "validate") {
    console.log(JSON.stringify({packageSha256: PACKAGE_SHA, rows: 98, targetStatus: "approved/archived", confirmation: CONFIRMATION}));
    return;
  }
  guard(arg("--environment") === "production", "explicit_production_environment_required");
  if (["rehearse", "apply"].includes(mode)) {
    guard(arg("--confirm") === CONFIRMATION && process.env.ADLE_REVIEW_PROMPT_V2_INACTIVE_APPROVAL === CONFIRMATION, "exact_inactive_publish_confirmation_required");
    guard(/^[a-f0-9]{64}$/.test(arg("--plan-sha256") ?? ""), "production_plan_hash_required");
  }
  const result = await withClient(db => runTransaction(db, accepted, mode, arg("--plan-sha256")));
  // Commit verification uses a fresh connection; never report success on submit alone.
  let readback = null;
  if (mode === "apply") {
    const committed = { ...result, independentReadback: "pending" };
    writeFileSync(new URL(`commit-${result.transaction_id}.json`, receipts), JSON.stringify(committed, null, 2) + "\n", {flag: "wx"});
    readback = await withClient(db => runTransaction(db, accepted, "verify"));
    guard(fingerprint(result.after) === fingerprint(readback.after), "fresh_connection_readback_drift");
  }
  if (mode === "rehearse") {
    readback = await withClient(db => runTransaction(db, accepted, "plan"));
    guard(result.planSha256 === readback.planSha256, "rehearsal_rollback_did_not_restore_baseline");
  }
  const receipt = {
    authorisationReference: accepted.authorisation.authorisation_reference,
    projectRef: PROJECT, releaseReference: RELEASE, packageSha256: PACKAGE_SHA, manifestSha256: MANIFEST_SHA,
    operationalPayloadSha256: accepted.operationalPayloadSha256,
    sourceGitHead: execFileSync("git", ["rev-parse", "HEAD"], {cwd: fileURLToPath(root), encoding: "utf8"}).trim(),
    runnerSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    ...result,
    independentReadback: readback,
  };
  const name = `${mode}-${Date.now()}.json`;
  writeFileSync(new URL(name, receipts), JSON.stringify(receipt, null, 2) + "\n", {flag: "wx"});
  console.log(JSON.stringify({mode, receipt: fileURLToPath(new URL(name, receipts)), planSha256: result.planSha256,
    existingExactRows: result.after.existingExactRows, missingRows: result.after.missingKeys.length,
    insertedRows: result.insertedRows, mutationCommitted: result.mutationCommitted,
    protectedStateUnchanged: true, reviewV3ActiveRollouts: 0, independentReadback: readback !== null}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify({status: "failed", error: error.safeReleaseError ? error.message : "release_failed_no_secrets_logged", sqlstate: error.code ?? null}));
    process.exitCode = 1;
  });
}
