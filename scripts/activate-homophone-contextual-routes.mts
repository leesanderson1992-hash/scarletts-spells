/** Activate the approved contextual homophone release in small Production batches. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { allEligibleActivationReport } from "../lib/adle/route-activation-scope";

const apply = process.argv.includes("--apply");
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root,
  "data/adle/releases/homophone-convergence-v1/package.json"), "utf8")) as {
  packageSha256: string; manifest: { releaseKey: string;
    microSkills: Array<{ microSkillKey: string }> };
};
const keys = pkg.manifest.microSkills.map(skill => skill.microSkillKey);
if (keys.length !== 58 || new Set(keys).size !== 58)
  throw new Error("homophone activation roster must contain exactly 58 distinct skills");
const envLine = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!envLine) throw new Error("Production connection is missing");
const connectionString = envLine.slice(envLine.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
const target = new URL(connectionString);
if (!target.username.includes("wwohrqtunajrbwxyssjf") || !target.hostname.endsWith("pooler.supabase.com"))
  throw new Error("Activation target is not the approved Production project");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000 });
await client.connect();
try {
  const release = await client.query<{ id: string; release_manifest_sha256: string }>(`
    select id,release_manifest_sha256 from public.adle_curriculum_release_manifests
    where release_key=$1 and route_id='homophone_contextual_choice' and route_version='v1'`,
    [pkg.manifest.releaseKey]);
  if (release.rowCount !== 1) throw new Error("Approved Production release missing");
  const existing = await client.query<{ micro_skill_key: string; activation_status: string }>(`
    select h.micro_skill_key,r.activation_status from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='homophone_contextual_choice'
      and h.route_version='v1'`);
  if (existing.rows.some(row => !keys.includes(row.micro_skill_key)
    || row.activation_status !== "enabled"))
    throw new Error("Unexpected contextual homophone activation head");
  const enabled = new Set(existing.rows.map(row => row.micro_skill_key));
  const pending = keys.filter(key => !enabled.has(key));
  console.log(JSON.stringify({ mode: apply ? "apply" : "plan", environment: "production",
    releaseId: release.rows[0].id, packageSha256: pkg.packageSha256,
    enabled: enabled.size, pending: pending.length, batches: Math.ceil(pending.length / 10) }));
  if (apply) {
    const report = allEligibleActivationReport();
    for (let start = 0; start < pending.length; start += 10) {
      const batch = pending.slice(start, start + 10);
      await client.query("begin");
      try {
        await client.query("set local statement_timeout = '60s'");
        for (const key of batch) {
          await client.query(`select public.set_adle_homophone_contextual_activation_v1(
            $1,$2,'production','enabled',$3::jsonb,null,$4,$5)`,
          [release.rows[0].release_manifest_sha256, key, JSON.stringify(report),
            "Katie Sanderson", "Approved contextual homophone route launch 2026-10-24"]);
        }
        const readback = await client.query<{ count: number }>(`
          select count(*)::integer count from public.adle_route_activation_heads h
          join public.adle_route_activation_revisions r on r.id=h.current_revision_id
          where h.environment_key='production' and h.route_id='homophone_contextual_choice'
            and h.route_version='v1' and h.micro_skill_key=any($1::text[])
            and r.activation_status='enabled' and r.release_manifest_id=$2
            and r.readiness_report=$3::jsonb`,
        [batch, release.rows[0].id, JSON.stringify(report)]);
        if (readback.rows[0].count !== batch.length)
          throw new Error("Activation batch readback failed");
        await client.query("commit");
        console.log(JSON.stringify({ batch: Math.floor(start / 10) + 1,
          enabledInBatch: batch.length, totalEnabled: enabled.size + start + batch.length }));
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    }
  }
} finally { await client.end(); }
