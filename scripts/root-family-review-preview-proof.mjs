import fs from 'node:fs';import assert from 'node:assert/strict';import{parseEnv}from'node:util';import{createServerClient}from'@supabase/ssr';
const dir='outputs/root-family-review-20261128';
const {url:base,sha}=JSON.parse(fs.readFileSync(dir+'/preview-deployment.json','utf8'));
const stage=parseEnv(fs.readFileSync('.env.staging.local','utf8'));
assert.equal(stage.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
const local=parseEnv(fs.readFileSync('.tmp/latin-root-browser.env','utf8'));
const jar=[];const auth=createServerClient(stage.NEXT_PUBLIC_SUPABASE_URL,stage.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:items=>jar.push(...items)}});
assert(!(await auth.auth.signInWithPassword({email:stage.STAGING_ADMIN_EMAIL,password:stage.STAGING_ADMIN_PASSWORD})).error);
const headers={cookie:jar.map(c=>c.name+'='+c.value).join('; '),'x-vercel-trusted-oidc-idp-token':local.VERCEL_OIDC_TOKEN};
const results=[];
for(const other of [false,true]){
 const path='/admin/teaching-dictionary/root-review'+(other?'/other':'');
 for(let attempt=0;attempt<2;attempt++){
  const start=Date.now(),response=await fetch(base+path,{headers,signal:AbortSignal.timeout(90000)});assert.equal(response.status,200);
  const html=await response.text();assert(html.includes(other?'Other assigned root families':'Root-family dictionary review'));assert(!html.includes('Application error:'));
  const expected=JSON.parse(fs.readFileSync(dir+`/staging-${other?'other':'focus'}.json`,'utf8'));
  for(const group of expected.groups)assert(html.includes(`id="root-${group.root}"`),group.root);
  if(other){assert(!html.includes('id="root-vis"'));assert(!html.includes('id="root-port"'));}
  else {assert(html.includes('Spelling match only'));assert(html.includes('Unverified spelling candidate'));assert(html.includes('No reviewed Latin-root family registered yet.'));}
  const word=expected.groups.flatMap(g=>g.rows).find(r=>r.senseId);
  if(word)assert(html.includes(`/admin/teaching-dictionary/${word.wordId}?sense=${encodeURIComponent(word.senseId)}`));
  results.push({other,attempt,groups:expected.groups.length,words:expected.words,ms:Date.now()-start});
 }
}
fs.writeFileSync(dir+'/preview-proof.json',JSON.stringify({passed:true,sha,base,authenticatedRead:true,reload:true,focusPartition:true,wordSenseLinks:true,noWrites:true,results},null,2));console.log({passed:true,sha,results});
