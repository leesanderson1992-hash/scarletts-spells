// Read-only Production baseline. Outputs no learner IDs, writing, or credentials.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "data/adle/homophone/convergence-v1/manifest.json"), "utf8"));
const env = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(line => line.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!env) throw new Error("Production read-only connection is unavailable");
let connectionString = env.slice(env.indexOf("=") + 1).trim();
if ((connectionString.startsWith('"') && connectionString.endsWith('"'))
  || (connectionString.startsWith("'") && connectionString.endsWith("'"))) {
  connectionString = connectionString.slice(1, -1);
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
const words = [...new Set(manifest.skills.flatMap(skill => skill.sets.flatMap(set => set.members)))];
try {
  await client.connect();
  await client.query("begin transaction read only");
  const query = async (sql, params = []) => (await client.query(sql, params)).rows;
  const catalog = await query(`select id, micro_skill_key, skill_cluster_key, is_active, is_assignable
    from public.micro_skill_catalog where micro_skill_key like 'D4_HOM_%' order by micro_skill_key`);
  const dictionary = await query(`select w.id, w.normalised_word, w.display_word, w.row_status, w.review_status,
      exists(select 1 from public.canonical_teaching_dictionary_word_metadata m
        where m.canonical_word_id=w.id and m.row_status='active'
          and m.review_status='approved_for_first_exposure') as approved_metadata
    from public.canonical_teaching_dictionary_words w
    where w.dialect_code='en-GB' and w.normalised_word=any($1::text[])
    order by w.normalised_word, w.created_at`, [words]);
  const support = await query(`select s.micro_skill_key, w.normalised_word, s.support_role,
      s.row_status, s.review_status
    from public.canonical_teaching_dictionary_word_support s
    join public.canonical_teaching_dictionary_words w on w.id=s.canonical_word_id
    where s.micro_skill_key like 'D4_HOM_%' order by s.micro_skill_key,w.normalised_word`);
  const activationHeads = await query(`select h.environment_key,h.route_id,h.route_version,h.micro_skill_key,
      h.current_revision_id,r.activation_status,r.release_manifest_sha256
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.micro_skill_key like 'D4_HOM_%' order by h.environment_key,h.micro_skill_key`);
  const learningItems = await query(`select micro_skill_key,item_status,row_status,count(*)::integer as count
    from public.adle_learning_items where micro_skill_key like 'D4_HOM_%'
    group by micro_skill_key,item_status,row_status order by micro_skill_key,item_status,row_status`);
  const snapshotHashes = await query(`select encode(extensions.digest(
      convert_to(compiled_lesson_snapshot::text,'UTF8'),'sha256'),'hex') as snapshot_sha256
    from public.daily_assignments
    where lesson_route_metadata->'route'->>'routeId'='homophone_word_lab'
      and compiled_lesson_snapshot is not null order by snapshot_sha256`);
  await client.query("commit");
  const result = {
    schemaVersion: 1, environment: "production", capturedAt: new Date().toISOString(),
    sourceSha256: manifest.sourceSha256, catalog, dictionary, support,
    activationHeads, learningItems,
    immutableLessonSnapshotCount: snapshotHashes.length,
    immutableLessonSnapshotHashes: snapshotHashes.map(row => row.snapshot_sha256),
  };
  const path = resolve(root, "data/adle/homophone/convergence-v1/production-baseline.json");
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ catalog: catalog.length, approvedDictionaryWords: dictionary.filter(row =>
    row.row_status === "active" && row.review_status === "approved_for_first_exposure").length,
    supportAssignments: support.length, activationHeads: activationHeads.length,
    learningItems: learningItems.reduce((sum, row) => sum + row.count, 0),
    immutableLessonSnapshots: snapshotHashes.length }));
} finally {
  await client.end().catch(() => {});
}
