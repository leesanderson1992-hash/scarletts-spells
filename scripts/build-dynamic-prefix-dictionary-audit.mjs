import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const source = path.join(root, "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv");
const intake = path.join(root, "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake");
const d4AnalysesPath = path.join(root, "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json");
const outputDir = path.join(root, "outputs/dynamic-prefix-dictionary-audit");
const profiles = [
  ["D4_MOR_PREFIXES_DIS_MIS", "dis-/mis-", ["disagree", "disappear", "dishonest", "dissatisfied", "misbehave", "mislead", "misspell"]],
  ["D4_MOR_PREFIXES_IN_IM_IL_IR", "in-/im-/il-/ir-", ["illegal", "impatient", "impossible", "incorrect", "invisible", "irregular", "irresponsible"]],
  ["D4_MOR_PREFIXES_RE_PRE", "re-/pre-", ["predict", "preheat", "preschool", "preview", "rebuild", "replay", "return"]],
  ["D4_MOR_PREFIXES_SUB_INTER_SUPER", "sub-/inter-/super-", ["interact", "international", "subheading", "submarine", "subway", "superhero", "supermarket"]],
];
// The D4 profile-review pack received overall approval. These are the
// approved dictation sentences for the Dynamic Prefix import, and v1 audio
// deliberately repeats the approved sentence verbatim.
const approvedProfileDictation = {
  disagree: "They disagree about the game.", disappear: "The rabbit can disappear behind the hedge.", dishonest: "It is dishonest to tell a lie.", dissatisfied: "She felt dissatisfied with the untidy work.", misbehave: "Do not misbehave in the library.", mislead: "The sign did not mean to mislead us.", misspell: "Check that you do not misspell the word.",
  illegal: "Parking there is illegal.", impatient: "He grew impatient in the long queue.", impossible: "It is impossible to be in two places at once.", incorrect: "The answer is incorrect.", invisible: "The tiny insect was almost invisible.", irregular: "The shape has an irregular edge.", irresponsible: "It is irresponsible to leave litter behind.",
  predict: "Can you predict tomorrow’s weather?", preheat: "Please preheat the oven first.", preschool: "Her brother goes to preschool.", preview: "We watched a preview of the film.", rebuild: "Workers will rebuild the wall.", replay: "Please replay that part of the song.", return: "Please return the book tomorrow.",
  interact: "The children interact during the game.", international: "The airport has international flights.", subheading: "Write a subheading for the next section.", submarine: "The submarine moved under the waves.", subway: "We took the subway across the city.", superhero: "The superhero saved the town.", supermarket: "We bought fruit at the supermarket.",
};

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const char = text[i]; const next = text[i + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { row.push(cell); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...data] = rows; return new Map(data.map((values) => [values[0], Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))]));
}
const [canonical, metadata, dictation, recommendations, ipaIntake, d4Data] = await Promise.all([
  ...["canonical_words.csv", "canonical_word_metadata.csv", "dictation_sentences.csv"].map(async (file) => parseCsv(await fs.readFile(path.join(source, file), "utf8"))),
  parseCsv(await fs.readFile(path.join(intake, "canonical_words_frequency_aoa_band_recommendations.csv"), "utf8")),
  parseCsv(await fs.readFile(path.join(intake, "british_ipa_metadata_intake_all_canonical_words.csv"), "utf8")),
  JSON.parse(await fs.readFile(d4AnalysesPath, "utf8")),
]);
const analyses = new Map((d4Data.wordAnalyses ?? []).map((analysis) => [analysis.displayWord, analysis]));
const rows = profiles.flatMap(([profile, family, words]) => words.map((word) => {
  const key = `${word}_en_gb`; const c = canonical.get(key); const m = metadata.get(key); const d = dictation.get(key);
  const missing = [];
  if (!c) missing.push("Canonical word, frequency/age/complexity bands");
  if (!m) missing.push("Pronunciation + existing dictionary metadata");
  if (!d) missing.push("Reviewed dictation sentence, target index and audio text");
  missing.push("Approved Dynamic Prefix profile/member record (morphology, prefix variant, child meaning, meaning bin, provenance)");
  return [profile, family, word, c ? "Present — approved" : "Missing", c?.frequency_band ?? "", c?.age_band ?? "", c?.complexity_band ?? "", m ? "Present — approved" : "Missing", m?.phoneme_hint ?? "", m?.morphemes ?? "", d ? "Present — approved" : "Missing", d?.dictation_sentence ?? "", d?.dictation_target_token_index ?? "", d?.audio_text ?? "", missing.join("; "), "Open"];
}));
const present = rows.filter((row) => row[3] !== "Missing").length;
const missing = rows.length - present;
const importRows = profiles.flatMap(([profile, family, words]) => words.map((word) => {
  const key = `${word}_en_gb`; const c = canonical.get(key); const d = dictation.get(key); const recommendation = recommendations.get(key); const ipa = ipaIntake.get(key); const analysis = analyses.get(word);
  const prefix = analysis?.parts?.find((part) => part.kind === "prefix");
  const remainder = analysis?.parts?.filter((part) => part.kind !== "prefix").map((part) => `${part.kind}:${part.surfaceText}`).join(" + ") ?? "";
  const approvedSentence = approvedProfileDictation[word];
  const targetTokenIndex = approvedSentence.replace(/[“”.,!?]/g, "").split(/\s+/).findIndex((token) => token.toLowerCase() === word);
  const sourceStatus = c ? "Existing snapshot row — retain" : "No prior Teaching Dictionary source row";
  const importStatus = c ? "Source-backed candidate — remaining review gates apply" : "Blocked — missing source-backed fields";
  return [profile, word, `${prefix?.surfaceText ?? ""} + ${remainder}`, prefix?.surfaceText ?? "", String(prefix?.displayRange?.end ?? ""), sourceStatus,
    recommendation?.recommended_frequency_band ?? "", recommendation ? "Prior frequency/AoA intake — candidate" : "No source row",
    recommendation?.recommended_age_band ?? "", recommendation?.recommended_age_number ?? "", ipa?.ipa_uk ?? "", ipa?.approval_safety ?? "No source row",
    approvedSentence, String(targetTokenIndex), approvedSentence,
    "Approved D4 profile review pack — audio text matches sentence", importStatus, "Open"];
}));

