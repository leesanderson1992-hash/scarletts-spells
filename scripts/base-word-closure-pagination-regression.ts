import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadBaseWordClosureRows} from '../lib/adle/loaders/curriculum-release-authority';
async function main(){
  const all=Array.from({length:3},(_,a)=>Array.from({length:601},(_,i)=>({authority_id:`authority-${a}`,word_key:String(i).padStart(4,'0'),canonical_word_id:`${a}:${i}`}))).flat();
  let reads=0;
  const client={from(table:string){assert.equal(table,'adle_teaching_dictionary_closure_words');let authority='';const q={select(){return q;},eq(key:string,value:string){assert.equal(key,'authority_id');authority=value;return q;},order(key:string){assert.equal(key,'word_key');return q;},range(start:number,end:number){reads++;assert(end-start<500);return Promise.resolve({data:all.filter(r=>r.authority_id===authority).slice(start,end+1),error:null});}};return q;}} as unknown as SupabaseClient;
  const rows=await loadBaseWordClosureRows(client,['authority-0','authority-1','authority-2','authority-0']);
  assert.equal(rows.length,1803);assert.equal(new Set(rows.map(r=>r.canonical_word_id)).size,1803);
  assert.equal(reads,6,'Each immutable authority is read exactly once in bounded pages');
  assert.equal(rows.filter(r=>r.authority_id==='authority-2').length,601,'A later lesson must not lose its pool to the shared response cap');
  console.log('All 1803 closure words retained across three lesson authorities; duplicate reads avoided.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
