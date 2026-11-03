/** Disposable staging proof for reviewed Overview publication beside a suffix profile. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url || new URL(url).username.split(".").at(-1) !== "qkpjbajicacbrphthibk")
  throw new Error("STAGING_DATABASE_REQUIRED");
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!actor) throw new Error("STAGING_ADMIN_USER_REQUIRED");
const wordId = "479e8116-f29c-52bc-a50c-4ae45f328939"; // colourful
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let memberId;
let draftId;

try {
  await db.connect();
  await db.query("begin");
  const baseline = await db.query(`select to_jsonb(w) word,to_jsonb(md) metadata,to_jsonb(ds) dictation
    from canonical_teaching_dictionary_words w
    join canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
    join canonical_teaching_dictionary_dictation_sentences ds on ds.canonical_word_id=w.id and ds.row_status='active'
    where w.id=$1 and w.row_status='active'`, [wordId]);
  assert.equal(baseline.rows.length, 1);
  const { word: w, metadata: md, dictation: ds } = baseline.rows[0];
  const baseWord = await db.query(`select id,import_batch_id from canonical_teaching_dictionary_words
    where normalised_word='colour' and row_status='active'`);
  assert.equal(baseWord.rows.length, 1);
  const oldBaseMeaning = "an older reviewed colour wording";
  const basePart = [{ id: "base", kind: "base", sourceText: "colour", surfaceText: "colour",
    gloss: oldBaseMeaning, displayRange: { start: 0, end: 6 } }];
  const baseMorph = await db.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
     source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values($1,$2,'staging rollback proof',1,$3,$4::jsonb,'[]'::jsonb,'colour → colour',
      'approved','internal_authored','staging rollback proof','transaction rollback proof',
      'high','approved_for_first_exposure','staging proof',now()) returning id`,
  [baseWord.rows[0].import_batch_id, baseWord.rows[0].id,
    `suffix-base-proof:${randomUUID()}`, JSON.stringify(basePart)]);
  const family = await db.query(`select create_reviewed_lexical_free_base_family(
    $1,$1,$2,$2,'noun','noun','free_base',$3,$3,
    'staging rollback proof','staging proof','staging rollback proof') family_key`,
  [baseWord.rows[0].id, baseMorph.rows[0].id, oldBaseMeaning]);
  assert.equal(family.rows[0].family_key, "colour_noun_base_family");
  const oldParts = [basePart[0], { id: "suffix", kind: "suffix", sourceText: "ful",
    surfaceText: "ful", gloss: "full of", displayRange: { start: 6, end: 9 } }];
  const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
  const oldMorph = await db.query(`insert into canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
     source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values($1,$2,'staging rollback proof',2,$3,$4::jsonb,$5::jsonb,'colour + ful → colourful',
      'approved','internal_authored','staging rollback proof','transaction rollback proof',
      'high','approved_for_first_exposure','staging proof',now()) returning id`,
  [w.import_batch_id, wordId, `suffix-old-proof:${randomUUID()}`,
    JSON.stringify(oldParts), JSON.stringify(joins)]);
  const priorRevision = await db.query(`select review_lexical_base_family_member_revision(
    $1,1,$2,$3,'adjective','derived','Full of colour.',
    'staging rollback proof','staging proof','staging rollback proof') revision`,
  [family.rows[0].family_key, wordId, oldMorph.rows[0].id]);
  assert.equal(priorRevision.rows[0].revision, 2);
  await db.query(`insert into adle_base_word_lexical_family_authorizations
    (family_key,revision,semantic_fingerprint,authorization_reference,authorized_by)
    select family_key,revision,semantic_fingerprint,'staging rollback proof',$2
    from canonical_teaching_dictionary_lexical_base_families
    where family_key=$1 and revision=2`, [family.rows[0].family_key, actor]);
  const profile = await db.query(`select p.id,p.micro_skill_key,m.id member_id
    from canonical_teaching_dictionary_suffix_profiles p
    join canonical_teaching_dictionary_suffix_members m on m.suffix_profile_id=p.id
    where p.micro_skill_key='D4_MOR_SUFFIXES_FUL_LESS' and p.row_status='active'
      and m.row_status='active' limit 1`);
  assert.equal(profile.rows.length, 1);
  const { id: profileId, micro_skill_key: skillKey, member_id: templateId } = profile.rows[0];
  const parts = [
    { id: "base", kind: "base", sourceText: "colour", surfaceText: "colour",
      gloss: "the appearance made by reflected light", displayRange: { start: 0, end: 6 } },
    { id: "suffix", kind: "suffix", sourceText: "ful", surfaceText: "ful",
      gloss: "full of", displayRange: { start: 6, end: 9 } },
  ];
  const inserted = await db.query(`insert into canonical_teaching_dictionary_suffix_members
    (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,
     semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,
     teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,
     transformation_notes,true_morphology_provenance,assignment_eligible,row_status,review_status,
     source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,
     source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at)
    select import_batch_id,$1,$2,member_role,'ful','colour','base','the appearance made by reflected light',
      'Full of colour.',meaning_bin_key,$3::jsonb,$4::jsonb,$3::jsonb,$4::jsonb,'[]'::jsonb,
      '',jsonb_build_object('source','staging proof','status','reviewed'),true,'active',
      'approved_for_first_exposure','staging rollback proof',1,$5,source_metadata,source_category,
      source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,now()
    from canonical_teaching_dictionary_suffix_members where id=$6 returning id`,
  [profileId, wordId, JSON.stringify(parts), JSON.stringify(joins),
    `suffix-import-proof:${randomUUID()}`, templateId]);
  memberId = inserted.rows[0].id;
  await db.query(`update adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const payload = {
    displayWord: w.display_word, definition: "Full of colour.",
    dictationSentence: ds.dictation_sentence,
    dictationTargetTokenIndex: ds.dictation_target_token_index,
    writtenSyllableBreakdown: "col·our·ful",
    ageBand: w.age_band, frequencyBand: w.frequency_band,
    complexityBand: w.complexity_band,
    metadata: {
      syllables: md.syllables, phoneme_hint: md.phoneme_hint,
      grapheme_notes: md.grapheme_notes ?? "",
      stress_pattern: "primary-unstressed-unstressed", has_schwa: md.has_schwa,
      morphemes: md.morphemes ?? "", morphology_notes: md.morphology_notes ?? "",
      irregularity_notes: md.irregularity_notes ?? "",
    },
    canonicalMorphology: {
      rawSegmentation: "colour + ful", rawPartOfSpeech: "adjective",
      parts, featureKeys: [], joins, transformations: [], transformationNotes: "",
      wordSum: "colour + ful → colourful", analysisStatus: "approved",
      reviewNotes: "Reviewed staging suffix Overview proof",
    },
    provenance: {
      sourceCategory: w.source_category, sourceName: w.source_name ?? "",
      sourceUrl: w.source_url ?? "", sourceLicence: w.source_licence ?? "",
      sourceUseNote: w.source_use_note ?? "", confidence: w.confidence,
    },
    skillKeys: [skillKey], routeContents: [],
    freeBaseFamilyReview: { familyKey: family.rows[0].family_key, basePartOfSpeech: "noun" },
  };
  const draft = await db.query(`insert into teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'colourful','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(payload), `CSV batch ${randomUUID()}, row 2 (staging rollback proof)`, actor]);
  draftId = draft.rows[0].id;
  await db.query("select review_teaching_dictionary_overview($1,$2)", [draftId, actor]);
  await db.query("savepoint missing_skill_review");
  try {
    await db.query(`select publish_teaching_dictionary_reviewed_suffix_overview_draft($1,$2,'staging')`, [draftId, actor]);
    throw new Error("UNREVIEWED_SUFFIX_IMPORT_UNEXPECTEDLY_PUBLISHED");
  } catch (error) {
    assert.match(String(error.message), /TEACHING_SUFFIX_IMPORT_REVIEW_STALE/);
    await db.query("rollback to savepoint missing_skill_review");
  }
  await db.query("select review_teaching_dictionary_import_skills($1,$2)", [draftId, actor]);
  const published = await db.query(`select publish_teaching_dictionary_reviewed_suffix_overview_draft($1,$2,'staging') word_id`,
    [draftId, actor]);
  assert.equal(published.rows[0].word_id, wordId);
  const current = await db.query(`select m.id,m.morphology_parts,d.definition,r.previous_member_id,
      (select count(*)::int from adle_reviewed_word_skill_pairs p
        join adle_reviewed_word_skill_releases s on s.id=p.release_id and s.environment_key='staging'
        where p.canonical_word_id=$1 and p.micro_skill_key=$2
          and not exists(select 1 from adle_reviewed_word_skill_withdrawals x where x.release_id=s.id)) skill_count
    from canonical_teaching_dictionary_word_morphology m
    join teaching_dictionary_suffix_overview_reconciliations r on r.canonical_morphology_id=m.id
    join lateral (select definition from teaching_dictionary_definition_versions
      where canonical_word_id=m.canonical_word_id and route_id is null order by published_at desc limit 1) d on true
    where m.canonical_word_id=$1 and m.row_status='active' and r.draft_id=$3`, [wordId, skillKey, draftId]);
  assert.equal(current.rows.length, 1);
  assert.equal(current.rows[0].morphology_parts[1].gloss, "full of");
  assert.equal(current.rows[0].definition, "Full of colour.");
  assert.equal(current.rows[0].previous_member_id, memberId);
  assert.equal(current.rows[0].skill_count, 1);
  const joined = await db.query(`select f.revision,m.canonical_morphology_id
    from canonical_teaching_dictionary_lexical_base_families f
    join canonical_teaching_dictionary_lexical_base_family_members m
      on m.family_key=f.family_key and m.revision=f.revision
    where f.family_key=$1 and f.review_status='approved' and m.canonical_word_id=$2
    order by f.revision desc limit 1`, [family.rows[0].family_key, wordId]);
  assert.equal(joined.rows[0].revision, 3);
  assert.equal(joined.rows[0].canonical_morphology_id, current.rows[0].id);
  const authorization = await db.query(`select 1 from adle_base_word_lexical_family_authorizations
    where family_key=$1 and revision=3 and withdrawn_at is null`, [family.rows[0].family_key]);
  assert.equal(authorization.rows.length, 1);
  console.log("Reviewed suffix Overview and skill publication passed inside rollback");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end().catch(() => {});
}
