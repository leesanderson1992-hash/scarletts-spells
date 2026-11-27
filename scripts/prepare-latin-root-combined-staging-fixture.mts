import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {parseEnv} from "node:util";
import pg from "pg";
import {createClient} from "@supabase/supabase-js";
import {prepareLatinRootAssignment} from "../lib/adle/loaders/latin-root-assignment-loader";
import {learningItemFromRow} from "../lib/adle/loaders/rows";

const env=parseEnv(fs.readFileSync(".env.staging.local","utf8"));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,"https://qkpjbajicacbrphthibk.supabase.co");
const url=env.SUPABASE_STAGING_DB_URL;assert(new URL(url).username.endsWith(".qkpjbajicacbrphthibk"));
const apply=process.argv.includes("--apply"),parent=env.STAGING_ADMIN_USER_ID;
const child="4f851dc2-5dd1-4f44-9cf4-c110e7a1a002",date="2026-11-27";
const file="outputs/latin-root-multi-family-20261127/staging-release.json";
const bytes=fs.readFileSync(file),pkg=JSON.parse(bytes.toString());
const sql=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const q=async(text:string,args:unknown[]=[]) => (await sql.query(text,args)).rows;
await sql.connect();
try{
 await q("begin isolation level serializable");
 const existing=(await q("select id,notes from children where id=$1",[child]))[0];
 if(existing)assert.equal(existing.notes,"Disposable combined Latin-root staging proof 2026-11-27");
 else await q("insert into children(id,parent_user_id,first_name,date_of_birth,notes) values($1,$2,'Latin Roots Combined QA','2017-01-01','Disposable combined Latin-root staging proof 2026-11-27')",[child,parent]);
 const release=(await q("select publish_adle_latin_root_package_v1($1,$2,$3) id",[pkg,createHash("sha256").update(bytes).digest("hex"),parent]))[0].id;
 const manifest=(await q("select * from adle_curriculum_release_manifests where id=$1",[release]))[0];
 const current=(await q("select current_revision_id from adle_route_activation_heads where environment_key='staging' and route_id='latin_root_word_lab' and route_version='v1' and micro_skill_key='D4_MOR_ROOTS_COMMON_LATIN_ROOTS'"))[0]?.current_revision_id??null;
 const report={schemaVersion:1,scope:{kind:"child_allowlist",childIds:[child,"4f851dc2-5dd1-4f44-9cf4-c110e7a1a001"]},emergencyDisableAvailable:true};
 const activation=(await q("select set_adle_route_activation_revision_v2($1,$2,'staging','enabled','allow_existing',$3,$4,$5,$6) id",[manifest.release_manifest_sha256,"D4_MOR_ROOTS_COMMON_LATIN_ROOTS",report,current,parent,"Owner-authorised disposable combined root lesson proof; no production activation"]))[0].id;
 for(const [index,word] of ["transport","visible"].entries()){
  const entry=pkg.authorities.find((a:{authorityType:string})=>a.authorityType==="teaching_dictionary_closure").semanticProjection.dictionary.words.find((w:{spelling:string})=>w.spelling===word);
  assert(entry);
  const source=`staging-proof:latin-root-combined:v1:${entry.canonicalWordId}`;
  if(!(await q("select id from adle_learning_items where child_id=$1 and source_ref=$2 and row_status='active'",[child,source])).length)
   await q("insert into adle_learning_items(child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,intake_on,row_status) values($1,$2,'D4_MOR_ROOTS_COMMON_LATIN_ROOTS','pending','verified_misspelling',$3,$4,false,$5,'active')",[child,entry.canonicalWordId,source,index===0?"transprot":"visable",index===0?"2026-11-25":"2026-11-26"]);
 }
 await q(apply?"commit":"rollback");
 console.log({environment:"staging",applied:apply,childId:child,releaseId:release,activationRevision:activation});
 if(!apply)process.exitCode=0;
 else {
  const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const learningRows=await q("select * from adle_learning_items where child_id=$1 and row_status='active'",[child]);
  const prepared=await prepareLatinRootAssignment({client:service,childId:child,parentUserId:parent,date,microSkillKey:"D4_MOR_ROOTS_COMMON_LATIN_ROOTS",learningItems:learningRows.map(learningItemFromRow),environmentKey:"staging"});
  assert.equal(prepared.status,"ready",prepared.status==="blocked"?prepared.reason:"");
  if(prepared.status!=="ready")throw Error("PORT assignment not ready");
  fs.writeFileSync("outputs/latin-root-multi-family-20261127/staging-assignment-draft.json",JSON.stringify(prepared,null,2));
  const assignmentId=(await q("select persist_adle_latin_root_daily_plan_v3($1,$2,$3,$4,$5,'[]',$6) id",[parent,child,date,prepared.header,JSON.stringify(prepared.items),prepared.snapshot]))[0].id;
  const adopted=(await q("select adopt_adle_specialist_only_session_r6($1) result",[assignmentId]))[0].result;
  assert(adopted?.adopted,"Specialist session must be adopted");
  const fixture={environment:"staging",childId:child,parentUserId:parent,assignmentId,date,snapshotFingerprint:prepared.snapshot.provenance.sourceFingerprint,
   families:prepared.snapshot.payload.resolvedLesson.content.families,
   words:prepared.snapshot.payload.resolvedLesson.content.families.flatMap(f=>f.words).map(w=>({id:w.id,word:w.word,sentence:w.sentence,parts:w.parts})),
   expected:{items:20,independentAttempts:12,authenticTargets:2,transferWords:4},
   path:`/learn/week/adle?child=${child}&mode=child&adleDate=${date}`};
  fs.writeFileSync("outputs/latin-root-multi-family-20261127/staging-fixture.json",JSON.stringify(fixture,null,2));
  console.log({assignmentId,wordCount:fixture.words.length,itemCount:prepared.items.length,adopted:true});
 }
}catch(error){await q("rollback");throw error}finally{await sql.end()}
