/** CAS activation of the compiler-verified, immutable Base Word pilot release. */
import assert from "node:assert/strict";
import pg from "pg";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=reviewed-14-word-base-release"))
  throw new Error("EXACT_REVIEWED_RELEASE_CONFIRMATION_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const releaseId = "cbc22681-0d1f-4439-8fca-ef3fed24b8d0";
const releaseSha = "49d9f6999ba5b6acb642104e42e192f8a5eeb97d353cf7752832ece6b0fba931";
const dependencyFingerprint = "4b59b475af4c5f7face1e6dc15a76810ecc454dfa20bd32c38e39eb5ea218176";
const previousRevisionId = "1c4f65f0-c9b8-4845-8cfd-b6c203a463a6";
const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const release = await db.query(`select id,release_manifest_sha256,dependency_fingerprint,release_key
    from public.adle_curriculum_release_manifests where id=$1 for share`, [releaseId]);
  assert.equal(release.rows.length, 1);
  assert.equal(release.rows[0].release_manifest_sha256, releaseSha);
  assert.equal(release.rows[0].dependency_fingerprint, dependencyFingerprint);
  assert.equal(release.rows[0].release_key, "identify-base-canonical-14-pilot-production-2026-11-03-v1");
  const previous = await db.query(`select h.current_revision_id,r.activation_status,r.release_manifest_id
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='base_word_lab'
      and h.route_version='v2' and h.micro_skill_key=$1 for update of h`, [skill]);
  assert.equal(previous.rows.length, 1);
  assert.equal(previous.rows[0].current_revision_id, previousRevisionId);
  assert.equal(previous.rows[0].activation_status, "enabled");
  assert.equal(previous.rows[0].release_manifest_id, "9886f365-eb65-4127-8a6a-a2b1904eb950");
  const protectedState = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedState();
  const report = { receiptVersion: "canonical_base_pilot_activation_v1",
    scope: { kind: "all_eligible" }, selectionPolicyVersion: "base_word_regularity_v1",
    reviewedPilotCsvSha256: "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f",
    familyCount: 117, compilerWitnessCount: 305, reviewedPilotBaseWordRoutes: 7,
    previousRevisionId };
  const activated = await db.query(`select public.set_adle_route_activation_revision_v2(
    $1,$2,'production','enabled','allow_existing',$3::jsonb,$4,$5,$6) id`,
  [releaseSha, skill, JSON.stringify(report), previousRevisionId,
    "Katie Sanderson / Codex governed canonical pilot", "Activate reviewed Base Word pilot release after native compiler proof"]);
  const id = activated.rows[0]?.id;
  assert(id);
  const current = await db.query(`select public.adle_route_activation_revision_is_current_v2($1,$2,$3,$4) valid`,
    [id, releaseId, releaseSha, dependencyFingerprint]);
  assert.equal(current.rows[0]?.valid, true);
  assert.deepEqual(await protectedState(), before, "LEARNER_STATE_CHANGED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "activated" : "rollback_proof", releaseId,
    revisionId: apply ? id : null, familyCount: 117, compilerWitnessCount: 305,
    learnerState: before }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
