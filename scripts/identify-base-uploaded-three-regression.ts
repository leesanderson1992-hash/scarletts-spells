import assert from 'node:assert/strict';
import {hasReviewedFamilyVariation} from '../lib/adle/spelling-family-connection';
import fixtures from './fixtures/identify-base-uploaded-three.json';
import {canonicalBaseWordAnalysis} from '../lib/adle/base-word-canonical-analysis';
import {projectReleasedBaseWordMorphology} from '../lib/adle/loaders/base-word-family-lesson-read-model';
import {baseWordCleaveModel,baseWordDefinitionBuild} from '../components/adle/morphology/base-word-definition-build';
import {compileBaseWordFamilyLessonSnapshot,validateBaseWordFamilyLessonSnapshot,type BaseWordFamilySnapshotWord} from '../lib/adle/morphology/base-word-family-payload';
for(const f of fixtures){
 const a=f.analysis,base=f.word==='twenty-one'?'one':f.word==='photograph'?'photo':'possible',part=a.parts.find(p=>p.sourceText===base)!;
 const input={displayWord:f.word,parts:a.parts,joins:a.joins,transformations:a.transformations,wordSum:a.wordSum,componentPartId:part.id,baseSource:base,relationshipKind:'derived'};
 assert(canonicalBaseWordAnalysis(input),f.word+' must accept its approved analysis');
 const projection=projectReleasedBaseWordMorphology(f.word,a.parts,a.joins,a.transformations,'regular');assert(projection);
 const make=(text:string,root:string):BaseWordFamilySnapshotWord=>({canonicalWordId:text,displayWord:text,wordSum:root+(text===root?'':` + ${text.slice(root.length)}`)+` → ${text}`,parts:[{id:'base',kind:'base',sourceText:root,surfaceText:root},...text===root?[]:[{id:'ending',kind:'suffix',sourceText:text.slice(root.length),surfaceText:text.slice(root.length)}]],joins:text===root?[]:[{afterPartId:'base',beforePartId:'ending',joinType:'none'}],transformations:[],transformationNotes:'',childFriendlyMeaning:'Reviewed meaning',dictationSentence:`The word is ${text}.`,dictationTargetTokenIndex:3,audioText:`The word is ${text}.`});
 const target={...make(f.word,base),...projection,wordSum:a.wordSum,teachingBasePartId:part.id,childFriendlyMeaning:f.meaning},support=make(base,base),clean=['clean','cleaned','cleaning','cleans'].map(w=>make(w,'clean')),all=[target,support,...clean];
 const payload=compileBaseWordFamilyLessonSnapshot({microSkillKey:'D4_MOR_BASE_WORDS_IDENTIFY_BASE',contentVersion:'uploaded-three-proof',pilotLessonNumber:1,authenticTargets:[{canonicalWordId:f.word,learningItemId:'target',sourceRef:'reviewed-fixture'},{canonicalWordId:'cleaned',learningItemId:'other',sourceRef:'reviewed-fixture'}],familySections:[{baseFamilyKey:base,baseWord:support,baseMeaning:'Reviewed meaning',etymologyRoute:{},authenticTargetWordIds:[f.word],guidedWords:[support,target]},{baseFamilyKey:'clean',baseWord:clean[0],baseMeaning:'Reviewed meaning',etymologyRoute:{},authenticTargetWordIds:['cleaned'],guidedWords:clean}],independentSlots:all.map(w=>({canonicalWordId:w.canonicalWordId,baseFamilyKey:w===target||w===support?base:'clean',provenance:w===target||w.displayWord==='cleaned'?'authentic_target':'transfer',learningItemId:w===target?'target':w.displayWord==='cleaned'?'other':null}))});
 assert(validateBaseWordFamilyLessonSnapshot(payload));assert.equal(payload.independentWords.length,6);
 const model=baseWordCleaveModel(target);assert.equal(model.wordParts[model.baseIndex].sourceText,base);
 const build=baseWordDefinitionBuild([target,...clean],0);assert.equal(build.expectedIds.length,a.parts.length);
 if(f.word==='twenty-one'){assert.deepEqual(model.components,['twenty-','one']);assert.deepEqual(model.boundaries,[7]);assert.deepEqual(build.joins,['hyphen']);assert.equal(baseWordCleaveModel({...target,teachingBasePartId:undefined}).baseIndex,-1);}
 if(f.word==='photograph')assert(build.tiles.some(t=>t.role==='root'&&t.text==='graph'));
 if(f.word==='possibility'){assert(!hasReviewedFamilyVariation(a.parts.map(p=>p.kind==='suffix'?{...p,sourceText:'ing',surfaceText:'ing'}:p),a.transformations));assert(!canonicalBaseWordAnalysis({...input,transformations:[]}));assert(!canonicalBaseWordAnalysis({...input,componentPartId:'unknown'}));assert.equal(projection.transformations[0].type,'reviewed_family_variation');}
}
console.log('PASS: three approved analyses compile full lessons; chosen compound base, hyphens, root tiles and reviewed le/il restoration are preserved');
