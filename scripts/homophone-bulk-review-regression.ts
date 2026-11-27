import { includeActiveWorkbookReview } from "../lib/teaching-dictionary-manager/active-workbook-review";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { HOMOPHONE_REVIEW_SKILLS, homophoneReviewRoute, homophoneReviewWords } from "../lib/teaching-dictionary-manager/homophone-review-contract";
import { hasCandidateRule } from "../lib/teaching-dictionary-manager/lesson-candidate";
import { supportsReviewWorkbook } from "../lib/teaching-dictionary-manager/bulk-review-scope";
import { homophoneReviewCandidate, prefillHomophoneBundle } from "../lib/teaching-dictionary-manager/homophone-bulk-review";
import { buildReviewWorkbook, readReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { prepareReviewedCsv, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";
import { canonicalWordSum } from "../lib/teaching-dictionary-manager/canonical-morphology";
import { routeForSkill } from "../lib/teaching-dictionary-manager/contracts";

function reviewed(word: string): MultiSenseCsvBundle {
  const parts = [{id: "word", kind: "base" as const, sourceText: word, surfaceText: word,
    gloss: "Reviewed word meaning", displayRange: {start: 0, end: word.length}}];
  return {wordId: "00000000-0000-4000-8000-000000000001", displayWord: word, sourceSenseReviewedAt: "",
    senseSet: {senses: [{id: "meaning", definition: "Reviewed word meaning", partOfSpeech: "noun", pronunciationId: "british",
      dictationSentence: word, dictationTargetTokenIndex: 0}],
      pronunciations: [{id: "british", ipa: "/test/", spokenSyllableCount: 1, stressPattern: "primary"}]},
    analyses: [{senseId: "meaning",parts, joins: [], transformations: [], wordSum: canonicalWordSum(parts,word),
      familyKey: "", componentPartId: "", relationshipKind: "", requestedSkillKeys: []}]};
}
async function main() {
  let pairs=0;
  assert.equal(HOMOPHONE_REVIEW_SKILLS.length,68);
  for (const skill of HOMOPHONE_REVIEW_SKILLS) {
    assert(hasCandidateRule(skill));assert(supportsReviewWorkbook(skill));
    assert.equal(routeForSkill(skill)?.routeId,homophoneReviewRoute(skill));
    for (const word of homophoneReviewWords(skill)) {
      assert.equal(homophoneReviewCandidate(reviewed(word),skill,"meaning").status,"ready",`${skill}: ${word}`);pairs++;
    }
  }
  const auditedRows=[{id:"review-word",word:"accept",href:"/word",note:"Review the prefilled canonical facts in the workbook."}];
  assert.strictEqual(await includeActiveWorkbookReview({} as Parameters<typeof includeActiveWorkbookReview>[0],HOMOPHONE_REVIEW_SKILLS[0],
    [{canonicalWordId:"review-word",word:"accept"}],auditedRows),auditedRows,"The shared wrapper must preserve the homophone audit without new family checks or duplicate database reads");
  const skill=HOMOPHONE_REVIEW_SKILLS[0],word=homophoneReviewWords(skill)[0],bundle=reviewed(word);
  assert.equal(homophoneReviewCandidate(reviewed("notinthisset"),skill,"meaning").status,"not_match");
  const missing=structuredClone(bundle);missing.senseSet.pronunciations[0].ipa="";
  assert.equal(homophoneReviewCandidate(missing,skill,"meaning").status,"needs_facts");
  const sentence=structuredClone(bundle);sentence.senseSet.senses[0].dictationSentence="";
  assert.equal(homophoneReviewCandidate(sentence,skill,"meaning").status,"needs_facts");
  const multi=structuredClone(bundle);multi.senseSet.senses.push({...multi.senseSet.senses[0],id:"other",definition:"Another meaning"});
  assert.equal(homophoneReviewCandidate(multi,skill,undefined).status,"needs_facts");
  assert.equal(homophoneReviewCandidate(multi,skill,"other").status,"needs_facts","Each meaning needs its own approved parts");
  const bytes=await buildReviewWorkbook({skill,title:"Homophone review",bundles:[bundle],notes:new Map(),families:new Map(),requestedSenses:new Map([[bundle.wordId,"meaning"]])});
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheet=wb.getWorksheet("Words to review")!;
  assert.equal(sheet.getCell('D4').text,'Yes');
  const headers=sheet.getRow(3).values as string[];assert(sheet.getColumn(headers.indexOf('Word family')).hidden);
  assert(!sheet.getRow(4).values?.toString().includes('Choose the teaching family'));
  assert(sheet.getCell(4,headers.indexOf('Part of speech')).dataValidation.formulae?.length);
  const parsed=await readReviewWorkbook(Uint8Array.from(bytes).buffer,skill);
  assert.equal(parsed.pendingFamilies.length,0);
  const [row]=prepareReviewedCsv(parsed.csv);assert(row.bundle,row.error!);
  assert.deepEqual(row.bundle.analyses[0].requestedSkillKeys,[skill]);
  assert.equal(row.bundle.senseSet.senses[0].definition,bundle.senseSet.senses[0].definition);
  const prefill=prefillHomophoneBundle({id:bundle.wordId,display_word:word},[{canonical_word_id:bundle.wordId,set_key:'test',revision:1,intended_sense:'Reviewed lesson meaning',grammatical_role:'noun',target_sentence:word}]);
  assert.equal(prefill.sourceSenseReviewedAt,'');assert.equal(prefill.analyses.length,0,"Lesson prefill must not invent approved parts");
  assert.equal(prefill.senseSet.senses[0].dictationTargetTokenIndex,0);
  assert.strictEqual(prefillHomophoneBundle({id:bundle.wordId,display_word:word},[],bundle),bundle,"Existing meanings must be preserved");
  console.log({passed:true,skills:68,pairs,workbookFamiliesNotRequired:true,reviewedFactsPreserved:true,meaningChoicesAndGapsChecked:true});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
