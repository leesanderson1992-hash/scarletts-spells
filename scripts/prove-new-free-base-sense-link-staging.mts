/** Disposable rollback proof: CSV creates a word, then links its reviewed sense to a family. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);
const reviewed = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"))
  .find(row => row.normalisedWord === "readable");
assert(reviewed && !reviewed.error);
const word = "reader";
const sense = "rollback-sense:reader";
const pronunciation = "rollback-pronunciation:reader";
const sentence = "The reader smiled.";
const payload = { ...reviewed.payload, displayWord: word,
  definition: "A person who reads.", dictationSentence: sentence,
  dictationTargetTokenIndex: 1, writtenSyllableBreakdown: "read·er",
  metadata: { ...reviewed.payload.metadata, syllables: "2", phoneme_hint: "/ˈriːdə/",
    stress_pattern: "primary-unstressed" },
  canonicalMorphology: { ...reviewed.payload.canonicalMorphology, rawPartOfSpeech: "noun",
    parts: [{ id: "part_1", kind: "base", sourceText: "read", surfaceText: "read",
      gloss: "understand written words" },
    { id: "part_2", kind: "suffix", sourceText: "er", surfaceText: "er",
      gloss: "a person who does something" }],
    joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
    wordSum: "read + er → reader" },
  senseSet: { pronunciations: [{ id: pronunciation, ipa: "/ˈriːdə/",
    spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
    senses: [{ id: sense, partOfSpeech: "noun", definition: "A person who reads.",
      pronunciationId: pronunciation, dictationSentence: sentence,
      dictationTargetTokenIndex: 1 }] },
  skillKeys: [], requestedSkillKeys: [], freeBaseFamilyReview: undefined,
  routeContents: [] };
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query("begin");
  const migration = readFileSync(
    "supabase/migrations/20261110210000_teaching_csv_atomic_sense_family_link.sql", "utf8");
  await db.query(migration.slice("begin;\n".length, -"\ncommit;\n".length));
  await db.query(`update public.adle_word_skill_review_controls
    set review_enabled=true,publication_enabled=true,withdrawal_enabled=true
    where environment_key='staging'`);
  const existing = await db.query(`select count(*)::int n from public.canonical_teaching_dictionary_words
    where normalised_word=$1 and dialect_code='en-GB' and row_status='active'`, [word]);
  assert.equal(existing.rows[0].n, 0);
  const create = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values(null,$1,'en-GB',$2::jsonb,'csv',$3,$4) returning id`,
  [word, JSON.stringify(payload), `CSV batch ${randomUUID()}, reader-proof.csv, row 1`, actor]);
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [create.rows[0].id, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [create.rows[0].id, actor]);
  const created = await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','new_word') id`, [create.rows[0].id, actor]);
  const wordId = created.rows[0].id as string;
  const familyPayload = { ...payload,
    freeBaseFamilyReview: { familyKey: "read_verb_base_family", basePartOfSpeech: "verb" } };
  const join = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
  [wordId, word, JSON.stringify(familyPayload),
    `CSV batch ${randomUUID()}, reader-family-proof.csv, row 1`, actor]);
  await db.query(`select public.review_teaching_dictionary_overview($1,$2)`, [join.rows[0].id, actor]);
  await db.query(`select public.review_teaching_dictionary_import_skills($1,$2)`, [join.rows[0].id, actor]);
  await db.query(`select public.publish_teaching_dictionary_reviewed_csv_facts_first(
    $1,$2,'staging','free_base')`, [join.rows[0].id, actor]);
  const links = await db.query(`select family_key,component_part_id from
    public.teaching_dictionary_current_sense_family_links
    where canonical_word_id=$1 and sense_id=$2`, [wordId, sense]);
  assert.deepEqual(links.rows, [{ family_key: "read_verb_base_family",
    component_part_id: "part_1" }]);
  await db.query("rollback");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  console.log(JSON.stringify({ result: "passed", newWord: word,
    freeBaseSenseLinked: true, changes: "rolled back" }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally { await db.end(); }
