/** Apply only the four reviewed contextual route migrations to Production. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const mode = process.argv[2] ?? "plan";
if (!(["plan", "apply"] as const).includes(mode as "plan" | "apply"))
  throw new Error("usage: release-homophone-contextual-schema.mts plan|apply");
const root = resolve(import.meta.dirname, "..");
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("contextual_homophone_production_connection_missing");
const connectionString = env.slice(env.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf")
  || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("contextual_homophone_production_target_mismatch");
const migrations = [
  "20261024160000_adle_homophone_contextual_release",
  "20261024161000_adle_homophone_contextual_route",
  "20261024162000_adle_homophone_contextual_evidence",
  "20261024163000_adle_homophone_contextual_activation",
  "20261024164000_adle_homophone_contextual_canonical_hash",
  "20261024165000_adle_homophone_contextual_authority_hash_check",
  "20261024166000_adle_homophone_contextual_item_outcomes",
] as const;
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000 });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  await client.query("select pg_advisory_xact_lock(hashtext('homophone-contextual-schema-v1'))");
  const done = await client.query<{ version: string }>(`select version
    from supabase_migrations.schema_migrations where version=any($1::text[])`,
    [migrations.map(name => name.slice(0, 14))]);
  const completed = new Set(done.rows.map(row => row.version));
  const firstPending = migrations.findIndex(name => !completed.has(name.slice(0, 14)));
  if (migrations.slice(firstPending < 0 ? migrations.length : firstPending)
    .some(name => completed.has(name.slice(0, 14))))
    throw new Error("contextual_homophone_noncontiguous_schema_release_requires_review");
  if (firstPending < 0) {
    console.log(JSON.stringify({ environment: "production", status: "already_applied",
      migrations: migrations.length, mutationPerformed: false }));
    await client.query("rollback");
  } else {
    for (const name of migrations.slice(firstPending)) {
      const sql = readFileSync(resolve(root, `supabase/migrations/${name}.sql`), "utf8")
        .replace(/^begin;\s*$/m, "")
        .replace(/^commit;\s*$/m, "");
      await client.query(sql);
      if (mode === "apply") await client.query(`insert into supabase_migrations.schema_migrations(version,name)
        values($1,$2)`, [name.slice(0, 14), name.slice(15)]);
    }
    if (mode === "apply") {
      await client.query("commit");
      console.log(JSON.stringify({ environment: "production", status: "applied",
        migrations: migrations.length, mutationPerformed: true }));
    } else {
      await client.query("rollback");
      console.log(JSON.stringify({ environment: "production", status: "dry_run_valid",
        migrations: migrations.length, mutationPerformed: false }));
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally { await client.end(); }
