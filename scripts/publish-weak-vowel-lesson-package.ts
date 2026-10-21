#!/usr/bin/env node
/** Publish the eight owner-approved teaching templates without activating them. */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { buildWeakVowelReleasePackage } from "../lib/adle/weak-vowel/release";

async function main() {
  const envIndex = process.argv.indexOf("--env-file");
  if (envIndex >= 0) process.loadEnvFile(resolve(process.argv[envIndex + 1]));
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL_REQUIRED");
  const target = new URL(url);
  if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
    throw new Error("PRODUCTION_DATABASE_TARGET_MISMATCH");
  const pkg = buildWeakVowelReleasePackage({ releaseKey: "weak-vowel-owner-approved-2026-10-21",
    approvalRefs: ["owner-approved-weak-vowel-content-and-design-2026-10-21"] });
  const fileSha = createHash("sha256").update(JSON.stringify(pkg)).digest("hex");
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    await db.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    const inventory = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.adle_weak_vowel_content_publications");
    const heads = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.adle_route_activation_heads WHERE route_id='weak_vowel_word_lab'");
    if (inventory.rows[0].count !== 182 || heads.rows[0].count !== 0)
      throw new Error("WEAK_VOWEL_PUBLICATION_OR_ACTIVATION_PREFLIGHT_CHANGED");
    if (!apply) {
      await db.query("ROLLBACK");
      console.log(JSON.stringify({ target: "production", status: "ready_to_publish", contentRows: 182,
        releaseKey: pkg.manifest.releaseKey, packageSha256: pkg.packageSha256, activationHeads: 0 }));
      return;
    }
    const result = await db.query<{ id: string }>(
      "SELECT public.publish_adle_weak_vowel_package_v1($1::jsonb,$2,$3) id",
      [pkg, fileSha, "Katie Sanderson approved weak-vowel lessons"]);
    const count = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.adle_curriculum_release_dependencies WHERE release_manifest_id=$1",
      [result.rows[0].id]);
    if (count.rows[0].count !== 8) throw new Error("WEAK_VOWEL_RELEASE_DEPENDENCIES_INCOMPLETE");
    await db.query("COMMIT");
    console.log(JSON.stringify({ target: "production", status: "published_inactive", releaseId: result.rows[0].id,
      releaseKey: pkg.manifest.releaseKey, packageSha256: pkg.packageSha256, dependencies: 8, activationHeads: 0 }));
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
