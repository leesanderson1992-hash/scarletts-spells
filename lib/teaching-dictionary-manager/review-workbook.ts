import { ING_RULE_FOR_SKILL, type IngMicroSkill, type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { csvRecords, FLAT_IMPORT_PART_LIMIT } from "./csv";
import type { WorkbookFamily } from "./workbook-family-resolution";
import { MULTI_SENSE_CSV_COLUMNS, renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from "./multi-sense-csv";

export type WorkbookFamilyTask = { row: number; word: string; meaning: string; base: string; sentence: string };
export type WorkbookFamilyDecision = { row: number; familyKey?: string; createSenseId?: string };

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
    const notes = [
      input.notes.get(entry.canonical_word_id),
      !entry.family_key ? "Choose the teaching family for this meaning." : "",
      !entry.ipa || !entry.spoken_syllable_count || !entry.stress_pattern
        ? "Check pronunciation, syllable count and stress." : "",
    ].filter(Boolean).join(" ");
    const row = sheet.addRow({ ...entry, use_in_lesson: "Review", needs_review: notes });
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
    ["Use in lesson", "Choose Yes on the intended meaning. Keep all existing meaning rows. Words with no Yes stay out of this upload."],
    ["Word family", "Choose the approved family that matches the meaning. Leave the family blank or choose Needs family review to resolve it after uploading."],
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

export async function buildLessonPoolWorkbook(title: string, words: readonly IngDictionaryWordV1[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Active lesson pool", { views: [{ state: "frozen", xSplit: 1, ySplit: 2 }] });
  sheet.getCell("A1").value = title;
  sheet.getCell("A1").font = { bold: true, size: 15 };
  const headers = ["Word", "Status", "Meaning taught", "Base", "Pronunciation (IPA)", "Dictation sentence", "Word ID", "Meaning ID"];
  sheet.getRow(2).values = headers;
  sheet.getRow(2).font = { bold: true };
  [22, 12, 45, 18, 22, 52, 40, 32].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  for (const word of [...words].sort((a, b) => a.word.localeCompare(b.word, "en-GB") || a.canonicalWordId.localeCompare(b.canonicalWordId))) {
    const row = sheet.addRow([word.word, "Active", word.meaning, word.base, word.pronunciationIpa ?? "",
      word.dictationSentence, word.canonicalWordId, word.senseId ?? ""]);
    row.alignment = { vertical: "middle", wrapText: true };
  }
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function readReviewWorkbook(file: ArrayBuffer, skill: string, options?: {
  targetRow?: number;
  decisions: WorkbookFamilyDecision[];
  resolve: (base: string, decision: WorkbookFamilyDecision) => Promise<WorkbookFamily | null>;
}) {
  let expanded = 0;
  unzipSync(new Uint8Array(file), { filter: entry => {
    expanded += entry.originalSize;
    if (expanded > 16_000_000) throw new Error("The workbook is too large when opened.");
    return false;
  } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet || sheet.getCell("A2").value !== skill || keys.some((key, i) => sheet.getCell(headerRow, i + 1).value !== label(key)))
    throw new Error("Use the review workbook for this micro-skill and keep its column headings.");
  if (sheet.rowCount > 2000 + headerRow) throw new Error("Upload at most 2,000 meaning rows.");
  const groups = new Map<string, Record<string, string>[]>();
  for (let index = headerRow + 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;
    const entry = Object.fromEntries(keys.map((key, column) => {
      const value = row.getCell(column + 1).value;
      if (value !== null && typeof value !== "string" && typeof value !== "number")
        throw new Error(`Workbook row ${index} must contain plain text or numbers.`);
      return [key, String(value ?? "").trim()];
    }));
    if (!["", "Review", "Yes", "No"].includes(entry.use_in_lesson))
      throw new Error(`Workbook row ${index}: choose Review, Yes or No under Use in lesson.`);
    entry.workbook_row = String(index);
    if (!entry.display_word) throw new Error(`Workbook row ${index} needs a word.`);
    const groupKey = entry.display_word.toLocaleLowerCase("en-GB");
    const group = groups.get(groupKey) ?? [];
    group.push(entry);
    groups.set(groupKey, group);
  }
  const pendingFamilies: WorkbookFamilyTask[] = [];
  const records: Record<string, string>[] = [];
  const decisions = new Map(options?.decisions.map(decision => [decision.row, decision]));
  const selected = [...groups.values()].filter(group => group.some(row => row.use_in_lesson === "Yes"
    && (!options?.targetRow || Number(row.workbook_row) === options.targetRow)));
  if (!selected.length) throw new Error("Choose Yes under Use in lesson for at least one meaning.");
  for (const group of selected) {
    const tasks: WorkbookFamilyTask[] = [];
    for (const row of group) {
      const rowNumber = Number(row.workbook_row);
      row.family_key = row.family_key.split(" | ").at(-1) ?? "";
      if (row.family_key === "Needs family review") row.family_key = "";
      if (row.use_in_lesson !== "Yes") continue;
      const bases = Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => index + 1)
        .filter(index => row[`part_${index}_kind`] === "base");
      const part = bases.length === 1 ? bases[0] : bases.find(index =>
        (row[`part_${index}_id`] || `part_${index}`) === row.component_part_id);
      const base = part ? row[`part_${part}_underlying_form`].toLocaleLowerCase("en-GB") : "";
      const decision = decisions.get(rowNumber) ?? (row.family_key ? { row: rowNumber, familyKey: row.family_key } : null);
      if (!decision || !base || !part) {
        tasks.push({ row: rowNumber, word: row.display_word, meaning: row.definition, base, sentence: row.dictation_sentence });
        continue;
      }
      const family = options ? await options.resolve(base, decision) : null;
      if (options && (!family || family.base !== base))
        throw new Error(`Row ${rowNumber}: choose an approved family with the base “${base}”.`);
      if (family) {
        row.family_key = family.key;
        row[`part_${part}_meaning`] ||= family.meaning;
      }
      row.component_part_id = row[`part_${part}_id`] || `part_${part}`;
      row.relationship_kind ||= "regular_inflection";
    }
    if (tasks.length) pendingFamilies.push(...tasks);
    else records.push(...group);
  }
  const csv = [MULTI_SENSE_CSV_COLUMNS, ...records.map(row => {
    if (!row.family_key) {
      row.component_part_id = "";
      row.relationship_kind = "";
    }
    return MULTI_SENSE_CSV_COLUMNS.map(key => key === "requested_micro_skills"
      ? row.use_in_lesson === "Yes" ? skill : "" : row[key] ?? "");
  })].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  return { csv, rowNumbers: records.map(row => Number(row.workbook_row)), pendingFamilies };
}
