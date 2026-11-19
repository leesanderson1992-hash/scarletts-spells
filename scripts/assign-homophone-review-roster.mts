/** Idempotently place the reviewed roster into the canonical bulk-review flow.
 * This creates review requests, never word approvals or learner releases.
 * Dry-run unless --apply; --environment and --actor are explicit. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { HOMOPHONE_REVIEW_SKILLS } from "../lib/teaching-dictionary-manager/homophone-review-contract";
import { loadHomophoneReviewRoster } from "../lib/teaching-dictionary-manager/homophone-bulk-review";
const flag=(name:string)=>process.argv.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
const environment=flag('--environment'),actor=flag('--actor'),apply=process.argv.includes('--apply');
assert(environment==='staging'||environment==='production');assert(actor&&/^[0-9a-f-]{36}$/i.test(actor));
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,environment==='production'?'https://wwohrqtunajrbwxyssjf.supabase.co':'https://qkpjbajicacbrphthibk.supabase.co');
const db=createServiceRoleClient(),rows:{environment_key:string;micro_skill_key:string;canonical_word_id:string;sense_id:null;request_id:string;requested_by:string}[]=[];
for(let at=0;at<HOMOPHONE_REVIEW_SKILLS.length;at+=4){
 const batch=await Promise.all(HOMOPHONE_REVIEW_SKILLS.slice(at,at+4).map(async skill=>{
  const roster=await loadHomophoneReviewRoster(db,skill);
  const veto=await db.from('teaching_dictionary_pair_latest_decisions').select('canonical_word_id,action').eq('environment_key',environment).eq('micro_skill_key',skill).in('canonical_word_id',roster.words.map(w=>w.id));
  const excluded=await db.from('teaching_dictionary_bulk_review_exclusions').select('canonical_word_id').eq('environment_key',environment).eq('micro_skill_key',skill).in('canonical_word_id',roster.words.map(w=>w.id));assert.ifError(veto.error);assert.ifError(excluded.error);
  const suppressed=new Set([...veto.data.filter(v=>v.action==='deassign').map(v=>v.canonical_word_id),...excluded.data.map(v=>v.canonical_word_id)]);
  return roster.words.filter(w=>!suppressed.has(w.id)).map(word=>{
   const hex=createHash('sha256').update(`homophone-canonical-review-v1:${environment}:${skill}:${word.id}`).digest('hex').slice(0,32);
   const request=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
   return{environment_key:environment,micro_skill_key:skill,canonical_word_id:word.id,sense_id:null,request_id:request,requested_by:actor};
  });
 }));rows.push(...batch.flat());
}
assert.equal(HOMOPHONE_REVIEW_SKILLS.length,68);assert(rows.length<=175);assert.equal(new Set(rows.map(r=>r.micro_skill_key+':'+r.canonical_word_id)).size,rows.length);
if(apply){for(let at=0;at<rows.length;at+=100){const saved=await db.from('teaching_dictionary_lesson_review_requests').upsert(rows.slice(at,at+100),{onConflict:'environment_key,micro_skill_key,canonical_word_id,request_id',ignoreDuplicates:true});assert.ifError(saved.error);}}
const result={environment,skills:new Set(rows.map(r=>r.micro_skill_key)).size,wordLessonLinks:rows.length,words:new Set(rows.map(r=>r.canonical_word_id)).size,skippedExcluded:175-rows.length,applied:apply,approvalsGranted:0,publishedLessons:0};
if(flag('--receipt'))writeFileSync(flag('--receipt')!,JSON.stringify({...result,requests:rows},null,2));console.log(result);
