/** Fixed-staging-only S8 migration guard. Never accepts another project ref. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const STAGING_REF = "jlhotktspjvffslvuyfz";
const migrationName = "20260907120000_add_whole_writing_context_validation.sql";
const migrationVersion = migrationName.slice(0, 14);
const requiredPredecessors = [
  "20260906100000", "20260906110000", "20260906120000", "20260906130000",
  "20260906140000", "20260906150000", "20260906160000", "20260906170000",
  "20260906180000", "20260906190000", "20260907100000", "20260907110000",
];
const root = await mkdtemp(join(tmpdir(), "writing-s8-staging-migration-"));
const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
const sha256 = createHash("sha256").update(sql).digest("hex");

async function query(statement) {
  const file = join(root, "query.sql");
  await writeFile(file, statement, { mode: 0o600 });
  const { stdout } = await promisify(execFile)(
    "npx",
    ["--yes", "supabase@2.116.0", "db", "query", "--linked", "--project-ref", STAGING_REF, "--output", "json", "--file", file],
    { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const result = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
  assert.ok(Array.isArray(result.rows), "SQL response missing rows");
  return result.rows;
}

try {
  const predecessorList = requiredPredecessors.map((version) => `'${version}'`).join(",");
  const predecessorRows = await query(`select version from supabase_migrations.schema_migrations
    where version in (${predecessorList}) order by version;`);
  assert.deepEqual(predecessorRows.map((row) => row.version), requiredPredecessors, "S8 staging predecessors are incomplete");

  const existing = await query(`select version,name,statements from supabase_migrations.schema_migrations
    where version='${migrationVersion}';`);
  if (existing.length) {
    assert.equal(existing.length, 1);
    const recorded = Array.isArray(existing[0].statements) ? existing[0].statements.join("\n") : "";
    assert.equal(createHash("sha256").update(recorded).digest("hex"), sha256, "Applied S8 migration differs from this branch");
    console.log(JSON.stringify({ status: "already_applied", project: STAGING_REF, version: migrationVersion, sha256 }));
  } else if (!process.argv.includes("--apply")) {
    const guards = await query(`select
      to_regclass('public.writing_context_family_releases') is null as context_schema_absent,
      not exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='writing_shadow_controls' and column_name='context_processing_enabled') as controls_absent;`);
    assert.deepEqual(guards[0], { context_schema_absent: true, controls_absent: true });
    console.log(JSON.stringify({ status: "ready", project: STAGING_REF, version: migrationVersion, sha256 }));
  } else {
    assert.ok(!sql.includes("$writing_s8_migration$"), "Migration contains reserved ledger delimiter");
    const applied = await query(`begin;
      set local lock_timeout='5s'; set local statement_timeout='60s';
      do $$ begin
        if to_regclass('public.writing_context_family_releases') is not null then
          raise exception 'unledgered_s8_context_schema';
        end if;
      end $$;
      ${sql}
      insert into supabase_migrations.schema_migrations(version,name,statements)
      values('${migrationVersion}','${migrationName.slice(15, -4)}',array[$writing_s8_migration$${sql}$writing_s8_migration$]);
      notify pgrst,'reload schema';
      commit;
      select version,name from supabase_migrations.schema_migrations where version='${migrationVersion}';`);
    assert.equal(applied.length, 1);
    const proof = await query(`select
      (select count(*)::integer from public.writing_context_family_releases) as releases,
      (select count(*)::integer from public.writing_context_family_selection_events) as selections,
      (select count(*)::integer from public.writing_context_family_approval_events) as approvals,
      (select count(*)::integer from public.writing_shadow_controls
        where context_processing_enabled or context_retrospective_enabled or context_review_enabled) as enabled_controls;`);
    assert.deepEqual(proof[0], { releases: 4, selections: 12, approvals: 0, enabled_controls: 0 });
    console.log(JSON.stringify({ status: "applied", project: STAGING_REF, version: migrationVersion, sha256, proof: proof[0] }));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
