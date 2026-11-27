import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
const apply=process.argv.includes('--apply');
const env=parseEnv(fs.readFileSync('.env.staging.local','utf8'));
const url=env.SUPABASE_STAGING_DB_URL;
assert(new URL(url).username.endsWith('.qkpjbajicacbrphthibk'),'Staging database required');
const actor=env.STAGING_ADMIN_USER_ID;assert(actor);
const plan=JSON.parse(fs.readFileSync('data/teaching-dictionary/latin-root-port-first-lesson-v1.json','utf8'));
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
await db.connect();
try{
 await q('begin isolation level serializable');
 await q("set local statement_timeout='30s'");
 const family=(await q("select f.*,r.origin_language from teaching_dictionary_families_with_current_meaning f join canonical_teaching_dictionary_lexical_root_metadata r using(family_key,revision) where f.family_key=$1 and f.is_current_family order by revision desc limit 1",[plan.familyKey]))[0];
 assert(family&&family.review_status==='approved'&&family.base_meaning===plan.meaning&&family.origin_language==='Latin','Reviewed PORT family required');
 const anchor=(await q("select w.id,s.sense_set from canonical_teaching_dictionary_words w join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id where w.normalised_word='transport' and w.dialect_code='en-GB' and w.row_status='active'"))[0];
 assert(anchor,'Existing reviewed transport required');
 const anchorSense=anchor.sense_set.senses.find(s=>s.id===plan.existingAnchor.senseId);
 assert.equal(anchorSense?.partOfSpeech,'noun');assert.equal(anchorSense?.dictationSentence,plan.existingAnchor.sentence);
 const results=[];
 for(const entry of plan.newEntries){
  const existing=(await q("select w.id,w.row_status,s.sense_set,s.reviewed_at from canonical_teaching_dictionary_words w left join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id where w.normalised_word=$1 and w.dialect_code='en-GB' and w.row_status in ('active','draft')",[entry.word]));
  assert(existing.length<=1,'Ambiguous dictionary spelling');
  if(existing[0]){
   const sense=existing[0].sense_set?.senses?.find(s=>s.id===entry.senseId);
   assert(sense&&sense.definition===entry.definition&&sense.partOfSpeech===entry.partOfSpeech&&sense.dictationSentence===entry.sentence,`${entry.word}: existing content needs separate review; no overwrite`);
   results.push({word:entry.word,id:existing[0].id,created:false});continue;
  }
  let position=0;
  const parts=entry.parts.map((part,index)=>{const start=position;position+=part.text.length;return {id:part.role==='root'?'root':`${part.role}-${index}`,kind:part.role,sourceText:part.text,surfaceText:part.text,gloss:part.meaning,displayRange:{start,end:position}}});
  const joins=parts.slice(1).map((part,index)=>({afterPartId:parts[index].id,beforePartId:part.id,joinType:'none'}));
  const tokens=entry.sentence.match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu);const index=tokens.findIndex(token=>token.toLowerCase()===entry.word);
  assert(index>=0&&tokens.filter(token=>token.toLowerCase()===entry.word).length===1);
  const senseSet={pronunciations:[{id:'british-1',ipa:entry.ipa,spokenSyllableCount:entry.spokenSyllableCount,stressPattern:entry.stressPattern}],senses:[{id:entry.senseId,definition:entry.definition,partOfSpeech:entry.partOfSpeech,pronunciationId:'british-1',dictationSentence:entry.sentence,dictationTargetTokenIndex:index}]};
  const analyses=[{senseId:entry.senseId,parts,joins,transformations:[],wordSum:entry.parts.map(p=>p.text).join(' + ')+' → '+entry.word,familyKey:plan.familyKey,componentPartId:'root',relationshipKind:'derived',requestedSkillKeys:[]}];
  const id=(await q('select import_reviewed_teaching_dictionary_word($1,null,$2,null,$3,$4,$5,$6) id',[randomUUID(),entry.word,JSON.stringify(senseSet),JSON.stringify(analyses),actor,plan.approvalReference+' Source: '+entry.sourceUrl]))[0].id;
  results.push({word:entry.word,id,created:true});
 }
 for(const result of results){
  assert.equal((await q('select teaching_dictionary_word_is_root_only($1) root_only',[result.id]))[0].root_only,false);
  assert((await q('select * from teaching_dictionary_current_sense_family_memberships where canonical_word_id=$1 and family_key=$2',[result.id,plan.familyKey])).length===1,'Reviewed sense family link required');
 }
 const after=(await q('select sense_set from teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1',[anchor.id]))[0];
 assert.deepEqual(after.sense_set,anchor.sense_set,'Existing transport meaning must be preserved');
 await q(apply?'commit':'rollback');
 fs.mkdirSync('outputs/latin-root-release-20261127',{recursive:true});
 const report={environment:'staging',applied:apply,anchorPreserved:true,words:results};
 fs.writeFileSync(`outputs/latin-root-release-20261127/port-dictionary${apply?'':'-rollback'}.json`,JSON.stringify(report,null,2));
 console.log(report);
}catch(error){await q('rollback');throw error}finally{await db.end()}
