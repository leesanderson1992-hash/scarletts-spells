#!/usr/bin/env node
/* Build the immutable Teaching Dictionary package approved for the Base+Prefix
 * and Base+Suffix family-v2 release.  It creates no database rows. */
import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_PACKAGE_SCHEMA, CANONICAL_PACKAGE_TYPE, IMPORTER_VERSION, REQUIRED_MIGRATION_VERSIONS, canonicalJson, packageSha256, type ReleaseManifestFingerprint } from "./teaching-dictionary-release-contract";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_ID = "2026-08-11-base-word-prefix-suffix-canonical-v1";
const RELEASE_DIR = resolve(ROOT, "docs/implementation/seed-data/teaching-dictionary/releases", RELEASE_ID);
const REVIEWED_AT = "2026-08-11T00:00:00.000Z";
const SOURCE_SHA256 = "2af66d22ee827b9e8487475542037b43acbd8fb9468a4abc26d9b833d5f4e69a";
const WORKBOOK = "/Users/katiesanderson/Downloads/base-word-prefix-suffix-readiness-audit-resolved (1).xlsx";
const SOURCE_NOTE = "Human-approved Base+Prefix/Base+Suffix workbook projection; Katie Sanderson, 2026-08-11; workbook SHA-256 " + SOURCE_SHA256 + ".";

type Word = { word: string; syllables: number; ipa: string; stress: string; schwa: boolean; wordSum: string; sentence: string; age: string; complexity: string };
const WORDS: readonly Word[] = [
  { word: "colour", syllables: 2, ipa: "/ˈkʌlə/", stress: "first", schwa: true, wordSum: "colour", sentence: "Blue is my favourite colour.", age: "middle_primary", complexity: "medium" },
  { word: "colourful", syllables: 3, ipa: "/ˈkʌləfəl/", stress: "first", schwa: true, wordSum: "colour + ful → colourful", sentence: "The market was full of colourful flags.", age: "middle_primary", complexity: "medium" },
  { word: "colourless", syllables: 3, ipa: "/ˈkʌlələs/", stress: "first", schwa: true, wordSum: "colour + less → colourless", sentence: "The liquid was clear and colourless.", age: "upper_primary", complexity: "medium" },
  { word: "immigrant", syllables: 3, ipa: "/ˈɪmɪɡrənt/", stress: "first", schwa: true, wordSum: "im + migrant → immigrant", sentence: "The immigrant started a new life in the city.", age: "upper_primary", complexity: "high" },
  { word: "lock", syllables: 1, ipa: "/lɒk/", stress: "single", schwa: false, wordSum: "lock", sentence: "Please lock the door before we leave.", age: "early_primary", complexity: "low" },
  { word: "locking", syllables: 2, ipa: "/ˈlɒkɪŋ/", stress: "first", schwa: false, wordSum: "lock + ing → locking", sentence: "She is locking the gate now.", age: "middle_primary", complexity: "medium" },
  { word: "migrant", syllables: 2, ipa: "/ˈmaɪɡrənt/", stress: "first", schwa: true, wordSum: "migrant", sentence: "The migrant travelled to find a new home.", age: "upper_primary", complexity: "high" },
  { word: "misplace", syllables: 2, ipa: "/mɪsˈpleɪs/", stress: "second", schwa: false, wordSum: "mis + place → misplace", sentence: "I sometimes misplace my pencil case.", age: "middle_primary", complexity: "medium" },
  { word: "painter", syllables: 2, ipa: "/ˈpeɪntə/", stress: "first", schwa: true, wordSum: "paint + er → painter", sentence: "The painter carefully covered the wall with blue paint.", age: "middle_primary", complexity: "medium" },
  { word: "painting", syllables: 2, ipa: "/ˈpeɪntɪŋ/", stress: "first", schwa: false, wordSum: "paint + ing → painting", sentence: "She is painting a picture of the sea.", age: "middle_primary", complexity: "medium" },
  { word: "replace", syllables: 2, ipa: "/rɪˈpleɪs/", stress: "second", schwa: false, wordSum: "re + place → replace", sentence: "Please replace the book on the shelf.", age: "middle_primary", complexity: "medium" },
  { word: "sweetly", syllables: 2, ipa: "/ˈswiːtli/", stress: "first", schwa: false, wordSum: "sweet + ly → sweetly", sentence: "The child smiled sweetly at her grandmother.", age: "middle_primary", complexity: "medium" },
  { word: "sweetness", syllables: 2, ipa: "/ˈswiːtnəs/", stress: "first", schwa: true, wordSum: "sweet + ness → sweetness", sentence: "The sweetness of the ripe strawberry surprised me.", age: "upper_primary", complexity: "medium" },
  { word: "untie", syllables: 2, ipa: "/ʌnˈtaɪ/", stress: "second", schwa: true, wordSum: "un + tie → untie", sentence: "Please untie the knot before you pull the rope.", age: "middle_primary", complexity: "medium" },
  { word: "view", syllables: 1, ipa: "/vjuː/", stress: "single", schwa: false, wordSum: "view", sentence: "We stopped to view the painting.", age: "middle_primary", complexity: "medium" },
  { word: "wind", syllables: 1, ipa: "/wɪnd/", stress: "single", schwa: false, wordSum: "wind", sentence: "The wind shook the branches.", age: "early_primary", complexity: "low" },
  { word: "windier", syllables: 3, ipa: "/ˈwɪndiə/", stress: "first", schwa: true, wordSum: "wind + ier → windier", sentence: "It became windier as we reached the coast.", age: "middle_primary", complexity: "medium" },
  { word: "windy", syllables: 2, ipa: "/ˈwɪndi/", stress: "first", schwa: false, wordSum: "wind + y → windy", sentence: "It was too windy to fly the kite.", age: "early_primary", complexity: "low" },
];

