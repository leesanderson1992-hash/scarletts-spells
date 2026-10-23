// Applies only the additive, inactive Phase 1 migrations to Production.
// It never approves content, enables a route, or retires a source skill.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

if (process.argv[2] !== "--apply") throw new Error("Pass --apply after reviewing the migration and baseline");
const root = resolve(import.meta.dirname, "..");
const files = [
  ["20261023150000", "homophone_convergence_foundations"],
  ["20261023151000", "homophone_convergence_draft_catalog"],
  ["20261023152000", "homophone_convergence_draft_redirects"],
  ["20261023153000", "homophone_assignment_snapshot_set_binding"],
];
const migration = files.map(([version, name]) => {
  const source = readFileSync(resolve(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
  if (!/^begin;\s/i.test(source) || !/\bcommit;\s*$/i.test(source)) throw new Error(`Transaction wrapper changed: ${version}`);
  return { version, name, body: source.replace(/^begin;\s*/i, "").replace(/\bcommit;\s*$/i, "") };
});
const baseline = JSON.parse(readFileSync(resolve(root, "data/adle/homophone/convergence-v1/production-baseline.json"), "utf8"));
if (baseline.catalog.length !== 16 || baseline.activationHeads.length !== 14) throw new Error("Unexpected baseline");
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("Production connection unavailable");
let connectionString = env.slice(env.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
  connectionString = connectionString.slice(1, -1);
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query("begin");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  await client.query("select pg_advisory_xact_lock(hashtext('homophone-convergence-phase1'))");
  const latest = await client.query("select max(version) as version from supabase_migrations.schema_migrations");
  if (!["20261022223000", "20261023151000", "20261023152000"].includes(latest.rows[0].version)) {
    throw new Error("Migration ledger changed since baseline");
  }
  const current = await client.query("select count(*)::integer n from public.micro_skill_catalog where micro_skill_key like 'D4_HOM_%'");
  if (current.rows[0].n !== (latest.rows[0].version === "20261022223000" ? 16 : 74)) {
    throw new Error("Homophone catalog changed since baseline");
  }
  for (const item of migration.filter(item => item.version > latest.rows[0].version)) {
    await client.query(item.body);
    await client.query(`insert into supabase_migrations.schema_migrations(version,statements,name)
      values($1,$2::text[],$3)`, [item.version, [item.body], item.name]);
  }
  const result = await client.query(`select count(*)::integer total,
      count(*) filter(where is_active or is_assignable)::integer enabled
    from public.micro_skill_catalog where micro_skill_key like 'D4_HOM_%'`);
  if (result.rows[0].total !== 74 || result.rows[0].enabled !== 15) {
    throw new Error(`Catalog postflight mismatch: ${JSON.stringify(result.rows[0])}`);
  }
  const redirects = await client.query("select count(*)::integer n from public.homophone_skill_redirects where redirect_status='draft'");
  if (redirects.rows[0].n !== 8) throw new Error("Draft redirect postflight mismatch");
  await client.query("commit");
  console.log("Applied Phase 1 foundations, 58 inactive catalog keys, and eight draft redirects; existing activation unchanged");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
