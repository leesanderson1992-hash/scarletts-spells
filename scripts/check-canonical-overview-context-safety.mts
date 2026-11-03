/** Exercise the Production safety monitor after an exact-SHA release. */
import assert from "node:assert/strict";
import pg from "pg";

const sha = process.argv[2];
if (!sha || !/^[a-f0-9]{40}$/u.test(sha)) throw new Error("EXACT_RELEASE_SHA_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  const before = await db.query(`select a.deployment_sha from public.writing_context_shadow_policy p
    join public.writing_context_provider_approvals a on a.id=p.provider_approval_id where p.singleton`);
  assert.equal(before.rows[0]?.deployment_sha, sha);
  const monitor = await db.query("select public.monitor_writing_context_shadow() as safe");
  const after = await db.query("select public.writing_context_sitewide_status() as value");
  const site = after.rows[0]?.value;
  assert.equal(monitor.rows[0]?.safe, true);
  assert.equal(site?.providerApproval?.deploymentSha, sha);
  assert.equal(Number(site?.unrecordedSends), 0);
  assert.equal(site?.control?.enabled, false);
  console.log(JSON.stringify({ safetyMonitor: "passed", sha,
    aiControlEnabled: site.control.enabled, unrecordedSends: site.unrecordedSends }));
} finally {
  await db.end();
}
