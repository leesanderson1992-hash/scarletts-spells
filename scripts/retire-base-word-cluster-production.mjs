#!/usr/bin/env node
/** Pause only new old-key work; preserve every immutable release and issued lesson. */
import assert from "node:assert/strict";
import pg from "pg";

const OLD = [
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
];
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor)
  throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply = process.argv.includes("--apply");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const active = (await db.query(`select i.id,i.micro_skill_key,i.item_status,
    exists(select 1 from public.assignment_items a
      where a.metadata->>'learningItemId'=i.id::text) issued
    from public.adle_learning_items i
    where i.micro_skill_key=any($1::text[]) and i.row_status='active' for update`, [OLD])).rows;
  assert(active.every((row) => row.issued && row.item_status === "awaiting_review_outcome"),
    "An unissued old-key need remains; reconcile before retirement");
  const mappingCount = (await db.query(`select count(*)::int n from public.spelling_canonical_mappings
    where micro_skill_key=any($1::text[]) and mapping_status='active'`, [OLD])).rows[0].n;
  assert.equal(mappingCount, 0, "Old-key resolver mapping remains active");
  const routes = (await db.query(`select h.micro_skill_key,h.current_revision_id,
    r.release_manifest_sha256,r.activation_status
    from public.adle_route_activation_heads h
    join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.micro_skill_key=any($1::text[])
    order by h.micro_skill_key for update of h`, [OLD])).rows;
  assert.equal(routes.length, OLD.length, "Old-key activation count changed");
  const revisionIds = [];
  for (const row of routes) {
    assert(["enabled", "paused"].includes(row.activation_status));
    const result = await db.query(`select public.set_adle_route_activation_revision_v2(
      $1,$2,'production','paused','allow_existing',$3::jsonb,$4::uuid,$5,$6) id`,
    [row.release_manifest_sha256,row.micro_skill_key,
      JSON.stringify({ cutover: "2026-11-01 base-word cluster merge", historicalKey: row.micro_skill_key }),
      row.current_revision_id,actor,
      "Owner-approved base-word cutover: Identify receives new work; pinned old-key lessons finish"]);
    revisionIds.push(result.rows[0].id);
  }
  const updated = (await db.query(`update public.micro_skill_catalog
    set is_active=false,is_assignable=false,updated_at=timezone('utc',now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'retired_reason','merged_into_identify_base_word',
        'canonical_micro_skill_key','D4_MOR_BASE_WORDS_IDENTIFY_BASE',
        'retired_at',timezone('utc',now()))
    where micro_skill_key=any($1::text[]) and is_active and is_assignable
    returning micro_skill_key`, [OLD])).rows;
  assert.equal(updated.length, OLD.length, "Catalogue retirement count changed");
  const after = (await db.query(`select
    (select count(*)::int from public.micro_skill_catalog where micro_skill_key=any($1::text[])
      and (is_active or is_assignable)) assignable_old,
    (select count(*)::int from public.adle_route_activation_heads h
      join public.adle_route_activation_revisions r on r.id=h.current_revision_id
      where h.environment_key='production' and h.micro_skill_key=any($1::text[])
        and r.activation_status='enabled') enabled_old`, [OLD])).rows[0];
  assert.deepEqual(after, { assignable_old: 0, enabled_old: 0 });
  if (apply) await db.query("commit"); else await db.query("rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof",
    issuedOldNeeds: active.length, pausedRevisions: revisionIds.length, retiredCatalogueKeys: updated.length,
    after }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
