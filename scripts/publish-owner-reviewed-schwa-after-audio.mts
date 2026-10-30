#!/usr/bin/env node
/** Publish complete, assigned Schwa routes after owner written and audio approval. Dry-run default. */
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadWeakVowelRepairInventory } from "./weak-vowel-repair-source";
import { repairSourceFingerprint } from "../lib/teaching-dictionary-manager/weak-vowel-repair";
import { weakVowelRouteBlockers } from "../lib/teaching-dictionary-manager/weak-vowel-authoring";

process.loadEnvFile(".env.local");
const url=process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor=(process.env.ADMIN_USER_IDS??"").split(",")[0];
if(!url||!new URL(url).username.includes("wwohrqtunajrbwxyssjf")||
 !new URL(url).hostname.endsWith("pooler.supabase.com")||!/^[a-f0-9-]{36}$/i.test(actor))
 throw Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply=process.argv.includes("--apply");
const limitArg=process.argv.indexOf("--limit");
const limit=limitArg>=0?Number(process.argv[limitArg+1]):239;
if(!Number.isInteger(limit)||limit<1||limit>239)throw Error("INVALID_LIMIT");
const manifest=JSON.parse(readFileSync("content/secret-life-of-vowels/schwa-written-facts-owner-review-20261029.json","utf8"));
const audio=JSON.parse(readFileSync("content/secret-life-of-vowels/audio-approved/google-chirp3-en-gb-20261029/manifest.json","utf8"));
const clips=new Map<string,any>(audio.clips.map((clip:any)=>[`${clip.id}:${clip.kind}`,clip]));
const live=await loadWeakVowelRepairInventory(url,"production");
const sources=new Map(live.sources.map(s=>[`${s.word.id}:${s.microSkillKey}`,s]));
const candidates=[] as Array<{row:any;source:typeof live.sources[number];facts:any;wordClip:any;sentenceClip:any}>;
for(const row of manifest.rows){
 if(row.reviewStatus!=="approved_written")continue;
 const source=sources.get(`${row.canonicalWordId}:${row.microSkillKey}`);
 if(!source||source.assignmentStatus!=="assigned"||source.routes.some((route:any)=>route.weak_vowel_published))continue;
 const wordClip=clips.get(`${row.canonicalWordId}:word`);
 const sentenceClip=clips.get(`${row.canonicalWordId}:sentence`);
 if(!wordClip||!sentenceClip||row.familyDecision!=="skip"||
   source.word.display_word!==row.word||source.metadata.length!==1||
   !source.dictations.some(d=>d.review_status==="approved_for_first_exposure"&&d.dictation_sentence===row.approvedSentence))
  throw Error(`SOURCE_OR_AUDIO_CHANGED:${row.word}:${row.microSkillKey}`);
 const sentence=row.approvedSentence.toLocaleLowerCase("en-GB");
 const word=row.word.toLocaleLowerCase("en-GB");
 const start=sentence.indexOf(word);
 if(start<0||sentence.lastIndexOf(word)!==start)throw Error(`AMBIGUOUS_SENTENCE_TARGET:${row.word}`);
 const facts={schemaVersion:"weak_vowel_route_facts_v1",sourceFingerprint:repairSourceFingerprint(source),
  activityEligibility:{dinner:{status:"ready",reason:null},detective:{status:"ready",reason:null},
   memoryLock:{status:"ready",reason:null},dictation:{status:"ready",reason:null},
   family:{status:"not_applicable",reason:null}},
  wordSense:null,pronunciationId:`google-chirp3-en-gb:${wordClip.sha256}`,
  wordRecording:{src:wordClip.src,sha256:wordClip.sha256},
  spokenSyllableCount:Number(source.metadata[0].syllables),acceptedCutSets:row.proposedSpokenCuts,
  target:row.lessonTarget,selectionTarget:row.selectedVowel,detectiveVowelIndex:row.selectedVowel.start,
  familyDecision:"skip",familyAuthorityId:null,canonicalFamilyId:null,
  sentenceRecording:{src:sentenceClip.src,sha256:sentenceClip.sha256},
  sentenceTarget:{start,end:start+row.word.length},
  reviewSourceReference:`Owner-reviewed Schwa written facts workbook SHA-256 ${manifest.workbookSha256} row ${row.workbookRow}; owner-approved UK audio 2026-10-30; Google Chirp 3 HD en-GB Achernar`};
 const blockers=weakVowelRouteBlockers(facts,{displayWord:row.word,definition:row.sourceMeaning,
  dictationSentence:row.approvedSentence,microSkillKey:row.microSkillKey});
 if(blockers.length)throw Error(`ROUTE_BLOCKED:${row.word}:${blockers.join(",")}`);
 candidates.push({row,source,facts,wordClip,sentenceClip});
}
if(candidates.length>239)throw Error("CANDIDATE_COVERAGE_EXCEEDED");
const selected=candidates.sort((a,b)=>a.row.microSkillKey.localeCompare(b.row.microSkillKey)||a.row.word.localeCompare(b.row.word)).slice(0,limit);
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
 await db.query("begin isolation level serializable");
 await db.query("set local lock_timeout='5s'");
 await db.query("set local statement_timeout='300s'");
 const protectedState=async()=>(await db.query(`select jsonb_build_object(
  'children',(select count(*) from public.children),
  'learningItems',(select count(*) from public.adle_learning_items),
  'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
  'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
 const before=await protectedState();
 const published=[] as Array<{word:string;skill:string;version:string}>;
 for(const {row,source,facts,wordClip,sentenceClip} of selected){
  const recording=await db.query(`select kind,spoken_text,recording_src,sha256 from public.teaching_dictionary_british_recording_versions
   where canonical_word_id=$1 and ((kind='word' and spoken_text=$2) or (kind='sentence' and spoken_text=$3))`,
   [row.canonicalWordId,row.word,row.approvedSentence]);
  if(!recording.rows.some(r=>r.kind==='word'&&r.recording_src===wordClip.src&&r.sha256===wordClip.sha256)||
   !recording.rows.some(r=>r.kind==='sentence'&&r.recording_src===sentenceClip.src&&r.sha256===sentenceClip.sha256))
   throw Error(`RECORDING_APPROVAL_MISSING:${row.word}`);
  const written=await db.query(`select decision_status,lesson_target,selected_vowel,family_decision,dictionary_fingerprint
   from public.teaching_dictionary_weak_vowel_written_reviews where canonical_word_id=$1 and micro_skill_key=$2
    and workbook_sha256=$3`,[row.canonicalWordId,row.microSkillKey,manifest.workbookSha256]);
  if(written.rows.length!==1||written.rows[0].decision_status!=="approved_written"||
   JSON.stringify(written.rows[0].lesson_target)!==JSON.stringify(row.lessonTarget)||
   JSON.stringify(written.rows[0].selected_vowel)!==JSON.stringify(row.selectedVowel)||
   written.rows[0].family_decision!=="skip")throw Error(`WRITTEN_REVIEW_CHANGED:${row.word}`);
  const route={routeId:"weak_vowel_word_lab",routeVersion:"v1",microSkillKey:row.microSkillKey,
   wordMeaning:row.sourceMeaning,wordSum:"",content:{weakVowel:facts}};
  const payload={displayWord:row.word,definition:row.sourceMeaning,dictationSentence:row.approvedSentence,
   skillKeys:[row.microSkillKey],routeContents:[route],canonicalMorphology:{parts:[],joins:[],transformations:[]}};
  const draft=await db.query<{id:string}>(`insert into public.teaching_dictionary_manager_drafts
   (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
   values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5::uuid) returning id`,
   [row.canonicalWordId,source.word.normalised_word,JSON.stringify(payload),facts.reviewSourceReference,actor]);
  const staged=await db.query<{ids:string[]}>("select public.stage_teaching_dictionary_route_draft($1::uuid,$2::uuid) ids",[draft.rows[0].id,actor]);
  if(staged.rows[0].ids.length!==1)throw Error(`STAGE_FAILED:${row.word}`);
  const version=staged.rows[0].ids[0];
  await db.query("select public.review_teaching_dictionary_route_content($1::uuid,$2::uuid)",[version,actor]);
  await db.query("select public.publish_adle_weak_vowel_content_v1($1::uuid,$2::uuid,$3,$4,$5)",
   [version,actor,facts.sourceFingerprint,wordClip.sha256,sentenceClip.sha256]);
  published.push({word:row.word,skill:row.microSkillKey,version});
 }
 const ids=published.map(p=>p.version);
 const receipt=ids.length?await db.query(`select count(*)::int n from public.adle_weak_vowel_content_publications where content_version_id=any($1::uuid[])`,[ids]):{rows:[{n:0}]};
 if(receipt.rows[0].n!==published.length)throw Error("PUBLICATION_READBACK_FAILED");
 const after=await protectedState();
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error("LEARNER_STATE_CHANGED");
 if(apply)await db.query("commit");else await db.query("rollback");
 console.log(JSON.stringify({environment:"production",mode:apply?"published":"rollback_proof",
  pendingBefore:candidates.length,selected:published.length,sample:published.slice(0,5),learnerState:before}));
}catch(e){await db.query("rollback").catch(()=>{});throw e}finally{await db.end()}
