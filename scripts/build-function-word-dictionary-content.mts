/** Reuse reviewed Word Lab activities for the three Dictionary route migrations.
 * Explicit replacements keep practice on the selected meaning and implement the
 * owner's where / we're / wear correction. Original releases remain untouched. */
import fs from 'node:fs';import {createHash} from 'node:crypto';
import legacy from '../data/adle/candidates/d4-hom/v4/lessons.json';
import manifest from '../data/adle/homophone/convergence-v1/manifest.json';
import cheats from '../data/adle/homophone/convergence-v1/approved-cheat-codes.json';
import {parseCsv} from './lib/deterministic-csv';
const dir='data/adle/homophone/convergence-v1';
const rows=parseCsv(fs.readFileSync(`${dir}/contrast-set-review.csv`,'utf8')).rows;
const keys=['THERE_THEIR_THEYRE','TO_TOO_TWO','WERE_WHERE_WEAR'].map(k=>'D4_HOM_FUNCTION_WORD_HOMOPHONES_'+k);
const lessons=[];const wordPages=[];
for(const key of keys){
 const old=legacy.lessons.find(l=>l.microSkillKey===key)!;
 const spec=manifest.skills.find(s=>s.key===key)!;
 const setKey=spec.sets[0].setKey;
 let members=rows.filter(r=>r.micro_skill_key===key).sort((a,b)=>Number(a.member_ordinal)-Number(b.member_ordinal))
  .map(r=>({word:r.word,intendedSense:r.intended_sense,grammaticalRole:r.grammatical_role,teachingSentence:r.target_sentence}));
 if(key.endsWith('WERE_WHERE_WEAR'))members=[members.find(m=>m.word==='where')!,
  {word:"we're",intendedSense:'we are',grammaticalRole:'contraction',teachingSentence:"We're going to the library now."},members.find(m=>m.word==='wear')!];
 const wereExamples=["We're ready for the trip.","We're going to school together.","We're baking cakes for the fair.","We're both tired after swimming.","We're opening the doors for visitors.","We're excited about the school play.","We're feeling brave before the show.","We're early for the school concert.","We're waiting beside the school gate."];
 const tooExamples=['My little brother came too.','I would like a turn too.','The teacher joined the game too.','My sister likes that book too.','Please bring a pencil too.'];
 let wereIndex=0,tooIndex=0,thereIndex=0;
 const prompts=[...old.binSort,...old.balloonPrompts].map((p,index)=>{
  let word=p.answer,sentence=p.sentence.replace('____',word);
  if(word==='were'){word="we're";sentence=wereExamples[wereIndex++];}
  if(key.endsWith('TO_TOO_TWO')){
   if(word==='too'&&/heavy|hot|noisy|big/.test(sentence))sentence=tooExamples[tooIndex++];
   if(word==='to'&&sentence==='I need to sleep.')sentence='I walked to the park.';
  }
  if(key.endsWith('THERE_THEIR_THEYRE')&&word==='there'&&/^there (is|are)/i.test(sentence))
   sentence=['A spider is hiding there.','The spider is sitting there.','We left two biscuits there.'][thereIndex++];
  return {id:`${setKey}:REVIEWED:S${index+1}`,word,sentence,intendedSense:members.find(m=>m.word===word)!.intendedSense};
 });
 const choiceQuestions=members.map(m=>{
  const prompt=prompts.find(p=>p.word===m.word&&p.sentence.split(/\s+/).length>=4&&p.sentence!==m.teachingSentence)!;
  const escaped=m.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return {id:`${setKey}:DICTIONARY:${m.word}`,word:m.word,sentenceWithBlank:prompt.sentence.replace(new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`,'i'),'____')};
 });
 const passages=members.map((m,index)=>({id:`${setKey}:REVIEWED:P${index+1}`,firstWord:m.word,firstSentence:m.teachingSentence,
  secondWord:members[(index+1)%members.length].word,secondSentence:members[(index+1)%members.length].teachingSentence}));
 lessons.push({microSkillKey:key,teachingExplanation:`Choose the spelling that matches the meaning: ${members.map(m=>`${m.word} (${m.intendedSense})`).join('; ')}.`,
  commonMisconception:'Choosing by sound without checking the meaning in the sentence.',sets:[{setKey,relationKind:'homophone',members,shortSentences:prompts,passages,choiceQuestions}]});
 for(const m of members){
  const original=old.words.find(w=>w.word===m.word);const contraction=cheats.wordPages.find(w=>w.word===m.word);
  let cheatCode=original?.memoryCue??contraction?.cheatCode;
  if(m.word==='to')cheatCode='TO points towards a place or person: go TO school. One O.';
  if(m.word==='too')cheatCode='TOO means ALSO: I am coming TOO. The extra O helps you remember another person joining in.';
  if(!cheatCode)throw new Error(`Missing reviewed memory cue for ${m.word}`);
  const diagram=["we're","they're"].includes(m.word)?`/adle/homophones/function-word-v1/${m.word.replace("'",'-')}.svg`:null;
  wordPages.push({setKey,word:m.word,cheatCode,imageDescription:diagram?`${m.word==="we're"?'We':'They'} are contracts to ${m.word}; the apostrophe replaces a.`:original?.imageBrief??contraction?.imageDescription??'',imageSrc:diagram??original?.imageSrc??null});
 }
}
const body={schemaVersion:1,contentVersion:'function-word-dictionary-2026-11-21-v1',approvalReference:'Owner authorised Function-word homophone review and chose where/we\'re/wear in Codex, 2026-11-21',
 sourceReference:'Reviewed d4-hom/v4 activities and convergence contrast-set review; explicit sense-aligned practice replacements and owner-corrected roster',lessons,wordPages};
fs.writeFileSync(`${dir}/function-word-dictionary-content.json`,JSON.stringify({...body,sourceSha256:createHash('sha256').update(JSON.stringify(body)).digest('hex')},null,2)+'\n');
console.log({lessons:lessons.length,words:wordPages.length});
