/** Guarded staging-only importer for the reviewed, immutable three-word un- package.
 * It deliberately imports dictionary records only: no learning items, word-to-
 * micro-skill bindings, assignments, flags, or route activation are possible.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Word = {
  wordKey: string; canonicalWord: string; frequencyBand: "low" | "medium" | "high"; ageBand: string; complexityBand: "low" | "medium" | "high";
  pronunciation: { ipa: string; cmu: string; syllables: number; stressPattern: string; hasSchwa: boolean };
  morphology: { prefix: string; base: string; suffix: string; parts: string[]; joins: Array<{ after: string; before: string; type: string }>; transformationNotes: string; meaning: string; d4WordBankRow: number };
  enrichment: { wordfreqZipf: number; wordfreqBand: string; bnc: { frequency: number; band: string } | null; aoaTestBased: number };
  dictation: { sentence: string; audioText: string }; fieldReviews: string[];
};
type Package = { packageKey: string; packageVersion: number; reviewedBy: string; reviewedAt: string; activation: Record<string, boolean>; sourceFiles: string[]; words: Word[] };
type Manifest = { packageKey: string; packageVersion: number; packageSha256: string; sourceHashes: Record<string, string>; calculatedTokenIndices: Array<{ wordKey: string; canonicalWord: string; targetTokenIndex: number; blockers: string[] }>; blockers: string[]; routeActivated: boolean; createsLearningItems: boolean; createsMicroSkillBindings: boolean };
type ExistingWord = { id: string; word_key: string; normalised_word: string; import_batch_id: string; source_metadata?: { package_sha256?: string } };
type BandVersion = { banding_version: string };
type VerifiedWord = { word_key: string };
const ROOT = resolve(import.meta.dirname, "..");
const STAGING_HOST = "jlhotktspjvffslvuyfz.supabase.co";
const STAGING_CONFIRM = "ADLE-CANONICAL-UN-STAGING-IMPORT-V1";
const REQUIRED_FIELDS = ["canonical_spelling", "morphology", "meaning", "frequency", "age", "complexity", "pronunciation", "dictation", "audio_text"];

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function tokenAt(sentence: string, index: number): string | null {
  const tokens = sentence.trim().split(/\s+/).map((token) => token.replace(/^\p{P}+/u, "").replace(/\p{P}+$/u, "").toLowerCase());
  return tokens[index] || null;
}
function fail(message: string): never { throw new Error(message); }
async function packageAndManifest(packagePath: string) {
  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as Package;
  const errors: string[] = [];
  if (pkg.packageKey !== "adle_canonical_un_prefix_2026_07_21" || pkg.words.length !== 3) errors.push("Expected the immutable three-word canonical un- package.");
  if (new Set(pkg.words.map((word) => word.wordKey)).size !== pkg.words.length) errors.push("Duplicate canonical word key.");
  if (pkg.activation.dynamicPrefixRouteEnabled || pkg.activation.createsLearningItems || pkg.activation.createsMicroSkillBindings) errors.push("Package attempts a prohibited runtime or binding activation.");
  const sourceHashes: Record<string, string> = {};
  for (const source of pkg.sourceFiles) {
    const path = resolve(ROOT, source);
    try { sourceHashes[source] = sha256(await readFile(path)); } catch { errors.push(`Missing required source file: ${source}`); }
  }
  const details = pkg.words.map((word) => {
    const reconstruction = word.morphology.parts.join("");
    if (reconstruction !== word.canonicalWord) errors.push(`${word.wordKey}: morphology does not reconstruct canonical word.`);
    if (word.morphology.prefix !== "un" || word.morphology.suffix !== "" || word.morphology.joins.length !== 1 || word.morphology.joins[0]?.type !== "none") errors.push(`${word.wordKey}: invalid approved prefix analysis or join.`);
    if (!word.morphology.meaning || !word.pronunciation.ipa || !word.pronunciation.cmu || !word.frequencyBand || !word.ageBand || !word.complexityBand) errors.push(`${word.wordKey}: missing required enrichment field.`);
    for (const field of REQUIRED_FIELDS) if (!word.fieldReviews.includes(field)) errors.push(`${word.wordKey}: missing approved field review ${field}.`);
    const tokens = word.dictation.sentence.trim().split(/\s+/);
    const targetIndex = tokens.findIndex((_, index) => tokenAt(word.dictation.sentence, index) === word.canonicalWord);
    if (targetIndex < 0 || tokenAt(word.dictation.sentence, targetIndex) !== word.canonicalWord || !word.dictation.audioText) errors.push(`${word.wordKey}: invalid dictation target or audio text.`);
    return { wordKey: word.wordKey, canonicalWord: word.canonicalWord, targetTokenIndex: targetIndex, blockers: [] as string[] };
  });
  const packageHash = sha256(stable(pkg));
  return { pkg, manifest: { packageKey: pkg.packageKey, packageVersion: pkg.packageVersion, packageSha256: packageHash, sourceHashes, calculatedTokenIndices: details, blockers: errors, routeActivated: false, createsLearningItems: false, createsMicroSkillBindings: false } };
}
function argv(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
async function rest<T>(url: string, key: string, table: string, method: "GET" | "POST", body?: unknown, query = ""): Promise<T> {
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}${query}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: method === "POST" ? "return=minimal" : "" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) fail(`${table} ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}
function sourceMetadata(pkg: Package, word: Word, packageHash: string) {
  return { package_key: pkg.packageKey, package_sha256: packageHash, field_reviews: Object.fromEntries(word.fieldReviews.map((field) => [field, { status: "approved_for_first_exposure", reviewer: pkg.reviewedBy, reviewed_at: pkg.reviewedAt }])), morphology: word.morphology, pronunciation: word.pronunciation, enrichment: word.enrichment, source_files: pkg.sourceFiles };
}
function banding(word: Word) {
  const lengthPoints = word.canonicalWord.length <= 4 ? 0 : word.canonicalWord.length <= 6 ? 1 : word.canonicalWord.length <= 8 ? 2 : 3;
  const syllablePoints = word.pronunciation.syllables === 1 ? 0 : word.pronunciation.syllables === 2 ? 1 : word.pronunciation.syllables === 3 ? 2 : 3;
  const morphologyDepth = word.morphology.parts.length;
  const morphologyPoints = morphologyDepth === 1 ? 0 : morphologyDepth === 2 ? 1 : 2;
  const irregularityPoints = 2; // approved "preserve base after prefix" pattern
  const structuralScore = syllablePoints + lengthPoints + irregularityPoints + morphologyPoints + (word.pronunciation.hasSchwa ? 1 : 0);
  return { syllable_points: syllablePoints, length_points: lengthPoints, irregularity_class: 1, irregularity_points: irregularityPoints, morphology_depth: morphologyDepth, morphology_points: morphologyPoints, has_schwa: word.pronunciation.hasSchwa, mismatch_flag: false, irregularity_note_source: "preserve base after prefix", structural_score: structuralScore, complexity_level: structuralScore <= 1 ? 1 : structuralScore <= 5 ? 2 : 3 };
}
async function apply(pkg: Package, manifest: Manifest, url: string, key: string) {
  const host = new URL(url).host;
  if (host !== STAGING_HOST) fail(`Refusing non-named staging host: ${host}`);
  const keys = pkg.words.map((word) => word.wordKey).join(",");
  const normalised = pkg.words.map((word) => word.canonicalWord).join(",");
  const existing = await rest<ExistingWord[]>(url, key, "canonical_teaching_dictionary_words", "GET", undefined, `?select=id,word_key,normalised_word,import_batch_id,source_metadata&normalised_word=in.(${normalised})&row_status=eq.active`);
  const resumable = existing.length === 3 && existing.every((row) => row.source_metadata?.package_sha256 === manifest.packageSha256) && new Set(existing.map((row) => row.import_batch_id)).size === 1;
  if (existing.length && !resumable) fail(`Refusing duplicate active canonical rows: ${existing.map((row) => `${row.word_key} (${row.normalised_word})`).join(", ")}`);
  const bandVersions = await rest<BandVersion[]>(url, key, "canonical_teaching_dictionary_banding_versions", "GET", undefined, "?select=banding_version&is_active=eq.true");
  if (bandVersions.length !== 1) fail("Expected exactly one active banding version.");
  const batchId = resumable ? existing[0].import_batch_id : randomUUID();
  if (!resumable) await rest(url, key, "canonical_teaching_dictionary_import_batches", "POST", { id: batchId, source_folder_path: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-21-prefix-un-canonical-import", source_folder_sha256: manifest.packageSha256, validator_version: "adle_canonical_un_prefix_package_v1", validation_summary: { errors: 0, package_sha256: manifest.packageSha256 }, row_counts: { words: 3, metadata: 3, dictation: 3, banding: 3 }, readiness_summary: { dictionary_only: true, route_activated: false }, import_mode: "admin_import", batch_status: "validated", source_metadata: manifest, imported_by: "ADLE guarded hosted package importer", imported_at: new Date().toISOString() });
  const ids = new Map(resumable ? existing.map((row) => [row.word_key, row.id]) : pkg.words.map((word) => [word.wordKey, randomUUID()]));
  const rows = pkg.words.map((word, index) => ({ id: ids.get(word.wordKey), import_batch_id: batchId, row_status: "active", source_sheet: "reviewed-package.json", source_row_number: index + 2, source_row_hash: sha256(stable(word)), source_metadata: sourceMetadata(pkg, word, manifest.packageSha256), word_key: word.wordKey, normalised_word: word.canonicalWord, display_word: word.canonicalWord, dialect_code: "en-GB", frequency_band: word.frequencyBand, age_band: word.ageBand, complexity_band: word.complexityBand, source_category: "internal_reviewed_seed", source_name: "ADLE canonical un- reviewed import package", source_url: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-21-prefix-un-canonical-import/reviewed-package.json", source_licence: "internal", source_use_note: "Human-reviewed package with linked D4 morphology and existing enrichment source evidence.", confidence: "high", review_status: "approved_for_first_exposure" }));
  if (!resumable) await rest(url, key, "canonical_teaching_dictionary_words", "POST", rows);
  const metadataRows = pkg.words.map((word, index) => ({ import_batch_id: batchId, canonical_word_id: ids.get(word.wordKey), row_status: "active", source_sheet: "reviewed-package.json", source_row_number: index + 2, source_row_hash: sha256(stable({ metadata: word })), source_metadata: sourceMetadata(pkg, word, manifest.packageSha256), syllables: String(word.pronunciation.syllables), phoneme_hint: word.pronunciation.ipa, grapheme_notes: "", stress_pattern: word.pronunciation.stressPattern, has_schwa: word.pronunciation.hasSchwa, morphemes: `${word.canonicalWord}: prefix:un + root:${word.morphology.base}`, morphology_notes: `${word.morphology.transformationNotes} D4 MOR Word Bank row ${word.morphology.d4WordBankRow}.`, irregularity_notes: "preserve base after prefix", source_category: "internal_reviewed_seed", source_name: "ADLE canonical un- reviewed import package", source_url: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-21-prefix-un-canonical-import/reviewed-package.json", source_licence: "internal", source_use_note: "Linked field-level provenance is retained in source_metadata.", confidence: "high", review_status: "approved_for_first_exposure", reviewed_by: pkg.reviewedBy, reviewed_at: pkg.reviewedAt }));
  await rest(url, key, "canonical_teaching_dictionary_word_metadata", "POST", metadataRows);
  const dictationRows = pkg.words.map((word, index) => ({ import_batch_id: batchId, canonical_word_id: ids.get(word.wordKey), row_status: "active", source_sheet: "reviewed-package.json", source_row_number: index + 2, source_row_hash: sha256(stable({ dictation: word.dictation })), source_metadata: sourceMetadata(pkg, word, manifest.packageSha256), dictation_sentence: word.dictation.sentence, dictation_target_token_index: manifest.calculatedTokenIndices[index].targetTokenIndex, audio_text: word.dictation.audioText, source_category: "internal_reviewed_seed", source_name: "Reviewed ADLE Morphology Teaching Dictionary workbook", source_url: "ADLE Morphology Teaching Dictionary — Prefix un-", source_licence: "internal", source_use_note: "Reviewed first-exposure dictation and audio text; token index calculated by guarded importer.", confidence: "high", review_status: "approved_for_first_exposure", reviewed_by: pkg.reviewedBy, reviewed_at: pkg.reviewedAt }));
  await rest(url, key, "canonical_teaching_dictionary_dictation_sentences", "POST", dictationRows);
  await rest(url, key, "canonical_teaching_dictionary_word_banding", "POST", pkg.words.map((word) => ({ canonical_word_id: ids.get(word.wordKey), banding_version: bandVersions[0].banding_version, import_batch_id: batchId, row_status: "active", ...banding(word) })));
  const verify = await rest<VerifiedWord[]>(url, key, "canonical_teaching_dictionary_words", "GET", undefined, `?select=word_key,review_status,row_status,canonical_teaching_dictionary_word_metadata!inner(review_status,row_status),canonical_teaching_dictionary_dictation_sentences!inner(review_status,row_status),canonical_teaching_dictionary_word_banding!inner(complexity_level,row_status)&word_key=in.(${keys})`);
  if (verify.length !== 3) fail("Post-import verification did not return all three canonical rows.");
  console.log(JSON.stringify({ status: "applied_and_verified", environment: "staging", host, batchId, packageSha256: manifest.packageSha256, words: verify.map((row) => row.word_key), routeActivated: false, learningItemsCreated: false, microSkillBindingsCreated: false }, null, 2));
}
async function main() {
  const packagePath = resolve(ROOT, argv("--package") || "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-21-prefix-un-canonical-import/reviewed-package.json");
  const { pkg, manifest } = await packageAndManifest(packagePath);
  if (process.argv.includes("--validate")) { console.log(JSON.stringify(manifest, null, 2)); if (manifest.blockers.length) process.exitCode = 1; return; }
  if (!process.argv.includes("--apply")) fail("Use --validate or explicit staging --apply.");
  if (manifest.blockers.length) fail(`Package blocked: ${manifest.blockers.join("; ")}`);
  if (argv("--confirm-package-sha256") !== manifest.packageSha256) fail("Refusing apply without the exact --confirm-package-sha256 from validation output.");
  if (argv("--environment") !== "staging") fail("Only --environment staging is permitted.");
  if (argv("--confirm-staging-import") !== STAGING_CONFIRM) fail("Refusing apply without the exact staging confirmation token.");
  const url = argv("--supabase-url"); const key = argv("--service-role-key");
  if (!url || !key) fail("--supabase-url and --service-role-key are required for apply.");
  await apply(pkg, manifest, url, key);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
