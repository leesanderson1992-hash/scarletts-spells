import { CUT_SOURCES } from "./schwa-syllables";
import type { WorkbookPartPrefill } from "./review-workbook-part-prefill";
import { isSchwaWorkbookSkill, SCHWA_WORKBOOK_FIELDS, SCHWA_SYLLABLE_FIELDS, type SchwaWorkbookFacts } from "./weak-vowel-workbook";
import { isHomophoneReviewSkill } from "./homophone-review-contract";
import { isCompoundWorkbookSkill, type CompoundWorkbookFacts } from "./compound-workbook";
import { isComparativeReviewSkill } from "./lesson-candidate";
import { ING_RULE_FOR_SKILL, type IngMicroSkill, type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { ABLE_IBLE_SKILL, FUL_LESS_SKILL, isSuffixReviewSkill, type SuffixWorkbookFacts } from "./able-ible-workbook";
import { DICTIONARY_BANDS } from "./contracts";
import { UN_PREFIX_SKILL } from "./prefix-content";
import { isPrefixWorkbookSkill, NEGATIVE_PREFIX_SKILL, negativePrefixForBase, prefixWorkbookFieldLabel,
  prefixWorkbooks, prefixWorkbookForms, inPrefixMeaning, SUB_INTER_SUPER_PREFIX_SKILL } from "./prefix-workbook";
import ExcelJS from "exceljs";
import { AUTO_TRANSFORMATION, TRANSFORMATION_OPTIONS, resolveTransformationType, transformationExplanation } from "./transformations";
import { unzipSync } from "fflate";
import { csvRecords, FLAT_IMPORT_PART_LIMIT } from "./csv";
import type { WorkbookFamily } from "./workbook-family-resolution";
import { MULTI_SENSE_CSV_COLUMNS, renderMultiSenseCsvBundles, type MultiSenseCsvBundle } from "./multi-sense-csv";

export type WorkbookFamilyTask = { row: number; word: string; meaning: string; base: string; sentence: string;
  senseId?: string; componentPartId?: string; baseKind?: "free_base" | "bound_root"; baseMeaning?: string };
export type WorkbookFamilyDecision = { row: number; familyKey?: string; createSenseId?: string };

const sheetName = "Words to review";
const headerRow = 3;
const csvColumns = MULTI_SENSE_CSV_COLUMNS.filter(key => key !== "requested_micro_skills");
const priority = ["display_word", "definition", "part_of_speech", "family_key", "dictation_sentence"];
const reviewKeys = [...priority.slice(0, 3), "use_in_lesson", "needs_review", ...priority.slice(3),
  ...csvColumns.filter(key => !priority.includes(key))];
const suffixFields = ["age_band", "frequency_band", "complexity_band", "has_schwa"] as const;
const prefixMeaningKey = "prefix_meaning_group";
const partIndexes = Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => index + 1);
const workbookPrefixParts = (row: Record<string, string>, allowed: readonly string[]) => partIndexes.filter(index =>
  row[`part_${index}_kind`] === "prefix" && allowed.includes(row[`part_${index}_underlying_form`]?.toLowerCase()));
const workbookKeys = (skill: string) => isSchwaWorkbookSkill(skill) ? [...reviewKeys.slice(0, 3), "written_syllable_breakdown", ...reviewKeys.slice(3), ...SCHWA_WORKBOOK_FIELDS, "activity_cut_source"] : isCompoundWorkbookSkill(skill) ? [...reviewKeys, ...suffixFields, "component_to_whole_relationship"]
  : isSuffixReviewSkill(skill) ? [...reviewKeys, ...suffixFields]
  : isPrefixWorkbookSkill(skill) ? [...reviewKeys.slice(0, 4), prefixMeaningKey, ...reviewKeys.slice(4)] : reviewKeys;
const hidden = new Set(["canonical_word_id", "source_sense_reviewed_at", "sense_id", "pronunciation_id"]);
const label = (key: string) => ({
  written_syllable_breakdown: "Dictionary written syllable divisions", activity_cut_source: "Activity cut source", activity_syllables: "Alternative activity divisions (optional)", spoken_syllable_count: "Spoken syllable count",
  display_word: "Word", definition: "Meaning", family_key: "Word family",
  component_to_whole_relationship: "How the parts make the meaning", use_in_lesson: "Use in lesson", needs_review: "Needs review", ipa: "IPA",
}[key] ?? key.replace(/^part_(\d+)_/, "Part $1 ").replaceAll("_", " ").replace(/^./, char => char.toUpperCase()));
const workbookLabel = (skill: string, key: string) => key === prefixMeaningKey ? prefixWorkbookFieldLabel(skill) : label(key);

