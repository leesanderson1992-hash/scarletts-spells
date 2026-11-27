import fs from 'node:fs';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import {createServerClient} from '@supabase/ssr';import {chromium} from '@playwright/test';import pg from 'pg';
const outputDir=process.env.LATIN_ROOT_PROOF_DIR??'outputs/latin-root-release-20261127';
const stage=parseEnv(fs.readFileSync('.env.staging.local','utf8'));assert.equal(stage.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
const local=parseEnv(fs.readFileSync('.tmp/latin-root-browser.env','utf8'));assert(local.VERCEL_OIDC_TOKEN);
const {url:base,sha}=JSON.parse(fs.readFileSync(outputDir+'/preview-deployment.json','utf8'));
const fixture=JSON.parse(fs.readFileSync(outputDir+'/staging-fixture.json','utf8'));
const db=new pg.Client({connectionString:stage.SUPABASE_STAGING_DB_URL,ssl:{rejectUnauthorized:false}});await db.connect();
const checkpoint=async()=>(await db.query('select checkpoint_payload->\'state\' state,state_version from adle_specialist_stage_checkpoints where daily_assignment_id=$1',[fixture.assignmentId])).rows[0];
const waitSaved=async(predicate)=>{for(let i=0;i<80;i++){const row=await checkpoint();if(predicate(row?.state))return row;await new Promise(r=>setTimeout(r,250));}throw Error('Checkpoint not persisted');};
const browser=await chromium.launch({channel:'chrome',headless:true});const checks=[];
try{const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route(base+'/**',route=>route.continue({headers:{...route.request().headers(),'x-vercel-trusted-oidc-idp-token':local.VERCEL_OIDC_TOKEN}}));
const jar=[];const auth=createServerClient(stage.NEXT_PUBLIC_SUPABASE_URL,stage.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:items=>jar.push(...items)}});assert(!(await auth.auth.signInWithPassword({email:stage.STAGING_ADMIN_EMAIL,password:stage.STAGING_ADMIN_PASSWORD})).error);await context.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,secure:true,sameSite:'Lax'})));
const page=await context.newPage();const errors=[];let finishRequest=null;page.on('request',request=>{if(request.method()==='POST'&&request.headers()['next-action']&&request.postData()?.includes('\"finished\":true'))finishRequest={url:request.url(),headers:request.headers(),body:request.postData()};});page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error'&&msg.text().includes('adle-latin'))console.log({saveError:msg.text()});});
await page.goto(base+fixture.path,{waitUntil:'domcontentloaded',timeout:60000});
await page.screenshot({path:outputDir+'/staging-entry.png',fullPage:true});
const lesson=page.getByRole('article',{name:'Common Latin roots lesson'});await lesson.waitFor({timeout:45000});
if(process.env.LATIN_ROOT_INSPECT_ONLY==='1'){console.log({opened:true,sha});process.exitCode=0;}else{
let saved=await checkpoint();
if(!saved||saved.state.stage==='learn'){
 const slide=saved?.state.introSlide??0;
 if(slide<=0)await lesson.getByRole('button',{name:'Next page',exact:true}).click();
 if(slide<=1)await lesson.getByRole('button',{name:'Next page',exact:true}).click();
 if(slide<=2)await lesson.locator('[data-latin-spell-tile]').click();
 if(slide<=3)await lesson.getByRole('button',{name:'Next',exact:true}).click();
 if(slide<=4)await lesson.locator('[data-latin-spell-tile]').click();
 await lesson.getByRole('button',{name:'Next',exact:true}).click();await waitSaved(s=>s?.stage==='tree');checks.push('introduction');
}
saved=await checkpoint();
if(saved.state.stage==='tree'){
 const families=fixture.families??[{id:Object.keys(saved.state.familyProgress)[0],words:fixture.words}];
 for(let familyIndex=saved.state.familyIndex;familyIndex<families.length;familyIndex++){
 const family=families[familyIndex];
 const bank=page.getByRole('complementary',{name:'Word builder'});
 for(const [index,word] of family.words.entries()){
  const branch=lesson.locator(`[data-branch="${index+1}"]`);
  if(await branch.getAttribute('data-completed')==='true')continue;
  for(const [position,part] of word.parts.filter(p=>p.role!=='root').entries()){
   await bank.getByRole('button',{name:`Select ${part.text}`,exact:true}).first().click();await lesson.locator(`[data-slot="${index+1}:${position}"]`).click();
  }
  assert.equal(await branch.getAttribute('data-completed'),'true');
  await waitSaved(s=>s?.familyProgress?.[family.id]?.completedTargetIds?.includes(word.id));
  if(index===0){await page.reload({waitUntil:'domcontentloaded'});await lesson.waitFor();assert.equal(await lesson.locator('[data-branch="1"]').getAttribute('data-completed'),'true');checks.push(`tree_reload_family_${familyIndex+1}`);}
 }
 if(familyIndex+1<families.length){await lesson.getByRole('button',{name:'Next root family'}).click();await waitSaved(s=>s?.familyIndex===familyIndex+1);}
 else {await lesson.getByRole('button',{name:'Continue to spell class'}).click();await waitSaved(s=>s?.stage==='spell');}
 }
}
saved=await checkpoint();
if(saved.state.stage==='spell'){
 const phase=saved.state.spellDraft?.phase??'choose';
 if(phase==='choose')await lesson.getByRole('button',{name:'Carry',exact:true}).click();
 if(['choose','match'].includes(phase)){await lesson.getByRole('button',{name:'Choose root port',exact:true}).click();await lesson.getByRole('button',{name:'Drop your root here',exact:true}).click();}
 if(phase!=='cast'){await waitSaved(s=>s?.spellDraft?.phase==='craft');await page.reload({waitUntil:'domcontentloaded'});await lesson.getByRole('button',{name:'Cast my spell'}).waitFor();checks.push('spell_reload');await lesson.getByRole('button',{name:'Cast my spell'}).click();}
 await page.getByRole('dialog').getByRole('button',{name:'Continue to cover & check'}).click();await waitSaved(s=>s?.stage==='cover');
}
saved=await checkpoint();
if(saved.state.stage==='cover'){
 for(let index=saved.state.index;index<fixture.words.length;index++){
 const word=fixture.words[index];let s=(await checkpoint()).state;
 if(!Object.hasOwn(s.coverAttempts,word.id)){
  if(s.coverStates[word.id]?.state!=='write')await lesson.getByRole('button',{name:'Slide the cover',exact:false}).press('ArrowRight');
  await lesson.locator('[data-cover-state="write"]').waitFor();
  const attempt=index===0?'transprot':word.word;await lesson.getByRole('textbox').fill(attempt);
  if(index===0){await waitSaved(s=>s?.coverStates?.[word.id]?.attempt===attempt);await page.reload({waitUntil:'domcontentloaded'});await lesson.getByRole('textbox').waitFor();assert.equal(await lesson.getByRole('textbox').inputValue(),attempt);checks.push('cover_reload');}
  await lesson.getByRole('button',{name:'Check',exact:true}).click();await waitSaved(s=>Object.hasOwn(s?.coverAttempts??{},word.id));
 }
 await lesson.getByRole('button',{name:'Continue',exact:true}).click();await waitSaved(s=>index+1<fixture.words.length?s?.index===index+1:s?.stage==='dictation');
 }
}
saved=await checkpoint();
if(saved.state.stage==='dictation'){
 for(let index=saved.state.index;index<fixture.words.length;index++){
 const word=fixture.words[index];const s=(await checkpoint()).state;
 if(!Object.hasOwn(s.sentenceAttempts,word.id)){
 const attempt=index===0?word.sentence.replace(/transport/i,'transprot'):word.sentence;
 await lesson.getByRole('textbox').fill(attempt);
 if(index===0){await waitSaved(s=>s?.sentenceValues?.[word.id]===attempt);await page.reload({waitUntil:'domcontentloaded'});await lesson.getByRole('textbox').waitFor();assert.equal(await lesson.getByRole('textbox').inputValue(),attempt);checks.push('dictation_reload');}
 await lesson.getByRole('button',{name:'Check sentence',exact:true}).click();await waitSaved(s=>Object.hasOwn(s?.sentenceAttempts??{},word.id));
 }
 await lesson.getByRole('button',{name:'Continue',exact:true}).click();await waitSaved(s=>index+1<fixture.words.length?s?.index===index+1:s?.stage==='reflect');
 }
}
await lesson.getByRole('button',{name:'Finish lesson'}).waitFor();assert((await lesson.innerText()).includes('transprot'));checks.push('reflection_highlights_original_error');
await lesson.getByRole('textbox').fill('The root port means carry and helped me spell transport.');await waitSaved(s=>Boolean(s?.reflection));
await page.screenshot({path:outputDir+'/staging-reflection.png',fullPage:true});
await lesson.getByRole('button',{name:'Finish lesson'}).click();await lesson.getByRole('heading',{name:'Your word trees have grown!'}).waitFor({timeout:60000});checks.push('finish');
await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('button',{name:'Finish lesson'}).count(),0);checks.push('completed_reload');
assert(finishRequest,'Finish action captured for identical retry');const retry=await context.request.post(finishRequest.url,{headers:{...finishRequest.headers,'x-vercel-trusted-oidc-idp-token':local.VERCEL_OIDC_TOKEN},data:finishRequest.body});assert.equal(retry.status(),200);assert(!(await retry.text()).includes('\"digest\":'));checks.push('identical_finish_retry');
assert.deepEqual(errors,[]);fs.writeFileSync(outputDir+'/staging-browser-proof.json',JSON.stringify({passed:true,url:base,sha,assignmentId:fixture.assignmentId,checks,errors},null,2));console.log({browserProof:true,checks});
}
}catch(error){console.error(String(error));throw error;}finally{await browser.close();await db.end();}
