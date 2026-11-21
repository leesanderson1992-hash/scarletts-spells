import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildReviewWorkbook, readReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { parseMultiSenseCsv, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";
import { reviewedTransformation, suggestTransformation } from "../lib/teaching-dictionary-manager/transformations";

const skill = "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS";
const fixture: MultiSenseCsvBundle = {
  wordId: "", displayWord: "he'll", sourceSenseReviewedAt: "",
  senseSet: {
    pronunciations: [{ id: "standard", ipa: "/hiːl/", spokenSyllableCount: 1, stressPattern: "primary" }],
    senses: [{ id: "he-will", pronunciationId: "standard", partOfSpeech: "contraction", definition: "he will",
      dictationSentence: "He'll carry the bag.", dictationTargetTokenIndex: 0 }],
  },
  analyses: [{ senseId: "he-will", parts: [
    { id: "part_1", kind: "base", sourceText: "he", surfaceText: "he", gloss: "A boy or man already mentioned.", displayRange: { start: 0, end: 2 } },
    { id: "part_2", kind: "suffix", sourceText: "will", surfaceText: "'ll", gloss: "will", displayRange: { start: 2, end: 5 } },
  ], joins: [{ afterPartId: "part_1", beforePartId: "part_2", joinType: "none" }],
  transformations: [], wordSum: "he + will → he'll", familyKey: "", componentPartId: "", relationshipKind: "contraction", requestedSkillKeys: [] }],
};

async function main() {
  for (const [source, surface] of [["will", "'ll"], ["shall", "'ll"], ["would", "'d"], ["had", "'d"],
    ["is", "'s"], ["has", "'s"], ["us", "'s"], ["are", "'re"], ["have", "'ve"], ["am", "'m"], ["not", "n't"]]) {
    assert.equal(suggestTransformation(source, surface), "contraction");
    assert(reviewedTransformation({ type: "Contraction", sourcePartId: "part_2", sourceText: source, surfaceText: surface, explanation: "" }).explanation);
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await buildReviewWorkbook({ skill, title: "Contractions", bundles: [fixture], notes: new Map(), families: new Map() })).buffer);
  const sheet = book.getWorksheet("Words to review")!;
  const headers = sheet.getRow(3).values as string[];
  const cell = (row: number, name: string) => sheet.getRow(row).getCell(headers.indexOf(name));
  assert.equal(cell(4, "Part 2 visible letters").value, "'ll");
  assert.equal(cell(4, "Part 2 spelling change type").value, "Contraction");
  assert.match(cell(4, "Part 2 spelling change explanation").text, /will → 'll/);
  for (const row of [4, 5, 104]) {
    assert.equal(cell(row, "Part 2 visible letters").numFmt, "@");
    assert.match(String(cell(row, "Part 2 spelling change type").dataValidation.formulae), /Contraction/);
  }
  assert.match(book.getWorksheet("Field guide")!.getColumn(2).values.join(" "), /two apostrophes/);
  cell(4, "Use in lesson").value = "Yes";
  for (const [visible, type] of [["'ll", "Contraction"], [" 'll", "Contraction"], [" 'll ", ""], ["'ll", "Auto (from spelling)"]]) {
    cell(4, "Part 2 visible letters").value = visible;
    cell(4, "Part 2 spelling change type").value = type;
    cell(4, "Part 2 spelling change explanation").value = "";
    const uploaded = await readReviewWorkbook(Uint8Array.from(Buffer.from(await book.xlsx.writeBuffer())).buffer, skill);
    const [bundle] = parseMultiSenseCsv(uploaded.csv);
    assert.equal(bundle.analyses[0].parts[1].surfaceText, "'ll");
    assert.equal(bundle.analyses[0].transformations[0].type, "contraction");
    assert.equal(bundle.displayWord, "he'll");
  }
  cell(4, "Part 2 visible letters").value = "ll";
  cell(4, "Part 2 spelling change type").value = "Contraction";
  await assert.rejects(async () => {
    const uploaded = await readReviewWorkbook(Uint8Array.from(Buffer.from(await book.xlsx.writeBuffer())).buffer, skill);
    parseMultiSenseCsv(uploaded.csv);
  }, /does not change/);
  console.log("PASS: contraction dropdown, automatic explanations, literal apostrophe export, space-prefixed apostrophe upload, and missing-apostrophe rejection");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
