/** Attach verified full-sentence assets without changing Dictionary facts or lesson approvals. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
const environment=process.argv[2],apply=process.argv.includes('--apply');
assert(['staging','production'].includes(environment));
const connection=process.env[environment==='production'?'SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED':'SUPABASE_STAGING_DB_URL'];
assert(connection?.includes(environment==='production'?'wwohrqtunajrbwxyssjf':'qkpjbajicacbrphthibk'));
const manifest=JSON.parse(fs.readFileSync('content/teaching-dictionary/audio/google-en-gb-sentences-20261123/manifest.json','utf8'));
assert.equal(manifest.language,'en-GB');
assert(manifest.voices.length>0);
assert(manifest.voices.every((voice:string)=>['en-GB-Chirp3-HD-Achernar','en-GB-Neural2-A'].includes(voice)));
const only=process.argv.indexOf('--only-word');
const clips=manifest.entries.filter((row:{releaseStatus:string;word:string})=>row.releaseStatus==='verified_complete_sentence'&&(only<0||row.word===process.argv[only+1]));
assert(clips.length>0);
type Clip={id:string;word:string;text:string;src:string;sha256:string;coverageStatus:string;voice:string};
for(const row of clips as Clip[]){
 assert(manifest.voices.includes(row.voice));
 assert(['complete_text_match','complete_phonetic_match','complete_word_timing'].includes(row.coverageStatus));
 assert(row.src.startsWith('/audio/teaching-dictionary/google-en-gb-sentences-20261123/'));
 assert.equal(createHash('sha256').update(fs.readFileSync('public'+row.src)).digest('hex'),row.sha256);
}
const unique=[...new Map((clips as Clip[]).map(row=>[row.id+':'+row.text,row])).values()];
const db=new pg.Client({connectionString:connection});await db.connect();
try{
 await db.query('begin isolation level serializable');await db.query("set local lock_timeout='5s'");await db.query("set local statement_timeout='90s'");
 const actor=environment==='staging'?process.env.STAGING_ADMIN_USER_ID:(await db.query('select a.approved_by from writing_context_shadow_policy p join writing_context_provider_approvals a on a.id=p.provider_approval_id where p.singleton')).rows[0].approved_by;
 const facts=async()=> (await db.query(`select md5(coalesce(string_agg(canonical_word_id::text||sense_set::text,'' order by canonical_word_id),'')) value from teaching_dictionary_reviewed_sense_sets`)).rows[0].value;
 const before=await facts();
 const requested=unique.map(row=>({word_id:row.id,text:row.text,src:row.src,sha256:row.sha256,voice:row.voice}));
 const valid=await db.query(`with x as(select * from jsonb_to_recordset($1::jsonb) x(word_id uuid,text text,src text,sha256 text,voice text))
 select x.* from x join canonical_teaching_dictionary_words w on w.id=x.word_id
 left join teaching_dictionary_reviewed_sense_sets s on s.canonical_word_id=w.id
 where w.row_status='active' and w.review_status='approved_for_first_exposure' and w.dialect_code='en-GB'
 and case when s.canonical_word_id is not null then exists(select 1 from jsonb_array_elements(s.sense_set->'senses') sense
   where sense->>'partOfSpeech'<>'root' and btrim(sense->>'dictationSentence')=x.text)
 else exists(select 1 from canonical_teaching_dictionary_dictation_sentences d where d.canonical_word_id=w.id and d.row_status='active'
   and d.review_status='approved_for_first_exposure' and btrim(d.dictation_sentence)=x.text) end`,[JSON.stringify(requested)]);
 assert(valid.rows.length>0,'No current approved sentences match this environment');
 const inserted=await db.query(`insert into teaching_dictionary_british_recording_versions(canonical_word_id,kind,spoken_text,recording_src,sha256,reviewed_by,source_reference)
 select x.word_id,'sentence',x.text,x.src,x.sha256,$2::uuid,$3||'; voice '||x.voice from jsonb_to_recordset($1::jsonb) x(word_id uuid,text text,src text,sha256 text,voice text)
 where not exists(select 1 from teaching_dictionary_british_recording_versions r where r.canonical_word_id=x.word_id and r.kind='sentence' and r.spoken_text=x.text and r.sha256=x.sha256 and r.recording_src=x.src)
 returning id`,[JSON.stringify(valid.rows),actor,'Owner-authorised complete British dictation sentences 2026-11-23; Google Cloud British English; entire approved sentence synthesised; local transcription/phonetic or returned per-word timing coverage checked; manifest google-en-gb-sentences-20261123']);
 const readback=await db.query(`with x as(select * from jsonb_to_recordset($1::jsonb) x(word_id uuid,text text,src text,sha256 text,voice text)) select count(*)::int total from x where exists(select 1 from teaching_dictionary_british_recording_versions r where r.canonical_word_id=x.word_id and r.kind='sentence' and r.spoken_text=x.text and r.recording_src=x.src and r.sha256=x.sha256)`,[JSON.stringify(valid.rows)]);
 assert.equal(readback.rows[0].total,valid.rows.length);assert.equal(await facts(),before,'Audio attachment must not change approved meanings');
 await db.query(apply?'commit':'rollback');
 const report={environment,apply,requested:unique.length,currentSentenceMatches:valid.rows.length,inserted:inserted.rowCount,existing:valid.rows.length-inserted.rowCount!,factsUnchanged:true,skippedChangedOrAbsent:unique.filter(row=>!valid.rows.some(v=>v.word_id===row.id&&v.text===row.text)).map(row=>({word:row.word,text:row.text})),attached:valid.rows};
 const dir='outputs/dictionary-spoken-divisions-audio-20261123';fs.writeFileSync(`${dir}/${environment}-audio-${apply?'attached':'dry-run'}.json`,JSON.stringify(report,null,2));
 console.log({...report,attached:undefined,skippedChangedOrAbsent:report.skippedChangedOrAbsent.length});
}catch(error){await db.query('rollback');throw error;}finally{await db.end();}
