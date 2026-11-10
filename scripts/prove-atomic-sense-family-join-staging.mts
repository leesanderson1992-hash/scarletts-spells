/** Disposable rollback proof of reading joining the approved read family. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const word = await db.query(`select id,import_batch_id from public.canonical_teaching_dictionary_words
    where normalised_word='reading' and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id as string;
  const prior = await db.query(`select
    (select count(*)::int from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=$1 and row_status='active') morphology,
    (select count(*)::int from public.teaching_dictionary_reviewed_sense_sets
      where canonical_word_id=$1) senses,
    (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members
      where canonical_word_id=$1) lexical_memberships`, [wordId]);
  assert.deepEqual(prior.rows[0], { morphology: 0, senses: 0, lexical_memberships: 0 });
  const parts = [{ id: "base", kind: "base", sourceText: "read", surfaceText: "read",
    gloss: "understand written words", displayRange: { start: 0, end: 4 } },
  { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing",
    gloss: "action in progress", displayRange: { start: 4, end: 7 } }];
  const joins = [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }];
  const morphology = await db.query(`insert into public.canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     raw_morpholex_pos,morphology_parts,morphology_joins,word_sum,analysis_status,
     source_category,source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
    values($1,$2,'sense-family rollback proof',1,$3,'verb',$4::jsonb,$5::jsonb,
      'read + ing → reading','approved','internal_authored','staging proof',
      'Disposable rollback proof','high','approved_for_first_exposure','staging proof',now())
    returning id`, [word.rows[0].import_batch_id,wordId,randomUUID(),
    JSON.stringify(parts),JSON.stringify(joins)]);
  const senseId = "staging-proof:reading-verb";
  await db.query(`insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by)
    values($1,$2::jsonb,$3)`, [wordId,JSON.stringify({
    pronunciations: [{ id: "staging-proof:reading-ipa", ipa: "/ˈriːdɪŋ/",
      spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
    senses: [{ id: senseId, partOfSpeech: "verb", definition: "To read written words.",
      pronunciationId: "staging-proof:reading-ipa" }],
  }),actor]);
  const family = await db.query(`select max(revision)::int revision from
    public.canonical_teaching_dictionary_lexical_base_families
    where family_key='read_verb_base_family' and review_status='approved'`);
  const currentRevision = family.rows[0].revision as number;
  assert(Number.isInteger(currentRevision) && currentRevision > 0);
  await db.query("savepoint rejected_sense");
  try {
    await db.query(`select public.review_lexical_base_family_member_for_sense(
      $1,'read_verb_base_family',$2,$3,$4,'verb','regular_inflection',
      'missing-sense','base','Disposable rollback proof',$5,'Disposable rollback proof')`,
    [randomUUID(),currentRevision,wordId,morphology.rows[0].id,actor]);
    throw new Error("MISSING_SENSE_UNEXPECTEDLY_APPROVED");
  } catch (error) {
    assert.match(String(error), /SENSE_FAMILY_MEANING_CONFLICT/);
    await db.query("rollback to savepoint rejected_sense");
  }
  const joined = await db.query(`select public.review_lexical_base_family_member_for_sense(
    $1,'read_verb_base_family',$2,$3,$4,'verb','regular_inflection',
    $5,'base','Disposable rollback proof',$6,'Disposable rollback proof') revision`,
  [randomUUID(),currentRevision,wordId,morphology.rows[0].id,senseId,actor]);
  assert.equal(joined.rows[0].revision, currentRevision + 1);
  const link = await db.query(`select family_key,current_family_revision,component_part_id
    from public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2`, [wordId,senseId]);
  assert.deepEqual(link.rows, [{ family_key: "read_verb_base_family",
    current_family_revision: currentRevision + 1, component_part_id: "base" }]);
  console.log(JSON.stringify({ result: "passed", word: "reading", atomicRevision: currentRevision + 1,
    missingSenseRejected: true, changes: "rolled back" }));
  await db.query("rollback");
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
