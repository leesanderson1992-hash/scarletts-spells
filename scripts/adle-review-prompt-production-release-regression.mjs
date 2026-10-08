import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadReleasePackage, planRows, validateProductionUrl, runTransaction, INSERT_SQL, PROJECT } from "./adle-review-prompt-v2-production-release.mjs";
import { canonicalJson } from "./build-adle-review-teaching-content.mjs";
import { approvedImportFingerprint } from "./build-adle-review-approved-content.mjs";

const accepted = loadReleasePackage();
const hash = value => createHash("sha256").update(canonicalJson(value)).digest("hex");
let groups = 0;
async function test(name, run) { await run(); groups += 1; console.log(`PASS ${name}`); }

await test("exact v2 content becomes approved/archived without changing semantic fingerprints", () => {
  assert.equal(accepted.rows.length, 98);
  assert.equal(accepted.rows.filter(row => row.challenge_type === "conundrums").length, 62);
  assert.ok(!accepted.rows.some(row => row.stable_prompt_key === "CONUNDRUM-YXMchZeXnXw"));
  for (const row of accepted.rows) {
    assert.equal(row.content_version, "v2");
    assert.equal(row.review_status, "approved");
    assert.equal(row.row_status, "archived");
    assert.equal(row.source_fingerprint, approvedImportFingerprint(row));
  }
  assert.match(INSERT_SQL, /^insert into public\.adle_review_prompt_versions/);
  assert.doesNotMatch(INSERT_SQL, /\b(update|delete|alter|create|activate)\b/i);
});

await test("production connection pin rejects lookalike hosts and wrong project identities", () => {
  const valid = `postgresql://postgres.${PROJECT}:not-a-real-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`;
  assert.equal(validateProductionUrl(valid), valid);
  for (const value of [undefined, "invalid", valid.replace(PROJECT, "anotherproject"),
    valid.replace("pooler.supabase.com", "pooler.supabase.com.attacker.test"),
    valid.replace("/postgres", "/another_database"), valid.replace("postgresql:", "https:")]) {
    assert.throws(() => validateProductionUrl(value));
  }
});

await test("idempotent rows are reused; content/status drift and video aliases are rejected", () => {
  const existing = accepted.rows.slice(0, 2).map((row, index) => ({...structuredClone(row), id: `existing-${index}`, created_at: "ignored"}));
  assert.equal(planRows(accepted.rows, existing).missing.length, 96);
  assert.equal(planRows(accepted.rows, accepted.rows).missing.length, 0);
  for (const change of [
    row => { row.prompt_text += " Changed."; },
    row => { row.row_status = "active"; },
    row => { row.review_status = "draft"; },
    row => { row.configuration.top_tip = "Different tip"; },
  ]) {
    const row = structuredClone(accepted.rows[0]); change(row);
    assert.throws(() => planRows(accepted.rows, [row]));
  }
  const conundrum = accepted.rows.find(row => row.challenge_type === "conundrums");
  assert.throws(() => planRows(accepted.rows, [{...conundrum, stable_prompt_key: "OTHER-VIDEO-ALIAS"}]), /identity_alias/);
  assert.throws(() => planRows(accepted.rows, [accepted.rows[0], accepted.rows[0]]), /duplicate/);
});

