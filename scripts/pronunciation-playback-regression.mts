import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {britishPronunciationSample,wordClipMatchesPronunciation} from '../lib/teaching-dictionary-manager/pronunciation-playback';
import {britishPronunciationReferenceForText} from '../lib/teaching-dictionary-manager/british-recordings';
import type {DictionarySenseSet} from '../lib/teaching-dictionary-manager/senses';
const set:DictionarySenseSet={senses:[{id:'near',definition:'Near.',partOfSpeech:'adjective',pronunciationId:'s'}],pronunciations:[{id:'s',ipa:'/kləʊs/',spokenSyllableCount:1,stressPattern:'primary'}]};
const sample=britishPronunciationSample('close','/kləʊs/');assert(sample);
assert.equal(britishPronunciationSample('close','/kləʊz/'),null);
assert.equal(britishPronunciationSample('closed','/kləʊs/'),null);
const input={word:'close',approvedWord:'close',ipa:'/kləʊs/',approvedSenseSet:set};
assert.equal(wordClipMatchesPronunciation(input),true);
assert.equal(wordClipMatchesPronunciation({...input,ipa:'/kləʊz/'}),false);
assert.equal(wordClipMatchesPronunciation({...input,word:'closer'}),false);
const multiple={senses:[...set.senses,{id:'shut',definition:'Shut.',partOfSpeech:'verb',pronunciationId:'z'}],pronunciations:[...set.pronunciations,{id:'z',ipa:'/kləʊz/',spokenSyllableCount:1,stressPattern:'primary'}]};
assert.equal(wordClipMatchesPronunciation({...input,approvedSenseSet:multiple}),false);
const bytes=readFileSync(`public${sample.src}`);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'f218b4eeadc21e91fce058b0761fd7701fe7500f4ffeb83c8561995cb9a38b8f');
assert.equal(bytes.subarray(0,3).toString(),'ID3');
function mock(senseSet:DictionarySenseSet) {
 return {from(table:string){const result={error:null,data:table==='canonical_teaching_dictionary_words'?[{id:'close'}]:{sense_set:senseSet}};
 const query={select(){return query;},eq(){return query;},limit(){return Promise.resolve(result);},maybeSingle(){return Promise.resolve(result);}};return query;}};
}
assert.equal((await britishPronunciationReferenceForText({client:mock(set) as never,text:'close'}))?.src,sample.src);
assert.equal(await britishPronunciationReferenceForText({client:mock(multiple) as never,text:'close'}),null);
assert.equal(await britishPronunciationReferenceForText({client:mock(set) as never,text:'wind'}),null);
console.log({passed:true,exactIpaClip:true,verbExcluded:true,staleAndAmbiguousClipsExcluded:true,referenceDoesNotApproveFacts:true});
