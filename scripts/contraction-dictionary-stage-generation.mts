/** Generate real staging assignments through the learner preparation/persistence path. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';
import {createServiceRoleClient} from '../lib/supabase/service-role';
import {CONTRACTION_DICTIONARY_SKILLS} from '../lib/teaching-dictionary-manager/homophone-review-contract';
import {loadActiveCanonicalHomophoneContent} from '../lib/teaching-dictionary-manager/homophone-canonical-release';
import {prepareContextualHomophoneAssignment,persistContextualHomophoneAssignment} from '../lib/adle/homophone/convergence-readiness-loader';
import {validateFrozenConvergenceAssignment} from '../lib/adle/homophone/convergence-assignment';
import {fullHomophonePassage} from '../lib/adle/homophone/lesson';
import {fingerprintSnapshotValue} from '../lib/adle/composable-lesson/canonical-fingerprint';
import {getLondonPracticeDate} from '../lib/practice-date';
import type {LearningItemFact} from '../lib/adle/learning-items';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,'staging');
const actor=process.env.STAGING_ADMIN_USER_ID!;assert(actor);const db=createServiceRoleClient(),date=getLondonPracticeDate(),results=[];
for(const skill of CONTRACTION_DICTIONARY_SKILLS){
 const content=await loadActiveCanonicalHomophoneContent(db,skill);assert(content);
 const target="he'll";
 const set=content.sets.find(set=>set.members.some(member=>member.word===target));assert(set);
 const name=`Content QA ${target} ${date} ${fingerprintSnapshotValue(content).slice(0,8)}`;
 const prior=await db.from('children').select('id').eq('parent_user_id',actor).eq('first_name',name).eq('is_archived',false).maybeSingle();assert.ifError(prior.error);
 const created=prior.data?null:await db.from('children').insert({parent_user_id:actor,first_name:name}).select('id').single();assert.ifError(created?.error);const childId=prior.data?.id??created!.data!.id;
 const existing=await db.from('adle_learning_items').select('id,canonical_word_id,item_status,intake_on').eq('child_id',childId).eq('micro_skill_key',skill).eq('row_status','active');assert.ifError(existing.error);
 const queue:LearningItemFact[]=set.members.map(member=>({learningItemId:existing.data.find(row=>row.canonical_word_id===member.canonicalWordId)?.id??randomUUID(),canonicalWordId:member.canonicalWordId,childId,microSkillKey:skill,itemStatus:'pending',sourceKind:'verified_misspelling',sourceRef:`content-dictionary-release-qa:${childId}:${member.word}`,sourceAttemptText:null,reteachPriority:false,ejectedOn:null,intakeOn:date,rowStatus:'active'}));
 const missing=queue.filter(item=>!existing.data.some(row=>row.id===item.learningItemId));if(missing.length){const saved=await db.from('adle_learning_items').insert(missing.map(item=>({id:item.learningItemId,child_id:childId,canonical_word_id:item.canonicalWordId,micro_skill_key:skill,source_kind:item.sourceKind,source_ref:item.sourceRef,intake_on:date,item_status:'pending',row_status:'active'})));assert.ifError(saved.error);}
 const prepared=await prepareContextualHomophoneAssignment({client:db,parentUserId:actor,childId,date,microSkillKey:skill,learningItems:queue,wordStates:[],environmentKey:'staging'});assert.equal(prepared.status,'ready',JSON.stringify(prepared));if(prepared.status!=='ready')throw new Error('Staging generation blocked');
 assert(validateFrozenConvergenceAssignment(prepared.snapshot));const generated=prepared.snapshot.contextCheck.selectedSets.flatMap(set=>set.members);assert(generated.some(member=>member.word===target));
 for(const member of generated){const fact=content.dictionaryFacts!.find(fact=>fact.wordId===member.canonicalWordId);assert(fact);assert.equal(member.intendedSense,fact.sense.definition);assert.equal(member.grammaticalRole,fact.sense.partOfSpeech);assert.equal(member.teachingSentence,fact.sense.dictationSentence);assert(prepared.snapshot.guidedLesson.lesson.dictationPassages.some(p=>fullHomophonePassage(p).toLowerCase().includes(fact.sense.dictationSentence!.toLowerCase())));}
 const assignmentId=await persistContextualHomophoneAssignment({client:db,parentUserId:actor,childId,date,prepared});
 const session=await db.from('adle_today_session_orchestrations').upsert({daily_assignment_id:assignmentId,child_id:childId,parent_user_id:actor,assignment_date:date,major_stage:'specialist_lesson',review_generation_status:'not_required',specialist_generation_status:'ready',specialist_started_at:new Date().toISOString()},{onConflict:'daily_assignment_id',ignoreDuplicates:true});assert.ifError(session.error);
 const readback=await db.from('daily_assignments').select('compiled_lesson_snapshot').eq('id',assignmentId).single();assert.ifError(readback.error);assert.deepEqual(readback.data.compiled_lesson_snapshot,prepared.snapshot);
 results.push({skill,target,childId,assignmentId,date,words:generated.map(member=>({word:member.word,meaning:member.intendedSense,role:member.grammaticalRole,sentence:member.teachingSentence})),canonicalTargetsAndPractice:true});console.log(results.at(-1));
}
fs.writeFileSync('outputs/contraction-dictionary-release-20261121/staging-generation.json',JSON.stringify({stagingOnly:true,results},null,2));
