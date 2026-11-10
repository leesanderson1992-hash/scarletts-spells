/** Copy only reviewed 14-word pilot skill identities to isolated staging. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=reviewed-pilot-skills-staging"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const productionUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stagingUrl = process.env.SUPABASE_STAGING_DB_URL;
assert(productionUrl && new URL(productionUrl).username.split(".").at(-1) === "wwohrqtunajrbwxyssjf");
assert(stagingUrl && new URL(stagingUrl).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const rows = parseDictionaryCsv(file.toString("utf8"));
assert.equal(rows.length, 14);
assert(rows.every(row => !row.error));
const keys = [...new Set(rows.flatMap(row => row.payload.skillKeys))].sort();
const production = new pg.Client({ connectionString: productionUrl, ssl: { rejectUnauthorized: false } });
const staging = new pg.Client({ connectionString: stagingUrl, ssl: { rejectUnauthorized: false } });
await production.connect();
await staging.connect();
try {
  await production.query("begin read only");
  const source = await production.query(`select id,mastery_domain_key,skill_family_key,
    skill_cluster_key,micro_skill_key,display_name,practice_route,is_assignable,is_active,
    allowed_template_keys,metadata from public.micro_skill_catalog
    where micro_skill_key=any($1) order by micro_skill_key`, [keys]);
  assert.equal(source.rows.length, keys.length, "PRODUCTION_PILOT_SKILL_MISSING");
  assert(source.rows.every(row => row.is_active && row.is_assignable), "PRODUCTION_PILOT_SKILL_INACTIVE");
  await staging.query("begin");
  await staging.query("set local lock_timeout='5s'");
  const inserted: string[] = [];
  const alreadyPresent: string[] = [];
  for (const row of source.rows) {
    const current = await staging.query(`select id,mastery_domain_key,skill_family_key,
      skill_cluster_key,micro_skill_key,display_name,practice_route,is_assignable,is_active,
      allowed_template_keys,metadata from public.micro_skill_catalog
      where micro_skill_key=$1`, [row.micro_skill_key]);
    if (current.rows.length) {
      assert.equal(current.rows.length, 1);
      // Catalogue UUIDs are environment-local; the stable teaching identity is the key.
      assert.equal(current.rows[0].practice_route, row.practice_route,
        `STAGING_SKILL_ROUTE_CONFLICT:${row.micro_skill_key}`);
      assert(current.rows[0].is_active && current.rows[0].is_assignable,
        `STAGING_SKILL_UNASSIGNABLE:${row.micro_skill_key}`);
      alreadyPresent.push(row.micro_skill_key);
      continue;
    }
    await staging.query(`insert into public.micro_skill_catalog
      (id,mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,
       display_name,practice_route,is_assignable,is_active,allowed_template_keys,metadata)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [row.id,row.mastery_domain_key,row.skill_family_key,row.skill_cluster_key,
      row.micro_skill_key,row.display_name,row.practice_route,row.is_assignable,
      row.is_active,row.allowed_template_keys,JSON.stringify(row.metadata)]);
    inserted.push(row.micro_skill_key);
  }
  await staging.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ status: apply ? "applied" : "rollback_proof",
    reviewedKeys: keys.length, inserted, alreadyPresent }));
} catch (error) {
  await staging.query("rollback").catch(() => {});
  throw error;
} finally {
  await production.query("rollback").catch(() => {});
  await production.end();
  await staging.end();
}
