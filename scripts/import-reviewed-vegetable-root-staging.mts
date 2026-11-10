/** Import the owner-reviewed vegetable row and veget root family to staging. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=veget-root-staging"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const productionUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stagingUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(productionUrl && new URL(productionUrl).username.split(".").at(-1) === "wwohrqtunajrbwxyssjf");
assert(stagingUrl && new URL(stagingUrl).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);

const csvPath = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-09-veget-root-staging/vegetable.csv";
const file = readFileSync(csvPath);
assert.equal(createHash("sha256").update(file).digest("hex"),
  "205fea479161a9e1bf12129d5832934d5563acdf45b45ffe087d0bc94fbd547d");
const rows = parseDictionaryCsv(file.toString("utf8"));
assert.equal(rows.length, 1);
const row = rows[0];
assert(!row.error && row.normalisedWord === "vegetable" && row.canonicalWordId);
const payload = row.payload;
const root = payload.canonicalMorphology.parts.find(part => part.kind === "root");
assert(root && root.sourceText === "veget" && root.gloss === "To grow or live");
assert.equal(payload.rootFamilyReview?.familyKey, "veget_bound_root_base_family");
assert.equal(payload.rootFamilyReview?.rootDefinition, "To grow or live");
assert.equal(payload.rootFamilyReview?.originLanguage, "Latin");
assert.equal(payload.rootFamilyReview?.pronunciationApplicability, "not_applicable");
assert.deepEqual(payload.skillKeys, ["D4_SYL_SYLLABLE_PRESERVATION_REDUCED_MEDIAL"]);

const options = { ssl: { rejectUnauthorized: false } };
const production = new pg.Client({ connectionString: productionUrl, ...options });
const staging = new pg.Client({ connectionString: stagingUrl, ...options });
await production.connect();
await staging.connect();
try {
  await production.query("begin read only");
  const source = await production.query(`select to_jsonb(w) word,m.morphology_parts,
    m.morphology_joins,m.word_sum,f.base_meaning,r.root_definition,
    r.origin_language,r.pronunciation_applicability
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=w.id and m.row_status='active' and m.analysis_status='approved'
    join public.canonical_teaching_dictionary_lexical_base_family_members fm
      on fm.canonical_word_id=w.id and fm.canonical_morphology_id=m.id
    join public.canonical_teaching_dictionary_lexical_base_families f
      on f.family_key=fm.family_key and f.revision=fm.revision
    join public.canonical_teaching_dictionary_lexical_root_metadata r
      on r.family_key=f.family_key and r.revision=f.revision
    where w.id=$1 and w.normalised_word='vegetable' and w.row_status='active'
      and w.review_status='approved_for_first_exposure'
      and f.family_key='veget_bound_root_base_family' and f.review_status='approved'
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)`, [row.canonicalWordId]);
  assert.equal(source.rows.length, 1, "PRODUCTION_REVIEWED_ROOT_NOT_FOUND");
  const approved = source.rows[0];
  assert.deepEqual(approved.morphology_parts, payload.canonicalMorphology.parts);
  assert.deepEqual(approved.morphology_joins, payload.canonicalMorphology.joins);
  assert.equal(approved.word_sum, payload.canonicalMorphology.wordSum);
  assert.equal(approved.base_meaning, root.gloss);
  assert.equal(approved.root_definition, payload.rootFamilyReview.rootDefinition);
  assert.equal(approved.origin_language, payload.rootFamilyReview.originLanguage);
  assert.equal(approved.pronunciation_applicability, "not_applicable");

  await staging.query("begin");
  await staging.query("set local lock_timeout='5s'");
  await staging.query("select pg_advisory_xact_lock(hashtext('reviewed-veget-root-staging'))");
  const existing = await staging.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='vegetable' and dialect_code='en-GB' and row_status='active'`);
  const familyExisting = await staging.query(`select revision from public.canonical_teaching_dictionary_lexical_base_families
    where family_key='veget_bound_root_base_family' order by revision desc limit 1`);
  if (existing.rows.length || familyExisting.rows.length) {
    assert.equal(existing.rows.length, 1, "STAGING_VEGETABLE_CONFLICT");
    assert.equal(existing.rows[0].id, row.canonicalWordId, "STAGING_VEGETABLE_IDENTITY_CONFLICT");
    assert.equal(familyExisting.rows[0]?.revision, 2, "STAGING_ROOT_REVISION_CONFLICT");
    const current = await staging.query(`select f.base_meaning,r.root_definition,
      r.pronunciation_applicability,m.morphology_parts
      from public.canonical_teaching_dictionary_lexical_base_families f
      join public.canonical_teaching_dictionary_lexical_root_metadata r
        on r.family_key=f.family_key and r.revision=f.revision
      join public.canonical_teaching_dictionary_lexical_base_family_members fm
        on fm.family_key=f.family_key and fm.revision=f.revision
      join public.canonical_teaching_dictionary_word_morphology m
        on m.id=fm.canonical_morphology_id
      where f.family_key='veget_bound_root_base_family' and f.revision=2
        and fm.canonical_word_id=$1 and f.review_status='approved'`, [row.canonicalWordId]);
    assert.equal(current.rows.length, 1);
    assert.equal(current.rows[0].base_meaning, root.gloss);
    assert.equal(current.rows[0].root_definition, root.gloss);
    assert.equal(current.rows[0].pronunciation_applicability, "not_applicable");
    assert.deepEqual(current.rows[0].morphology_parts, payload.canonicalMorphology.parts);
    await staging.query("rollback");
    console.log(JSON.stringify({ status: "already_present", word: "vegetable", familyRevision: 2 }));
  } else {
    const importBatch = await staging.query(`select id from public.canonical_teaching_dictionary_import_batches
      where id=$1 and batch_status='applied'`, [approved.word.import_batch_id]);
    assert.equal(importBatch.rows.length, 1, "STAGING_SOURCE_BATCH_MISSING");
    const skill = await staging.query(`select is_active,is_assignable from public.micro_skill_catalog
      where micro_skill_key=$1`, [payload.skillKeys[0]]);
    assert.equal(skill.rows.length, 1, "STAGING_ROOT_SKILL_MISSING");
    assert(skill.rows[0].is_active && skill.rows[0].is_assignable);
    await staging.query(`insert into public.canonical_teaching_dictionary_words
      select (jsonb_populate_record(null::public.canonical_teaching_dictionary_words,$1::jsonb)).*`,
    [JSON.stringify(approved.word)]);
    const morphology = await staging.query(`insert into public.canonical_teaching_dictionary_word_morphology
      (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
       raw_morpholex_pos,morphology_parts,feature_keys,morphology_joins,
       morphology_transformations,word_sum,analysis_status,source_category,source_name,
       source_use_note,confidence,review_status,reviewed_by,reviewed_at,review_notes)
      values($1,$2,'reviewed vegetable staging fixture',$3,$4,'noun',$5::jsonb,'[]'::jsonb,
        $6::jsonb,'[]'::jsonb,$7,'approved','internal_reviewed_seed',
        'Scarletts Spells','Owner-reviewed vegetable and veget root',
        'high','approved_for_first_exposure','Katie Sanderson reviewed 14-word pilot',
        now(),'Initial staging root fixture; reviewed CSV publication creates current revision')
      returning id`, [approved.word.import_batch_id,row.canonicalWordId,row.rowNumber,
      approved.word.source_row_hash,JSON.stringify(payload.canonicalMorphology.parts),
      JSON.stringify(payload.canonicalMorphology.joins),payload.canonicalMorphology.wordSum]);
    const reference = "Owner-reviewed 14-word pilot; veget staging root fixture";
    await staging.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
      (family_key,revision,base_lemma,base_part_of_speech,base_kind,base_meaning,
       source_reference,review_status)
      values('veget_bound_root_base_family',1,'veget','bound_root','bound_root',$1,$2,'draft')`,
    [root.gloss, reference]);
    await staging.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
      (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
       canonical_morphology_id,word_sum,morphology_parts,morphology_joins,
       morphology_transformations,intended_meaning,source_reference)
      values('veget_bound_root_base_family',1,$1,'noun','historical_relative',
        $2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb,$6,$7)`,
    [row.canonicalWordId,morphology.rows[0].id,payload.canonicalMorphology.wordSum,
      JSON.stringify(payload.canonicalMorphology.parts),JSON.stringify(payload.canonicalMorphology.joins),
      payload.definition,reference]);
    await staging.query(`insert into public.canonical_teaching_dictionary_lexical_root_metadata
      (family_key,revision,root_text,root_meaning,root_definition,origin_language,
       pronunciation_ipa,pronunciation_applicability,source_reference,
       approval_reference,reviewed_by,reviewed_at)
      values('veget_bound_root_base_family',1,'veget',$1,$2,'Latin',null,
        'not_applicable',$3,$3,$4,now())`, [root.gloss,root.gloss,reference,actor]);
    await staging.query(`select public.approve_canonical_lexical_base_family(
      'veget_bound_root_base_family',1,$1,$2)`, [actor,reference]);
    const controls = await staging.query(`select review_enabled,publication_enabled
      from public.adle_word_skill_review_controls where environment_key='staging' for update`);
    assert.equal(controls.rows.length, 1);
    await staging.query(`update public.adle_word_skill_review_controls
      set review_enabled=true,publication_enabled=true where environment_key='staging'`);
    const draft = await staging.query(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,'vegetable','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
    [row.canonicalWordId,JSON.stringify(payload),
      `CSV batch ${randomUUID()}, vegetable.csv, row ${row.rowNumber}`,actor]);
    await staging.query(`select public.review_teaching_dictionary_overview($1,$2)`,
      [draft.rows[0].id,actor]);
    await staging.query(`select public.review_teaching_dictionary_import_skills($1,$2)`,
      [draft.rows[0].id,actor]);
    const published = await staging.query(`select public.publish_teaching_dictionary_reviewed_csv_senses(
      $1,$2,'staging','bound_root') as word_id`, [draft.rows[0].id,actor]);
    assert.equal(published.rows[0].word_id, row.canonicalWordId);
    const current = await staging.query(`select f.revision,f.base_meaning,r.root_meaning,
      r.pronunciation_applicability,m.morphology_parts,m.morphology_joins
      from public.canonical_teaching_dictionary_lexical_base_families f
      join public.canonical_teaching_dictionary_lexical_root_metadata r
        on r.family_key=f.family_key and r.revision=f.revision
      join public.canonical_teaching_dictionary_lexical_base_family_members fm
        on fm.family_key=f.family_key and fm.revision=f.revision
      join public.canonical_teaching_dictionary_word_morphology m
        on m.id=fm.canonical_morphology_id
      where f.family_key='veget_bound_root_base_family' and f.review_status='approved'
        and fm.canonical_word_id=$1 order by f.revision desc limit 1`, [row.canonicalWordId]);
    assert.equal(current.rows[0]?.revision, 2);
    assert.equal(current.rows[0].base_meaning, root.gloss);
    assert.equal(current.rows[0].root_meaning, root.gloss);
    assert.equal(current.rows[0].pronunciation_applicability, "not_applicable");
    assert.deepEqual(current.rows[0].morphology_parts, payload.canonicalMorphology.parts);
    assert.deepEqual(current.rows[0].morphology_joins, payload.canonicalMorphology.joins);
    const sense = await staging.query(`select count(*)::int n from public.teaching_dictionary_reviewed_sense_sets
      where canonical_word_id=$1`, [row.canonicalWordId]);
    assert.equal(sense.rows[0].n, 1);
    const binding = await staging.query(`select micro_skill_key,sense_id
      from public.teaching_dictionary_lesson_sense_bindings
      where environment_key='staging' and canonical_word_id=$1 and withdrawn_at is null`,
    [row.canonicalWordId]);
    assert.equal(binding.rows.length, 1);
    assert.equal(binding.rows[0].micro_skill_key, payload.skillKeys[0]);
    assert.equal(binding.rows[0].sense_id, payload.senseSet?.senses[0].id);
    await staging.query(`update public.adle_word_skill_review_controls
      set review_enabled=$1,publication_enabled=$2 where environment_key='staging'`,
    [controls.rows[0].review_enabled,controls.rows[0].publication_enabled]);
    await staging.query(apply ? "commit" : "rollback");
    console.log(JSON.stringify({ status: apply ? "applied" : "rollback_proof",
      word: "vegetable", family: "veget_bound_root_base_family", familyRevision: 2,
      rootMeaning: root.gloss, pronunciation: "not_applicable", skillsBound: 1 }));
  }
} catch (error) {
  await staging.query("rollback").catch(() => {});
  throw error;
} finally {
  await production.query("rollback").catch(() => {});
  await production.end();
  await staging.end();
}
