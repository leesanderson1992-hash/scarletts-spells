/** Publish an inactive, current Overview-generated -ing package in staging.
 * Default is a rollback proof. Activation is a separate governed operation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { ING_MICRO_SKILLS } from "../lib/adle/ing/contracts";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import { previewIngOverviewRelease } from "../lib/teaching-dictionary-manager/ing-overview-release-preview";

const option = (name: string) => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const file = option("--package");
const expectedFileSha = option("--expect-file-sha256");
const apply = process.argv.includes("--apply");
if (!file || !expectedFileSha || !/^[a-f0-9]{64}$/.test(expectedFileSha))
  throw new Error("EXACT_PACKAGE_PATH_AND_FILE_SHA_REQUIRED");
if (apply && !process.argv.includes(`--confirm=publish-ing-overview:staging:${expectedFileSha}`))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0],
  "qkpjbajicacbrphthibk");
assert(actor);
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT = "staging";
const bytes = await readFile(file);
const fileSha = createHash("sha256").update(bytes).digest("hex");
if (fileSha !== expectedFileSha) throw new Error("ING_PACKAGE_FILE_SHA_CHANGED");
const provided: unknown = JSON.parse(bytes.toString("utf8"));
if (!provided || typeof provided !== "object" || Array.isArray(provided))
  throw new Error("ING_PACKAGE_INVALID");
const packageValue = provided as Record<string, unknown>;
const { packageSha256, ...body } = packageValue;
if (packageValue.activation !== "inactive" || packageValue.schemaVersion !== 1
  || typeof packageSha256 !== "string" || fingerprintSnapshotValue(body) !== packageSha256)
  throw new Error("ING_PACKAGE_FINGERPRINT_INVALID");
const manifest = packageValue.manifest as { releaseKey?: string } | undefined;
if (!manifest?.releaseKey?.startsWith("staging:ing:overview:"))
  throw new Error("ING_PACKAGE_RELEASE_KEY_INVALID");

const { loadLessonReadiness } = await import("../lib/teaching-dictionary-manager/lesson-preflight");
const { loadRouteWordStatuses } = await import("../lib/teaching-dictionary-manager/route-word-status-service");
const lessons = await loadLessonReadiness({ routeId: "ing_endings_word_lab" });
const groups = await Promise.all(ING_MICRO_SKILLS.map(async microSkillKey => {
  const lesson = lessons.find(row => row.routeId === "ing_endings_word_lab"
    && row.microSkillKey === microSkillKey);
  if (!lesson) throw new Error(`ING_LESSON_MISSING:${microSkillKey}`);
  return loadRouteWordStatuses({ routeId: "ing_endings_word_lab", microSkillKey, lesson });
}));
const words = groups.flatMap(group => group.words.flatMap(row => row.approvedIngWord
  ? [row.approvedIngWord] : [])).sort((a, b) => a.microSkillKey.localeCompare(b.microSkillKey)
  || a.canonicalWordId.localeCompare(b.canonicalWordId));
const expectedKey = `staging:ing:overview:${fingerprintSnapshotValue(words).slice(0, 24)}`;
if (manifest.releaseKey !== expectedKey) throw new Error("ING_PACKAGE_POOL_CHANGED");
const current = previewIngOverviewRelease(words, expectedKey);
if (current.status !== "ready" || fingerprintSnapshotValue(current.package) !== fingerprintSnapshotValue(packageValue))
  throw new Error("ING_PACKAGE_POOL_CHANGED");

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin transaction isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  await db.query("select pg_advisory_xact_lock(hashtext($1))", ["staging:ing:overview:inactive-release"]);
  const headsSql = `select micro_skill_key,current_revision_id from public.adle_route_activation_heads
    where environment_key='staging' and route_id='ing_endings_word_lab' order by micro_skill_key`;
  const before = (await db.query(headsSql)).rows;
  const published = await db.query(`select public.publish_adle_ing_package_v1(
    $1::jsonb,$2,$3) id`, [JSON.stringify(packageValue), fileSha, actor]);
  assert.equal(published.rows.length, 1);
  const after = (await db.query(headsSql)).rows;
  assert.deepEqual(after, before, "inactive package publication must not activate a learner route");
  const manifestRead = await db.query(`select release_key from public.adle_curriculum_release_manifests
    where id=$1`, [published.rows[0].id]);
  assert.equal(manifestRead.rows[0]?.release_key, expectedKey);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ target: "staging", status: apply ? "published_inactive" : "rollback_proof",
    releaseKey: expectedKey, releaseId: published.rows[0].id, fileSha256: fileSha,
    packageSha256, activationUnchanged: true }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
