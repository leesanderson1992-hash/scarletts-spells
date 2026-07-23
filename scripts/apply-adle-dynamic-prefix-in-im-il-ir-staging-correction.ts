// @ts-nocheck -- the repository's guarded database import scripts use untyped pg rows.
/** Guarded, transactional correction for the reviewed IN/IM/IL/IR staging profile. */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECT_REF = "jlhotktspjvffslvuyfz";
const PROFILE_KEY = "D4_MOR_PREFIXES_IN_IM_IL_IR";
const FOLDER = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment";
const BASE_PATH = resolve(ROOT, FOLDER, "reviewed-staging-package.json");
const PACKAGE_PATH = resolve(ROOT, FOLDER, "in-im-il-ir-staging-correction-package.json");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const tokenAt = (sentence: string, index: number) => sentence.trim().split(/\s+/).map((token) => token.replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase())[index];
const fail = (message: string): never => { throw new Error(message); };
const arg = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };

type CorrectionWord = { word: string; retainedCanonical: boolean; canonical: { frequencyBand: string; ageBand: string; complexityBand: string; teachingAge: number }; trueMorphology: { humanApprovedText: string; transformationNotes: string }; dictation: { sentence: string; audioText: string; targetTokenIndex: number }; pronunciation: { ipa: string; syllables: number; stressPattern: string; hasSchwa: boolean }; complexityPreview: { structuralScore: number; complexityLevel: number; inputComplete: boolean } };
type Correction = { packageKey: string; profileKey: string; environment: string; targetProjectRef: string; activation: Record<string, boolean>; basePackage: { sha256: string }; profile: { meaningBins: unknown[]; prefixChoices: string[]; reflection: string }; words: CorrectionWord[]; review: Record<string, unknown> };
type BaseWord = any;

async function load() {
  const [baseRaw, correctionRaw] = await Promise.all([readFile(BASE_PATH, "utf8"), readFile(PACKAGE_PATH, "utf8")]);
  const base = JSON.parse(baseRaw) as { words: BaseWord[]; profiles: Record<string, any> };
  const correction = JSON.parse(correctionRaw) as Correction;
  const blockers: string[] = [];
  if (correction.packageKey !== "adle_d4_dynamic_prefix_in_im_il_ir_staging_correction_2026_07_22" || correction.profileKey !== PROFILE_KEY || correction.environment !== "staging" || correction.targetProjectRef !== PROJECT_REF) blockers.push("Correction package identity or staging target is invalid.");
  if (hash(baseRaw) !== correction.basePackage.sha256) blockers.push("The reviewed base package SHA-256 does not match the correction package.");
  if (Object.values(correction.activation).some(Boolean)) blockers.push("Correction package requests prohibited writes.");
  const baseWords = base.words.filter((word) => word.microSkillKey === PROFILE_KEY);
  if (baseWords.length !== 7 || correction.words.length !== 7 || new Set(correction.words.map((word) => word.word)).size !== 7) blockers.push("Expected exactly seven distinct IN/IM/IL/IR words.");
  for (const word of correction.words) {
    const baseWord = baseWords.find((candidate) => candidate.word === word.word);
    const prefix = baseWord?.teaching?.splitParts?.filter((part: any) => part.kind === "prefix") ?? [];
    if (!baseWord || !word.canonical.frequencyBand || !word.canonical.ageBand || !word.canonical.complexityBand || word.canonical.teachingAge !== 8 || !word.trueMorphology.humanApprovedText || !word.pronunciation.ipa || !word.pronunciation.syllables || !word.pronunciation.stressPattern || !word.complexityPreview.inputComplete || word.dictation.sentence !== word.dictation.audioText || tokenAt(word.dictation.sentence, word.dictation.targetTokenIndex) !== word.word || prefix.length !== 1 || baseWord.teaching.cleaverBoundary !== prefix[0].displayRange?.end || baseWord.teaching.splitParts.map((part: any) => part.surfaceText).join("") !== word.word) blockers.push(`${word.word}: incomplete correction contract`);
  }
  if (correction.words.filter((word) => word.retainedCanonical).length !== 4) blockers.push("Expected exactly four retained canonical corrections.");
  return { base, correction, correctionRaw, correctionSha256: hash(correctionRaw), blockers };
}

function source(correctionSha256: string, word?: CorrectionWord) {
  return { correction_package_sha256: correctionSha256, correction_package_key: "adle_d4_dynamic_prefix_in_im_il_ir_staging_correction_2026_07_22", profile_key: PROFILE_KEY, word, prohibited_writes: { production: 0, learner: 0, assignment: 0, evidence: 0, scheduling: 0 } };
}

