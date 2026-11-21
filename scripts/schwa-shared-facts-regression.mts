/** Compare the bounded pool reader to authoritative per-word Dictionary reads. */
import assert from "node:assert/strict";
import pg from "pg";
const connection = process.env.SUPABASE_STAGING_DB_URL;
assert(connection?.includes("qkpjbajicacbrphthibk"));
const db = new pg.Client({ connectionString: connection }); await db.connect();
try {
  await db.query("begin read only");
  const ids = (await db.query("select distinct canonical_word_id id from adle_weak_vowel_content_publications order by 1")).rows.map(row => row.id);
  assert(ids.length >= 4);
  for (let at = 0; at < ids.length; at += 100) {
    const batch = ids.slice(at, at + 100);
    const actual = (await db.query("select * from teaching_dictionary_schwa_shared_facts($1)", [batch])).rows;
    assert.equal(actual.length, batch.length);
    for (const id of batch) {
      const definition = (await db.query("select definition from teaching_dictionary_definition_versions where canonical_word_id=$1 and route_id is null order by published_at desc,id desc limit 1", [id])).rows[0]?.definition ?? null;
      const sentence = (await db.query("select dictation_sentence from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure' order by created_at desc,id desc limit 1", [id])).rows[0]?.dictation_sentence ?? null;
      assert.deepEqual(actual.find(row => row.word_id === id), { word_id: id, definition, sentence });
    }
  }
  await db.query("rollback"); console.log({ passed: true, wordsCompared: ids.length, batchFactsMatchDictionary: true, writes: 0 });
} finally { await db.end(); }
