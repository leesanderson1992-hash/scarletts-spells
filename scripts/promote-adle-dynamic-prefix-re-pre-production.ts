// @ts-nocheck -- guarded production transaction uses untyped pg rows.
/** Isolated, one-time production promotion for the staging-proven RE/PRE profile. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROFILE_KEY = "D4_MOR_PREFIXES_RE_PRE";
const PRODUCTION_REF = "wwohrqtunajrbwxyssjf";
const FOLDER = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment";
const PACKAGE_PATH = resolve(ROOT, FOLDER, "reviewed-staging-package.json");
const CORRECTION_PATH = resolve(ROOT, FOLDER, "re-pre-staging-correction-package.json");
const PROFILE_MIGRATION = resolve(ROOT, "supabase/migrations/20260721140000_add_dynamic_prefix_dictionary_profiles.sql");
const INTRO_MIGRATION = resolve(ROOT, "supabase/migrations/20260722210000_add_dynamic_prefix_profile_intro_content.sql");
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new Error(message); };
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase())[index];

function source(baseSha256: string, correctionSha256: string, word?: any) {
  return { package_sha256: baseSha256, correction_package_sha256: correctionSha256, promoted_profile: PROFILE_KEY, word, prohibited_writes: { learner: 0, assignment: 0, evidence: 0, scheduling: 0 } };
}

async function load() {
  const [baseRaw, correctionRaw] = await Promise.all([readFile(PACKAGE_PATH, "utf8"), readFile(CORRECTION_PATH, "utf8")]);
  const pkg = JSON.parse(baseRaw) as { packageKey: string; activation: any; profiles: Record<string, any>; words: any[] };
  const correction = JSON.parse(correctionRaw) as any;
  const words = pkg.words.filter((word) => word.microSkillKey === PROFILE_KEY);
  const blockers: string[] = [];
  if (pkg.packageKey !== "adle_d4_dynamic_prefix_reviewed_staging_2026_07_22" || words.length !== 7 || !pkg.profiles[PROFILE_KEY]) blockers.push("Expected the approved seven-word RE/PRE package.");
  if (sha256(baseRaw) !== correction.basePackage?.sha256 || correction.profileKey !== PROFILE_KEY || correction.environment !== "staging") blockers.push("The RE/PRE correction package does not reconcile to the reviewed base package.");
  if (pkg.activation?.production || pkg.activation?.createsLearningItems || pkg.activation?.createsAssignments || Object.values(correction.activation ?? {}).some(Boolean)) blockers.push("A source package requests prohibited writes.");
  const bins = correction.profile?.meaningBins;
  if (!Array.isArray(bins) || JSON.stringify(bins) !== JSON.stringify([{ id: "again_back", label: "Again", description: "" }, { id: "before", label: "Before", description: "" }]) || correction.profile?.introContent?.title !== "Meet the re- and pre- prefix family" || correction.profile?.introContent?.paragraphs?.[0] !== "re- can mean again or back. pre- can mean before.") blockers.push("Approved RE/PRE presentation configuration is incomplete.");
  for (const word of words) {
    const prefix = word.teaching?.splitParts?.filter((part: any) => part.kind === "prefix") ?? [];
    if (!word.canonical?.frequencyBand || !word.canonical?.ageBand || !word.canonical?.complexityBand || !word.trueMorphology?.humanApprovedText || !word.teaching?.baseMeaning || !word.teaching?.childFriendlyMeaning || prefix.length !== 1 || word.teaching.cleaverBoundary !== prefix[0].displayRange?.end || word.teaching.splitParts.map((part: any) => part.surfaceText).join("") !== word.word || word.dictation?.sentence !== word.dictation?.audioText || tokenAt(word.dictation?.sentence ?? "", word.dictation?.targetTokenIndex) !== word.word || !word.pronunciation?.ipa || !word.complexityPreview?.inputComplete) blockers.push(`${word.word}: incomplete approved contract`);
  }
  return { pkg, correction, words, baseSha256: sha256(baseRaw), correctionSha256: sha256(correctionRaw), blockers };
}

async function apply(input: Awaited<ReturnType<typeof load>>, databaseUrl: string) {
  const target = new URL(databaseUrl);
  if (!target.hostname.includes(PRODUCTION_REF) && !target.username.includes(PRODUCTION_REF)) fail("Refusing a database other than the named production project.");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const batchId = randomUUID();
  try {
    await client.query("begin");
    const before = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling");
    await client.query(await readFile(PROFILE_MIGRATION, "utf8"));
    const introColumn = await client.query("select 1 from information_schema.columns where table_schema='public' and table_name='canonical_teaching_dictionary_prefix_profiles' and column_name='intro_content'");
    if (!introColumn.rowCount) await client.query(await readFile(INTRO_MIGRATION, "utf8"));
    await client.query("insert into supabase_migrations.schema_migrations (version,name,statements) values ('20260721140000','add_dynamic_prefix_dictionary_profiles',null),('20260722210000','add_dynamic_prefix_profile_intro_content',null) on conflict (version) do nothing");
    const existingProfile = await client.query("select id from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' for update", [PROFILE_KEY]);
    if (existingProfile.rowCount) fail(`${PROFILE_KEY} already has an active production profile.`);
    const found = await client.query("select id,normalised_word,row_status,review_status,frequency_band,age_band,complexity_band from canonical_teaching_dictionary_words where normalised_word=any($1) for update", [input.words.map((word) => word.word)]);
    const ids = new Map<string, string>();
    for (const row of found.rows) {
      const fields = await client.query("select (select count(*) from canonical_teaching_dictionary_word_metadata where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure') metadata,(select count(*) from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=$1 and row_status='active' and review_status='approved_for_first_exposure') dictation", [row.id]);
      if (row.row_status !== "active" || row.review_status !== "approved_for_first_exposure" || !row.frequency_band || !row.age_band || !row.complexity_band || +fields.rows[0].metadata < 1 || +fields.rows[0].dictation !== 1) fail(`${row.normalised_word}: retained production row is incomplete.`);
      ids.set(row.normalised_word, row.id);
    }
    const missing = input.words.filter((word) => !ids.has(word.word));
    if (found.rowCount !== 4 || missing.length !== 3) fail(`Dictionary-first invariant failed: expected 4 retained / 3 missing rows, found ${found.rowCount} / ${missing.length}.`);
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,'admin_import','validated',$8,$9,now())", [batchId, FOLDER, input.baseSha256, "adle_dynamic_prefix_production_re_pre_v1", { errors: 0 }, { words: 3, profiles: 1, members: 7 }, { production_enabled: true, profile: PROFILE_KEY, learner_writes: 0 }, source(input.baseSha256, input.correctionSha256), "ADLE guarded RE/PRE production promotion"]);
    for (const word of missing) {
      const id = randomUUID(); ids.set(word.word, id); const rowNumber = input.pkg.words.indexOf(word) + 2; const provenance = source(input.baseSha256, input.correctionSha256, word);
      await client.query("insert into canonical_teaching_dictionary_words (id,import_batch_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,word_key,normalised_word,display_word,dialect_code,frequency_band,age_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$7,'en-GB',$8,$9,$10,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$11,'internal','Approved isolated RE/PRE production package','high','approved_for_first_exposure')", [id,batchId,rowNumber,sha256(JSON.stringify(word)),provenance,word.wordKey,word.word,word.canonical.frequencyBand,word.canonical.ageBand,word.canonical.complexityBand,PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_word_metadata (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$8,$9,$10,$11,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$12,'internal','Human-approved true morphology; complexity preview retained as provenance.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId,id,rowNumber,sha256(JSON.stringify(word.trueMorphology)),provenance,String(word.pronunciation.syllables),word.pronunciation.ipa,word.pronunciation.stressPattern,word.pronunciation.hasSchwa,word.trueMorphology.humanApprovedText,word.trueMorphology.transformationNotes,PACKAGE_PATH]);
      await client.query("insert into canonical_teaching_dictionary_dictation_sentences (import_batch_id,canonical_word_id,row_status,source_sheet,source_row_number,source_row_hash,source_metadata,dictation_sentence,dictation_target_token_index,audio_text,source_category,source_name,source_url,source_licence,source_use_note,confidence,review_status,reviewed_by,reviewed_at) values ($1,$2,'active','reviewed-staging-package.json',$3,$4,$5,$6,$7,$6,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$8,'internal','Approved sentence and identical audio text.','high','approved_for_first_exposure','Katie Sanderson',now())", [batchId,id,rowNumber,sha256(JSON.stringify(word.dictation)),provenance,word.dictation.sentence,word.dictation.targetTokenIndex,PACKAGE_PATH]);
    }
    const profile = input.pkg.profiles[PROFILE_KEY]; const choices = [...input.correction.profile.prefixChoices, ""].map((text: string) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" }));
    const profileRow = await client.query("insert into canonical_teaching_dictionary_prefix_profiles (import_batch_id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'active','approved_for_first_exposure','re-pre-staging-correction-package.json',1,$11,$12,'internal_reviewed_seed','Dynamic Prefix v2 RE/PRE approved package',$13,'internal','Isolated production activation approved for RE/PRE only.','high','Katie Sanderson',now()) returning id", [batchId,PROFILE_KEY,profile.label,profile.text,profile.meaning,JSON.stringify(input.correction.profile.meaningBins),JSON.stringify(choices),`dynamic-prefix-${PROFILE_KEY.toLowerCase()}`,input.correction.profile.reflection,JSON.stringify(input.correction.profile.introContent),sha256(JSON.stringify(input.correction.profile)),source(input.baseSha256,input.correctionSha256),CORRECTION_PATH]);
    for (const word of input.words) { const rowNumber=input.pkg.words.indexOf(word)+2; await client.query("insert into canonical_teaching_dictionary_prefix_members (import_batch_id,prefix_profile_id,canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,transformation_notes,prefix_variant,assignment_eligible,row_status,review_status,source_sheet,source_row_number,source_row_hash,source_metadata,source_category,source_name,source_url,source_licence,source_use_note,confidence,reviewed_by,reviewed_at) values ($1,$2,$3,'transfer',$4,$5,$6,$7,$8,$9,$10,$11,true,'active','approved_for_first_exposure','reviewed-staging-package.json',$12,$13,$14,'internal_reviewed_seed','Dynamic Prefix v2 reviewed package',$15,'internal','Teaching split only; canonical true morphology remains in dictionary metadata.','high','Katie Sanderson',now())", [batchId,profileRow.rows[0].id,ids.get(word.word),word.teaching.baseOrRoot,word.teaching.baseMeaning,word.teaching.childFriendlyMeaning,word.teaching.meaningBin,JSON.stringify(word.teaching.splitParts),JSON.stringify(word.teaching.splitJoins),word.trueMorphology.transformationNotes,word.teaching.prefixVariant,rowNumber,sha256(JSON.stringify(word.teaching)),source(input.baseSha256,input.correctionSha256,word),PACKAGE_PATH]); }
    const verify = await client.query("select (select count(*) from canonical_teaching_dictionary_words where import_batch_id=$1) created_words,(select count(*) from canonical_teaching_dictionary_prefix_profiles where import_batch_id=$1 and micro_skill_key=$2 and production_enabled=true) profiles,(select count(*) from canonical_teaching_dictionary_prefix_members where import_batch_id=$1) members,(select count(*) from canonical_teaching_dictionary_prefix_members m join canonical_teaching_dictionary_prefix_profiles p on p.id=m.prefix_profile_id join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id join canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id where p.id=$3 and m.assignment_eligible and m.row_status='active' and m.review_status='approved_for_first_exposure' and w.row_status='active' and w.review_status='approved_for_first_exposure' and d.row_status='active' and d.review_status='approved_for_first_exposure' and d.dictation_sentence=d.audio_text) safe_members", [batchId,PROFILE_KEY,profileRow.rows[0].id]);
    const after = await client.query("select (select count(*) from adle_learning_items) learning_items,(select count(*) from daily_assignments) assignments,(select count(*) from adle_assignment_attempt_events) evidence,(select count(*) from adle_review_bundles) scheduling"); const result=verify.rows[0];
    if (+result.created_words!==3 || +result.profiles!==1 || +result.members!==7 || +result.safe_members!==7 || JSON.stringify(before.rows[0])!==JSON.stringify(after.rows[0])) fail(`Post-promotion invariant failed: ${JSON.stringify({result,before:before.rows[0],after:after.rows[0]})}`);
    await client.query("commit"); console.log(JSON.stringify({status:"production_promoted",profile:PROFILE_KEY,batchId,basePackageSha256:input.baseSha256,correctionPackageSha256:input.correctionSha256,created:result,prohibitedWrites:before.rows[0]}));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

async function main() { const input=await load(); if (process.argv.includes("--validate")) { console.log(JSON.stringify({profile:PROFILE_KEY,basePackageSha256:input.baseSha256,correctionPackageSha256:input.correctionSha256,blockers:input.blockers},null,2)); if(input.blockers.length) process.exitCode=1; return; } if (!process.argv.includes("--apply") || arg("--environment")!=="production" || arg("--profile")!==PROFILE_KEY || arg("--confirm-base-package-sha256")!==input.baseSha256 || arg("--confirm-correction-package-sha256")!==input.correctionSha256) fail("Use --apply --environment production --profile D4_MOR_PREFIXES_RE_PRE --confirm-base-package-sha256 <exact> --confirm-correction-package-sha256 <exact>."); if(input.blockers.length) fail(input.blockers.join("; ")); const databaseUrl=arg("--database-url"); if(!databaseUrl) fail("--database-url is required."); await apply(input,databaseUrl); }
main().catch((error)=>{console.error(error instanceof Error ? error.message : error);process.exitCode=1;});
