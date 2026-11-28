import fs from "node:fs";import assert from "node:assert/strict";import {parseEnv}from"node:util";import pg from "pg";import type {SupabaseClient}from"@supabase/supabase-js";
import {dictionaryAuditSqlClient}from"./dictionary-audit-sql-client";
import {loadRootFamilyAudit}from"../lib/teaching-dictionary-manager/root-family-audit-loader";
import {rootCandidateFingerprint}from"../lib/teaching-dictionary-manager/root-family-audit";
const prod=process.argv.includes('--production'),apply=process.argv.includes('--apply'),environment=prod?'production':'staging';
const e=parseEnv(fs.readFileSync(prod?'.env.local':'.env.staging.local','utf8'));const conn=prod?e.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED:e.SUPABASE_STAGING_DB_URL;assert(conn.includes(prod?'wwohrqtunajrbwxyssjf':'qkpjbajicacbrphthibk'));
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:prod?'https://wwohrqtunajrbwxyssjf.supabase.co':'https://qkpjbajicacbrphthibk.supabase.co',ADLE_ROUTE_ACTIVATION_ENVIRONMENT:environment});
const actor=prod?'a28d4885-8328-4853-ba11-6c676619b9ea':e.STAGING_ADMIN_USER_ID;
const sql=new pg.Client({connectionString:conn,ssl:{rejectUnauthorized:false}});await sql.connect();const q=async(s:string,p:unknown[]=[]) =>(await sql.query(s,p)).rows;
try{await q('begin');await q('set local jit=off');await q("set local statement_timeout='20s'");
 const db=dictionaryAuditSqlClient(sql) as unknown as SupabaseClient;
 const before=await loadRootFamilyAudit(db);const roots=['vis','dict','spect','aud','min','max'];const linkedBefore=before.groups.filter(g=>roots.includes(g.root)).flatMap(g=>g.rows.filter(r=>r.linked).map(r=>g.root+':'+r.wordId+':'+r.senseId)).sort();
 const ref='Owner completed root reviews 2026-11-28: selected Vis and Dict words assigned; no further Spect, Aud, Min or Max candidates wanted. Dismiss unlinked review candidates only.';
 let dismissed=0;for(const group of before.groups.filter(g=>roots.includes(g.root))){for(const row of group.rows.filter(r=>!r.linked)){
  await q('insert into teaching_dictionary_root_candidate_dismissals(environment_key,root_text,canonical_word_id,sense_id,source_fingerprint,reviewed_by,source_reference) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing',[environment,group.root,row.wordId,row.senseId??'',rootCandidateFingerprint(row),actor,ref]);dismissed++;
 }await q('insert into teaching_dictionary_root_review_completions(environment_key,root_text,reviewed_by,source_reference) values($1,$2,$3,$4) on conflict do nothing',[environment,group.root,actor,ref]);}
 const after=await loadRootFamilyAudit(db);const linkedAfter=after.groups.filter(g=>roots.includes(g.root)).flatMap(g=>g.rows.filter(r=>r.linked).map(r=>g.root+':'+r.wordId+':'+r.senseId)).sort();assert.deepEqual(linkedAfter,linkedBefore);
 assert(after.groups.filter(g=>roots.includes(g.root)).every(g=>g.reviewed&&g.rows.every(r=>r.linked)));
 const oldKey='port_noun_base_family',newKey='port_root_port_carry_root_base_family';const existing=await q('select canonical_family_key from teaching_dictionary_lexical_family_successions where old_family_key=$1',[oldKey]);
 if(!existing.length){
  const old=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[oldKey]))[0];
  const target=(await q('select * from canonical_teaching_dictionary_lexical_base_families where family_key=$1 order by revision desc limit 1',[newKey]))[0];
  assert(old&&target,'The reviewed port families are required');assert.equal(old.canonical_base_word_id,target.canonical_base_word_id);assert.equal(old.base_kind,'free_base');assert.equal(target.base_kind,'bound_root');assert.equal(old.base_meaning.toLowerCase(),'to carry');
  await q('savepoint implicit');let blocked=false;try{await q('insert into teaching_dictionary_lexical_family_successions(old_family_key,old_revision,canonical_family_key,canonical_revision,canonical_base_word_id,canonical_base_sense_id,reviewed_by,source_reference) values($1,$2,$3,$4,$5,$6,$7,$8)',[oldKey,old.revision,newKey,target.revision,target.canonical_base_word_id,target.canonical_base_sense_id,actor,'Owner removal of duplicate port carry-base family, 2026-11-28']);}catch{blocked=true;}await q('rollback to savepoint implicit');assert(blocked);
  await q('insert into teaching_dictionary_lexical_family_successions(old_family_key,old_revision,canonical_family_key,canonical_revision,canonical_base_word_id,canonical_base_sense_id,reviewed_by,source_reference,reclassification_reason) values($1,$2,$3,$4,$5,$6,$7,$8,$8)',[oldKey,old.revision,newKey,target.revision,target.canonical_base_word_id,target.canonical_base_sense_id,actor,'Owner removal of duplicate legacy carry-base family; use the approved port carry-root family, 2026-11-28']);
 }
 assert.equal((await q('select count(*)::int n from teaching_dictionary_families_with_current_meaning where family_key=$1 and is_current_family',[oldKey]))[0].n,0);
 assert.equal((await q("select count(*)::int n from teaching_dictionary_families_with_current_meaning where family_key='port_noun_review_base_family' and is_current_family"))[0].n,1);
 await q(apply?'commit':'rollback');const result={environment,applied:apply,dismissed,roots,assignedWordsPreserved:true,duplicatePortFamilyRemoved:true,portWordAndHarbourMeaningPreserved:true};fs.mkdirSync('outputs/root-review-decisions-20261128',{recursive:true});fs.writeFileSync(`outputs/root-review-decisions-20261128/${environment}-${apply?'applied':'dry'}.json`,JSON.stringify(result,null,2));console.log(result);
}catch(e){await q('rollback');throw e;}finally{await sql.end();}
