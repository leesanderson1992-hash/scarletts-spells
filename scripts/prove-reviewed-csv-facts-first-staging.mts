/** Rollback proof: reviewed CSV facts and family publish without skill approval. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const reviewed = parseDictionaryCsv(file.toString("utf8"))
  .find(row => row.normalisedWord === "readable");
assert(reviewed && !reviewed.error && reviewed.payload.senseSet);
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const word = await db.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='readable' and row_status='active' and dialect_code='en-GB'`);
  assert.equal(word.rows.length, 1);
  const wordId = word.rows[0].id as string;
  const live = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [wordId]);
  assert.equal(live.rows.length, 1);
  const existing = live.rows[0].skill_keys as string[];
  const payload = { ...reviewed.payload, skillKeys: existing,
    requestedSkillKeys: reviewed.payload.skillKeys };
  const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'readable','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(payload),
    `CSV batch ${randomUUID()}, reviewed-14-word-pilot.csv, row ${reviewed.rowNumber}`, actor]);
  const draftId = draft.rows[0].id as string;
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [draftId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [draftId, actor]);
  await db.query("savepoint stale_authority");
  const stalePayload = { ...payload, skillKeys: ["D4_OTHER_STALE_PAIR"] };
  const staleDraft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,'readable','en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [wordId, JSON.stringify(stalePayload),
    `CSV batch ${randomUUID()}, stale-proof.csv, row ${reviewed.rowNumber}`, actor]);
  const staleId = staleDraft.rows[0].id as string;
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [staleId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [staleId, actor]);
  await assert.rejects(db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','free_base')`, [staleId, actor]),
  /TEACHING_CSV_FACTS_FIRST_SKILL_AUTHORITY_CHANGED/);
  await db.query("rollback to savepoint stale_authority");
  const published = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','free_base') as id`, [draftId, actor]);
  assert.equal(published.rows[0].id, wordId);
  const after = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [wordId]);
  assert.deepEqual(after.rows[0].skill_keys, existing,
    "CSV fact publication must not add or withdraw a word-skill pair");
  const queue = await db.query(`select micro_skill_key,sense_id from
    public.teaching_dictionary_import_candidate_handoffs
    where draft_id=$1 order by micro_skill_key`, [draftId]);
  assert.deepEqual(queue.rows, [...reviewed.payload.skillKeys].sort().map(micro_skill_key => ({
    micro_skill_key, sense_id: reviewed.payload.senseSet!.senses[0].id })),
  "all requested skills remain available after fact publication");
  const family = await db.query(`select count(*)::int n from
    public.canonical_teaching_dictionary_lexical_base_family_members m
    join public.canonical_teaching_dictionary_lexical_base_families f
      on f.family_key=m.family_key and f.revision=m.revision
    where m.canonical_word_id=$1 and f.family_key='read_verb_base_family'
      and f.review_status='approved'`, [wordId]);
  assert.equal(family.rows[0].n, 1);
  const syntheticWord = "zzproofing";
  const syntheticBase = syntheticWord.slice(0, -3);
  const syntheticSense = `rollback-sense:${syntheticWord}`;
  const syntheticPronunciation = `rollback-pronunciation:${syntheticWord}`;
  const syntheticSentence = `She is ${syntheticWord} today.`;
  const synthetic = { ...payload,
    displayWord: syntheticWord, definition: "Disposable rollback proof form.",
    dictationSentence: syntheticSentence, dictationTargetTokenIndex: 2,
    writtenSyllableBreakdown: `${syntheticBase}·ing`,
    metadata: { ...payload.metadata, syllables: "2", phoneme_hint: "/ˈpruːfɪŋ/",
      stress_pattern: "primary-unstressed" },
    canonicalMorphology: { ...payload.canonicalMorphology, rawPartOfSpeech: "verb",
      parts: [{ id: "base", kind: "base", sourceText: syntheticBase,
        surfaceText: syntheticBase, gloss: "disposable proof" },
      { id: "suffix", kind: "suffix", sourceText: "ing", surfaceText: "ing",
        gloss: "action in progress" }],
      joins: [{ afterPartId: "base", beforePartId: "suffix", joinType: "none" }],
      wordSum: `${syntheticBase} + ing → ${syntheticWord}` },
    senseSet: { pronunciations: [{ id: syntheticPronunciation, ipa: "/ˈpruːfɪŋ/",
      spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
      senses: [{ id: syntheticSense, partOfSpeech: "verb",
        definition: "Disposable rollback proof form.", pronunciationId: syntheticPronunciation,
        dictationSentence: syntheticSentence, dictationTargetTokenIndex: 2 }] },
    skillKeys: [], requestedSkillKeys: ["D4_INF_ING_ENDINGS_REGULAR"],
    freeBaseFamilyReview: undefined, routeContents: [],
    provenance: { ...payload.provenance, sourceName: "Disposable rollback proof" } };
  const newDraft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values(null,$1,'en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [syntheticWord, JSON.stringify(synthetic),
    `CSV batch ${randomUUID()}, disposable-rollback-proof.csv, row 1`, actor]);
  const newDraftId = newDraft.rows[0].id as string;
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [newDraftId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [newDraftId, actor]);
  const newPublished = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','new_word') id`, [newDraftId, actor]);
  const newWordId = newPublished.rows[0].id as string;
  assert.match(newWordId, /^[a-f0-9-]{36}$/);
  const newPairs = await db.query(`select skill_keys from public.teaching_dictionary_import_live_skill_keys(
    'staging',array[$1::uuid])`, [newWordId]);
  assert.deepEqual(newPairs.rows[0].skill_keys, []);
  const newQueue = await db.query(`select micro_skill_key,sense_id from
    public.teaching_dictionary_import_candidate_handoffs where draft_id=$1`, [newDraftId]);
  assert.deepEqual(newQueue.rows, [{ micro_skill_key: "D4_INF_ING_ENDINGS_REGULAR",
    sense_id: syntheticSense }]);
  await db.query("savepoint duplicate_new_identity");
  const duplicateDraft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values(null,'readable','en-GB',$1::jsonb,'csv',$2,$3) returning id`,
  [JSON.stringify({ ...payload, skillKeys: [], requestedSkillKeys: [] }),
    `CSV batch ${randomUUID()}, duplicate-identity-proof.csv, row 1`, actor]);
  const duplicateId = duplicateDraft.rows[0].id as string;
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [duplicateId, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [duplicateId, actor]);
  await assert.rejects(db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','new_word')`, [duplicateId, actor]),
  /TEACHING_CSV_FACTS_FIRST_NEW_WORD_EXISTS/);
  await db.query("rollback to savepoint duplicate_new_identity");
  await db.query("rollback");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  console.log(JSON.stringify({ result: "passed", word: "readable",
    pairSetUnchanged: true, staleAuthorityRejected: true,
    familyApproved: true, requestedCandidateQueued: true,
    newWordFactsOnly: true, duplicateIdentityRejected: true,
    changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
