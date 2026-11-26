import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { projectReleasedBaseWordMorphology } from '../lib/adle/loaders/base-word-family-lesson-read-model';
import { approvedWorkbookFamily } from '../lib/teaching-dictionary-manager/workbook-family-resolution';
import { familySearchResults } from '../lib/teaching-dictionary-manager/family-search';
import { matchingDependencyFamily } from '../lib/teaching-dictionary-manager/family-dependencies';
import { mergeWordFamilySummaries } from '../lib/teaching-dictionary-manager/base-family-summary';

async function main() {
  const old = { family_key: 'busy-old', canonical_family_key: 'busy-current', revision: 1, base_lemma: 'busy', base_meaning: 'having a lot to do', base_kind: 'free_base' as const, base_part_of_speech: 'adjective', review_status: 'approved', is_current_family: false };
  const current = { ...old, family_key: 'busy-current', base_meaning: 'Having lots to do, or full of activity.', is_current_family: true };
  const otherSense = { ...current, family_key: 'busy-different', canonical_family_key: 'busy-different', base_meaning: 'A deliberately distinct reviewed meaning.' };
  assert.deepEqual(familySearchResults([old, current, otherSense], 'busy').map(f => f.id), ['busy-different', 'busy-current'], 'Archive only the reviewed duplicate; keep distinct meanings searchable');
  const dependency = { confirmed_family_key: old.family_key, expected_meaning: old.base_meaning, base_form: 'busy', base_kind: 'free_base' };
  assert.equal(matchingDependencyFamily(dependency, [old, current])?.family_key, current.family_key, 'Saved family decisions follow the reviewed successor');
  assert.equal(matchingDependencyFamily({ ...dependency, confirmed_family_key: null }, [old, current])?.family_key, current.family_key, 'Old wording resolves only through the recorded equivalence');
  const parts = [{ id: 'base', kind: 'base', sourceText: 'busy', surfaceText: 'busi', gloss: current.base_meaning, displayRange: { start: 0, end: 4 } },
    { id: 'suffix', kind: 'suffix', sourceText: 'er', surfaceText: 'er', gloss: 'More.', displayRange: { start: 4, end: 6 } }];
  const join = [{ afterPartId: 'base', beforePartId: 'suffix', joinType: 'none' }];
  const change = { type: 'base_spelling_change', sourcePartId: 'base', sourceText: 'busy', surfaceText: 'busi', explanation: 'Change y to i before er.' };
  const projected = projectReleasedBaseWordMorphology('busier', parts, join, [change], 'regular');
  assert(projected);
  assert.equal(projected.transformations[0].transformationKey, 'change_final_y_to_i');
  assert.equal(change.type, 'base_spelling_change', 'Immutable reviewed facts remain untouched');
  assert.equal(projectReleasedBaseWordMorphology('busier', parts, join, [{ ...change, sourceText: 'happy' }], 'regular'), null, 'A mismatched legacy transformation is not silently repaired');
  const reads: string[] = [];
  const db = { from(table: string) {
    assert.equal(table, 'teaching_dictionary_families_with_current_meaning');
    let key = '';
    const query = { select() { return query; }, eq(field: string, value: string) { assert.equal(field, 'family_key'); key = value; return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { reads.push(key); return Promise.resolve({ data: [old, current].find(row => row.family_key === key), error: null }); } };
    return query;
  } } as unknown as SupabaseClient;
  const resolved = await approvedWorkbookFamily(db, old.family_key);
  assert.equal(resolved?.key, current.family_key);
  assert.equal(resolved.meaning, current.base_meaning, 'Old workbook IDs resolve to the approved meaning');
  assert.deepEqual(reads, [old.family_key, current.family_key]);
  const merged = mergeWordFamilySummaries([], [{ name: current.family_key, aliases: [old.family_key, 'busy-lab'], meaning: current.base_meaning, words: [{ id: 'busy', word: 'busy' }] }],
    [{ name: old.family_key, words: [{ id: 'busier', word: 'busier' }] }, { name: 'busy-lab', words: [{ id: 'busiest', word: 'busiest' }] }], new Set([old.family_key, current.family_key]));
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].words.map(w => w.word), ['busier', 'busiest', 'busy']);
  assert.equal(merged[0].meaning, current.base_meaning);
  const bridged = mergeWordFamilySummaries([], [{ name: current.family_key, baseWordId: 'busy', baseKind: 'free_base', compatibilityMeanings: [old.base_meaning], meaning: current.base_meaning, words: merged[0].words }],
    [{ name: 'unregistered-legacy-route', baseWordId: 'busy', meaning: old.base_meaning, words: merged[0].words }], new Set());
  assert.equal(bridged.length, 1, 'A recorded equivalence also reconciles the exact legacy lesson family');
  const distinct = mergeWordFamilySummaries([], [{ ...bridged[0], compatibilityMeanings: [] }],
    [{ name: 'different-meaning', baseWordId: 'busy', meaning: 'A distinct meaning.', words: merged[0].words }], new Set());
  assert.equal(distinct.length, 2, 'Matching spelling and members alone never merge meanings');
  console.log('Approved successor only in search, old workbook compatibility, distinct senses and all historical members preserved.');
}
void main();
