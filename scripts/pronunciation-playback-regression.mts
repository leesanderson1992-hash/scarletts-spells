import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {britishPronunciationSample,wordClipMatchesPronunciation} from '../lib/teaching-dictionary-manager/pronunciation-playback';
import {approvedBritishRecording,britishPronunciationReferenceForText} from '../lib/teaching-dictionary-manager/british-recordings';
import type {DictionarySenseSet} from '../lib/teaching-dictionary-manager/senses';
import recordings from '../lib/teaching-dictionary-manager/pronunciation-recordings.json';
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
assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256);
assert(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255);
assert.equal(recordings.length,70);
for(const row of recordings){assert(!['graph','photographer','funnier'].includes(row.word.toLowerCase()));assert.equal(createHash('sha256').update(readFileSync(`public${row.src}`)).digest('hex'),row.sha256);}
function mock(senseSet:DictionarySenseSet) {
 return {from(table:string){const result={error:null,data:table==='canonical_teaching_dictionary_words'?[{id:'close'}]:{sense_set:senseSet}};
 const query={select(){return query;},eq(){return query;},limit(){return Promise.resolve(result);},maybeSingle(){return Promise.resolve(result);}};return query;}};
}
assert.equal((await britishPronunciationReferenceForText({client:mock(set) as never,text:'close'}))?.src,sample.src);
assert.equal(await britishPronunciationReferenceForText({client:mock(multiple) as never,text:'close'}),null);
assert.equal(await britishPronunciationReferenceForText({client:mock(set) as never,text:'wind'}),null);
function recordingClient(senses:DictionarySenseSet|null,legacyIpa='/kləʊs/'){
 return {from(table:string){const data=table==='teaching_dictionary_british_recording_versions'?{recording_src:sample!.src,sha256:sample!.sha256}:table==='teaching_dictionary_reviewed_sense_sets'?(senses?{sense_set:senses}:null):{phoneme_hint:legacyIpa};const result={data,error:null};
 const query={select(){return query;},eq(){return query;},order(){return query;},limit(){return query;},maybeSingle(){return Promise.resolve(result);}};return query;}};
}
const request={wordId:'close',kind:'word' as const,text:'close'};
assert.equal((await approvedBritishRecording({...request,client:recordingClient(set) as never}))?.src,sample.src);
assert.equal(await approvedBritishRecording({...request,client:recordingClient(multiple) as never}),null);
const changed={...set,pronunciations:[{...set.pronunciations[0],ipa:'/kləʊz/'}]};
assert.equal(await approvedBritishRecording({...request,client:recordingClient(changed) as never}),null);
assert.equal(wordClipMatchesPronunciation({...input,ipa:'/kləʊz/',approvedSenseSet:changed,wordRecordingSrc:sample.src}),false);
assert.equal((await approvedBritishRecording({...request,client:recordingClient(null) as never}))?.src,sample.src);
assert.equal(await approvedBritishRecording({...request,client:recordingClient(null,'/kləʊz/') as never}),null);
console.log({passed:true,exactIpaClip:true,verbExcluded:true,staleAndAmbiguousClipsExcluded:true,referenceDoesNotApproveFacts:true});
