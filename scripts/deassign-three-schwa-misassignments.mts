#!/usr/bin/env node
/** Owner-directed deassignment of three mismatched Schwa pairs, with rollback proof. */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";

process.loadEnvFile(".env.local");
const url=process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor=(process.env.ADMIN_USER_IDS??"").split(",")[0];
if(!url||!new URL(url).username.includes("wwohrqtunajrbwxyssjf")||
 !new URL(url).hostname.endsWith("pooler.supabase.com")||!actor) throw Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply=process.argv.includes("--apply");
const pairs=[
 {word:"ritual",id:"29bac9fa-2d8f-5d1d-bf33-e4311304cae6",skill:"D4_SCHWA_FINAL_A_FINAL"},
 {word:"a",id:"91bbbda5-9fa4-56ca-8cab-1a980c19ea31",skill:"D4_SCHWA_INITIAL_A_INITIAL"},
 {word:"forbid",id:"fb6609b1-1016-5eae-ae1d-195ce5a85807",skill:"D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS"},
] as const;
const inventory=await loadWeakVowelRepairInventory(url,"production");
const status=(word:string,key:string)=>inventory.sources.find(s=>s.word.display_word===word&&s.microSkillKey===key)?.assignmentStatus;
if(status("ritual","D4_SCHWA_FINAL_AL")!=="assigned" ||
 status("a","D4_SCHWA_INITIAL_A_INITIAL")!=="assigned" ||
 status("forbid","D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS")!=="assigned")
 throw Error("PAIR_AUTHORITY_CHANGED");
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
 await db.query("begin isolation level serializable");
 await db.query("set local lock_timeout='5s'");
 const state=async()=> (await db.query(`select jsonb_build_object(
  'children',(select count(*) from public.children),
  'learningItems',(select count(*) from public.adle_learning_items),
  'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
  'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
 const before=await state();
 for(const pair of pairs){
  const word=await db.query("select display_word,row_status,review_status from public.canonical_teaching_dictionary_words where id=$1 for share",[pair.id]);
  if(word.rows[0]?.display_word!==pair.word||word.rows[0]?.row_status!=="active"||
   word.rows[0]?.review_status!=="approved_for_first_exposure")throw Error(`WORD_CHANGED:${pair.word}`);
  await db.query("select public.reconcile_teaching_dictionary_bulk_review_v2('production',$1,$2::uuid[],$2::uuid[],$2::uuid[],$3::uuid[],$2::uuid[],$4::uuid,$5::uuid,$6)",
   [pair.skill,[],[pair.id],actor,randomUUID(),`Owner-directed 2026-10-30 Schwa correction: deassign ${pair.word} from ${pair.skill}; preserve ritual final -al`]);
 }
 const decisions=await db.query(`select micro_skill_key,canonical_word_id,action from public.teaching_dictionary_pair_latest_decisions
  where environment_key='production' and canonical_word_id=any($1::uuid[])`,[pairs.map(p=>p.id)]);
 for(const pair of pairs) if(!decisions.rows.some(r=>r.micro_skill_key===pair.skill&&r.canonical_word_id===pair.id&&r.action==='deassign'))
  throw Error(`DEASSIGN_READBACK_FAILED:${pair.word}`);
 if(decisions.rows.some(r=>r.canonical_word_id===pairs[0].id&&r.micro_skill_key==='D4_SCHWA_FINAL_AL'&&r.action==='deassign'))
  throw Error("RITUAL_FINAL_AL_DEASSIGNED");
 const finalAl=await db.query(`select count(*)::int n from public.spelling_canonical_mappings
  where correct_spelling_normalized='ritual' and micro_skill_key='D4_SCHWA_FINAL_AL'
   and mapping_status='active' and resolver_visibility_status='visible'`);
 if(finalAl.rows[0].n!==1) throw Error("RITUAL_FINAL_AL_MAPPING_CHANGED");
 const after=await state();
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error("LEARNER_STATE_CHANGED");
 if(apply)await db.query("commit");else await db.query("rollback");
 console.log(JSON.stringify({mode:apply?"applied":"rollback_proof",environment:"production",
  deassigned:pairs.map(p=>({word:p.word,skill:p.skill})),ritualFinalAlMapping:"active_visible",learnerState:before}));
}catch(e){await db.query("rollback").catch(()=>{});throw e}finally{await db.end()}
