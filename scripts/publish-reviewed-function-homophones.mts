/** Explicit Function-word lesson publication using approved Dictionary projections.
 * plan validates the existing snapshots without writing; apply uses the normal CAS publisher. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServiceRoleClient} from '../lib/supabase/service-role';
import {FUNCTION_WORD_DICTIONARY_SKILLS} from '../lib/teaching-dictionary-manager/homophone-review-contract';
import {loadCanonicalHomophonePreview,loadActiveCanonicalHomophoneContent,homophoneCanonicalPublishingEnabled} from '../lib/teaching-dictionary-manager/homophone-canonical-release';
import {loadHomophoneBulkReview} from '../lib/teaching-dictionary-manager/homophone-bulk-review';
import {compileConvergenceAssignment,validateFrozenConvergenceAssignment} from '../lib/adle/homophone/convergence-assignment';
import {fullHomophonePassage} from '../lib/adle/homophone/lesson';
import {guidedSnapshotIssues} from '../lib/adle/homophone/guided-snapshot-validation';
const [environment,mode='plan']=process.argv.slice(2);
assert(['staging','production'].includes(environment));assert(['plan','apply'].includes(mode));
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,environment);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,environment==='production'?'https://wwohrqtunajrbwxyssjf.supabase.co':'https://qkpjbajicacbrphthibk.supabase.co');
const actor=environment==='staging'?process.env.STAGING_ADMIN_USER_ID:'a28d4885-8328-4853-ba11-6c676619b9ea';assert(actor);
const db=createServiceRoleClient(),results=[];
for(const skill of FUNCTION_WORD_DICTIONARY_SKILLS){
 assert(homophoneCanonicalPublishingEnabled(skill));
 const preview=await loadCanonicalHomophonePreview(db,skill);assert(preview.content,preview.blockers.join(' '));assert.deepEqual(preview.blockers,[]);
 let revision=preview.currentRevisionId;
 if(mode==='apply'){
  const saved=await db.rpc('publish_homophone_dictionary_v3',{p_environment:environment,p_content:preview.content,p_expected_head:preview.currentRevisionId,p_actor:actor});assert.ifError(saved.error);assert(saved.data);revision=saved.data;
  const retry=await db.rpc('publish_homophone_dictionary_v3',{p_environment:environment,p_content:preview.content,p_expected_head:preview.currentRevisionId,p_actor:actor});assert.ifError(retry.error);assert.equal(retry.data,revision);
 }
 const content=mode==='apply'?await loadActiveCanonicalHomophoneContent(db,skill):preview.content;assert(content);
 const generated=[];
 for(const set of content.sets){
  const snapshot=compileConvergenceAssignment({content,queuedItems:[{canonicalWordId:set.memberWordIds[0],status:'pending',intakeOn:'2026-11-21'}],masteredWordIds:new Set(),rotationIndex:0});assert(snapshot);assert(validateFrozenConvergenceAssignment(snapshot));assert.deepEqual(guidedSnapshotIssues(snapshot.guidedLesson,true),[]);assert(snapshot.selectedSetKeys.includes(set.setKey));
  for(const member of snapshot.contextCheck.selectedSets.flatMap(row=>row.members)){
   const fact=content.dictionaryFacts!.find(f=>f.wordId===member.canonicalWordId);assert(fact);assert.equal(member.intendedSense,fact.sense.definition);assert.equal(member.grammaticalRole,fact.sense.partOfSpeech);assert.equal(member.teachingSentence,fact.sense.dictationSentence);
   const teaching=snapshot.guidedLesson.lesson.teachingGroups!.flatMap(group=>group.words).find(word=>word.word===member.word);assert(teaching);assert.equal(teaching.definition,fact.sense.definition);assert(snapshot.guidedLesson.lesson.dictationPassages.some(p=>fullHomophonePassage(p).toLowerCase().includes(fact.sense.dictationSentence!.toLowerCase())));
  }
  generated.push({set:set.setKey,words:snapshot.contextCheck.selectedSets.flatMap(row=>row.members).map(m=>m.word)});
 }
 const review=await loadHomophoneBulkReview(db,skill);if(mode==='apply')assert.equal(review.rows.length,0,JSON.stringify(review.rows));
 results.push({skill,revision,words:content.dictionaryFacts!.map(f=>({wordId:f.wordId,definition:f.sense.definition,partOfSpeech:f.sense.partOfSpeech,sentence:f.sense.dictationSentence})),generated,remainingReviewWords:review.rows.map(r=>r.word)});
 console.log({environment,mode,skill,revision,setsVerified:generated.length,remainingReviewWords:review.rows.map(r=>r.word)});
}
assert(!homophoneCanonicalPublishingEnabled('D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE'),'Retained Word Lab stays on its existing route');
fs.mkdirSync('outputs/function-homophone-approval-20261121',{recursive:true});fs.writeFileSync(`outputs/function-homophone-approval-20261121/${environment}-${mode}.json`,JSON.stringify({environment,mode,canonicalTargetsAndPracticeVerified:true,results},null,2));
