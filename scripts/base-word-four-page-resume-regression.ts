import assert from 'node:assert/strict';
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from '../lib/adle/morphology/base-word-family-preview-fixture';
import { BASE_WORD_TEACHING_PRESENTATION_VERSION } from '../lib/adle/morphology/base-word-family-payload';
import { normaliseBaseWordFamilyResume } from '../lib/adle/morphology/base-word-family-resume';
import { candidateBaseWordTeachingPages, releasedBaseWordTeachingPages } from '../lib/adle/morphology/base-word-teaching-pages';
const payload = { ...BASE_WORD_FAMILY_PREVIEW_PAYLOAD, teachingPresentationVersion: BASE_WORD_TEACHING_PRESENTATION_VERSION };
const state = { stage: 'dictation', teachingPageIndex: candidateBaseWordTeachingPages(payload).pages.length,
  familyIndex: 1, cleaveIndex: 1, cleaveStep: 0, cleaveCuts: {}, cleaveMisses: {}, buildIndex: 0, controlledIndex: 5, dictationIndex: 3,
  controlledAttempts: {}, controlledChecked: {}, sentenceAttempts: {}, sentenceChecked: false, reflectionText: '' };
assert.equal(normaliseBaseWordFamilyResume(state, payload)?.dictationIndex, 3,
  'Meet-the-words is the fourth page; later activity progress must survive reload');
assert.equal(normaliseBaseWordFamilyResume({ ...state, stage: 'intro' }, payload)?.teachingPageIndex, 3);
assert.equal(normaliseBaseWordFamilyResume({ ...state, teachingPageIndex: 4 }, payload), null);
const legacy = { ...BASE_WORD_FAMILY_PREVIEW_PAYLOAD, teachingPresentationVersion: undefined };
assert.equal(normaliseBaseWordFamilyResume({ ...state, teachingPageIndex: releasedBaseWordTeachingPages(legacy).pages.length }, legacy)?.dictationIndex, 3);
assert.equal(normaliseBaseWordFamilyResume(state, legacy), null, 'Historical lessons retain their own page bounds');
console.log('Four-page teaching, subsequent activity resume and historical page bounds passed.');
