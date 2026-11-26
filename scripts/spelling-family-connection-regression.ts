import assert from 'node:assert/strict';
import { hasUsefulSpellingConnection } from '../lib/adle/spelling-family-connection';
import { canonicalBaseWordAnalysis } from '../lib/adle/base-word-canonical-analysis';
import { reviewedBaseWordRegularity } from '../lib/adle/base-word-regularity';
const parts = (sourceText: string, surfaceText: string, ending: string) => [
  {id:'base',kind:'base',sourceText,surfaceText,gloss:'Reviewed meaning',displayRange:{start:0,end:surfaceText.length}},
  {id:'suffix',kind:'suffix',sourceText:ending,surfaceText:ending,gloss:'More than one',displayRange:{start:surfaceText.length,end:surfaceText.length+ending.length}},
];
const changes=[{type:'change_final_fe_to_v',sourcePartId:'base',sourceText:'knife',surfaceText:'kniv',explanation:'Change final fe to v.'}];
assert(hasUsefulSpellingConnection(parts('child','child','ren'),[]));
assert(hasUsefulSpellingConnection(parts('knife','kniv','es'),changes));
assert(!hasUsefulSpellingConnection(parts('knife','kniv','es'),[]),'Unsaved spelling changes are not reviewed');
for(const [base,form] of [['be','are'],['go','went'],['lead','led'],['have','had']]) assert(!hasUsefulSpellingConnection(parts(base,form,''),[]));
assert(canonicalBaseWordAnalysis({displayWord:'knives',parts:parts('knife','kniv','es'),joins:[{afterPartId:'base',beforePartId:'suffix',joinType:'none'}],transformations:changes,wordSum:'knife + es → knives',componentPartId:'base',baseSource:'knife',relationshipKind:'irregular_inflection'}));
assert.equal(reviewedBaseWordRegularity({relationshipKind:'irregular_inflection',transformations:changes,parts:parts('knife','kniv','es'),reviewed:true}).status,'regular');
assert.equal(reviewedBaseWordRegularity({relationshipKind:'irregular_inflection',transformations:[],parts:parts('go','went',''),reviewed:true}).status,'irregular');
assert.equal(reviewedBaseWordRegularity({relationshipKind:'irregular_inflection',transformations:changes,parts:parts('knife','kniv','es'),reviewed:false}).status,'needs_review');
console.log('PASS: spelling-family reasoning admits reviewed retained bases and f/fe changes, while rejecting unrelated-looking grammatical forms');
