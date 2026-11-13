import { ING_RULE_FOR_SKILL, type IngMicroSkill } from "@/lib/adle/ing/contracts";
import ExcelJS from "exceljs";
import { csvRecords } from "./csv";
import { MULTI_SENSE_CSV_COLUMNS, renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from "./multi-sense-csv";

const sheetName = "Words to review";
const headerRow = 3;
const csvColumns = MULTI_SENSE_CSV_COLUMNS.filter(key => key !== "requested_micro_skills");
const priority = ["display_word", "definition", "part_of_speech", "family_key", "dictation_sentence"];
const keys = [...priority.slice(0, 3), "use_in_lesson", "needs_review", ...priority.slice(3),
  ...csvColumns.filter(key => !priority.includes(key))];
const hidden = new Set(["canonical_word_id", "source_sense_reviewed_at", "sense_id", "pronunciation_id"]);
const label = (key: string) => ({
  display_word: "Word", definition: "Meaning", family_key: "Word family",
  use_in_lesson: "Use in lesson", needs_review: "Needs review", ipa: "IPA",
}[key] ?? key.replace(/^part_(\d+)_/, "Part $1 ").replaceAll("_", " ").replace(/^./, char => char.toUpperCase()));

export async function buildReviewWorkbook(input: { skill: string; title: string; bundles: MultiSenseCsvBundle[];
  notes: ReadonlyMap<string, string>; families: ReadonlyMap<string, string[]> }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", xSplit: 1, ySplit: headerRow }] });
  sheet.columns = keys.map(key => ({ key, width: key === "definition" || key === "needs_review" ? 43
    : key === "family_key" || key === "dictation_sentence" ? 36 : 23, hidden: hidden.has(key) }));
  sheet.getCell("A1").value = input.title;
  sheet.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF0F172A" } };
  sheet.getCell("A2").value = input.skill;
  sheet.getRow(2).hidden = true;
  sheet.getRow(headerRow).values = keys.map(label);
  sheet.getRow(headerRow).height = 28;
  sheet.getRow(headerRow).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  });
  const familyOptions = workbook.addWorksheet("Family options", { state: "veryHidden" });
  const [headers, ...rows] = csvRecords(renderMultiSenseCsvBundles(input.bundles));
  for (const values of rows) {
    const entry = Object.fromEntries(headers.map((key, i) => [key, (values[i] ?? "").replace(/^'(?=[=+@\-\t\r])/u, "")]));
    const row = sheet.addRow({ ...entry, use_in_lesson: "Review", needs_review: input.notes.get(entry.canonical_word_id) ?? "" });
    row.height = 32;
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell("use_in_lesson").dataValidation = { type: "list", allowBlank: false, formulae: ['"Review,Yes,No"'],
      showErrorMessage: true, error: "Choose Review, Yes or No." };
    const familyChoices = input.families.get(entry.part_1_underlying_form) ?? [];
    const options = [...new Set([...familyChoices, entry.family_key, "Needs family review"].filter(Boolean))];
    const start = familyOptions.rowCount + 1;
    for (const family of options) familyOptions.addRow([family]);
    const rangeName = `FamilyChoices${row.number}`;
    workbook.definedNames.add(`'Family options'!$A$${start}:$A$${familyOptions.rowCount}`, rangeName);
    row.getCell("family_key").dataValidation = { type: "list", allowBlank: true, formulae: [rangeName] };
    row.getCell("part_of_speech").dataValidation = { type: "list", allowBlank: true,
      formulae: ['"verb,noun,adjective,adverb,pronoun,preposition,conjunction,determiner,interjection,root"'] };
    for (const key of ["use_in_lesson", "family_key", "definition", "part_of_speech", "dictation_sentence"]) {
      if (key !== "use_in_lesson" && entry[key]) continue;
      row.getCell(key).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDEDF7" } };
    }
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: keys.length } };
  const rule = ING_RULE_FOR_SKILL[input.skill as IngMicroSkill];
  const wordPartsExample = rule === "ie_to_y" ? "For tying, enter tie as the underlying form and ty as the visible letters."
    : rule === "double_final_consonant" ? "For hopping, enter hop as the underlying form and hopp as the visible letters."
      : rule === "regular" ? "For walking, enter walk as both forms."
        : "For caring, enter care as the underlying form and car as the visible letters.";
  const spellingChangeExample = rule === "ie_to_y" ? "For tying, change the final ie to y before adding -ing."
    : rule === "double_final_consonant"
      ? "For beginning, the final syllable of begin has primary stress. Enter unstressed-primary-unstressed for beginning."
      : rule === "regular" ? "For walking, the base walk stays the same."
        : "For caring, drop the final e before adding -ing.";
  const guide = workbook.addWorksheet("Field guide");
  guide.columns = [{ width: 27 }, { width: 104 }];
  guide.addRows([
    ["Field", "How to fill it in"],
    ["Use in lesson", "Choose Yes on the intended meaning. Keep all existing meaning rows. Use Review if you still need to check that meaning."],
    ["Word family", "Choose the approved family that matches the meaning. Choose Needs family review if the right family is missing."],
    ["Meaning and pronunciation", "Confirm the definition, part of speech, IPA, syllable count and stress. Use the same pronunciation ID for identical pronunciations."],
    ["Word parts", `Keep the full base and its visible letters in separate fields. ${wordPartsExample} Use none for a join with no space.`],
    ["Spelling change", `If the forms differ, record the change and explanation. ${spellingChangeExample}`],
    ["Family relationship", "Selecting a family for a single base links that base. For words with multiple bases, specify the component part ID."],
    ["Dictation", "Use the word once. Count from zero for the target position. In She is caring for a sick bird, caring is position 2."],
    ["Existing facts", "Legacy lesson facts are suggestions for review. Keep the hidden IDs and source revision supplied in the workbook."],
  ]);
  guide.getRow(1).font = { bold: true, color: { argb: "FFA7135A" } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
