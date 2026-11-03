/** Read-only Production release receipt after the next scheduled recovery tick. */
import assert from "node:assert/strict";
import pg from "pg";

const [sha, approvalId, sinceText] = process.argv.slice(2);
const since = new Date(sinceText ?? "");
if (!sha || !/^[a-f0-9]{40}$/u.test(sha) || !approvalId
  || !/^[a-f0-9-]{36}$/u.test(approvalId) || Number.isNaN(since.getTime()))
  throw new Error("EXACT_RELEASE_SHA_APPROVAL_AND_SINCE_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin read only");
  const status = await db.query("select public.writing_context_sitewide_status() as value");
  const scheduler = await db.query(`select enabled,approved_deployment_sha,cron_job_id,last_request_id,last_dispatched_at
    from public.writing_context_recovery_scheduler where singleton`);
  const cron = await db.query(`select jobid,status,start_time,end_time from cron.job_run_details
    where start_time >= $1 order by start_time desc limit 10`, [since.toISOString()]);
  const attempts = await db.query(`select
      (select count(*)::int from public.writing_context_ai_attempts where created_at >= $1) course,
      (select count(*)::int from public.adle_review_context_attempts where recorded_at >= $1) adle`,
    [since.toISOString()]);
  const site = status.rows[0]?.value;
  const job = scheduler.rows[0];
  assert.equal(site?.policy?.providerApprovalId, approvalId);
  assert.equal(site?.providerApproval?.deploymentSha, sha);
  assert.equal(site?.scheduler?.deploymentSha, sha);
  assert.equal(site?.control?.enabled, false);
  assert.equal(Number(site?.unrecordedSends), 0);
  assert.equal(job?.enabled, true);
  assert.equal(job?.approved_deployment_sha, sha);
  const latest = cron.rows.find((row) => String(row.jobid) === String(job.cron_job_id));
  assert(latest, "No scheduler tick observed after release");
  assert.equal(latest.status, "succeeded");
  const response = await db.query(`select status_code,timed_out,error_msg from net._http_response
    where id=$1`, [job.last_request_id]);
  assert.equal(response.rows[0]?.status_code, 200);
  assert.equal(response.rows[0]?.timed_out, false);
  assert.equal(response.rows[0]?.error_msg, null);
  console.log(JSON.stringify({ status: "passed", sha, approvalId, schedulerJobId: job.cron_job_id,
    lastTick: latest.start_time, responseStatus: response.rows[0].status_code,
    courseAttemptsSinceRelease: attempts.rows[0].course,
    adleAttemptsSinceRelease: attempts.rows[0].adle,
    unrecordedSends: site.unrecordedSends, aiControlEnabled: site.control.enabled }, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
