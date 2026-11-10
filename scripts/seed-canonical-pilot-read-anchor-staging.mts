/** Stage the reviewed read anchor needed by the 14-word CSV's readable row. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=reviewed-read-anchor-staging"))
  throw new Error("EXACT_STAGING_CONFIRMATION_REQUIRED");
process.loadEnvFile(".env.local");
process.loadEnvFile(".env.staging.local");
const productionUrl = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const stagingUrl = process.env.SUPABASE_STAGING_DB_URL;
const actor = process.env.STAGING_ADMIN_USER_ID;
assert(productionUrl && new URL(productionUrl).username.split(".").at(-1) === "wwohrqtunajrbwxyssjf");
assert(stagingUrl && new URL(stagingUrl).username.split(".").at(-1) === "qkpjbajicacbrphthibk");
assert(actor);

const file = readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(file).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const readable = parseDictionaryCsv(file.toString("utf8")).find(row => row.normalisedWord === "readable");
assert(readable && !readable.error);
const base = readable.payload.canonicalMorphology.parts.find(part => part.kind === "base");
assert(base && base.sourceText === "read" && base.gloss === "understand written words");
assert.equal(readable.payload.freeBaseFamilyReview?.familyKey, "read_verb_base_family");
assert.equal(readable.payload.freeBaseFamilyReview?.basePartOfSpeech, "verb");

const options = { ssl: { rejectUnauthorized: false } };
const production = new pg.Client({ connectionString: productionUrl, ...options });
const staging = new pg.Client({ connectionString: stagingUrl, ...options });
await production.connect();
await staging.connect();
try {
  await production.query("begin read only");
  const approved = await production.query(`select w.id,w.source_row_hash,f.base_meaning,f.base_part_of_speech
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_lexical_base_families f
      on f.canonical_base_word_id=w.id and f.family_key='read_verb_base_family'
    where w.normalised_word='read' and w.dialect_code='en-GB' and w.row_status='active'
      and w.review_status='approved_for_first_exposure' and f.review_status='approved'
      and not exists(select 1 from public.canonical_teaching_dictionary_lexical_base_families newer
        where newer.family_key=f.family_key and newer.revision>f.revision)`);
  assert.equal(approved.rows.length, 1);
  assert.equal(approved.rows[0].base_meaning, base.gloss);
  assert.equal(approved.rows[0].base_part_of_speech, "verb");

  await staging.query("begin");
  await staging.query("set local lock_timeout='5s'");
  const anchor = await staging.query(`select id,import_batch_id,source_row_hash,display_word
    from public.canonical_teaching_dictionary_words
    where normalised_word='read' and dialect_code='en-GB' and row_status='active'
      and review_status='approved_for_first_exposure' for update`);
  assert.equal(anchor.rows.length, 1, "STAGING_READ_ANCHOR_MISSING");
  assert.equal(anchor.rows[0].id, approved.rows[0].id, "READ_IDENTITY_DIFFERS");
  assert.equal(anchor.rows[0].source_row_hash, approved.rows[0].source_row_hash, "READ_SOURCE_DIFFERS");
  assert.equal(anchor.rows[0].display_word, "read");
  const existingMorphology = await staging.query(`select id,morphology_parts,morphology_joins,word_sum,analysis_status,review_status
    from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=$1 and row_status='active'`, [anchor.rows[0].id]);
  const existingFamily = await staging.query(`select family_key,base_meaning,base_part_of_speech,review_status
    from public.canonical_teaching_dictionary_lexical_base_families
    where family_key='read_verb_base_family' or base_lemma='read'`);
  const part = [{ id: "base", kind: "base", sourceText: "read", surfaceText: "read",
    gloss: base.gloss, displayRange: { start: 0, end: 4 } }];
  if (existingMorphology.rows.length || existingFamily.rows.length) {
    assert.equal(existingMorphology.rows.length, 1, "READ_MORPHOLOGY_CONFLICT");
    assert.equal(existingFamily.rows.length, 1, "READ_FAMILY_CONFLICT");
    const morphology = existingMorphology.rows[0];
    assert.deepEqual(morphology.morphology_parts, part);
    assert.deepEqual(morphology.morphology_joins, []);
    assert.equal(morphology.word_sum, "read");
    assert.equal(morphology.analysis_status, "approved");
    assert.equal(morphology.review_status, "approved_for_first_exposure");
    assert.deepEqual(existingFamily.rows[0], { family_key: "read_verb_base_family",
      base_meaning: base.gloss, base_part_of_speech: "verb", review_status: "approved" });
    await staging.query("rollback");
    console.log(JSON.stringify({ status: "already_present", word: "read",
      family: "read_verb_base_family", meaning: base.gloss, morphologyId: morphology.id }));
  } else {
  const inserted = await staging.query(`insert into public.canonical_teaching_dictionary_word_morphology
    (import_batch_id,canonical_word_id,source_sheet,source_row_number,source_row_hash,
     morphology_parts,morphology_joins,morphology_transformations,word_sum,analysis_status,
     source_category,source_name,source_use_note,confidence,review_status,reviewed_by,
     reviewed_at,review_notes)
    values($1,$2,'reviewed 14-word pilot',7,$3,$4::jsonb,'[]'::jsonb,'[]'::jsonb,
      'read','approved','internal_reviewed_seed','Scarletts Spells',
      'Reviewed pilot staging dependency','high','approved_for_first_exposure',
      'Katie Sanderson reviewed 14-word pilot',now(),$5) returning id`,
  [anchor.rows[0].import_batch_id, anchor.rows[0].id, anchor.rows[0].source_row_hash,
    JSON.stringify(part), `Reviewed base meaning from pilot CSV SHA ${createHash("sha256").update(file).digest("hex")}`]);
  const family = await staging.query(`select public.create_reviewed_lexical_free_base_family(
    $1,$1,$2,$2,'verb','verb','free_base',$3,$3,$4,$5,$6) as family_key`,
  [anchor.rows[0].id, inserted.rows[0].id, base.gloss,
    "Reviewed 14-word canonical pilot: read anchor", actor,
    "Katie Sanderson reviewed 14-word pilot; Production read family verified"]);
  assert.equal(family.rows[0].family_key, "read_verb_base_family");
  const output = { status: apply ? "applied" : "rollback_proof", word: "read",
    family: family.rows[0].family_key, meaning: base.gloss, morphologyId: inserted.rows[0].id };
  await staging.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify(output));
  }
} catch (error) {
  await staging.query("rollback").catch(() => {});
  throw error;
} finally {
  await production.query("rollback").catch(() => {});
  await production.end();
  await staging.end();
}