function wordKey(word: string) { return `${word.replace(/'/g, "_")}_en_gb`; }
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function csv(rows: readonly Record<string, string>[], headers: readonly string[]) { const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; return `${headers.join(",")}\n${rows.map(r => headers.map(h => esc(r[h] ?? "")).join(",")).join("\n")}\n`; }
function targetIndex(sentence: string, word: string) { const tokens = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? []; const i = tokens.findIndex(t => t.toLowerCase() === word.toLowerCase()); if (i < 0 || tokens.filter(t => t.toLowerCase() === word.toLowerCase()).length !== 1) throw new Error(`Dictation target is not exact for ${word}`); return String(i); }
function parts(word: Word) { const raw = word.wordSum.split("→")[0].trim().split("+").map(v => v.trim()); let offset = 0; return raw.map((sourceText, index) => { const surfaceText = sourceText; const start = offset; offset += surfaceText.length; return { id: `part_${index + 1}`, kind: index === 0 && !["mis", "pre", "re", "un", "im"].includes(sourceText) ? "base" : (["mis", "pre", "re", "un", "im"].includes(sourceText) ? "prefix" : "suffix"), morphemeKey: null, sourceText, surfaceText, gloss: "", displayRange: { start, end: offset } }; }); }

async function main() {
  const pkg = resolve(RELEASE_DIR, "package"); await mkdir(pkg, { recursive: true }); await mkdir(resolve(RELEASE_DIR, "receipts"), { recursive: true });
  if (sha(await (await import("node:fs/promises")).readFile(WORKBOOK)) !== SOURCE_SHA256) throw new Error("Approved workbook SHA-256 drifted.");
  await copyFile(WORKBOOK, resolve(RELEASE_DIR, "approved-workbook.xlsx"));
  const source = { source_key: "base_word_prefix_suffix_human_approval_2026_08_11", source_category: "internal_authored", source_name: "Katie Sanderson approved Base Word workbook", source_url: "local:base-word-prefix-suffix-readiness-audit-resolved (1).xlsx", source_licence: "internal/project-authored", source_use_note: SOURCE_NOTE, importability_status: "importable", legal_review_status: "not_required" };
  const common = { source_category: source.source_category, source_name: source.source_name, source_url: source.source_url, source_licence: source.source_licence, source_use_note: source.source_use_note, confidence: "high", review_status: "approved_for_first_exposure" };
  const files: Record<string, string> = {};
  files["canonical_words.csv"] = csv(WORDS.map(w => ({ word_key: wordKey(w.word), normalised_word: w.word, display_word: w.word, dialect_code: "en-GB", frequency_band: "medium", age_band: w.age, complexity_band: w.complexity, ...common, row_status: "active" })), ["word_key","normalised_word","display_word","dialect_code","frequency_band","age_band","complexity_band","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","row_status"]);
  files["canonical_word_metadata.csv"] = csv(WORDS.map(w => ({ word_key: wordKey(w.word), syllables: String(w.syllables), phoneme_hint: w.ipa, grapheme_notes: "Approved Base Word family release pronunciation metadata.", stress_pattern: w.stress, has_schwa: w.schwa ? "TRUE" : "FALSE", morphemes: w.wordSum, morphology_notes: "See the reviewed Base Word family authority for the lesson morphology projection.", irregularity_notes: "", ...common })), ["word_key","syllables","phoneme_hint","grapheme_notes","stress_pattern","has_schwa","morphemes","morphology_notes","irregularity_notes","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status"]);
  files["canonical_word_morphology.csv"] = csv(WORDS.map(w => ({ word_key: wordKey(w.word), raw_morpholex_segmentation: "", raw_morpholex_pos: "", morphology_parts: JSON.stringify(parts(w)), feature_keys: "[]", morphology_joins: "[]", transformation_notes: "", word_sum: w.wordSum, analysis_status: "approved", ...common, reviewed_by: "Katie Sanderson", reviewed_at: REVIEWED_AT, review_notes: "Approved Base+Prefix/Base+Suffix workbook projection." })), ["word_key","raw_morpholex_segmentation","raw_morpholex_pos","morphology_parts","feature_keys","morphology_joins","transformation_notes","word_sum","analysis_status","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","reviewed_by","reviewed_at","review_notes"]);
  files["dictation_sentences.csv"] = csv(WORDS.map(w => ({ word_key: wordKey(w.word), display_word: w.word, age_band: w.age, complexity_band: w.complexity, dictation_sentence: w.sentence, dictation_target_token_index: targetIndex(w.sentence, w.word), audio_text: w.sentence, ...common, reviewed_by: "Katie Sanderson", reviewed_at: REVIEWED_AT, review_notes: "Approved Base+Prefix/Base+Suffix workbook projection." })), ["word_key","display_word","age_band","complexity_band","dictation_sentence","dictation_target_token_index","audio_text","source_category","source_name","source_url","source_licence","source_use_note","confidence","review_status","reviewed_by","reviewed_at","review_notes"]);
  files["teaching_content_sources.csv"] = csv([source], ["source_key","source_category","source_name","source_url","source_licence","source_use_note","importability_status","legal_review_status"]);
  for (const [name, content] of Object.entries(files)) await writeFile(resolve(pkg, name), content);
  const fileSha256 = Object.fromEntries(Object.entries(files).map(([name, content]) => [name, sha(content)]));
  const fingerprint: ReleaseManifestFingerprint = { schemaVersion: CANONICAL_PACKAGE_SCHEMA, releaseId: RELEASE_ID, packageType: CANONICAL_PACKAGE_TYPE, packageSchemaVersion: "v2", workbookSha256: SOURCE_SHA256, sourceCommit: null, requiredMigrationVersions: [...REQUIRED_MIGRATION_VERSIONS], fileSha256, rowCounts: { sources: 1, words: WORDS.length, metadata: WORDS.length, morphology: WORDS.length, dictations: WORDS.length, repairs: 0, deferredRepairIntents: 0 }, reviewerSummary: { reviewers: ["Katie Sanderson"], reviewedDates: [REVIEWED_AT] }, sourceApprovalSummary: { importable: 1, legalPassedOrNotRequired: 1 }, expectedTargetTables: ["canonical_teaching_dictionary_sources","canonical_teaching_dictionary_words","canonical_teaching_dictionary_word_metadata","canonical_teaching_dictionary_word_morphology","canonical_teaching_dictionary_dictation_sentences"], prohibitedTableFamilies: ["learner","assignment","evidence","proficiency","reward","word_treasure"], deferredRepairIntentFile: null, deferredRepairIntentsSha256: null };
  await writeFile(resolve(pkg, "release-manifest.json"), `${JSON.stringify({ ...fingerprint, packageSha256: packageSha256(fingerprint) }, null, 2)}\n`);
  await writeFile(resolve(RELEASE_DIR, "README.md"), `# Base+Prefix and Base+Suffix Teaching Dictionary release\n\nImmutable package sourced from the Katie Sanderson-approved workbook SHA-256 \`${SOURCE_SHA256}\`. It adds only the 18 canonical words and dictations absent from Production at release planning.\n`);
  console.log(JSON.stringify({ releaseId: RELEASE_ID, words: WORDS.length, packageSha256: packageSha256(fingerprint), sourceProjectionSha256: sha(canonicalJson(WORDS)) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
