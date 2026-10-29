#!/usr/bin/env node
/** Publish ten reviewed templates and enable two skills for a disposable staging child. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { childAllowlistActivationReport } from "../lib/adle/route-activation-scope";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) || !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw Error("SCHWA_STAGING_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const pkg = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-initial-a-medial-natural-release-package.json", "utf8"));
const state = JSON.parse(readFileSync(".tmp/schwa-initial-a-medial-natural-staging/children.json", "utf8"));
const skills = ["D4_SCHWA_INITIAL_A_INITIAL", "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS"];
if (pkg.manifest?.microSkills?.length !== 10 || skills.some(skill =>
  !pkg.manifest.microSkills.some((row: { microSkillKey: string }) => row.microSkillKey === skill)) ||
  !/^[a-f0-9-]{36}$/i.test(state.initialA ?? "") || !/^[a-f0-9-]{36}$/i.test(state.medial ?? ""))
  throw Error("SCHWA_RELEASE_REVIEW_SET_CHANGED");
const fileSha = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  for (const skill of skills) {
    const count = await db.query<{ n: number }>(`select count(distinct canonical_word_id)::int n
      from public.adle_weak_vowel_content_publications where micro_skill_key=$1`, [skill]);
    if (count.rows[0].n < (skill === "D4_SCHWA_INITIAL_A_INITIAL" ? 4 : 1))
      throw Error(`SCHWA_STAGING_PUBLISHED_POOL_INCOMPLETE:${skill}`);
  }
  const release = await db.query<{ id: string }>("select public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3) id",
    [JSON.stringify(pkg),fileSha,"Katie Sanderson approved Initial A and natural medial teaching 2026-10-29"]);
  const row = await db.query<{ release_manifest_sha256: string; dependency_fingerprint: string; release_key: string }>(`
    select release_manifest_sha256,dependency_fingerprint,release_key
    from public.adle_curriculum_release_manifests where id=$1`, [release.rows[0].id]);
  const dependencies = await db.query<{ n: number }>(`select count(*)::int n from public.adle_curriculum_release_dependencies
    where release_manifest_id=$1`, [release.rows[0].id]);
  if (dependencies.rows[0].n !== 10) throw Error("SCHWA_TEN_SKILL_DEPENDENCIES_MISSING");
  const revisions: Record<string, string> = {};
  for (const skill of skills) {
    const prior = await db.query<{ current_revision_id: string }>(`select current_revision_id from public.adle_route_activation_heads
      where environment_key='staging' and route_id='weak_vowel_word_lab' and route_version='v1'
        and micro_skill_key=$1`, [skill]);
    const revision = await db.query<{ id: string }>(`select public.set_adle_route_activation_revision_v2(
      $1,$2,'staging','enabled','allow_existing',$3::jsonb,$4::uuid,$5,$6) id`,
      [row.rows[0].release_manifest_sha256,skill,JSON.stringify(childAllowlistActivationReport([state.initialA,state.medial])),
        prior.rows[0]?.current_revision_id ?? null,"schwa-initial-a-staging-release",
        "Owner-reviewed Initial A and medial natural disposable staging proof"]);
    revisions[skill] = revision.rows[0].id;
  }
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment: "staging", mode: apply ? "released_to_disposable_child" : "rollback_proof",
    releaseId: release.rows[0].id, releaseKey: row.rows[0].release_key,
    releaseSha: row.rows[0].release_manifest_sha256, dependencyFingerprint: row.rows[0].dependency_fingerprint,
    childIds: [state.initialA,state.medial], revisions }));
} catch (error) { await db.query("rollback").catch(() => undefined); throw error; }
finally { await db.end(); }
