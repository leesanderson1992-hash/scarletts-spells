/* Explicit disposable staging proof. Uses actual workbook actions, reviewed-family RPCs and runtime readers. */
const assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { randomUUID } = require('node:crypto');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://qkpjbajicacbrphthibk.supabase.co');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, 'staging');
const actor = process.env.STAGING_ADMIN_USER_ID; assert(actor);
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === '@/lib/admin/access') return { requireAdminUser: async () => ({ id: actor }) };
  if (name === 'next/cache') return { updateTag() {}, revalidateTag() {}, revalidatePath() {}, unstable_cache: fn => fn, cacheLife() {}, cacheTag() {} };
  if (name === 'next/server') return { after() {} }; // Browser/cron exercise the real background boundary separately.
  if (name === 'next/navigation') return { redirect(url) { throw Object.assign(new Error(url), { redirectTo: url }); } };
  return original.call(this, name, ...args);
};
const { createServiceRoleClient } = require('../lib/supabase/service-role');
const { buildReviewWorkbook } = require('../lib/teaching-dictionary-manager/review-workbook');
const { importReviewedMultiSenseCsv } = require('../app/(authenticated)/admin/teaching-dictionary/multi-sense-actions');
const { recheckWaitingFamilyWords, matchingDependencyFamily } = require('../lib/teaching-dictionary-manager/family-dependencies');
const { createWorkbookFamily } = require('../lib/teaching-dictionary-manager/workbook-family-resolution');
const { loadReviewedMeaningBundles } = require('../lib/teaching-dictionary-manager/multi-sense-export');
const db = createServiceRoleClient(), skill = 'D4_MOR_PREFIXES_UN', suffixSkill = 'D4_MOR_SUFFIXES_ABLE_IBLE';
const read = async query => { const r = await query; assert.ifError(r.error); return r.data; };
const part = (id, kind, text, gloss, start) => ({ id, kind, sourceText: text, surfaceText: text, gloss, displayRange: { start, end: start + text.length } });
function bundle(word, definition, base, meaning, root = false) {
  const parts = root ? [part('root', 'root', base, meaning, 0), part('suffix', 'suffix', 'ible', 'Capable of, fit for, or able to be', base.length)]
    : [part('prefix', 'prefix', 'un', 'reverse', 0), part('base', 'base', base, meaning, 2)];
  return { wordId: '', displayWord: word, sourceSenseReviewedAt: '', senseSet: {
    pronunciations: [{ id: 'spoken', ipa: root ? '/ˈɔːdəbəl/' : '/ʌnˈstæk/', spokenSyllableCount: root ? 3 : 2, stressPattern: root ? 'primary-unstressed-unstressed' : 'unstressed-primary' }],
    senses: [{ id: 'reviewed', definition, partOfSpeech: root ? 'adjective' : 'verb', pronunciationId: 'spoken', dictationSentence: `Please say ${word} clearly.`, dictationTargetTokenIndex: 2 }] },
    analyses: [{ senseId: 'reviewed', parts, joins: [{ afterPartId: parts[0].id, beforePartId: parts[1].id, joinType: 'none' }], transformations: [],
      wordSum: parts.map(p => p.sourceText).join(' + ') + ' → ' + word, familyKey: '', componentPartId: '', relationshipKind: '', requestedSkillKeys: [] }] };
}
async function workbook(bundles, selectedSkill) {
  const bytes = await buildReviewWorkbook({ skill: selectedSkill, title: 'Saved family reviews staging proof', bundles, notes: new Map(), families: new Map(),
    requestedSenses: new Map(bundles.map(b => [b.wordId, 'reviewed'])),
    suffixFacts: new Map(bundles.map(b => [b.wordId, { age_band: 'middle_primary', frequency_band: 'medium', complexity_band: 'low', has_schwa: 'Yes' }])) });
  return bytes;
}
async function upload(bytes, selectedSkill) {
  const form = new FormData(); form.set('workbook_skill', selectedSkill); form.set('review_workbook', new File([bytes], 'saved-family-proof.xlsx'));
  const result = await importReviewedMultiSenseCsv({}, form);
  assert(!result.error, JSON.stringify(result)); assert.equal(result.issues?.length ?? 0, 0, JSON.stringify(result)); return result;
}
(async () => {
  // Pure selection safety: wording punctuation accepted; ambiguity, wrong kind and wrong meaning never guessed.
  const dependency = { base_form: 'stack', base_kind: 'free_base', expected_meaning: ' Put things in a pile. ', confirmed_family_key: null };
  const family = { family_key: 'stack-reviewed', base_lemma: 'stack', base_kind: 'free_base', base_meaning: 'put things in a pile', review_status: 'approved' };
  assert.equal(matchingDependencyFamily(dependency, [family])?.family_key, family.family_key);
  assert.equal(matchingDependencyFamily(dependency, [family, { ...family, family_key: 'other' }]), null);
  assert.equal(matchingDependencyFamily(dependency, [{ ...family, base_kind: 'bound_root' }]), null);
  assert.equal(matchingDependencyFamily(dependency, [{ ...family, base_meaning: 'A chimney.' }]), null);
  assert.equal(matchingDependencyFamily({ ...dependency, confirmed_family_key: 'other' }, [family, { ...family, family_key: 'other' }])?.family_key, 'other');
  const fixtureFile = '.tmp/dictionary-family-dependencies-fixture.json';
  if (process.argv.includes('--prepare')) {
    assert.equal((await read(db.from('canonical_teaching_dictionary_words').select('id').in('normalised_word', ['unstack', 'uncoil', 'audible', 'aud', 'stack', 'coil']))).length, 0, 'Use fresh disposable fixtures');
    const prefix = [bundle('unstack', 'Remove things from a pile.', 'stack', 'Put things in a pile.'), bundle('uncoil', 'Straighten something that was wound in loops.', 'coil', 'Wind something in loops.')];
    prefix[1].senseSet.pronunciations[0].ipa = '/ʌnˈkɔɪl/';
    const root = [bundle('audible', 'Loud enough to be heard.', 'aud', 'To hear', true)];
    fs.writeFileSync('.tmp/family-prefix-review.xlsx', Buffer.from(await workbook(prefix, skill)));
    fs.writeFileSync('.tmp/family-root-review.xlsx', Buffer.from(await workbook(root, suffixSkill)));
    fs.writeFileSync(fixtureFile, JSON.stringify({ skill, suffixSkill, prefix, root }, null, 2));
    console.log({ status: 'prepared', workbooks: ['.tmp/family-prefix-review.xlsx', '.tmp/family-root-review.xlsx'] }); return;
  }
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  if (process.argv.includes('--import')) {
    for (const [path, key] of [['.tmp/family-prefix-review.xlsx', skill], ['.tmp/family-root-review.xlsx', suffixSkill]]) {
      const result = await upload(fs.readFileSync(path), key); console.log({ saved: result.words, pending: result.familyTasks?.length });
    }
  }
  const words = await read(db.from('canonical_teaching_dictionary_words').select('id,normalised_word').in('normalised_word', ['unstack', 'uncoil', 'audible']));
  assert.equal(words.length, 3, 'Import both fixture workbooks first');
  const dependencies = () => read(db.from('teaching_dictionary_family_dependencies').select('*').in('canonical_word_id', words.map(w => w.id)));
  if (process.argv.includes('--safety')) {
    const originalRow = (await dependencies()).find(r => r.base_form === 'stack'); assert(originalRow?.family_resolved);
    const [currentReview] = await loadReviewedMeaningBundles(db, [originalRow.canonical_word_id]);
    const currentParts = await read(db.from('teaching_dictionary_current_sense_morphology').select('id').eq('canonical_word_id', originalRow.canonical_word_id).eq('sense_id', originalRow.sense_id).single());
    const row = { ...originalRow, expected_reviewed_at: currentReview.sourceSenseReviewedAt, expected_morphology_id: currentParts.id };
    try {
    await read(db.from('teaching_dictionary_family_dependencies').update({ expected_reviewed_at: row.expected_reviewed_at, expected_morphology_id: row.expected_morphology_id }).eq('id', row.id));
    const firstClaim = await read(db.rpc('claim_dictionary_family_dependencies', { p_environment: 'staging', p_limit: 1, p_base: 'stack' }));
    assert.equal(firstClaim[0].id, row.id);
    const concurrent = await read(db.rpc('claim_dictionary_family_dependencies', { p_environment: 'staging', p_limit: 20 }));
    assert(!concurrent.some(r => r.id === row.id), 'A live lease must prevent concurrent work');
    await read(db.from('teaching_dictionary_family_dependencies').update({ lease_until: new Date(Date.now() - 60000).toISOString() }).eq('id', row.id));
    const recovered = await read(db.rpc('claim_dictionary_family_dependencies', { p_environment: 'staging', p_limit: 20 }));
    assert(recovered.some(r => r.id === row.id), 'An interrupted claim must retry even without a later family edit');
    const linksBefore = await read(db.from('teaching_dictionary_current_sense_family_memberships').select('id,family_key').eq('canonical_word_id', row.canonical_word_id));
    await read(db.from('teaching_dictionary_family_dependencies').update({ expected_meaning: 'An unconfirmed different meaning', status: 'waiting', family_resolved: false, checked_at: null, lease_until: null }).eq('id', row.id));
    await recheckWaitingFamilyWords(db, 'staging', 'stack');
    assert.equal((await dependencies()).find(r => r.id === row.id).status, 'needs_choice');
    await read(db.from('teaching_dictionary_family_dependencies').update({ expected_meaning: row.expected_meaning, expected_morphology_id: randomUUID(), status: 'waiting', lease_until: null }).eq('id', row.id));
    await recheckWaitingFamilyWords(db, 'staging', 'stack');
    assert.equal((await dependencies()).find(r => r.id === row.id).status, 'needs_review');
    assert.deepEqual(await read(db.from('teaching_dictionary_current_sense_family_memberships').select('id,family_key').eq('canonical_word_id', row.canonical_word_id)), linksBefore, 'Ambiguous or stale reviews never replace an existing family');
    const [saved] = await loadReviewedMeaningBundles(db, [row.canonical_word_id]);
    const invalid = await db.rpc('import_teaching_dictionary_partial_review', { p_request_id: randomUUID(), p_word_id: saved.wordId,
      p_display_word: saved.displayWord, p_expected_reviewed_at: saved.sourceSenseReviewedAt, p_sense_set: saved.senseSet,
      p_analyses: saved.analyses.map(a => ({ ...a, requestedSkillKeys: [skill] })), p_actor: actor,
      p_source_reference: 'Disposable atomic rollback staging proof', p_environment: 'staging', p_skill: skill,
      p_dependencies: [{ senseId: row.sense_id, componentPartId: 'does-not-exist' }] });
    assert(invalid.error); assert.equal((await loadReviewedMeaningBundles(db, [saved.wordId]))[0].sourceSenseReviewedAt, saved.sourceSenseReviewedAt, 'Invalid dependency must roll back the fact import too');
    await read(db.from('teaching_dictionary_family_dependencies').update({ expected_morphology_id: row.expected_morphology_id, expected_meaning: row.expected_meaning, status: row.status, family_resolved: row.family_resolved, detail: row.detail, lease_until: null }).eq('id', row.id));
    const root = await read(db.from('canonical_teaching_dictionary_words').select('id').eq('normalised_word', 'aud').single());
    const { loadTeachingDictionaryEvidenceAuthorityForWord } = require('../lib/teaching-dictionary-manager/evidence-authority');
    assert.equal((await loadTeachingDictionaryEvidenceAuthorityForWord(db, 'staging', root.id)).relationships.length, 0, 'Root support entry must not gain ordinary spelling approvals');
    console.log({ status: 'safety-passed', expiredLeaseRetried: true, concurrentWorkBlocked: true, ambiguousMeaningHeld: true, staleFactsHeld: true, atomicRollback: true, rootIsSupportOnly: true }); return;
    } finally {
      await read(db.from('teaching_dictionary_family_dependencies').update({ expected_reviewed_at: originalRow.expected_reviewed_at, expected_morphology_id: originalRow.expected_morphology_id, expected_meaning: originalRow.expected_meaning, status: originalRow.status, family_resolved: originalRow.family_resolved, detail: originalRow.detail, lease_until: null }).eq('id', originalRow.id));
    }
  }
  if (process.argv.includes('--verify-saved')) {
    const rows = await dependencies(); assert.equal(rows.length, 3); assert(rows.every(r => r.status === 'waiting'));
    const recommendations = await read(db.from('teaching_dictionary_family_recommendations').select('*').in('base_form', ['stack', 'coil', 'aud']));
    assert.equal(recommendations.length, 3); assert(recommendations.every(r => r.waiting_words === 1));
    // Authoritative reupload of an existing word retains saved facts and deduplicates the dependency.
    const existing = await loadReviewedMeaningBundles(db, words.filter(w => w.normalised_word !== 'audible').map(w => w.id));
    const currentWorkbook = await workbook(existing, skill);
    await upload(currentWorkbook, skill);
    fs.writeFileSync('.tmp/family-prefix-current-review.xlsx', Buffer.from(currentWorkbook));
    assert.equal((await dependencies()).length, 3);
    console.log({ status: 'saved-and-deduplicated', words: words.map(w => w.normalised_word) }); return;
  }
  if (process.argv.includes('--approve-bases') || process.argv.includes('--seed-bases')) {
    for (const [form, meaning] of [['stack', 'Put things in a pile.'], ['coil', 'Wind something in loops.']]) {
      const parts = [part('base', 'base', form, meaning, 0)];
      const id = await read(db.rpc('import_reviewed_teaching_dictionary_word', { p_request_id: randomUUID(), p_word_id: null, p_display_word: form, p_expected_reviewed_at: '',
        p_sense_set: { pronunciations: [{ id: 'spoken', ipa: form === 'stack' ? '/stæk/' : '/kɔɪl/', spokenSyllableCount: 1, stressPattern: 'primary' }], senses: [{ id: 'base', definition: meaning, partOfSpeech: 'verb', pronunciationId: 'spoken' }] },
        p_analyses: [{ senseId: 'base', parts, joins: [], transformations: [], wordSum: `${form} → ${form}`, requestedSkillKeys: [], familyKey: '', componentPartId: '', relationshipKind: '' }],
        p_actor: actor, p_source_reference: 'Disposable staging family dependency proof' }));
      if (process.argv.includes('--approve-bases')) {
        const approved = await createWorkbookFamily(db, actor, form, 'base'); assert(approved.key);
      }
      console.log({ reviewedBase: form, id });
    }
  }
  if (process.argv.includes('--root')) {
    const rootId = await read(db.rpc('create_recommended_root_support_entry', { p_form: 'aud', p_definition: 'To hear', p_origin: 'Latin', p_actor: actor }));
    assert(rootId); console.log({ rootId });
  }
  if (process.argv.includes('--recheck')) {
    console.log({ recheck: await recheckWaitingFamilyWords(db, 'staging', undefined, 20) });
    const rows = await dependencies(); console.log(rows.map(({ base_form, status, detail }) => ({ base_form, status, detail })));
    assert(rows.every(r => r.family_resolved), 'All three intended reviewed families must link');
    const rootFamily = await read(db.from('canonical_teaching_dictionary_lexical_root_metadata').select('*').eq('root_text', 'aud').single());
    assert.equal(rootFamily.pronunciation_applicability, 'not_applicable'); assert.equal(rootFamily.pronunciation_ipa, null);
    const again = await recheckWaitingFamilyWords(db, 'staging', undefined, 20); assert.equal(again.changed, 0, 'Retries must not duplicate approvals');
    const saved = await loadReviewedMeaningBundles(db, words.map(w => w.id)); assert(saved.every(b => b.analyses[0].familyKey));
    assert(saved.find(b => b.displayWord === 'audible').analyses[0].parts[0].kind === 'root');
    fs.writeFileSync('.tmp/dictionary-family-dependencies-proof.json', JSON.stringify({ status: 'passed', dependencies: rows, retry: again }, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
