/** Reuse the disposable, previously approved enough fixture; never publish. */
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadSchwaWorkbookQueue,stageSchwaWorkbookDraft } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
import { loadReviewedMeaningBundles } from "../lib/teaching-dictionary-manager/multi-sense-export";
import { loadWeakVowelSelectionPool } from "../lib/adle/weak-vowel/readiness-loader";
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://qkpjbajicacbrphthibk.supabase.co");
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,"staging");
const db=createServiceRoleClient(),sql=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL});await sql.connect();
const word="b07d448a-0941-44e1-a1e0-be08b9864c14",skill="D4_SCHWA_INITIAL_E_INITIAL",actor=process.env.STAGING_ADMIN_USER_ID!;
const before=(await sql.query("select * from teaching_dictionary_schwa_syllable_reviews where environment_key='staging' and micro_skill_key=$1 and canonical_word_id=$2",[skill,word])).rows[0];assert(before?.resolved_at);
const [old]=await loadSchwaWorkbookQueue(db,skill,[word],false);assert(old.published);
const [bundle]=await loadReviewedMeaningBundles(db,[word]);
const made:string[]=[];
try {
  const reset=new Date(Date.now()-1000).toISOString();
  const event=(await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values('staging',$1,$2,'deassign',$3,$4) returning id",[skill,word,actor,randomUUID()])).rows[0];
  await sql.query("update teaching_dictionary_schwa_syllable_reviews set reset_at=$1,reset_by=$2,resolved_at=null,resolved_by=null,content_version_id=null,reset_deassignment_event_id=$3 where environment_key='staging' and micro_skill_key=$4 and canonical_word_id=$5",[reset,actor,event.id,skill,word]);
  made.push(await stageSchwaWorkbookDraft(db,actor,bundle,skill,old.payload.skillSenseIds![skill],old.fields));
  assert.equal((await sql.query("select action from teaching_dictionary_pair_latest_decisions where environment_key='staging' and micro_skill_key=$1 and canonical_word_id=$2",[skill,word])).rows[0].action,"deassign","Background restaging cannot restore a hold");
  made.push(await stageSchwaWorkbookDraft(db,actor,bundle,skill,old.payload.skillSenseIds![skill],old.fields,{reviewWrittenDivisions:true}));
  assert.equal((await sql.query("select action from teaching_dictionary_pair_latest_decisions where environment_key='staging' and micro_skill_key=$1 and canonical_word_id=$2",[skill,word])).rows[0].action,"restore");
  const [reviewed]=await loadSchwaWorkbookQueue(db,skill,[word],false);assert.deepEqual(reviewed.blockers,[]);assert(!reviewed.published);
  assert(!(await loadWeakVowelSelectionPool({client:db,environmentKey:"staging"},skill)).words.some(row=>row.canonicalWordId===word));
  console.log({passed:true,backgroundRecheckDidNotRestore:true,freshExplicitReviewResumedSelection:true,stillNotActiveUntilPublished:true});
} finally {
  const restored=await db.from("teaching_dictionary_schwa_syllable_reviews").upsert(before);assert.ifError(restored.error);
  await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values('staging',$1,$2,'restore',$3,$4)",[skill,word,actor,randomUUID()]);
  const extra=[...new Set(made)].filter(id=>id!==old.id);if(extra.length)await sql.query("delete from teaching_dictionary_manager_drafts where id=any($1)",[extra]);
  assert((await loadSchwaWorkbookQueue(db,skill,[word],false))[0].published);
  await sql.end();
}
