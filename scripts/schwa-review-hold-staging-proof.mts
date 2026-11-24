import assert from "node:assert/strict";
import fs from "node:fs";
import pg from "pg";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { loadSchwaBulkReview, publishCheckedSchwaWorkbookWord } from "../lib/teaching-dictionary-manager/schwa-bulk-review";
import { loadLessonDeassignments } from "../lib/teaching-dictionary-manager/lesson-deassignments";
import { loadWeakVowelSelectionPool } from "../lib/adle/weak-vowel/readiness-loader";
import { buildReviewWorkbook } from "../lib/teaching-dictionary-manager/review-workbook";

assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://qkpjbajicacbrphthibk.supabase.co");
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT,"staging");
const dir="outputs/medial-schwa-missing-20261124", path=`${dir}/staging-hold-fixture.json`;
fs.mkdirSync(dir,{recursive:true});
const sql=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL}); await sql.connect();
const db=createServiceRoleClient(),skill="D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS",actor=process.env.STAGING_ADMIN_USER_ID!;
const pool=()=>loadWeakVowelSelectionPool({client:db,environmentKey:"staging"},skill);
try {
  if(process.argv.includes("--prepare")) {
    assert(!fs.existsSync(path) || JSON.parse(fs.readFileSync(path,"utf8")).cleaned);
    assert.equal(Number((await sql.query("select count(*) n from teaching_dictionary_schwa_syllable_reviews where environment_key='staging' and micro_skill_key=$1",[skill])).rows[0].n),0);
    const originalReview=await loadSchwaBulkReview(db,skill);
    const preferred=JSON.parse(fs.readFileSync(`${dir}/staging-cohort.json`,"utf8")).map((row:{id:string})=>row.id);
    const words=(await sql.query("select id,display_word from canonical_teaching_dictionary_words where row_status='active' and normalised_word ~ '^[a-z]{3,}$' order by (id=any($1)) desc,(id=any($2)) desc,normalised_word limit 166",[originalReview.rows.map(row=>row.id),preferred])).rows;
    assert.equal(words.length,166);
    const ids=words.map(row=>row.id),before=(await sql.query("select canonical_word_id,action from teaching_dictionary_pair_latest_decisions where environment_key='staging' and micro_skill_key=$1 and canonical_word_id=any($2)",[skill,ids])).rows;
    const active=(await pool()).words.map(row=>row.canonicalWordId).sort();
    const request=randomUUID(), resetAt=new Date(Date.now()-1000).toISOString();
    await sql.query("begin");
    const events=(await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) select 'staging',$1,id,'deassign',$2,$3 from unnest($4::uuid[]) id returning id,canonical_word_id",[skill,actor,request,ids])).rows;
    for(const word of words.slice(0,165)) await sql.query("insert into teaching_dictionary_schwa_syllable_reviews(environment_key,canonical_word_id,micro_skill_key,reset_at,reset_by,reset_deassignment_event_id) values('staging',$1,$2,$3,$4,$5)",[word.id,skill,resetAt,actor,events.find(e=>e.canonical_word_id===word.id).id]);
    await sql.query("commit");
    fs.writeFileSync(path,JSON.stringify({words,before,active,resetAt,cleaned:false},null,2));
    console.log({fixtureReviewHolds:165,deliberateRemoval:words[165].display_word});
  } else if(process.argv.includes("--cleanup")) {
    const state=JSON.parse(fs.readFileSync(path,"utf8")); assert(!state.cleaned);
    await sql.query("begin");
    await sql.query("delete from teaching_dictionary_schwa_syllable_reviews where environment_key='staging' and micro_skill_key=$1 and canonical_word_id=any($2)",[skill,state.words.map((w:{id:string})=>w.id)]);
    for(const word of state.words) await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values('staging',$1,$2,$3,$4,$5)",[skill,word.id,state.before.find((r:{canonical_word_id:string})=>r.canonical_word_id===word.id)?.action??"restore",actor,randomUUID()]);
    await sql.query("commit");
    assert.deepEqual((await pool()).words.map(row=>row.canonicalWordId).sort(),state.active);
    state.cleaned=true;fs.writeFileSync(path,JSON.stringify(state,null,2));console.log({fixtureRestored:true});
  } else {
    const state=JSON.parse(fs.readFileSync(path,"utf8")); assert(!state.cleaned);
    const held=state.words.slice(0,165),removed=state.words[165];
    const review=await loadSchwaBulkReview(db,skill,true);
    for(const word of held) assert(review.rows.some(row=>row.id===word.id),word.display_word);
    assert(!review.rows.some(row=>row.id===removed.id));
    const strict=await loadLessonDeassignments(db,"staging",skill),visible=await loadLessonDeassignments(db,"staging",skill,{forReview:true});
    assert(held.every((word:{id:string})=>strict.has(word.id)&&!visible.has(word.id)));
    assert(visible.has(removed.id));
    const current=await pool();assert(held.every((word:{id:string})=>!current.approvedIds.has(word.id)&&!current.words.some(row=>row.canonicalWordId===word.id)));
    for(const row of review.queue.filter(row=>held.some((word:{id:string})=>word.id===row.wordId))) {
      assert(row.blockers.length>0);
      await assert.rejects(()=>publishCheckedSchwaWorkbookWord(db,actor,skill,{...row,blockers:[]}),/de-assigned/u);
    }
    const exported=new Set<string>();
    for(let at=0;at<review.bundles.length;at+=100) {
      const bytes=await buildReviewWorkbook({skill,title:"Disposable review hold proof",bundles:review.bundles.slice(at,at+100),notes:new Map(review.rows.map(row=>[row.id,row.note])),families:new Map()});
      const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes as unknown as ArrayBuffer);
      const sheet=wb.getWorksheet("Words to review")!,headers=sheet.getRow(3).values as string[],column=headers.indexOf("Canonical word id");
      sheet.eachRow((row,index)=>{if(index>3&&row.getCell(column).value)exported.add(String(row.getCell(column).value));});
    }
    assert(held.every((word:{id:string})=>exported.has(word.id)));assert(!exported.has(removed.id));
    // A later deliberate removal must override the exact reset event, even
    // though its syllable review is still pending.
    const changed=held[0];
    await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values('staging',$1,$2,'deassign',$3,$4)",[skill,changed.id,actor,randomUUID()]);
    assert((await loadLessonDeassignments(db,"staging",skill,{forReview:true})).has(changed.id));
    assert(!(await loadSchwaBulkReview(db,skill)).rows.some(row=>row.id===changed.id));
    // Start a new, explicitly labelled disposable review hold for the UI check.
    const nextReset=new Date(Date.now()-1).toISOString();
    const event=(await sql.query("insert into teaching_dictionary_pair_decision_events(environment_key,micro_skill_key,canonical_word_id,action,decided_by,request_id) values('staging',$1,$2,'deassign',$3,$4) returning id",[skill,changed.id,actor,randomUUID()])).rows[0];
    await sql.query("update teaching_dictionary_schwa_syllable_reviews set reset_at=$1,reset_deassignment_event_id=$2 where environment_key='staging' and micro_skill_key=$3 and canonical_word_id=$4",[nextReset,event.id,skill,changed.id]);
    const report={passed:true,reviewWordsRestored:165,exportContainsAll165:true,noHeldWordsActive:true,manualRemovalExcluded:true,laterManualRemovalOverridesHold:true,staleDraftCannotActivate:true};
    fs.writeFileSync(`${dir}/staging-proof.json`,JSON.stringify(report,null,2));console.log(report);
  }
} finally {await sql.end();}
