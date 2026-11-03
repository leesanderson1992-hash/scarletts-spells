#!/usr/bin/env node
/** Prove bound-root joining in one transaction; leave no linguistic fixture behind. */
import assert from "node:assert/strict";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const ref = process.env.SUPABASE_STAGING_PROJECT_REF;
if (!url || !ref || !new URL(url).username.endsWith(ref) ||
  !new URL(url).hostname.endsWith("pooler.supabase.com"))
  throw new Error("BOUND_ROOT_STAGING_TARGET_MISMATCH");

const familyKey = "act_verb_base_family";
const words = [
  { id: "119a85a6-54df-55ea-bb1b-b249e0ea0843", text: "act", pos: "verb",
    parts: [{ id: "root", kind: "root", sourceText: "act", surfaceText: "act",
      gloss: "to do", displayRange: { start: 0, end: 3 } }], joins: [] },
  { id: "2b11de62-dad4-5b67-aba4-585ddfd7253d", text: "action", pos: "noun",
    parts: [{ id: "root", kind: "root", sourceText: "act", surfaceText: "act",
      gloss: "to do", displayRange: { start: 0, end: 3 } },
    { id: "suffix", kind: "suffix", sourceText: "ion", surfaceText: "ion",
      gloss: "an act or process", displayRange: { start: 3, end: 6 } }],
    joins: [{ afterPartId: "root", beforePartId: "suffix", joinType: "none" }] },
];

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  await db.query("set local statement_timeout='90s'");
  const baseline = await db.query(`select w.id,w.display_word,m.id morphology_id
    from public.canonical_teaching_dictionary_words w
    left join public.canonical_teaching_dictionary_word_morphology m
      on m.canonical_word_id=w.id and m.row_status='active'
    where w.id=any($1::uuid[]) and w.row_status='active'
      and w.review_status='approved_for_first_exposure'`, [words.map((word) => word.id)]);
  assert.equal(baseline.rowCount, words.length, "both staging words are approved");
  for (const word of words) {
    const row = baseline.rows.find((candidate) => candidate.id === word.id);
    assert.equal(row?.display_word, word.text);
    assert.equal(row.morphology_id, null, "fixture does not replace an approved morphology row");
  }
  const prior = await db.query(`select 1 from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=$1`, [familyKey]);
  assert.equal(prior.rowCount, 0, "fixture family key is unused");
  const batch = await db.query(`select import_batch_id from public.canonical_teaching_dictionary_word_morphology
    limit 1`);
  assert.ok(batch.rows[0]?.import_batch_id, "staging import batch exists");

  const morphIds = [];
  for (const word of words) {
    const inserted = await db.query(`insert into public.canonical_teaching_dictionary_word_morphology
      (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
       morphology_parts,morphology_joins,word_sum,analysis_status,source_category,
       source_name,source_use_note,confidence,review_status,reviewed_by,reviewed_at)
      values($1,$2,'staging rollback proof',1,$3,$4::jsonb,$5::jsonb,$6,'approved',
        'internal_authored','staging rollback proof','transaction rollback proof','high',
        'approved_for_first_exposure','staging proof',now()) returning id`,
    [batch.rows[0].import_batch_id, word.id, `bound-root-proof:${word.text}`,
      JSON.stringify(word.parts), JSON.stringify(word.joins),
      `${word.parts.map((part) => part.sourceText).join(" + ")} → ${word.text}`]);
    morphIds.push(inserted.rows[0].id);
  }
  await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_families
    (family_key,revision,base_lemma,base_part_of_speech,base_kind,base_meaning,
      source_reference,review_status)
    values($1,1,'act','verb','bound_root','to do','staging rollback proof','draft')`, [familyKey]);
  await db.query(`insert into public.canonical_teaching_dictionary_lexical_base_family_members
    (family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,
      canonical_morphology_id,word_sum,morphology_parts,morphology_joins,intended_meaning,source_reference)
    values($1,1,$2,'verb','derived',$3,'act → act',$4::jsonb,'[]'::jsonb,
      'to do','staging rollback proof')`, [familyKey, words[0].id, morphIds[0], JSON.stringify(words[0].parts)]);
  await db.query("savepoint missing_root_entry");
  try {
    await assert.rejects(db.query(`select public.approve_canonical_lexical_base_family(
      $1,1,'staging proof','staging rollback proof')`, [familyKey]), /LEXICAL_ROOT_ENTRY_REQUIRED/);
  } finally {
    await db.query("rollback to savepoint missing_root_entry");
  }
  await db.query(`insert into public.canonical_teaching_dictionary_lexical_root_metadata
    (family_key,revision,root_text,root_meaning,root_definition,origin_language,
      pronunciation_ipa,pronunciation_applicability,source_reference,approval_reference,reviewed_by,reviewed_at)
    values($1,1,'act','to do','the bound root meaning to do','Latin',
      null,'not_applicable','staging rollback proof','staging rollback proof','staging proof',now())`, [familyKey]);
  const approved = await db.query(`select public.approve_canonical_lexical_base_family(
    $1,1,'staging proof','staging rollback proof') fingerprint`, [familyKey]);
  assert.match(approved.rows[0].fingerprint, /^[a-f0-9]{64}$/);
  await db.query("savepoint invalid_root");
  try {
    const invalidParts = structuredClone(words[1].parts);
    invalidParts[0].sourceText = "other";
    await db.query(`update public.canonical_teaching_dictionary_word_morphology
      set morphology_parts=$1::jsonb where id=$2`, [JSON.stringify(invalidParts), morphIds[1]]);
    await assert.rejects(db.query(`select public.review_lexical_base_family_member_revision(
      $1,1,$2,$3,'noun','derived','the result of doing',
      'staging rollback proof','staging proof','staging rollback proof')`,
    [familyKey, words[1].id, morphIds[1]]), /LEXICAL_FAMILY_APPROVED_MORPHOLOGY_REQUIRED/);
  } finally {
    await db.query("rollback to savepoint invalid_root");
  }
  const joined = await db.query(`select public.review_lexical_base_family_member_revision(
    $1,1,$2,$3,'noun','derived','the result of doing',
    'staging rollback proof','staging proof','staging rollback proof') revision`,
  [familyKey, words[1].id, morphIds[1]]);
  assert.equal(joined.rows[0].revision, 2);
  const proof = await db.query(`select f.revision,f.review_status,
      (select count(*)::int from public.canonical_teaching_dictionary_lexical_base_family_members m
        where m.family_key=f.family_key and m.revision=f.revision) members,
      (select r.pronunciation_applicability from public.canonical_teaching_dictionary_lexical_root_metadata r
        where r.family_key=f.family_key and r.revision=f.revision) pronunciation_applicability
    from public.canonical_teaching_dictionary_lexical_base_families f
    where f.family_key=$1 order by f.revision`, [familyKey]);
  assert.deepEqual(proof.rows.map((row) => ({ revision: row.revision,
    status: row.review_status, members: row.members, pronunciationApplicability: row.pronunciation_applicability })), [
    { revision: 1, status: "approved", members: 1, pronunciationApplicability: "not_applicable" },
    { revision: 2, status: "approved", members: 2, pronunciationApplicability: "not_applicable" },
  ]);
  console.log(JSON.stringify({ result: "passed", environment: "staging",
    familyKind: "bound_root", revisedMembership: true, mutations: "rolled_back" }));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