const workbook = Workbook.create();
const overview = workbook.worksheets.add("Overview");
const audit = workbook.worksheets.add("Word audit");
const importCandidates = workbook.worksheets.add("Import candidates");
overview.showGridLines = false; audit.showGridLines = false; importCandidates.showGridLines = false;
overview.getRange("A1:F1").merge(); overview.getRange("A1").values = [["Dynamic Prefix — Teaching Dictionary gap review"]];
overview.getRange("A3:B8").values = [
  ["Review source", "Local approved Teaching Dictionary snapshot: 2026-06-29 phase-5 source intake"],
  ["Scope", "28 approved Dynamic Prefix words across four profiles"],
  ["Complete existing dictionary rows", present],
  ["Words absent from snapshot", missing],
  ["Profile/member records", "Missing for all 28 — new review-gated Dynamic Prefix schema"],
  ["Important", "This audit does not query a live environment; no learning items or production assignments were created."],
];
overview.getRange("A10:F10").merge(); overview.getRange("A10").values = [["Review actions"]];
overview.getRange("A11:F14").values = [
  ["1", "Confirm rows marked Present may be retained unchanged; do not overwrite them."],
  ["2", "Review/import only the absent canonical, metadata and dictation fields."],
  ["3", "Approve Dynamic Prefix member fields for every word: morphology, prefix variant, child meaning, bin and provenance."],
  ["4", "Leave Status as Open until dictation/audio and banding metadata are reviewed."],
];
overview.getRange("A16:F16").merge(); overview.getRange("A16").values = [["Source-backed candidate tab"]];
overview.getRange("A17:F19").values = [
  ["Morphology", "Approved D4 analysis: ordered parts and prefix boundary are populated for all 28 words."],
  ["Bands / IPA", "Only values present in the previous Teaching Dictionary intake are copied as candidates; blank means no source row."],
  ["Audio", "Only sentence/audio pairs marked approved_for_first_exposure and identical are copied. All others remain blank and blocked."],
];
const headers = ["Micro-skill", "Prefix family", "Word", "Canonical row", "Frequency band", "Age band", "Complexity band", "Metadata", "IPA / phoneme hint", "Existing morphology note", "Dictation", "Existing sentence", "Target index", "Existing audio text", "Required work", "Review status"];
audit.getRange(`A1:P${rows.length + 1}`).values = [headers, ...rows];
const importHeaders = ["Micro-skill", "Word", "Approved morphology split", "Prefix", "Cleaver boundary", "Dictionary source status", "Candidate frequency band", "Band source", "Candidate age band", "Age", "UK IPA candidate", "IPA safety", "Approved sentence", "Target index", "Approved audio text", "Audio source status", "Import status", "Review status"];
importCandidates.getRange(`A1:R${importRows.length + 1}`).values = [importHeaders, ...importRows];
overview.getRange("A1:F1").format = { fill: "#1F4E78", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center", verticalAlignment: "center" };
overview.getRange("A10:F10").format = { fill: "#D9EAF7", font: { bold: true, color: "#1F1F1F" } };
overview.getRange("A16:F16").format = { fill: "#D9EAF7", font: { bold: true, color: "#1F1F1F" } };
overview.getRange("A3:A8").format = { fill: "#F2F2F2", font: { bold: true } };
overview.getRange("A11:A14").format = { fill: "#F2F2F2", font: { bold: true }, horizontalAlignment: "center" };
overview.getRange("A1:F14").format.wrapText = true; overview.getRange("A1:F14").format.borders = { preset: "outside", style: "thin", color: "#D9E2F3" };
overview.getRange("A16:F19").format.wrapText = true; overview.getRange("A16:F19").format.borders = { preset: "outside", style: "thin", color: "#D9E2F3" };
overview.getRange("A1").format.rowHeight = 30; overview.getRange("A3:B8").format.rowHeight = 28; overview.getRange("A11:F14").format.rowHeight = 30;
overview.getRange("A:A").format.columnWidth = 28; overview.getRange("B:B").format.columnWidth = 88; overview.getRange("C:F").format.columnWidth = 18;
audit.getRange("A1:P1").format = { fill: "#D9EAF7", font: { bold: true, color: "#1F1F1F" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
audit.getRange(`A1:P${rows.length + 1}`).format.borders = { preset: "insideHorizontal", style: "thin", color: "#E6E6E6" };
audit.getRange(`A2:P${rows.length + 1}`).format.wrapText = true;
audit.getRange(`A2:P${rows.length + 1}`).format.rowHeight = 42;
audit.freezePanes.freezeRows(1);
audit.getRange("A:A").format.columnWidth = 34; audit.getRange("B:B").format.columnWidth = 20; audit.getRange("C:C").format.columnWidth = 17; audit.getRange("D:D").format.columnWidth = 18; audit.getRange("E:G").format.columnWidth = 15; audit.getRange("H:H").format.columnWidth = 18; audit.getRange("I:I").format.columnWidth = 24; audit.getRange("J:J").format.columnWidth = 44; audit.getRange("K:K").format.columnWidth = 18; audit.getRange("L:L").format.columnWidth = 48; audit.getRange("M:M").format.columnWidth = 12; audit.getRange("N:N").format.columnWidth = 42; audit.getRange("O:O").format.columnWidth = 58; audit.getRange("P:P").format.columnWidth = 16;
audit.getRange(`D2:D${rows.length + 1}`).conditionalFormats.add("containsText", { text: "Missing", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
audit.getRange(`H2:H${rows.length + 1}`).conditionalFormats.add("containsText", { text: "Missing", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
audit.getRange(`K2:K${rows.length + 1}`).conditionalFormats.add("containsText", { text: "Missing", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
audit.getRange(`P2:P${rows.length + 1}`).dataValidation = { rule: { type: "list", values: ["Open", "Reviewed", "Ready for import", "Blocked"] } };
importCandidates.getRange("A1:R1").format = { fill: "#D9EAF7", font: { bold: true, color: "#1F1F1F" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
importCandidates.getRange(`A1:R${importRows.length + 1}`).format.borders = { preset: "insideHorizontal", style: "thin", color: "#E6E6E6" };
importCandidates.getRange(`A2:R${importRows.length + 1}`).format.wrapText = true;
importCandidates.getRange(`A2:R${importRows.length + 1}`).format.rowHeight = 42;
importCandidates.freezePanes.freezeRows(1);
for (const [column, width] of [["A",34],["B",16],["C",36],["D",12],["E",16],["F",30],["G",18],["H",30],["I",18],["J",10],["K",20],["L",30],["M",48],["N",12],["O",48],["P",38],["Q",44],["R",16]]) importCandidates.getRange(`${column}:${column}`).format.columnWidth = width;
importCandidates.getRange(`F2:F${importRows.length + 1}`).conditionalFormats.add("containsText", { text: "No prior", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
importCandidates.getRange(`P2:P${importRows.length + 1}`).conditionalFormats.add("containsText", { text: "No approved", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
importCandidates.getRange(`Q2:Q${importRows.length + 1}`).conditionalFormats.add("containsText", { text: "Blocked", format: { fill: "#FCE4D6", font: { color: "#9C0006", bold: true } } });
importCandidates.getRange(`R2:R${importRows.length + 1}`).dataValidation = { rule: { type: "list", values: ["Open", "Reviewed", "Ready for import", "Blocked"] } };
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: "Word audit", range: "A1:P29", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "word-audit-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "dynamic-prefix-teaching-dictionary-gap-review.xlsx"));
console.log(JSON.stringify({ output: path.join(outputDir, "dynamic-prefix-teaching-dictionary-gap-review.xlsx"), present, missing, importRows }));
