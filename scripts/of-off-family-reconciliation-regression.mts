/** Real reviewed fixture words on staging; every reconciliation/link test rolls back. */
import assert from 'node:assert/strict';import pg from 'pg';import fs from 'node:fs';import {randomUUID} from 'node:crypto';
assert(process.env.SUPABASE_STAGING_DB_URL?.includes('qkpjbajicacbrphthibk'));const db=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL});await db.connect();
const actor=process.env.STAGING_ADMIN_USER_ID,source='Disposable legacy family reconciliation regression';
const readMembers=async(key:string,revision:number)=>(await db.query("select to_jsonb(m)-'revision' record from canonical_teaching_dictionary_lexical_base_family_members m where family_key=$1 and revision=$2 order by canonical_word_id,word_part_of_speech",[key,revision])).rows;
const readHeads=async()=>(await db.query('select * from adle_route_activation_heads order by environment_key,route_id,route_version,micro_skill_key')).rows;
try{await db.query('begin');const heads=await readHeads();const result=[];
for(const [word,pos]of [['of','preposition'],['off','adverb']]){
 const key=word+'_function_word_base_family';let family=(await db.query('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[key])).rows[0];
 if(family.base_part_of_speech!=='function_word'){
  // Reproduce the historical shape as a new, uncommitted fixture revision.
  // Approved history is never modified, and the whole test rolls back.
  const legacyRevision=family.revision+1;
  await db.query("insert into canonical_teaching_dictionary_lexical_base_families(family_key,revision,base_lemma,base_part_of_speech,base_kind,canonical_base_word_id,base_meaning,source_reference,review_status) values($1,$2,$3,'function_word','free_base',$4,$5,$6,'draft')",[key,legacyRevision,family.base_lemma,family.canonical_base_word_id,family.base_meaning,source]);
  await db.query(`insert into canonical_teaching_dictionary_lexical_base_family_members(family_key,revision,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference)
   select family_key,$2,canonical_word_id,word_part_of_speech,relationship_kind,canonical_morphology_id,word_sum,morphology_parts,morphology_joins,morphology_transformations,intended_meaning,source_reference from canonical_teaching_dictionary_lexical_base_family_members where family_key=$1 and revision=$3`,[key,legacyRevision,family.revision]);
  await db.query('select approve_canonical_lexical_base_family($1,$2,$3,$4)',[key,legacyRevision,actor,source]);
  family=(await db.query('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 and revision=$2',[key,legacyRevision])).rows[0];
 }
 assert.equal(family.base_part_of_speech,'function_word');
 const approved=(await db.query('select *,reviewed_at::text precise_reviewed_at from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1',[family.canonical_base_word_id])).rows[0];const sense=approved.sense_set.senses[0];assert.equal(sense.partOfSpeech,pos);
 const morphology=(await db.query('select * from teaching_dictionary_current_sense_morphology where canonical_word_id=$1 and sense_id=$2',[family.canonical_base_word_id,sense.id])).rows[0];assert(morphology);
 const members=await readMembers(key,family.revision);const historical=(await db.query('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision',[key])).rows;
 const link=()=>db.query('select review_teaching_dictionary_sense_family_membership($1,$2,$3,$4,$5,$6,\'free_base\',\'approve\',$7,$8)',[randomUUID(),family.canonical_base_word_id,sense.id,morphology.id,key,morphology.morphology_parts[0].id,actor,source]);
 await db.query('savepoint automatic');await link();const automatic=(await db.query('select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and family_key=$2',[family.canonical_base_word_id,key])).rows[0];assert(automatic);assert.equal(automatic.current_family_revision,family.revision+1);assert.deepEqual(await readMembers(key,automatic.current_family_revision),members);await db.query('rollback to savepoint automatic');
 const reconcile=()=>db.query('select reconcile_legacy_function_word_family($1,$2,$3,$4,$5,$6) revision',[key,family.revision,sense.id,approved.precise_reviewed_at,actor,source]);
 await db.query('savepoint ambiguous');await db.query("update teaching_dictionary_reviewed_sense_sets set sense_set=jsonb_set(sense_set,'{senses}',(sense_set->'senses')||$2::jsonb) where canonical_word_id=$1",[family.canonical_base_word_id,JSON.stringify([{...sense,id:sense.id+'-other',definition:'A different reviewed sense'}])]);await assert.rejects(link,/SINGLE_SENSE_REQUIRED/);await db.query('rollback to savepoint ambiguous');
 const revision=(await reconcile()).rows[0].revision;assert.equal(revision,family.revision+1);assert.equal((await reconcile()).rows[0].revision,revision);
 assert.deepEqual(await readMembers(key,revision),members);assert.deepEqual((await db.query('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 and revision<=$2 order by revision',[key,family.revision])).rows,historical);
 await link();const linked=(await db.query('select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and sense_id=$2 and family_key=$3',[family.canonical_base_word_id,sense.id,key])).rows[0];assert(linked);assert.equal(linked.base_meaning,sense.definition);
 await db.query('savepoint wrong_sense');
 const other={...sense,id:sense.id+'-different',definition:'Different sense with the same part of speech'};
 await db.query("update teaching_dictionary_reviewed_sense_sets set sense_set=jsonb_set(sense_set,'{senses}',(sense_set->'senses')||$2::jsonb) where canonical_word_id=$1",[family.canonical_base_word_id,JSON.stringify([other])]);
 const otherMorph=(await db.query("select approve_teaching_dictionary_word_parts($1,$2,$3,$4,'[]','[]',$5,$6) id",[randomUUID(),family.canonical_base_word_id,other.id,JSON.stringify(morphology.morphology_parts),morphology.word_sum,actor])).rows[0].id;
 await assert.rejects(()=>db.query("select review_teaching_dictionary_sense_family_membership($1,$2,$3,$4,$5,$6,'free_base','approve',$7,$8)",[randomUUID(),family.canonical_base_word_id,other.id,otherMorph,key,morphology.morphology_parts[0].id,actor,source]),/SENSE_FAMILY_ANCHOR_MISMATCH/);await db.query('rollback to savepoint wrong_sense');
 assert.deepEqual((await db.query('select *,reviewed_at::text precise_reviewed_at from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1',[family.canonical_base_word_id])).rows[0],approved);
 result.push({word,partOfSpeech:pos,automaticReconciliationPassed:true,familyKeyPreserved:true,membersPreserved:members.length,historyPreserved:true,reviewedMeaningInherited:true,linkPassed:true,ambiguousAnchorBlocked:true,wrongSenseBlocked:true,retrySafe:true});
}
assert.deepEqual(await readHeads(),heads);await db.query('rollback');fs.mkdirSync('outputs/legacy-family-audit-20261120',{recursive:true});fs.writeFileSync('outputs/legacy-family-audit-20261120/regression.json',JSON.stringify({stagingOnly:true,allTestMutationsRolledBack:true,lessonHeadsUnchanged:true,results:result},null,2));console.log(result);
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
