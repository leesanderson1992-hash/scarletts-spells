/**
 * One-time, guarded production promotion for the staging-proven DIS/MIS
 * Dynamic Prefix Word Lab profile. It intentionally cannot activate another
 * profile or write learner, assignment, evidence, or scheduling records.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE_KEY = "D4_MOR_PREFIXES_DIS_MIS";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const MIGRATION_VERSION = "20260721140000";
const PACKAGE_PATH = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment/reviewed-staging-package.json");
const MIGRATION_PATH = resolve(ROOT, "supabase/migrations/20260721140000_add_dynamic_prefix_dictionary_profiles.sql");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new Error(message); };
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase())[index];
type Word = any;

function source(packageSha256: string, word?: Word) {
  return {
    package_sha256: packageSha256,
    package_key: "adle_d4_dynamic_prefix_reviewed_staging_2026_07_22",
    promoted_profile: PROFILE_KEY,
    word,
    prohibited_writes: { learner: 0, assignment: 0, evidence: 0, scheduling: 0 },
  };
}

async function load() {
  const raw = await readFile(PACKAGE_PATH, "utf8");
  const pkg = JSON.parse(raw) as { packageKey: string; activation: any; profiles: Record<string, any>; words: Word[] };
  const words = pkg.words.filter((word) => word.microSkillKey === PROFILE_KEY);
  const blockers: string[] = [];
  if (pkg.packageKey !== "adle_d4_dynamic_prefix_reviewed_staging_2026_07_22" || words.length !== 7 || !pkg.profiles[PROFILE_KEY]) blockers.push("Expected the approved seven-word DIS/MIS package.");
  if (pkg.activation?.production || pkg.activation?.createsLearningItems || pkg.activation?.createsAssignments) blockers.push("The reviewed package requests prohibited writes.");
  for (const word of words) {
    const prefixes = word.teaching?.splitParts?.filter((part: any) => part.kind === "prefix") ?? [];
    if (!word.canonical?.frequencyBand || !word.canonical?.ageBand || !word.canonical?.complexityBand || !word.trueMorphology?.humanApprovedText || !word.teaching?.baseMeaning || !word.teaching?.childFriendlyMeaning || prefixes.length !== 1 || word.teaching.cleaverBoundary !== prefixes[0].displayRange?.end || word.teaching.splitParts.map((part: any) => part.surfaceText).join("") !== word.word || word.dictation?.sentence !== word.dictation?.audioText || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word || !word.pronunciation?.ipa || !word.complexityPreview?.inputComplete) blockers.push(`${word.word}: incomplete approved contract`);
  }
  return { pkg, words, sha256: hash(raw), blockers };
}

async function main() {
  const { pkg, words, sha256, blockers } = await load();
  if (arg("--environment") !== "production" || arg("--profile") !== PROFILE_KEY || arg("--confirm-package-sha256") !== sha256 || !process.argv.includes("--apply")) fail("Use --apply --environment production --profile D4_MOR_PREFIXES_DIS_MIS --confirm-package-sha256 <exact hash>.");
  if (blockers.length) fail(blockers.join("; "));
  const databaseUrl = arg("--database-url");
  if (!databaseUrl) fail("--database-url is required.");
  const target = new URL(databaseUrl);
  if (!target.hostname.includes(PRODUCTION_REF) && !target.username.includes(PRODUCTION_REF)) fail("Refusing a database other than the named production project.");

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const batchId = randomUUID();
  try {
    await client.query("begin");
    const before = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling");
    const migration = await readFile(MIGRATION_PATH, "utf8");
    await client.query(migration);
    await client.query("insert into supabase_migrations.schema_migrations (version,name,statements) values ($1,$2,null) on conflict (version) do nothing", [MIGRATION_VERSION, "add_dynamic_prefix_dictionary_profiles"]);
    const tables = await client.query("select to_regclass('public.canonical_teaching_dictionary_prefix_profiles') profiles,to_regclass('public.canonical_teaching_dictionary_prefix_members') members");
    if (!tables.rows[0].profiles || !tables.rows[0].members) fail("Dynamic Prefix profile schema is unavailable after migration.");

    const found = await client.query("select id,normalised_word,row_status,review_status,frequency_band,age_band,complexity_band from canonical_teaching_dictionary_words where normalised_word=any($1) for update", [words.map((word) => word.word)]);
    const ids = new Map<string, string>();
    for (const row of found.rows) {
      if (row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" || !row.frequency_band || !row.age_band || !row.complexity_band) fail(`${row.normalised_word}: existing dictionary row is not complete and reviewed.`);
      const checks = await client.query("select (select count(*) from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure') metadata,(select count(*) from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure') dictation", [row.id]);
      if (+checks.rows[0].metadata < 1 || +checks.rows[0].dictation !== 1) fail(`${row.normalised_word}: existing dictionary fields are incomplete.`);
      ids.set(row.normalised_word, row.id);
    }
    const missing = words.filter((word) => !ids.has(word.word));
    if (found.rowCount !== 2 || missing.length !== 5) fail(`Dictionary-first invariant failed: expected 2 complete existing rows and 5 missing rows, found ${found.rowCount} / ${missing.length}.`);
    const existingProfile = await client.query("select id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE_KEY]);
    if (existingProfile.rowCount) fail(`${PROFILE_KEY} already has an active profile; refusing a second production activation.`);

    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())", [batchId, "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment", sha256, "adle_dynamic_prefix_production_dis_mis_v1", { errors: 0 }, { words: 5, profiles: 1, members: 7 }, { production_enabled: true, profile: PROFILE_KEY, learner_writes: 0 }, "admin_import", "validated", source(sha256), "ADLE guarded DIS/MIS production promotion"]);
    for (const word of missing) {
      const id = randomUUID(); ids.set(word.word, id);
      const rowNumber = pkg.words.indexOf(word) + 2;
      await client.query("insert into canonical_teaching_dictionary_words (id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status) values ($1,$2,'active',$3,$4,$5,$6,$7,$8,$8,'en-GB',$9,$10,$11,'internal_reviewed_seed',$12,$13,'internal','Approved Dynamic Prefix production package','high','approved_for_first_exposure')", [id, batchId, "reviewed-staging-package.json", rowNumber, hash(JSON.stringify(word)), source(sha256, word), word.wordKey, word.word, word.canonical.frequencyBand, word.canonical.ageBand, word.canonical.complexityBand, "Dynamic Prefix v2 reviewed package", PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_word_metadata (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$8,$9,$10,$11,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$12,'internal','Human-approved true morphology; complexity preview retained as provenance.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, id, rowNumber, hash(JSON.stringify(word.trueMorphology)), source(sha256, word), String(word.pronunciation.syllables), word.pronunciation.ipa, word.pronunciation.stressPattern, word.pronunciation.hasSchwa, word.trueMorphology.humanApprovedText, word.trueMorphology.transformationNotes, PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_dictation_sentences (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$6,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$8,'internal','Approved sentence and identical audio text.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, id, rowNumber, hash(JSON.stringify(word.dictation)), source(sha256, word), word.dictation.sentence, word.dictation.targetTokenIndex, PACKAGE_PATH]);
    }

    const profile = pkg.profiles[PROFILE_KEY];
    const bins = profile.bins.map(([id, label, description]: string[]) => ({ id, label, description }));
    const choices = [...profile.choices, ""].map((text: string) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" }));
    const insertedProfile = await client.query("insert into canonical_teaching_dictionary_prefix_profiles (import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'active','approved_for_first_exposure','reviewed-staging-package.json',1,$10,$11,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$12,'internal','Production activation approved for DIS/MIS only.','high','Katie Sanderson',now()) returning id", [batchId, PROFILE_KEY, profile.label, profile.text, profile.meaning, JSON.stringify(bins), JSON.stringify(choices), `dynamic-prefix-${PROFILE_KEY.toLowerCase()}`, profile.reflection, hash(JSON.stringify(profile)), source(sha256), PACKAGE_PATH]);
    const profileId = insertedProfile.rows[0].id;
    for (const word of words) {
      const rowNumber = pkg.words.indexOf(word) + 2;
      await client.query("insert into canonical_teaching_dictionary_prefix_members (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,'transfer',$4,$5,$6,$7,$8,$9,$10,$11,true,'active','approved_for_first_exposure','reviewed-staging-package.json',$12,$13,$14,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$15,'internal','Teaching split only; canonical true morphology remains in dictionary metadata.','high','Katie Sanderson',now())", [batchId, profileId, ids.get(word.word), word.teaching.baseOrRoot, word.teaching.baseMeaning, word.teaching.childFriendlyMeaning, word.teaching.meaningBin, JSON.stringify(word.teaching.splitParts), JSON.stringify(word.teaching.splitJoins), word.trueMorphology.transformationNotes, word.teaching.prefixVariant, rowNumber, hash(JSON.stringify(word.teaching)), source(sha256, word), PACKAGE_PATH]);
    }

    const verification = await client.query("select (select count(*) from canonical_teaching_dictionary_words where import_batch_id=$1) created_words,(select count(*) from canonical_teaching_dictionary_prefix_profiles where import_batch_id=$1 and micro_skill_key=$2 and production_enabled=true) profiles,(select count(*) from canonical_teaching_dictionary_prefix_members where import_batch_id=$1) members,(select count(*) from canonical_teaching_dictionary_prefix_members m join canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id join canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id where p.id=$3 and m.row_status='active' and m.review_status='approved_for_first_exposure' and m.assignment_eligible=true and w.row_status='active' and w.review_status='approved_for_first_exposure' and d.row_status='active' and d.review_status='approved_for_first_exposure' and d.dictation_sentence=d.audio_text) safe_members", [batchId, PROFILE_KEY, profileId]);
    const after = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling");
    const result = verification.rows[0];
    if (+result.created_words !== 5 || +result.profiles !== 1 || +result.members !== 7 || +result.safe_members !== 7 || JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) fail(`Post-promotion invariant failed: ${JSON.stringify({ result, before: before.rows[0], after: after.rows[0] })}`);
    await client.query("commit");
    console.log(JSON.stringify({ status: "production_promoted", profile: PROFILE_KEY, batchId, packageSha256: sha256, created: result, prohibitedWrites: before.rows[0] }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
