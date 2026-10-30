#!/usr/bin/env node
/** Owner-approved UK word/sentence recordings. Dry-run by default. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
const url=process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const actor=(process.env.ADMIN_USER_IDS??"").split(",")[0];
if(!url||!new URL(url).username.includes("wwohrqtunajrbwxyssjf")||
 !new URL(url).hostname.endsWith("pooler.supabase.com")||!/^[a-f0-9-]{36}$/i.test(actor))
 throw Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const apply=process.argv.includes("--apply");
const baseArg=process.argv.indexOf("--public-base");
const publicBase=baseArg>=0?process.argv[baseArg+1]:null;
if(apply&&(!publicBase||!publicBase.startsWith("https://")))throw Error("PUBLIC_ASSET_BASE_REQUIRED");
const manifest=JSON.parse(readFileSync("content/secret-life-of-vowels/audio-approved/google-chirp3-en-gb-20261029/manifest.json","utf8"));
if(manifest.reviewStatus!=="owner_approved_pronunciation"||manifest.clips.length!==470||
 manifest.language!=="en-GB"||manifest.encoding!=="MP3")throw Error("AUDIO_MANIFEST_NOT_APPROVED");
const clips=manifest.clips as Array<{id:string;kind:"word"|"sentence";text:string;path:string;src:string;sha256:string;bytes:number;reviewStatus:string}>;
const unique=new Set<string>();
for(const clip of clips){
 if(!/^[a-f0-9-]{36}$/i.test(clip.id)||!(["word","sentence"] as string[]).includes(clip.kind)||
  clip.reviewStatus!=="owner_approved_pronunciation"||
  clip.src!==`${manifest.publicAssetRoot}/${clip.path}`||!/^\/audio\/[a-z0-9/_-]+\.mp3$/i.test(clip.src)||
  unique.has(`${clip.id}:${clip.kind}`))throw Error(`INVALID_CLIP:${clip.id}:${clip.kind}`);
 unique.add(`${clip.id}:${clip.kind}`);
 const bytes=readFileSync(`public${clip.src}`);
 if(bytes.length!==clip.bytes||createHash("sha256").update(bytes).digest("hex")!==clip.sha256||
  bytes.length<1000||bytes[0]!==255)throw Error(`ASSET_HASH_MISMATCH:${clip.src}`);
}
if(unique.size!==470||new Set(clips.map(c=>c.id)).size!==235)throw Error("AUDIO_COVERAGE_MISMATCH");
if(apply){
 for(let i=0;i<clips.length;i+=20){
  const batch=clips.slice(i,i+20);
  await Promise.all(batch.map(async clip=>{
   const response=await fetch(`${publicBase}${clip.src}`,{cache:"no-store"});
   if(!response.ok)throw Error(`PUBLIC_ASSET_MISSING:${clip.src}:${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(createHash("sha256").update(bytes).digest("hex")!==clip.sha256)
    throw Error(`PUBLIC_ASSET_HASH_MISMATCH:${clip.src}`);
  }));
 }
}
const db=new pg.Client({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
await db.connect();
try{
 await db.query("begin isolation level serializable");
 await db.query("set local lock_timeout='5s'");
 await db.query("set local statement_timeout='120s'");
 const before=(await db.query(`select jsonb_build_object('children',(select count(*) from public.children),
  'learningItems',(select count(*) from public.adle_learning_items),
  'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
  'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
 const evidence=await db.query(`with x as (select * from jsonb_to_recordset($1::jsonb)
  as x(canonical_word_id uuid,kind text,spoken_text text)),
  checked as (select x.*,w.display_word,w.row_status,w.review_status,w.dialect_code,
   sentence.dictation_sentence from x
   left join public.canonical_teaching_dictionary_words w on w.id=x.canonical_word_id
   left join lateral (select d.dictation_sentence from public.canonical_teaching_dictionary_dictation_sentences d
    where d.canonical_word_id=x.canonical_word_id and d.row_status='active'
     and d.review_status='approved_for_first_exposure'
    order by d.created_at desc,d.id desc limit 1) sentence on true)
  select count(*)::int total,
   count(*) filter(where display_word is null or row_status<>'active' or review_status<>'approved_for_first_exposure'
    or dialect_code<>'en-GB')::int invalid_words,
   count(*) filter(where (kind='word' and spoken_text is distinct from display_word)
     or (kind='sentence' and spoken_text is distinct from dictation_sentence))::int invalid_text
  from checked`,[JSON.stringify(clips.map(c=>({canonical_word_id:c.id,kind:c.kind,spoken_text:c.text})))]);
 if(evidence.rows[0].total!==470||evidence.rows[0].invalid_words||evidence.rows[0].invalid_text)
  throw Error(`CURRENT_DICTIONARY_TEXT_CHANGED:${JSON.stringify(evidence.rows[0])}`);
 const existing=await db.query(`select canonical_word_id,kind,spoken_text,sha256 from public.teaching_dictionary_british_recording_versions
  where canonical_word_id=any($1::uuid[])`,[[...new Set(clips.map(c=>c.id))]]);
 const toInsert=[];
 for(const clip of clips){
  const rows=existing.rows.filter(r=>r.canonical_word_id===clip.id&&r.kind===clip.kind&&r.spoken_text===clip.text);
  if(rows.some(r=>r.sha256!==clip.sha256))throw Error(`EXISTING_DIFFERENT_APPROVAL:${clip.id}:${clip.kind}`);
  if(!rows.length)toInsert.push({canonical_word_id:clip.id,kind:clip.kind,spoken_text:clip.text,
   recording_src:clip.src,sha256:clip.sha256,reviewed_by:actor,
   source_reference:`Owner pronunciation approval 2026-10-30; Google Cloud Chirp 3 HD en-GB Achernar; Schwa audio manifest ${manifest.sourceWorkbookSha256}`});
 }
 if(toInsert.length)await db.query(`insert into public.teaching_dictionary_british_recording_versions
  (canonical_word_id,kind,spoken_text,recording_src,sha256,reviewed_by,source_reference)
  select x.canonical_word_id::uuid,x.kind,x.spoken_text,x.recording_src,x.sha256,x.reviewed_by::uuid,x.source_reference
  from jsonb_to_recordset($1::jsonb) as x(canonical_word_id text,kind text,spoken_text text,
   recording_src text,sha256 text,reviewed_by text,source_reference text)`,[JSON.stringify(toInsert)]);
 const afterRows=await db.query(`select canonical_word_id,kind,spoken_text,recording_src,sha256
  from public.teaching_dictionary_british_recording_versions where canonical_word_id=any($1::uuid[])`,
  [[...new Set(clips.map(c=>c.id))]]);
 for(const clip of clips)if(!afterRows.rows.some(r=>r.canonical_word_id===clip.id&&r.kind===clip.kind&&
  r.spoken_text===clip.text&&r.recording_src===clip.src&&r.sha256===clip.sha256))
  throw Error(`APPROVAL_READBACK_FAILED:${clip.id}:${clip.kind}`);
 const after=(await db.query(`select jsonb_build_object('children',(select count(*) from public.children),
  'learningItems',(select count(*) from public.adle_learning_items),
  'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
  'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error("LEARNER_STATE_CHANGED");
 if(apply)await db.query("commit");else await db.query("rollback");
 console.log(JSON.stringify({environment:"production",mode:apply?"approved":"rollback_proof",clips:470,
  inserted:toInsert.length,existing:470-toInsert.length,publicAssetsVerified:apply?470:0,learnerState:before}));
}catch(e){await db.query("rollback").catch(()=>{});throw e}finally{await db.end()}
