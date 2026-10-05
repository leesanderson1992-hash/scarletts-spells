#!/usr/bin/env node
/** Read-only reconciliation of the approved spellings against both canonical dictionaries. */
import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [familiesPath, productionCsv, stagingCsv, outputPath] = process.argv.slice(2);
if (![familiesPath, productionCsv, stagingCsv, outputPath].every(Boolean)) {
  throw new Error("Usage: node build-adle-comparative-dictionary-review.mjs <candidate-audit.json> <production-inventory.csv> <staging-inventory.csv> <output.xlsx>");
}
const candidate = JSON.parse(await fs.readFile(familiesPath, "utf8"));
if (!Array.isArray(candidate.families) || candidate.families.length !== 24) throw new Error("expected_24_approved_form_families");
async function inventory(file) {
  const book = await Workbook.fromCSV(await fs.readFile(file, "utf8"), { sheetName: "Inventory" });
  const [header, ...rows] = book.worksheets.getItemAt(0).getUsedRange().values;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const name of ["word", "canonical_word_id", "word_key", "row_status", "review_status", "frequency_band", "age_band", "complexity_band", "syllables", "phoneme_hint", "stress_pattern", "has_schwa", "morphemes", "dictation_sentence", "audio_text"]) {
    if (!(name in index)) throw new Error(`inventory_missing_column:${name}`);
  }
  const entries = rows.map(row => Object.fromEntries(header.map((name, i) => [name, row[i] === "null" ? "" : (row[i] ?? "")])));
  if (entries.length !== 72 || new Set(entries.map(row => row.word)).size !== 72) throw new Error("inventory_must_contain_72_unique_forms");
  return new Map(entries.map(row => [row.word, row]));
}
const production = await inventory(productionCsv);
const staging = await inventory(stagingCsv);
const words = candidate.families.flatMap(family => family.words.map((word, degree) => ({
  microSkill: family.microSkillKey, base: family.words[0], degree: ["base", "comparative", "superlative"][degree], word,
})));
if (words.length !== 72 || new Set(words.map(x => x.word)).size !== 72) throw new Error("candidate_forms_not_unique");
const missing = [];
const reconciliation = words.map(entry => {
  const p = production.get(entry.word), s = staging.get(entry.word);
  if (!p || !s) throw new Error(`inventory_missing_form:${entry.word}`);
  const exists = Boolean(p.canonical_word_id);
  if (exists !== Boolean(s.canonical_word_id) || (exists && p.canonical_word_id !== s.canonical_word_id)) throw new Error(`environment_identity_mismatch:${entry.word}`);
  if (exists && (p.row_status !== "active" || s.row_status !== "active" || p.review_status !== "approved_for_first_exposure" || s.review_status !== "approved_for_first_exposure")) throw new Error(`existing_word_not_approved:${entry.word}`);
  if (exists && ["word_key", "frequency_band", "age_band", "complexity_band", "syllables", "phoneme_hint", "stress_pattern", "has_schwa", "morphemes", "dictation_sentence", "audio_text"].some(field => !p[field])) throw new Error(`existing_word_fact_missing:${entry.word}`);
  for (const field of ["word_key", "frequency_band", "age_band", "complexity_band", "syllables", "phoneme_hint", "stress_pattern", "has_schwa", "morphemes", "dictation_sentence", "audio_text"]) {
    if (p[field] !== s[field]) throw new Error(`environment_fact_mismatch:${entry.word}:${field}`);
  }
  if (!exists) missing.push(entry);
  return [entry.microSkill, entry.base, entry.degree, entry.word, "approved spelling", exists ? "reuse existing ID" : "new canonical word", p.canonical_word_id, s.canonical_word_id];
});
if (missing.length !== 25) throw new Error(`expected_25_missing_forms_found_${missing.length}`);

