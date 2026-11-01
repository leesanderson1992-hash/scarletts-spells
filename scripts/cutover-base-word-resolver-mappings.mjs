#!/usr/bin/env node
/** Transfer the 18 active legacy base-word resolver mappings with audited lineage. */
import assert from "node:assert/strict";
import pg from "pg";

const OLD = [
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
];
const IDENTIFY = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const EXPECTED = 18;
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor) {
  throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
}
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const rows = (await db.query(`select * from public.spelling_canonical_mappings
    where micro_skill_key=any($1::text[]) and mapping_status='active'
    order by micro_skill_key,misspelling_normalized,id for update`, [OLD])).rows;
  assert.equal(rows.length, EXPECTED, "Legacy active mapping count changed; review before cutover");
  assert(rows.every((row) => row.resolver_visibility_status === "visible"), "Unexpected hidden mapping");
  const pairs = new Set(rows.map((row) => `${row.misspelling_normalized}|${row.correct_spelling_normalized}|${row.dialect_code}|${row.normalization_version}`));
  assert.equal(pairs.size, EXPECTED, "Legacy mapping collision needs review");
  const existing = (await db.query(`select id from public.spelling_canonical_mappings m
    where m.micro_skill_key=$1 and m.mapping_status='active' and exists (
      select 1 from public.spelling_canonical_mappings old
      where old.id=any($2::uuid[]) and old.misspelling_normalized=m.misspelling_normalized
        and old.correct_spelling_normalized=m.correct_spelling_normalized
        and old.dialect_code=m.dialect_code and old.normalization_version=m.normalization_version)`,
  [IDENTIFY, rows.map((row) => row.id)])).rows;
  assert.equal(existing.length, 0, "Existing Identify pair needs lineage deduplication review");
  const note = "Owner-approved 2026-11-01 base-word cluster cutover: transfer all 18 legacy resolver mappings to Identify, including ingredients and invention; retain old-key history and source lineage.";
  const moved = [];
  for (const row of rows) {
    const lineage = {
      ...row.metadata,
      source_mapping_id: row.id,
      source_micro_skill_key: row.micro_skill_key,
      source_case_id: row.source_case_id,
      source_decision_id: row.source_decision_id,
      source_recommendation_id: row.source_recommendation_id,
      source_candidate_mapping_id: row.source_candidate_mapping_id,
      source_parent_verification_id: row.source_parent_verification_id,
      source_seed_import_row_id: row.source_seed_import_row_id,
      owner_override: ["ingredients", "invention"].includes(row.correct_spelling_normalized)
        ? "2026-11-01 transfer all 18, including three previously excluded resolver entries" : null,
    };
    const result = await db.query(`select public.supersede_spelling_canonical_mapping_admin(
      $1::uuid,$2::text,$3::text,$4::uuid,$5::text,$6::text,$7::jsonb) id`,
    [row.id, row.micro_skill_key, IDENTIFY, actor, null, note, JSON.stringify(lineage)]);
    const newId = result.rows[0].id;
    await db.query(`update public.spelling_canonical_mappings set
      source_case_id=$2,source_decision_id=$3,source_recommendation_id=$4,
      source_candidate_mapping_id=$5,source_parent_verification_id=$6,source_seed_import_row_id=$7,
      metadata=metadata || $8::jsonb where id=$1 and micro_skill_key=$9`,
    [newId, row.source_case_id, row.source_decision_id, row.source_recommendation_id,
      row.source_candidate_mapping_id, row.source_parent_verification_id, row.source_seed_import_row_id,
      JSON.stringify({ source_mapping_metadata: row.metadata, source_mapping_id: row.id,
        source_micro_skill_key: row.micro_skill_key }), IDENTIFY]);
    await db.query(`select public.set_spelling_canonical_mapping_resolver_visibility_admin(
      $1::uuid,'visible',$2::uuid,$3::text,$4::text,$5::jsonb)`,
    [newId, actor, null, note, JSON.stringify({ source_mapping_id: row.id })]);
    moved.push({ old_id: row.id, new_id: newId, misspelling: row.misspelling_normalized,
      correction: row.correct_spelling_normalized, old_key: row.micro_skill_key });
  }
  const after = (await db.query(`select
    (select count(*)::int from public.spelling_canonical_mappings where micro_skill_key=any($1::text[]) and mapping_status='active') old_active,
    (select count(*)::int from public.spelling_canonical_mappings where micro_skill_key=$2 and mapping_status='active' and resolver_visibility_status='visible') identify_visible,
    (select count(*)::int from public.spelling_canonical_mappings where id=any($3::uuid[]) and mapping_status='superseded' and replacement_mapping_id is not null) old_superseded`,
  [OLD, IDENTIFY, rows.map((row) => row.id)])).rows[0];
  assert.equal(after.old_active, 0);
  assert.equal(after.old_superseded, EXPECTED);
  assert.equal(after.identify_visible, 3 + EXPECTED);
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", before: {
    old_active: EXPECTED, identify_visible: 3 }, after, moved }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
