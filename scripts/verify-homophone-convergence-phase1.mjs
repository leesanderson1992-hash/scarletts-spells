import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "data/adle/homophone/convergence-v1");
const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
const baseline = JSON.parse(readFileSync(resolve(dir, "production-baseline.json"), "utf8"));
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("Production read-only connection unavailable");
let connectionString = env.slice(env.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
  connectionString = connectionString.slice(1, -1);
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
try {
  await client.connect();
  await client.query("begin transaction read only");
  const query = async (sql, params = []) => (await client.query(sql, params)).rows;
  const targetKeys = manifest.skills.map(skill => skill.key);
  const catalog = await query(`select id,micro_skill_key,is_active,is_assignable from public.micro_skill_catalog
    where micro_skill_key=any($1::text[])`, [targetKeys]);
  assert.equal(catalog.length, 68);
  const catalogByKey = new Map(catalog.map(row => [row.micro_skill_key, row]));
  const baselineByKey = new Map(baseline.catalog.map(row => [row.micro_skill_key, row]));
  for (const skill of manifest.skills) {
    const row = catalogByKey.get(skill.key);
    assert.ok(row, skill.key);
    if (skill.routeStatus === "retain_v2") {
      assert.equal(row.id, baselineByKey.get(skill.key)?.id, `retained identity ${skill.key}`);
      assert.equal(row.is_active, true);
      assert.equal(row.is_assignable, true);
    } else {
      assert.equal(row.is_active, false, `inactive draft ${skill.key}`);
      assert.equal(row.is_assignable, false, `unassignable draft ${skill.key}`);
    }
  }
  const heads = await query(`select h.environment_key,h.route_id,h.route_version,h.micro_skill_key,
      h.current_revision_id,r.activation_status,r.release_manifest_sha256
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.micro_skill_key like 'D4_HOM_%' order by h.environment_key,h.micro_skill_key`);
  assert.deepEqual(heads, baseline.activationHeads, "existing activation heads changed");
  const dictionary = await query(`select w.id, w.normalised_word, w.display_word, w.row_status, w.review_status,
      exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
        where m.canonical_word_id=w.id and m.row_status='active'
          and m.review_status='approved_for_first_exposure') as approved_metadata
    from public.canonical_teaching_dictionary_words w
    where w.dialect_code='en-GB' and w.normalised_word=any($1::text[])
    order by w.normalised_word, w.created_at`, [
    [...new Set(manifest.skills.flatMap(skill => skill.sets.flatMap(set => set.members)))],
  ]);
  assert.deepEqual(dictionary, baseline.dictionary, "canonical dictionary identities changed");
  const support = await query(`select s.micro_skill_key, w.normalised_word, s.support_role,
      s.row_status, s.review_status
    from public.canonical_teaching_dictionary_word_support s
    join public.canonical_teaching_dictionary_words w on w.id=s.canonical_word_id
    where s.micro_skill_key like 'D4_HOM_%' order by s.micro_skill_key,w.normalised_word`);
  assert.deepEqual(support, baseline.support, "existing dictionary assignments changed");
  const snapshots = await query(`select encode(extensions.digest(
      convert_to(compiled_lesson_snapshot::text,'UTF8'),'sha256'),'hex') as snapshot_sha256
    from public.daily_assignments
    where lesson_route_metadata->'route'->>'routeId'='homophone_word_lab'
      and compiled_lesson_snapshot is not null order by snapshot_sha256`);
  assert.deepEqual(snapshots.map(row => row.snapshot_sha256), baseline.immutableLessonSnapshotHashes,
    "historical homophone snapshots changed");
  const redirects = await query("select redirect_status from public.homophone_skill_redirects");
  assert.equal(redirects.length, 8);
  assert.ok(redirects.every(row => row.redirect_status === "draft"));
  const contrast = await query("select count(*)::integer n from public.homophone_contrast_sets");
  assert.equal(contrast[0].n, 0);
  await client.query("commit");
  console.log("Phase 1 verified: 68 target keys, 10 retained IDs, 58 inactive drafts, 14 unchanged heads, 8 draft redirects, unchanged dictionary/support and historical snapshots");
} finally {
  await client.end().catch(() => {});
}
