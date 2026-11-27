import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
const dir='docs/design/latin-roots-magic/';
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__spellTones=0;const Native=window.AudioContext;if(Native){window.AudioContext=class extends Native{createOscillator(){window.__spellTones++;return super.createOscillator();}};}});
 await page.goto((process.env.LATIN_ROOT_PREVIEW_URL??'http://127.0.0.1:3012')+'/dev/adle/latin-roots?stage=spell');
 const spell=page.getByRole('region',{name:'Spell Class',exact:true});
 await spell.getByRole('button',{name:'Carry',exact:true}).click();await spell.getByRole('button',{name:'Choose root port',exact:true}).click();await spell.getByRole('button',{name:'Drop your root here',exact:true}).click();
 const cast=spell.getByRole('button',{name:'Cast my spell',exact:true});
 assert((await cast.evaluate(e=>getComputedStyle(e).cursor)).includes('wand-cursor.svg'));
 await cast.click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('heading',{name:'Porto!',exact:true}).waitFor();
 assert(await dialog.evaluate(e=>e.matches(':modal')),'Native modal focus containment');
 assert.equal(await page.locator('[data-spell-animation]').count(),0,'No bridges or object scenes');
 assert.equal(await dialog.locator('[aria-hidden="true"] span').count(),22,'Star spray');
 assert.equal(await page.evaluate(()=>window.__spellTones),6,'Six-note magical chime scheduled from cast click');
 let bounds=await dialog.boundingBox();assert.equal(bounds.width,1366);assert.equal(bounds.height,768);
 assert(parseFloat(await dialog.getByRole('heading',{name:'Porto!',exact:true}).evaluate(e=>getComputedStyle(e).fontSize))>150,'Oversized word');
 await page.waitForTimeout(250);await page.screenshot({path:dir+'spell-comic-shout-light.png'});
 const previous=await dialog.locator('[data-spell-shout]').elementHandle();await dialog.getByRole('button',{name:'Cast again',exact:true}).click();assert.equal(await previous.evaluate(e=>e.isConnected),false);assert.equal(await page.evaluate(()=>window.__spellTones),12);
 await dialog.getByRole('button',{name:'Sound on',exact:true}).click();await dialog.getByRole('button',{name:'Cast again',exact:true}).click();assert.equal(await page.evaluate(()=>window.__spellTones),12,'Mute suppresses chime');
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await spell.locator('details>summary').click();await spell.getByRole('button',{name:'struct · Build',exact:true}).click();await spell.getByRole('button',{name:'-um',exact:true}).click();
 await page.locator('details>summary').first().click();await page.getByRole('button',{name:'☾ Dark',exact:true}).click();await page.locator('details>summary').first().click();
 await cast.click();await dialog.getByRole('heading',{name:'Portstructum!',exact:true}).waitFor();assert((await dialog.evaluate(e=>getComputedStyle(e).backgroundImage)).includes('wizard-classroom-dark.webp'));
 await page.waitForTimeout(250);await page.screenshot({path:dir+'spell-comic-shout-dark.png'});
 for(const [width,height] of [[1280,720],[1024,768],[375,812],[320,640]]){await page.setViewportSize({width,height});bounds=await dialog.boundingBox();assert(bounds.width<=width+1&&bounds.height<=height+1);assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1),'Modal fits '+width);const word=await dialog.getByRole('heading').boundingBox();assert(word.x>=0&&word.x+word.width<=width+1,'Long word stays on screen');if(width===375)await page.screenshot({path:dir+'spell-comic-shout-mobile.png'});}
 await page.emulateMedia({reducedMotion:'reduce'});await dialog.getByRole('button',{name:'Cast again',exact:true}).click();assert.equal(await dialog.evaluate(e=>e.getAnimations({subtree:true}).length),0,'Reduced motion has static burst and stars');
 await dialog.getByRole('button',{name:'Continue to cover & check',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('[data-spell-shout]').count(),0);assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'spell-animation-qa.json',JSON.stringify({passed:true,comicShout:true,fullScreen:true,noObjectScenes:true,stars:22,magicalSoundNotes:6,mute:true,replay:true,escape:true,darkClassroom:true,longNameMobileFit:true,reducedMotion:true,assessmentCleanup:true,errors},null,2));console.log('PASS: full-screen comic shout, six-note chime, mute/replay, stars, dark classroom, long names, mobile, Escape and assessment cleanup.');
}finally{await browser.close();}
