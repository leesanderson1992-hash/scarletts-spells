// @ts-nocheck -- guarded database import script uses untyped pg rows.
/** Profile-only, transactional staging correction for the reviewed RE/PRE lesson. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECT_REF = "jlhotktspjvffslvuyfz";
const PROFILE_KEY = "D4_MOR_PREFIXES_RE_PRE";
const MIGRATION_VERSION = "20260722210000";
const FOLDER = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment";
const BASE_PATH = resolve(ROOT, FOLDER, "reviewed-staging-package.json");
const PACKAGE_PATH = resolve(ROOT, FOLDER, "re-pre-staging-correction-package.json");
const MIGRATION_PATH = resolve(ROOT, "supabase/migrations/20260722210000_add_dynamic_prefix_profile_intro_content.sql");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase())[index];
const fail = (message: string): never => { throw new Error(message); };

type Correction = {
  packageKey: string; profileKey: string; environment: string; targetProjectRef: string; activation: Record<string, boolean>;
  basePackage: { sha256: string }; profile: { introContent: { title: string; paragraphs: string[] }; meaningBins: Array<{ id: string; label: string; description: string }>; prefixChoices: string[]; reflection: string }; words: string[];
};

async function load() {
  const [baseRaw, correctionRaw] = await Promise.all([readFile(BASE_PATH, "utf8"), readFile(PACKAGE_PATH, "utf8")]);
  const base = JSON.parse(baseRaw) as { words: any[]; profiles: Record<string, any> };
  const correction = JSON.parse(correctionRaw) as Correction;
  const blockers: string[] = [];
  if (correction.packageKey !== "adle_d4_dynamic_prefix_re_pre_staging_correction_2026_07_22" || correction.profileKey !== PROFILE_KEY || correction.environment !== "staging" || correction.targetProjectRef !== PROJECT_REF) blockers.push("Correction package identity or staging target is invalid.");
  if (hash(baseRaw) !== correction.basePackage.sha256) blockers.push("The reviewed base package SHA-256 does not match the correction package.");
  if (Object.values(correction.activation).some(Boolean)) blockers.push("Correction package requests prohibited writes.");
  const baseWords = base.words.filter((word) => word.microSkillKey === PROFILE_KEY);
  if (baseWords.length !== 7 || correction.words.length !== 7 || new Set(correction.words).size !== 7 || correction.words.some((word) => !baseWords.some((candidate) => candidate.word === word))) blockers.push("Expected exactly the seven reviewed RE/PRE words.");
  const intro = correction.profile.introContent;
  if (intro.title !== "Meet the re- and pre- prefix family" || intro.paragraphs.length !== 1 || intro.paragraphs[0] !== "re- can mean again or back. pre- can mean before.") blockers.push("Approved RE/PRE explainer is missing or changed.");
  const bins = correction.profile.meaningBins;
  if (bins.length !== 2 || bins[0]?.id !== "again_back" || bins[0]?.label !== "Again" || bins[0]?.description !== "" || bins[1]?.id !== "before" || bins[1]?.label !== "Before" || bins[1]?.description !== "") blockers.push("RE/PRE matching bins must use the approved prefix meanings.");
  if (correction.profile.prefixChoices.join(",") !== "re,pre" || !correction.profile.reflection) blockers.push("RE/PRE profile choices or reflection are incomplete.");
  for (const word of baseWords) {
    const prefix = word.teaching?.splitParts?.filter((part: any) => part.kind === "prefix") ?? [];
    if (!word.canonical?.frequencyBand || !word.canonical?.ageBand || !word.canonical?.complexityBand || !word.trueMorphology?.humanApprovedText || !word.teaching?.baseMeaning || !word.teaching?.childFriendlyMeaning || prefix.length !== 1 || word.teaching.cleaverBoundary !== prefix[0].displayRange?.end || word.teaching.splitParts.map((part: any) => part.surfaceText).join("") !== word.word || word.dictation?.sentence !== word.dictation?.audioText || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word || !word.pronunciation?.ipa || !word.complexityPreview?.inputComplete) blockers.push(`${word.word}: incomplete reviewed contract`);
  }
  return { base, correction, correctionRaw, correctionSha256: hash(correctionRaw), blockers };
}

function source(correctionSha256: string) {
  return { correction_package_sha256: correctionSha256, correction_package_key: "adle_d4_dynamic_prefix_re_pre_staging_correction_2026_07_22", profile_key: PROFILE_KEY, prohibited_writes: { production: 0, learner: 0, assignment: 0, evidence: 0, scheduling: 0 } };
}

async function apply(correction: Correction, correctionSha256: string, databaseUrl: string) {
  const target = new URL(databaseUrl);
  if (!target.hostname.includes(PROJECT_REF) && !target.username.includes(PROJECT_REF)) fail("Database URL does not target the named staging project.");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const batchId = randomUUID();
  try {
    await client.query("begin");
    const before = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    const column = await client.query("select 1 from information_schema.columns where table_schema='public' and table_name='canonical_teaching_dictionary_prefix_profiles' and column_name='intro_content'");
    if (!column.rowCount) await client.query(await readFile(MIGRATION_PATH, "utf8"));
    await client.query("insert into supabase_migrations.schema_migrations (version,name,statements) values ($1,$2,null) on conflict (version) do nothing", [MIGRATION_VERSION, "add_dynamic_prefix_profile_intro_content"]);
    const profileResult = await client.query("select id,production_enabled from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' and review_status='approved_for_first_exposure' for update", [PROFILE_KEY]);
    if (profileResult.rowCount !== 1 || profileResult.rows[0].production_enabled) fail("Expected exactly one disabled approved RE/PRE staging profile.");
    const profileId = profileResult.rows[0].id;
    const members = await client.query("select m.canonical_word_id,w.normalised_word,w.frequency_band,w.age_band,w.complexity_band,md.morphemes,md.morphology_notes,ds.dictation_sentence,ds.audio_text,ds.dictation_target_token_index,m.teaching_split_parts,m.prefix_variant,m.base_word,m.base_meaning,m.child_friendly_meaning,m.meaning_bin_key from canonical_teaching_dictionary_prefix_members m join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id join canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active' and md.review_status='approved_for_first_exposure' join canonical_teaching_dictionary_dictation_sentences ds on ds.canonical_word_id=w.id and ds.row_status='active' and ds.review_status='approved_for_first_exposure' where m.prefix_profile_id=$1 and m.row_status='active' and m.review_status='approved_for_first_exposure' for update", [profileId]);
    if (members.rowCount !== 7 || new Set(members.rows.map((row) => row.normalised_word)).size !== 7 || correction.words.some((word) => !members.rows.some((row) => row.normalised_word === word))) fail("Expected exactly seven complete RE/PRE profile members.");
    for (const row of members.rows) {
      const prefix = row.teaching_split_parts?.filter((part: any) => part.kind === "prefix") ?? [];
      if (!row.frequency_band || !row.age_band || !row.complexity_band || !row.morphemes || row.morphology_notes === null || !row.base_word || !row.base_meaning || !row.child_friendly_meaning || !row.meaning_bin_key || row.dictation_sentence !== row.audio_text || tokenAt(row.dictation_sentence, row.dictation_target_token_index) !== row.normalised_word || prefix.length !== 1 || prefix[0].displayRange?.end <= 0 || prefix[0].displayRange?.end >= row.normalised_word.length || row.teaching_split_parts.map((part: any) => part.surfaceText).join("") !== row.normalised_word || row.prefix_variant !== prefix[0].surfaceText) fail(`${row.normalised_word}: staging dictionary invariant failed.`);
    }
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())", [batchId, FOLDER, correctionSha256, "adle_dynamic_prefix_re_pre_staging_correction_v1", { errors: 0 }, { canonical_words_updated: 0, metadata_updated: 0, profiles_updated: 1, members_updated: 0 }, { production_enabled: false, prohibited_writes: 0 }, "admin_import", "validated", source(correctionSha256), "ADLE guarded RE/PRE staging correction"]);
    const choices = [...correction.profile.prefixChoices, ""].map((text) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" }));
    const update = await client.query("update canonical_teaching_dictionary_prefix_profiles set import_batch_id=$1,intro_content=$2::jsonb,meaning_bins=$3::jsonb,prefix_choices=$4::jsonb,reflection_prompt_text=$5,source_metadata=coalesce(source_metadata,'{}'::jsonb) || $6::jsonb,source_name=$7,source_use_note=$8,confidence='high',production_enabled=false,review_status='approved_for_first_exposure',reviewed_by='Katie Sanderson',reviewed_at=now() where id=$9", [batchId, JSON.stringify(correction.profile.introContent), JSON.stringify(correction.profile.meaningBins), JSON.stringify(choices), correction.profile.reflection, JSON.stringify({ re_pre_correction: source(correctionSha256) }), "Dynamic Prefix v2 RE/PRE reviewed staging correction", "Profile-only explainer and approved prefix-meaning matching; reviewed word data retained unchanged.", profileId]);
    if (update.rowCount !== 1) fail("RE/PRE profile presentation correction write failed.");
    const verify = await client.query("select p.production_enabled,p.intro_content,p.meaning_bins,p.prefix_choices,count(*) member_count from canonical_teaching_dictionary_prefix_profiles p join canonical_teaching_dictionary_prefix_members m on m.prefix_profile_id=p.id where p.id=$1 group by p.production_enabled,p.intro_content,p.meaning_bins,p.prefix_choices", [profileId]);
    const row = verify.rows[0];
    const introMatches = row?.intro_content?.title === correction.profile.introContent.title
      && JSON.stringify(row.intro_content?.paragraphs) === JSON.stringify(correction.profile.introContent.paragraphs);
    const binsMatch = Array.isArray(row?.meaning_bins)
      && row.meaning_bins.length === correction.profile.meaningBins.length
      && row.meaning_bins.every((bin: any, index: number) => bin.id === correction.profile.meaningBins[index].id && bin.label === correction.profile.meaningBins[index].label && bin.description === correction.profile.meaningBins[index].description);
    const choicesMatch = Array.isArray(row?.prefix_choices)
      && row.prefix_choices.length === choices.length
      && row.prefix_choices.every((choice: any, index: number) => choice.text === choices[index].text && choice.label === choices[index].label && choice.status === choices[index].status && choice.outcome === null && choice.meaning === null);
    if (verify.rowCount !== 1 || row.production_enabled || +row.member_count !== 7 || !introMatches || !binsMatch || !choicesMatch) fail("Post-correction RE/PRE profile verification failed.");
    const after = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_schedule_words) scheduling");
    if (JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) fail(`Prohibited staging writes detected: ${JSON.stringify({ before: before.rows[0], after: after.rows[0] })}`);
    await client.query("commit");
    console.log(JSON.stringify({ status: "applied_and_verified", batchId, correctionSha256, updated: { canonicalWords: 0, metadata: 0, profile: 1, members: 0 }, productionEnabled: false, prohibitedWrites: before.rows[0] }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

async function main() {
  const { correction, correctionSha256, blockers } = await load();
  const manifest = { packagePath: PACKAGE_PATH, correctionSha256, profileKey: PROFILE_KEY, wordCount: correction.words.length, blockers };
  if (process.argv.includes("--validate")) { console.log(JSON.stringify(manifest, null, 2)); if (blockers.length) process.exitCode = 1; return; }
  if (!process.argv.includes("--apply")) fail("Use --validate or --apply.");
  if (blockers.length) fail(blockers.join("; "));
  if (arg("--environment") !== "staging") fail("Staging only.");
  if (arg("--confirm-package-sha256") !== correctionSha256) fail("Exact correction package SHA-256 is required.");
  const databaseUrl = arg("--database-url"); if (!databaseUrl) fail("--database-url is required.");
  await apply(correction, correctionSha256, databaseUrl);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