async function apply(correction: Correction, correctionSha256: string, databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (!parsed.hostname.includes(PROJECT_REF) && !parsed.username.includes(PROJECT_REF)) fail("Database URL does not target the named staging project.");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const batchId = randomUUID();
  try {
    await client.query("begin");
    const tables = await client.query("select to_regclass('public.canonical_teaching_dictionary_prefix_profiles') as profiles, to_regclass('public.canonical_teaching_dictionary_prefix_members') as members");
    if (!tables.rows[0].profiles || !tables.rows[0].members) fail("Dynamic Prefix profile tables are not present.");
    const profileResult = await client.query("select id,production_enabled from canonical_teaching_dictionary_prefix_profiles where micro_skill_key=$1 and row_status='active' and review_status='approved_for_first_exposure' for update", [PROFILE_KEY]);
    if (profileResult.rowCount !== 1 || profileResult.rows[0].production_enabled) fail("Expected exactly one disabled approved staging profile.");
    const profileId = profileResult.rows[0].id as string;
    const memberResult = await client.query("select m.canonical_word_id,w.normalised_word,m.teaching_split_parts,m.teaching_split_joins,m.prefix_variant,m.base_word,m.base_meaning,m.child_friendly_meaning,m.meaning_bin_key from canonical_teaching_dictionary_prefix_members m join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id where m.prefix_profile_id=$1 and m.row_status='active' and m.review_status='approved_for_first_exposure' for update", [profileId]);
    if (memberResult.rowCount !== 7) fail("Expected seven active approved profile members.");
    const byWord = new Map(memberResult.rows.map((row) => [row.normalised_word, row]));
    for (const word of correction.words) if (!byWord.has(word.word)) fail(`${word.word}: missing staging member.`);
    await client.query("insert into canonical_teaching_dictionary_import_batches (id,source_folder_path,source_folder_sha256,validator_version,validation_summary,row_counts,readiness_summary,import_mode,batch_status,source_metadata,imported_by,imported_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())", [batchId, FOLDER, correctionSha256, "adle_dynamic_prefix_in_im_il_ir_staging_correction_v1", { errors: 0 }, { canonical_words_updated: 4, metadata_updated: 4, profiles_updated: 1, members_updated: 0 }, { production_enabled: false, prohibited_writes: 0 }, "admin_import", "validated", source(correctionSha256), "ADLE guarded IN/IM/IL/IR staging correction"]);
    for (const word of correction.words.filter((candidate) => candidate.retainedCanonical)) {
      const existing = byWord.get(word.word)!;
      const result = await client.query("update canonical_teaching_dictionary_words set import_batch_id=$1,frequency_band=$2,age_band=$3,complexity_band=$4,source_metadata=coalesce(source_metadata,'{}'::jsonb) || $5::jsonb,source_name=$6,source_use_note=$7,confidence='high',review_status='approved_for_first_exposure' where id=$8 and row_status='active'", [batchId, word.canonical.frequencyBand, word.canonical.ageBand, word.canonical.complexityBand, JSON.stringify({ in_im_il_ir_correction: source(correctionSha256, word), teaching_age: word.canonical.teachingAge, complexity_preview: word.complexityPreview }), "Dynamic Prefix v2 IN/IM/IL/IR reviewed staging correction", "Human-approved bands and staging-only correction provenance.", existing.canonical_word_id]);
      if (result.rowCount !== 1) fail(`${word.word}: canonical correction write failed.`);
      const metadata = await client.query("update canonical_teaching_dictionary_word_metadata set import_batch_id=$1,morphemes=$2,morphology_notes=$3,source_metadata=coalesce(source_metadata,'{}'::jsonb) || $4::jsonb,source_name=$5,source_use_note=$6,confidence='high',review_status='approved_for_first_exposure',reviewed_by='Katie Sanderson',reviewed_at=now() where canonical_word_id=$7 and row_status='active'", [batchId, word.trueMorphology.humanApprovedText, word.trueMorphology.transformationNotes, JSON.stringify({ in_im_il_ir_correction: source(correctionSha256, word), true_morphology_review_state: "human_approved", pronunciation: word.pronunciation, complexity_preview: word.complexityPreview }), "Dynamic Prefix v2 IN/IM/IL/IR reviewed staging correction", "Human-approved true morphology; MorphoLex retained only as historical evidence.", existing.canonical_word_id]);
      if (metadata.rowCount !== 1) fail(`${word.word}: metadata correction write failed.`);
    }
    const profileUpdate = await client.query("update canonical_teaching_dictionary_prefix_profiles set import_batch_id=$1,meaning_bins=$2::jsonb,prefix_choices=$3::jsonb,reflection_prompt_text=$4,source_metadata=coalesce(source_metadata,'{}'::jsonb) || $5::jsonb,source_name=$6,source_use_note=$7,confidence='high',production_enabled=false,review_status='approved_for_first_exposure',reviewed_by='Katie Sanderson',reviewed_at=now() where id=$8", [batchId, JSON.stringify(correction.profile.meaningBins), JSON.stringify(correction.profile.prefixChoices.map((text) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" }))), correction.profile.reflection, JSON.stringify({ in_im_il_ir_correction: source(correctionSha256) }), "Dynamic Prefix v2 IN/IM/IL/IR reviewed staging correction", "Neutral form-sort labels; discovery supplies the meaning contrast.", profileId]);
    if (profileUpdate.rowCount !== 1) fail("Profile presentation correction write failed.");
    const verify = await client.query("select w.normalised_word,w.frequency_band,w.age_band,w.complexity_band,md.morphemes,md.morphology_notes,ds.dictation_sentence,ds.audio_text,ds.dictation_target_token_index,m.teaching_split_parts,m.prefix_variant,p.production_enabled,p.meaning_bins from canonical_teaching_dictionary_prefix_profiles p join canonical_teaching_dictionary_prefix_members m on m.prefix_profile_id=p.id join canonical_teaching_dictionary_words w on w.id=m.canonical_word_id join canonical_teaching_dictionary_word_metadata md on md.canonical_word_id=w.id and md.row_status='active' and md.review_status='approved_for_first_exposure' join canonical_teaching_dictionary_dictation_sentences ds on ds.canonical_word_id=w.id and ds.row_status='active' and ds.review_status='approved_for_first_exposure' where p.id=$1", [profileId]);
    if (verify.rowCount !== 7 || verify.rows.some((row) => row.production_enabled)) fail("Post-correction profile verification failed.");
    for (const word of correction.words) {
      const row = verify.rows.find((candidate) => candidate.normalised_word === word.word);
      const prefix = row?.teaching_split_parts?.filter((part: any) => part.kind === "prefix") ?? [];
      if (!row || row.frequency_band !== word.canonical.frequencyBand || row.age_band !== word.canonical.ageBand || row.complexity_band !== word.canonical.complexityBand || row.morphemes !== word.trueMorphology.humanApprovedText || row.morphology_notes !== word.trueMorphology.transformationNotes || row.dictation_sentence !== word.dictation.sentence || row.audio_text !== word.dictation.audioText || tokenAt(row.dictation_sentence, row.dictation_target_token_index) !== word.word || prefix.length !== 1 || prefix[0].displayRange?.end <= 0 || prefix[0].displayRange?.end >= word.word.length || row.teaching_split_parts.map((part: any) => part.surfaceText).join("") !== word.word || row.prefix_variant !== prefix[0].surfaceText) fail(`${word.word}: post-correction invariant failed.`);
    }
    await client.query("commit");
    console.log(JSON.stringify({ status: "applied_and_verified", batchId, correctionSha256, updated: { canonicalWords: 4, metadata: 4, profile: 1, members: 0 }, productionEnabled: false, prohibitedWrites: 0 }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}

async function main() {
  const { correction, correctionSha256, blockers } = await load();
  const manifest = { packagePath: PACKAGE_PATH, correctionSha256, profileKey: PROFILE_KEY, wordCount: correction.words.length, retainedCanonicalCorrections: correction.words.filter((word) => word.retainedCanonical).length, blockers };
  if (process.argv.includes("--validate")) { console.log(JSON.stringify(manifest, null, 2)); if (blockers.length) process.exitCode = 1; return; }
  if (!process.argv.includes("--apply")) fail("Use --validate or --apply.");
  if (blockers.length) fail(blockers.join("; "));
  if (arg("--environment") !== "staging") fail("Staging only.");
  if (arg("--confirm-package-sha256") !== correctionSha256) fail("Exact correction package SHA-256 is required.");
  const databaseUrl = arg("--database-url"); if (!databaseUrl) fail("--database-url is required.");
  await apply(correction, correctionSha256, databaseUrl);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
