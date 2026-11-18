/* Explicit disposable staging proof using real actions and database reviews. */
const assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { randomUUID } = require('node:crypto');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://qkpjbajicacbrphthibk.supabase.co');
const actor = process.env.STAGING_ADMIN_USER_ID, original = Module._load; assert(actor);
Module._load = function(name, ...args) {
  if (name === '@/lib/admin/access') return { requireAdminUser: async () => ({ id: actor }) };
  if (name === 'next/cache') return { updateTag() {}, revalidatePath() {}, unstable_cache: fn => fn, cacheLife() {}, cacheTag() {} };
  return original.call(this, name, ...args);
};
const { createServiceRoleClient } = require('../lib/supabase/service-role');
const { findReviewedFamilyBase, createSenseFreeBaseFamily, reviewSenseMorphology } = require('../app/(authenticated)/admin/teaching-dictionary/sense-morphology-actions');
const db = createServiceRoleClient();
const read = async query => { const result = await query; assert.ifError(result.error); return result.data; };
(async () => {
  if (process.argv.includes('--verify-browser')) {
    const fixture = JSON.parse(fs.readFileSync('.tmp/individual-family-staging-fixture.json', 'utf8'));
    const base = await findReviewedFamilyBase('mortal');
    assert.equal(base.senses[0].partsStatus, 'whole_base');
    const links = await read(db.from('teaching_dictionary_current_sense_family_memberships')
      .select('canonical_word_id,family_key,base_meaning').in('canonical_word_id', [fixture.baseId, fixture.wordId]));
    assert.equal(links.length, 2); assert.equal(new Set(links.map(link => link.family_key)).size, 1);
    assert(links.every(link => link.base_meaning === 'Able to die; not living forever.'));
    assert.equal((await createSenseFreeBaseFamily({ ...fixture.input, approveBaseParts: true })).ok, true);
    console.log({ status: 'passed', family: links[0].family_key, linkedWords: links.length, retryPassed: true });
    return;
  }
  const senseId = 'individual-family-proof';
  async function seed(word, definition, ipa, count, stress, parts, joins) {
    const existing = await read(db.from('canonical_teaching_dictionary_words').select('id').eq('normalised_word', word).maybeSingle());
    assert(!existing, `Use a fresh disposable staging fixture; ${word} already exists`);
    const senseSet = { pronunciations: [{ id: 'spoken', ipa, spokenSyllableCount: count, stressPattern: stress }],
      senses: [{ id: senseId, definition, partOfSpeech: 'adjective', pronunciationId: 'spoken' }] };
    return read(db.rpc('import_reviewed_teaching_dictionary_word', { p_request_id: randomUUID(), p_word_id: null,
      p_display_word: word, p_expected_reviewed_at: '', p_sense_set: senseSet,
      p_analyses: [{ senseId, parts, joins, transformations: [], wordSum: parts.map(p => p.sourceText).join(' + ') + ' → ' + word,
        familyKey: '', componentPartId: '', relationshipKind: '', requestedSkillKeys: [] }],
      p_actor: actor, p_source_reference: 'Disposable individual family workflow staging proof' }));
  }
  const part = (id, kind, text, gloss, start) => ({ id, kind, sourceText: text, surfaceText: text, gloss, displayRange: { start, end: start + text.length } });
  const baseMeaning = 'Able to die; not living forever.';
  const baseId = await seed('mortal', baseMeaning, '/ˈmɔːtəl/', 2, 'primary-unstressed', [part('base', 'base', 'mortal', baseMeaning, 0)], []);
  const wordId = await seed('immortal', 'Living for ever or unable to die, especially in stories.', '/ɪmˈɔːtəl/', 3,
    'unstressed-primary-unstressed', [part('prefix', 'prefix', 'im', 'not', 0), part('base', 'base', 'mortal', baseMeaning, 2)],
    [{ afterPartId: 'prefix', beforePartId: 'base', joinType: 'none' }]);
  const withdrawal = await reviewSenseMorphology({ wordId: baseId, senseId, action: 'withdraw', parts: [], joins: [], transformations: [], wordSum: '' });
  assert.equal(withdrawal.ok, true, JSON.stringify(withdrawal));
  assert.equal((await findReviewedFamilyBase('mortal')).senses[0].partsStatus, 'missing');
  const input = { wordId, senseId, componentPartId: 'base', baseWordId: baseId, baseSenseId: senseId, relationshipKind: 'derived' };
  assert.equal((await createSenseFreeBaseFamily(input)).ok, false, 'Do not implicitly approve parts without the explicit choice');
  fs.writeFileSync('.tmp/individual-family-staging-fixture.json', JSON.stringify({ baseId, wordId, senseId, input }, null, 2));
  if (process.argv.includes('--prepare-browser')) { console.log({ status: 'prepared', baseId, wordId, senseId }); return; }
  const created = await createSenseFreeBaseFamily({ ...input, approveBaseParts: true });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal((await findReviewedFamilyBase('mortal')).senses[0].partsStatus, 'whole_base');
  assert.equal((await createSenseFreeBaseFamily({ ...input, approveBaseParts: true })).ok, true, 'Retry reuses family');
  const links = await read(db.from('teaching_dictionary_current_sense_family_memberships').select('canonical_word_id,family_key,base_meaning').in('canonical_word_id', [baseId, wordId]));
  assert.equal(links.length, 2); assert(links.every(link => link.base_meaning === baseMeaning));
  console.log({ status: 'passed', baseId, wordId, family: links[0].family_key, linkedWords: links.length });
})().catch(error => { console.error(error); process.exitCode = 1; });
