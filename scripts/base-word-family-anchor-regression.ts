import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBaseWordFamilyAnchors, chooseBaseWordFamilyAnchor } from '../lib/adle/loaders/base-word-family-anchors';
import { baseWordAnchorFamilyKeys } from '../lib/adle/loaders/published-base-family-words';

const sense = { id: 'work-verb', definition: 'To do a job or task.', partOfSpeech: 'verb', pronunciationId: 'spoken', dictationSentence: 'We work together.', dictationTargetTokenIndex: 1 };
const tables: Record<string, Record<string, unknown>[]> = {
  canonical_teaching_dictionary_words: [{ id: 'work', display_word: 'work', row_status: 'active', review_status: 'approved_for_first_exposure' }],
  teaching_dictionary_reviewed_sense_sets: [{ canonical_word_id: 'work', sense_set: { senses: [sense], pronunciations: [{ id: 'spoken', ipa: '/wɜːk/', spokenSyllableCount: 1, stressPattern: 'primary' }] } }],
  teaching_dictionary_current_sense_morphology: [{ id: 'parts', canonical_word_id: 'work', sense_id: sense.id, morphology_parts: [{ id: 'base', kind: 'base', sourceText: 'work', surfaceText: 'work', gloss: 'old wording', displayRange: { start: 0, end: 4 } }], morphology_joins: [], word_sum: 'work → work' }],
  teaching_dictionary_families_with_current_meaning: [{ family_key: 'work-verb-family', revision: 1, review_status: 'approved', base_kind: 'free_base', canonical_base_word_id: 'work', canonical_base_sense_id: sense.id }],
  teaching_dictionary_current_sense_family_memberships: [{ canonical_word_id: 'work', sense_id: sense.id, sense_morphology_id: 'parts', family_key: 'work-verb-family', component_part_id: 'base', relationship_kind: 'free_base' }],
  teaching_dictionary_reviewed_sense_sentences: [{ id: 'sentence', canonical_word_id: 'work', sense_id: sense.id, sentence: sense.dictationSentence, target_token_index: 1, source_row_hash: 'a'.repeat(64) }],
};
const reads: string[] = [];
function db() {
  return { from(table: string) {
    reads.push(table); assert(table in tables, `Unexpected lesson assignment dependency: ${table}`);
    let rows = structuredClone(tables[table]);
    const query = { select() { return query; }, in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      order() { rows.sort((a, b) => Number(b.revision) - Number(a.revision)); return query; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
    return query;
  } } as unknown as SupabaseClient;
}
async function main() {
  const [anchor] = await loadBaseWordFamilyAnchors(db(), ['work', 'work']);
  assert(anchor, 'A reviewed base supports its family without a lesson binding or demonstrates assignment');
  assert.equal(anchor.parts[0].gloss, sense.definition);
  assert.equal(reads.length, 6, 'Duplicate base IDs share the bounded reads');
  const family = { baseWordId: 'work', baseFamilyKey: 'legacy-work', baseMeaning: sense.definition };
  assert.equal(chooseBaseWordFamilyAnchor([anchor], family, []), anchor);
  assert.equal(chooseBaseWordFamilyAnchor([anchor], { ...family, baseMeaning: 'A job or task.' }, []), null,
    'One remaining sense is not permission to replace a different released meaning');
  const noun = { ...anchor, familyKey: 'work-noun', sense: { ...anchor.sense, senseId: 'work-noun', meaning: 'A job or task.' } };
  assert.equal(chooseBaseWordFamilyAnchor([anchor, noun], { ...family, baseMeaning: 'unclear' }, []), null);
  assert.equal(chooseBaseWordFamilyAnchor([anchor, noun], family, ['work-noun']), noun);
  assert.equal(chooseBaseWordFamilyAnchor([anchor, noun], family, ['work-noun', anchor.familyKey]), anchor,
    'An exact reviewed release meaning disambiguates families sharing one spelling');
  assert.equal(chooseBaseWordFamilyAnchor([anchor, noun], {...family,baseMeaning:'unclear'}, ['work-noun', anchor.familyKey]), null);
  assert.equal(chooseBaseWordFamilyAnchor([anchor, noun], {...family,baseMeaning:'historical wording'}, ['work-noun', anchor.familyKey], [anchor.familyKey]), anchor,
    'An explicit current base lesson meaning preserves a historical family when another sense is added');
  const alias = {...anchor,familyKey:'work-verb-old-key'};
  assert.deepEqual(chooseBaseWordFamilyAnchor([anchor,alias],family,[anchor.familyKey,alias.familyKey])?.equivalentFamilyKeys,
    [anchor.familyKey,alias.familyKey], 'Duplicate family keys for one reviewed sense do not block its members');
  assert.deepEqual(baseWordAnchorFamilyKeys(['play-recording', 'play-recording'], ['play-game']), ['play-recording'],
    'The base spelling lesson choice must not override the derived recording family');
  assert.deepEqual(baseWordAnchorFamilyKeys([], ['play-game']), ['play-game'],
    'A base lesson choice remains the fallback when no derived member has selected a family');
  assert.deepEqual(baseWordAnchorFamilyKeys(['play-game', 'play-recording'], []), ['play-game', 'play-recording'],
    'A genuinely mixed derived family remains ambiguous and cannot silently pass');
  const saved = structuredClone(tables);
  tables.teaching_dictionary_families_with_current_meaning[0].canonical_base_sense_id = null;
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work']))[0]?.sense.senseId, sense.id,
    'An explicitly reviewed whole-base link supplies a legacy family anchor without renaming it');
  tables.teaching_dictionary_current_sense_family_memberships.push({
    ...tables.teaching_dictionary_current_sense_family_memberships[0], sense_id: 'work-noun',
  });
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work'])).length, 0,
    'Ambiguous legacy base meanings cannot be silently selected');
  Object.assign(tables, structuredClone(saved));
  tables.teaching_dictionary_current_sense_family_memberships = [];
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work'])).length, 0, 'Unlinked bases do not silently form a family');
  Object.assign(tables, structuredClone(saved));
  tables.teaching_dictionary_current_sense_morphology[0].morphology_parts = [{ id: 'root', kind: 'root', sourceText: 'work', surfaceText: 'work' }];
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work'])).length, 0, 'Bound roots are not free bases');
  Object.assign(tables, structuredClone(saved));
  tables.teaching_dictionary_reviewed_sense_sentences = [];
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work'])).length, 0, 'Unreviewed sentences cannot enter the lesson');
  Object.assign(tables, structuredClone(saved));
  tables.teaching_dictionary_families_with_current_meaning.unshift({ ...tables.teaching_dictionary_families_with_current_meaning[0], revision: 2, review_status: 'draft' });
  assert.equal((await loadBaseWordFamilyAnchors(db(), ['work'])).length, 0, 'A newer incomplete revision cannot fall back to old approval');
  console.log('Base family anchors: independent support, exact senses, approved parts, sentence provenance and revision checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
