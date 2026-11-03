/** Disposable staging proof. Every mutation is rolled back. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!actor) throw new Error("STAGING_ADMIN_USER_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await db.connect();
  await db.query("begin");
  const result = await db.query(`select to_jsonb(w) word,to_jsonb(md) metadata,
      to_jsonb(ds) dictation,to_jsonb(m) morphology,
      (select d.definition from teaching_dictionary_definition_versions d
        where d.canonical_word_id=w.id and d.route_id is null
        order by d.published_at desc,d.id desc limit 1) definition,
      (select coalesce(array_agg(distinct p.micro_skill_key order by p.micro_skill_key),'{}'::text[])
        from adle_reviewed_word_skill_pairs p
        join adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key='staging'
        where p.canonical_word_id=w.id
          and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)) skill_keys
    from canonical_teaching_dictionary_words w
    join canonical_teaching_dictionary_word_metadata md
      on md.canonical_word_id=w.id and md.row_status='active'
    join canonical_teaching_dictionary_dictation_sentences ds
      on ds.canonical_word_id=w.id and ds.row_status='active'
    left join canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=w.id and m.row_status='active'
    where w.normalised_word='actually' and w.row_status='active'
    order by md.created_at desc,ds.created_at desc,m.created_at desc limit 1`);
  assert.equal(result.rows.length, 1);
  const { word: w, metadata: md, dictation: ds, morphology: m, definition, skill_keys: skillKeys } = result.rows[0];
  assert(definition && skillKeys.length > 0);
  const payload = {
    displayWord: w.display_word,
    definition,
    dictationSentence: ds.dictation_sentence,
    dictationTargetTokenIndex: ds.dictation_target_token_index,
    writtenSyllableBreakdown: md.written_syllable_breakdown,
    ageBand: w.age_band, frequencyBand: w.frequency_band, complexityBand: w.complexity_band,
    metadata: {
      syllables: md.syllables, phoneme_hint: md.phoneme_hint, grapheme_notes: md.grapheme_notes ?? "",
      stress_pattern: md.stress_pattern, has_schwa: md.has_schwa, morphemes: md.morphemes ?? "",
      morphology_notes: md.morphology_notes ?? "",
      irregularity_notes: `${md.irregularity_notes ?? ""} Disposable staging proof`.trim(),
    },
    canonicalMorphology: {
      rawSegmentation: m?.raw_morpholex_segmentation ?? "", rawPartOfSpeech: m?.raw_morpholex_pos ?? "adverb",
      parts: [{ id: "proof-base", kind: "base", sourceText: w.display_word,
        surfaceText: w.display_word, gloss: definition,
        displayRange: { start: 0, end: w.display_word.length } }],
      featureKeys: [], joins: [], transformations: [], transformationNotes: "",
      wordSum: `${w.display_word} → ${w.display_word}`, analysisStatus: "approved",
      reviewNotes: "Disposable staging proof; rolled back",
    },
    provenance: {
      sourceCategory: w.source_category, sourceName: w.source_name ?? "", sourceUrl: w.source_url ?? "",
      sourceLicence: w.source_licence ?? "", sourceUseNote: w.source_use_note ?? "",
      confidence: w.confidence,
    },
    skillKeys, routeContents: [],
  };
  const mismatch = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'manual','Disposable skill mismatch proof', $4) returning id`,
  [w.id, w.normalised_word, JSON.stringify({ ...payload, skillKeys: [] }), actor]);
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [mismatch.rows[0].id, actor]);
  await db.query("savepoint skill_mismatch");
  try {
    await db.query("select public.publish_teaching_dictionary_reviewed_unrouted_draft($1,$2,'staging')",
      [mismatch.rows[0].id, actor]);
    throw new Error("SKILL_MISMATCH_UNEXPECTEDLY_PUBLISHED");
  } catch (error) {
    assert.match(String(error.message), /TEACHING_UNROUTED_SKILL_SET_CHANGED/);
    await db.query("rollback to savepoint skill_mismatch");
  }
  const draft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'manual','Disposable staging proof', $4) returning id`,
  [w.id, w.normalised_word, JSON.stringify(payload), actor]);
  const draftId = draft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [draftId, actor]);
  const published = await db.query(
    "select public.publish_teaching_dictionary_reviewed_unrouted_draft($1,$2,'staging') word_id",
    [draftId, actor]);
  assert.equal(published.rows[0].word_id, w.id);
  const current = await db.query(`select morphology_parts from canonical_teaching_dictionary_word_morphology
    where canonical_word_id=$1 and row_status='active'`, [w.id]);
  assert.equal(current.rows.length, 1);
  assert.equal(current.rows[0].morphology_parts[0].id, "proof-base");
  const addedSkill = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";
  assert(!skillKeys.includes(addedSkill));
  await db.query(`update adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const reconciledPayload = {
    ...payload, skillKeys: [...skillKeys, addedSkill],
    metadata: { ...payload.metadata, irregularity_notes: `${payload.metadata.irregularity_notes} Reconciled` },
  };
  const reconciledDraft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
  [w.id, w.normalised_word, JSON.stringify(reconciledPayload),
    `CSV batch ${randomUUID()}, row 2 (disposable staging proof)`, actor]);
  const reconciledId = reconciledDraft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [reconciledId, actor]);
  await db.query("select public.review_teaching_dictionary_import_skills($1,$2)", [reconciledId, actor]);
  const reconciled = await db.query(
    "select public.publish_teaching_dictionary_reviewed_reconciled_draft($1,$2,'staging') word_id",
    [reconciledId, actor]);
  assert.equal(reconciled.rows[0].word_id, w.id);
  const newPair = await db.query(`select p.release_id from adle_reviewed_word_skill_pairs p
    join adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key='staging'
    where p.canonical_word_id=$1 and p.micro_skill_key=$2
      and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)`,
  [w.id, addedSkill]);
  assert.equal(newPair.rows.length, 1);
  const otherOwnerPayload = { ...reconciledPayload, skillKeys: [addedSkill] };
  const otherOwnerDraft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
  [w.id, w.normalised_word, JSON.stringify(otherOwnerPayload),
    `CSV batch ${randomUUID()}, row 2 (disposable owner proof)`, actor]);
  const otherOwnerId = otherOwnerDraft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [otherOwnerId, actor]);
  await db.query("savepoint missing_skill_review");
  try {
    await db.query("select public.publish_teaching_dictionary_reviewed_reconciled_draft($1,$2,'staging')",
      [otherOwnerId, actor]);
    throw new Error("MISSING_SKILL_REVIEW_UNEXPECTEDLY_PUBLISHED");
  } catch (error) {
    assert.match(String(error.message), /TEACHING_RECONCILED_SKILL_REVIEW_REQUIRED/);
    await db.query("rollback to savepoint missing_skill_review");
  }
  await db.query("select public.review_teaching_dictionary_import_skills($1,$2)", [otherOwnerId, actor]);
  await db.query("savepoint other_owner");
  try {
    await db.query("select public.publish_teaching_dictionary_reviewed_reconciled_draft($1,$2,'staging')",
      [otherOwnerId, actor]);
    throw new Error("OTHER_OWNER_UNEXPECTEDLY_WITHDRAWN");
  } catch (error) {
    assert.match(String(error.message), /TEACHING_BULK_PAIR_OTHER_OWNER/);
    await db.query("rollback to savepoint other_owner");
  }
  const removedPayload = {
    ...reconciledPayload, skillKeys,
    metadata: { ...reconciledPayload.metadata, irregularity_notes: `${reconciledPayload.metadata.irregularity_notes} Removed` },
  };
  const removedDraft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
  [w.id, w.normalised_word, JSON.stringify(removedPayload),
    `CSV batch ${randomUUID()}, row 2 (disposable removal proof)`, actor]);
  const removedId = removedDraft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [removedId, actor]);
  await db.query("select public.review_teaching_dictionary_import_skills($1,$2)", [removedId, actor]);
  const removed = await db.query(
    "select public.publish_teaching_dictionary_reviewed_reconciled_draft($1,$2,'staging') word_id",
    [removedId, actor]);
  assert.equal(removed.rows[0].word_id, w.id);
  const withdrawal = await db.query(`select release_id from adle_reviewed_word_skill_withdrawals
    where release_id=$1`, [newPair.rows[0].release_id]);
  assert.equal(withdrawal.rows.length, 1);
  await db.query(`insert into teaching_dictionary_pair_decision_events
    (environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id)
    values('staging',$1,$2,'deassign',$3,$4)`, [skillKeys[0], w.id, actor, randomUUID()]);
  const restoredPayload = {
    ...removedPayload,
    metadata: { ...removedPayload.metadata, irregularity_notes: `${removedPayload.metadata.irregularity_notes} Restored` },
  };
  const restoredDraft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
  [w.id, w.normalised_word, JSON.stringify(restoredPayload),
    `CSV batch ${randomUUID()}, row 2 (disposable restore proof)`, actor]);
  const restoredId = restoredDraft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [restoredId, actor]);
  await db.query("select public.review_teaching_dictionary_import_skills($1,$2)", [restoredId, actor]);
  await db.query("select public.publish_teaching_dictionary_reviewed_reconciled_draft($1,$2,'staging')",
    [restoredId, actor]);
  const latest = await db.query(`select action from teaching_dictionary_pair_latest_decisions
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`,
  [w.id, skillKeys[0]]);
  assert.equal(latest.rows[0]?.action, "restore");
  console.log("Reviewed pair-only Overview publication passed inside rolled-back staging transaction");
  console.log("Reviewed CSV skill addition, withdrawal, restoration and Overview publication passed atomically inside rollback");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
