/* eslint-disable @typescript-eslint/no-require-imports -- intercept Next wrappers while exercising the real server actions */
/** Disposable staging proof: reviewed work anchor -> worker workbook -> Publish -> generated lesson. */
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto'), fs = require('node:fs'), Module = require('node:module'), Excel = require('exceljs');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://qkpjbajicacbrphthibk.supabase.co');
assert.equal(process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT, 'staging');
assert.equal(process.env.ADLE_BASE_WORD_DICTIONARY_ONLY, 'enabled');
const actor = process.env.STAGING_ADMIN_USER_ID; assert(actor);
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === '@/lib/admin/access') return { requireAdminUser: async () => ({ id: actor }) };
  if (name === 'next/cache') return { revalidatePath() {}, updateTag() {}, unstable_cache: fn => fn, cacheLife() {}, cacheTag() {} };
  if (name === 'next/server') return { after() {} };
  if (name === 'next/navigation') return { redirect(url) { throw Object.assign(new Error(url), { redirectTo: url }); } };
  return original.call(this, name, ...args);
};
const { createServiceRoleClient } = require('../lib/supabase/service-role');
const { loadBaseWordFamilyAnchors } = require('../lib/adle/loaders/base-word-family-anchors');
const { loadEnabledBaseWordReleaseAuthorities } = require('../lib/adle/loaders/curriculum-release-authority');
const { loadReviewedMeaningBundles } = require('../lib/teaching-dictionary-manager/multi-sense-export');
const { reviewedAffixMeanings } = require('../lib/teaching-dictionary-manager/affix-meanings');
const { buildReviewWorkbook } = require('../lib/teaching-dictionary-manager/review-workbook');
const { importReviewedMultiSenseCsv } = require('../app/(authenticated)/admin/teaching-dictionary/multi-sense-actions');
const { publishIdentifyBaseWord } = require('../app/(authenticated)/admin/teaching-dictionary/lesson-updates/base-word-actions');
const { loadIdentifyBaseReview } = require('../lib/teaching-dictionary-manager/base-word-review');
const { generateGuardedBaseWordFamilyPilot } = require('../lib/adle/loaders/base-word-family-pilot-loader');
const db = createServiceRoleClient(), skill = 'D4_MOR_BASE_WORDS_IDENTIFY_BASE';
const read = async query => { const r = await query; assert.ifError(r.error); return r.data; };
const statePath = '.tmp/base-foundation-learner-proof.json';
async function main() {
  if (process.argv.includes('--verify-finish')) {
    const state = JSON.parse(fs.readFileSync(statePath));
    const assignment = await read(db.from('daily_assignments').select('id,status').eq('id', state.assignmentId).single());
    assert.equal(assignment.status, 'completed');
    const events = await read(db.from('adle_assignment_attempt_events').select('id').eq('daily_assignment_id', state.assignmentId));
    assert.equal(events.length, 18);
    const reflections = await read(db.from('adle_child_learning_reflections').select('id').eq('daily_assignment_id', state.assignmentId));
    assert.equal(reflections.length, 1);
    console.log({ status: 'finished-and-retry-verified', assignmentId: state.assignmentId, attempts: events.length, reflections: reflections.length }); return;
  }
  const [release] = await loadEnabledBaseWordReleaseAuthorities({ client: db, environmentKey: 'staging', microSkillKeys: [skill] });
  const family = release.family.families.find(row => row.baseFamilyKey === 'work_base_family'); assert(family);
  const anchor = (await loadBaseWordFamilyAnchors(db, [family.baseWordId]))[0]; assert(anchor);
  const member = family.members.find(row => row.canonicalWordId !== family.baseWordId); assert(member);
  const word = release.dictionaryWords.find(row => row.canonicalWordId === member.canonicalWordId); assert.equal(word.displayWord, 'worker');
  let [bundle] = await loadReviewedMeaningBundles(db, [word.canonicalWordId]);
  if (!bundle) {
    const [metadata] = await read(db.from('canonical_teaching_dictionary_word_metadata').select('phoneme_hint,syllables,stress_pattern').eq('canonical_word_id', word.canonicalWordId).eq('row_status', 'active').order('created_at', { ascending: false }).limit(1));
    const affixes = await read(db.from('canonical_teaching_dictionary_affix_meanings').select('gloss').eq('source_text', 'er').eq('part_kind', 'suffix').eq('review_status', 'approved'));
    const profiles = await read(db.from('canonical_teaching_dictionary_suffix_profiles').select('micro_skill_key,meaning_bins').eq('row_status', 'active').eq('review_status', 'approved_for_first_exposure'));
    const meanings = reviewedAffixMeanings([], profiles, affixes.map(row => ({part_kind:'suffix',source_text:'er',gloss:row.gloss})), 'suffix').er ?? [];
    assert.equal(member.childFriendlyMeaning, 'a person who works');
    const gloss = meanings.find(gloss => /person|one who/i.test(gloss)) ?? 'a person who';
    const senseId = 'worker-person';
    const parts = member.morphologyParts.map(p => ({ ...p, gloss: p.kind === 'base' ? anchor.sense.meaning : gloss }));
    bundle = { wordId: word.canonicalWordId, displayWord: word.displayWord, sourceSenseReviewedAt: '', senseSet: {
      pronunciations: [{ id: 'spoken', ipa: metadata.phoneme_hint, spokenSyllableCount: Number(metadata.syllables), stressPattern: metadata.stress_pattern }],
      senses: [{ id: senseId, definition: member.childFriendlyMeaning, partOfSpeech: 'noun', pronunciationId: 'spoken', dictationSentence: word.dictationSentence, dictationTargetTokenIndex: word.dictationTargetTokenIndex }] },
      analyses: [{ senseId, parts, joins: member.morphologyJoins, transformations: member.morphologyTransformations,
        wordSum: member.wordSum, familyKey: anchor.familyKey, componentPartId: parts.find(p => p.kind === 'base').id, relationshipKind: 'derived', requestedSkillKeys: [] }] };
  }
  const bytes = await buildReviewWorkbook({ skill, title: 'Base family foundation staging proof', bundles: [bundle], notes: new Map(), families: new Map() });
  const book = new Excel.Workbook(); await book.xlsx.load(bytes);
  const sheet = book.getWorksheet('Words to review'), headers = sheet.getRow(3).values;
  for (let i = 4; i <= sheet.rowCount; i++) if (sheet.getRow(i).getCell(headers.indexOf('Word')).text)
    sheet.getRow(i).getCell(headers.indexOf('Use in lesson')).value = 'Yes';
  const uploadBytes = await book.xlsx.writeBuffer();
  const form = new FormData(); form.set('review_workbook', new File([uploadBytes], 'base-foundation-worker.xlsx')); form.set('workbook_skill', skill); form.set('request_id', randomUUID());
  const imported = await importReviewedMultiSenseCsv({}, form); assert(!imported.error, imported.error); assert.equal(imported.words, 1, JSON.stringify(imported));
  const before = await loadIdentifyBaseReview(db);
  if (!before.current.some(row => row.canonicalWordId === word.canonicalWordId)) {
    const candidate = before.rows.find(row => row.id === word.canonicalWordId);
    assert(candidate?.choices.length === 1, JSON.stringify(candidate));
    const publish = new FormData(); publish.set('word_id', candidate.id); publish.set('sense_id', candidate.choices[0].id);
    try { await publishIdentifyBaseWord(publish); assert.fail('Publish redirects'); } catch(error) { assert.match(error.redirectTo ?? error.message, /published=1$/); }
  }
  const after = await loadIdentifyBaseReview(db);
  assert(after.current.some(row => row.canonicalWordId === word.canonicalWordId), 'Worker is Active');
  if (fs.existsSync(statePath)) { console.log({ status: 'workbook-and-publish-retry-verified', ...JSON.parse(fs.readFileSync(statePath)), password: undefined, email: undefined }); return; }
  const parentId = actor;
  const child = await read(db.from('children').insert({ parent_user_id: parentId, first_name: 'Base Foundation Proof' }).select('id').single());
  const date = '2026-11-25';
  const jumped = release.dictionaryWords.find(row => row.displayWord === 'jumped'); assert(jumped);
  await read(db.from('adle_learning_items').insert([word.canonicalWordId, jumped.canonicalWordId].map(id => ({ child_id: child.id, canonical_word_id: id, micro_skill_key: skill, item_status: 'pending', source_kind: 'verified_misspelling', source_ref: `disposable-base-foundation:${id}`, source_attempt_text: null, intake_on: date, row_status: 'active' }))));
  process.env.ADLE_BASE_WORD_FAMILY_PILOT_ENABLED = 'enabled'; process.env.ADLE_BASE_WORD_FAMILY_PILOT_CHILD_IDS = child.id;
  const generated = await generateGuardedBaseWordFamilyPilot({ client: db, parentUserId: parentId, childId: child.id, planDate: date, requiredMicroSkillKey: skill });
  assert(generated.assignmentId, generated.readinessReason);
  const state = { parentId, childId: child.id, assignmentId: generated.assignmentId, date, workerId: word.canonicalWordId, baseId: family.baseWordId, baseMeaning: anchor.sense.meaning };
  fs.writeFileSync(statePath, JSON.stringify(state));
  console.log({ status: 'generated', ...state });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
