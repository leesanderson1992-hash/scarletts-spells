import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivatedBaseWordReleaseAuthority } from '../lib/adle/curriculum-release-activation';
import { BASE_WORD_FAMILY_PREVIEW_READ_MODEL as fixture } from '../lib/adle/morphology/base-word-family-preview-fixture';
import { loadBaseWordFamilyLessonReadModel } from '../lib/adle/loaders/base-word-family-lesson-read-model';
import { compileBaseWordFamilyLessonSnapshot } from '../lib/adle/morphology/base-word-family-payload';

async function main() {
  const authority = {
    microSkillKey: fixture.microSkillKey,
    teachingContent: {microSkillKey:fixture.microSkillKey,contentVersion:fixture.contentVersion},
    dictionaryWords: fixture.familySections.flatMap(f=>f.guidedWords.map(w=>({...w,
      dictationSentence:w.displayWord==='play'?'We play outside.':w.dictationSentence}))),
    family: {schemaVersion:2,skillClusterKey:'D4_MOR_BASE_WORDS',sourceAuthorities:[],families:fixture.familySections.map(f=>({
      baseFamilyKey:f.baseFamilyKey,baseWordId:f.baseWord.canonicalWordId,baseMeaning:f.baseMeaning,etymologyRoute:f.etymologyRoute,
      members:f.guidedWords.map(w=>({canonicalWordId:w.canonicalWordId,structuralRole:w.canonicalWordId===f.baseWord.canonicalWordId?'base':'family_member',
        assignmentEligible:true,applicableMicroSkillKeys:[fixture.microSkillKey],wordSum:w.wordSum,morphologyParts:w.parts,
        morphologyJoins:w.joins,morphologyTransformations:w.transformations,transformationNotes:w.transformationNotes,
        childFriendlyMeaning:w.childFriendlyMeaning,
        ...(w.displayWord==='play'?{dictionarySenseId:'play-recording',dictionaryDictation:{sentence:'Please play the song again.',targetTokenIndex:1,audioText:'Please play the song again.'}}:{})}))}))},
  } as unknown as ActivatedBaseWordReleaseAuthority;
  const request={microSkillKey:fixture.microSkillKey,contentVersion:fixture.contentVersion,releaseAuthority:authority,
    authenticTargets:fixture.authenticTargets,sections:fixture.familySections.map(f=>({baseFamilyKey:f.baseFamilyKey,
      authenticTargetWordIds:f.authenticTargetWordIds,guidedWordIds:f.guidedWords.map(w=>w.canonicalWordId)})),independentSlots:fixture.independentSlots,pilotLessonNumber:1};
  const model=await loadBaseWordFamilyLessonReadModel({} as SupabaseClient,request);assert(model);
  const snapshot=compileBaseWordFamilyLessonSnapshot(model);
  assert.equal(snapshot.familySections[0].baseWord.dictationSentence,'Please play the song again.');
  assert.equal(snapshot.independentWords.find(w=>w.displayWord==='play')?.dictationSentence,'Please play the song again.',
    'Independent dictation must use the same reviewed sense as the family, not another sense sharing the spelling');
  assert.equal(snapshot.familySections[1].baseWord.dictationSentence,fixture.familySections[1].baseWord.dictationSentence,
    'Existing frozen sentences remain the fallback when no canonical sense projection is supplied');
  console.log('Base Word family-specific dictation survives both guided and independent compilation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
