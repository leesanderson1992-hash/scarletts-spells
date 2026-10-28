import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const OLD = "D4_SCHWA_MEDIAL_NATURAL_ACTUAL";
const NEW = ["D4_SCHWA_FINAL_ET", "D4_SCHWA_FINAL_AL"];
const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url) throw new Error("Production database URL is missing");
const catalog = JSON.parse(readFileSync(new URL("../docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json", import.meta.url)));
const additions = NEW.map((key) => {
  const row = catalog.find((entry) => entry.micro_skill_key === key);
  assert.ok(row, `Missing catalog definition: ${key}`);
  return row;
});
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  const existing = await db.query("select micro_skill_key from public.micro_skill_catalog where micro_skill_key=any($1)", [NEW]);
  assert.equal(existing.rowCount, 0, "A new skill already exists; inspect before retrying");
  const mappings = await db.query(`select m.id mapping_id,i.id item_id from public.spelling_canonical_mappings m
    join public.spelling_resolution_items i on i.mapping_id=m.id
    where m.micro_skill_key=$1 and m.mapping_status='active' and m.resolver_visibility_status='visible'
      and i.review_status='confirmed' and i.resolver_enabled=true for update of m,i`, [OLD]);
  assert.equal(mappings.rowCount, 9, "Expected nine active old-skill mappings and resolution items");
  const allOldMappings = await db.query("select count(*)::int n from public.spelling_canonical_mappings where micro_skill_key=$1", [OLD]);
  assert.equal(allOldMappings.rows[0].n, 9, "Unexpected historical mapping: inspect before applying");
  const words = await db.query("select distinct canonical_word_id from public.adle_weak_vowel_content_publications where micro_skill_key=$1 order by canonical_word_id", [OLD]);
  assert.equal(words.rowCount, 11, "Expected eleven published old-skill words");
  const learning = await db.query("select count(*)::int n from public.adle_learning_items where micro_skill_key=$1", [OLD]);
  assert.equal(learning.rows[0].n, 0, "Old-skill learning items require a separate migration");
  const head = await db.query(`select h.current_revision_id,r.release_manifest_sha256,r.activation_status
    from public.adle_route_activation_heads h join public.adle_route_activation_revisions r on r.id=h.current_revision_id
    where h.environment_key='production' and h.route_id='weak_vowel_word_lab' and h.route_version='v1'
      and h.micro_skill_key=$1 for update of h`, [OLD]);
  assert.equal(head.rowCount, 1);
  assert.equal(head.rows[0].activation_status, "enabled");
  const actors = await db.query(`select distinct admin_user_id,admin_email from public.spelling_canonical_mapping_events
    where (previous_micro_skill_key=$1 or new_micro_skill_key=$1) and admin_user_id is not null`, [OLD]);
  assert.equal(actors.rowCount, 1, "A single audited admin identity is required");
  const actor = actors.rows[0];
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled from public.adle_word_skill_review_controls
    where environment_key='production'`);
  assert.equal(controls.rowCount, 1);
  assert.ok(controls.rows[0].review_enabled && controls.rows[0].publication_enabled && controls.rows[0].withdrawal_enabled);
  const ledger = await db.query("select version from supabase_migrations.schema_migrations where version='20261028120000'");
  assert.equal(ledger.rowCount, 0, "The forward migration is already applied");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", oldSkill: OLD, resolverItems: mappings.rowCount,
    oldPublishedWords: words.rowCount, oldLearningItems: learning.rows[0].n, activation: head.rows[0].activation_status,
    newSkills: NEW }, null, 2));
  if (apply) {
    const note = "Owner-authorised 2026-10-28 retirement of natural/actual medial skill; return mappings to No Matching Skill.";
    await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'production','paused','allow_existing',$3::jsonb,$4,$5,$6)`,
      [head.rows[0].release_manifest_sha256, OLD, JSON.stringify({ retirement: "D4_SCHWA_FINAL_AL", ownerAuthorityDate: "2026-10-28" }),
        head.rows[0].current_revision_id, actor.admin_email, note]);
    await db.query(`select public.reconcile_teaching_dictionary_bulk_review_v2('production',$1,$2::uuid[],$2::uuid[],$2::uuid[],$3::uuid[],$2::uuid[],$4,$5,$6)`,
      [OLD, [], words.rows.map((row) => row.canonical_word_id), actor.admin_user_id, randomUUID(), "retire-natural-actual-2026-10-28"]);
    for (const row of mappings.rows) {
      await db.query("select public.reopen_spelling_resolution_admin($1,$2,$3,$4)",
        [row.item_id, actor.admin_user_id, actor.admin_email, note]);
      await db.query("select public.move_spelling_resolution_to_no_matching_skill_admin($1,$2,$3)",
        [row.item_id, actor.admin_user_id, actor.admin_email]);
    }
    for (const row of additions) {
      await db.query(`insert into public.micro_skill_catalog
        (mastery_domain_key,skill_family_key,skill_cluster_key,micro_skill_key,display_name,practice_route,
         is_active,is_assignable,allowed_template_keys,metadata)
        values($1,$2,$3,$4,$5,$6,true,true,$7,$8::jsonb)`,
        [row.mastery_domain_key,row.skill_family_key,row.skill_cluster_key,row.micro_skill_key,row.display_name,
          row.practice_route,row.allowed_template_keys,JSON.stringify(row.metadata)]);
    }
    await db.query("update public.micro_skill_catalog set is_active=false,is_assignable=false where micro_skill_key=$1", [OLD]);
    const remaining = await db.query(`select count(*)::int n from public.spelling_canonical_mappings
      where micro_skill_key=$1 and (mapping_status<>'disabled' or resolver_visibility_status<>'disabled')`, [OLD]);
    assert.equal(remaining.rows[0].n, 0);
    const queued = await db.query(`select count(*)::int n from public.spelling_no_matching_skill_cases c
      join public.spelling_resolution_items i on i.id=c.resolution_item_id
      where i.id=any($1::uuid[]) and c.case_status='open' and i.review_status='no_matching_skill'
        and i.micro_skill_key is null and i.mapping_id is null and not i.resolver_enabled`,
      [mappings.rows.map((row) => row.item_id)]);
    assert.equal(queued.rows[0].n, 9);
    const deassigned = await db.query(`select count(*)::int n from public.teaching_dictionary_pair_latest_decisions
      where environment_key='production' and micro_skill_key=$1 and action='deassign'
        and canonical_word_id=any($2::uuid[])`, [OLD, words.rows.map((row) => row.canonical_word_id)]);
    assert.equal(deassigned.rows[0].n, 11);
    console.log("Verified: nine resolver items queued, eleven word pairs deassigned, old skill retired, two new skills inserted.");
    await db.query("commit");
  } else {
    await db.query("rollback");
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
