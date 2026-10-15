import assert from "node:assert/strict";
import { reviewedWordCanLaunch } from "../lib/teaching-dictionary-manager/editorial-review";
import { compilerCoverage } from "../lib/teaching-dictionary-manager/compiler-coverage";
import { canonicalStructureBlockers, dictationVariantBlockers, targetOccurrences, selectDictationVariant, generatedWordSum, writtenSyllableBlockers } from "../lib/teaching-dictionary-manager/authoring";

assert.deepEqual(targetOccurrences("She said responsible, responsible again.", "responsible"), [2, 3]);
assert.deepEqual(targetOccurrences("We put ice cream beside ice cream.", "ice cream"), [2, 5]);
const variants = [{ id: "a", sentence: "Be responsible.", targetTokenIndex: 1, audioText: "Be responsible." },
  { id: "b", sentence: "She is responsible.", targetTokenIndex: 2, audioText: "She is responsible." }];
assert.deepEqual(dictationVariantBlockers("responsible", variants), []);
assert(dictationVariantBlockers("responsible", [{ ...variants[1], targetTokenIndex: 0 }]).length);
assert(dictationVariantBlockers("responsible", [{ ...variants[1], audioText: "different" }]).length);
assert(dictationVariantBlockers("responsible", [variants[0], variants[0]]).length);
assert.deepEqual(selectDictationVariant(variants, "child:date:word"), selectDictationVariant([...variants].reverse(), "child:date:word"));
assert.equal(new Set(Array.from({ length: 10 }, (_, day) => selectDictationVariant(variants, `child:2026-10-${day}:word`)!.id)).size, 2);
assert.deepEqual(writtenSyllableBlockers("responsible", "re-spon-si-ble"), []);
assert(writtenSyllableBlockers("responsible", "re-spon-sa-ble").length);
assert.equal(generatedWordSum([{sourceText:"help"},{sourceText:"ful"}],"helpful"), "help + ful → helpful");
const ids = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
let calls = 0;
const result = compilerCoverage(ids, 4, set => { calls++; return ["10", "11", "12"].every(id => set.includes(id)) ? { set } : null; });
assert(result.complete, "members beyond the former first-120 sample must receive compiler witnesses");
assert(calls > 120);
assert.equal(Object.keys(result.witnesses).length, 12);
assert(!compilerCoverage(ids, 4, () => null).complete);
assert(!compilerCoverage(ids.slice(0,3), 4, () => ({})).complete);
console.log("PASS: all dictation variants, target occurrences, stable variation, syllables and complete compiler coverage");

const structure={rawSegmentation:"",rawPartOfSpeech:"adjective",parts:[{id:"base",sourceText:"holy",surfaceText:"holi",kind:"base"},{id:"suffix",sourceText:"ness",surfaceText:"ness",kind:"suffix"}],featureKeys:[],joins:[{afterPartId:"base",beforePartId:"suffix",joinType:"none"}],wordSum:"holy + ness → holiness",analysisStatus:"approved" as const,reviewNotes:"Reviewed",transformationNotes:"",transformations:[{type:"remove_letter",sourcePartId:"base",sourceText:"holy",surfaceText:"hol",explanation:"Remove the final y"},{type:"replace_final",sourcePartId:"base",sourceText:"hol",surfaceText:"holi",explanation:"Use i before the suffix"}]};
assert.deepEqual(canonicalStructureBlockers(structure,"holiness"),[]);
assert(canonicalStructureBlockers({...structure,transformations:[...structure.transformations].reverse()},"holiness").length);
assert(canonicalStructureBlockers({...structure,transformations:[]},"holiness").length);
assert(canonicalStructureBlockers({...structure,joins:[{afterPartId:"wrong",beforePartId:"suffix",joinType:"none"}]},"holiness").length);

const reviewed={id:"word",ready:true,reviewedDraftId:"reviewed-draft"};const witnesses={word:["word","filler"]};
assert(reviewedWordCanLaunch(reviewed,"reviewed-draft",witnesses));
assert(!reviewedWordCanLaunch(reviewed,"older-draft",witnesses));
assert(!reviewedWordCanLaunch({...reviewed,requiredForRelease:false},null,witnesses));
assert(!reviewedWordCanLaunch(reviewed,null,{}));
console.log("PASS: ordered transformation chains and exact per-word review/witness launch guards");
