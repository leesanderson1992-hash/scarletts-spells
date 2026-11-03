/** Disposable staging proof: reviewed CSV Overview, root revision and skill release. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!actor) throw new Error("STAGING_ADMIN_USER_REQUIRED");
const wordId = "8c529c96-ef9b-5197-828e-0938c8cfd292";
const familyKey = "migr_bound_root_base_family";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await db.connect();
  await db.query("begin");
  const baseline = await db.query(`select to_jsonb(w) word,to_jsonb(md) metadata,to_jsonb(ds) dictation,
    (select count(*) from canonical_teaching_dictionary_word_morphology m
      where m.canonical_word_id=w.id and m.row_status='active') morphology_count
    from canonical_teaching_dictionary_words w
    join canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
    join canonical_teaching_dictionary_dictation_sentences ds on ds.canonical_word_id=w.id and ds.row_status='active'
    where w.id=$1 and w.row_status='active'`, [wordId]);
  assert.equal(baseline.rows.length, 1);
  assert.equal(Number(baseline.rows[0].morphology_count), 0);
  const { word: w, metadata: md, dictation: ds } = baseline.rows[0];
  const familyPrior = await db.query(`select 1 from canonical_teaching_dictionary_lexical_base_families
    where family_key=$1`, [familyKey]);
  assert.equal(familyPrior.rows.length, 0);
  const batch = await db.query(`select id from canonical_teaching_dictionary_import_batches limit 1`);
  assert(batch.rows[0]?.id);
  const oldParts = [
    { id: "prefix", kind: "prefix", sourceText: "im", surfaceText: "im", gloss: "into",
      displayRange: { start: 0, end: 2 } },
    { id: "root", kind: "root", sourceText: "migr", surfaceText: "migr", gloss: "to move",
      displayRange: { start: 2, end: 6 } },
    { id: "suffix", kind: "suffix", sourceText: "ant", surfaceText: "ant", gloss: "a person who",
      displayRange: { start: 6, end: 9 } },
  ];
  const newParts = oldParts.map((part) => part.id === "root"
    ? { ...part, gloss: "to move from one place to another" } : part);
  const joins = [{ afterPartId: "prefix", beforePartId: "root", joinType: "none" },
    { afterPartId: "root", beforePartId: "suffix", joinType: "none" }];
  const oldMorph = await db.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
     source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values($1,$2,'staging rollback proof',1,$3,$4::jsonb,$5::jsonb,'im + migr + ant → immigrant',
      'approved','internal_authored','staging rollback proof','transaction rollback proof',
      'high','approved_for_first_exposure','staging proof',now()) returning id`,
  [batch.rows[0].id, wordId, `root-import-proof:${randomUUID()}`,
    JSON.stringify(oldParts), JSON.stringify(joins)]);
  await db.query(`insert into canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,base_meaning,
     source_reference,review_status)
    values($1,1,'migr','bound_root','bound_root','to move','staging rollback proof','draft')`,
  [familyKey]);
  await db.query(`insert into canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
     canonical_morphology_id,word_sum,morphology_parts,morphology_joins,intended_meaning,source_reference)
    values($1,1,$2,'noun','derived',$3,'im + migr + ant → immigrant',$4::jsonb,$5::jsonb,
      'A person who moves to another country to live.','staging rollback proof')`,
  [familyKey, wordId, oldMorph.rows[0].id, JSON.stringify(oldParts), JSON.stringify(joins)]);
  await db.query(`insert into canonical_teaching_dictionary_lexical_root_metadata
    (family_key,revision,root_text,root_meaning,root_definition,origin_language,
     pronunciation_ipa,pronunciation_applicability,source_reference,
     approval_reference,reviewed_by,reviewed_at)
    values($1,1,'migr','to move','to move','Latin',null,'not_applicable',
      'staging rollback proof','staging rollback proof','staging proof',now())`, [familyKey]);
  await db.query(`select approve_canonical_lexical_base_family(
    $1,1,'staging proof','staging rollback proof')`, [familyKey]);
  await db.query(`update adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const skillKey = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
  const payload = {
    displayWord: w.display_word, definition: "A person who moves to another country to live.",
    dictationSentence: ds.dictation_sentence,
    dictationTargetTokenIndex: ds.dictation_target_token_index,
    writtenSyllableBreakdown: md.written_syllable_breakdown ?? "im·mi·grant",
    ageBand: w.age_band, frequencyBand: w.frequency_band,
    complexityBand: w.complexity_band,
    metadata: {
      syllables: md.syllables, phoneme_hint: md.phoneme_hint,
      grapheme_notes: md.grapheme_notes ?? "", stress_pattern: md.stress_pattern,
      has_schwa: md.has_schwa, morphemes: md.morphemes ?? "",
      morphology_notes: md.morphology_notes ?? "",
      irregularity_notes: md.irregularity_notes ?? "",
    },
    canonicalMorphology: {
      rawSegmentation: "im + migr + ant", rawPartOfSpeech: "noun",
      parts: newParts, featureKeys: [], joins, transformations: [],
      transformationNotes: "", wordSum: "im + migr + ant → immigrant",
      analysisStatus: "approved", reviewNotes: "Reviewed staging root import proof",
    },
    provenance: {
      sourceCategory: w.source_category, sourceName: w.source_name ?? "",
      sourceUrl: w.source_url ?? "", sourceLicence: w.source_licence ?? "",
      sourceUseNote: w.source_use_note ?? "", confidence: w.confidence,
    },
    skillKeys: [skillKey], routeContents: [],
    rootFamilyReview: {
      familyKey, rootDefinition: "to move from one place to another", originLanguage: "Latin",
      pronunciationApplicability: "not_applicable", pronunciationIpa: "",
    },
  };
  const draft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'immigrant','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(payload), `CSV batch ${randomUUID()}, row 2 (staging rollback proof)`, actor]);
  const draftId = draft.rows[0].id;
  await db.query("select review_teaching_dictionary_overview($1,$2)", [draftId, actor]);
  await db.query("savepoint missing_skill_review");
  try {
    await db.query(`select publish_teaching_dictionary_reviewed_bound_root_draft(
      $1,$2,'staging')`, [draftId, actor]);
    throw new Error("UNREVIEWED_ROOT_IMPORT_UNEXPECTEDLY_PUBLISHED");
  } catch (error) {
    assert.match(String(error.message), /TEACHING_ROOT_IMPORT_REVIEW_STALE/);
    await db.query("rollback to savepoint missing_skill_review");
  }
  await db.query("select review_teaching_dictionary_import_skills($1,$2)", [draftId, actor]);
  const published = await db.query(`select publish_teaching_dictionary_reviewed_bound_root_draft(
    $1,$2,'staging') word_id`, [draftId, actor]);
  assert.equal(published.rows[0].word_id, wordId);
  const current = await db.query(`select f.revision,f.base_meaning,r.root_meaning,
      r.pronunciation_applicability,m.canonical_morphology_id
    from canonical_teaching_dictionary_lexical_base_families f
    join canonical_teaching_dictionary_lexical_root_metadata r
      on r.family_key=f.family_key and r.revision=f.revision
    join canonical_teaching_dictionary_lexical_base_family_members m
      on m.family_key=f.family_key and m.revision=f.revision
    where f.family_key=$1 and f.review_status='approved'
    order by f.revision desc limit 1`, [familyKey]);
  assert.equal(current.rows[0].revision, 2);
  assert.equal(current.rows[0].base_meaning, "to move from one place to another");
  assert.equal(current.rows[0].root_meaning, "to move from one place to another");
  assert.equal(current.rows[0].pronunciation_applicability, "not_applicable");
  const morph = await db.query(`select id,morphology_parts from canonical_teaching_dictionary_word_morphology
    where canonical_word_id=$1 and row_status='active'`, [wordId]);
  assert.equal(morph.rows.length, 1);
  assert.equal(current.rows[0].canonical_morphology_id, morph.rows[0].id);
  assert.equal(morph.rows[0].morphology_parts[1].gloss, "to move from one place to another");
  const skill = await db.query(`select count(*)::int count from adle_reviewed_word_skill_pairs p
    join adle_reviewed_word_skill_releases r on r.id=p.release_id and r.environment_key='staging'
    where p.canonical_word_id=$1 and p.micro_skill_key=$2
      and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)`,
  [wordId, skillKey]);
  assert.equal(skill.rows[0].count, 1);
  console.log("Reviewed bound-root Overview, family revision and skill release passed inside rollback");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
