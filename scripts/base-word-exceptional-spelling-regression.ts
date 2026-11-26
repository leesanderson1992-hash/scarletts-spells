import assert from 'node:assert/strict';
import {canonicalBaseWordAnalysis} from '../lib/adle/base-word-canonical-analysis';
import {projectReleasedBaseWordMorphology} from '../lib/adle/loaders/base-word-family-lesson-read-model';
import {baseSpellingRestorationForPart} from '../lib/adle/morphology/base-word-family-payload';
const child={id:'part_1',kind:'base',sourceText:'child',surfaceText:'children',gloss:'A young person.',displayRange:{start:0,end:8}};
const change={type:'other_reviewed_change',sourcePartId:'part_1',sourceText:'child',surfaceText:'children',explanation:'Exceptional plural. Do not teach -ren as a general plural suffix.'};
const input={displayWord:'children',parts:[child],joins:[],transformations:[change],wordSum:'child → children',componentPartId:'part_1',baseSource:'child',relationshipKind:'irregular_inflection'};
assert(canonicalBaseWordAnalysis(input));
assert(!canonicalBaseWordAnalysis({...input,transformations:[]}));
const projected=projectReleasedBaseWordMorphology('children',[child],[],[change],'regular');assert(projected);
assert.equal(projected.parts.length,1,'Do not invent a general suffix or change approved parts');
assert.equal(baseSpellingRestorationForPart(child,projected.transformations)?.sourceText,'child');
for(const [sourceText,surfaceText] of [['be','are'],['go','went']]) assert(!canonicalBaseWordAnalysis({...input,displayWord:surfaceText,baseSource:sourceText,wordSum:`${sourceText} → ${surfaceText}`,parts:[{...child,sourceText,surfaceText,displayRange:{start:0,end:surfaceText.length}}],transformations:[{...change,sourceText,surfaceText}]}));
const knife={...child,sourceText:'knife',surfaceText:'kniv',displayRange:{start:0,end:4}};
const suffix={id:'part_2',kind:'suffix',sourceText:'es',surfaceText:'es',gloss:'More than one.',displayRange:{start:4,end:6}};
const knifeChange={...change,type:'change_final_fe_to_v',sourceText:'knife',surfaceText:'kniv',explanation:'Change final fe to v before es.'};
const knives=projectReleasedBaseWordMorphology('knives',[knife,suffix],[{afterPartId:'part_1',beforePartId:'part_2',joinType:'none'}],[knifeChange],'regular');assert(knives);
assert.equal(baseSpellingRestorationForPart(knife,knives.transformations)?.sourceText,'knife');
assert.equal(baseSpellingRestorationForPart({...knife,surfaceText:'knife'},knives.transformations),null);
console.log('PASS: actual children and knives analyses restore their approved bases without invented parts; unrelated grammatical forms stay excluded');

// Compile each real analysis in a complete six-word, two-family lesson.
import {compileBaseWordFamilyLessonSnapshot,validateBaseWordFamilyLessonSnapshot,type BaseWordFamilySnapshotWord} from '../lib/adle/morphology/base-word-family-payload';
import {baseWordDefinitionBuild} from '../components/adle/morphology/base-word-definition-build';
for (const [name,base,projection,sum] of [['children','child',projected,'child → children'],['knives','knife',knives,'knife + es → knives']] as const) {
 const word=(text:string,root:string):BaseWordFamilySnapshotWord=>{const ending=text.slice(root.length);return {canonicalWordId:text,displayWord:text,wordSum:ending?`${root} + ${ending} → ${text}`:`${root} → ${root}`,parts:[{id:'base',kind:'base',sourceText:root,surfaceText:root,gloss:'Reviewed base meaning'},...ending?[{id:'suffix',kind:'suffix',sourceText:ending,surfaceText:ending,gloss:'Reviewed ending'}]:[]],joins:ending?[{afterPartId:'base',beforePartId:'suffix',joinType:'none'}]:[],transformations:[],transformationNotes:'',childFriendlyMeaning:'Reviewed word meaning',dictationSentence:`The word is ${text}.`,dictationTargetTokenIndex:3,audioText:`The word is ${text}.`};};
 const exceptional={...word(name,base),...projection,wordSum:sum,transformationNotes:projection.transformations.map(t=>t.explanation).join(' ')};
 const support=word(base,base),regular=['clean','cleaned','cleaning','cleans'].map(w=>word(w,'clean'));
 const all=[support,exceptional,...regular];
 const payload=compileBaseWordFamilyLessonSnapshot({microSkillKey:'D4_MOR_BASE_WORDS_IDENTIFY_BASE',contentVersion:'exceptional-spelling-proof',pilotLessonNumber:1,
  authenticTargets:[{canonicalWordId:name,learningItemId:'target-exception',sourceRef:'fixture'},{canonicalWordId:'cleaned',learningItemId:'target-regular',sourceRef:'fixture'}],
  familySections:[{baseFamilyKey:base,baseWord:support,baseMeaning:'Reviewed base meaning',etymologyRoute:{},authenticTargetWordIds:[name],guidedWords:[support,exceptional]},
   {baseFamilyKey:'clean',baseWord:regular[0],baseMeaning:'Reviewed base meaning',etymologyRoute:{},authenticTargetWordIds:['cleaned'],guidedWords:regular}],
  independentSlots:all.map(w=>({canonicalWordId:w.canonicalWordId,baseFamilyKey:[name,base].includes(w.displayWord)?base:'clean',provenance:w.displayWord===name||w.displayWord==='cleaned'?'authentic_target':'transfer',learningItemId:w.displayWord===name?'target-exception':w.displayWord==='cleaned'?'target-regular':null}))});
 assert(validateBaseWordFamilyLessonSnapshot(payload));assert.equal(payload.independentWords.length,6);
 const build=baseWordDefinitionBuild([exceptional,...regular],0);assert.deepEqual(build.tiles.filter(t=>build.expectedIds.includes(t.id)).map(t=>t.text).sort(),projection.parts.map(p=>(p as {surfaceText:string}).surfaceText).sort());
 assert.equal(payload.independentWords.find(w=>w.displayWord===name)!.transformations[0].sourceText,base);
}
console.log('PASS: children and knives each compile into a complete six-word lesson with approved base-restoration instructions and valid build tiles');
