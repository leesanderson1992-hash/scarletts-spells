/** Staging-only dictionary-first intake for the one reviewed -al word absent from staging. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PACKAGE = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-al/reviewed-staging-package.json";
const PROJECT = "jlhotktspjvffslvuyfz";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new Error(`Dynamic suffix -al seasonal intake refused: ${message}`); };

async function main() {
  const raw = readFileSync(resolve(PACKAGE), "utf8");
  const pkg = JSON.parse(raw);
  const word = pkg.words?.find((entry: any) => entry.word === "seasonal");
  if (!word || pkg.profile?.microSkillKey !== "D4_MOR_SUFFIXES_AL" || word.semanticBaseText !== "season" || word.suffixVariant !== "al") fail("invalid reviewed seasonal package fact");
  const packageSha = hash(raw);
  if (process.argv.includes("--validate")) { console.log(JSON.stringify({ word: "seasonal", packageSha256: packageSha, blockers: [] })); return; }
  if (process.argv[2] !== "--apply" || process.argv.includes("--environment") === false || process.argv[process.argv.indexOf("--environment") + 1] !== "staging" || process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING !== "disposable-data-only") fail("use --apply --environment staging with the staging acknowledgement");
  const connectionString = process.env.ADLE_DYNAMIC_SUFFIX_STAGING_DATABASE_URL;
  if (!connectionString || !new URL(connectionString).username.includes(PROJECT)) fail("a valid named staging database URL is required");
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const protectedBefore = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    const existing = await client.query("select id from canonical_teaching_dictionary_words where normalised_word='seasonal' and row_status='active' for update");
    if (existing.rowCount) { await client.query("commit"); console.log(JSON.stringify({ status: "already_present", word: "seasonal" })); return; }
    const batchId = randomUUID(); const wordId = randomUUID(); const facts = word.reviewedFacts;
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,'adle_dynamic_suffix_al_seasonal_staging_v1',$4,$5,$6,'admin_import','validated',$7,'ADLE guarded Dynamic Suffix -al staging intake',now())", [batchId, PACKAGE, packageSha, { errors: 0 }, { words: 1, metadata: 1, dictation: 1 }, { production_enabled: false, learner_writes: 0 }, { package_sha256: packageSha, prohibited_writes: { production: 0, learner: 0, assignment: 0, evidence: 0, scheduling: 0 } }]);
    const source = { package_sha256: packageSha, reviewed_word: "seasonal", true_morphology: word.trueMorphology.provenance };
    await client.query("insert into canonical_teaching_dictionary_words (id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status) values ($1,$2,'active','reviewed-staging-package.json',5,$3,$4,'seasonal_en_gb','seasonal','seasonal','en-GB',$5,$6,$7,'internal_reviewed_seed','Dynamic Suffix -al reviewed staging package',$8,'internal','Reviewed staging-only dictionary intake.','high','approved_for_first_exposure')", [wordId, batchId, hash(JSON.stringify(word)), source, facts.frequencyBand, facts.ageBand, facts.complexityBand, PACKAGE]);
    await client.query("insert into canonical_teaching_dictionary_word_metadata (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',5,$3,$4,$5,$6,$7,$8,$9,$10,'internal_reviewed_seed','Dynamic Suffix -al reviewed staging package',$11,'internal','Human-approved true morphology retained as provenance.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, wordId, hash(JSON.stringify(word.trueMorphology)), source, facts.syllables, facts.phonemeHint, facts.stressPattern, facts.hasSchwa, "Base: season + Suffix: al", word.trueMorphology.notes, PACKAGE]);
    await client.query("insert into canonical_teaching_dictionary_dictation_sentences (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',5,$3,$4,$5,$6,$5,'internal_reviewed_seed','Dynamic Suffix -al reviewed staging package',$7,'internal','Reviewed sentence and identical audio text.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, wordId, hash(JSON.stringify(word.dictation)), source, word.dictation.sentence, word.dictation.targetTokenIndex, PACKAGE]);
    const protectedAfter = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    if (JSON.stringify(protectedBefore.rows[0]) !== JSON.stringify(protectedAfter.rows[0])) fail("protected learner data changed");
    await client.query("commit"); console.log(JSON.stringify({ status: "imported_and_verified", word: "seasonal", batchId, packageSha256: packageSha }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
