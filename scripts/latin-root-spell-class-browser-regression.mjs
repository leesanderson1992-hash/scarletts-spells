import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel:'chrome',headless:true });
const dir='docs/design/latin-roots-magic/';
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.LATIN_ROOT_PREVIEW_URL??'http://127.0.0.1:3012')+'/dev/adle/latin-roots?stage=spell');
 const spell=page.getByRole('region',{name:'Spell Class',exact:true});
 await spell.getByRole('heading',{name:'What do you want your spell to do?',exact:true}).waitFor();
 assert.equal(await spell.getByRole('button').count(),2,'Only the two root meanings are offered');
 await page.screenshot({path:dir+'spell-simple-choose-light.png'});
 await spell.getByRole('button',{name:'Carry',exact:true}).click();
 assert.equal(await spell.locator('[aria-label="Five root options"] button').count(),5);
 await spell.getByRole('button',{name:'Choose root dict',exact:true}).click();await spell.getByRole('button',{name:'Drop your root here',exact:true}).click();assert((await spell.innerText()).includes('dict means'));
 await spell.getByRole('button',{name:'Choose root port',exact:true}).press('Enter');await spell.getByRole('button',{name:'Drop your root here',exact:true}).press('Enter');
 await spell.getByRole('heading',{name:'Porto!',exact:true}).waitFor();
 assert(!/shorten|spell form/i.test(await spell.innerText()),'No shortening instructions or controls');
 await spell.getByRole('button',{name:'-um',exact:true}).click();await spell.getByRole('heading',{name:'Portum!',exact:true}).waitFor();
 assert.equal(await spell.getByRole('button',{name:'Just one root',exact:true}).isVisible(),false,'Bonus controls initially collapsed');
 await spell.locator('details>summary').click();await spell.getByRole('button',{name:'struct · Build',exact:true}).click();await spell.getByRole('heading',{name:'Portstructum!',exact:true}).waitFor();
 for(const [width,height] of [[1366,768],[1280,720],[1024,768]]){await page.setViewportSize({width,height});const size=await page.locator('.word-lab-workspace').evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight}));assert(size.scroll<=size.client+1,JSON.stringify({width,height,...size}));}
 await page.setViewportSize({width:1366,height:768});
 const card=await spell.locator('[data-spell-work-panel]').boundingBox();const workspace=await page.locator('.word-lab-workspace').boundingBox();assert(workspace.x+workspace.width-card.x-card.width<35,'Work panel aligns to right of workspace');
 const header=await spell.locator('header').boundingBox();assert(header.x>=card.x&&header.x+header.width<=card.x+card.width+1,'Title belongs to unified panel');
 await page.screenshot({path:dir+'spell-simple-craft-light.png'});
 await page.locator('details>summary').first().click();await page.getByRole('button',{name:'☾ Dark',exact:true}).click();await page.locator('details>summary').first().click();await page.waitForTimeout(250);
 assert((await page.locator('.word-lab-scene').evaluate(e=>getComputedStyle(e).backgroundImage)).includes('wizard-classroom-dark.webp'));
 assert.equal(await page.locator('.word-lab-workspace').evaluate(e=>getComputedStyle(e).backgroundImage),'none');
 await page.screenshot({path:dir+'spell-simple-craft-dark.png'});
 await spell.getByRole('button',{name:'Cast my spell',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('[data-spell-animation]').count(),0);
 await page.waitForTimeout(1300);await page.screenshot({path:dir+'spell-simple-cast-dark.png'});
 await page.getByRole('dialog').getByRole('button',{name:'Change my spell',exact:true}).click();await spell.locator('details>summary').click();await spell.getByRole('heading',{name:'Portum!',exact:true}).waitFor();
 for(const width of [375,320]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await spell.getByRole('button',{name:'Cast my spell',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Continue to cover & check',exact:true}).click();assert.equal(await page.locator('[data-spell-animation]').count(),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'spell-class-qa.json',JSON.stringify({passed:true,meaningChoicesOnly:['Carry','Build'],noShortening:true,fullSceneBackground:true,rightAlignedUnifiedPanel:true,collapsedBonus:true,fiveRoots:true,fullRootCombination:true,desktopFit:['1366x768','1280x720','1024x768'],mobileWidths:[375,320],errors},null,2));console.log('PASS: simple Carry/Build choices, full roots, optional bonus, full classroom, right-aligned unified panel, layouts and assessment boundary.');
}finally{await browser.close();}
