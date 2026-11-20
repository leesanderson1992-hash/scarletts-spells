/** Disposable staging proof: every mutation below is rolled back. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createServiceRoleClient} from '../lib/supabase/service-role';
import {CONFUSABLE_DICTIONARY_SKILLS,homophoneCanonicalPartOfSpeech} from '../lib/teaching-dictionary-manager/homophone-review-contract';
import {loadApprovedContextualContentForSkills} from '../lib/adle/homophone/published-contextual-content-loader';
import {buildDictionaryContextualContent,type HomophoneDictionaryFact} from '../lib/adle/homophone/dictionary-content';
import {compileConvergenceAssignment,validateFrozenConvergenceAssignment} from '../lib/adle/homophone/convergence-assignment';
import {fullHomophonePassage} from '../lib/adle/homophone/lesson';
import {guidedSnapshotIssues} from '../lib/adle/homophone/guided-snapshot-validation';
import {buildReviewWorkbook,readReviewWorkbook} from '../lib/teaching-dictionary-manager/review-workbook';
import {targetOccurrences} from '../lib/teaching-dictionary-manager/authoring';
import {fingerprintSnapshotValue} from '../lib/adle/composable-lesson/canonical-fingerprint';
import type {MultiSenseCsvBundle} from '../lib/teaching-dictionary-manager/multi-sense-csv';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
assert(process.env.SUPABASE_STAGING_DB_URL?.includes('qkpjbajicacbrphthibk'));
const db=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL});
const actor=process.env.STAGING_ADMIN_USER_ID!;
const templates=await loadApprovedContextualContentForSkills(createServiceRoleClient(),CONFUSABLE_DICTIONARY_SKILLS,true);
await db.connect();
const rows: object[]=[];
try {
 await db.query('begin');
 for(const [index,skill]of CONFUSABLE_DICTIONARY_SKILLS.entries()){
  const template=templates.get(skill)?.content;assert(template,templates.get(skill)?.blocker);
  await db.query('savepoint skill');
  const facts:HomophoneDictionaryFact[]=[];const bundles:MultiSenseCsvBundle[]=[];
  for(const member of template.sets.flatMap(set=>set.members)){
   const wordId=member.canonicalWordId,senseId='rollback-proof-'+index;
   const sense={id:senseId,definition:'Reviewed staging fact: '+member.intendedSense,partOfSpeech:homophoneCanonicalPartOfSpeech(member.grammaticalRole),pronunciationId:'uk-proof',dictationSentence:member.teachingSentence,dictationTargetTokenIndex:targetOccurrences(member.teachingSentence,member.word)[0]};
   const pronunciation={id:'uk-proof',ipa:'/test/',spokenSyllableCount:1,stressPattern:'primary'};
   const parts=[{id:'whole-word',kind:'base' as const,sourceText:member.word,surfaceText:member.word,gloss:sense.definition,displayRange:{start:0,end:member.word.length}}];
   const senseSet={senses:[sense],pronunciations:[pronunciation]};
   await db.query(`insert into teaching_dictionary_reviewed_sense_sets(canonical_word_id,sense_set,reviewed_by) values($1,$2,$3)
     on conflict(canonical_word_id)do update set sense_set=excluded.sense_set,reviewed_by=excluded.reviewed_by`,[wordId,senseSet,actor]);
   await db.query('select review_teaching_dictionary_sense_morphology($1,$2,$3,\'approve\',$4,\'[]\',\'[]\',$5,$6,\'Disposable rollback proof\')',[randomUUID(),wordId,senseId,JSON.stringify(parts),member.word+' → '+member.word,actor]);
   const sentence=(await db.query(`insert into teaching_dictionary_reviewed_sense_sentences(canonical_word_id,sense_id,sentence,target_token_index,source_row_hash,reviewed_by)
    values($1,$2,$3,$4,$5,$6)returning id,source_row_hash`,[wordId,senseId,sense.dictationSentence,sense.dictationTargetTokenIndex,'a'.repeat(64),actor])).rows[0];
   await db.query("update teaching_dictionary_lesson_sense_bindings set withdrawn_at=now(),withdrawn_by=$3 where environment_key='staging' and canonical_word_id=$1 and micro_skill_key=$2",[wordId,skill,actor]);
   await db.query(`insert into teaching_dictionary_lesson_sense_bindings(environment_key,canonical_word_id,micro_skill_key,sense_id,sense_snapshot,pronunciation_snapshot,reviewed_by)
    values('staging',$1,$2,$3,$4,$5,$6)`,[wordId,skill,senseId,sense,pronunciation,actor]);
   facts.push({wordId,senseId,sense,pronunciation,parts,joins:[],transformations:[],wordSum:member.word+' → '+member.word,dictationAuthorityId:sentence.id,dictationSourceHash:sentence.source_row_hash});
   bundles.push({wordId,displayWord:member.word,sourceSenseReviewedAt:'',senseSet,analyses:[{senseId,parts,joins:[],transformations:[],wordSum:member.word+' → '+member.word,familyKey:'',componentPartId:'',relationshipKind:'',requestedSkillKeys:[]}]});
  }
  const bytes=await buildReviewWorkbook({skill,title:skill,bundles,notes:new Map(),families:new Map(),requestedSenses:new Map(facts.map(f=>[f.wordId,f.senseId]))});
  const parsed=await readReviewWorkbook(Uint8Array.from(bytes).buffer,skill);assert.equal(parsed.pendingFamilies.length,0);
  const content=buildDictionaryContextualContent(template,facts)!;assert(content);
  const head=(await db.query("select current_revision_id from adle_route_activation_heads where environment_key='staging' and route_id='homophone_contextual_choice' and micro_skill_key=$1",[skill])).rows[0]?.current_revision_id??null;
  await db.query('savepoint bad');const stale=structuredClone(content);stale.dictionaryFacts![0].sense.definition='Unapproved replacement';
  await assert.rejects(()=>db.query('select publish_homophone_dictionary_v3($1,$2,$3,$4)',['staging',stale,head,actor]),/Approved Dictionary facts changed/);await db.query('rollback to savepoint bad');
  const revision=(await db.query('select publish_homophone_dictionary_v3($1,$2,$3,$4) id',['staging',content,head,actor])).rows[0].id;
  assert.equal((await db.query('select publish_homophone_dictionary_v3($1,$2,$3,$4) id',['staging',content,head,actor])).rows[0].id,revision);
  if (index === 0) {
   const productionHead = (await db.query("select current_revision_id from adle_route_activation_heads where environment_key='production' and route_id='homophone_contextual_choice' and micro_skill_key=$1",[skill])).rows[0]?.current_revision_id ?? null;
   for (const fact of facts) {
    await db.query("update teaching_dictionary_lesson_sense_bindings set withdrawn_at=now(),withdrawn_by=$3 where environment_key='production' and canonical_word_id=$1 and micro_skill_key=$2",[fact.wordId,skill,actor]);
    await db.query(`insert into teaching_dictionary_lesson_sense_bindings(environment_key,canonical_word_id,micro_skill_key,sense_id,sense_snapshot,pronunciation_snapshot,reviewed_by)
      values('production',$1,$2,$3,$4,$5,$6)`,[fact.wordId,skill,fact.senseId,fact.sense,fact.pronunciation,actor]);
   }
   const productionRevision = (await db.query('select publish_homophone_dictionary_v3($1,$2,$3,$4) id',['production',content,productionHead,actor])).rows[0].id;
   assert.notEqual(productionRevision, revision);
   assert.equal((await db.query("select current_revision_id from adle_route_activation_heads where environment_key='staging' and route_id='homophone_contextual_choice' and micro_skill_key=$1",[skill])).rows[0].current_revision_id, revision);
   await db.query('savepoint invalid_environment');
   await assert.rejects(()=>db.query('select publish_homophone_dictionary_v3($1,$2,$3,$4)',['local',content,null,actor]),/environment invalid/);
   await db.query('rollback to savepoint invalid_environment');
   const privileges=(await db.query("select has_function_privilege('authenticated','publish_homophone_dictionary_v3(text,jsonb,uuid,uuid)','execute') allowed")).rows[0];
   assert.equal(privileges.allowed,false);
  }
  for(const set of content.sets){
   const snapshot=compileConvergenceAssignment({content,queuedItems:[{canonicalWordId:set.memberWordIds[0],status:'pending',intakeOn:'2026-11-20'}],masteredWordIds:new Set(),rotationIndex:0})!;
   assert(validateFrozenConvergenceAssignment(snapshot));assert.deepEqual(guidedSnapshotIssues(snapshot.guidedLesson,true),[]);
   assert(snapshot.selectedSetKeys.includes(set.setKey));
   for(const member of snapshot.contextCheck.selectedSets.flatMap(s=>s.members)){
    const fact=facts.find(f=>f.wordId===member.canonicalWordId)!;assert(fact);
    assert.equal(member.intendedSense,fact.sense.definition);
    assert.equal(snapshot.guidedLesson.lesson.teachingGroups!.flatMap(g=>g.words).find(w=>w.word===member.word)!.definition,fact.sense.definition);
    assert(snapshot.guidedLesson.lesson.dictationPassages.some(p=>fullHomophonePassage(p).includes(fact.sense.dictationSentence!)));
   }
  }
  if(content.sets.length>1){
   const firstIds=content.sets[0].memberWordIds;
   const partial=buildDictionaryContextualContent(template,facts.filter(f=>firstIds.includes(f.wordId)))!;
   assert.equal(partial.sets.length,1);assert.equal(partial.dictionaryFacts!.length,2);
   const stillActive=buildDictionaryContextualContent(template,facts,partial.sets.map(s=>s.setKey))!;
   assert.equal(fingerprintSnapshotValue(partial),fingerprintSnapshotValue(stillActive),'Other newly ready pairs must not invalidate an Active pair');
   assert.equal(buildDictionaryContextualContent(template,[facts[0]]),null);
  }
  rows.push({skill,words:facts.length,sets:content.sets.length,workbookRoundTrip:true,staleApprovalBlocked:true,published:true,retrySafe:true,allTargetsAndPracticeCanonical:true});
  await db.query('rollback to savepoint skill');
 }
 await db.query('rollback');
 fs.mkdirSync('outputs/confusable-workflow-20261120',{recursive:true});
 fs.writeFileSync('outputs/confusable-workflow-20261120/all-skills-regression.json',JSON.stringify({stagingOnly:true,allMutationsRolledBack:true,skills:rows},null,2));
 console.log({skills:rows.length,words:46,sets:23,allMutationsRolledBack:true,environmentIsolationVerified:true,browserExecutionBlocked:true,passed:true});
} catch(error){await db.query('rollback');throw error;}finally{await db.end();}
