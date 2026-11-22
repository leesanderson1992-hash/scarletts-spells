/* Disposable unstack fixture from the saved-family staging pilot; never publishes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),pg=require('pg');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://qkpjbajicacbrphthibk.supabase.co');
process.env.ADLE_ROUTE_ACTIVATION_ENVIRONMENT='staging';
const actor=process.env.STAGING_ADMIN_USER_ID;assert(actor);
const callbacks=[];const original=Module._load;
Module._load=function(name,...args){if(name==='@/lib/admin/access')return{requireAdminUser:async()=>({id:actor})};if(name==='next/cache')return{updateTag(){},revalidatePath(){},revalidateTag(){},unstable_cache:fn=>fn,cacheLife(){},cacheTag(){}};if(name==='next/navigation')return{redirect(url){throw new Error(url)}};if(name==='next/server')return{after(fn){callbacks.push(fn)}};return original.call(this,name,...args)};
const {createServiceRoleClient}=require('../lib/supabase/service-role');
const {reviewSenseMorphology,reviewSenseFamilyMembership}=require('../app/(authenticated)/admin/teaching-dictionary/sense-morphology-actions');
const {recheckWaitingFamilyWords}=require('../lib/teaching-dictionary-manager/family-dependencies');
const {assignSavedReviewFamily}=require('../app/(authenticated)/admin/teaching-dictionary/lesson-updates/family-dependency-actions');
const {loadReviewedMeaningBundles}=require('../lib/teaching-dictionary-manager/multi-sense-export');
const read=async q=>{const r=await q;assert.ifError(r.error);return r.data};
(async()=>{const db=createServiceRoleClient(),sql=new pg.Client({connectionString:process.env.SUPABASE_STAGING_DB_URL});await sql.connect();try{
const dep=await read(db.from('teaching_dictionary_family_dependencies').select('*').eq('id','7754a46b-ded5-4be8-8059-0a32e399f43d').single());
assert.equal(dep.canonical_word_id,'45ce6cdc-8a88-4098-be39-d2ae1493222f');
const heads=(await sql.query('select * from adle_route_activation_heads order by environment_key,route_id,route_version,micro_skill_key')).rows;
const [bundle]=await loadReviewedMeaningBundles(db,[dep.canonical_word_id]);const analysis=bundle.analyses.find(a=>a.senseId===dep.sense_id);assert(analysis);
const oldBase=analysis.parts.find(p=>p.kind==='base');assert(oldBase);const nextId=oldBase.id==='restored-base-a'?'restored-base-b':'restored-base-a';
const remap=id=>id===oldBase.id?nextId:id;
const next={...analysis,parts:analysis.parts.map(p=>({...p,id:remap(p.id)})),joins:analysis.joins.map(j=>({...j,afterPartId:remap(j.afterPartId),beforePartId:remap(j.beforePartId)})),transformations:analysis.transformations.map(t=>({...t,sourcePartId:remap(t.sourcePartId)}))};
const approved=await reviewSenseMorphology({wordId:bundle.wordId,senseId:dep.sense_id,action:'approve',parts:next.parts,joins:next.joins,transformations:next.transformations,wordSum:next.wordSum});assert(approved.ok,JSON.stringify(approved));assert(approved.morphologyId);
await recheckWaitingFamilyWords(db,'staging','stack',20);
const after=await read(db.from('teaching_dictionary_family_dependencies').select('*').eq('id',dep.id).single());
assert.equal(after.component_part_id,nextId);assert.equal(after.expected_morphology_id,approved.morphologyId);assert(after.family_resolved,after.detail);
const links=await read(db.from('teaching_dictionary_current_sense_family_memberships').select('*').eq('canonical_word_id',bundle.wordId).eq('sense_id',dep.sense_id).eq('sense_morphology_id',approved.morphologyId));assert.equal(links.length,1);
// Prove a ready row becomes claimable after a word-page family approval.
await read(db.from('teaching_dictionary_family_dependencies').update({status:'ready',family_resolved:true,checked_at:new Date(Date.now()-1000).toISOString(),lease_until:null}).eq('id',dep.id));
const linked=await reviewSenseFamilyMembership({wordId:bundle.wordId,senseId:dep.sense_id,morphologyId:approved.morphologyId,familyKey:links[0].family_key,componentPartId:nextId,relationshipKind:links[0].relationship_kind,action:'approve'});assert(linked.ok,JSON.stringify(linked));
await recheckWaitingFamilyWords(db,'staging','stack',20);
const updated=await read(db.from('teaching_dictionary_family_dependencies').select('*').eq('id',dep.id).single());assert(updated.family_resolved,updated.detail);
// An explicit removal must remain unresolved until the editor chooses again.
const withdrawn=await reviewSenseFamilyMembership({wordId:bundle.wordId,senseId:dep.sense_id,morphologyId:approved.morphologyId,familyKey:links[0].family_key,componentPartId:nextId,relationshipKind:links[0].relationship_kind,action:'withdraw'});assert(withdrawn.ok);
await recheckWaitingFamilyWords(db,'staging','stack',20);
const waiting=await read(db.from('teaching_dictionary_family_dependencies').select('*').eq('id',dep.id).single());assert.equal(waiting.status,'needs_choice');assert.equal(waiting.family_resolved,false);assert.equal(waiting.confirmed_family_key,null);
const assigned=await assignSavedReviewFamily({id:dep.id,expectedUpdatedAt:waiting.updated_at,familyKey:links[0].family_key});assert(assigned.ok,JSON.stringify(assigned));
assert((await read(db.from('teaching_dictionary_family_dependencies').select('*').eq('id',dep.id).single())).family_resolved);
const stale=await assignSavedReviewFamily({id:dep.id,expectedUpdatedAt:waiting.updated_at,familyKey:links[0].family_key});assert(!stale.ok,'Stale choices must not overwrite a newer decision');
// The SQL lease survives competing workers. All lease test changes roll back.
await sql.query('begin');await sql.query("update teaching_dictionary_family_dependencies set checked_at=null,status='ready',lease_until=null where id=$1",[dep.id]);
const claim=(await sql.query('select * from claim_dictionary_family_dependencies($1,20,$2)',['staging','stack'])).rows;assert(claim.some(r=>r.id===dep.id));
assert(!(await sql.query('select * from claim_dictionary_family_dependencies($1,20,$2)',['staging','stack'])).rows.some(r=>r.id===dep.id));await sql.query('rollback');
assert.deepEqual((await sql.query('select * from adle_route_activation_heads order by environment_key,route_id,route_version,micro_skill_key')).rows,heads);
const report={word:'unstack',wordPageApprovalReconciled:true,componentIdUpdated:nextId,approvedFamilyLinked:true,readyRowsRechecked:true,leasePreserved:true,withdrawalPreserved:true,savedAssignmentWithoutWorkbook:true,staleChoiceRejected:true,lessonActivationsUnchanged:true,status:updated.status,detail:updated.detail};fs.writeFileSync('outputs/saved-family-workflow-20261122/staging-worker-proof.json',JSON.stringify(report,null,2));console.log(report);
}finally{await sql.end()}})().catch(e=>{console.error(e);process.exitCode=1});
