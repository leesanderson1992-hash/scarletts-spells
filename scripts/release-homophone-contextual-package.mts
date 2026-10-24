/** Publish the exact approved 58-skill package without enabling any route. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";

const mode = process.argv[2] ?? "plan";
if (mode !== "plan" && mode !== "apply") throw new Error("usage: release-homophone-contextual-package.mts plan|apply");
const root = resolve(import.meta.dirname, "..");
const packageText = readFileSync(resolve(root, "data/adle/releases/homophone-convergence-v1/package.json"), "utf8");
const packageSha256 = createHash("sha256").update(packageText).digest("hex");
const pkg = JSON.parse(packageText) as { packageSha256: string; activation: string; authorities: unknown[];
  manifest: { releaseKey: string; microSkills: unknown[] } };
const { packageSha256: _hash, ...body } = pkg;
void _hash;
if (pkg.activation !== "inactive" || pkg.authorities.length !== 58
  || pkg.manifest.microSkills.length !== 58
  || fingerprintSnapshotValue(body) !== pkg.packageSha256)
  throw new Error("contextual_homophone_package_invalid");
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("contextual_homophone_production_connection_missing");
const connectionString = env.slice(env.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("contextual_homophone_production_target_mismatch");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = '90s'");
  const published = await client.query<{ id: string }>(`select public.publish_adle_homophone_contextual_package_v1(
    $1::jsonb,$2,$3) id`, [packageText, packageSha256, "Katie Sanderson approved homophone lessons 2026-10-24"]);
  const counts = await client.query<{ dependencies: number; active_routes: number }>(`
    select (select count(*)::integer from adle_curriculum_release_dependencies
      where release_manifest_id=$1) dependencies,
      (select count(*)::integer from adle_route_activation_heads
        where environment_key='production' and route_id='homophone_contextual_choice'
          and route_version='v1') active_routes`, [published.rows[0].id]);
  if (counts.rows[0].dependencies !== 58) throw new Error("contextual_homophone_release_readback_invalid");
  if (mode === "apply") await client.query("commit");
  else await client.query("rollback");
  console.log(JSON.stringify({ environment: "production", releaseId: published.rows[0].id,
    releaseKey: pkg.manifest.releaseKey, authorities: 58,
    dependencies: counts.rows[0].dependencies, activationHeads: counts.rows[0].active_routes,
    packageSha256: pkg.packageSha256, mutationPerformed: mode === "apply" }));
} catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
finally { await client.end(); }
