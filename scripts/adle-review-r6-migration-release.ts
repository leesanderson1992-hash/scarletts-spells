#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import pg from "pg";

import { formatMigrationFailureDiagnostic } from "./lib/adle-review-migration-diagnostics";

const PRODUCTION_PROJECT_REF = "wwohrqtunajrbwxyssjf";
const DATABASE_URL_ENV = "SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED";
const APPROVAL_ENV = "ADLE_REVIEW_R6_GATE_A_APPROVAL";
const MIGRATIONS = [
  "20260824120000_add_adle_review_r1_foundations.sql",
  "20260824130000_add_adle_review_r3_retrieval_rpcs.sql",
  "20260824140000_add_adle_review_r31_learner_attribution.sql",
  "20260825120000_add_adle_review_r4_word_repair.sql",
  "20260825130000_add_adle_review_r5_finalization.sql",
  "20260825140000_add_adle_review_r6_unified_session.sql",
] as const;

const entries = MIGRATIONS.map((filename) => {
  const sql = readFileSync(resolve("supabase/migrations", filename), "utf8");
  return { filename, sql, sha256: createHash("sha256").update(sql).digest("hex") };
});
const manifestSha256 = createHash("sha256")
  .update(JSON.stringify(entries.map(({ filename, sha256 }) => ({ filename, sha256 }))))
  .digest("hex");

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function productionUrl(): string {
  const value = process.env[DATABASE_URL_ENV]?.trim();
  if (!value) throw new Error(`Missing ${DATABASE_URL_ENV}`);
  const parsed = new URL(value);
  if (!parsed.username.includes(PRODUCTION_PROJECT_REF)
    || !parsed.hostname.endsWith("pooler.supabase.com")) {
    throw new Error(`R6 release runner is pinned to Production ${PRODUCTION_PROJECT_REF}`);
  }
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--preflight")) {
    console.log(JSON.stringify({ mode: "manifest", manifestSha256,
      migrations: entries.map(({ filename, sha256 }) => ({ filename, sha256 })),
      mutationPerformed: false }, null, 2));
    return;
  }
  if (argument("--environment") !== "production") throw new Error("Use --environment production");
  const mergedSha = argument("--merged-sha");
  const currentSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!mergedSha || mergedSha !== currentSha || !/^[a-f0-9]{40}$/.test(mergedSha)) {
    throw new Error("--merged-sha must equal the exact checked-out merged commit");
  }
  if (argument("--manifest-sha256") !== manifestSha256) {
    throw new Error(`--manifest-sha256 must equal ${manifestSha256}`);
  }
  const confirmation = ["ADLE-REVIEW-R6-GATE-A", PRODUCTION_PROJECT_REF,
    mergedSha, manifestSha256, "REVIEW-V3-INACTIVE"].join(":");
  if (apply && (argument("--confirm") !== confirmation || process.env[APPROVAL_ENV] !== confirmation)) {
    throw new Error(`Apply requires --confirm '${confirmation}' and matching ${APPROVAL_ENV}`);
  }

  const client = new pg.Client({ connectionString: productionUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(apply ? "begin" : "begin read only");
    await client.query("select pg_advisory_xact_lock(hashtextextended('adle-review-r1-r6-release',0))");
    const versions = entries.map(({ filename }) => filename.slice(0, 14));
    const ledger = await client.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations where version = any($1::text[]) order by version",
      [versions],
    );
    const applied = ledger.rows.map((row) => row.version);
    const expectedPrefix = versions.slice(0, applied.length);
    if (JSON.stringify(applied) !== JSON.stringify(expectedPrefix)) {
      throw new Error(`R1-R6 migration history is non-prefix/ambiguous: ${applied.join(",")}`);
    }
    const preflight = await client.query<{ duplicate_days: string; rollout_table: string | null }>(`
      select (select count(*)::text from (select child_id,assignment_date from public.daily_assignments
          where title in ('ADLE Daily Plan','ADLE Base-word Family Pilot')
          group by child_id,assignment_date having count(*)>1) conflicts) as duplicate_days,
        to_regclass('public.adle_review_r6_child_rollouts')::text as rollout_table
    `);
    const activeScope = preflight.rows[0]?.rollout_table
      ? (await client.query<{ count: string }>(
          "select count(*)::text as count from public.adle_review_r6_child_rollouts where rollout_state='active'",
        )).rows[0]?.count ?? "unknown"
      : "0";
    if (activeScope !== "0") throw new Error("R6 schema release requires zero active learner scope");
    if (!apply) {
      await client.query("rollback");
      console.log(JSON.stringify({ mode: "production_read_only_preflight", manifestSha256,
        appliedPrefix: applied, pending: entries.slice(applied.length).map((entry) => entry.filename),
        duplicateRecognizedDays: preflight.rows[0]?.duplicate_days ?? "unknown",
        activeScope, mutationPerformed: false,
        requiredApplyConfirmation: confirmation }, null, 2));
      return;
    }
    for (const entry of entries.slice(applied.length)) {
      try {
        await client.query(entry.sql);
      } catch (error) {
        throw new Error(formatMigrationFailureDiagnostic(entry.filename, entry.sql, error), { cause: error });
      }
      const version = entry.filename.slice(0, 14);
      const name = basename(entry.filename, ".sql").slice(15);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version,name) values($1,$2)",
        [version, name],
      );
    }
    const verification = await client.query<{ applied_count: string; active_scope: string }>(`
      select (select count(*)::text from supabase_migrations.schema_migrations
        where version = any($1::text[])) as applied_count,
        (select count(*)::text from public.adle_review_r6_child_rollouts
          where rollout_state='active') as active_scope
    `, [versions]);
    if (verification.rows[0]?.applied_count !== String(entries.length)
      || verification.rows[0]?.active_scope !== "0") {
      throw new Error(`R6 post-apply verification failed: ${JSON.stringify(verification.rows[0])}`);
    }
    await client.query("commit");
    console.log(JSON.stringify({ mode: "applied", manifestSha256,
      verification: verification.rows[0], reviewV3ActiveScope: 0 }, null, 2));
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
