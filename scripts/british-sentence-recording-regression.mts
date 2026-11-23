import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {britishRecordingForText} from '../lib/teaching-dictionary-manager/british-recordings';
type Row=Record<string,unknown>;
const sentence='The author and writer planned a story.';
function client(options:{legacy?:boolean;current?:string;duplicate?:boolean;root?:boolean;active?:boolean;fail?:string}={}) {
 const words=['writer',...(options.duplicate?['author']:[])];
 const rows:Record<string,Row[]>={
  teaching_dictionary_british_recording_versions:words.map(id=>({id,canonical_word_id:id,kind:'sentence',spoken_text:sentence,recording_src:'/audio/full-sentence.mp3',sha256:'complete-audio',approved_at:'2026-11-23'})),
  canonical_teaching_dictionary_words:words.map(id=>({id,row_status:options.active===false?'superseded':'active',review_status:'approved_for_first_exposure',dialect_code:'en-GB'})),
  teaching_dictionary_reviewed_sense_sets:options.legacy?[]:words.map(id=>({canonical_word_id:id,sense_set:{pronunciations:[],senses:[{id:'sense',partOfSpeech:options.root?'root':'noun',dictationSentence:options.current??sentence}]}})),
  canonical_teaching_dictionary_dictation_sentences:options.legacy||options.current?[{canonical_word_id:'writer',dictation_sentence:sentence,row_status:'active',review_status:'approved_for_first_exposure'}]:[],
 };
 class Query {
  data:Row[]; constructor(readonly table:string){this.data=[...(rows[table]??[])];}
  select(){return this;} eq(key:string,value:unknown){this.data=this.data.filter(row=>row[key]===value);return this;}
  in(key:string,values:unknown[]){this.data=this.data.filter(row=>values.includes(row[key]));return this;}
  order(){return this;} limit(n:number){this.data=this.data.slice(0,n);return this;}
  maybeSingle(){return Promise.resolve({data:this.data[0]??null,error:options.fail===this.table?{message:'read failed'}:null});}
  then(resolve:(r:{data:Row[];error:null|{message:string}})=>unknown){return Promise.resolve({data:this.data,error:options.fail===this.table?{message:'read failed'}:null}).then(resolve);}
 }
 return {from:(table:string)=>new Query(table)} as unknown as SupabaseClient;
}
const lookup=(db:SupabaseClient,text=sentence)=>britishRecordingForText({client:db,text,kind:'sentence'});
assert.equal((await lookup(client()))?.src,'/audio/full-sentence.mp3','Reviewed sense sentences need no old dictation row');
assert.equal((await lookup(client({legacy:true})))?.source,'dictionary','Approved legacy sentences remain supported');
assert.equal((await lookup(client({duplicate:true})))?.src,'/audio/full-sentence.mp3','Shared full sentences may reuse one clip');
assert.equal(await lookup(client({current:'The writer finished a book.'})),null,'An old row cannot override the current approved meaning sentence');
assert.equal(await lookup(client(),'The author'),null,'A sentence excerpt never matches full-sentence audio');
assert.equal(await lookup(client({root:true})),null);
assert.equal(await lookup(client({active:false})),null);
await assert.rejects(()=>lookup(client({fail:'teaching_dictionary_reviewed_sense_sets'})),/SENTENCE_AUTHORITY_FAILED/);
console.log('Full sentences, canonical meanings, shared clips, stale text, excerpts, roots and read failures passed.');
