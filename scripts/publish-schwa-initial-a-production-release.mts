#!/usr/bin/env node
/** Publish the reviewed ten-skill Schwa package in Production, initially inactive. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
  !new URL(url).hostname.endsWith("pooler.supabase.com")) throw Error("SCHWA_PRODUCTION_TARGET_MISMATCH");
const apply = process.argv.includes("--apply");
const pkg = JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-initial-a-medial-natural-release-package.json", "utf8"));
if (pkg.manifest?.microSkills?.length !== 10 ||
  !pkg.manifest.microSkills.some((row: { microSkillKey: string }) => row.microSkillKey === "D4_SCHWA_INITIAL_A_INITIAL"))
  throw Error("SCHWA_PRODUCTION_RELEASE_REVIEW_SET_CHANGED");
const fileSha = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin"); await db.query("set local lock_timeout='5s'");
  const count = await db.query<{ n: number }>(`select count(distinct canonical_word_id)::int n
    from public.adle_weak_vowel_content_publications where micro_skill_key='D4_SCHWA_INITIAL_A_INITIAL'`);
  if (count.rows[0].n !== 4) throw Error("SCHWA_INITIAL_A_PRODUCTION_POOL_INCOMPLETE");
  const published = await db.query<{ id: string }>(`select public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3) id`,
    [JSON.stringify(pkg),fileSha,"Katie Sanderson approved Schwa Initial A and medial natural 2026-10-29"]);
  const release = await db.query<{ release_manifest_sha256: string; release_key: string }>(`
    select release_manifest_sha256,release_key from public.adle_curriculum_release_manifests where id=$1`,[published.rows[0].id]);
  const deps = await db.query<{ n: number }>(`select count(*)::int n from public.adle_curriculum_release_dependencies
    where release_manifest_id=$1`,[published.rows[0].id]);
  if (deps.rows[0].n !== 10) throw Error("SCHWA_PRODUCTION_RELEASE_DEPENDENCIES_MISSING");
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ environment:"production",mode:apply?"published_inactive":"rollback_proof",
    releaseId:published.rows[0].id,releaseKey:release.rows[0].release_key,
    releaseSha:release.rows[0].release_manifest_sha256,dependencies:deps.rows[0].n }));
} catch(error) { await db.query("rollback").catch(()=>undefined); throw error; }
finally { await db.end(); }
