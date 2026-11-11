/** Three-meaning boxing fixture for the staging Teaching Dictionary page. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { senseSetErrors, type DictionarySenseSet } from "../lib/teaching-dictionary-manager/senses";

process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=boxing-three-senses:staging:2026-11-11"))
  throw new Error("EXPLICIT_STAGING_APPLY_CONFIRMATION_REQUIRED");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk"
  && actor, "PINNED_STAGING_DATABASE_AND_ACTOR_REQUIRED");

const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const senseSet: DictionarySenseSet = {
  pronunciations: [{ id: "boxing-pronunciation-en-gb", ipa: "/bˈɒksɪŋ/",
    spokenSyllableCount: 2, stressPattern: "primary-unstressed" }],
  senses: [
    { id: "boxing-noun-sport", partOfSpeech: "noun",
      definition: "A sport in which two people fight using padded gloves.",
      pronunciationId: "boxing-pronunciation-en-gb",
      dictationSentence: "Boxing is a sport with gloves.", dictationTargetTokenIndex: 0 },
    { id: "boxing-verb-fighting", partOfSpeech: "verb",
      definition: "Fighting an opponent using padded gloves.",
      pronunciationId: "boxing-pronunciation-en-gb",
      dictationSentence: "She is boxing her partner at the club.", dictationTargetTokenIndex: 2 },
    { id: "boxing-verb-packing", partOfSpeech: "verb",
      definition: "Putting things into boxes.",
      pronunciationId: "boxing-pronunciation-en-gb",
      dictationSentence: "He is boxing the books for the move.", dictationTargetTokenIndex: 2 },
  ],
};
assert.deepEqual(senseSetErrors(senseSet), []);
const analyses = [
  { senseId: "boxing-noun-sport", baseGloss: "To fight an opponent using padded gloves.",
    suffixGloss: "The activity or sport of doing something." },
  { senseId: "boxing-verb-fighting", baseGloss: "To fight an opponent using padded gloves.",
    suffixGloss: "An action happening now." },
  { senseId: "boxing-verb-packing", baseGloss: "To put things into a box.",
    suffixGloss: "An action happening now." },
];

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
let transaction = false;
try {
  await db.query("begin"); transaction = true;
  await db.query("set local lock_timeout='5s'");
  const word = await db.query(`select id from public.canonical_teaching_dictionary_words
    where id=$1 and normalised_word='boxing' and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure'`, [wordId]);
  assert.equal(word.rows.length, 1, "BOXING_STAGING_WORD_MISMATCH");
  const previous = await db.query(`select sense_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [wordId]);
  assert.equal(previous.rows.length, 0, "BOXING_SENSES_ALREADY_REVIEWED_INSPECT_FIRST");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }], "STAGING_REVIEW_CONTROLS_CHANGED");
  await db.query(`insert into public.teaching_dictionary_reviewed_sense_sets
    (canonical_word_id,sense_set,reviewed_by) values($1,$2::jsonb,$3)`,
  [wordId, JSON.stringify(senseSet), actor]);
  for (const sense of senseSet.senses) {
    await db.query(`insert into public.teaching_dictionary_reviewed_sense_sentences
      (canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by)
      values($1,$2,$3,$4,public.adle_generic_snapshot_json_sha256_v1(
        jsonb_build_object('senseId',$2::text,'sentence',$3::text,'targetTokenIndex',$4::integer)),$5)`,
    [wordId, sense.id, sense.dictationSentence, sense.dictationTargetTokenIndex, actor]);
  }
  for (const analysis of analyses) {
    const parts = [
      { id: `base-${analysis.senseId}`, kind: "base", sourceText: "box", surfaceText: "box",
        gloss: analysis.baseGloss, displayRange: { start: 0, end: 3 } },
      { id: `suffix-${analysis.senseId}`, kind: "suffix", sourceText: "ing", surfaceText: "ing",
        gloss: analysis.suffixGloss, displayRange: { start: 3, end: 6 } },
    ];
    const joins = [{ afterPartId: parts[0].id, beforePartId: parts[1].id, joinType: "none" }];
    await db.query(`select public.review_teaching_dictionary_sense_morphology(
      $1,$2,$3,'approve',$4::jsonb,$5::jsonb,'[]'::jsonb,'box + ing → boxing',$6,$7)`,
    [randomUUID(), wordId, analysis.senseId, JSON.stringify(parts), JSON.stringify(joins),
      actor, "Owner-requested boxing three-meaning staging test; example wording is staging-only"]);
  }
  const current = await db.query(`select sense_id,morphology_parts from
    public.teaching_dictionary_current_sense_morphology where canonical_word_id=$1
    order by sense_id`, [wordId]);
  assert.equal(current.rows.length, 3);
  assert.equal(new Set(current.rows.map(row => row.morphology_parts[0].gloss)).size, 2);
  const familyLinks = await db.query(`select count(*)::integer n from
    public.teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1`, [wordId]);
  assert.equal(familyLinks.rows[0].n, 0, "FIXTURE_MUST_NOT_APPROVE_A_FAMILY");
  if (apply) await db.query("commit"); else await db.query("rollback");
  transaction = false;
  console.log(JSON.stringify({ target: "staging", applied: apply, wordId,
    senses: current.rows.map(row => row.sense_id), familyLinks: 0, lessonApprovals: 0 }));
} finally {
  if (transaction) await db.query("rollback");
  await db.end();
}
