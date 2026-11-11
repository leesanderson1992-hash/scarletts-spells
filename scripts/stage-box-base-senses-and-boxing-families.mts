/** Staging-only proof of two box bases and three boxing memberships. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { publicationBlockers, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { senseSetErrors } from "../lib/teaching-dictionary-manager/senses";

process.loadEnvFile(".env.staging.local");
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=box-families:staging:2026-11-11"))
  throw new Error("EXPLICIT_STAGING_APPLY_CONFIRMATION_REQUIRED");
const url = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk"
  && actor, "PINNED_STAGING_DATABASE_AND_ACTOR_REQUIRED");
const boxingId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const fightSense = "box-verb-fighting";
const packSense = "box-verb-packing";
const payload: WordDraftPayload = {
  displayWord: "box", definition: "To fight an opponent using padded gloves.",
  dictationSentence: "They will box at the club.", dictationTargetTokenIndex: 2,
  writtenSyllableBreakdown: "box", ageBand: "early_primary", frequencyBand: "high",
  complexityBand: "medium",
  metadata: { syllables: "1", phoneme_hint: "/bɒks/", grapheme_notes: "The letter x represents /ks/.",
    stress_pattern: "primary", morphemes: "box", morphology_notes: "The same free base spelling has two reviewed verb meanings.",
    irregularity_notes: "", has_schwa: false },
  senseSet: { pronunciations: [{ id: "box-pronunciation-en-gb", ipa: "/bɒks/",
    spokenSyllableCount: 1, stressPattern: "primary" }],
  senses: [
    { id: fightSense, partOfSpeech: "verb",
      definition: "To fight an opponent using padded gloves.",
      pronunciationId: "box-pronunciation-en-gb",
      dictationSentence: "They will box at the club.", dictationTargetTokenIndex: 2 },
    { id: packSense, partOfSpeech: "verb",
      definition: "To put things into a box.",
      pronunciationId: "box-pronunciation-en-gb",
      dictationSentence: "Please box the books today.", dictationTargetTokenIndex: 1 },
  ] },
  canonicalMorphology: { rawSegmentation: "box", rawPartOfSpeech: "verb",
    parts: [{ id: "box-legacy-base", kind: "base", sourceText: "box", surfaceText: "box",
      gloss: "To fight an opponent using padded gloves.", displayRange: { start: 0, end: 3 } }],
    featureKeys: [], joins: [], transformations: [], transformationNotes: "",
    wordSum: "box → box", analysisStatus: "approved",
    reviewNotes: "Compatibility Overview analysis; each meaning has independent reviewed parts." },
  provenance: { sourceCategory: "internal_authored", sourceName: "Staging boxing family test",
    sourceUrl: "", sourceLicence: "", sourceUseNote: "Owner requested all three boxing meanings for a staging workflow test.",
    confidence: "medium" },
  skillKeys: [], skillSenseIds: {}, routeContents: [],
};
assert.deepEqual(senseSetErrors(payload.senseSet!), []);
assert.deepEqual(publicationBlockers(payload, "box", { requireCanonicalParts: true }), []);

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
let transaction = false;
try {
  await db.query("begin"); transaction = true;
  await db.query("set local lock_timeout='5s'");
  const controls = await db.query(`select review_enabled,publication_enabled,withdrawal_enabled
    from public.adle_word_skill_review_controls where environment_key='staging'`);
  assert.deepEqual(controls.rows, [{ review_enabled: false, publication_enabled: false,
    withdrawal_enabled: false }]);
  const existing = await db.query(`select id from public.canonical_teaching_dictionary_words
    where normalised_word='box' and dialect_code='en-GB' and row_status='active'`);
  assert.equal(existing.rows.length, 0, "BOX_ALREADY_EXISTS_INSPECT_BEFORE_IMPORT");
  const boxing = await db.query(`select sense_set from public.teaching_dictionary_reviewed_sense_sets
    where canonical_word_id=$1`, [boxingId]);
  assert.deepEqual(boxing.rows[0]?.sense_set.senses.map((sense: { id: string }) => sense.id),
    ["boxing-noun-sport", "boxing-verb-fighting", "boxing-verb-packing"]);
  const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
    (normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
    values('box','en-GB',$1::jsonb,'manual',$2,$3) returning id`,
  [JSON.stringify(payload), `Staging box family test ${randomUUID()}`, actor]);
  await db.query("select public.review_teaching_dictionary_overview($1,$2)", [draft.rows[0].id, actor]);
  const published = await db.query(`select public.publish_teaching_dictionary_manager_draft($1,$2) id`,
    [draft.rows[0].id, actor]);
  const boxId: string = published.rows[0].id;
  const analyses: { senseId: string; gloss: string; boxingSense: string }[] = [
    { senseId: fightSense, gloss: "To fight an opponent using padded gloves.", boxingSense: "boxing-verb-fighting" },
    { senseId: packSense, gloss: "To put things into a box.", boxingSense: "boxing-verb-packing" },
  ];
  for (const row of analyses) {
    const part = [{ id: `base-${row.senseId}`, kind: "base", sourceText: "box", surfaceText: "box",
      gloss: row.gloss, displayRange: { start: 0, end: 3 } }];
    await db.query(`select public.review_teaching_dictionary_sense_morphology(
      $1,$2,$3,'approve',$4::jsonb,'[]'::jsonb,'[]'::jsonb,'box → box',$5,$6)`,
    [randomUUID(), boxId, row.senseId, JSON.stringify(part), actor,
      "Owner-requested three-meaning boxing staging test"]);
  }
  const familyKeys: string[] = [];
  for (const row of analyses) {
    const family = await db.query<{ key: string }>(`select public.create_reviewed_free_base_family_from_sense(
      $1,$2,$3,$4,$5,$6,'regular_inflection',$7,$8) key`,
    [randomUUID(), boxId, row.senseId, boxingId, row.boxingSense,
      `base-${row.boxingSense}`, actor, "Owner-requested three-meaning boxing staging test"]);
    familyKeys.push(family.rows[0].key);
  }
  assert.notEqual(familyKeys[0], familyKeys[1]);
  await db.query(`select public.review_teaching_dictionary_sense_family_membership(
    $1,$2,'boxing-noun-sport',m.id,$3,'base-boxing-noun-sport','derived',
    'approve',$4,$5)
    from public.teaching_dictionary_current_sense_morphology m
    where m.canonical_word_id=$2 and m.sense_id='boxing-noun-sport'`,
  [randomUUID(), boxingId, familyKeys[0], actor,
    "Owner-requested three-meaning boxing staging test"]);
  const memberships = await db.query(`select sense_id,family_key,relationship_kind
    from public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1 order by sense_id`, [boxingId]);
  assert.deepEqual(memberships.rows.map(row => row.sense_id),
    ["boxing-noun-sport", "boxing-verb-fighting", "boxing-verb-packing"]);
  assert.deepEqual(memberships.rows.map(row => row.relationship_kind),
    ["derived", "regular_inflection", "regular_inflection"]);
  if (apply) await db.query("commit"); else await db.query("rollback");
  transaction = false;
  console.log(JSON.stringify({ target: "staging", applied: apply, boxId,
    families: familyKeys, boxingMemberships: memberships.rows.length }));
} finally {
  if (transaction) await db.query("rollback");
  await db.end();
}
