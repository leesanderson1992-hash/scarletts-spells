/** Disposable staging proof. Every mutation is rolled back. */
import assert from "node:assert/strict";
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
  console.log("Reviewed pair-only Overview publication passed inside rolled-back staging transaction");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
