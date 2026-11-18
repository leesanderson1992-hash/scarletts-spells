/* Disposable staging workbook/editor proof. Framework auth is exercised in the browser. */
const assert = require('node:assert/strict'), fs = require('node:fs'), Excel = require('exceljs');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://qkpjbajicacbrphthibk.supabase.co');
const { createServiceRoleClient } = require('../lib/supabase/service-role');
const { loadReviewedMeaningBundles } = require('../lib/teaching-dictionary-manager/multi-sense-export');
const { prefillReviewWorkbookFacts } = require('../lib/teaching-dictionary-manager/review-workbook-facts');
const { buildReviewWorkbook } = require('../lib/teaching-dictionary-manager/review-workbook');
const { TRANSFORMATION_OPTIONS } = require('../lib/teaching-dictionary-manager/transformations');
const wordId = 'b8d03ba9-9e66-56b7-ad0d-1445ace582e9', skill = 'D4_INF_ING_ENDINGS_DROP_E';
const fixturePath = '.tmp/transformation-standardisation-staging-fixture.json';
(async () => {
  const db = createServiceRoleClient();
  const [bundle] = await loadReviewedMeaningBundles(db, [wordId]); assert(bundle);
  const analysis = bundle.analyses.find(row => row.senseId === 'caring-look-after'); assert(analysis?.familyKey);
  if (process.argv.includes('--prepare')) {
    const facts = await prefillReviewWorkbookFacts(db, [bundle], skill), book = new Excel.Workbook();
    await book.xlsx.load(await buildReviewWorkbook({ skill, title: 'Transformation dropdown staging proof', notes: new Map(),
      requestedSenses: new Map([[wordId, 'caring-look-after']]), ...facts }));
    const sheet = book.getWorksheet('Words to review'), headers = sheet.getRow(3).values;
    let row;
    for (let n = 4; n <= sheet.rowCount; n++) if (sheet.getRow(n).getCell(headers.indexOf('Sense id')).text === 'caring-look-after') row = sheet.getRow(n);
    assert(row); const type = row.getCell(headers.indexOf('Part 1 spelling change type'));
    assert.equal(type.text, 'Drop final e'); assert.equal(type.dataValidation.type, 'list');
    type.value = 'Double final consonant';
    await book.xlsx.writeFile('.tmp/transformation-invalid-caring.xlsx');
    type.value = 'Auto (from spelling)'; row.getCell(headers.indexOf('Part 1 spelling change explanation')).value = '';
    await book.xlsx.writeFile('.tmp/transformation-auto-caring.xlsx');
    fs.writeFileSync(fixturePath, JSON.stringify({ wordId, skill, revision: bundle.sourceSenseReviewedAt, family: analysis.familyKey }));
    console.log({ status: 'prepared', wordId, dropdown: type.dataValidation.formulae }); return;
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  if (process.argv.includes('--verify-invalid')) {
    assert.equal(bundle.sourceSenseReviewedAt, fixture.revision, 'A rejected workbook must not change the approved facts');
    console.log('PASS: invalid transformation left reviewed dictionary facts unchanged'); return;
  }
  assert.equal(analysis.transformations.length, 1);
  assert.equal(analysis.transformations[0].type, 'drop_final_e');
  assert.equal(analysis.transformations[0].sourceText, 'care');
  assert.equal(analysis.transformations[0].surfaceText, 'car');
  assert(analysis.transformations[0].explanation);
  assert.equal(analysis.familyKey, fixture.family);
  assert(bundle.analyses.flatMap(a => a.transformations).every(t => TRANSFORMATION_OPTIONS.some(option => option.type === t.type)));
  console.log({ status: 'passed', word: bundle.displayWord, canonicalType: analysis.transformations[0].type, familyPreserved: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
