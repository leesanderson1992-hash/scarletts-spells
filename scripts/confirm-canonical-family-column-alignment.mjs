#!/usr/bin/env node
/** Owner-confirmed, exact-source registry promotion. Dry-run rolls back. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

process.loadEnvFile(".env.local");
const version = "20261030100000";
const name = "confirm_canonical_family_column_alignment";
const migration = readFileSync(resolve("supabase/migrations", `${version}_${name}.sql`), "utf8");
const migrationSha256 = createHash("sha256").update(migration).digest("hex");
const packageRaw = readFileSync(resolve("../outputs/schwa-cluster-bulk-readiness-2026-10-29/canonical-family-live-import-package.json"), "utf8").trimEnd();
const packageSha256 = createHash("sha256").update(packageRaw).digest("hex");
if (packageSha256 !== "e186ebfaff78d3f101b5d13302dec4de8070666ef690962aae430dd9e4d1feeb")
  throw Error("CANONICAL_FAMILY_PACKAGE_CHANGED");
const pkg = JSON.parse(packageRaw);
const expected = new Set(pkg.groups.filter((group) => group.decision_status === "provisional_column_alignment")
  .map((group) => group.canonical_family_id));
if (expected.size !== 86) throw Error("CANONICAL_FAMILY_PROVISIONAL_SET_CHANGED");
const apply = process.argv.includes("--apply");
if (process.argv.slice(2).some((arg) => arg !== "--apply")) throw Error("Only --apply is supported");
const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!connectionString || !new URL(connectionString).hostname.endsWith("pooler.supabase.com"))
  throw Error("PRODUCTION_CONNECTION_NOT_VERIFIED");
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 120_000 });
await db.connect();
try {
  await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await db.query("SET LOCAL lock_timeout='5s'");
  const prior = await db.query(`select id from public.canonical_teaching_dictionary_base_family_registry
    where decision_status='owner_decision_interpreted' for update`);
  const actual = new Set(prior.rows.map((row) => row.id));
  if (actual.size !== 86 || [...expected].some((id) => !actual.has(id)))
    throw Error("CANONICAL_FAMILY_PROVISIONAL_IDS_CHANGED");
  const history = await db.query("select version from supabase_migrations.schema_migrations where version=$1", [version]);
  if (history.rowCount) throw Error("CANONICAL_FAMILY_CONFIRMATION_ALREADY_APPLIED");
  await db.query(migration.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""));
  const readback = await db.query(`select count(*)::int confirmed from public.canonical_teaching_dictionary_base_family_registry
    where id=any($1::uuid[]) and decision_status='owner_reviewed'
      and decision_reference like '%owner confirmed all 86 provisional mappings without exceptions in chat 2026-10-30'`, [[...expected]]);
  if (readback.rows[0].confirmed !== 86) throw Error("CANONICAL_FAMILY_CONFIRMATION_READBACK_FAILED");
  await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
    [version, name, [migration]]);
  if (apply) await db.query("COMMIT");
  else await db.query("ROLLBACK");
  const receipt = { environment: "production", applied: apply, version, migrationSha256, packageSha256,
    confirmedFamilies: 86, ownerDecision: "2026-10-30 chat: all 86 mappings confirmed without exceptions" };
  if (apply) writeFileSync(resolve("../outputs/schwa-cluster-bulk-readiness-2026-10-29/canonical-family-confirmation-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await db.end();
}
