import assert from 'node:assert/strict';
import { projectReleasedBaseWordMorphology } from '../lib/adle/loaders/base-word-family-lesson-read-model';
import { baseSpellingRestorationForPart, finalYRestorationForBasePart } from '../lib/adle/morphology/base-word-family-payload';
import { canonicalBaseWordAnalysis } from '../lib/adle/base-word-canonical-analysis';
const parts = [{ id: 'base', kind: 'base', sourceText: 'late', surfaceText: 'lat', gloss: 'after the expected time', displayRange: { start: 0, end: 3 } },
  { id: 'suffix', kind: 'suffix', sourceText: 'er', surfaceText: 'er', gloss: 'more', displayRange: { start: 3, end: 5 } }];
const input = { displayWord: 'later', parts, joins: [{ afterPartId: 'base', beforePartId: 'suffix', joinType: 'none' }],
  transformations: [{ type: 'drop_final_e', sourcePartId: 'base', sourceText: 'late', surfaceText: 'lat', explanation: 'Drop the final e.' }],
  wordSum: 'late + er → later', componentPartId: 'base', baseSource: 'late', relationshipKind: 'derived' };
assert(canonicalBaseWordAnalysis(input), 'The canonical er suffix replaces an older late + r analysis');
assert(!canonicalBaseWordAnalysis({ ...input, transformations: [] }), 'A suggested change still needs an approved record');
assert(!canonicalBaseWordAnalysis({ ...input, baseSource: 'lat' }), 'The approved family base must match');
assert(!canonicalBaseWordAnalysis({ ...input, wordSum: 'late + r → later' }), 'An old sum cannot conflict with the current parts');
assert(!canonicalBaseWordAnalysis({ ...input, displayWord: 'latter' }), 'The visible parts must spell the actual word');
assert(!canonicalBaseWordAnalysis({ ...input, relationshipKind: 'irregular_inflection' }));
assert(!canonicalBaseWordAnalysis({ ...input, parts: parts.map(part => ({ ...part, gloss: '' })) }), 'Missing glosses remain blocked');
assert(!canonicalBaseWordAnalysis({ ...input, transformations: [{ ...input.transformations[0], type: 'other_reviewed_change' }] }), 'Unclassified regularity must be reviewed');
const dying = { ...input, displayWord: 'dying', baseSource: 'die', wordSum: 'die + ing → dying', relationshipKind: 'regular_inflection',
  parts: [{ ...parts[0], sourceText: 'die', surfaceText: 'dy', displayRange: { start: 0, end: 2 } },
    { ...parts[1], sourceText: 'ing', surfaceText: 'ing', displayRange: { start: 2, end: 5 } }],
  transformations: [{ type: 'change_final_ie_to_y', sourcePartId: 'base', sourceText: 'die', surfaceText: 'dy', explanation: 'Change final ie to y before -ing.' }] };
assert(canonicalBaseWordAnalysis(dying), 'The reviewed ie-to-y rule is a regular spelling change');
console.log('Canonical Base Word corrections preserve family identity, approved transformations and spelling checks.');

const projected = projectReleasedBaseWordMorphology(input.displayWord, input.parts, input.joins, input.transformations, 'regular');
assert(projected);
assert.equal(projected.transformations[0]?.type, 'drop_final_e');
assert.equal(baseSpellingRestorationForPart(parts[0], projected.transformations)?.sourceText, 'late');
assert.equal(finalYRestorationForBasePart(parts[0], projected.transformations), null, 'Final-y lessons retain their existing meaning');
assert.equal(baseSpellingRestorationForPart({...parts[0], sourceText:'lately'}, projected.transformations), null, 'Restoration cannot invent a different base');
