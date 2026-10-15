import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {loadLessonReadiness} from '../lib/teaching-dictionary-manager/lesson-preflight';
/** Integration proof: reads live authority only; never approves or publishes content. */
async function main(){
 if (!process.argv.includes("--live-readonly")) throw new Error("Pass --live-readonly with an explicitly configured database");
 const all=await loadLessonReadiness(); const results=[];
 for(const scope of [{wordId:'2b11de62-dad4-5b67-aba4-585ddfd7253d'},{wordId:'3729b83b-98b8-5ede-8db3-67150a8e1364'},{routeId:'dynamic_prefix_word_lab',microSkillKey:'D4_MOR_PREFIXES_UN'}]){
  const scoped=await loadLessonReadiness(scope);assert(scoped.length>0);
  for(const row of scoped){const expected=all.find(r=>r.routeId===row.routeId&&r.microSkillKey===row.microSkillKey);assert(expected);assert.deepEqual(row,expected,`${row.routeId}:${row.microSkillKey} must preserve the entire group and compiler result`);}
  results.push({scope,groups:scoped.map(r=>({route:r.routeId,skill:r.microSkillKey,members:r.words.length,compilerReady:r.compilerReady,fingerprint:r.preflightFingerprint}))});
 }
 writeFileSync('.tmp/word-performance-equivalence.json',JSON.stringify({passed:true,results},null,2));console.log('PASS: scoped native and affix readiness exactly matches full registry readiness, including every member, review, compiler witness, activation and fingerprint');
}main().catch(e=>{console.error(e);process.exitCode=1});
