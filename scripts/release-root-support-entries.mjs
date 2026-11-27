import fs from'node:fs';import pg from'pg';import{parseEnv}from'node:util';import{randomUUID,createHash}from'node:crypto';import assert from'node:assert/strict';
const environment=process.argv[2],apply=process.argv.includes('--apply');assert(['staging','production'].includes(environment));
const plan=JSON.parse(fs.readFileSync('data/teaching-dictionary/root-support-2026-11-27.json','utf8'));
const e=parseEnv(fs.readFileSync(environment==='staging'?'.env.staging.local':'.env.local','utf8'));
const url=environment==='staging'?e.SUPABASE_STAGING_DB_URL:e.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
assert(new URL(url).username.includes(environment==='staging'?'qkpjbajicacbrphthibk':'wwohrqtunajrbwxyssjf'));
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const source=JSON.parse(fs.readFileSync('outputs/root-support-release-20261127/production-preflight.json','utf8'));
const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.connect();try{await db.query('begin isolation level serializable');await db.query("set local lock_timeout='5s'");await db.query("set local statement_timeout='60s'");
const actor=environment==='staging'?e.STAGING_ADMIN_USER_ID:(await q("select id from auth.users where id=$1",['a28d4885-8328-4853-ba11-6c676619b9ea']))[0]?.id;assert(actor,'Reviewed admin actor required');
const results=[];
for(const root of plan.roots){
 console.log({checkingRoot:root.root,environment});
 let f=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[root.familyKey]))[0];
 if(!f&&environment==='staging'){
  const sourceFamily=source.rawFamilies.find(x=>x.family_key===root.familyKey);assert(sourceFamily);
  await db.query('insert into canonical_teaching_dictionary_lexical_base_families select (jsonb_populate_record(null::canonical_teaching_dictionary_lexical_base_families,$1::jsonb)).*',[JSON.stringify(sourceFamily)]);
  f=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[root.familyKey]))[0];
 }
 assert(f,'Family missing: '+root.root);
 if(environment==='production')assert.equal(f.base_meaning,root.definition,root.root+' reviewed meaning changed');
 const beforeMembers=await q('select to_jsonb(m)-\'revision\' as member from canonical_teaching_dictionary_lexical_base_family_members m where family_key=$1 and revision=$2 order by canonical_word_id,word_part_of_speech',[f.family_key,f.revision]);
 let word=(await q('select w.id,w.display_word,s.sense_set,s.reviewed_at from canonical_teaching_dictionary_words w left join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id where w.normalised_word=$1 and w.dialect_code=\'en-GB\' and w.row_status=\'active\'',[root.root]))[0];
 let created=false;
 if(!word){
  const set={pronunciations:[],senses:[{id:'root',definition:f.base_meaning,partOfSpeech:'root',pronunciationId:null}]};
  const parts=[{id:'root',kind:'root',sourceText:root.root,surfaceText:root.root,gloss:f.base_meaning,displayRange:{start:0,end:root.root.length}}];
  const analyses=[{senseId:'root',parts,joins:[],transformations:[],wordSum:root.root+' → '+root.root,familyKey:'',componentPartId:'',relationshipKind:'',requestedSkillKeys:[]}];
  const id=(await q('select import_reviewed_teaching_dictionary_word($1,null,$2,null,$3,$4,$5,$6) id',[randomUUID(),root.root,JSON.stringify(set),JSON.stringify(analyses),actor,plan.approvalReference]))[0].id;
  word={id,sense_set:set};created=true;
 }
 const sense=word.sense_set?.senses.find(s=>s.partOfSpeech==='root'&&s.definition===f.base_meaning);
 assert(sense,root.root+' existing entry requires a separate reviewed root meaning');
 const revision=(await q('select attach_reviewed_root_family_entry($1,$2,$3,$4,$5,$6,$7) revision',[f.family_key,f.revision,word.id,sense.id,root.origin,actor,plan.approvalReference]))[0].revision;
 assert.equal((await q('select teaching_dictionary_word_is_root_only($1) root',[word.id]))[0].root,true);
 const afterMembers=await q('select to_jsonb(m)-\'revision\' as member from canonical_teaching_dictionary_lexical_base_family_members m where family_key=$1 and revision=$2 order by canonical_word_id,word_part_of_speech',[f.family_key,revision]);assert.deepEqual(afterMembers,beforeMembers,root.root+' membership changed');
 results.push({root:root.root,familyKey:f.family_key,wordId:word.id,revision,created,membersPreserved:afterMembers.length});
}
const graph=plan.graph;
let old=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[graph.old]))[0];
const target=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[graph.target]))[0];assert(target);
if(!old&&environment==='staging'){
 const original=source.rawFamilies.find(f=>f.family_key===graph.old);assert(original);
 await db.query('insert into canonical_teaching_dictionary_lexical_base_families select (jsonb_populate_record(null::canonical_teaching_dictionary_lexical_base_families,$1::jsonb)).*',[JSON.stringify({...original,canonical_base_word_id:target.canonical_base_word_id,canonical_base_sense_id:original.canonical_base_sense_id})]);
 await db.query('insert into teaching_dictionary_legacy_family_sense_anchors(family_key,canonical_word_id,sense_id,reviewed_by,source_reference) values($1,$2,$3,$4,$5) on conflict(family_key) do nothing',[graph.old,target.canonical_base_word_id,graph.senseId,actor,'Disposable staging fixture: existing reviewed Graph root meaning']);
 old=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[graph.old]))[0];
}
assert(old);assert.equal(old.canonical_base_word_id,target.canonical_base_word_id);
const historicalBefore=await q('select to_jsonb(m) member from canonical_teaching_dictionary_lexical_base_family_members m where family_key=any($1::text[]) order by family_key,revision,canonical_word_id,word_part_of_speech',[[graph.old,graph.target]]);
await db.query('insert into teaching_dictionary_lexical_family_successions(old_family_key,old_revision,canonical_family_key,canonical_revision,canonical_base_word_id,canonical_base_sense_id,reviewed_by,source_reference) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(old_family_key) do nothing',[graph.old,old.revision,graph.target,target.revision,target.canonical_base_word_id,graph.senseId,actor,plan.approvalReference]);
const current=await q('select distinct family_key from teaching_dictionary_families_with_current_meaning where family_key=any($1::text[]) and is_current_family',[[graph.old,graph.target]]);assert.deepEqual(current.map(f=>f.family_key),[graph.target]);
assert.deepEqual(await q('select to_jsonb(m) member from canonical_teaching_dictionary_lexical_base_family_members m where family_key=any($1::text[]) order by family_key,revision,canonical_word_id,word_part_of_speech',[[graph.old,graph.target]]),historicalBefore);
const report={environment,applied:apply,packageSha256:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),roots:results,graph:{canonical:graph.target,archived:graph.old,historicalMembersPreserved:historicalBefore.length}};
await db.query(apply?'commit':'rollback');fs.writeFileSync(`outputs/root-support-release-20261127/${environment}-content${apply?'':'-rollback'}.json`,JSON.stringify(report,null,2));console.log({environment,applied:apply,roots:results.length,created:results.filter(r=>r.created).length,membersPreserved:true,graphMerged:true});
}catch(error){await db.query('rollback');throw error;}finally{await db.end()}
