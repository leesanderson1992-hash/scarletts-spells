/** Governed homophone release for a single disposable production canary child.
 * Run with NODE_OPTIONS=--conditions=react-server npx tsx scripts/adle-homophone-production-release.ts
 * Commands: inspect | install | publish | enable | disable. Mutations require --apply.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { assertApprovedHomophoneContent } from "../lib/adle/homophone/approved-content";
import { HOMOPHONE_LESSONS } from "../lib/adle/homophone/lesson";
import { buildHomophoneReleasePackage } from "../lib/adle/homophone/release";
import { childAllowlistActivationReport } from "../lib/adle/route-activation-scope";

const PROJECT_REF = "wwohrqtunajrbwxyssjf";
const RELEASE_KEY = "d4-hom-v4-approved-2026-10-12";
const MIGRATIONS = [
  "20261012160000_adle_homophone_balloon_bests.sql",
  "20261012170000_adle_homophone_route_v2.sql",
  "20261012170500_adle_homophone_release_v2.sql",
  "20261012171000_adle_homophone_finish_v2.sql",
  "20261012171500_adle_homophone_activation_dependency_count.sql",
] as const;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function assert(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }
function migrationBody(file: string): string {
  const sql = readFileSync(resolve("supabase/migrations", file), "utf8");
  return sql.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
}

async function main() {
  loadEnvConfig(process.cwd());
  const command = process.argv[2];
  assert(["inspect", "install", "publish", "enable", "disable"].includes(command), "homophone_release_command_invalid");
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  assert(url, "homophone_production_connection_unavailable");
  const target = new URL(url);
  assert(target.username.includes(PROJECT_REF) && target.hostname.endsWith("pooler.supabase.com"), "homophone_production_target_mismatch");
  assertApprovedHomophoneContent();
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await db.connect();
  try {
    await db.query(apply ? "begin" : "begin read only");
    await db.query("set local lock_timeout = '5s'");
    await db.query("set local statement_timeout = '45s'");
    const versions = MIGRATIONS.map(file => file.slice(0, 14));
    const ledger = await db.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations where version=any($1::text[]) order by version", [versions]);
    const applied = ledger.rows.map(row => row.version);
    assert(JSON.stringify(applied) === JSON.stringify(versions.slice(0, applied.length)), "homophone_migration_ledger_not_prefix");
    if (command === "install") {
      if (!apply) { console.log(JSON.stringify({ command, target: "production", applied, pending: MIGRATIONS.slice(applied.length), mutationPerformed: false })); await db.query("rollback"); return; }
      for (const file of MIGRATIONS.slice(applied.length)) {
        await db.query(migrationBody(file));
        await db.query("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [file.slice(0, 14), file.slice(15, -4)]);
      }
      const check = await db.query<{ n: number }>("select count(*)::int n from supabase_migrations.schema_migrations where version=any($1::text[])", [versions]);
      assert(check.rows[0]?.n === MIGRATIONS.length, "homophone_migration_readback_failed");
      await db.query("commit");
      console.log(JSON.stringify({ command, target: "production", appliedCount: check.rows[0].n, activation: "inactive" }));
      return;
    }
    const release = await db.query<{ id: string; release_manifest_sha256: string }>(
      "select id,release_manifest_sha256 from adle_curriculum_release_manifests where release_key=$1", [RELEASE_KEY]);
    if (command === "inspect") {
      const states = release.rows.length ? await db.query<{ micro_skill_key: string; activation_status: string }>(`
        select head.micro_skill_key,revision.activation_status from adle_route_activation_heads head
        join adle_route_activation_revisions revision on revision.id=head.current_revision_id
        where head.environment_key='production' and head.route_id='homophone_word_lab' and head.route_version='v2'`) : null;
      console.log(JSON.stringify({ command, target: "production", applied, releasePublished: release.rows.length === 1,
        activationStates: states?.rows ?? [], mutationPerformed: false }));
      await db.query("rollback"); return;
    }
    assert(applied.length === MIGRATIONS.length, "homophone_migrations_not_installed");
    if (command === "publish") {
      const words = [...new Set(HOMOPHONE_LESSONS.flatMap(lesson => lesson.words.map(word => word.word)))];
      const canonical = await db.query<{ id: string; display_word: string }>(`
        select id,display_word from canonical_teaching_dictionary_words
        where display_word=any($1::text[]) and dialect_code='en-GB' and row_status='active'
          and review_status='approved_for_first_exposure'`, [words]);
      const bindings: Record<string, Record<string, string>> = {};
      for (const lesson of HOMOPHONE_LESSONS) {
        bindings[lesson.microSkillKey] = {};
        for (const word of lesson.words) {
          const matches = canonical.rows.filter(row => row.display_word === word.word);
          assert(matches.length === 1, `homophone_canonical_word_ambiguous:${word.word}`);
          bindings[lesson.microSkillKey][word.word] = matches[0].id;
        }
      }
      const pkg = buildHomophoneReleasePackage({ releaseKey: RELEASE_KEY,
        approvalRefs: ["owner-approved-homophone-teaching-content-2026-10-12"], canonicalWords: bindings });
      const bytes = `${JSON.stringify(pkg, null, 2)}\n`;
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (!apply) { console.log(JSON.stringify({ command, target: "production", packageSha256: sha,
        authorityCount: pkg.authorities.length, mutationPerformed: false })); await db.query("rollback"); return; }
      const output = resolve("data/adle/releases/d4-hom-v4/package.json");
      mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, bytes);
      const published = await db.query<{ id: string }>("select publish_adle_homophone_package_v2($1::jsonb,$2,$3) id",
        [pkg, sha, "Katie Sanderson approved homophone v4"]);
      assert(published.rows[0]?.id, "homophone_package_publish_failed");
      await db.query("commit");
      console.log(JSON.stringify({ command, target: "production", releaseId: published.rows[0].id,
        packageSha256: sha, authorityCount: pkg.authorities.length, activation: "inactive" }));
      return;
    }
    assert(release.rows.length === 1, "homophone_release_not_published");
    const childId = argument("--child-id");
    assert(childId, "homophone_canary_child_id_required");
    const report = childAllowlistActivationReport([childId]);
    const child = await db.query<{ id: string }>("select id from children where id=$1 and is_archived=false", [childId]);
    assert(child.rows.length === 1, "homophone_canary_child_unavailable");
    const status = command === "enable" ? "enabled" : "safety_revoked";
    const heads = await db.query<{ micro_skill_key: string; current_revision_id: string; release_manifest_id: string }>(`
      select head.micro_skill_key,head.current_revision_id,revision.release_manifest_id from adle_route_activation_heads head
      join adle_route_activation_revisions revision on revision.id=head.current_revision_id
      where head.environment_key='production' and head.route_id='homophone_word_lab' and head.route_version='v2'`);
    assert(heads.rows.every(row => row.release_manifest_id === release.rows[0].id), "homophone_foreign_release_active");
    if (!apply) { console.log(JSON.stringify({ command, target: "production", childId, skillCount: HOMOPHONE_LESSONS.length,
      currentHeads: heads.rows.length, mutationPerformed: false })); await db.query("rollback"); return; }
    for (const lesson of HOMOPHONE_LESSONS) {
      const current = heads.rows.find(row => row.micro_skill_key === lesson.microSkillKey);
      await db.query("select set_adle_route_activation_revision_v2($1,$2,'production',$3,$4,$5::jsonb,$6,$7,$8)", [
        release.rows[0].release_manifest_sha256, lesson.microSkillKey, status,
        status === "enabled" ? "allow_existing" : "block_incomplete", report,
        current?.current_revision_id ?? null, "homophone-production-canary",
        `Approved v4 homophone ${command} for disposable canary child`,
      ]);
    }
    const check = await db.query<{ n: number }>(`
      select count(*)::int n from adle_route_activation_heads head
      join adle_route_activation_revisions revision on revision.id=head.current_revision_id
      where head.environment_key='production' and head.route_id='homophone_word_lab' and head.route_version='v2'
        and revision.activation_status=$1 and revision.release_manifest_id=$2`, [status, release.rows[0].id]);
    assert(check.rows[0]?.n === HOMOPHONE_LESSONS.length, "homophone_activation_readback_failed");
    await db.query("commit");
    console.log(JSON.stringify({ command, target: "production", childId, skillCount: check.rows[0].n, status }));
  } catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
  finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
