/** Copy the two existing Production lesson identities to the reduced staging catalogue. */
import assert from "node:assert/strict";
import pg from "pg";

process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const productionUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stagingUrl = process.env.SUPABASE_STAGING_DB_URL;
if (!productionUrl || !stagingUrl ||
  new URL(stagingUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("PINNED_STAGING_AND_PRODUCTION_READ_URLS_REQUIRED");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=live-lesson-catalog:staging:2026-11-09"))
  throw new Error("EXPLICIT_STAGING_APPLY_CONFIRMATION_REQUIRED");
const keys = ["D4_PAT_SPLIT_DIGRAPHS_I_E", "D4_PAT_FINAL_CONSONANT_PATTERNS_FINAL_VE"];
const production = new pg.Client({ connectionString: productionUrl, ssl: { rejectUnauthorized: false } });
const staging = new pg.Client({ connectionString: stagingUrl, ssl: { rejectUnauthorized: false } });
await production.connect(); await staging.connect();
let stageTransaction = false;
try {
  await production.query("begin read only");
  await staging.query("begin"); stageTransaction = true;
  const source = await production.query(`select mastery_domain_key,skill_family_key,skill_cluster_key,
    micro_skill_key,display_name,practice_route,is_assignable,is_active,allowed_template_keys,metadata
    from public.micro_skill_catalog where micro_skill_key=any($1::text[])`, [keys]);
  assert.equal(source.rows.length, keys.length, "both lessons exist in the authoritative catalogue");
  for (const row of source.rows) {
    assert.equal(row.is_active, true);
    assert.equal(row.is_assignable, true);
    const existing = await staging.query(`select micro_skill_key,display_name from public.micro_skill_catalog
      where micro_skill_key=$1`, [row.micro_skill_key]);
    assert.equal(existing.rows.length, 0, `${row.micro_skill_key} already exists in staging`);
    await staging.query(`insert into public.micro_skill_catalog
      (mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,display_name,
       practice_route,is_assignable,is_active,allowed_template_keys,metadata)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [row.mastery_domain_key,row.skill_family_key,row.skill_cluster_key,row.micro_skill_key,
      row.display_name,row.practice_route,row.is_assignable,row.is_active,
      row.allowed_template_keys,JSON.stringify(row.metadata)]);
  }
  const confirmed = await staging.query(`select micro_skill_key,display_name from public.micro_skill_catalog
    where micro_skill_key=any($1::text[]) order by micro_skill_key`, [keys]);
  assert.equal(confirmed.rows.length, keys.length);
  if (apply) await staging.query("commit"); else await staging.query("rollback");
  stageTransaction = false;
  console.log(JSON.stringify({ result: "passed", applied: apply, lessons: confirmed.rows }));
} finally {
  if (stageTransaction) await staging.query("rollback");
  await production.query("rollback").catch(() => {});
  await Promise.all([production.end(), staging.end()]);
}
