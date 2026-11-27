// Run against a local dev server. The shared audio lookup POST is read-only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const dir = 'docs/design/latin-roots-magic/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && !request.url().includes('__nextjs') && !request.url().endsWith('/api/teaching-dictionary/british-recording')) writes.push(request.url()); });
  await page.goto((process.env.LATIN_ROOT_PREVIEW_URL ?? 'http://127.0.0.1:3012') + '/dev/adle/latin-roots');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.locator('[data-latin-spell-tile]').click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('[data-latin-spell-tile]').click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const lesson = page.getByRole('article', { name: 'Common Latin roots lesson' });
  const wordBank = page.getByRole('complementary', { name: 'Word builder' });
  const slot = (branch, position) => lesson.locator(`[data-slot="${branch}:${position}"]`);
  async function place(part, branch, position) {
    await wordBank.getByRole('button', { name: `Select ${part}`, exact: true }).click();
    await slot(branch, position).click();
  }
  async function build(branch, parts) {
    for (let position = 0; position < parts.length; position++) await place(parts[position], branch, position);
    assert.equal(await lesson.locator(`[data-branch="${branch}"]`).getAttribute('data-completed'), 'true');
  }
  assert.equal(await lesson.locator('section[aria-label$="word family"]').count(), 1);
  assert.equal(await lesson.locator('.word-lab-layout > .adie-guide').count(), 1, 'Shared ADLE guide panel');
  assert.equal(await lesson.locator('.word-lab-workspace').count(), 1, 'Shared ADLE workspace panel');
  assert.equal(await lesson.getByRole('button', { name: 'Check branch', exact: true }).count(), 0, 'No manual branch check');
  assert.equal(await lesson.getByRole('button', { name: 'Next root family' }).isDisabled(), true);
  assert.equal(await wordBank.getByRole('button', { name: 'Select port', exact: true }).count(), 0, 'Root is fixed, never a bank tile');
  assert(!(await wordBank.innerText()).includes('across'), 'Affix meanings hidden before check');
  assert.equal(await wordBank.locator('[data-adie-inline="off"]').evaluate(element => getComputedStyle(element, '::before').content), 'none', 'No miniature ADIE in feedback');
  await place('im', 1, 0);
  assert((await wordBank.innerText()).includes('Not quite'));
  assert((await wordBank.innerText()).includes('in or into'), 'Incorrect attempts explain actual chosen part');
  assert((await wordBank.innerText()).includes('carry'));
  assert(!(await wordBank.innerText()).includes('across'), 'Incorrect feedback does not silently substitute the expected part');
  await wordBank.getByRole('button', { name: 'Clear branch' }).click();
  await wordBank.getByRole('button', { name: 'Select trans', exact: true }).press('Enter');
  await slot(1, 0).press('Enter');
  assert((await wordBank.innerText()).includes('across'), 'Correct attempts explain each part');
  await build(2, ['able']);
  // Exercise the real shared pointer-drag interaction, not HTML drag events.
  const tile = await wordBank.getByRole('button', { name: 'Select im', exact: true }).boundingBox();
  const destination = await slot(3, 0).boundingBox();
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.equal(await lesson.getByRole('button', { name: 'Explore import', exact: true }).count(), 1, 'Drag completes and checks automatically');
  // No scrolling on standard desktop sizes, including feedback and navigation.
  for (const [width, height] of [[1366,768],[1280,720],[1440,900],[1024,768]]) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, innerHeight, innerWidth }));
    assert(dimensions.height <= height + 1, `Desktop vertical fit ${width}x${height}: ${JSON.stringify(dimensions)}`);
    assert(dimensions.width <= width + 1, 'No horizontal overflow');
    const workspace = await lesson.locator('.word-lab-workspace').evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }));
    assert(workspace.scroll <= workspace.client + 1, `Tree fits inside full ADLE workspace: ${JSON.stringify({ width, height, ...workspace })}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: dir + 'coded-tree-desktop.png' });
  await lesson.getByRole('button', { name: 'Next root family' }).click();
  assert.equal(await lesson.getByRole('region', { name: 'port word family', exact: true }).count(), 0);
  await build(1, ['con']); await build(2, ['ure']); await build(3, ['con', 'ion']);
  await lesson.getByRole('button', { name: 'Previous family' }).click();
  assert.equal(await lesson.getByRole('button', { name: 'Explore transport', exact: true }).count(), 1, 'Previous family retains its builds');
  await lesson.getByRole('button', { name: 'Next root family' }).click();
  await lesson.getByRole('button', { name: 'Continue to spell class' }).click();
  await lesson.getByRole('button', { name: 'Carry', exact: true }).click();
  await lesson.getByRole('button', { name: 'Choose root port', exact: true }).click();
  await lesson.getByRole('button', { name: 'Drop your root here', exact: true }).click();
  await lesson.getByRole('button', { name: 'Cast my spell' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to cover & check' }).click();
  for (const word of ['transport','portable','import','construct','structure','construction']) {
    await lesson.getByRole('button', { name: 'Slide the cover', exact: false }).press('ArrowRight');
    await lesson.locator('[data-cover-state="write"]').waitFor();
    assert(!(await lesson.innerText()).includes(word));
    assert.equal(await lesson.locator('[data-branch]').count(), 0);
    await lesson.getByRole('textbox').fill(word); await lesson.getByRole('button', { name: 'Check', exact: true }).click(); await lesson.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  for (const sentence of ['We transport the boxes by train.','The portable lamp fits in my bag.','We import fruit from other countries.','We construct a bridge from wooden blocks.','The bridge is a strong structure.','The construction of the bridge took a year.']) {
    assert(!(await lesson.innerText()).includes(sentence));
    await lesson.getByRole('textbox').fill(sentence); await lesson.getByRole('button', { name: 'Check sentence', exact: true }).click(); await lesson.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  assert.equal(await lesson.getByRole('button', { name: 'Finish preview' }).isDisabled(), true);
  await lesson.getByRole('textbox').fill('The Latin root helped me keep the family spelling.');
  await lesson.getByRole('button', { name: 'Finish preview' }).click(); await lesson.getByRole('heading', { name: 'Your word trees have grown!' }).waitFor();
  for (const families of ['1','2']) for (const count of ['5','6']) {
    await page.locator('details > summary').click();
    await page.getByRole('combobox', { name: /^Families/ }).selectOption(families); await page.getByRole('combobox', { name: /^Words/ }).selectOption(count);
    await page.getByRole('button', { name: 'Restart preview' }).click(); await page.locator('details > summary').click();
    await lesson.getByRole('button', { name: 'Next page', exact: true }).click();
    await lesson.getByRole('button', { name: 'Next page', exact: true }).click();
    await lesson.locator('[data-latin-spell-tile]').click();
    await lesson.getByRole('button', { name: 'Next', exact: true }).click();
    await lesson.locator('[data-latin-spell-tile]').click();
    await lesson.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await lesson.locator('section[aria-label$="word family"]').count(), 1);
    assert.equal(await lesson.locator('[data-branch]').count(), Number(families) === 1 ? Number(count) : 3);
    if (families === '1') {
      await page.setViewportSize({ width: 1280, height: 720 });
      assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), 'Full word bank fits on desktop');
      await page.screenshot({ path: dir + 'coded-tree-' + count + '-word-start.png' });
      await build(1, ['trans']); await build(2, ['able']); await build(3, ['im']); await build(4, ['ex']); await build(5, ['er']);
      if (count === '6') await build(6, ['trans','ation']);
      assert.equal(await lesson.getByRole('button', { name: 'Continue to spell class' }).isDisabled(), false);
    }
  }
  await page.locator('details > summary').click(); await page.getByRole('button', { name: '☾ Dark', exact: true }).click(); await page.locator('details > summary').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: dir + 'coded-tree-dark.png' });
  for (const width of [375,320]) {
    await page.setViewportSize({ width, height: 1800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width === 375) await page.screenshot({ path: dir + 'coded-tree-mobile.png', fullPage: true });
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  fs.writeFileSync(dir + 'coded-template-qa.json', JSON.stringify({ passed: true, oneFamilyPerPage: true, fullAdlePanels: true, automaticBranchChecks: true, desktopFit: ['1366x768','1280x720','1440x900','1024x768'], dragAndTap: true, feedbackForCorrectAndIncorrect: true, reusableAffixCopies: true, previousFamilyRestores: true, fullSixWordFlow: true, capacityCombinations: 4, mobileWidths: [320,375], darkMode: true, writes, errors }, null, 2));
  console.log('PASS: full ADLE panels, automatic checks, one-family pages, desktop fit, drag/tap, both feedback outcomes, reused affixes, page restoration and complete six-word lesson.');
} finally { await browser.close(); }
