#!/usr/bin/env node
/** Read-only, whole-batch Production audit for the 30 October owner-approved dictionary import. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { parseCsv } from "./teaching-dictionary-release-contract";

const dir = "outputs/teaching-dictionary-import-plan-2026-10-30/";
const reviewDir = "outputs/teaching-dictionary-next-batch-2026-10-30/";
const read = (path: string) => parseCsv(readFileSync(path, "utf8"));
const words = read(dir + "canonical-candidate/canonical_words.csv");
const metadata = read(dir + "canonical-candidate/canonical_word_metadata.csv");
const morphology = read(dir + "canonical-candidate/canonical_word_morphology.csv");
const dictations = read(dir + "canonical-candidate/dictation_sentences.csv");
const definitions = read(dir + "definition-publication-candidates.csv");
const decisions = read(reviewDir + "word-and-family-approval-decisions.csv");
const compounds = read(dir + "compound-structures-draft.csv");
const existing = read(reviewDir + "existing-spelling-lexical-membership-review.csv");
assert.equal(words.length, 304);
assert.equal(existing.length, 102);
const maps = [metadata, morphology, dictations, definitions, decisions].map((rows) =>
  new Map(rows.map((row) => [row.word_key || `${row.normalised_word}_en_gb`, row])));
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!url || !`${new URL(url).hostname}|${decodeURIComponent(new URL(url).username)}`.includes("wwohrqtunajrbwxyssjf")) {
  throw new Error("Verified Production transaction-pooler URL required");
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
await db.connect();
try {
  await db.query("begin read only");
  const result = await db.query(`with latest_family as (
      select distinct on (family_key) family_key,revision
      from public.canonical_teaching_dictionary_lexical_base_families
      where review_status='approved' order by family_key,revision desc)
    select w.word_key,w.normalised_word,w.display_word,w.frequency_band,w.age_band,w.complexity_band,
      md.syllables,md.written_syllable_breakdown,md.phoneme_hint,md.stress_pattern,md.has_schwa,
      mo.word_sum,mo.morphology_parts,mo.morphology_joins,mo.morphology_transformations,
      di.dictation_sentence,di.dictation_target_token_index,di.audio_text,
      (select d.definition from public.teaching_dictionary_definition_versions d
        where d.canonical_word_id=w.id and d.route_id is null
        order by d.published_at desc,d.id desc limit 1) definition,
      coalesce((select array_agg(fm.family_key order by fm.family_key)
        from public.canonical_teaching_dictionary_lexical_base_family_members fm
        join latest_family lf using(family_key,revision)
        where fm.canonical_word_id=w.id),'{}'::text[]) family_tags
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active'
    join public.canonical_teaching_dictionary_word_morphology mo on mo.canonical_word_id=w.id and mo.row_status='active'
    join public.canonical_teaching_dictionary_dictation_sentences di on di.canonical_word_id=w.id and di.row_status='active'
    where w.word_key=any($1::text[]) and w.row_status='active' and w.dialect_code='en-GB'`,
    [words.map((row) => row.word_key)]);
  assert.equal(result.rowCount, 304, "NEW_WORD_RECORDS_INCOMPLETE");
  const actual = new Map(result.rows.map((row) => [row.word_key, row]));
  let transformations = 0;
  for (const word of words) {
    const a = actual.get(word.word_key)!;
    const [md, mo, di, def, decision] = maps.map((map) => map.get(word.word_key)!);
    assert.equal(a.normalised_word, word.normalised_word);
    assert.equal(a.display_word, word.display_word);
    assert.equal(a.frequency_band, word.frequency_band);
    assert.equal(a.age_band, word.age_band);
    assert.equal(a.complexity_band, word.complexity_band);
    assert.equal(a.syllables, md.syllables);
    assert.equal(a.written_syllable_breakdown, md.written_syllable_breakdown);
    assert.equal(a.phoneme_hint, md.phoneme_hint);
    assert.equal(a.stress_pattern, md.stress_pattern);
    assert.equal(a.has_schwa, md.has_schwa === "TRUE");
    assert.equal(a.word_sum, mo.word_sum);
    assert.deepEqual(a.morphology_parts, JSON.parse(mo.morphology_parts));
    assert.deepEqual(a.morphology_joins, JSON.parse(mo.morphology_joins));
    assert.deepEqual(a.morphology_transformations, JSON.parse(mo.morphology_transformations));
    transformations += a.morphology_transformations.length;
    assert.equal(a.dictation_sentence, di.dictation_sentence);
    assert.equal(a.dictation_target_token_index, Number(di.dictation_target_token_index));
    assert.equal(a.audio_text, di.audio_text);
    assert.equal(a.definition, def.definition);
    const required = decision.approved_lexical_family_tags.split("; ").filter(Boolean);
    for (const tag of required) assert(a.family_tags.includes(tag), `MISSING_FAMILY:${word.normalised_word}:${tag}`);
  }
  assert.equal(transformations, 35);
  for (const compound of compounds) {
    const a = [...actual.values()].find((row) => row.normalised_word === compound.normalised_word);
    assert(a, `COMPOUND_MISSING:${compound.normalised_word}`);
    for (const tag of compound.all_family_tags.split("; ")) {
      assert(a.family_tags.includes(tag), `COMPOUND_FAMILY_MISSING:${compound.normalised_word}:${tag}`);
    }
  }
  const existingResult = await db.query(`with latest_family as (
      select distinct on (family_key) family_key,revision
      from public.canonical_teaching_dictionary_lexical_base_families
      where review_status='approved' order by family_key,revision desc)
    select w.normalised_word,count(lf.family_key)::int families
    from public.canonical_teaching_dictionary_words w
    left join public.canonical_teaching_dictionary_lexical_base_family_members fm on fm.canonical_word_id=w.id
    left join latest_family lf on lf.family_key=fm.family_key and lf.revision=fm.revision
    where w.normalised_word=any($1::text[]) and w.row_status='active'
    group by w.normalised_word`, [existing.map((row) => row.word)]);
  assert.equal(existingResult.rowCount, 102);
  const existingByWord = new Map(existingResult.rows.map((row) => [row.normalised_word, row.families]));
  for (const row of existing) assert((existingByWord.get(row.word) ?? 0) > 0, `EXISTING_WORD_FAMILY_MISSING:${row.word}`);
  await db.query("rollback");
  const report = { status: "verified", newWords: 304, definitions: 304, metadata: 304,
    morphology: 304, dictations: 304, transformations, compoundWordsWithAllFamilies: compounds.length,
    existingSpellingsWithFamily: 102, excludedImport: "ice-cream" };
  writeFileSync(dir + "production-final-audit.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
