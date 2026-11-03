/** Disposable staging proof: reviewed CSV creates, then joins, one free-base family. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!actor) throw new Error("STAGING_ADMIN_USER_REQUIRED");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const baseMeaning = "the appearance made by reflected light";
const familyKey = "colour_noun_base_family";
const words = [
  { word: "colourful", suffix: "ful", meaning: "Full of colour." },
  { word: "colourless", suffix: "less", meaning: "Without colour." },
];

try {
  await db.connect();
  await db.query("begin");
  const base = await db.query(`select id,import_batch_id from canonical_teaching_dictionary_words
    where normalised_word='colour' and row_status='active'`);
  assert.equal(base.rows.length, 1);
  const basePart = [{ id: "base", kind: "base", sourceText: "colour", surfaceText: "colour",
    gloss: baseMeaning, displayRange: { start: 0, end: 6 } }];
  await db.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
     source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values($1,$2,'staging rollback proof',2,$3,$4::jsonb,'[]'::jsonb,'colour → colour',
      'approved','internal_authored','staging rollback proof','transaction rollback proof',
      'high','approved_for_first_exposure','staging proof',now())`,
  [base.rows[0].import_batch_id, base.rows[0].id,
    `free-base-proof:${randomUUID()}`, JSON.stringify(basePart)]);
  for (const [index, entry] of words.entries()) {
    const facts = await db.query(`select to_jsonb(w) word,to_jsonb(md) metadata,to_jsonb(ds) dictation
      from canonical_teaching_dictionary_words w
      join canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
      join canonical_teaching_dictionary_dictation_sentences ds on ds.canonical_word_id=w.id and ds.row_status='active'
      where w.normalised_word=$1 and w.row_status='active'`, [entry.word]);
    assert.equal(facts.rows.length, 1);
    const { word: w, metadata: md, dictation: ds } = facts.rows[0];
    const parts = [basePart[0], { id: "suffix", kind: "suffix", sourceText: entry.suffix,
      surfaceText: entry.suffix, gloss: entry.suffix === "ful" ? "full of" : "without",
      displayRange: { start: 6, end: entry.word.length } }];
    const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
    const payload = {
      displayWord: w.display_word, definition: entry.meaning,
      dictationSentence: ds.dictation_sentence,
      dictationTargetTokenIndex: ds.dictation_target_token_index,
      ageBand: w.age_band, frequencyBand: w.frequency_band, complexityBand: w.complexity_band,
      metadata: {
        syllables: md.syllables, phoneme_hint: md.phoneme_hint,
        grapheme_notes: md.grapheme_notes ?? "", stress_pattern: "primary-unstressed-unstressed",
        has_schwa: md.has_schwa, morphemes: md.morphemes ?? "",
        morphology_notes: md.morphology_notes ?? "", irregularity_notes: md.irregularity_notes ?? "",
      },
      canonicalMorphology: {
        rawSegmentation: `colour + ${entry.suffix}`, rawPartOfSpeech: "adjective",
        parts, featureKeys: [], joins, transformations: [], transformationNotes: "",
        wordSum: `colour + ${entry.suffix} → ${entry.word}`, analysisStatus: "approved",
        reviewNotes: "Reviewed staging free-base import proof",
      },
      provenance: {
        sourceCategory: w.source_category, sourceName: w.source_name ?? "",
        sourceUrl: w.source_url ?? "", sourceLicence: w.source_licence ?? "",
        sourceUseNote: w.source_use_note ?? "", confidence: w.confidence,
      },
      skillKeys: [], routeContents: [],
      freeBaseFamilyReview: { familyKey: index ? familyKey : "", basePartOfSpeech: "noun" },
    };
    const draft = await db.query(`insert into teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
    [w.id, entry.word, JSON.stringify(payload),
      `CSV batch ${randomUUID()}, row ${index + 2} (staging rollback proof)`, actor]);
    const draftId = draft.rows[0].id;
    await db.query("select review_teaching_dictionary_overview($1,$2)", [draftId, actor]);
    await db.query("select review_teaching_dictionary_import_skills($1,$2)", [draftId, actor]);
    const published = await db.query(`select publish_teaching_dictionary_reviewed_free_base_draft(
      $1,$2,'staging') word_id`, [draftId, actor]);
    assert.equal(published.rows[0].word_id, w.id);
    const family = await db.query(`select f.revision,count(m.canonical_word_id)::int members
      from canonical_teaching_dictionary_lexical_base_families f
      join canonical_teaching_dictionary_lexical_base_family_members m
        on m.family_key=f.family_key and m.revision=f.revision
      where f.family_key=$1 and f.review_status='approved'
      group by f.revision order by f.revision desc limit 1`, [familyKey]);
    assert.equal(family.rows[0].revision, index + 1);
    assert.equal(family.rows[0].members, index + 2);
  }
  console.log("Reviewed free-base family creation and join passed inside rollback");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
