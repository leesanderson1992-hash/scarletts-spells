import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dir = 'docs/design/latin-roots-magic/';
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__notes = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() { window.__notes++; return super.createOscillator(); }
    };
  });
  await page.goto((process.env.LATIN_ROOT_PREVIEW_URL ?? 'http://127.0.0.1:3012') + '/dev/adle/latin-roots');
  const intro = page.getByRole('region', { name: 'Lesson teaching pages', exact: true });
  await intro.getByRole('heading', { name: 'Welcome to Advanced Spellcraft! 🪄', exact: true }).waitFor();
  assert.equal(await intro.getByRole('button', { name: 'Back', exact: true }).isDisabled(), true);
  await page.screenshot({path:dir+'intro-slide-1.png'});
  await intro.getByRole('button', { name: 'Next page', exact: true }).click();
  const table = intro.getByRole('table', { name: 'Latin-root spelling maths', exact: true });
  await table.waitFor();
  assert.equal(await table.locator('tbody tr').count(), 6);
  assert.deepEqual(await table.locator('th').allTextContents(), ['Prefix', 'Root', 'Suffix', '= Whole word']);
  for (const word of ['transport', 'portable', 'import', 'deport', 'report', 'porter']) assert((await table.innerText()).includes(word));
  for (const [width, height] of [[1366,768], [1280,720], [1024,768]]) {
    await page.setViewportSize({ width, height });
    const size = await page.locator('.word-lab-workspace').evaluate(e => ({ scroll:e.scrollHeight, client:e.clientHeight }));
    assert(size.scroll <= size.client + 1, 'Table fits ' + JSON.stringify({width,height,...size}));
    const readingSize=await intro.locator(':scope > div').evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight}));
    assert(readingSize.scroll<=readingSize.client+1,'Framed table fits '+JSON.stringify({width,height,...readingSize}));
  }
  await page.setViewportSize({width:1366,height:768});
  await page.screenshot({path:dir+'intro-slide-2.png'});
  await intro.getByRole('button', {name:'Next page',exact:true}).click();
  assert(!/lumos/i.test(await page.getByRole('article', {name:'Common Latin roots lesson',exact:true}).innerText()));
  assert((await intro.innerText()).includes('lumen'));
  assert.equal(await intro.getByRole('button', {name:/Reveal the spell/}).count(),0);
  await page.screenshot({path:dir+'intro-slide-3.png'});
  await intro.locator('[data-latin-spell-tile]').click();
  await intro.getByRole('heading',{name:'LUMOS!',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__notes),6);
  await intro.getByRole('heading',{name:'Did you get it right?',exact:true}).waitFor();
  assert((await intro.innerText()).includes('The Lumos spell lights up any room!'));
  assert.equal(await intro.getByRole('button',{name:/Cast again/}).count(),0);
  assert(!(await intro.innerText()).includes('imaginative adaptations'));
  assert.equal(await intro.locator('[data-intro-spell-reveal] span').count(),12);
  await page.waitForTimeout(500);
  await page.screenshot({path:dir+'intro-lumos-reveal.png'});
  await intro.getByRole('button',{name:'Next',exact:true}).click();
  assert(!/expelliarmus/i.test(await page.getByRole('article', {name:'Common Latin roots lesson',exact:true}).innerText()));
  assert((await intro.innerText()).includes('expello'));
  assert((await intro.innerText()).includes('weapons'));
  await intro.locator('[data-latin-spell-tile]').click();
  await intro.getByRole('heading',{name:'EXPELLIARMUS!',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__notes),12);
  await page.waitForTimeout(500);
  await page.screenshot({path:dir+'intro-expelliarmus-reveal.png'});
  await intro.getByRole('button',{name:'Back',exact:true}).click();
  assert.equal(await intro.getByRole('heading',{name:'EXPELLIARMUS!',exact:true}).count(),0);
  await page.locator('details>summary').first().click();
  await page.getByRole('button',{name:'☾ Dark',exact:true}).click();
  await page.locator('details>summary').first().click();
  await page.waitForTimeout(250);
  await intro.getByRole('button',{name:'Back',exact:true}).click();
  await intro.getByRole('button',{name:'Back',exact:true}).click();
  await intro.getByRole('button',{name:'Back',exact:true}).click();
  await table.waitFor();
  await page.screenshot({path:dir+'intro-slide-2-dark.png'});
  for (const width of [375,320]) {
    await page.setViewportSize({width,height:1600});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await intro.getByRole('button',{name:'Next page',exact:true}).click();
  await intro.locator('[data-latin-spell-tile]').click();
  await intro.getByRole('button',{name:'Next',exact:true}).click();
  await intro.locator('[data-latin-spell-tile]').click();
  await intro.getByRole('button',{name: 'Next',exact:true}).click();
  await page.getByRole('heading',{name:'Build the PORT family',exact:true}).waitFor();
  await page.setViewportSize({width:1280,height:720});
  await page.locator('details>summary').first().click();
  await page.getByRole('combobox', {name:/Families/}).selectOption('1');
  await page.locator('details>summary').first().click();
  await intro.getByRole('button',{name:'Next page',exact:true}).click();
  assert.equal(await table.locator('tbody tr').count(),7);
  const fullSize = await page.locator('.word-lab-workspace').evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight}));
  assert(fullSize.scroll<=fullSize.client+1,'Seven examples fit '+JSON.stringify(fullSize));
  const readingSize=await intro.locator(':scope > div').evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight}));
  assert(readingSize.scroll<=readingSize.client+1,'Seven framed examples fit '+JSON.stringify(readingSize));
  assert.deepEqual(errors,[]);
  fs.writeFileSync(dir+'intro-qa.json',JSON.stringify({passed:true,slides:6,wordSums:true,addedWords:['deport','report','porter'],hiddenAnswers:true,wandReveals:true,soundNotes:12,darkMode:true,mobileWidths:[375,320],desktopFit:['1366x768','1280x720','1024x768'],errors},null,2));
  console.log('PASS: six intro slides, word sums, hidden answers, wand reveals, sound, themes, layouts and tree navigation.');
} finally { await browser.close(); }
