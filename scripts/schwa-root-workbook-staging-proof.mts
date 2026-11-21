/** Runs against the copied, disposable popular/popul staging fixture only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { WEAK_VOWEL_MICRO_SKILLS } from "../lib/adle/word-lab/weak-vowel-dinner";
import { prefillReviewWorkbookFacts } from "../lib/teaching-dictionary-manager/review-workbook-facts";
import { buildReviewWorkbook, readReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";
import { approvedWorkbookFamily, loadWorkbookFamilyChoices } from "../lib/teaching-dictionary-manager/workbook-family-resolution";
import { prepareReviewedCsv, type MultiSenseCsvBundle } from "../lib/teaching-dictionary-manager/multi-sense-csv";
import { loadReviewedMeaningBundles } from "../lib/teaching-dictionary-manager/multi-sense-export";
import { stageSchwaWorkbookDraft, loadSchwaWorkbookQueue, publishSchwaWorkbookWord } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://qkpjbajicacbrphthibk.supabase.co");
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, "staging");
const dir = "outputs/schwa-root-workbook-20261121";
const fixture = JSON.parse(fs.readFileSync(`${dir}/fixture.json`, "utf8"));
const db = createServiceRoleClient(), actor = process.env.STAGING_ADMIN_USER_ID!, skill = "D4_SCHWA_FINAL_AR_FINAL";
const metadata = await db.from("canonical_teaching_dictionary_word_metadata").select("phoneme_hint,syllables,stress_pattern")
  .eq("canonical_word_id", fixture.wordId).eq("row_status", "active").order("created_at", {ascending:false}).limit(1).single();
assert.ifError(metadata.error);
const sentence = await db.from("canonical_teaching_dictionary_dictation_sentences").select("dictation_sentence,dictation_target_token_index")
  .eq("canonical_word_id", fixture.wordId).eq("row_status", "active").order("created_at", {ascending:false}).limit(1).single();
assert.ifError(sentence.error);
const [current] = await loadReviewedMeaningBundles(db, [fixture.wordId]);
const bundle: MultiSenseCsvBundle = { wordId: fixture.wordId, displayWord: "popular", sourceSenseReviewedAt: current?.sourceSenseReviewedAt ?? "",
  senseSet: { pronunciations: [{id:"gb",ipa:metadata.data!.phoneme_hint,spokenSyllableCount:Number(metadata.data!.syllables),stressPattern:metadata.data!.stress_pattern}],
    senses: [{id:"review",definition:fixture.definition,partOfSpeech:"adjective",pronunciationId:"gb",dictationSentence:sentence.data!.dictation_sentence,dictationTargetTokenIndex:sentence.data!.dictation_target_token_index}] },
  analyses: [{senseId:"review",parts:[{id:"root",kind:"root",sourceText:"popul",surfaceText:"popul",gloss:"",displayRange:{start:0,end:5}},
    {id:"suffix",kind:"suffix",sourceText:"ar",surfaceText:"ar",gloss:"relating to",displayRange:{start:5,end:7}}],
    joins:[{afterPartId:"root",beforePartId:"suffix",joinType:"none"}],transformations:[],wordSum:"popul + ar → popular",familyKey:"",componentPartId:"root",relationshipKind:"derived",requestedSkillKeys:[]}] };
for (const key of WEAK_VOWEL_MICRO_SKILLS) {
  const facts = await prefillReviewWorkbookFacts(db, [bundle], key);
  assert(facts.families.get("popul")?.some(option=>option.endsWith(` | ${fixture.familyKey}`)), key);
}
const facts = await prefillReviewWorkbookFacts(db, [bundle], skill);
const fields = {weak_vowel_target:"ar",weak_vowel_occurrence:"1",weak_vowel_sound:"Schwa",activity_syllables:"pop·u·lar",family_exploration:"Use approved family",age_band:"middle_primary",frequency_band:"high",complexity_band:"low",has_schwa:"Yes"};
const bytes = await buildReviewWorkbook({skill,title:"Schwa root family test",...facts,notes:new Map(),requestedSenses:new Map([[fixture.wordId,"review"]]),schwaFacts:new Map([[fixture.wordId,fields]])});
const wb = new ExcelJS.Workbook();await wb.xlsx.load(bytes as unknown as ArrayBuffer);
const sheet=wb.getWorksheet("Words to review")!, headings=sheet.getRow(3).values as string[];
const cell=(name:string)=>sheet.getCell(4,headings.indexOf(name));
assert(cell("Part 1 kind").dataValidation.formulae?.some(value=>String(value).includes("root")));
const hidden=wb.getWorksheet("Family options")!;const options=hidden.getColumn(1).values as string[];
const option=options.find(value=>String(value).endsWith(` | ${fixture.familyKey}`));assert(option);
const unresolved = await readReviewWorkbook(bytes as unknown as ArrayBuffer, skill);
assert.equal(unresolved.pendingFamilies[0].baseKind,"bound_root");assert.equal(unresolved.pendingFamilies[0].base,"popul");
const choices = await loadWorkbookFamilyChoices(db,"popul",true,null);
assert(choices.families.some(family=>family.key===fixture.familyKey&&family.kind==="bound_root"));
assert.equal(await approvedWorkbookFamily(db,fixture.familyKey),null,"Free-base-only callers must still exclude roots");
cell("Word family").value=option;
const chosen=await wb.xlsx.writeBuffer();fs.writeFileSync(`${dir}/popular-popul-reviewed.xlsx`,Buffer.from(chosen));
const resolve=async()=>await approvedWorkbookFamily(db,fixture.familyKey,true);
const parsed=await readReviewWorkbook(chosen as unknown as ArrayBuffer,skill,{decisions:[],resolve});
assert.equal(parsed.pendingFamilies.length,0);
const entry=prepareReviewedCsv(parsed.csv)[0];assert.equal(entry.error,null);const reviewed=entry.bundle!;
assert.equal(reviewed.analyses[0].parts[0].kind,"root");assert.equal(reviewed.analyses[0].parts[0].gloss,fixture.familyMeaning);
assert.equal(reviewed.analyses[0].familyKey,fixture.familyKey);assert.equal(reviewed.analyses[0].relationshipKind,"derived");
await assert.rejects(()=>readReviewWorkbook(chosen as unknown as ArrayBuffer,skill,{decisions:[],resolve:async()=>({...choices.families[0],kind:"free_base"})}),/choose an approved family/);
const imported=await db.rpc("import_reviewed_teaching_dictionary_word",{p_request_id:randomUUID(),p_word_id:reviewed.wordId,p_display_word:reviewed.displayWord,p_expected_reviewed_at:reviewed.sourceSenseReviewedAt||null,p_sense_set:reviewed.senseSet,p_analyses:reviewed.analyses,p_actor:actor,p_source_reference:"Disposable staging popular/popul bound-root workbook selection test"});assert.ifError(imported.error);
const [saved]=await loadReviewedMeaningBundles(db,[fixture.wordId]);assert.equal(saved.analyses[0].familyKey,fixture.familyKey);
const draft=await stageSchwaWorkbookDraft(db,actor,saved,skill,"review",fields);
const row=(await loadSchwaWorkbookQueue(db,skill,[fixture.wordId])).find(row=>row.id===draft)!;assert.deepEqual(row.blockers,[]);assert.equal(row.familyState,"waiting");
await publishSchwaWorkbookWord(db,actor,skill,draft);
const active=(await loadSchwaWorkbookQueue(db,skill,[fixture.wordId])).find(row=>row.id===draft)!;assert(active.published);
const report={passed:true,rootChoicesForAllTenSchwaWorkbooks:true,populListedInDownloadedWorkbook:true,rootTaskResolved:true,rootMeaningFilledAutomatically:true,wrongFamilyKindRejected:true,rootPartsAndMembershipSaved:true,coreWordPublished:true,optionalExploration:"waiting for root-entry requirements",productionChanges:0};
fs.writeFileSync(`${dir}/staging-proof.json`,JSON.stringify(report,null,2));console.log(report);
