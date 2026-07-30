/** Guarded, dictionary-only production promotion for Closed Compounds. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS";
const WORDS = ["bedroom", "breakthrough", "football", "playground", "rainbow", "sunshine", "weekend"] as const;
const PACKAGE_PATH = resolve(ROOT, "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json");
const CONTENT_PATH = resolve(ROOT, "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds.json");
const MIGRATIONS = [
  { version: "20260714170000", name: "add_adle_child_learning_reflections", path: resolve(ROOT, "supabase/migrations/20260714170000_add_adle_child_learning_reflections.sql") },
  { version: "20260729130000", name: "add_closed_compound_dictionary_profiles", path: resolve(ROOT, "supabase/migrations/20260729130000_add_closed_compound_dictionary_profiles.sql") },
  { version: "20260729130100", name: "allow_closed_compounds_18_item_plan", path: resolve(ROOT, "supabase/migrations/20260729130100_allow_closed_compounds_18_item_plan.sql") },
] as const;
const PRODUCTION_HOST = "aws-0-eu-west-1.pooler.supabase.com";
const PRODUCTION_USER = "postgres.wwohrqtunajrbwxyssjf";

type PackageWord = { word: string; firstWord: string; secondWord: string; firstWordMeaning: string; secondWordMeaning: string; definition: string; dictation: string; targetTokenIndex: number };
type Package = { status: string; approvedPoolProposal: PackageWord[] };
const fail = (message: string): never => { throw new Error(`Closed-compounds production promotion refused: ${message}`); };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.toLowerCase().replace(/[^a-z'-]/g, "")).filter(Boolean)[index] ?? "";

function validate(pkg: Package, content: any) {
  if (pkg.status !== "human_approved_pending_guarded_staging_dictionary_release" || !Array.isArray(pkg.approvedPoolProposal) || pkg.approvedPoolProposal.length !== 7 || !WORDS.every((word) => pkg.approvedPoolProposal.some((entry) => entry.word === word))) fail("approved seven-word package is invalid");
  if (!content?.reviewedIntroduction?.title || !content?.reviewedIntroduction?.childFriendlyExplanation || !content?.reflection?.promptKey || !content?.reflection?.promptText) fail("reviewed profile content is incomplete");
  for (const word of pkg.approvedPoolProposal) {
    if (!word.firstWord || !word.secondWord || !word.firstWordMeaning || !word.secondWordMeaning || !word.definition || `${word.firstWord}${word.secondWord}` !== word.word || tokenAt(word.dictation, word.targetTokenIndex) !== word.word) fail(`invalid compound facts for ${word.word}`);
  }
}

async function applyMigrations(client: pg.Client) {
  const atomic = await client.query("select 1 from supabase_migrations.schema_migrations where version=$1", ["20260714120000"]);
  if (!atomic.rowCount) fail("the atomic ADLE plan persistence migration is absent");
  for (const migration of MIGRATIONS) {
    const existing = await client.query("select 1 from supabase_migrations.schema_migrations where version=$1", [migration.version]);
    if (existing.rowCount) continue;
    await client.query(readFileSync(migration.path, "utf8"));
    await client.query("insert into supabase_migrations.schema_migrations (version,name,statements) values ($1,$2,null)", [migration.version, migration.name]);
  }
}

async function main() {
  const raw = readFileSync(PACKAGE_PATH, "utf8");
  const pkg = JSON.parse(raw) as Package;
  const content = JSON.parse(readFileSync(CONTENT_PATH, "utf8"));
  validate(pkg, content);
  const packageSha256 = sha256(raw);
  if (process.argv.includes("--validate")) { console.log(JSON.stringify({ profile: PROFILE, packageSha256, valid: true })); return; }
  if (!process.argv.includes("--apply") || arg("--environment") !== "production" || arg("--confirm-package-sha256") !== packageSha256 || arg("--confirm") !== "ADLE-CLOSED-COMPOUNDS-PRODUCTION-2026-07-30") fail("use --apply --environment production --confirm-package-sha256 <exact> --confirm ADLE-CLOSED-COMPOUNDS-PRODUCTION-2026-07-30");
  const databaseUrl = arg("--database-url") ?? fail("--database-url is required");
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== PRODUCTION_HOST || decodeURIComponent(parsed.username) !== PRODUCTION_USER) fail("database URL is not the production pooler");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [PROFILE]);
    await applyMigrations(client);
    const prohibitedBefore = await client.query("select (select count(*) from daily_assignments) assignments,(select count(*) from assignment_items) items,(select count(*) from adle_assignment_attempt_events) attempts,(select count(*) from adle_child_learning_reflections) reflections,(select count(*) from adle_review_schedule_words) schedules");
    const existingProfile = await client.query("select id from canonical_teaching_dictionary_compound_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE]);
    if (existingProfile.rowCount) fail("an active Closed Compounds profile already exists");
    const canonical = await client.query("select id,normalised_word,display_word,frequency_band,age_band,complexity_band,row_status,review_status from canonical_teaching_dictionary_words where normalised_word=any($1) for update", [WORDS]);
    if (canonical.rowCount !== WORDS.length) fail("one or more approved canonical words are missing");
    const ids = new Map(canonical.rows.map((row) => [row.normalised_word as string, row.id as string]));
    const reviewedDictationRepairs: PackageWord[] = [];
    for (const entry of pkg.approvedPoolProposal) {
      const word = canonical.rows.find((row) => row.normalised_word === entry.word);
      if (!word || word.display_word !== entry.word || word.row_status !== "active" || word.review_status !== "approved_for_first_exposure" || !word.frequency_band || !word.age_band || !word.complexity_band) fail(`canonical identity or bands are incomplete for ${entry.word}`);
      const metadata = await client.query("select syllables,phoneme_hint,stress_pattern,has_schwa from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure'", [word.id]);
      const dictation = await client.query("select dictation_sentence,dictation_target_token_index,audio_text from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure'", [word.id]);
      if (metadata.rowCount !== 1 || !metadata.rows[0].syllables || !metadata.rows[0].phoneme_hint || !metadata.rows[0].stress_pattern || typeof metadata.rows[0].has_schwa !== "boolean" || dictation.rowCount !== 1) fail(`pronunciation or dictation facts are incomplete for ${entry.word}`);
      const current = dictation.rows[0];
      const dictationMatches = current.dictation_sentence === entry.dictation && current.audio_text === entry.dictation && current.dictation_target_token_index === entry.targetTokenIndex;
      if (!dictationMatches) {
        const onlyApprovedRepair = entry.word === "playground"
          && current.dictation_sentence === "Children play football in the playground."
          && current.audio_text === current.dictation_sentence
          && current.dictation_target_token_index === 5;
        if (!onlyApprovedRepair) fail(`dictation facts are not the reviewed release facts for ${entry.word}`);
        reviewedDictationRepairs.push(entry);
      }
    }
    const batchId = randomUUID();
    const source = { package_sha256: packageSha256, profile: PROFILE, production_enabled: true, learner_writes: 0, staging_child_completion: "ce90d26b-a925-41af-82de-11fff8f99952" };
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,'admin_import','validated',$8,'ADLE guarded closed-compound production promotion',now())", [batchId, "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json", packageSha256, "adle_closed_compound_production_profile_v1", JSON.stringify({ errors: 0 }), JSON.stringify({ profiles: 1, compound_facts: 7 }), JSON.stringify(source), JSON.stringify(source)]);
    for (const entry of reviewedDictationRepairs) {
      const canonicalWordId = ids.get(entry.word)!;
      const retired = await client.query("update canonical_teaching_dictionary_dictation_sentences set row_status='superseded' where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure' and dictation_sentence='Children play football in the playground.' and audio_text='Children play football in the playground.' and dictation_target_token_index=5", [canonicalWordId]);
      if (retired.rowCount !== 1) fail("the exact superseded playground dictation row was not found");
      await client.query("insert into canonical_teaching_dictionary_dictation_sentences (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','closed-compounds-dictionary-pool-review.json',5,$3,$4,$5,$6,$5,'internal_reviewed_seed','Closed compound approved production pool',null,'internal','Approved correction: each selected compound has its own dictation sentence.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, canonicalWordId, sha256(JSON.stringify(entry)), JSON.stringify(source), entry.dictation, entry.targetTokenIndex]);
    }
    const profile = await client.query("insert into canonical_teaching_dictionary_compound_profiles (import_batch_id,micro_skill_key,compound_type,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,'closed',$3,$4,$5,true,'active','approved_for_first_exposure','closed-compounds-dictionary-pool-review.json',1,$6,$7,'internal_reviewed_seed','Closed compound approved production pool','internal','Production activation authorised after staging child verification.','high','Katie Sanderson',now()) returning id", [batchId, PROFILE, JSON.stringify({ ...content.reviewedIntroduction, summary: "Two words join together. The space closes up. They make one new word.", examples: [{ firstWord: "sun", secondWord: "flower", word: "sunflower" }] }), content.reflection.promptKey, content.reflection.promptText, packageSha256, JSON.stringify(source)]);
    for (const [index, entry] of pkg.approvedPoolProposal.entries()) {
      const p1 = { id: "part_1", kind: "base", sourceText: entry.firstWord, surfaceText: entry.firstWord, gloss: entry.firstWordMeaning, displayRange: { start: 0, end: entry.firstWord.length } };
      const p2 = { id: "part_2", kind: "base", sourceText: entry.secondWord, surfaceText: entry.secondWord, gloss: entry.secondWordMeaning, displayRange: { start: entry.firstWord.length, end: entry.word.length } };
      const join = { afterPartId: "part_1", beforePartId: "part_2", joinType: "none", surfaceText: "", displayRange: { start: entry.firstWord.length, end: entry.firstWord.length } };
      await client.query("insert into canonical_teaching_dictionary_compound_facts (import_batch_id,canonical_word_id,micro_skill_key,compound_type,first_word,second_word,first_word_meaning,second_word_meaning,child_friendly_definition,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,transfer_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,'closed',$4,$5,$6,$7,$8,$9,$10,$9,$10,'[]',$11,$12,true,true,'active','approved_for_first_exposure','closed-compounds-dictionary-pool-review.json',$13,$14,$15,'internal_reviewed_seed','Closed compound approved production pool','internal','Explicit approved compound fact; never inferred at runtime.','high','Katie Sanderson',now())", [batchId, ids.get(entry.word), PROFILE, entry.firstWord, entry.secondWord, entry.firstWordMeaning, entry.secondWordMeaning, entry.definition, JSON.stringify([p1, p2]), JSON.stringify([join]), "Closed compound: retain both complete base words with no written space.", JSON.stringify({ package_sha256: packageSha256, approved_review_artifact: "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json" }), index + 2, sha256(JSON.stringify(entry)), JSON.stringify(source)]);
    }
    const verified = await client.query("select (select count(*) from canonical_teaching_dictionary_compound_profiles where import_batch_id=$1 and production_enabled=true and row_status='active' and review_status='approved_for_first_exposure') profiles,(select count(*) from canonical_teaching_dictionary_compound_facts where import_batch_id=$1 and assignment_eligible and transfer_eligible and row_status='active' and review_status='approved_for_first_exposure') facts", [batchId]);
    if (Number(verified.rows[0].profiles) !== 1 || Number(verified.rows[0].facts) !== 7) fail("post-insert dictionary verification failed");
    const prohibitedAfter = await client.query("select (select count(*) from daily_assignments) assignments,(select count(*) from assignment_items) items,(select count(*) from adle_assignment_attempt_events) attempts,(select count(*) from adle_child_learning_reflections) reflections,(select count(*) from adle_review_schedule_words) schedules");
    if (JSON.stringify(prohibitedBefore.rows[0]) !== JSON.stringify(prohibitedAfter.rows[0])) fail("learner, assignment, evidence, reflection or schedule rows changed during promotion");
    await client.query("commit");
    console.log(JSON.stringify({ status: "production_promoted", profile: PROFILE, profileId: profile.rows[0].id, batchId, packageSha256, compoundFacts: 7, prohibitedWrites: prohibitedBefore.rows[0] }, null, 2));
  } catch (error) { try { await client.query("rollback"); } catch {} throw error; } finally { await client.end(); }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
