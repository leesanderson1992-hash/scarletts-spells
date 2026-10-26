import { hydrateWorkspaceFacts } from "../lib/teaching-dictionary-manager/workspace-hydration";
import { emptyMetadata, emptyMorphology, publicationBlockers, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";
import { lessonActivityQuestion } from "../lib/teaching-dictionary-manager/activity-question";
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

for (const activities of [{ introduction: { prompt: "Welcome" }, reflection: { prompt: "Reflect" } }, [], null]) {
  const question = lessonActivityQuestion({kind:"reflection",route:{routeId:"dynamic_affix_word_lab",wordMeaning:"meaning",content:{}} as unknown as Parameters<typeof lessonActivityQuestion>[0]["route"],word:"responsible",wordId:null,compiled:{activities},sources:[]});
  assert.equal(typeof question,"string");
}
assert.equal(lessonActivityQuestion({kind:"reflection",route:{} as Parameters<typeof lessonActivityQuestion>[0]["route"],word:"word",wordId:null,compiled:{activities:[{canonical:{concept:"LESSON_REFLECTION"},payload:{prompt:"What changed?"}}]},sources:[]}),"What changed?");
console.log("PASS: activity questions support native object and flat activity array snapshots");

const incompleteOverview:WordDraftPayload={displayWord:"word",definition:"a unit of language",dictationSentence:"Say a word.",dictationTargetTokenIndex:2,writtenSyllableBreakdown:"word",ageBand:"middle_primary",frequencyBand:"common",complexityBand:"simple",metadata:emptyMetadata(),canonicalMorphology:emptyMorphology(),provenance:{sourceCategory:"internal_authored",sourceName:"test",sourceUrl:"",sourceLicence:"",sourceUseNote:"test",confidence:"high"},skillKeys:[],routeContents:[]};
assert(publicationBlockers(incompleteOverview,"word").includes("Review the canonical morphology parts."));
assert(publicationBlockers(incompleteOverview,"word").includes("Add the word's part of speech."));
const completeOverview={...incompleteOverview,canonicalMorphology:{...emptyMorphology(),analysisStatus:"approved" as const,rawPartOfSpeech:"noun",parts:[{id:"base",sourceText:"word",surfaceText:"word",kind:"base",gloss:"a unit of language"}],wordSum:"word → word"}};
assert.deepEqual(publicationBlockers(completeOverview,"word"),[]);
assert(publicationBlockers({...completeOverview,canonicalMorphology:{...completeOverview.canonicalMorphology,parts:[{...completeOverview.canonicalMorphology.parts[0],gloss:""}]}},"word").some(message=>message.includes("meaning for each morphology part")));
console.log("PASS: new Overview approvals require reviewed parts, meanings and part of speech");

// A late readiness response must reuse current authority but cannot overwrite edits or drafts.

const oldRoute = { routeId: "base_word_lab", routeVersion: "v1", microSkillKey: "base", wordMeaning: "old", wordSum: "word", content: { baseMeaning: "old" } };
const initialWorkspace = { ...completeOverview, skillKeys: ["base"], routeContents: [oldRoute] };
const incomingRoute = { ...oldRoute, wordMeaning: "current release", content: { baseMeaning: "current" } };
const hydrate = (current: WordDraftPayload, draftId: string | null = null) => hydrateWorkspaceFacts({ current, initial: initialWorkspace, draftId, edited: true, skillKeys: ["base", "suffix"], routeContents: [incomingRoute] });
assert.equal(hydrate(initialWorkspace).routeContents[0].wordMeaning, "current release");
const editedWorkspace = { ...initialWorkspace, definition: "Admin edit", routeContents: [{ ...oldRoute, wordMeaning: "Admin route edit" }] };
assert.equal(hydrate(editedWorkspace).routeContents[0].wordMeaning, "Admin route edit");
assert.equal(hydrate(editedWorkspace).definition, "Admin edit");
assert.deepEqual(hydrate(initialWorkspace, "selected-draft"), initialWorkspace);
console.log("PASS: deferred route authority preserves current releases, in-progress edits and selected drafts");
