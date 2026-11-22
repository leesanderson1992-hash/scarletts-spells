import assert from 'node:assert/strict';
import { normaliseWrittenSyllableBreakdown } from '../lib/teaching-dictionary-manager/authoring';
import { parseSchwaWorkbookFacts, schwaWorkbookFacts } from '../lib/teaching-dictionary-manager/weak-vowel-workbook';
import { parseDictionaryCsv } from '../lib/teaching-dictionary-manager/csv';
import { overviewSourceHash } from '../lib/teaching-dictionary-manager/overview-source-hash';
const fields = {weak_vowel_target:'er',weak_vowel_occurrence:'1',weak_vowel_sound:'Schwa',activity_syllables:'re-·en·ter',family_exploration:'Not used',age_band:'middle_primary',frequency_band:'high',complexity_band:'medium',has_schwa:'Yes'};
const parsed = parseSchwaWorkbookFacts('re-enter', fields);
assert.deepEqual(parsed.errors, [], 'A spelling hyphen must survive syllable parsing');
assert.deepEqual(parsed.annotation.acceptedCutSets, [[3,5]]);
assert.equal(parsed.annotation.target.start, 6);
assert.equal(parsed.annotation.target.syllableIndex, 3);
for (const input of ['re-·en-ter','re-‧en‧ter']) {
  const result=parseSchwaWorkbookFacts('re-enter',{...fields,activity_syllables:input});
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.annotation.acceptedCutSets,[[3,5]]);
}
for (const input of ['re·en·ter','re-·in·ter','re-··en·ter','re·-·en·ter'])
  assert(parseSchwaWorkbookFacts('re-enter',{...fields,activity_syllables:input}).errors.length,input);
const alternatives=parseSchwaWorkbookFacts('re-enter',{...fields,activity_syllables:'re-·en·ter | re·-en·ter'});
assert.deepEqual(alternatives.errors,[]);assert.deepEqual(alternatives.annotation.acceptedCutSets,[[3,5],[2,5]]);
const display=schwaWorkbookFacts('re-enter',alternatives.annotation as any).activity_syllables;
assert.equal(display,'re-·en·ter | re·-en·ter');
assert.deepEqual(parseSchwaWorkbookFacts('re-enter',{...fields,activity_syllables:display}).annotation.acceptedCutSets,[[3,5],[2,5]]);
const plain={...fields,weak_vowel_target:'a',activity_syllables:'a-bout'};
assert.deepEqual(parseSchwaWorkbookFacts('about',plain).errors,[]);
assert.deepEqual(parseSchwaWorkbookFacts('about',plain).annotation.acceptedCutSets,[[1]]);
assert(parseSchwaWorkbookFacts('about',{...plain,activity_syllables:'a-·bout'}).errors.length);
assert.equal(normaliseWrittenSyllableBreakdown('re-·en-ter','re-enter'),'re-·en·ter');
assert.equal(normaliseWrittenSyllableBreakdown('a-bout','about'),'a·bout');
assert.equal(normaliseWrittenSyllableBreakdown('a-bout'),'a·bout');
assert.equal(normaliseWrittenSyllableBreakdown('mother-·in-·law','mother-in-law'),'mother-·in-·law');
const [csv] = parseDictionaryCsv('display_word,written_syllable_breakdown\nre-enter,re-·en-ter');
assert.equal(csv.payload.writtenSyllableBreakdown,'re-·en·ter');
assert.equal(overviewSourceHash({display_word:'re-enter',written_syllable_breakdown:'re-·en-ter'}),
  overviewSourceHash({display_word:'re-enter',written_syllable_breakdown:'re-·en·ter'}));
assert.notEqual(overviewSourceHash({display_word:'re-enter',written_syllable_breakdown:'re·en·ter'}),
  overviewSourceHash({display_word:'re-enter',written_syllable_breakdown:'re-·en·ter'}));
console.log({passed:true,literalHyphensPreserved:true,legacySeparatorsAccepted:true,mixedSeparatorsAccepted:true,spellingErrorsRejected:true,exactOffsetsAndAlternativesRoundTrip:true});
