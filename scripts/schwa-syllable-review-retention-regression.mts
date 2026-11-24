import assert from "node:assert/strict";
import { retainedSchwaSyllableReviewEpoch } from "../lib/teaching-dictionary-manager/schwa-syllable-review-retention";
import { emptyMetadata, emptyMorphology, type WordDraftPayload } from "../lib/teaching-dictionary-manager/contracts";

const skill="D4_SCHWA_INITIAL_E_INITIAL", resetAt="2026-11-23T04:17:27.915+00:00";
const pronunciation={id:"gb",ipa:"/ɪˈnʌf/",spokenSyllableCount:2,stressPattern:"unstressed-primary"};
const previous:WordDraftPayload={displayWord:"enough",definition:"As much as is needed.",dictationSentence:"We have enough paint.",dictationTargetTokenIndex:2,
  writtenSyllableBreakdown:"e·nough",ageBand:"early_primary",frequencyBand:"high",complexityBand:"low",metadata:emptyMetadata(),canonicalMorphology:emptyMorphology(),
  provenance:{sourceCategory:"internal_authored",sourceName:"review",sourceUrl:"",sourceLicence:"internal",sourceUseNote:"Reviewed",confidence:"high"},
  senseSet:{senses:[{id:"review",partOfSpeech:"determiner",definition:"As much as is needed.",pronunciationId:"gb"}],pronunciations:[pronunciation]},
  skillKeys:[skill],skillSenseIds:{[skill]:"review"},routeContents:[{routeId:"weak_vowel_word_lab",routeVersion:"v1",microSkillKey:skill,wordMeaning:"As much as is needed.",wordSum:"enough",content:{schwaWorkbookFields:{written_syllable_breakdown:"e·nough",syllable_review_epoch:resetAt}}}]};
const input={previous,word:"enough",skill,senseId:"review",pronunciation,divisions:"e·nough",resetAt};
assert.equal(retainedSchwaSyllableReviewEpoch(input),resetAt,"Family restaging must preserve the reviewed cuts");
assert.equal(retainedSchwaSyllableReviewEpoch({...input,divisions:"e-nough"}),resetAt,"Separator normalisation is not a new fact");
const familyChanged=structuredClone(previous);familyChanged.routeContents[0].content.familyAuthorityId="new-reviewed-family";
assert.equal(retainedSchwaSyllableReviewEpoch({...input,previous:familyChanged}),resetAt);
assert.equal(retainedSchwaSyllableReviewEpoch({...input,divisions:"en·ough"}),"");
assert.equal(retainedSchwaSyllableReviewEpoch({...input,resetAt:"2026-11-24T00:00:00Z"}),"");
for(const changed of [{...pronunciation,ipa:"/əˈnʌf/"},{...pronunciation,spokenSyllableCount:3},{...pronunciation,stressPattern:"primary-unstressed"},{...pronunciation,id:"different"}])
  assert.equal(retainedSchwaSyllableReviewEpoch({...input,pronunciation:changed}),"");
assert.equal(retainedSchwaSyllableReviewEpoch({...input,senseId:"other"}),"");
assert.equal(retainedSchwaSyllableReviewEpoch({...input,word:"enoughs"}),"");
assert.equal(retainedSchwaSyllableReviewEpoch({...input,previous:null}),"");
const lostToken=structuredClone(previous);delete (lostToken.routeContents[0].content.schwaWorkbookFields as {syllable_review_epoch?:string}).syllable_review_epoch;
assert.equal(retainedSchwaSyllableReviewEpoch({...input,previous:lostToken}),"","An unreviewed draft cannot manufacture approval");
assert.equal(previous.routeContents[0].content.schwaWorkbookFields && (previous.routeContents[0].content.schwaWorkbookFields as {syllable_review_epoch:string}).syllable_review_epoch,resetAt);
console.log({passed:true,unchangedFamilyReviewRetained:true,changedCutsPronunciationAndResetRejected:true,unreviewedFactsRejected:true});
