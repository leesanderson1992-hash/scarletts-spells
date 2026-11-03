/** Rebind the existing Production policy and scheduler to an exact promoted SHA. */
import pg from "pg";

const sha = process.argv[2];
const approvalId = process.argv[3];
const oldSha = process.argv[4];
if (!sha || !/^[a-f0-9]{40}$/u.test(sha) || !oldSha
  || !/^[a-f0-9]{40}$/u.test(oldSha) || sha === oldSha
  || !approvalId || !/^[a-f0-9-]{36}$/u.test(approvalId))
  throw new Error("NEW_SHA_APPROVAL_AND_BASELINE_REQUIRED");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes(`--confirm=context-cutover:${sha}`))
  throw new Error("EXACT_CUTOVER_CONFIRMATION_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const policy = await db.query(`select p.provider_approval_id,p.rate_card_version,
      p.max_requests_per_day,p.max_usd_per_day,p.max_usd_per_request,p.max_concurrent,
      p.execution_policy_kind,p.dispatch_scope,p.revision_id,a.deployment_sha
    from writing_context_shadow_policy p join writing_context_provider_approvals a
      on a.id=p.provider_approval_id where p.singleton for update of p`);
  const current = policy.rows[0];
  if (policy.rows.length !== 1 || current.deployment_sha !== oldSha
    || current.execution_policy_kind !== "ADULT_RELEASE" || current.dispatch_scope !== "REAL_LEARNER"
    || current.rate_card_version !== "openai-gpt6-luna-default-20260930"
    || current.max_requests_per_day !== 37 || Number(current.max_usd_per_day) !== 0.1147
    || Number(current.max_usd_per_request) !== 0.0031 || current.max_concurrent !== 1)
    throw new Error("CURRENT_POLICY_CHANGED");
  const control = await db.query(`select enabled,ai_mode from writing_context_advisory_control
    where singleton for update`);
  if (control.rows.length !== 1 || control.rows[0].enabled !== false
    || control.rows[0].ai_mode !== "shadow") throw new Error("AI_CONTROL_CHANGED");
  const scheduler = await db.query(`select enabled,approved_deployment_sha,cron_job_id
    from writing_context_recovery_scheduler where singleton for update`);
  if (scheduler.rows.length !== 1 || scheduler.rows[0].enabled !== true
    || scheduler.rows[0].approved_deployment_sha !== oldSha || !scheduler.rows[0].cron_job_id)
    throw new Error("CURRENT_SCHEDULER_CHANGED");
  const approval = await db.query(`select id,deployment_sha,environment,project_ref,model,endpoint,
      config_fingerprint,runtime_fingerprint,retention_mode,data_sharing_disabled,dispatch_scope,
      approved_by,expires_at from writing_context_provider_approvals where id=$1`, [approvalId]);
  const next = approval.rows[0];
  if (approval.rows.length !== 1 || next.deployment_sha !== sha || next.environment !== "production"
    || next.project_ref !== "proj_TiflcYqhzQJXxKpHauXKFRs8"
    || next.model !== "gpt-6-luna" || next.endpoint !== "/v1/responses"
    || next.config_fingerprint !== "a874b27c4f42538821dac4e5d784f3735e5a97e100150cc0dcd88e0c37159958"
    || next.runtime_fingerprint !== "5d2de1feb5104acbba1ad3edb2652830b6fdd71d40af36af422eabd47274bd35"
    || next.retention_mode !== "STANDARD_API" || next.data_sharing_disabled !== true
    || next.dispatch_scope !== "REAL_LEARNER" || new Date(next.expires_at).getTime() <= Date.now())
    throw new Error("NEW_APPROVAL_CHANGED");
  const revoked = await db.query(`select count(*)::int n from writing_context_approval_revocations
    where provider_approval_id=$1`, [approvalId]);
  if (revoked.rows[0].n !== 0) throw new Error("NEW_APPROVAL_REVOKED");
  const updated = await db.query(`update writing_context_shadow_policy set provider_approval_id=$1,
    evidence_ref=$2,approved_by=$3 where singleton returning revision_id`,
  [approvalId, `owner-standing-2026-10-09:canonical-overview:${sha}`, next.approved_by]);
  const revisionId = updated.rows[0]?.revision_id;
  const ready = await db.query(`select public.context_shadow_execution_ready($1) ready`, [revisionId]);
  if (!revisionId || ready.rows[0]?.ready !== true) throw new Error("NEW_POLICY_NOT_READY");
  const activated = await db.query(`select public.activate_writing_context_recovery_scheduler($1,$2) job_id`,
    [sha, approvalId]);
  if (!activated.rows[0]?.job_id) throw new Error("SCHEDULER_ACTIVATION_FAILED");
  const status = await db.query(`select public.writing_context_sitewide_status() status`);
  const site = status.rows[0]?.status;
  if (site?.policy?.providerApprovalId !== approvalId || site?.providerApproval?.deploymentSha !== sha
    || site?.scheduler?.deploymentSha !== sha || site?.scheduler?.enabled !== true
    || site?.control?.enabled !== false || Number(site?.unrecordedSends) !== 0)
    throw new Error("CUTOVER_READBACK_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ status: apply ? "cutover" : "rollback_proof", sha,
    approvalId, revisionId: apply ? revisionId : null,
    schedulerJobId: activated.rows[0].job_id, aiControlEnabled: false,
    unrecordedSends: site.unrecordedSends }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
