/** Reconcile existing released base entries in staging, without assigning or
 * publishing them to a lesson. Defaults to a read-only plan; --apply is scoped
 * to the known staging project and requires its admin actor. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnabledBaseWordReleaseAuthorities } from '../lib/adle/loaders/curriculum-release-authority';
import { loadBaseWordFamilyAnchors } from '../lib/adle/loaders/base-word-family-anchors';
import { createWorkbookFamily, loadWorkbookFamilyChoices } from '../lib/teaching-dictionary-manager/workbook-family-resolution';
import { normaliseSensePronunciations, senseSetErrors, type DictionarySenseSet } from '../lib/teaching-dictionary-manager/senses';
import { targetOccurrences } from '../lib/teaching-dictionary-manager/authoring';

const STAGING = 'https://qkpjbajicacbrphthibk.supabase.co';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, STAGING, 'Staging only');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, 'staging');
const actor = process.env.STAGING_ADMIN_USER_ID;
const apply = process.argv.includes('--apply');
if (apply) assert(actor, 'The staging admin actor is required');
const db = createClient(STAGING, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const nounBases = new Set(['angle', 'baby', 'book', 'car', 'cat', 'child', 'city', 'dog', 'face', 'joy', 'knife', 'magic', 'map', 'nature', 'sign', 'story', 'wolf', 'word']);
const excluded = new Map([['port', 'The released carry meaning is a bound root; do not create an English free-base verb family.'], ['late', 'Confirm adjective versus adverb for this meaning.']]);
const norm = (s: string) => s.toLowerCase().replace(/[\s.!]+/g, ' ').trim();
const read = async <T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> => {
  const result = await query; if (result.error) throw Error(result.error.message); return result.data;
};
async function main() {
  const [release] = await loadEnabledBaseWordReleaseAuthorities({ client: db, environmentKey: 'staging', microSkillKeys: ['D4_MOR_BASE_WORDS_IDENTIFY_BASE'] });
  assert(release, 'An enabled reviewed release is required');
  const ids = [...new Set(release.family.families.map(f => f.baseWordId))];
  const [words, reviewed, metadata, dictation] = await Promise.all([
    read(db.from('canonical_teaching_dictionary_words').select('id,display_word,normalised_word,row_status,review_status').in('id', ids)),
    read(db.from('teaching_dictionary_reviewed_sense_sets').select('canonical_word_id,sense_set,reviewed_at').in('canonical_word_id', ids)),
    read(db.from('canonical_teaching_dictionary_word_metadata').select('canonical_word_id,phoneme_hint,syllables,stress_pattern').in('canonical_word_id', ids)
      .eq('row_status', 'active').eq('review_status', 'approved_for_first_exposure').order('created_at', { ascending: false })),
    read(db.from('canonical_teaching_dictionary_dictation_sentences').select('canonical_word_id,dictation_sentence').in('canonical_word_id', ids)
      .eq('row_status', 'active').eq('review_status', 'approved_for_first_exposure').order('created_at', { ascending: false })),
  ]);
  const anchorsBefore = await loadBaseWordFamilyAnchors(db, ids);
  const report: Array<{ word: string; wordId: string; status: string; detail: string; familyKey?: string }> = [];
  for (const id of ids) {
    const word = (words ?? []).find(row => row.id === id);
    if (!word) throw Error(`Released base entry is missing: ${id}`);
    const log = { word: word.display_word, wordId: id, status: '', detail: '' };
    const prior = anchorsBefore.filter(row => row.wordId === id);
    if (prior.length) { report.push({ ...log, status: 'already_anchored', detail: `${prior.length} approved sense-specific families` }); continue; }
    const current = (reviewed ?? []).find(row => row.canonical_word_id === id);
    const source = release.family.families.filter(f => f.baseWordId === id);
    const meanings = [...new Set(source.map(f => f.baseMeaning))];
    const existingSet = current?.sense_set as DictionarySenseSet | undefined;
    const exact = existingSet?.senses.filter(s => meanings.some(meaning => norm(meaning) === norm(s.definition))) ?? [];
    if (existingSet) {
      // Leave other approved senses intact. A mismatch needs an explicit decision.
      if (exact.length === 1 && exact[0].partOfSpeech !== 'root') {
        const choices = await loadWorkbookFamilyChoices(db, word.normalised_word, false, null);
        if (choices.bases.some(base => base.senseId === exact[0].id)) {
          if (!apply) { report.push({ ...log, status: 'planned_family', detail: 'Reuse the exact reviewed base meaning and whole-base analysis.' }); continue; }
          const family = await createWorkbookFamily(db, actor!, word.normalised_word, exact[0].id, null);
          assert(family);
          const ready = (await loadBaseWordFamilyAnchors(db, [id])).some(anchor => anchor.familyKey === family.key);
          report.push({ ...log, status: ready ? 'reconciled' : 'family_ready', detail: ready ? 'Reused the existing approved base meaning.' : 'Family is ready; review the base pronunciation and dictation before lesson use.', familyKey: family.key });
          continue;
        }
      }
      report.push({ ...log, status: 'review', detail: exact.length === 1 ? 'Reviewed meaning exists; check its whole-base parts and family before automatic reconciliation.' : 'The current reviewed senses do not identify one exact released base meaning.' }); continue;
    }
    const blocked = excluded.get(word.normalised_word);
    const meaning = meanings.length === 1 ? meanings[0] : '';
    const pos = /^to /i.test(meaning) ? 'verb' : nounBases.has(word.normalised_word) ? 'noun' : word.normalised_word === 'one' ? 'numeral' : '';
    if (blocked || !meaning || !pos) { report.push({ ...log, status: 'review', detail: blocked ?? 'The reviewed source does not identify one clear base meaning and part of speech.' }); continue; }
    const facts = (metadata ?? []).find(row => row.canonical_word_id === id);
    const sentence = (dictation ?? []).find(row => row.canonical_word_id === id)?.dictation_sentence ?? '';
    const targets = targetOccurrences(sentence, word.display_word);
    const pronunciationId = `base-pronunciation:${id}`;
    const senseId = `base-${pos}:${id}`;
    const set = normaliseSensePronunciations({ pronunciations: [{ id: pronunciationId, ipa: facts?.phoneme_hint ?? '', spokenSyllableCount: Number(facts?.syllables) || null, stressPattern: facts?.stress_pattern ?? '' }],
      senses: [{ id: senseId, definition: meaning, partOfSpeech: pos, pronunciationId, dictationSentence: sentence, dictationTargetTokenIndex: targets.length === 1 ? targets[0] : undefined }] });
    const errors = senseSetErrors(set);
    if (word.row_status !== 'active' || word.review_status !== 'approved_for_first_exposure' || errors.length || targets.length !== 1) {
      report.push({ ...log, status: 'review', detail: [...errors, ...(targets.length !== 1 ? ['A reviewed sentence with one target is required.'] : [])].join(' ') || 'The dictionary entry is not approved.' }); continue;
    }
    if (!apply) { report.push({ ...log, status: 'planned', detail: `${pos}: ${meaning}` }); continue; }
    const parts = [{ id: 'base', kind: 'base', sourceText: word.normalised_word, surfaceText: word.display_word, gloss: meaning, displayRange: { start: 0, end: word.display_word.length } }];
    await read(db.rpc('import_reviewed_teaching_dictionary_word', { p_request_id: randomUUID(), p_word_id: id, p_display_word: word.display_word, p_expected_reviewed_at: '', p_sense_set: set,
      p_analyses: [{ senseId, parts, joins: [], transformations: [], wordSum: `${word.normalised_word} → ${word.display_word}`, familyKey: '', componentPartId: '', relationshipKind: '', requestedSkillKeys: [] }],
      p_actor: actor, p_source_reference: `Base foundation reconciliation: exact approved release ${release.releaseManifestId}; ${source.map(f => f.baseFamilyKey).join(', ')}` }));
    const family = await createWorkbookFamily(db, actor!, word.normalised_word, senseId, null);
    const again = await createWorkbookFamily(db, actor!, word.normalised_word, senseId, null);
    assert.equal(again?.key, family?.key, 'Retry must reuse the same family');
    assert(family, 'Created family is approved');
    const anchor = (await loadBaseWordFamilyAnchors(db, [id])).find(row => row.familyKey === family.key);
    assert(anchor && anchor.sense.meaning === meaning, 'Family must read the approved base meaning');
    report.push({ ...log, status: 'reconciled', detail: `${pos}: ${meaning}`, familyKey: family.key });
    console.log(`${word.display_word}: reconciled`);
  }
  const after = await loadBaseWordFamilyAnchors(db, ids);
  const summary = { apply, environment: 'staging', releaseManifestId: release.releaseManifestId, bases: ids.length,
    anchoredBefore: new Set(anchorsBefore.map(a => a.wordId)).size, anchoredAfter: new Set(after.map(a => a.wordId)).size,
    counts: Object.fromEntries([...new Set(report.map(r => r.status))].map(status => [status, report.filter(r => r.status === status).length])), rows: report };
  mkdirSync('outputs/base-word-foundation-20261125', { recursive: true });
  writeFileSync(`outputs/base-word-foundation-20261125/${apply ? 'staging-applied' : 'staging-plan'}.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