export async function buildReviewWorkbook(input: { skill: string; title: string; bundles: MultiSenseCsvBundle[];
  notes: ReadonlyMap<string, string>; families: ReadonlyMap<string, string[]>;
  wordPartPrefills?: ReadonlyMap<string, WorkbookPartPrefill>; rootFamilyOptions?: readonly string[];
  schwaFacts?: ReadonlyMap<string, SchwaWorkbookFacts>; compoundFacts?: ReadonlyMap<string, CompoundWorkbookFacts>; suffixFacts?: ReadonlyMap<string, SuffixWorkbookFacts>; requestedSenses?: ReadonlyMap<string, string | null> }) {
  const keys = workbookKeys(input.skill);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", xSplit: 1, ySplit: headerRow }] });
  sheet.columns = keys.map(key => ({ key, width: key === "definition" || key === "needs_review" || key === "written_syllable_breakdown" ? 43
    : key === "family_key" || key === "dictation_sentence" ? 36 : 23, hidden: hidden.has(key) || isHomophoneReviewSkill(input.skill) && ["family_key", "component_part_id", "relationship_kind"].includes(key) }));
  sheet.getCell("A1").value = input.title;
  sheet.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF0F172A" } };
  sheet.getCell("A2").value = input.skill;
  sheet.getRow(2).hidden = true;
  sheet.getRow(headerRow).values = keys.map(key => workbookLabel(input.skill, key));
  sheet.getRow(headerRow).height = 44;
  sheet.getRow(headerRow).alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(headerRow).eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  });
  const familyOptions = workbook.addWorksheet("Family options", { state: "veryHidden" });
  const suffixWorkbook = isSuffixReviewSkill(input.skill);
  const prefixWorkbook = isPrefixWorkbookSkill(input.skill) ? prefixWorkbooks[input.skill] : null;
  const blankPrefixWorkbook = Boolean(prefixWorkbook && !input.bundles.length);
  const list = (choices: readonly string[], allowBlank = true): ExcelJS.DataValidation => ({
    type: "list", allowBlank, formulae: [`"${choices.join(",")}"`],
    showErrorMessage: true, error: "Choose a value from the list.",
  });
  const commonDropdowns: Record<string, ExcelJS.DataValidation> = {
    use_in_lesson: list(["Review", "Yes", "No"], false),
    part_of_speech: list(["verb", "noun", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner", "interjection", "numeral", "contraction", "root"]),
  };
  if (suffixWorkbook || isCompoundWorkbookSkill(input.skill) || isSchwaWorkbookSkill(input.skill)) {
    Object.assign(commonDropdowns, {
      age_band: list(DICTIONARY_BANDS.ageBand),
      frequency_band: list(DICTIONARY_BANDS.frequencyBand),
      complexity_band: list(DICTIONARY_BANDS.complexityBand),
      has_schwa: list(["Yes", "No"]),
    });
  }
  if (isSchwaWorkbookSkill(input.skill)) Object.assign(commonDropdowns, { activity_cut_source: list(CUT_SOURCES), weak_vowel_sound: list(["Schwa", "Other unstressed vowel"]), family_exploration: list(["Not used", "Use approved family"]), weak_vowel_occurrence: list(["1", "2", "3", "4"]) });
  if (prefixWorkbook) commonDropdowns[prefixMeaningKey] = list(prefixWorkbook.choices.map(choice => choice.label));
  commonDropdowns.relationship_kind = list(["derived", "free_base", "regular_inflection", "irregular_inflection", "contraction", "historical_relative"]);
  for (let index = 1; index <= FLAT_IMPORT_PART_LIMIT; index++) {
    commonDropdowns[`part_${index}_kind`] = list(isCompoundWorkbookSkill(input.skill) ? ["base"] : ["prefix", "base", "root", "suffix", "connector"]);
    commonDropdowns[`part_${index}_spelling_change_type`] = list([AUTO_TRANSFORMATION, ...TRANSFORMATION_OPTIONS.map(option => option.label)]);
    if (index > 1) commonDropdowns[`part_${index}_join_before`] = list(["none", "space", "hyphen"]);
  }
  const addDropdowns = (row: ExcelJS.Row) => {
    for (const [key, validation] of Object.entries(commonDropdowns)) row.getCell(key).dataValidation = validation;
    // Preserve literal apostrophes and prevent Excel coercing editable word forms.
    for (const index of partIndexes) for (const field of ["underlying_form", "visible_letters"])
      row.getCell(`part_${index}_${field}`).numFmt = "@";
  };
  const [headers, ...rows] = csvRecords(renderMultiSenseCsvBundles(input.bundles));
  for (const values of rows) {
    const entry = Object.fromEntries(headers.map((key, i) => [key, (values[i] ?? "").replace(/^'(?=[=+@\-\t\r])/u, "")]));
    const partPrefill = input.wordPartPrefills?.get(`${entry.canonical_word_id}:${entry.sense_id}`);
    for (const [key, value] of Object.entries(partPrefill?.fields ?? {})) if (!entry[key] || /^part_\d+_id$/u.test(key)) entry[key] = value;
    for (const index of partIndexes) {
      const prefix = `part_${index}_`;
      const source = entry[`${prefix}underlying_form`], surface = entry[`${prefix}visible_letters`];
      if (!source || !surface || source === surface) continue;
      const type = resolveTransformationType(entry[`${prefix}spelling_change_type`], source, surface);
      entry[`${prefix}spelling_change_type`] = TRANSFORMATION_OPTIONS.find(option => option.type === type)?.label ?? "Other reviewed change";
      entry[`${prefix}spelling_change_explanation`] ||= type ? transformationExplanation(type, source, surface) : "";
    }
    const schwa = input.schwaFacts?.get(entry.canonical_word_id);
    const notes = [
      ...(isSchwaWorkbookSkill(input.skill) ? [!schwa?.written_syllable_breakdown ? "Review Dictionary written syllable divisions." : "",
        schwa?.activity_cut_source === "Review conflict" ? "Activity cuts conflict with Dictionary divisions. Choose the cut source." : ""] : []),
      input.notes.get(entry.canonical_word_id),
      entry.part_of_speech !== "root" && !entry.dictation_sentence ? "Add a dictation sentence for this meaning." : "",
      ...(partPrefill?.issues ?? (!entry.part_1_kind ? ["Review the word parts."] : [])),
      !isHomophoneReviewSkill(input.skill) && !isSchwaWorkbookSkill(input.skill) && !entry.family_key ? "Choose the teaching family for this meaning." : "",
      !entry.ipa || !entry.spoken_syllable_count || !entry.stress_pattern
        ? "Check pronunciation, syllable count and stress." : "",
    ].filter(Boolean).join(" ");
    if (prefixWorkbook) {
      const parts = workbookPrefixParts(entry, prefixWorkbookForms(input.skill as keyof typeof prefixWorkbooks));
      if (parts.length === 1) {
        const prefix = entry[`part_${parts[0]}_underlying_form`].toLowerCase();
        const gloss = entry[`part_${parts[0]}_meaning`]?.trim().toLowerCase();
        const choices = input.skill === NEGATIVE_PREFIX_SKILL ? prefixWorkbook.choices : prefixWorkbook.choices.filter(choice => choice.prefix === prefix);
        entry[prefixMeaningKey] = (choices.length === 1 ? choices[0] : choices.find(choice => choice.gloss === gloss))?.label ?? "";
      }
    }
    const row = sheet.addRow({ ...entry, ...input.schwaFacts?.get(entry.canonical_word_id), ...input.suffixFacts?.get(entry.canonical_word_id), component_to_whole_relationship: input.compoundFacts?.get(entry.canonical_word_id)?.componentToWholeRelationship ?? "", use_in_lesson: input.requestedSenses?.get(entry.canonical_word_id) === entry.sense_id ? "Yes" : "Review", needs_review: notes });
    row.height = 32;
    row.alignment = { vertical: "middle", wrapText: true };
    addDropdowns(row);
    for (const key of partPrefill?.missingFields ?? []) {
      row.getCell(key).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDEDF7" } };
      row.getCell(key).note = partPrefill!.issues.join("\n");
    }
    const familyPart = Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => index + 1)
      .find(index => (entry[`part_${index}_id`] || `part_${index}`) === entry.component_part_id
        || (!entry.component_part_id && ["base", "root"].includes(entry[`part_${index}_kind`])));
    const familyChoices = input.families.get(entry[`part_${familyPart}_underlying_form`]) ?? [];
    const options = [...new Set([...familyChoices, ...(isSchwaWorkbookSkill(input.skill) ? input.rootFamilyOptions ?? [] : []), entry.family_key, "Needs family review"].filter(Boolean))];
    const start = familyOptions.rowCount + 1;
    for (const family of options) familyOptions.addRow([family]);
    const rangeName = `FamilyChoices${row.number}`;
    workbook.definedNames.add(`'Family options'!$A$${start}:$A$${familyOptions.rowCount}`, rangeName);
    row.getCell("family_key").dataValidation = { type: "list", allowBlank: true, formulae: [rangeName] };
    for (const key of ["use_in_lesson", "family_key", "definition", "part_of_speech", "dictation_sentence"]) {
      if (key !== "use_in_lesson" && entry[key]) continue;
      row.getCell(key).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDEDF7" } };
    }
  }
  {
    const rootOptions = isSchwaWorkbookSkill(input.skill) ? input.rootFamilyOptions ?? [] : [];
    let blankFamilyValidation = list(["Needs family review"]);
    if (rootOptions.length) {
      const start = familyOptions.rowCount + 1;
      for (const option of [...rootOptions, "Needs family review"]) familyOptions.addRow([option]);
      workbook.definedNames.add(`'Family options'!$A$${start}:$A$${familyOptions.rowCount}`, "ReviewedRootFamilyChoices");
      blankFamilyValidation = { type: "list", allowBlank: true, formulae: ["ReviewedRootFamilyChoices"] };
    }
    const firstBlankRow = headerRow + rows.length + 1;
    for (let number = firstBlankRow; number < firstBlankRow + 100; number++) {
      const row = sheet.getRow(number);
      addDropdowns(row);
      row.getCell("family_key").dataValidation = blankFamilyValidation;
    }
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: keys.length } };
  const rule = ING_RULE_FOR_SKILL[input.skill as IngMicroSkill];
  const wordPartsExample = input.skill === ABLE_IBLE_SKILL ? "For washable, enter wash as the base and able as the suffix." : input.skill === FUL_LESS_SKILL ? "For helpful, enter help as the base and ful as the suffix."
    : suffixWorkbook ? "Use the full base spelling and the final suffix taught in this lesson."
      : rule === "ie_to_y" ? "For tying, enter tie as the underlying form and ty as the visible letters."
    : rule === "double_final_consonant" ? "For hopping, enter hop as the underlying form and hopp as the visible letters."
      : rule === "regular" ? "For walking, enter walk as both forms."
        : rule === "drop_e" ? "For caring, enter care as the underlying form and car as the visible letters."
          : input.skill === UN_PREFIX_SKILL ? "For unkind, enter un as the prefix and kind as the base."
            : input.skill === NEGATIVE_PREFIX_SKILL ? "For illegal, enter il as the prefix and legal as the base."
            : input.skill === SUB_INTER_SUPER_PREFIX_SKILL ? "For subsoil, enter sub as the prefix and soil as the base."
            : prefixWorkbook ? "For misread, enter mis as the prefix and read as the base."
              : "Enter the underlying form and visible letters for each part.";
  const spellingChangeExample = input.skill === ABLE_IBLE_SKILL ? "For noticeable, retain notice as the underlying form and visible letters." : rule === "ie_to_y" ? "For tying, change the final ie to y before adding -ing."
    : rule === "double_final_consonant"
      ? "For beginning, the final syllable of begin has primary stress. Enter unstressed-primary-unstressed for beginning."
      : rule === "regular" ? "For walking, the base walk stays the same."
        : rule === "drop_e" ? "For caring, drop the final e before adding -ing."
          : "Keep the underlying base and enter the letters visible in the word.";
  const guide = workbook.addWorksheet("Field guide");
  guide.columns = [{ width: 27 }, { width: 104 }];
  guide.addRows([
    ["Field", "How to fill it in"],
    ["Use in lesson", "Choose Yes on the intended meaning. Keep all existing meaning rows. Words with no Yes stay out of this upload."],
    ["Word family", isHomophoneReviewSkill(input.skill) ? "Not required for this homophone lesson. Existing family links are retained; no new family approval is requested." : "Choose the approved family that matches the meaning. Leave the family blank or choose Needs family review to resolve it after uploading."],
    ["Meaning and pronunciation", "Confirm the definition, part of speech, IPA, syllable count and stress. Use the same pronunciation ID for identical pronunciations."],
    ["Word parts", `Keep the full base and its visible letters in separate fields. ${wordPartsExample} Use none for a join with no space.`],
    ["Spelling change", `Choose a standard rule from the dropdown, or leave blank / choose ${AUTO_TRANSFORMATION} to infer a clear change on upload. Standard explanations are filled automatically. Other reviewed change requires your explanation. ${spellingChangeExample} Keep the suffix separate: force → forc uses Drop final e; ible is a separate suffix part.`],
    ["Contractions and apostrophes", "Choose Contraction for will → 'll, had → 'd, is → 's, are → 're, and similar shortened forms. Enter the full underlying word and include the apostrophe in Visible letters. The explanation is filled automatically. In Excel, type two apostrophes (''ll) to store and display one ('ll), or put a space before 'll; surrounding spaces are removed on upload. Set Join before to none."],
    ["Family relationship", "Selecting a family for a single base links that base. For words with multiple bases, specify the component part ID."],
    ["Dictation", "Use the word once. Count from zero for the target position. In She is caring for a sick bird, caring is position 2."],
    ["Existing facts", "Confirm any facts copied from older Dictionary or lesson records. Keep the hidden IDs and source revision supplied in the workbook."],
  ]);
  if (isCompoundWorkbookSkill(input.skill)) guide.addRows([
    ["Compound components", "Enter each whole component as a base, with its approved meaning. Use none, space or hyphen for every join. The visible parts and joins must reproduce the exact spelling."],
    ["How the parts make the meaning", "One plain sentence explaining the compound meaning. Example: A bedroom is a room with a bed, used for sleeping. Existing reviewed explanations are prefilled."],
    ["Teaching family", "Choose the family for the component identified by Component part id. The first component is used when that field is empty. Other component meanings remain in the approved word parts."],
  ]);
  if (input.skill === UN_PREFIX_SKILL) guide.addRow([
    "Prefix meaning group",
    "Choose Not or Reverse for the meaning used in the lesson. Uploading fills the meaning of the un- word part and the ADLE Meaning group. Choose Not for untidy and Reverse for unlock.",
  ]);
  if (input.skill === NEGATIVE_PREFIX_SKILL) guide.addRow([
    prefixWorkbookFieldLabel(input.skill),
    "Choose not, in or upon, or make for this word. This fills the prefix part’s meaning on upload. Prefix spelling is separate: for not, use im- before b, m or p, il- before l, ir- before r, and in- before most other letters. A blank choice uses the part’s reviewed meaning; it never assumes not. The lesson’s Prefix Form Sort still checks spelling, separately from meaning.",
  ]);
  else if (prefixWorkbook && input.skill !== UN_PREFIX_SKILL) guide.addRow([
    prefixWorkbookFieldLabel(input.skill),
    `Choose ${prefixWorkbook.choices.map(choice => `${choice.label} for ${choice.prefix}-`).join(" and ")}. Leave this blank to use the group for the prefix you enter.`,
  ]);
  if (isSchwaWorkbookSkill(input.skill)) guide.addRows([
    ["Weak vowel target", "Enter the target letter or complete ending, for example a or ar. Choose its occurrence (1 means the first). Targets must contain one written vowel."],
    ["Weak vowel sound", "Choose Schwa or Other unstressed vowel for the selected British pronunciation. A quiet vowel is not always a schwa."],
    ["Dictionary written syllable divisions", "Review every word here, for example writ·er. Use middle dots; separator hyphens are converted. The divisions must rejoin to the spelling. Upload updates the Teaching Dictionary once for reuse by all Schwa lessons. These are written letter divisions, not a phonetic transcription."],
    ["Activity cut source", "Use dictionary is the default. Existing conflicting cuts are flagged: choose Use dictionary or Reviewed alternative. Leave alternative divisions blank unless a different activity cut is intentionally reviewed."],
    ["Alternative activity divisions (optional)", "Only for Reviewed alternative. Use middle dots; separate accepted alternatives with |. Never use word parts as a substitute for syllable review."],
    ["Spoken syllable count", "The number heard in the selected pronunciation. This is a count, distinct from the written divisions used to cut the displayed word."],
    ["Family exploration", "Choose Not used to opt out. Use approved family includes exploration automatically in new lessons once its approved base/root and at least two approved members are available. While the family waits, the core word can still be published and Active. Resolve its family link in this flow."],
    ["Publication", "Upload saves the reviewed Dictionary facts and activity annotations. Missing facts stay in Bulk review. One Publish click releases all ready words."],
  ]);
  if (blankPrefixWorkbook) guide.addRows([
    ["New words", "Start on the first blank row. Enter the spelling, meaning, part of speech, IPA, spoken syllable count, stress and dictation. The upload fills the hidden IDs."],
    ["Prefix and base", `For part 1 choose prefix and enter ${isPrefixWorkbookSkill(input.skill) ? prefixWorkbookForms(input.skill).join(" or ") : ""} for both forms. For part 2 choose base and enter the base spelling and its meaning. Set the join to none and the relationship to derived.`],
    ["Before publishing", isHomophoneReviewSkill(input.skill) ? "Choose the meaning taught by the contrast set. A reviewed workbook approves Dictionary facts; changed contrast-set teaching content still needs its own lesson release." : "Resolve the base family in Bulk review if needed. Open the saved lesson draft to complete any remaining lesson checks."],
  ]);
  if (isComparativeReviewSkill(input.skill)) guide.addRows([
    ["Complete adjective sets", "Review the base, comparative and superlative together. All three must use the same adjective meaning and base family."],
    ["Word parts", "Use one base part for the base word. For the other two forms, add er or est. Record the visible base letters and any spelling change."],
    ["Publish", "Upload saves reviewed Dictionary facts. Preview checks the complete three-word set before Publish makes it available in ADLE."],
  ]);
  if (suffixWorkbook) guide.addRows([
    ["New words", "Use the first 100 empty rows for new entries. Choose Needs family review to find or create a family in Bulk review."],
    ["Dictionary bands", "Use the dropdowns to choose the word’s age, frequency and complexity bands."],
    ["Has schwa", "Choose Yes or No for the selected British pronunciation."],
  ]);
  guide.getRow(1).font = { bold: true, color: { argb: "FFA7135A" } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildLessonPoolWorkbook(title: string, words: readonly Pick<IngDictionaryWordV1, "word" | "canonicalWordId" | "base" | "meaning" | "dictationSentence" | "pronunciationIpa" | "senseId">[]) {
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
  const prefixWorkbook = isPrefixWorkbookSkill(skill) ? prefixWorkbooks[skill] : null;
  const legacyPrefixForm = skill === NEGATIVE_PREFIX_SKILL && sheet?.getCell(headerRow, 5).value === "Prefix form";
  const hasPrefixChoice = prefixWorkbook && (sheet?.getCell(headerRow, 5).value === workbookLabel(skill, prefixMeaningKey) || legacyPrefixForm);
  const currentKeys = skill === UN_PREFIX_SKILL && !hasPrefixChoice ? reviewKeys : workbookKeys(skill);
  const legacySchwa = isSchwaWorkbookSkill(skill) && sheet?.getCell(headerRow, currentKeys.length).value !== workbookLabel(skill, "activity_cut_source");
  const keys = legacySchwa ? currentKeys.filter(key => !(SCHWA_SYLLABLE_FIELDS as readonly string[]).includes(key)) : currentKeys;
  const matchesHeader = (key: string, value: unknown) => value === workbookLabel(skill, key)
    || key === "activity_syllables" && value === "Activity syllables";
  if (!sheet || sheet.getCell("A2").value !== skill || keys.some((key, i) => !matchesHeader(key, sheet.getCell(headerRow, i + 1).value) && !(legacyPrefixForm && key === prefixMeaningKey && sheet.getCell(headerRow, i + 1).value === "Prefix form")))
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
    if (entry.display_word && !entry.canonical_word_id && !entry.source_sense_reviewed_at) {
      entry.sense_id ||= `meaning-${index}`;
      if (entry.part_of_speech !== "root") entry.pronunciation_id ||= `pronunciation-${index}`;
    }
    if (!entry.display_word) throw new Error(`Workbook row ${index} needs a word.`);
    const groupKey = entry.display_word.toLocaleLowerCase("en-GB");
    const group = groups.get(groupKey) ?? [];
    group.push(entry);
    groups.set(groupKey, group);
  }
  const compoundFacts = new Map<number, CompoundWorkbookFacts>();
  const pendingFamilies: WorkbookFamilyTask[] = [];
  const records: Record<string, string>[] = [];
  const decisions = new Map(options?.decisions.map(decision => [decision.row, decision]));
  const selected = [...groups.values()].filter(group => group.some(row => row.use_in_lesson === "Yes"
    && (!options?.targetRow || Number(row.workbook_row) === options.targetRow)));
  if (!selected.length) throw new Error("Choose Yes under Use in lesson for at least one meaning.");
  for (const group of selected) {
    if (isSchwaWorkbookSkill(skill) && group.filter(row => row.use_in_lesson === "Yes").length > 1)
      throw new Error(`Choose one teaching meaning under Use in lesson for ${group[0].display_word}. Other meanings stay in the Dictionary.`);
    if (isCompoundWorkbookSkill(skill)) for (const row of group) compoundFacts.set(Number(row.workbook_row), { componentToWholeRelationship: row.component_to_whole_relationship ?? "" });
    const tasks: WorkbookFamilyTask[] = [];
    if (hasPrefixChoice) {
      const lessonRows = group.filter(row => row.use_in_lesson === "Yes");
      if (lessonRows.length > 1)
        throw new Error(`Choose one teaching meaning under Use in lesson for ${group[0].display_word}.`);
      const [row] = lessonRows;
      const choices = prefixWorkbook.choices;
      const forms = prefixWorkbookForms(skill as keyof typeof prefixWorkbooks);
      const parts = workbookPrefixParts(row, forms);
      if (parts.length !== 1)
        throw new Error(`Workbook row ${row.workbook_row}: add one ${[...new Set(choices.map(choice => choice.prefix + "-"))].join(" or ")} prefix part for the teaching meaning.`);
      const prefix = row[`part_${parts[0]}_underlying_form`].toLowerCase();
      const entered = row[prefixMeaningKey].toLowerCase();
      const available = skill === NEGATIVE_PREFIX_SKILL ? choices : choices.filter(choice => choice.prefix === prefix);
      const reviewedGloss = row[`part_${parts[0]}_meaning`];
      if (legacyPrefixForm && entered && entered !== `${prefix}-`)
        throw new Error(`Workbook row ${row.workbook_row}: the old Prefix form must match ${prefix}-.`);
      const choice = skill === NEGATIVE_PREFIX_SKILL
        ? inPrefixMeaning(legacyPrefixForm || !entered ? reviewedGloss : entered)
        : !entered && available.length === 1 ? available[0] : available.find(choice => choice.label.toLowerCase() === entered);
      if (!choice) throw new Error(`Workbook row ${row.workbook_row}: choose ${available.map(option => option.label).join(" or ")} under ${prefixWorkbookFieldLabel(skill)}.`);
      if (skill === NEGATIVE_PREFIX_SKILL && choice.id === "not") {
        const following = row.display_word.slice(prefix.length);
        const expected = negativePrefixForBase(following);
        if (prefix !== expected) throw new Error(`Workbook row ${row.workbook_row}: use ${expected}- before ${following[0]?.toLowerCase()}.`);
      }
      row[`part_${parts[0]}_meaning`] = choice.gloss;
      row[prefixMeaningKey] = choice.id;
    }
    for (const row of group) {
      const rowNumber = Number(row.workbook_row);
      row.family_key = row.family_key.split(" | ").at(-1) ?? "";
      if (row.family_key === "Needs family review") row.family_key = "";
      if (row.use_in_lesson !== "Yes") continue;
      if (isHomophoneReviewSkill(skill) || isSchwaWorkbookSkill(skill) && row.family_exploration !== "Use approved family") {
        if (!row.family_key) { row.component_part_id = ""; row.relationship_kind = ""; }
        continue;
      }
      const bases = Array.from({ length: FLAT_IMPORT_PART_LIMIT }, (_, index) => index + 1)
        .filter(index => ["base", "root"].includes(row[`part_${index}_kind`]));
      if (bases.length > 1 && !row.component_part_id && !row.family_key) {
        for (const part of bases) tasks.push({ row: rowNumber, word: row.display_word, meaning: row.definition,
          base: row[`part_${part}_underlying_form`].toLocaleLowerCase("en-GB"), sentence: row.dictation_sentence,
          senseId: row.sense_id, componentPartId: row[`part_${part}_id`] || `part_${part}`,
          baseKind: row[`part_${part}_kind`] === "root" ? "bound_root" : "free_base", baseMeaning: row[`part_${part}_meaning`] });
        continue;
      }
      const part = bases.length === 1 || isCompoundWorkbookSkill(skill) && !row.component_part_id ? bases[0] : bases.find(index =>
        (row[`part_${index}_id`] || `part_${index}`) === row.component_part_id);
      const base = part ? row[`part_${part}_underlying_form`].toLocaleLowerCase("en-GB") : "";
      const decision = decisions.get(rowNumber) ?? (row.family_key ? { row: rowNumber, familyKey: row.family_key } : null);
      if (!decision || !base || !part) {
        tasks.push({ row: rowNumber, word: row.display_word, meaning: row.definition, base, sentence: row.dictation_sentence,
          senseId: row.sense_id, componentPartId: part ? row[`part_${part}_id`] || `part_${part}` : "",
          baseKind: part && row[`part_${part}_kind`] === "root" ? "bound_root" : "free_base",
          baseMeaning: part ? row[`part_${part}_meaning`] : "" });
        continue;
      }
      const family = options ? await options.resolve(base, decision) : null;
      if (options && (!family || family.base !== base || (row[`part_${part}_kind`] === "root") !== (family.kind === "bound_root")))
        throw new Error(`Row ${rowNumber}: choose an approved family with the base “${base}”.`);
      if (family) {
        row.family_key = family.key;
        row[`part_${part}_meaning`] ||= family.meaning;
      }
      row.component_part_id = row[`part_${part}_id`] || `part_${part}`;
      if (!row.relationship_kind && ING_RULE_FOR_SKILL[skill as IngMicroSkill]) row.relationship_kind = "regular_inflection";
      if (!row.relationship_kind && isComparativeReviewSkill(skill))
        row.relationship_kind = row.part_2_kind ? "regular_inflection" : "free_base";
      if (!row.relationship_kind && isSchwaWorkbookSkill(skill)) row.relationship_kind = row.part_2_kind ? "derived" : "free_base";
      if (!row.relationship_kind && isCompoundWorkbookSkill(skill)) row.relationship_kind = "derived";
      if (!row.relationship_kind && isSuffixReviewSkill(skill)) row.relationship_kind = "derived";
      if (!row.relationship_kind && isPrefixWorkbookSkill(skill)) row.relationship_kind = "derived";
      if (!row.relationship_kind)
        throw new Error(`Row ${rowNumber}: choose the relationship to the teaching family.`);
    }
    if (tasks.length) {
      pendingFamilies.push(...tasks);
    }
    records.push(...group);
  }
  const csv = [MULTI_SENSE_CSV_COLUMNS, ...records.map(row => {
    if (!row.family_key) {
      row.component_part_id = "";
      row.relationship_kind = "";
    }
    return MULTI_SENSE_CSV_COLUMNS.map(key => key === "requested_micro_skills"
      ? row.use_in_lesson === "Yes" ? skill : "" : row[key] ?? "");
  })].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const requestedRows = records.filter(row => row.use_in_lesson === "Yes");
  const prefixMeanings = new Map<number, string>();
  if (hasPrefixChoice) for (const row of requestedRows)
    prefixMeanings.set(Number(row.workbook_row), row[prefixMeaningKey]);
  return { schwaFacts: new Map(requestedRows.map(row => [Number(row.workbook_row), Object.fromEntries([...SCHWA_WORKBOOK_FIELDS, ...SCHWA_SYLLABLE_FIELDS.filter(key => !legacySchwa || row[key] !== undefined)].map(key => [key, row[key] ?? ""])) as SchwaWorkbookFacts])), compoundFacts, prefixMeanings, suffixFacts: new Map(requestedRows.map(row => [Number(row.workbook_row),
    { age_band: row.age_band ?? "", frequency_band: row.frequency_band ?? "", complexity_band: row.complexity_band ?? "", has_schwa: row.has_schwa ?? "" } satisfies SuffixWorkbookFacts])), csv, rowNumbers: records.map(row => Number(row.workbook_row)), pendingFamilies };
}
