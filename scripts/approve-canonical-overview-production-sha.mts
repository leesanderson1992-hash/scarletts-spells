/** Bind an ordinary dictionary code release to the owner's standing AI approval. */
import pg from "pg";

const sha = process.argv[2];
const baselineSha = process.argv[3];
const apply = process.argv.includes("--apply");
if (!sha || !/^[a-f0-9]{40}$/u.test(sha) || !baselineSha
  || !/^[a-f0-9]{40}$/u.test(baselineSha) || sha === baselineSha)
  throw new Error("NEW_AND_BASELINE_COMMIT_SHA_REQUIRED");
if (apply && !process.argv.includes(`--confirm=owner-standing-2026-10-09:${sha}`))
  throw new Error("EXACT_OWNER_STANDING_CONFIRMATION_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const expectedRuntime = "5d2de1feb5104acbba1ad3edb2652830b6fdd71d40af36af422eabd47274bd35";
const expectedConfig = "a874b27c4f42538821dac4e5d784f3735e5a97e100150cc0dcd88e0c37159958";
const expectedRateCard = "76a726a72596d742f25cf4629d0a379d543e496a0a95d4c985af872ad7f74782";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const policy = await db.query(`select p.*,a.* from writing_context_shadow_policy p
    join writing_context_provider_approvals a on a.id=p.provider_approval_id
    where p.singleton for update of p`);
  const row = policy.rows[0];
  if (policy.rows.length !== 1 || row.deployment_sha !== baselineSha
    || row.environment !== "production" || row.project_ref !== "proj_TiflcYqhzQJXxKpHauXKFRs8"
    || row.model !== "gpt-6-luna" || row.endpoint !== "/v1/responses"
    || row.retention_mode !== "STANDARD_API" || row.zdr_verified !== false
    || row.data_sharing_disabled !== true || row.dispatch_scope !== "REAL_LEARNER"
    || row.config_fingerprint !== expectedConfig || row.runtime_fingerprint !== expectedRuntime
    || row.execution_policy_kind !== "ADULT_RELEASE"
    || row.rate_card_version !== "openai-gpt6-luna-default-20260930"
    || row.max_requests_per_day !== 37 || Number(row.max_usd_per_day) !== 0.1147
    || Number(row.max_usd_per_request) !== 0.0031 || row.max_concurrent !== 1
    || new Date(row.expires_at).getTime() <= Date.now())
    throw new Error("EXISTING_AI_APPROVAL_OR_POLICY_CHANGED");
  const card = await db.query(`select fingerprint from writing_context_ai_rate_cards
    where version=$1 and model=$2 and endpoint=$3`, [row.rate_card_version, row.model, row.endpoint]);
  if (card.rows.length !== 1 || card.rows[0].fingerprint !== expectedRateCard)
    throw new Error("AI_RATE_CARD_CHANGED");
  const revoked = await db.query(`select count(*)::int n from writing_context_approval_revocations
    where provider_approval_id=$1`, [row.provider_approval_id]);
  if (revoked.rows[0].n !== 0) throw new Error("EXISTING_PROVIDER_APPROVAL_REVOKED");
  const learners = await db.query(`select count(*)::int n from writing_context_learner_authorisations l
    where l.expires_at>clock_timestamp() and not exists (
      select 1 from writing_context_approval_revocations r where r.learner_authorisation_id=l.id)`);
  if (learners.rows[0].n !== 2) throw new Error("LEARNER_AUTHORISATION_COUNT_CHANGED");
  const scheduler = await db.query(`select enabled,approved_deployment_sha from writing_context_recovery_scheduler
    where singleton`);
  if (scheduler.rows.length !== 1 || scheduler.rows[0].enabled !== true
    || scheduler.rows[0].approved_deployment_sha !== baselineSha)
    throw new Error("RECOVERY_SCHEDULER_CHANGED");
  const approval = await db.query(`insert into writing_context_provider_approvals
    (environment,project_ref,deployment_sha,model,endpoint,config_fingerprint,
     runtime_fingerprint,zdr_verified,data_sharing_disabled,evidence_ref,
     approved_by,expires_at,dispatch_scope,retention_mode)
    select environment,project_ref,$2,model,endpoint,config_fingerprint,
      runtime_fingerprint,zdr_verified,data_sharing_disabled,$3,
      approved_by,expires_at,dispatch_scope,retention_mode
    from writing_context_provider_approvals where id=$1 returning id,deployment_sha`,
  [row.provider_approval_id, sha, `owner-standing-2026-10-09:canonical-overview:${sha}`]);
  if (approval.rows.length !== 1 || approval.rows[0].deployment_sha !== sha)
    throw new Error("AI_APPROVAL_INSERT_FAILED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ status: apply ? "approved" : "rollback_proof", sha,
    approvalId: apply ? approval.rows[0].id : null,
    currentPolicySha: baselineSha, currentSchedulerSha: baselineSha,
    activeLearnerAuthorisations: learners.rows[0].n,
    limits: { requestsPerDay: 37, usdPerDay: 0.1147, usdPerRequest: 0.0031,
      concurrent: 1 } }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
