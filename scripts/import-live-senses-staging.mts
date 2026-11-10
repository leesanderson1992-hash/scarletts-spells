/** Import one canonical spelling with the two owner-requested live senses to staging. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { publicationBlockers, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { senseSetErrors } from "../lib/teaching-dictionary-manager/senses";

process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=live-senses:staging:2026-11-09"))
  throw new Error("EXPLICIT_STAGING_APPLY_CONFIRMATION_REQUIRED");
const databaseUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
if (!databaseUrl || new URL(databaseUrl).username.split(".").at(-1) !== "qkpjbajicacbrphthibk" || !actor)
  throw new Error("PINNED_STAGING_DATABASE_AND_ACTOR_REQUIRED");

const stageSenseId = "live-on-stage";
const aliveSenseId = "live-to-remain-alive";
const stagePronunciationId = "live-pronunciation-long-i";
const alivePronunciationId = "live-pronunciation-short-i";
const payload: WordDraftPayload = {
  displayWord: "live",
  definition: "To be alive or remain alive.",
  dictationSentence: "I hope to live a long life.",
  dictationTargetTokenIndex: 3,
  writtenSyllableBreakdown: "live",
  ageBand: "early_primary",
  frequencyBand: "high",
  complexityBand: "medium",
  metadata: {
    syllables: "1", phoneme_hint: "/lɪv/", stress_pattern: "primary", has_schwa: false,
    grapheme_notes: "The same spelling has /lɪv/ in live a long life and /laɪv/ in a live performance. The final e is silent in both; i-e represents /aɪ/ only in the second pronunciation.",
    morphemes: "live", morphology_notes: "One free base spelling with distinct verb and adjective meanings; select the meaning before assigning a lesson.",
    irregularity_notes: "The final e does not lengthen the vowel in the /lɪv/ verb.",
  },
  senseSet: {
    pronunciations: [
      { id: alivePronunciationId, ipa: "/lɪv/", spokenSyllableCount: 1, stressPattern: "primary" },
      { id: stagePronunciationId, ipa: "/laɪv/", spokenSyllableCount: 1, stressPattern: "primary" },
    ],
    senses: [
      { id: aliveSenseId, partOfSpeech: "verb", definition: "To be alive or remain alive.",
        pronunciationId: alivePronunciationId, dictationSentence: "I hope to live a long life.", dictationTargetTokenIndex: 3 },
      { id: stageSenseId, partOfSpeech: "adjective", definition: "Performed in real time rather than recorded.",
        pronunciationId: stagePronunciationId, dictationSentence: "The band gave a live performance on stage.", dictationTargetTokenIndex: 4 },
    ],
  },
  canonicalMorphology: {
    rawSegmentation: "live", rawPartOfSpeech: "verb",
    parts: [{ id: "live-base", kind: "base", sourceText: "live", surfaceText: "live",
      gloss: "To be alive or remain alive.", displayRange: { start: 0, end: 4 } }],
    featureKeys: [], joins: [], transformations: [], transformationNotes: "",
    wordSum: "live → live", analysisStatus: "approved",
    reviewNotes: "Whole-word free base; pronunciation and meaning are sense-specific.",
  },
  provenance: {
    sourceCategory: "internal_authored", sourceName: "Owner-requested staging pilot",
    sourceUrl: "", sourceLicence: "", sourceUseNote: "Two uses of live requested for staging testing on 2026-11-09; definitions and example sentences authored for this pilot.",
    confidence: "medium",
  },
  skillKeys: [], skillSenseIds: {}, routeContents: [],
};
assert.deepEqual(senseSetErrors(payload.senseSet!), []);
assert.deepEqual(publicationBlockers(payload, "live", { requireCanonicalParts: true }), []);

const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await db.connect();
let transaction = false;
try {
  await db.query("begin"); transaction = true;
  const existing = await db.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='live' and dialect_code='en-GB' and row_status='active'`);
  assert.equal(existing.rows.length, 0, "staging already has an active live entry; inspect before updating");
  const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values ('live','en-GB',$1::jsonb,'manual',$2,$3) returning id`,
  [JSON.stringify(payload), `Owner-requested staging live senses ${randomUUID()}`, actor]);
  const draftId = draft.rows[0].id;
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [draftId, actor]);
  const published = await db.query("select public.publish_teaching_dictionary_manager_draft($1,$2) as id", [draftId, actor]);
  const wordId = published.rows[0].id;
  const facts = await db.query(`select w.id,w.display_word,w.review_status,m.syllables,m.phoneme_hint,
    x.word_sum,x.morphology_parts,s.sense_set
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_metadata m on m.canonical_word_id=w.id and m.row_status='active'
    join public.canonical_teaching_dictionary_word_morphology x on x.canonical_word_id=w.id and x.row_status='active'
    join public.teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id
    where w.id=$1`, [wordId]);
  assert.equal(facts.rows.length, 1);
  assert.equal(facts.rows[0].review_status, "approved_for_first_exposure");
  assert.equal(facts.rows[0].word_sum, "live → live");
  assert.deepEqual(facts.rows[0].sense_set, payload.senseSet);
  const sentences = await db.query(`select sense_id,sentence,target_token_index
    from public.teaching_dictionary_reviewed_sense_sentences where canonical_word_id=$1`, [wordId]);
  assert.equal(sentences.rows.length, 2);
  assert.ok(sentences.rows.some(row => row.sense_id === aliveSenseId && row.target_token_index === 3));
  assert.ok(sentences.rows.some(row => row.sense_id === stageSenseId && row.target_token_index === 4));
  if (apply) await db.query("commit"); else await db.query("rollback");
  transaction = false;
  console.log(JSON.stringify({ result: "passed", applied: apply, wordId, senses: 2,
    pronunciations: 2, sentenceAuthorities: 2, skillLinks: 0 }));
} finally {
  if (transaction) await db.query("rollback");
  await db.end();
}
