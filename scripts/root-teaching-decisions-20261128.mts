/** Owner-authorised editorial correction. Dry-run by default; staging first. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv}from'node:util';import {createHash}from'node:crypto';import pg from'pg';
const production=process.argv.includes('--production'),apply=process.argv.includes('--apply');
const env=parseEnv(fs.readFileSync(production?'.env.local':'.env.staging.local','utf8'));
const environment=production?'production':'staging';const conn=production?env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED:env.SUPABASE_STAGING_DB_URL;
assert(conn.includes(production?'wwohrqtunajrbwxyssjf':'qkpjbajicacbrphthibk'));
const actor=production?'a28d4885-8328-4853-ba11-6c676619b9ea':env.STAGING_ADMIN_USER_ID;
const ref='Owner teaching decision 2026-11-28: affect/effect remain bases; combust is a free base, combustion = combust + ion. https://dictionary.cambridge.org/dictionary/english/combust';
const request=(word:string)=>{const h=createHash('sha256').update(environment+':root-base-owner-decision:2026-11-28:'+word).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const d=new pg.Client({connectionString:conn,ssl:{rejectUnauthorized:false}});await d.connect();
const q=async(sql:string,p:unknown[]=[]) =>(await d.query(sql,p)).rows;
try{await q('begin');await q("set local statement_timeout='20s'");await q('set local jit=off');
 const words=await q("select id,normalised_word from canonical_teaching_dictionary_words where normalised_word=any($1) and row_status='active' and dialect_code='en-GB'",[['affect','effect','combust','combustion','invisible']]);
 const id=(word:string)=>{const match=words.filter(r=>r.normalised_word===word);assert.equal(match.length,1);return match[0].id as string;};
 const invisibleBefore=await q("select to_jsonb(s) data from teaching_dictionary_reviewed_sense_sets s where canonical_word_id=$1",[id('invisible')]);
 const beforeHead=await q("select current_revision_id from adle_route_activation_heads where environment_key=$1 and route_id='latin_root_word_lab' and micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS'",[environment]);
 const oldFamily='combust_bound_root_base_family';const existing=await q('select canonical_family_key from teaching_dictionary_lexical_family_successions where old_family_key=$1',[oldFamily]);
 let familyKey=existing[0]?.canonical_family_key;
 if(!familyKey){
  for(const word of ['combust','combustion']){
   const current=(await q('select sense_set,reviewed_at::text reviewed_at from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1',[id(word)]))[0];
   const senseId=word==='combust'?'root':current?.sense_set?.senses?.[0]?.id??'review';
   assert(!current||current.sense_set.senses.length===1,'Review additional meanings separately');
   const definition=word==='combust'?'To burn.':'The process of burning a substance, releasing heat and usually light.';
   const sentence=word==='combust'?'Dry wood can combust when it gets hot enough.':'Combustion releases heat as the fuel burns.';
   const set={senses:[{id:senseId,definition,partOfSpeech:word==='combust'?'verb':'noun',pronunciationId:'british-burn',dictationSentence:sentence,dictationTargetTokenIndex:word==='combust'?3:0}],pronunciations:[{id:'british-burn',ipa:word==='combust'?'/kəmˈbʌst/':'/kəmˈbʌs.tʃən/',spokenSyllableCount:word==='combust'?2:3,stressPattern:word==='combust'?'unstressed-primary':'unstressed-primary-unstressed'}]};
   const parts=[{id:'base',kind:'base',sourceText:'combust',surfaceText:'combust',gloss:'To burn.',displayRange:{start:0,end:7}},...(word==='combustion'?[{id:'suffix',kind:'suffix',sourceText:'ion',surfaceText:'ion',gloss:'action or process',displayRange:{start:7,end:10}}]:[])];
   const analysis={senseId,parts,joins:word==='combustion'?[{afterPartId:'base',beforePartId:'suffix',joinType:'none'}]:[],transformations:[],wordSum:word==='combust'?'combust → combust':'combust + ion → combustion',requestedSkillKeys:[]};
   await q('select review_teaching_dictionary_multi_sense_csv($1,$2,$3,$4,$5,$6,$7)',[request(word),id(word),current?.reviewed_at??'',set,JSON.stringify([analysis]),actor,ref]);
  }
  const old=(await q('select max(revision)::int revision from canonical_teaching_dictionary_lexical_base_families where family_key=$1',[oldFamily]))[0];
  familyKey=(await q("select create_reviewed_free_base_family_from_sense($1,$2,'root',$3,$4,'base','derived',$5,$6) key",[request('family'),id('combust'),id('combustion'),(await q('select sense_set#>>\'{senses,0,id}\' sense from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1',[id('combustion')]))[0].sense,actor,ref]))[0].key;
  // The old root-family facts stay immutable. A reviewed successor supplies the
  // renamed free-base family for all new canonical reads.
  await q('savepoint reject_implicit_reclassification');let rejected=false;
  try{await q("insert into teaching_dictionary_lexical_family_successions(old_family_key,old_revision,canonical_family_key,canonical_revision,canonical_base_word_id,canonical_base_sense_id,reviewed_by,source_reference) values($1,$2,$3,1,$4,'root',$5,$6)",[oldFamily,old.revision,familyKey,id('combust'),actor,ref]);}catch{rejected=true;}
  await q('rollback to savepoint reject_implicit_reclassification');assert(rejected,'Cross-kind succession must require an explicit reviewed reason');
  await q("insert into teaching_dictionary_lexical_family_successions(old_family_key,old_revision,canonical_family_key,canonical_revision,canonical_base_word_id,canonical_base_sense_id,reviewed_by,source_reference,reclassification_reason) values($1,$2,$3,1,$4,'root',$5,$6,$6)",[oldFamily,old.revision,familyKey,id('combust'),actor,ref]);
 }
 for(const word of ['affect','effect','combustion']){
  await q("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values($1,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS',$2,'deassign',$3,$4) on conflict do nothing",[environment,id(word),actor,request('exclude-'+word)]);
  await q("insert into teaching_dictionary_bulk_review_exclusions(environment_key,micro_skill_key,canonical_word_id,reviewed_by) values($1,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS',$2,$3) on conflict do nothing",[environment,id(word),actor]);
 }
 const family=(await q('select * from teaching_dictionary_families_with_current_meaning where family_key=$1 and is_current_family order by revision desc limit 1',[familyKey]))[0];assert.equal(family.base_kind,'free_base');assert.equal(family.base_part_of_speech,'verb');
 assert.equal((await q("select count(*)::int n from teaching_dictionary_root_skill_families where family_key=$1",[oldFamily]))[0].n,0);
 const member=(await q('select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and family_key=$2',[id('combustion'),familyKey]))[0];assert.equal(member.relationship_kind,'derived');
 assert.equal((await q('select word_sum from teaching_dictionary_current_sense_morphology where id=$1',[member.sense_morphology_id]))[0].word_sum,'combust + ion → combustion');
 assert.deepEqual(await q("select to_jsonb(s) data from teaching_dictionary_reviewed_sense_sets s where canonical_word_id=$1",[id('invisible')]),invisibleBefore);
 assert.deepEqual(await q("select current_revision_id from adle_route_activation_heads where environment_key=$1 and route_id='latin_root_word_lab' and micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS'",[environment]),beforeHead);
 await q(apply?'commit':'rollback');const result={environment,applied:apply,familyKey,base:'combust',wordSum:'combust + ion → combustion',latinExclusions:['affect','effect','combustion'],invisiblePreserved:true,liveLessonPoolPreserved:true};fs.mkdirSync('outputs/root-teaching-decisions-20261128',{recursive:true});fs.writeFileSync(`outputs/root-teaching-decisions-20261128/${environment}-${apply?'applied':'dry-run'}.json`,JSON.stringify(result,null,2));console.log(result);
}catch(e){await q('rollback');throw e;}finally{await d.end()}
