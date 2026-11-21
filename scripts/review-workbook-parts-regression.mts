import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { COMPARATIVE_MICRO_SKILLS } from "../lib/adle/inflection/contracts";
import { prefillWorkbookParts } from "../lib/teaching-dictionary-manager/review-workbook-part-prefill";
import { buildReviewWorkbook, readReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { prepareReviewedCsv, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";
const writer = prefillWorkbookParts({ word: "writer", definition: "A person who writes.", parts: [
  {kind:"base",sourceText:"write",surfaceText:"writ"},{kind:"suffix",sourceText:"er",surfaceText:"er"}], joins:[],transformations:[] });
assert.equal(writer.fields.part_1_underlying_form,"write");assert.equal(writer.fields.part_1_visible_letters,"writ");
assert.equal(writer.fields.part_2_join_before,"none");assert.equal(writer.fields.part_1_spelling_change_type,"drop_final_e");
assert.deepEqual(writer.issues,["Part 1: add its meaning.","Part 2: add its meaning."]);
const teacher=prefillWorkbookParts({word:"teacher",definition:"A person who teaches.",parts:[{kind:"base",sourceText:"teach",surfaceText:"teach"},{kind:"suffix",sourceText:"er",surfaceText:"er"}],joins:[],transformations:[]});
assert.equal(teacher.fields.part_2_join_before,"none");assert.deepEqual(teacher.issues,writer.issues);
const older=prefillWorkbookParts({word:"worker",definition:"A person who works.",parts:[{type:"base",text:"work",meaning:"To do a job."},{type:"suffix",text:"er"}],joins:[],transformations:[]});
assert.equal(older.fields.part_1_meaning,"To do a job.");assert.equal(older.fields.part_2_visible_letters,"er");assert.deepEqual(older.issues,["Part 2: add its meaning."]);
const ambiguous=prefillWorkbookParts({word:"baker",definition:"Someone who bakes.",parts:[{type:"base",text:"bake"},{type:"suffix",text:"er"}],joins:[],transformations:[]});
assert.equal(ambiguous.fields.part_1_underlying_form,"bake");assert.equal(ambiguous.fields.part_1_visible_letters,"");assert(ambiguous.issues.includes("Part 1: confirm its visible letters."));
const whole=prefillWorkbookParts({word:"after",definition:"Later than something else.",parts:[{kind:"base",sourceText:"after",surfaceText:"after"}],joins:[],transformations:[]});assert.equal(whole.fields.part_1_meaning,"Later than something else.");assert.deepEqual(whole.issues,[]);
const conflict=prefillWorkbookParts({word:"after",definition:"Later.",parts:[{kind:"base",type:"suffix",sourceText:"after",surfaceText:"after"}],joins:[],transformations:[]});assert(conflict.issues.some(issue=>issue.includes("conflicting")));
const skill="D4_SCHWA_FINAL_ER_FINAL";
const bundle:MultiSenseCsvBundle={wordId:"11111111-1111-5111-8111-111111111111",displayWord:"writer",sourceSenseReviewedAt:"",senseSet:{senses:[{id:"review",definition:"A person who writes.",partOfSpeech:"noun",pronunciationId:"p",dictationSentence:"The writer smiled.",dictationTargetTokenIndex:1}],pronunciations:[{id:"p",ipa:"/ˈraɪtə/",spokenSyllableCount:2,stressPattern:"primary-unstressed"}]},analyses:[]};
const bytes=await buildReviewWorkbook({skill,title:"Word parts",bundles:[bundle],families:new Map(),notes:new Map(),wordPartPrefills:new Map([[`${bundle.wordId}:review`,writer]]),requestedSenses:new Map([[bundle.wordId,"review"]]),schwaFacts:new Map([[bundle.wordId,{weak_vowel_target:"er",weak_vowel_occurrence:"1",weak_vowel_sound:"Schwa",activity_syllables:"wri·ter",family_exploration:"Not used",age_band:"middle_primary",frequency_band:"high",complexity_band:"low",has_schwa:"Yes"}]])});
const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes as unknown as ArrayBuffer);const sheet=wb.getWorksheet("Words to review")!;const headings=sheet.getRow(3).values as string[];const cell=(name:string)=>sheet.getCell(4,headings.indexOf(name));
assert.equal(cell("Part 1 underlying form").value,"write");assert.equal(cell("Part 1 visible letters").value,"writ");assert.equal(cell("Part 2 join before").value,"none");assert(String(cell("Needs review").value).includes("Part 1: add its meaning."));assert(cell("Part 1 meaning").note);assert.equal(cell("Part 1 spelling change type").value,"Drop final e");
let parsed=await readReviewWorkbook((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer,skill);assert(prepareReviewedCsv(parsed.csv)[0].error,"Missing meanings cannot be approved");
cell("Part 1 meaning").value="To form letters or words.";cell("Part 2 meaning").value="A person who performs an action.";
parsed=await readReviewWorkbook((await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer,skill);const result=prepareReviewedCsv(parsed.csv)[0];assert.equal(result.error,null);assert.equal(result.bundle!.analyses[0].transformations[0].type,"drop_final_e");
for (const otherSkill of ["D4_INF_ING_ENDINGS_REGULAR", "D4_MOR_PREFIXES_UN", "D4_MOR_SUFFIXES_ABLE_IBLE", "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS", "D4_HOM_CONTRACTION_POSSESSIVE_HOMOPHONES_PAIRS", COMPARATIVE_MICRO_SKILLS[0]]) {
  const bytes = await buildReviewWorkbook({skill:otherSkill,title:"Shared prefill",bundles:[bundle],families:new Map(),notes:new Map(),wordPartPrefills:new Map([[`${bundle.wordId}:review`,writer]])});
  const check=new ExcelJS.Workbook();await check.xlsx.load(bytes as unknown as ArrayBuffer);const tab=check.getWorksheet("Words to review")!,headers=tab.getRow(3).values as string[];
  assert.equal(tab.getCell(4,headers.indexOf("Part 1 underlying form")).value,"write",otherSkill);
  assert.equal(tab.getCell(4,headers.indexOf("Part 2 underlying form")).value,"er",otherSkill);
}
console.log({passed:true,existingPartsPreserved:true,onlyMissingDetailsFlagged:true,ambiguousFormsNotInvented:true,missingMeaningsBlockApproval:true,completedWorkbookParses:true});
