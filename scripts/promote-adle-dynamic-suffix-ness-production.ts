/** Guarded production promotion for a separately authorised Dynamic Suffix profile. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const fail = (message: string): never => { throw new Error(`Dynamic suffix production promotion refused: ${message}`); };
const PROFILE_KEY = process.argv[process.argv.indexOf("--profile") + 1] ?? "D4_MOR_SUFFIXES_NESS";
const PRODUCTION_PROFILES = {
  D4_MOR_SUFFIXES_NESS: { folder: "2026-07-27-dynamic-suffix-ness", includeMeaningSort: false, meaningBinCount: 1, suffixVariants: ["ness"] },
  D4_MOR_SUFFIXES_ABLE_IBLE: { folder: "2026-07-27-dynamic-suffix-able-ible", includeMeaningSort: false, meaningBinCount: 1, suffixVariants: ["able", "ible"] },
  D4_MOR_SUFFIXES_MENT: { folder: "2026-07-27-dynamic-suffix-ment", includeMeaningSort: false, meaningBinCount: 1, suffixVariants: ["ment"] },
  D4_MOR_SUFFIXES_ITY: { folder: "2026-07-28-dynamic-suffix-ity", includeMeaningSort: false, meaningBinCount: 1, suffixVariants: ["ity"] },
  // This is deliberately listed only after the separate staging proof and
  // child verification. Applying it still requires the explicit production
  // command and the exact reviewed package hash below.
  D4_MOR_SUFFIXES_FUL_LESS: { folder: "2026-07-28-dynamic-suffix-ful-less", includeMeaningSort: true, meaningBinCount: 2, suffixVariants: ["ful", "less"] },
};
const PROFILE_CONFIG = PRODUCTION_PROFILES[PROFILE_KEY as keyof typeof PRODUCTION_PROFILES]
  ?? fail("profile is not separately approved for production promotion");
const PACKAGE_FOLDER = PROFILE_CONFIG.folder;
const PACKAGE_PATH = resolve(ROOT, `docs/implementation/seed-data/teaching-dictionary/candidates/${PACKAGE_FOLDER}/reviewed-staging-package.json`);
const MIGRATIONS = [
  // The mixed-form 18-item contract builds on the atomic plan RPC, then the
  // existing reviewed SUB/INTER/SUPER exception, before it can add the exact
  // FUL/LESS exception. Each migration is checked in schema_migrations before
  // execution, so a later authorised retry cannot reapply it.
  ...(PROFILE_KEY === "D4_MOR_SUFFIXES_FUL_LESS" ? [
    { version: "20260714120000", name: "add_adle_atomic_composed_plan_rpc", path: resolve(ROOT, "supabase/migrations/20260714120000_add_adle_atomic_composed_plan_rpc.sql") },
    { version: "20260723143000", name: "allow_sub_inter_super_dynamic_prefix_18_item_plan", path: resolve(ROOT, "supabase/migrations/20260723143000_allow_sub_inter_super_dynamic_prefix_18_item_plan.sql") },
  ] : []),
  { version: "20260727110000", name: "add_dynamic_suffix_dictionary_profiles", path: resolve(ROOT, "supabase/migrations/20260727110000_add_dynamic_suffix_dictionary_profiles.sql") },
  ...(PROFILE_KEY === "D4_MOR_SUFFIXES_FUL_LESS"
    ? [{ version: "20260728100000", name: "allow_ful_less_dynamic_suffix_18_item_plan", path: resolve(ROOT, "supabase/migrations/20260728100000_allow_ful_less_dynamic_suffix_18_item_plan.sql") }]
    : []),
];
const PRODUCTION_HOST = "aws-0-eu-west-1.pooler.supabase.com";
const PRODUCTION_USER = "postgres.wwohrqtunajrbwxyssjf";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.toLowerCase().replace(/[^a-z'-]/g, "")).filter(Boolean)[index] ?? "";

type PackageWord = {
  word: string; memberRole: "authentic_target" | "transfer"; suffixVariant: string;
  semanticBaseText: string; semanticBaseKind: "base" | "root"; baseMeaning: string; newWordMeaning: string; meaningBinKey: string;
  dictation: { sentence: string; targetTokenIndex: number; audioText: string };
  teaching: { parts: unknown[]; joins: unknown[] };
  trueMorphology: { parts: unknown[]; joins: unknown[]; transformations: unknown[]; notes: string; provenance: unknown };
  reviewedFacts?: { frequencyBand: string; ageBand: string; complexityBand: string; syllables: string; phonemeHint: string; stressPattern: string; hasSchwa: boolean };
};
type Package = { schemaVersion: number; profile: any; words: PackageWord[] };

function validate(pkg: Package) {
  if (
    pkg.schemaVersion !== 1
    || pkg.profile?.microSkillKey !== PROFILE_KEY
    || pkg.profile?.includeMeaningSort !== PROFILE_CONFIG.includeMeaningSort
    || pkg.profile?.meaningBins?.length !== PROFILE_CONFIG.meaningBinCount
    || !Array.isArray(pkg.words)
    || pkg.words.length !== 4
  ) fail("expected the reviewed four-word suffix package shape");
  const variants = new Set<string>();
  for (const word of pkg.words) {
    const teaching = word.teaching?.parts as any[];
    const trueParts = word.trueMorphology?.parts as any[];
    const suffixes = teaching?.filter((part) => part.kind === "suffix") ?? [];
    if (suffixes.length !== 1 || suffixes[0].surfaceText !== word.suffixVariant || teaching.map((part) => part.surfaceText).join("") !== word.word || trueParts.map((part) => part.surfaceText).join("") !== word.word || !word.trueMorphology?.provenance || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word || word.dictation.audioText !== word.dictation.sentence) fail(`invalid reviewed facts for ${word.word}`);
    variants.add(word.suffixVariant);
  }
  if (variants.size !== PROFILE_CONFIG.suffixVariants.length || PROFILE_CONFIG.suffixVariants.some((variant) => !variants.has(variant))) fail("reviewed suffix forms do not match the approved profile");
}

function source(packageSha256: string, word?: PackageWord) {
  return { package_sha256: packageSha256, promoted_profile: PROFILE_KEY, word, prohibited_writes: { learner: 0, assignment: 0, evidence: 0, scheduling: 0 } };
}

async function applyRequiredMigrations(client: pg.Client) {
  for (const migration of MIGRATIONS) {
    const existing = await client.query("select 1 from supabase_migrations.schema_migrations where version=$1", [migration.version]);
    if (existing.rowCount) continue;
    await client.query(readFileSync(migration.path, "utf8"));
    await client.query(
      "insert into supabase_migrations.schema_migrations (version,name,statements) values ($1,$2,null)",
      [migration.version, migration.name],
    );
  }
}

async function apply(pkg: Package, raw: string, databaseUrl: string) {
  const target = new URL(databaseUrl);
  if (target.hostname !== PRODUCTION_HOST || target.username !== PRODUCTION_USER || target.port !== "5432" || target.pathname !== "/postgres") fail("database URL is not the named production pooler target");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const packageSha256 = sha256(raw);
  await client.connect();
  try {
    await client.query("begin");
    const before = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    await applyRequiredMigrations(client);
    const active = await client.query("select id from canonical_teaching_dictionary_suffix_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE_KEY]);
    if (active.rowCount) fail(`${PROFILE_KEY} already has an active production profile`);
    const existingWords = await client.query("select normalised_word from canonical_teaching_dictionary_words where normalised_word=any($1) and row_status='active' for update", [pkg.words.map((word) => word.word)]);
    const present = new Set(existingWords.rows.map((row) => row.normalised_word));
    const missingWords = pkg.words.filter((word) => !present.has(word.word));
    if (missingWords.some((word) => !word.reviewedFacts)) fail("a missing production word lacks reviewed factual metadata");
    const batchId = randomUUID();
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,'adle_dynamic_suffix_production_profile_v1',$4,$5,$6,'admin_import','validated',$7,'ADLE guarded Dynamic Suffix production promotion',now())", [batchId, `docs/implementation/seed-data/teaching-dictionary/candidates/${PACKAGE_FOLDER}`, packageSha256, { errors: 0 }, { profiles: 1, members: pkg.words.length, created_words: missingWords.length }, { production_enabled: true, profile: PROFILE_KEY, learner_writes: 0 }, source(packageSha256)]);
    for (const [index, word] of missingWords.entries()) {
      const facts = word.reviewedFacts!; const wordId = randomUUID(); const row = pkg.words.indexOf(word) + 2; const metadata = source(packageSha256, word);
      await client.query("insert into canonical_teaching_dictionary_words (id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$7,'en-GB',$8,$9,$10,'internal_reviewed_seed','Dynamic Suffix v3 approved package',$11,'internal','Exact reviewed package promotion authorised for production.','high','approved_for_first_exposure')", [wordId, batchId, row, sha256(JSON.stringify(word)), metadata, `${word.word}_en_gb`, word.word, facts.frequencyBand, facts.ageBand, facts.complexityBand, PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_word_metadata (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$8,$9,$10,$11,'internal_reviewed_seed','Dynamic Suffix v3 approved package',$12,'internal','Human-reviewed true morphology retained as provenance.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, wordId, row, sha256(JSON.stringify(word.trueMorphology)), metadata, facts.syllables, facts.phonemeHint, facts.stressPattern, facts.hasSchwa, `Base: ${word.semanticBaseText} + Suffix: ${word.suffixVariant}`, word.trueMorphology.notes, PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_dictation_sentences (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$6,'internal_reviewed_seed','Dynamic Suffix v3 approved package',$8,'internal','Exact reviewed sentence and identical audio text.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId, wordId, row, sha256(JSON.stringify(word.dictation)), metadata, word.dictation.sentence, word.dictation.targetTokenIndex, PACKAGE_PATH]);
    }
    const words = await client.query("select w.id,w.normalised_word,w.frequency_band,w.age_band,w.complexity_band,(select count(*) from canonical_teaching_dictionary_word_metadata m where m.canonical_word_id=w.id and m.row_status='active' and m.review_status='approved_for_first_exposure') metadata,(select count(*) from canonical_teaching_dictionary_dictation_sentences d where d.canonical_word_id=w.id and d.row_status='active' and d.review_status='approved_for_first_exposure') dictation from canonical_teaching_dictionary_words w where w.normalised_word=any($1) and w.row_status='active' and w.review_status='approved_for_first_exposure' for update", [pkg.words.map((word) => word.word)]);
    if (words.rowCount !== pkg.words.length) fail("every reviewed word must already be an active approved production canonical word");
    const ids = new Map<string, string>();
    for (const row of words.rows) {
      if (!row.frequency_band || !row.age_band || !row.complexity_band || +row.metadata < 1 || +row.dictation !== 1) fail(`${row.normalised_word} lacks required reviewed production facts`);
      ids.set(row.normalised_word, row.id);
    }
    for (const word of pkg.words) {
      const facts = await client.query("select dictation_sentence,dictation_target_token_index,audio_text from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure'", [ids.get(word.word)]);
      if (facts.rowCount !== 1 || facts.rows[0].dictation_sentence !== word.dictation.sentence || facts.rows[0].audio_text !== word.dictation.audioText || facts.rows[0].dictation_target_token_index !== word.dictation.targetTokenIndex) fail(`${word.word} does not match reviewed production dictation facts`);
    }
    const profile = pkg.profile;
    const profileRow = await client.query("insert into canonical_teaching_dictionary_suffix_profiles (import_batch_id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'active','approved_for_first_exposure','reviewed-staging-package.json',1,$12,$13,'internal_reviewed_seed','Dynamic Suffix v3 approved package','internal','Isolated production activation approved by written owner authorisation.','high','Katie Sanderson',now()) returning id", [batchId, PROFILE_KEY, profile.suffixLabel, profile.suffixText, profile.suffixMeaning, JSON.stringify(profile.meaningBins), profile.includeMeaningSort, JSON.stringify(profile.suffixChoices), JSON.stringify(profile.introContent), profile.reflection.promptKey, profile.reflection.promptText, packageSha256, source(packageSha256)]);
    for (let index = 0; index < pkg.words.length; index += 1) {
      const word = pkg.words[index];
      await client.query("insert into canonical_teaching_dictionary_suffix_members (import_batch_id,suffix_profile_id,canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,'active','approved_for_first_exposure','reviewed-staging-package.json',$18,$19,$20,'internal_reviewed_seed','Dynamic Suffix v3 approved package','internal','Teaching split and true morphology are independently retained.','high','Katie Sanderson',now())", [batchId, profileRow.rows[0].id, ids.get(word.word), word.memberRole, word.suffixVariant, word.semanticBaseText, word.semanticBaseKind, word.baseMeaning, word.newWordMeaning, word.meaningBinKey, JSON.stringify(word.teaching.parts), JSON.stringify(word.teaching.joins), JSON.stringify(word.trueMorphology.parts), JSON.stringify(word.trueMorphology.joins), JSON.stringify(word.trueMorphology.transformations), word.trueMorphology.notes, JSON.stringify(word.trueMorphology.provenance), index + 2, sha256(JSON.stringify(word)), source(packageSha256, word)]);
    }
    const verified = await client.query("select (select count(*) from canonical_teaching_dictionary_suffix_profiles where import_batch_id=$1 and micro_skill_key=$2 and production_enabled=true) profiles,(select count(*) from canonical_teaching_dictionary_suffix_members where import_batch_id=$1) members,(select count(*) from canonical_teaching_dictionary_suffix_members m join canonical_teaching_dictionary_suffix_profiles p on p.id=m.suffix_profile_id join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id join canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id where p.id=$3 and m.assignment_eligible and m.row_status='active' and m.review_status='approved_for_first_exposure' and w.row_status='active' and w.review_status='approved_for_first_exposure' and d.row_status='active' and d.review_status='approved_for_first_exposure' and d.dictation_sentence=d.audio_text) safe_members", [batchId, PROFILE_KEY, profileRow.rows[0].id]);
    const after = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    const result = verified.rows[0];
    if (+result.profiles !== 1 || +result.members !== 4 || +result.safe_members !== 4 || JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) fail(`post-promotion invariant failed: ${JSON.stringify({ result, before: before.rows[0], after: after.rows[0] })}`);
    await client.query("commit");
    console.log(JSON.stringify({ status: "production_promoted", profile: PROFILE_KEY, batchId, packageSha256, created: result, prohibitedWrites: before.rows[0] }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

async function main() {
  const raw = readFileSync(PACKAGE_PATH, "utf8"); const pkg = JSON.parse(raw) as Package; validate(pkg); const packageSha256 = sha256(raw);
  if (process.argv.includes("--validate")) { console.log(JSON.stringify({ profile: PROFILE_KEY, packageSha256, valid: true })); return; }
  if (!process.argv.includes("--apply") || arg("--environment") !== "production" || arg("--profile") !== PROFILE_KEY || !Object.hasOwn(PRODUCTION_PROFILES, PROFILE_KEY) || arg("--confirm-package-sha256") !== packageSha256) fail("use --apply --environment production --profile <approved suffix profile> --confirm-package-sha256 <exact>");
  await apply(pkg, raw, arg("--database-url") ?? fail("--database-url is required"));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
