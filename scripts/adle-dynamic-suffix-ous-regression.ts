/* Reviewed fixture objects are deliberately asserted at runtime. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const pkg=JSON.parse(readFileSync("docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ous/reviewed-staging-package.json","utf8"));
const rule="-ous turns a naming word into a describing word meaning “full of” or “having.”";
assert.equal(pkg.profile.introContent.meaningStatement,rule); assert.equal(JSON.stringify(pkg).split(rule).length-1,1);
assert.deepEqual(pkg.words.map((w:any)=>w.word),["dangerous","poisonous","famous","mysterious"]); assert.equal(pkg.profile.includeMeaningSort,false);
assert.deepEqual(pkg.words.map((w:any)=>w.teaching.parts.map((p:any)=>p.surfaceText).join("|")),["danger|ous","poison|ous","fam|ous","mysteri|ous"]);
assert.match(pkg.words[2].trueMorphology.notes,/drop the final e/); assert.match(pkg.words[3].trueMorphology.notes,/change y to i/);
assert(pkg.profile.introContent.spellingRules.some((x:string)=>x.includes("courage keeps its final e")));
for(const word of pkg.words){assert.equal(word.teaching.parts.map((p:any)=>p.surfaceText).join(""),word.word);assert.equal(word.dictation.audioText,word.dictation.sentence);assert(word.trueMorphology.provenance);}
console.log("Dynamic suffix -ous package regression passed.");
