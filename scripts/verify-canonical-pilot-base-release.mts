/** Read-only native compiler proof for an inactive reviewed Base Word release. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { preflightGovernedRelease } from "../lib/teaching-dictionary-manager/governed-preflight";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const key = "identify-base-canonical-14-pilot-production-2026-11-03-v1";
const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
  delete process.env[name];
process.loadEnvFile(".tmp/canonical-pilot-production.env");
const production = "wwohrqtunajrbwxyssjf";
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname, `${production}.supabase.co`);
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(url && new URL(url).username.split(".").at(-1) === production);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin read only");
  const release = await db.query(`select * from public.adle_curriculum_release_manifests where release_key=$1`, [key]);
  assert.equal(release.rows.length, 1);
  assert.equal(release.rows[0].release_manifest_sha256,
    "49d9f6999ba5b6acb642104e42e192f8a5eeb97d353cf7752832ece6b0fba931");
  const authorities = await db.query(`select a.id,a.authority_type,a.semantic_projection,
      a.semantic_fingerprint
    from public.adle_curriculum_release_dependencies d
    join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
    where d.release_manifest_id=$1 and d.micro_skill_key=$2`, [release.rows[0].id, skill]);
  assert.equal(authorities.rows.length, 3);
  const pilot = parseDictionaryCsv(readFileSync(
    "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
  const words = pilot.filter((row) => row.payload.skillKeys.includes(skill));
  assert.equal(words.length, 7);
  const proof = await preflightGovernedRelease({ db: createServiceRoleClient(),
    routeId: "base_word_lab", skill, release: release.rows[0],
    revision: { id: "00000000-0000-4000-8000-000000000001" },
    authorities: authorities.rows, environment: "production" });
  const missing = words.filter((row) => !row.canonicalWordId || !proof.witnesses[row.canonicalWordId]);
  console.log(JSON.stringify({ releaseId: release.rows[0].id, ready: proof.ready,
    blockers: proof.blockers, witnessCount: Object.keys(proof.witnesses).length,
    pilotWords: words.length, missingPilotWords: missing.map((row) => row.normalisedWord) }));
  assert.equal(proof.ready, true);
  assert.deepEqual(missing, []);
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
