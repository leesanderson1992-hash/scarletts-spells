import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {dictionaryAuditSqlClient} from './dictionary-audit-sql-client';
import {loadRootFamilyAudit} from '../lib/teaching-dictionary-manager/root-family-audit-loader';
import {rootCandidateFingerprint} from '../lib/teaching-dictionary-manager/root-family-audit';
const prod=process.argv.includes('--production'),apply=process.argv.includes('--apply');
const environment=prod?'production':'staging',roots=['port','pict'];
const e=parseEnv(fs.readFileSync(prod?'.env.local':'.env.staging.local','utf8'));
const conn=prod?e.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED:e.SUPABASE_STAGING_DB_URL;
assert(conn.includes(prod?'wwohrqtunajrbwxyssjf':'qkpjbajicacbrphthibk'));
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:prod?'https://wwohrqtunajrbwxyssjf.supabase.co':'https://qkpjbajicacbrphthibk.supabase.co',ADLE_ROUTE_ACTIVATION_ENVIRONMENT:environment});
const actor=prod?'a28d4885-8328-4853-ba11-6c676619b9ea':e.STAGING_ADMIN_USER_ID;
const db=new pg.Client({connectionString:conn,ssl:{rejectUnauthorized:false}});
await db.connect();const q=async(sql:string,p:unknown[]=[]) =>(await db.query(sql,p)).rows;
try{
 await q('begin isolation level serializable');await q('set local jit=off');await q("set local statement_timeout='30s'");
 const client=dictionaryAuditSqlClient(db) as unknown as SupabaseClient;
 const before=await loadRootFamilyAudit(client);
 const linked=(audit:typeof before)=>audit.groups.filter(g=>roots.includes(g.root)).flatMap(g=>g.rows.filter(r=>r.linked).map(r=>g.root+':'+r.wordId+':'+r.senseId)).sort();
 const source='Owner review 2026-11-28: Port and Pict complete; create Latin root cred meaning to believe or trust. Preserve assigned words; no ordinary word publication.';
 let dismissed=0;
 for(const g of before.groups.filter(g=>roots.includes(g.root))){
  for(const r of g.rows.filter(r=>!r.linked)){
   const inserted=await q('insert into teaching_dictionary_root_candidate_dismissals(environment_key,root_text,canonical_word_id,sense_id,source_fingerprint,reviewed_by,source_reference) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning root_text',[environment,g.root,r.wordId,r.senseId??'',rootCandidateFingerprint(r),actor,source]);dismissed+=inserted.length;
  }
  await q('insert into teaching_dictionary_root_review_completions(environment_key,root_text,reviewed_by,source_reference) values($1,$2,$3,$4) on conflict do nothing',[environment,g.root,actor,source]);
 }
 const words=await q("select w.id,s.sense_set from canonical_teaching_dictionary_words w left join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id where w.normalised_word='cred' and w.dialect_code='en-GB' and w.row_status in ('active','draft')");
 assert(words.length<=1,'Ambiguous cred entries');let word=words[0];const created=!word;
 if(!word){
  const parts=[{id:'root',kind:'root',sourceText:'cred',surfaceText:'cred',gloss:'to believe or trust',displayRange:{start:0,end:4}}];
  const senses={pronunciations:[],senses:[{id:'root',definition:'to believe or trust',partOfSpeech:'root',pronunciationId:null}]};
  const analyses=[{senseId:'root',parts,joins:[],transformations:[],wordSum:'cred → cred',familyKey:'',componentPartId:'',relationshipKind:'',requestedSkillKeys:[]}];
  word=(await q('select import_reviewed_teaching_dictionary_word($1,null,$2,null,$3,$4,$5,$6) id',[randomUUID(),'cred',JSON.stringify(senses),JSON.stringify(analyses),actor,source]))[0];
 }else assert(word.sense_set?.senses.some((s:{id:string,definition:string,partOfSpeech:string})=>s.id==='root'&&s.definition==='to believe or trust'&&s.partOfSpeech==='root'),'Existing cred review must be preserved');
 const family=(await q("select create_reviewed_root_family_from_entry($1,'root','Latin','not_applicable',null,$2) family",[word.id,actor]))[0].family;
 const f=(await q('select * from teaching_dictionary_families_with_current_meaning where family_key=$1 and is_current_family order by revision desc limit 1',[family]))[0];
 assert.equal(f.base_kind,'bound_root');assert.equal(f.base_meaning,'to believe or trust');assert.equal(f.canonical_base_word_id,word.id);
 assert.equal((await q('select teaching_dictionary_word_is_root_only($1) root',[word.id]))[0].root,true);
 const assignment=(await q('select * from teaching_dictionary_root_skill_families where family_key=$1',[family]))[0];
 assert.equal(assignment.micro_skill_key,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS');
 const after=await loadRootFamilyAudit(client);assert.deepEqual(linked(after),linked(before));
 assert(after.groups.filter(g=>roots.includes(g.root)).every(g=>g.reviewed&&g.rows.every(r=>r.linked)));
 const result={environment,applied:apply,roots,dismissed,assignedWordsPreserved:true,cred:{wordId:word.id,family,created,meaning:f.base_meaning,origin:assignment.origin_language,microSkill:assignment.micro_skill_key,rootOnly:true}};
 await q(apply?'commit':'rollback');fs.mkdirSync('outputs/port-pict-cred-20261128',{recursive:true});fs.writeFileSync(`outputs/port-pict-cred-20261128/${environment}-${apply?'applied':'dry'}.json`,JSON.stringify(result,null,2));console.log(result);
}catch(error){await q('rollback');throw error;}finally{await db.end();}