const workbook = Workbook.create();
const overview = workbook.worksheets.add("Release scope");
overview.showGridLines = false;
overview.getRange("A1:B7").values = [
  ["Comparative and superlative dictionary scope", ""],
  ["Approved spelling families", 24],
  ["Approved forms", 72],
  ["Existing approved canonical words", 47],
  ["New canonical words requiring factual review", 25],
  ["Form approval", "Owner-approved spellings only"],
  ["Publication", "Blocked until new-word facts and family content are reviewed"],
];
overview.getRange("A1:B1").format.font = { name: "Arial", size: 14, bold: true, color: "#102A43" };
overview.getRange("A2:B7").format.font = { name: "Arial", size: 10, color: "#102A43" };
overview.getRange("A1:A7").format.columnWidth = 42;
overview.getRange("B1:B7").format.columnWidth = 68;
overview.getRange("B5:B7").format.fill = "#FFF4CC";

const facts = workbook.worksheets.add("New word facts");
facts.showGridLines = false;
const factHeader = ["micro_skill", "base", "degree", "approved_word", "word_key_proposal", "frequency_band_review", "age_band_review", "complexity_band_review", "british_ipa_review", "syllables_review", "stress_pattern_review", "has_schwa_review", "structured_morphology_review", "child_word_sum_review", "dictation_sentence_review", "dictation_target_index_review", "audio_text_review", "source_and_licence_review", "named_reviewer", "review_status"];
facts.getRangeByIndexes(0, 0, missing.length + 1, factHeader.length).values = [factHeader, ...missing.map(x => [x.microSkill, x.base, x.degree, x.word, `${x.word}_en_gb`, ...Array(14).fill(""), "in_review"])];
facts.getRangeByIndexes(0, 0, 1, factHeader.length).format.fill = "#243B53";
facts.getRangeByIndexes(0, 0, 1, factHeader.length).format.font = { name: "Arial", size: 10, bold: true, color: "#FFFFFF" };
facts.getRangeByIndexes(0, 0, missing.length + 1, factHeader.length).format.columnWidth = 21;
facts.getRangeByIndexes(0, 0, missing.length + 1, 1).format.columnWidth = 53;
facts.getRangeByIndexes(1, 5, missing.length, 14).format.fill = "#FFF4CC";
facts.getRangeByIndexes(0, 0, missing.length + 1, factHeader.length).format.font = { name: "Arial", size: 10, color: "#102A43" };
facts.getRangeByIndexes(0, 0, 1, factHeader.length).format.font = { name: "Arial", size: 10, bold: true, color: "#FFFFFF" };
facts.freezePanes.freezeRows(1);
facts.freezePanes.freezeColumns(4);

const ids = workbook.worksheets.add("All forms and IDs");
ids.showGridLines = false;
ids.getRangeByIndexes(0, 0, reconciliation.length + 1, 8).values = [["micro_skill", "base", "degree", "approved_word", "form_review", "canonical_action", "production_id", "staging_id"], ...reconciliation];
ids.getRange("A1:H1").format.fill = "#243B53";
ids.getRange("A1:H1").format.font = { name: "Arial", size: 10, bold: true, color: "#FFFFFF" };
ids.getRange("A1:H73").format.columnWidth = 23;
ids.getRange("A1:A73").format.columnWidth = 53;
ids.getRange("G1:H73").format.columnWidth = 38;
ids.freezePanes.freezeRows(1);
ids.freezePanes.freezeColumns(4);
workbook.recalculate();
for (const [name, range] of [["Release scope", "A1:B7"], ["New word facts", "A1:F5"], ["All forms and IDs", "A1:H5"]]) {
  const result = await workbook.inspect({ kind: "table", range: `${name}!${range}`, include: "values,formulas", tableMaxRows: 8, tableMaxCols: 8 });
  console.log(result.ndjson);
}
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "error scan" });
console.log(errors.ndjson);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
for (const name of ["Release scope", "New word facts", "All forms and IDs"]) {
  const preview = await workbook.render({ sheetName: name, range: name === "Release scope" ? "A1:B7" : "A1:H6", scale: 1, format: "png" });
  await fs.writeFile(path.join(path.dirname(outputPath), `${name.toLowerCase().replaceAll(" ", "-")}-preview.png`), new Uint8Array(await preview.arrayBuffer()));
}
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(outputPath);
console.log(JSON.stringify({ outputPath, families: candidate.families.length, forms: words.length, existing: 72 - missing.length, newWords: missing.map(x => x.word) }));
