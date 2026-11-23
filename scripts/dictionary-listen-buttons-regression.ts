import assert from 'node:assert/strict';
import {createElement, type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PronunciationListen} from '../app/(authenticated)/admin/teaching-dictionary/pronunciation-listen';
import {DictationListen} from '../app/(authenticated)/admin/teaching-dictionary/dictation-listen';
import {speakAuthoredNarration} from '../components/adle/activities/shared/narration';
import {britishPronunciationSample} from '../lib/teaching-dictionary-manager/pronunciation-playback';

// Reproduce an entry with a sentence recording but no isolated word recording.
const wordControl=PronunciationListen({word:'writer',ipa:'/ɹˈaɪtɐ/',approvedWord:'writer',approvedSenseSet:null});
const wordProps=(wordControl.props as {children:ReactElement<{sentence:string;kind:'word';recordingSrc?:string}>}).children.props;
assert.equal(wordProps.sentence,'writer');
assert.equal(wordProps.kind,'word');
assert.equal(wordProps.recordingSrc,undefined);
const spoken:string[]=[];
const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
const originalUtterance=Object.getOwnPropertyDescriptor(globalThis,'SpeechSynthesisUtterance');
try{
 Object.defineProperty(globalThis,'window',{configurable:true,value:{speechSynthesis:{cancel(){},getVoices(){return [];},speak(utterance:{text:string}){spoken.push(utterance.text);}},SpeechSynthesisUtterance:class{}}});
 Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
 speakAuthoredNarration(wordProps.sentence,wordProps.kind);
 assert.deepEqual(spoken,['writer']);
}finally{
 if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
 if(originalUtterance)Object.defineProperty(globalThis,'SpeechSynthesisUtterance',originalUtterance);else Reflect.deleteProperty(globalThis,'SpeechSynthesisUtterance');
}
const wordMarkup=renderToStaticMarkup(wordControl);
assert.match(wordMarkup,/Listen to word/);
assert.match(wordMarkup,/British word recording missing/);
const sentence='The author and writer planned a story.';
const sentenceMarkup=renderToStaticMarkup(createElement(DictationListen,{sentence,recordingSrc:'/audio/full-sentence.mp3'}));
assert.match(sentenceMarkup,/Listen to sentence/);
assert.match(sentenceMarkup,/src="\/audio\/full-sentence.mp3"/);
const close=PronunciationListen({word:'close',ipa:'/kləʊs/',approvedWord:'close',approvedSenseSet:null});
assert.equal((close.props as {children:ReactElement<{recordingSrc:string;sentence:string}>}).children.props.recordingSrc,britishPronunciationSample('close','/kləʊs/')?.src);
assert.equal((close.props as {children:ReactElement<{sentence:string}>}).children.props.sentence,'close');
console.log({passed:true,wordFallbackSpeaksOnlyWord:true,separateSentenceRecording:true,pronunciationSpecificClipPreserved:true});