// In-memory query double exercises transaction failure paths; the live rehearsal
// separately checks real PostgreSQL constraints and rollback without persisting rows.
class FakeDb {
  constructor() { this.rows = []; this.log = []; this.protectedRevision = 0; this.failInsert = false; this.changeProtectedOnInsert = false; }
  async query(sql, values = []) {
    this.log.push(sql);
    if (sql.startsWith("begin")) { this.backup = structuredClone(this.rows); this.savedRevision = this.protectedRevision; }
    else if (sql === "rollback") { if (this.backup) this.rows = this.backup; this.protectedRevision = this.savedRevision ?? this.protectedRevision; this.backup = null; }
    else if (sql === "commit") this.backup = null;
    else if (sql.includes("select tablename from pg_tables")) return {rows: ["adle_review_r6_child_rollouts", "adle_review_r6_approval_receipts", "adle_review_sessions", "adle_review_schedule_words", "daily_assignments", "assignment_items"].map(tablename => ({tablename}))};
    else if (sql.includes("select conname,pg_get_constraintdef")) return {rows: [{conname: "adle_review_prompt_versions_row_status_check", definition: "CHECK (row_status IN ('active','archived','superseded'))"}]};
    else if (sql.includes("from pg_trigger")) return {rows: [{count: 0}]};
    else if (sql.startsWith("select * from public.adle_review_prompt_versions")) return {rows: structuredClone(this.rows)};
    else if (sql.includes("as active_rollouts")) return {rows: [{active_rollouts: 0, selectable_prompts: this.rows.filter(row => row.row_status === "active" && row.review_status === "approved").length}]};
    else if (sql.includes("as table_name")) return {rows: [...sql.matchAll(/select '([a-z0-9_]+)'::text as table_name/g)].map(([, name]) => ({table_name: name, row_count: name === "adle_review_prompt_versions" ? this.rows.length : 0, digest: hash(name === "adle_review_prompt_versions" ? this.rows : this.protectedRevision)}))};
    else if (sql === INSERT_SQL) {
      if (this.failInsert) throw Object.assign(new Error("simulated database failure"), {code: "23514"});
      const inserted = JSON.parse(values[0]).map((row, index) => ({...row, id: `inserted-${index}`}));
      this.rows.push(...inserted);
      if (this.changeProtectedOnInsert) this.protectedRevision += 1;
      return {rows: inserted};
    } else if (sql.startsWith("select txid_current")) return {rows: [{transaction_id: "fixture", observed_at: "fixture"}]};
    return {rows: []};
  }
}

await test("rehearsal inserts/readbacks all rows and rolls back to the exact baseline", async () => {
  const db = new FakeDb();
  const plan = await runTransaction(db, accepted, "plan");
  const rehearsal = await runTransaction(db, accepted, "rehearse", plan.planSha256);
  assert.equal(rehearsal.after.existingExactRows, 98);
  assert.equal(rehearsal.mutationCommitted, false);
  assert.equal(db.rows.length, 0);
  assert.equal(db.log.at(-1), "rollback");
});

await test("apply commits, verification reads exact rows, repeat apply is a no-op", async () => {
  const db = new FakeDb();
  const plan = await runTransaction(db, accepted, "plan");
  const applied = await runTransaction(db, accepted, "apply", plan.planSha256);
  assert.equal(applied.mutationCommitted, true);
  assert.equal(db.log.at(-1), "commit");
  const verified = await runTransaction(db, accepted, "verify");
  assert.equal(verified.after.existingExactRows, 98);
  const replay = await runTransaction(db, accepted, "apply", verified.planSha256);
  assert.equal(replay.insertedRows, 0);
  assert.equal(replay.mutationCommitted, false);
});

await test("stale plans, insert errors and protected-state drift roll back without publication", async () => {
  for (const failure of ["stale", "insert", "protected"]) {
    const db = new FakeDb();
    const plan = await runTransaction(db, accepted, "plan");
    if (failure === "insert") db.failInsert = true;
    if (failure === "protected") db.changeProtectedOnInsert = true;
    await assert.rejects(runTransaction(db, accepted, "apply", failure === "stale" ? "0".repeat(64) : plan.planSha256));
    assert.equal(db.log.at(-1), "rollback");
    assert.equal(db.rows.length, 0);
    assert.equal(db.protectedRevision, 0);
    assert.ok(!db.log.includes("commit"));
    if (failure === "stale") assert.ok(!db.log.includes(INSERT_SQL));
  }
});

console.log(`ADLE Review prompt production release: ${groups} regression groups passed.`);
