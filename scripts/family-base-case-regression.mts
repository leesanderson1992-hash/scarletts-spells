import assert from 'node:assert/strict';
import {loadWorkbookFamilyChoices} from '../lib/teaching-dictionary-manager/workbook-family-resolution';
const part={id:'part_1',kind:'base',sourceText:'December',surfaceText:'December',gloss:'The twelfth month of the year.',displayRange:{start:0,end:8}};
function client(sourceText='December'){
 return {from(table:string){
  const data=table==='canonical_teaching_dictionary_words'?{id:'december',display_word:'December'}:
   table==='teaching_dictionary_reviewed_sense_sets'?{sense_set:{senses:[{id:'review',definition:part.gloss,partOfSpeech:'noun'}]}}:
   table==='teaching_dictionary_current_sense_morphology'?[{sense_id:'review',morphology_parts:[{...part,sourceText}]}]:[];
  const result={data,error:null};
  const promise=Promise.resolve(result);
  const query={select(){return query;},eq(){return query;},order(){return query;},maybeSingle(){return promise;},then:promise.then.bind(promise)};return query;
 }};
}
const matches=await loadWorkbookFamilyChoices(client() as never,'december',false,null);
assert.equal(matches.bases.length,1);assert.equal(matches.bases[0].senseId,'review');
assert.equal((await loadWorkbookFamilyChoices(client('december') as never,'december',false,null)).bases.length,1);
assert.equal((await loadWorkbookFamilyChoices(client('decide') as never,'december',false,null)).bases.length,0);
assert.equal(part.sourceText,'December');assert.equal(part.surfaceText,'December');
console.log({passed:true,capitalisedAndLowercaseBasesMatched:true,differentBasesExcluded:true,reviewedSpellingPreserved:true});
