/** Guarded staging-only import for the reviewed combined -able/-ible profile. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE_KEY = "D4_MOR_SUFFIXES_ABLE_IBLE";
const PACKAGE = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-able-ible/reviewed-staging-package.json");
const fail = (message: string): never => { throw new Error(`Dynamic suffix -able/-ible staging import refused: ${message}`); };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.toLowerCase().replace(/[^a-z'-]/g, "")).filter(Boolean)[index] ?? "";

function validate(pkg: any) {
  if (pkg?.schemaVersion !== 1 || pkg.profile?.microSkillKey !== PROFILE_KEY || pkg.profile?.includeMeaningSort !== false || pkg.profile?.meaningBins?.length !== 1 || !Array.isArray(pkg.words) || pkg.words.length !== 4) fail("invalid combined profile envelope");
  const forms = new Set(pkg.words.map((word: any) => word.suffixVariant));
  if (forms.size !== 2 || !forms.has("able") || !forms.has("ible")) fail("the reviewed lesson must contain both suffix forms");
  for (const word of pkg.words) {
    const teaching = word.teaching?.parts ?? []; const trueParts = word.trueMorphology?.parts ?? []; const suffix = teaching.filter((part: any) => part.kind === "suffix");
    if (suffix.length !== 1 || suffix[0].surfaceText !== word.suffixVariant || teaching.map((part: any) => part.surfaceText).join("") !== word.word || trueParts.map((part: any) => part.surfaceText).join("") !== word.word || !word.trueMorphology?.provenance || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word || word.dictation.audioText !== word.dictation.sentence) fail(`invalid reviewed facts for ${word.word ?? "unknown word"}`);
  }
}

async function main() {
  const raw = readFileSync(PACKAGE, "utf8"); const pkg = JSON.parse(raw); validate(pkg);
  if (process.argv.includes("--validate")) { console.log("Dynamic suffix -able/-ible package validation passed."); return; }
  if (process.argv[process.argv.indexOf("--environment") + 1] !== "staging") fail("pass --environment staging");
  if (process.env.ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING !== "disposable-data-only") fail("set ADLE_DYNAMIC_SUFFIX_ACCEPT_STAGING=disposable-data-only");
  const url = process.env.ADLE_DYNAMIC_SUFFIX_STAGING_DATABASE_URL; if (!url || !new URL(url).hostname.includes("jlhotktspjvffslvuyfz")) fail("staging database URL is required");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } }); await client.connect();
  try {
    await client.query("begin");
    const protectedBefore = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    const existing = await client.query("select id from canonical_teaching_dictionary_suffix_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE_KEY]); if (existing.rowCount) fail("active profile already exists");
    const words = await client.query("select id,normalised_word from canonical_teaching_dictionary_words where normalised_word=any($1) and row_status='active' and review_status='approved_for_first_exposure'", [pkg.words.map((word: any) => word.word)]); if (words.rowCount !== 4) fail("every reviewed word must already be active and approved");
    const ids = new Map(words.rows.map((row) => [row.normalised_word, row.id]));
    for (const word of pkg.words) {
      const facts = await client.query("select w.frequency_band,w.age_band,w.complexity_band,m.syllables,m.phoneme_hint,m.stress_pattern,m.has_schwa,d.dictation_sentence,d.dictation_target_token_index,d.audio_text from canonical_teaching_dictionary_words w join canonical_teaching_dictionary_word_metadata m on m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure' join canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id and d.row_status='active' and d.review_status='approved_for_first_exposure' where w.id=$1", [ids.get(word.word)]);
      const fact = facts.rows[0]; if (facts.rowCount !== 1 || !fact.frequency_band || !fact.age_band || !fact.complexity_band || !fact.syllables || !fact.phoneme_hint || !fact.stress_pattern || typeof fact.has_schwa !== "boolean" || fact.dictation_sentence !== word.dictation.sentence || fact.audio_text !== word.dictation.audioText || fact.dictation_target_token_index !== word.dictation.targetTokenIndex) fail(`${word.word} does not match complete reviewed dictionary facts`);
    }
    const packageHash = hash(raw); const batch = await client.query("insert into canonical_teaching_dictionary_import_batches (source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,'adle_dynamic_suffix_able_ible_staging_import_v1',$3,$4,$5,'admin_import','validated',$6,'ADLE guarded Dynamic Suffix -able/-ible staging importer',now()) returning id", ["docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-27-dynamic-suffix-able-ible", packageHash, { errors: 0 }, { profiles: 1, members: 4 }, { production_enabled: false, learner_writes: 0 }, { package_sha256: packageHash, prohibited_writes: { production: 0, learner: 0, assignment: 0, evidence: 0, scheduling: 0 } }]);
    const p = pkg.profile; const profile = await client.query("insert into canonical_teaching_dictionary_suffix_profiles (import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'active','approved_for_first_exposure','reviewed-staging-package.json',1,$12,$13,'internal_reviewed_seed','Dynamic Suffix -able/-ible reviewed staging package','internal','Staging-only combined suffix profile configuration.','high','Katie Sanderson',now()) returning id", [batch.rows[0].id, p.microSkillKey, p.suffixLabel, p.suffixText, p.suffixMeaning, JSON.stringify(p.meaningBins), p.includeMeaningSort, JSON.stringify(p.suffixChoices), JSON.stringify(p.introContent), p.reflection.promptKey, p.reflection.promptText, packageHash, { package_sha256: packageHash }]);
    for (let index = 0; index < pkg.words.length; index += 1) { const word = pkg.words[index]; await client.query("insert into canonical_teaching_dictionary_suffix_members (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,'active','approved_for_first_exposure','reviewed-staging-package.json',$18,$19,$20,'internal_reviewed_seed','Dynamic Suffix -able/-ible reviewed staging package','internal','Teaching split and true morphology are independently retained.','high','Katie Sanderson',now())", [batch.rows[0].id, profile.rows[0].id, ids.get(word.word), word.memberRole, word.suffixVariant, word.semanticBaseText, word.semanticBaseKind, word.baseMeaning, word.newWordMeaning, word.meaningBinKey, JSON.stringify(word.teaching.parts), JSON.stringify(word.teaching.joins), JSON.stringify(word.trueMorphology.parts), JSON.stringify(word.trueMorphology.joins), JSON.stringify(word.trueMorphology.transformations), word.trueMorphology.notes, JSON.stringify(word.trueMorphology.provenance), index + 2, hash(JSON.stringify(word)), { package_sha256: packageHash }]); }
    const protectedAfter = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling"); if (JSON.stringify(protectedBefore.rows[0]) !== JSON.stringify(protectedAfter.rows[0])) fail("protected learner data changed");
    await client.query("commit"); console.log(JSON.stringify({ status: "imported_and_verified", packageSha256: packageHash, productionEnabled: false, profiles: 1, members: 4 }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
