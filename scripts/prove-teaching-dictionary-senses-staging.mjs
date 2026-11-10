#!/usr/bin/env node
/** Transactional staging proof of sense publication and lesson binding. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

process.loadEnvFile(".env.staging.local");
const databaseUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!databaseUrl || new URL(databaseUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk" || !actor)
  throw new Error("PINNED_STAGING_DATABASE_AND_ACTOR_REQUIRED");

const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let started = false;
try {
  await db.query("begin");
  started = true;
  const fixture = await db.query(`select w.id, w.normalised_word, pair.micro_skill_key
    from public.canonical_teaching_dictionary_words w
    join public.adle_reviewed_word_skill_pairs pair on pair.canonical_word_id=w.id
    join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
    where w.normalised_word='actual' and release.environment_key='staging'
      and pair.relationship_role='demonstrates'
      and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=release.id)
    limit 1`);
  assert.equal(fixture.rows.length, 1, "existing staging approved word-skill pair");
  const { id: wordId, normalised_word: word, micro_skill_key: skill } = fixture.rows[0];
  const before = await db.query(`select count(*)::integer as n from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [wordId]);
  assert.equal(before.rows[0].n, 0, "fixture has no reviewed senses");

  await db.query("savepoint missing_review");
  await assert.rejects(db.query(`select public.review_teaching_dictionary_lesson_sense($1,$2,$3,$4,$5)`,
    ["staging", wordId, skill, randomUUID(), actor]), /TEACHING_LESSON_REVIEWED_SENSE_REQUIRED/);
  await db.query("rollback to savepoint missing_review");

  const firstSense = randomUUID();
  const secondSense = randomUUID();
  const firstPronunciation = randomUUID();
  const secondPronunciation = randomUUID();
  const senseSet = {
    pronunciations: [
      { id: firstPronunciation, ipa: "/ˈæk.tʃu.əl/", spokenSyllableCount: 3, stressPattern: "primary-unstressed-unstressed" },
      { id: secondPronunciation, ipa: "/ˈæk.tʃəl/", spokenSyllableCount: 2, stressPattern: "primary-unstressed" },
    ],
    senses: [
      { id: firstSense, definition: "Real or existing in fact.", partOfSpeech: "adjective",
        pronunciationId: firstPronunciation, dictationSentence: "The actual result surprised us.", dictationTargetTokenIndex: 1 },
      { id: secondSense, definition: "Used to stress a surprising fact.", partOfSpeech: "adjective",
        pronunciationId: secondPronunciation, dictationSentence: "The actual answer was different.", dictationTargetTokenIndex: 1 },
    ],
  };
  const draftId = randomUUID();
  await db.query(`insert into public.teaching_dictionary_manager_drafts
    (id,canonical_word_id,normalised_word,payload,source_kind,source_reference,created_by)
    values ($1,$2,$3,$4::jsonb,'manual','staging transactional sense proof',$5)`,
  [draftId, wordId, word, JSON.stringify({ senseSet }), actor]);
  await db.query(`insert into public.teaching_dictionary_manager_publications
    (draft_id,canonical_word_id,published_by) values ($1,$2,$3)`, [draftId, wordId, actor]);
  const published = await db.query(`select sense_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [wordId]);
  assert.deepEqual(published.rows[0]?.sense_set, senseSet, "publication reviews both senses and pronunciations");
  const sentences = await db.query(`select sense_id,sentence,target_token_index,source_row_hash
    from public.teaching_dictionary_reviewed_sense_sentences where canonical_word_id=$1`, [wordId]);
  assert.equal(sentences.rows.length, 2, "each sense gains an immutable sentence authority");
  assert.ok(sentences.rows.every(row => row.target_token_index === 1 && /^[a-f0-9]{64}$/.test(row.source_row_hash)));

  await db.query("savepoint unapproved_skill");
  await assert.rejects(db.query(`select public.review_teaching_dictionary_lesson_sense($1,$2,$3,$4,$5)`,
    ["staging", wordId, "D4_MOR_PREFIXES_UN", firstSense, actor]), /TEACHING_LESSON_SKILL_APPROVAL_REQUIRED/);
  await db.query("rollback to savepoint unapproved_skill");
  await db.query(`select public.review_teaching_dictionary_lesson_sense($1,$2,$3,$4,$5)`,
    ["staging", wordId, skill, secondSense, actor]);
  const bindings = await db.query(`select sense_id,sense_snapshot,pronunciation_snapshot
    from public.teaching_dictionary_lesson_sense_bindings
    where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2`, [wordId, skill]);
  assert.equal(bindings.rows.length, 1);
  assert.equal(bindings.rows[0].sense_id, secondSense);
  assert.equal(bindings.rows[0].sense_snapshot.definition, senseSet.senses[1].definition);
  assert.equal(bindings.rows[0].pronunciation_snapshot.ipa, senseSet.pronunciations[1].ipa);

  console.log(JSON.stringify({ result: "passed", database: "staging", publication: true,
    sentenceAuthorities: sentences.rows.length, lessonBinding: true,
    missingReviewRejected: true, unapprovedSkillRejected: true, mutations: "rolled back" }));
} finally {
  if (started) await db.query("rollback");
  await db.end();
}
