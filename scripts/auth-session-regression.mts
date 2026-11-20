import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';
import {authCheckOutcome,authFetch} from '../lib/supabase/auth-check';
import {authCheckProofFetch} from '../lib/supabase/auth-check-proof';
const saved={...process.env}, originalFetch=globalThis.fetch, originalNow=Date.now;
const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=(exp:number)=>`e30.${Buffer.from(JSON.stringify({exp,sub:user.id})).toString('base64url')}.fixture`;
const session=(expired=false)=>({access_token:token(Math.floor(Date.now()/1000)+(expired?-60:3600)),refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+(expired?-60:3600),expires_in:3600,token_type:'bearer',user});
const cookie=(expired=false)=>'sb-fixture-auth-token=base64-'+Buffer.from(JSON.stringify(session(expired))).toString('base64url');
const request=(expired=false)=>new NextRequest('https://example.test/admin/teaching-dictionary?skill=one&x=%22%3Cscript%3E',{headers:{cookie:cookie(expired)}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
try {
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-anon';
 globalThis.fetch=async(input)=>{const url=String(input);if(url.includes('/token')){await new Promise(r=>setTimeout(r,2750));return json(session());}return json(user);};
 let response=await proxy(request(true));assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
 assert(response.cookies.getAll().some(c=>c.name.startsWith('sb-fixture-auth-token')&&c.value),'Late refresh cookies must be returned');
 assert(response.headers.get('x-middleware-request-cookie')?.includes('sb-fixture-auth-token'),'Server render must receive refreshed cookies');
 // A provider outage must not become a login redirect or delete browser cookies.
 globalThis.fetch=async()=>json({message:'temporarily unavailable'},503);
 response=await proxy(request());assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);assert.equal(response.cookies.getAll().length,0);
 const body=await response.text();assert(body.includes('Try again'));assert(body.includes('&amp;'));assert(!body.includes('<script>'));
 assert.equal(response.headers.get('x-middleware-next'),null);assert.equal(response.headers.get('cache-control'),'private, no-store');
 // Retry with the same original cookie recovers without signing in again.
 globalThis.fetch=async()=>json(user);response=await proxy(request());assert.equal(response.status,200);
 // A successful refresh followed by an unavailable user check must deliver the rotated session too.
 globalThis.fetch=async(input)=>String(input).includes('/token')?json(session()):json({message:'temporary'},503);
 response=await proxy(request(true));assert.equal(response.status,503);assert(response.cookies.getAll().some(c=>c.value));
 // Confirmed revocation still requires authentication; protected content never passes.
 globalThis.fetch=async()=>json({code:'session_not_found',message:'Session revoked'},401);
 response=await proxy(request());assert.equal(new URL(response.headers.get('location')!).pathname,'/login');
 globalThis.fetch=async()=>{throw new Error('No fetch expected without a session');};response=await proxy(new NextRequest('https://example.test/admin'));assert.equal(new URL(response.headers.get('location')!).pathname,'/login');
 for(const status of [0,429,500,503])assert.equal(authCheckOutcome({data:{user:null},error:{status}}),'unavailable');
 assert.equal(authCheckOutcome({data:{user:null},error:{name:'AuthSessionMissingError'}}),'anonymous');
 // Network timeout aborts the request, rather than returning while refresh continues.
 let aborted=false;
 const hanging:typeof fetch=async(_input,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));});});
 await assert.rejects(()=>authFetch(hanging,20)('https://fixture.supabase.co/auth/v1/user'),/Aborted/);assert(aborted);
 let databaseSignal:unknown;await authFetch(async(_i,init)=>{databaseSignal=init?.signal;return json({});},20)('https://fixture.supabase.co/rest/v1/words');assert.equal(databaseSignal,undefined);
 // The staging fault switch is inert in production, even if the flag is accidentally present.
 let fetched=false;const fetcher:typeof fetch=async()=>{fetched=true;return json(user);};
 const proof={AUTH_SESSION_PROOF_ENABLED:'enabled',VERCEL_ENV:'preview',ADLE_ROUTE_ACTIVATION_ENVIRONMENT:'staging',NEXT_PUBLIC_SUPABASE_URL:'https://qkpjbajicacbrphthibk.supabase.co'};
 const faultUrl=new URL('https://example.test/admin?__auth_check_proof=unavailable');
 assert.equal((await authCheckProofFetch(faultUrl,proof,fetcher)('https://fixture.supabase.co/auth/v1/user')).status,503);assert(!fetched);
 assert.equal(authCheckProofFetch(faultUrl,{...proof,VERCEL_ENV:'production'},fetcher),fetcher);
 assert.equal(authCheckProofFetch(faultUrl,{...proof,NEXT_PUBLIC_SUPABASE_URL:'https://wwohrqtunajrbwxyssjf.supabase.co'},fetcher),fetcher);
 console.log({slowRefreshBeyondOldTimeoutPassed:true,refreshCookiesForwarded:true,outagePreservesSession:true,retryWithSameSessionPassed:true,revokedSessionBlocked:true,transportAborted:true,productionFaultInjectionBlocked:true});
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;Object.assign(process.env,saved);for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];}
