import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { AUTO_TRANSFORMATION, TRANSFORMATION_OPTIONS, reviewedTransformation, suggestTransformation, standardiseTransformations } from "../lib/teaching-dictionary-manager/transformations";
import { flatMorphology } from "../lib/teaching-dictionary-manager/csv";
import { buildReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { prefixWorkbooks } from "../lib/teaching-dictionary-manager/prefix-workbook";
import { ING_RULE_FOR_SKILL } from "../lib/adle/ing/contracts";
import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "../lib/adle/morphology/dynamic-suffix-profile-keys";

for (const [sourceText, surfaceText, type] of [
  ["force", "forc", "drop_final_e"], ["hop", "hopp", "double_final_consonant"],
  ["happy", "happi", "change_final_y_to_i"], ["tie", "ty", "change_final_ie_to_y"],
  ["leaf", "leav", "change_final_f_to_v"], ["life", "liv", "change_final_fe_to_v"],
  ["will", "'ll", "contraction"], ["had", "'d", "contraction"],
  ["are", "'re", "contraction"], ["us", "'s", "contraction"],
] as const) {
  assert.equal(suggestTransformation(sourceText, surfaceText), type);
  const suggestion = reviewedTransformation({ type: AUTO_TRANSFORMATION, sourcePartId: "base", sourceText, surfaceText, explanation: "" });
  assert.equal(suggestion.type, type); assert(suggestion.explanation);
  assert.equal(reviewedTransformation({ ...suggestion, type: "base_spelling_change" }).type, type);
}
assert.equal(suggestTransformation("is", "’s"), "contraction");
assert.equal(suggestTransformation("will", "ll"), null);
assert.throws(() => reviewedTransformation({ type: "Contraction", sourcePartId: "part_2", sourceText: "will", surfaceText: "ll", explanation: "" }), /does not change/);
assert.equal(reviewedTransformation({ type: "drop final e > ible", sourcePartId: "base", sourceText: "force", surfaceText: "forc", explanation: "" }).type, "drop_final_e");
assert.throws(() => reviewedTransformation({ type: "Drop final e", sourcePartId: "base", sourceText: "force", surfaceText: "forcc", explanation: "Reviewed" }), /does not change/);
assert.throws(() => reviewedTransformation({ type: "Other reviewed change", sourcePartId: "base", sourceText: "go", surfaceText: "went", explanation: "" }), /Explain/);
assert.equal(reviewedTransformation({ type: "Other reviewed change", sourcePartId: "base", sourceText: "go", surfaceText: "went", explanation: "Reviewed irregular past-tense form." }).type, "other_reviewed_change");
assert.equal(suggestTransformation("walk", "walk"), null);
assert.equal(standardiseTransformations([{ id: "base", sourceText: "force", surfaceText: "forc" }], [])[0].type, "drop_final_e");
const raw = { part_1_id: "base", part_1_kind: "base", part_1_underlying_form: "force", part_1_visible_letters: "forc", part_1_meaning: "To make something happen.",
  part_2_id: "suffix", part_2_kind: "suffix", part_2_underlying_form: "ible", part_2_visible_letters: "ible", part_2_meaning: "able to be", part_2_join_before: "none" };
assert.equal(flatMorphology(raw, ["part_1_kind"], "forcible")!.transformations[0].type, "drop_final_e");
assert.throws(() => flatMorphology({ ...raw, part_1_spelling_change_type: "Double final consonant" }, ["part_1_kind"], "forcible"), /does not change/);
assert.throws(() => flatMorphology(raw, ["part_1_kind"], "forcibble"), /not “forcibble”/);
const skills = new Set([...Object.keys(prefixWorkbooks), "D4_MOR_PREFIXES_UN", ...Object.keys(ING_RULE_FOR_SKILL), ...DYNAMIC_SUFFIX_PROFILE_KEYS,
  "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS",
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS", "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
  "D4_INF_COMPARATIVE_SUPERLATIVE_REGULAR", "D4_INF_COMPARATIVE_SUPERLATIVE_DROP_E", "D4_INF_COMPARATIVE_SUPERLATIVE_DOUBLING", "D4_INF_COMPARATIVE_SUPERLATIVE_Y_TO_I"]);
async function checkWorkbooks() {
for (const skill of skills) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildReviewWorkbook({ skill, title: skill, bundles: [], notes: new Map(), families: new Map() }));
  const sheet = book.getWorksheet("Words to review")!;
  const headers = sheet.getRow(3).values as string[];
  for (const row of [4, 103]) for (const part of [1, 6]) {
    const validation = sheet.getRow(row).getCell(headers.indexOf(`Part ${part} spelling change type`)).dataValidation;
    assert.equal(validation.type, "list", `${skill}: part ${part}, row ${row}`);
    for (const option of TRANSFORMATION_OPTIONS) assert(String(validation.formulae).includes(option.label));
  }
}
console.log(`PASS: transformation rules, aliases, inference, exceptions, invalid spelling changes and all ${skills.size} blank workbook dropdowns`);
}
checkWorkbooks().catch(error => { console.error(error); process.exitCode = 1; });
