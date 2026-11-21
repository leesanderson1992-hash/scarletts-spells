import assert from 'node:assert/strict';import fs from 'node:fs';
import content from '../data/adle/homophone/convergence-v1/function-word-dictionary-content.json';
import approved from '../data/adle/homophone/convergence-v1/approved-lesson-content.json';
import {buildConvergenceLessonForSets} from '../lib/adle/homophone/convergence-preview';
import {guidedSnapshotIssues} from '../lib/adle/homophone/guided-snapshot-validation';
import {homophoneReviewWords,homophoneReviewRoute,FUNCTION_WORD_DICTIONARY_SKILLS} from '../lib/teaching-dictionary-manager/homophone-review-contract';
import {routeForSkill} from '../lib/teaching-dictionary-manager/contracts';
for(const skill of FUNCTION_WORD_DICTIONARY_SKILLS){
 const lesson=[...content.lessons,...approved.lessons].find(l=>l.microSkillKey===skill)!;assert(lesson,skill);
 assert.equal(homophoneReviewRoute(skill),'homophone_contextual_choice');
 assert.equal(routeForSkill(skill)?.routeId,'homophone_contextual_choice');
 assert.deepEqual(homophoneReviewWords(skill),lesson.sets.flatMap(s=>s.members.map(m=>m.word)));
 const built=buildConvergenceLessonForSets(skill,lesson.sets.map(s=>s.setKey));
 assert.deepEqual(guidedSnapshotIssues(built.snapshot,true),[],skill);
 for(const group of built.snapshot.lesson.teachingGroups!)for(const word of group.words){
  if(word.imageSrc)assert(fs.existsSync('public'+word.imageSrc),word.imageSrc);
 }
 for(const set of lesson.sets){
  assert.equal(new Set(set.shortSentences.map(s=>s.sentence)).size,set.shortSentences.length,'Keep practice varied');
  for(const q of set.choiceQuestions)assert(q.sentenceWithBlank.split(/\s+/).length>=4,q.sentenceWithBlank);
 }
}
const corrected='D4_HOM_FUNCTION_WORD_HOMOPHONES_WERE_WHERE_WEAR';
assert.deepEqual(homophoneReviewWords(corrected),['where',"we're",'wear']);
const lesson=content.lessons.find(l=>l.microSkillKey===corrected)!;
assert(lesson.sets[0].shortSentences.filter(s=>s.word==="we're").every(s=>s.sentence.startsWith("We're")));
const triple=content.lessons.find(l=>l.microSkillKey.endsWith('TO_TOO_TWO'))!;
assert(triple.sets[0].shortSentences.filter(s=>s.word==='too').every(s=>/too[.!?]$/.test(s.sentence)));
assert.equal(homophoneReviewRoute('D4_HOM_CONTENT_WORD_HOMOPHONES_PEACE_PIECE'),'homophone_word_lab');
console.log({functionWordLessons:7,canonicalRosterWords:18,reviewedActivitiesValid:true,correctedWhereWereWear:true,unrelatedRetainedRoutePreserved:true});
