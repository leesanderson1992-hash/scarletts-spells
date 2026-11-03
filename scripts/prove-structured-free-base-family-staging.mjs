/** Disposable staging proof: a free family anchor may have its own internal parts. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!actor) throw new Error("STAGING_ADMIN_USER_REQUIRED");
const baseId = randomUUID();
const childId = randomUUID();
const source = `structured-base-proof:${randomUUID()}`;
const hash = (text) => createHash("sha256").update(text).digest("hex");

try {
  await db.connect();
  await db.query("begin");
  const partsByWord = {
    understand: [
      { id: "prefix", kind: "prefix", sourceText: "under", surfaceText: "under",
        gloss: "beneath", displayRange: { start: 0, end: 5 } },
      { id: "base", kind: "base", sourceText: "stand", surfaceText: "stand",
        gloss: "be upright", displayRange: { start: 5, end: 10 } },
    ],
    understandable: [
      { id: "base", kind: "base", sourceText: "understand", surfaceText: "understand",
        gloss: "to know what something means", displayRange: { start: 0, end: 10 } },
      { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able",
        gloss: "able to be or suitable for", displayRange: { start: 10, end: 14 } },
    ],
  };
  for (const [word, id] of [["understand", baseId], ["understandable", childId]]) {
    await db.query(`insert into canonical_teaching_dictionary_words
      (id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,word_key,
       normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,
       source_category,source_name,source_use_note,confidence,review_status)
      select $1,import_batch_id,'active','staging rollback proof',2,$2,$3,$4,$4,'en-GB',
        frequency_band,age_band,complexity_band,'internal_authored','staging rollback proof',
        'transaction rollback proof','high','approved_for_first_exposure'
      from canonical_teaching_dictionary_words where normalised_word='colourful' and row_status='active' limit 1`,
    [id, hash(`${source}:${word}`), `${word}_structured_base_proof`, word]);
  }
  const morph = [];
  for (const [word, id] of [["understand", baseId], ["understandable", childId]]) {
    const parts = partsByWord[word];
    const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
    if (word === "understand") {
      joins[0] = { afterPartId: "prefix", beforePartId: "base", joinType: "none" };
    }
    const inserted = await db.query(`insert into canonical_teaching_dictionary_word_morphology
      (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
       morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
       source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
      select import_batch_id,$1,'staging rollback proof',2,$2,$3::jsonb,$4::jsonb,$5,
        'approved','internal_authored','staging rollback proof','transaction rollback proof',
        'high','approved_for_first_exposure','staging proof',now()
      from canonical_teaching_dictionary_words where id=$1 returning id`,
    [id, hash(`${source}:${word}:morph`), JSON.stringify(parts), JSON.stringify(joins),
      word === "understand" ? "under + stand → understand" : "understand + able → understandable"]);
    morph.push(inserted.rows[0].id);
  }
  await db.query("savepoint wrong_derived_base");
  const wrongChildParts = [
    ...partsByWord.understand,
    { id: "suffix", kind: "suffix", sourceText: "able", surfaceText: "able",
      gloss: "able to be or suitable for", displayRange: { start: 10, end: 14 } },
  ];
  const wrongChildJoins = [
    { afterPartId: "prefix", beforePartId: "base", joinType: "none" },
    { afterPartId: "base", beforePartId: "suffix", joinType: "none" },
  ];
  await db.query(`update canonical_teaching_dictionary_word_morphology
    set morphology_parts=$1::jsonb,morphology_joins=$2::jsonb,word_sum='under + stand + able → understandable'
    where id=$3`, [JSON.stringify(wrongChildParts), JSON.stringify(wrongChildJoins), morph[1]]);
  try {
    await db.query(`select create_reviewed_lexical_free_base_family(
      $1,$2,$3,$4,'verb','adjective','derived',$5,$6,$7,
      'staging proof','staging rollback proof')`,
    [baseId, childId, morph[0], morph[1], "to know what something means",
      "Able to be understood.", source]);
    throw new Error("WRONG_DERIVED_BASE_UNEXPECTEDLY_APPROVED");
  } catch (error) {
    assert.match(String(error.message), /LEXICAL_FAMILY_APPROVED_MORPHOLOGY_REQUIRED/);
    await db.query("rollback to savepoint wrong_derived_base");
  }
  const created = await db.query(`select create_reviewed_lexical_free_base_family(
    $1,$2,$3,$4,'verb','adjective','derived',$5,$6,$7,
    'staging proof','staging rollback proof') family_key`,
  [baseId, childId, morph[0], morph[1], "to know what something means",
    "Able to be understood.", source]);
  assert.equal(created.rows[0].family_key, "understand_verb_base_family");
  const family = await db.query(`select f.review_status,f.base_lemma,count(m.canonical_word_id)::int members
    from canonical_teaching_dictionary_lexical_base_families f
    join canonical_teaching_dictionary_lexical_base_family_members m
      on m.family_key=f.family_key and m.revision=f.revision
    where f.family_key=$1 group by f.review_status,f.base_lemma`, [created.rows[0].family_key]);
  assert.deepEqual(family.rows, [{ review_status: "approved", base_lemma: "understand", members: 2 }]);
  const draft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'understandable','en-GB','{}'::jsonb,'manual',$2,$3) returning id`,
  [childId, source, actor]);
  await db.query(`insert into teaching_dictionary_definition_versions
    (canonical_word_id,definition,draft_id) values($1,$2,$3)`,
  [childId, "Able to be understood.", draft.rows[0].id]);
  await db.query(`update canonical_teaching_dictionary_word_morphology
    set row_status='retired' where id=$1`, [morph[1]]);
  const revisedParts = partsByWord.understandable.map((part) =>
    part.kind === "base" ? { ...part, gloss: "to grasp meaning" } : part);
  const revisionBatch = await db.query(`insert into canonical_teaching_dictionary_import_batches
    (source_folder_path,source_folder_sha256,validator_version,validation_summary,
     row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at)
    values($1,$2,'staging_structure_proof',jsonb_build_object('errors',0),
      jsonb_build_object('words',1),'{}'::jsonb,'admin_import','applied','{}'::jsonb,$3,now())
    returning id`, [source, hash(source), actor]);
  const revisedMorph = await db.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
     source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    select $5,$1,'staging rollback proof',2,$2,$3::jsonb,$4::jsonb,
      'understand + able → understandable','approved','internal_authored',
      'staging rollback proof','transaction rollback proof','high',
      'approved_for_first_exposure','staging proof',now()
    from canonical_teaching_dictionary_words where id=$1 returning id`,
  [childId, hash(`${source}:revised`), JSON.stringify(revisedParts),
    JSON.stringify([{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }]),
    revisionBatch.rows[0].id]);
  const revision = await db.query(`select review_existing_free_base_member_revision(
    $1,1,$2,$3,$4,'adjective','derived',$5,'staging proof','staging rollback proof') revision`,
  [created.rows[0].family_key, childId, revisedMorph.rows[0].id, "to grasp meaning", source]);
  assert.equal(revision.rows[0].revision, 2);
  const replaced = await db.query(`select f.base_meaning,m.canonical_morphology_id
    from canonical_teaching_dictionary_lexical_base_families f
    join canonical_teaching_dictionary_lexical_base_family_members m
      on m.family_key=f.family_key and m.revision=f.revision
    where f.family_key=$1 and f.revision=2 and m.canonical_word_id=$2`,
  [created.rows[0].family_key, childId]);
  assert.equal(replaced.rows[0].base_meaning, "to grasp meaning");
  assert.equal(replaced.rows[0].canonical_morphology_id, revisedMorph.rows[0].id);
  console.log("Structured free-base anchor and existing-member revision passed inside rollback");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
