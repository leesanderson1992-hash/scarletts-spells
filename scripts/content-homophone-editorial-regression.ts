import assert from 'node:assert/strict';
import {dictionaryEditorialContent} from '../lib/adle/homophone/dictionary-editorial';
import type {ContextualChoiceContent} from '../lib/adle/homophone/contextual-choice-contract';
const content = {
 microSkillKey:'D4_HOM_CONTENT_WORD_HOMOPHONES_MORNING_MOURNING',
 teachingExplanation:'Compare morning / mourning (sadness after someone dies).',
 sets:[{members:[{word:'morning',canonicalWordId:'day',intendedSense:'the early part of the day'},
   {word:'mourning',canonicalWordId:'grieve',intendedSense:'feeling sad because someone or something has died'}]}],
 questions:[{correctWordId:'day',sentenceWithBlank:'We left in the ____.'},
   {correctWordId:'grieve',sentenceWithBlank:'The family was in ____ after the funeral.'}],
 dictionaryFacts:[{wordId:'grieve',sense:{partOfSpeech:'verb',dictationSentence:'The family is mourning their old pet.'}}],
} as unknown as ContextualChoiceContent;
const projected=dictionaryEditorialContent(content);
assert(projected.teachingExplanation.includes('mourning (feeling sad because someone or something has died)'));
assert(!projected.teachingExplanation.includes('sadness after someone dies'));
assert.equal(projected.questions[1].sentenceWithBlank,'They are ____ their grandfather, who died last week.');
assert.notEqual(projected.questions[1].sentenceWithBlank.replace('____','mourning'),content.dictionaryFacts![0].sense.dictationSentence);
assert.deepEqual(projected.questions[0],content.questions[0]);assert.deepEqual(projected.dictionaryFacts,content.dictionaryFacts);
assert.equal(content.questions[1].sentenceWithBlank,'The family was in ____ after the funeral.');
for(const skill of ['D4_HOM_CONFUSABLE_WORDS_ACCEPT_EXCEPT','D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE']){
 const untouched={...content,microSkillKey:skill};assert.equal(dictionaryEditorialContent(untouched),untouched);
}
console.log({approvedExplanation:true,mourningVerbQuestion:true,questionIndependentOfDictation:true,existingLessonsUnchanged:true});
